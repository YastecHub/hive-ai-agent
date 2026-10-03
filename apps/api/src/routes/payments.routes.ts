import { Router, type Request } from "express";
import { features } from "../config/env.js";
import { logger } from "../config/logger.js";
import { isValidSignature, verifyTransaction } from "../integrations/payments/paystack.client.js";
import { applyVerifiedPayment, verifyAndApply } from "../services/payment.service.js";

export const paymentsRouter = Router();

/**
 * Paystack webhook. The signature proves the event came from Paystack; we then
 * re-fetch the transaction from Paystack's verify endpoint and run the same
 * idempotent transition the callback uses. Bad signatures change nothing.
 */
paymentsRouter.post("/payments/paystack/webhook", async (req: Request & { rawBody?: Buffer }, res) => {
  if (!features.paystack) return res.status(503).json({ error: "Paystack is not configured." });
  if (!isValidSignature(req.rawBody, req.header("x-paystack-signature"))) {
    logger.warn("Paystack webhook with invalid signature - ignored");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = req.body?.event as string | undefined;
  const reference = req.body?.data?.reference as string | undefined;
  // Acknowledge non-payment events so Paystack doesn't retry them.
  if (event !== "charge.success" || !reference) return res.sendStatus(200);

  try {
    const outcome = await applyVerifiedPayment(await verifyTransaction(reference));
    logger.info({ reference, outcome }, "Paystack webhook processed");
    // Unknown/mismatched references are acknowledged: retrying won't make them valid.
    return res.sendStatus(200);
  } catch (err) {
    logger.error({ err, reference }, "Paystack webhook processing failed");
    return res.sendStatus(500); // Paystack retries; the transition is idempotent.
  }
});

/**
 * Where Paystack redirects the buyer after checkout. The redirect itself proves
 * nothing - we verify with Paystack server-side and show whatever that says.
 */
paymentsRouter.get("/payments/paystack/callback", async (req, res) => {
  const reference = String(req.query.reference ?? req.query.trxref ?? "");
  let headline = "We couldn't confirm this payment yet.";
  let detail = "If you completed payment, it will be confirmed automatically within a few minutes.";
  if (features.paystack && reference) {
    try {
      const outcome = await verifyAndApply(reference);
      if (outcome.ok && (outcome.result === "paid" || outcome.result === "already_paid")) {
        headline = `Payment confirmed for order ${outcome.orderReference}.`;
        detail = "Thank you! The store has been notified. (Paystack test mode - no real money was charged.)";
      } else if (outcome.ok && outcome.result === "needs_review") {
        headline = `Payment received for ${outcome.orderReference}, but the reservation had already lapsed.`;
        detail = "The store will contact you to re-reserve the item or refund you.";
      }
    } catch (err) {
      logger.warn({ err, reference }, "callback verification failed");
    }
  }
  res
    .type("html")
    .send(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hive payment</title>` +
        `<body style="font-family:system-ui;background:#0b0d12;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px">` +
        `<main style="max-width:420px;text-align:center"><h1 style="font-size:20px">🐝 ${escapeHtml(headline)}</h1><p style="color:#94a3b8">${escapeHtml(detail)}</p></main>`,
    );
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
