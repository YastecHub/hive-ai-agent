import { prisma } from "../config/db.js";
import { env, features } from "../config/env.js";
import { logger } from "../config/logger.js";
import { formatNaira } from "../utils/money.js";
import { paymentReference } from "../utils/ref.js";
import { initializeTransaction, verifyTransaction, type VerifiedTransaction } from "../integrations/payments/paystack.client.js";
import { finalizeReservedStock } from "./inventory.service.js";
import { logActivity } from "./activity.service.js";

/**
 * Start (or return the existing) Paystack checkout for a RESERVED order. The amount
 * and reference are server-owned; nothing comes from the caller or the model.
 */
export async function startCheckout(orderId: string, email?: string): Promise<{ checkoutUrl: string; reference: string } | null> {
  if (!features.paystack) return null;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "RESERVED") return null;
  if (order.checkoutUrl && order.paymentReference) return { checkoutUrl: order.checkoutUrl, reference: order.paymentReference };
  const checkoutEmail = email || env.PAYSTACK_DEMO_EMAIL;
  if (!checkoutEmail) return null;

  const reference = order.paymentReference ?? paymentReference(order.reference);
  // Claim the reference first so two concurrent starts can't open two checkouts.
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, paymentReference: null },
    data: { paymentReference: reference },
  });
  if (claimed.count !== 1 && !order.paymentReference) {
    const again = await prisma.order.findUnique({ where: { id: order.id } });
    return again?.checkoutUrl && again.paymentReference ? { checkoutUrl: again.checkoutUrl, reference: again.paymentReference } : null;
  }

  const init = await initializeTransaction({
    email: checkoutEmail,
    amountKobo: order.totalKobo,
    reference,
    callbackUrl: `${env.PUBLIC_BASE_URL}/api/payments/paystack/callback`,
    metadata: { orderReference: order.reference, channel: order.channel },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { checkoutUrl: init.authorization_url, paymentStatus: "PENDING" },
  });
  await logActivity({
    merchantId: order.merchantId,
    orderId: order.id,
    type: "payment.checkout_started",
    message: `Paystack ${features.paystackMode} checkout opened for ${order.reference} (${formatNaira(order.totalKobo)})`,
    data: { reference },
  });
  return { checkoutUrl: init.authorization_url, reference };
}

export type PaymentOutcome =
  | { ok: true; result: "paid" | "already_paid" | "needs_review"; orderReference: string }
  | { ok: false; reason: "unknown_reference" | "not_successful" | "mismatch" };

/**
 * The one place an order becomes paid. Both the webhook and server-side
 * verification call this with data fetched from Paystack's verify endpoint.
 *
 * - Every detail must match the server-owned order (reference, amount, currency,
 *   test/live mode), or nothing changes.
 * - RESERVED -> CONFIRMED is a conditional update, so replays and concurrent
 *   webhook+callback runs finalize stock exactly once.
 * - A payment for an order that already expired/cancelled is flagged for review,
 *   never auto-fulfilled.
 */
export async function applyVerifiedPayment(tx: VerifiedTransaction): Promise<PaymentOutcome> {
  const order = await prisma.order.findUnique({ where: { paymentReference: tx.reference }, include: { items: true } });
  if (!order) return { ok: false, reason: "unknown_reference" };
  if (tx.status !== "success") return { ok: false, reason: "not_successful" };

  if (tx.amount !== order.totalKobo || tx.currency !== "NGN" || tx.domain !== features.paystackMode) {
    logger.warn(
      { reference: tx.reference, amount: tx.amount, expected: order.totalKobo, currency: tx.currency, domain: tx.domain, mode: features.paystackMode },
      "payment details mismatch - ignored",
    );
    return { ok: false, reason: "mismatch" };
  }

  const paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date();

  const result = await prisma.$transaction(async (db) => {
    const won = await db.order.updateMany({
      where: { id: order.id, status: "RESERVED", paymentStatus: { in: ["UNPAID", "PENDING"] } },
      data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt, reservationExpiresAt: null },
    });
    if (won.count === 1) {
      for (const it of order.items) {
        if (it.productId && !(await finalizeReservedStock(db, it.productId, it.quantity))) {
          throw new Error(`Reserved stock missing for ${order.reference} / ${it.nameSnapshot}`);
        }
      }
      await logActivity(
        {
          merchantId: order.merchantId,
          orderId: order.id,
          type: "payment.verified",
          message: `${order.reference} paid ${formatNaira(order.totalKobo)} (Paystack ${tx.domain}) - stock finalized`,
          data: { reference: tx.reference },
        },
        db,
      );
      return "paid" as const;
    }

    const current = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    if (current.paymentStatus === "PAID" || current.paymentStatus === "NEEDS_REVIEW") {
      return current.paymentStatus === "PAID" ? ("already_paid" as const) : ("needs_review" as const);
    }

    // Paid after the hold lapsed (or the order was cancelled): record it, don't fulfil.
    const flagged = await db.order.updateMany({
      where: { id: order.id, paymentStatus: { in: ["UNPAID", "PENDING"] } },
      data: { paymentStatus: "NEEDS_REVIEW", paidAt },
    });
    if (flagged.count === 1) {
      await logActivity(
        {
          merchantId: order.merchantId,
          orderId: order.id,
          type: "payment.needs_review",
          message: `${order.reference} was paid after it became ${current.status.toLowerCase()} - refund or re-reserve manually`,
          data: { reference: tx.reference },
        },
        db,
      );
    }
    return "needs_review" as const;
  });

  return { ok: true, result, orderReference: order.reference };
}

/** Server-side verification path (callback redirect, manual "check payment" button). */
export async function verifyAndApply(reference: string): Promise<PaymentOutcome> {
  if (!features.paystack) return { ok: false, reason: "unknown_reference" };
  const tx = await verifyTransaction(reference);
  return applyVerifiedPayment(tx);
}
