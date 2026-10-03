import { Prisma, type Fulfilment, type Product } from "@prisma/client";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { formatNaira } from "../utils/money.js";
import { orderReference } from "../utils/ref.js";
import { available, releaseStock, reserveStock } from "./inventory.service.js";
import { logActivity } from "./activity.service.js";

/**
 * Voice ordering, server side. The voice agent (BimpeAI) only ever proposes; every
 * price, total, stock check and state change is decided here.
 *
 *   search  ->  quote (priced, versioned, no stock held)  ->  confirm (one order,
 *   stock reserved atomically)  ->  verified payment finalizes stock (payment.service)
 *
 * Merchant scope always comes from the caller of these functions (the route pins
 * it from server config), never from model-supplied arguments.
 */

const STOPWORDS = new Set(["a", "an", "the", "i", "want", "need", "some", "do", "you", "have", "of", "in", "for", "please", "any", "me", "my"]);

const stem = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
}

function haystack(p: Product): Set<string> {
  return new Set(tokens(`${p.name} ${p.description ?? ""} ${p.color ?? ""} ${p.size ? `size ${p.size}` : ""}`));
}

export function productView(p: Product) {
  return {
    product_id: p.id,
    name: p.name,
    color: p.color,
    size: p.size,
    price_kobo: p.priceKobo,
    price: formatNaira(p.priceKobo),
    available: available(p),
    in_stock: available(p) > 0,
  };
}

/**
 * Find sellable variants matching a spoken description. Read-only. When several
 * variants match, the caller must pick one (by product_id) before a quote can be made.
 */
export async function searchProducts(merchantId: string, opts: { query: string; color?: string; size?: string }) {
  const all = await prisma.product.findMany({ where: { merchantId, active: true }, orderBy: { name: "asc" } });
  const q = tokens(opts.query);
  const eq = (a?: string | null, b?: string) => !b || (a ?? "").toLowerCase() === b.toLowerCase().trim();

  const scored = all
    .filter((p) => eq(p.color, opts.color) && eq(p.size, opts.size))
    .map((p) => {
      const h = haystack(p);
      return { p, score: q.length ? q.filter((t) => h.has(t)).length : 1 };
    })
    .filter((s) => s.score > 0);

  const best = Math.max(0, ...scored.map((s) => s.score));
  const matches = scored.filter((s) => s.score === best).map((s) => productView(s.p)).slice(0, 10);

  return {
    matches,
    ambiguous: matches.length > 1,
    hint:
      matches.length === 0
        ? "No matching product. Tell the customer it isn't available; do not offer to order it."
        : matches.length > 1
          ? "Several variants match. Ask the customer which colour/size they want before quoting."
          : matches[0].in_stock
            ? "One exact match. You may create a quote if the customer wants to buy."
            : "Out of stock. Tell the customer; do not create a quote.",
  };
}

export class VoiceOrderError extends Error {
  constructor(
    public code:
      | "not_found"
      | "out_of_stock"
      | "invalid_quantity"
      | "unsupported_fulfilment"
      | "quote_expired"
      | "version_mismatch"
      | "session_mismatch"
      | "invalid_phone",
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const MAX_QTY = 50;

function checkQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
    throw new VoiceOrderError("invalid_quantity", `Quantity must be a whole number from 1 to ${MAX_QTY}.`);
  }
}

function checkFulfilment(f: Fulfilment) {
  // Delivery pricing/logistics are out of scope; only offer what we can honour.
  if (f !== "PICKUP") throw new VoiceOrderError("unsupported_fulfilment", "Only store pickup is available for voice orders.");
}

function quoteView(q: { id: string; version: number; nameSnapshot: string; quantity: number; unitKobo: number; totalKobo: number; fulfilment: Fulfilment; expiresAt: Date }, storeName: string) {
  const fulfilment = q.fulfilment === "PICKUP" ? "store pickup" : "delivery";
  return {
    quote_id: q.id,
    version: q.version,
    item: q.nameSnapshot,
    quantity: q.quantity,
    unit_price: formatNaira(q.unitKobo),
    total_kobo: q.totalKobo,
    total: formatNaira(q.totalKobo),
    fulfilment,
    expires_at: q.expiresAt.toISOString(),
    read_back: `${q.quantity} × ${q.nameSnapshot} at ${formatNaira(q.unitKobo)} each, ${fulfilment} at ${storeName}. Total ${formatNaira(q.totalKobo)}. Shall I place this order?`,
  };
}

const variantName = (p: Product) => [p.name, p.color, p.size ? `size ${p.size}` : null].filter(Boolean).join(", ");

/** Price a single line from the server catalogue. Holds no stock. */
export async function createQuote(
  merchantId: string,
  input: { productId: string; quantity: number; fulfilment?: Fulfilment; sessionId?: string },
) {
  checkQuantity(input.quantity);
  const fulfilment = input.fulfilment ?? "PICKUP";
  checkFulfilment(fulfilment);

  const [product, merchant] = await Promise.all([
    prisma.product.findFirst({ where: { id: input.productId, merchantId, active: true } }),
    prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } }),
  ]);
  if (!product) throw new VoiceOrderError("not_found", "No such product in this store.");
  if (available(product) < input.quantity) {
    throw new VoiceOrderError("out_of_stock", `Only ${available(product)} available.`, { available: available(product) });
  }

  const quote = await prisma.quote.create({
    data: {
      merchantId,
      sessionId: input.sessionId,
      productId: product.id,
      nameSnapshot: variantName(product),
      unitKobo: product.priceKobo,
      quantity: input.quantity,
      totalKobo: product.priceKobo * input.quantity,
      fulfilment,
      expiresAt: new Date(Date.now() + env.QUOTE_TTL_MINUTES * 60_000),
    },
  });
  await logActivity({
    merchantId,
    type: "quote.created",
    message: `Voice quote: ${quote.quantity} × ${quote.nameSnapshot} = ${formatNaira(quote.totalKobo)}`,
    data: { quoteId: quote.id },
  });
  return quoteView(quote, merchant.businessName ?? "the store");
}

/** Change quantity/fulfilment on an open quote. Re-prices from the catalogue and bumps the version. */
export async function reviseQuote(
  merchantId: string,
  quoteId: string,
  input: { quantity?: number; fulfilment?: Fulfilment; sessionId?: string },
) {
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, merchantId }, include: { merchant: true } });
  if (!quote) throw new VoiceOrderError("not_found", "Quote not found.");
  if (quote.sessionId && input.sessionId !== quote.sessionId) throw new VoiceOrderError("session_mismatch", "Quote belongs to another session.");
  if (quote.status !== "OPEN" || quote.expiresAt < new Date()) throw new VoiceOrderError("quote_expired", "Quote is no longer open. Create a new one.");

  const quantity = input.quantity ?? quote.quantity;
  const fulfilment = input.fulfilment ?? quote.fulfilment;
  checkQuantity(quantity);
  checkFulfilment(fulfilment);

  const product = await prisma.product.findFirst({ where: { id: quote.productId, merchantId, active: true } });
  if (!product) throw new VoiceOrderError("not_found", "That product is no longer sold.");
  if (available(product) < quantity) {
    throw new VoiceOrderError("out_of_stock", `Only ${available(product)} available.`, { available: available(product) });
  }

  const n = await prisma.quote.updateMany({
    where: { id: quote.id, status: "OPEN", version: quote.version },
    data: {
      quantity,
      fulfilment,
      unitKobo: product.priceKobo,
      totalKobo: product.priceKobo * quantity,
      nameSnapshot: variantName(product),
      version: { increment: 1 },
      expiresAt: new Date(Date.now() + env.QUOTE_TTL_MINUTES * 60_000),
    },
  });
  if (n.count !== 1) throw new VoiceOrderError("version_mismatch", "Quote changed concurrently. Read it again.");
  const updated = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  return quoteView(updated, quote.merchant.businessName ?? "the store");
}

export function orderView(o: Prisma.OrderGetPayload<{ include: { items: true } }>) {
  return {
    reference: o.reference,
    status: o.status,
    payment_status: o.paymentStatus,
    items: o.items.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity, unit_price: formatNaira(i.priceKobo) })),
    total_kobo: o.totalKobo,
    total: formatNaira(o.totalKobo),
    fulfilment: o.fulfilment === "PICKUP" ? "store pickup" : "delivery",
    reservation_expires_at: o.reservationExpiresAt?.toISOString() ?? null,
  };
}

class AlreadyClaimed extends Error {}

/**
 * Turn a quote the customer explicitly accepted into exactly one RESERVED order.
 *
 * Idempotent: confirming the same quote again (retry, duplicate tool call, or a
 * concurrent request) returns the same order and never reserves twice. The quote
 * claim and the stock reservation commit together or not at all.
 */
export async function confirmQuote(
  merchantId: string,
  input: { quoteId: string; version: number; customerPhone: string; customerName?: string; sessionId?: string },
) {
  const existing = await prisma.order.findUnique({ where: { quoteId: input.quoteId }, include: { items: true } });
  if (existing) {
    if (existing.merchantId !== merchantId) throw new VoiceOrderError("not_found", "Quote not found.");
    return { order: existing, idempotent: true };
  }

  const quote = await prisma.quote.findFirst({ where: { id: input.quoteId, merchantId } });
  if (!quote) throw new VoiceOrderError("not_found", "Quote not found.");
  if (quote.sessionId && input.sessionId !== quote.sessionId) throw new VoiceOrderError("session_mismatch", "Quote belongs to another session.");
  if (quote.status === "CONFIRMED") {
    // A concurrent confirm committed between our two reads. The claim and the
    // order commit together, so the order exists.
    const order = await prisma.order.findUnique({ where: { quoteId: quote.id }, include: { items: true } });
    if (order) return { order, idempotent: true };
  }
  if (quote.version !== input.version) {
    throw new VoiceOrderError("version_mismatch", "The quote changed since it was read back. Read the new quote to the customer and confirm again.", {
      current_version: quote.version,
    });
  }
  if (quote.status !== "OPEN" || quote.expiresAt < new Date()) {
    throw new VoiceOrderError("quote_expired", "Quote expired. Create a fresh quote and read it back.");
  }

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        const claim = await tx.quote.updateMany({
          where: { id: quote.id, status: "OPEN", version: input.version },
          data: { status: "CONFIRMED", customerPhone: input.customerPhone, customerName: input.customerName },
        });
        if (claim.count !== 1) throw new AlreadyClaimed();

        if (!(await reserveStock(tx, quote.productId, quote.quantity))) {
          const p = await tx.product.findUnique({ where: { id: quote.productId } });
          throw new VoiceOrderError("out_of_stock", "Sold out while confirming.", { available: p ? available(p) : 0 });
        }

        const customer = await tx.customer.upsert({
          where: { merchantId_whatsappPhone: { merchantId, whatsappPhone: input.customerPhone } },
          create: { merchantId, whatsappPhone: input.customerPhone, name: input.customerName, lastOrderedAt: new Date() },
          update: { lastOrderedAt: new Date(), ...(input.customerName ? { name: input.customerName } : {}) },
        });

        const created = await tx.order.create({
          data: {
            reference: orderReference(),
            merchantId,
            customerId: customer.id,
            quoteId: quote.id,
            status: "RESERVED",
            channel: "voice",
            fulfilment: quote.fulfilment,
            totalKobo: quote.totalKobo,
            paymentStatus: "UNPAID",
            reservationExpiresAt: new Date(Date.now() + env.RESERVATION_TTL_MINUTES * 60_000),
            items: {
              create: [{ productId: quote.productId, nameSnapshot: quote.nameSnapshot, priceKobo: quote.unitKobo, quantity: quote.quantity }],
            },
          },
          include: { items: true },
        });

        await logActivity(
          {
            merchantId,
            orderId: created.id,
            type: "order.reserved",
            message: `Voice order ${created.reference}: ${quote.quantity} × ${quote.nameSnapshot}, ${formatNaira(quote.totalKobo)} - ${quote.quantity} reserved until paid`,
            data: { quoteId: quote.id, callerPhone: input.customerPhone, phoneVerified: false },
          },
          tx,
        );
        return created;
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    return { order, idempotent: false };
  } catch (err) {
    // Lost a race with an identical confirm, or the unique quoteId guard fired:
    // the other request created the order, so return it.
    const isUnique = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    if (err instanceof AlreadyClaimed || isUnique) {
      const order = await prisma.order.findUnique({ where: { quoteId: input.quoteId }, include: { items: true } });
      if (order) return { order, idempotent: true };
      throw new VoiceOrderError("quote_expired", "Quote is no longer open. Create a new one.");
    }
    throw err;
  }
}

/** Order status for a caller who knows both the reference and the phone it was placed with. */
export async function orderStatusForCaller(merchantId: string, reference: string, phone: string) {
  const order = await prisma.order.findFirst({
    where: { reference: reference.toUpperCase().trim(), merchantId },
    include: { items: true, customer: true },
  });
  // Same answer for "no such order" and "wrong phone" so references can't be probed.
  if (!order || order.customer?.whatsappPhone !== phone) return null;
  return order;
}

/**
 * Release reservations whose hold has lapsed. Each order flips RESERVED -> EXPIRED
 * with a conditional update, so a payment landing at the same moment wins or
 * loses cleanly - never both.
 */
export async function expireReservations(now = new Date()) {
  const due = await prisma.order.findMany({
    where: { status: "RESERVED", reservationExpiresAt: { lt: now } },
    include: { items: true },
    take: 50,
  });
  let expired = 0;
  for (const o of due) {
    await prisma.$transaction(async (tx) => {
      const n = await tx.order.updateMany({ where: { id: o.id, status: "RESERVED" }, data: { status: "EXPIRED" } });
      if (n.count !== 1) return;
      for (const it of o.items) if (it.productId) await releaseStock(tx, it.productId, it.quantity);
      await logActivity(
        { merchantId: o.merchantId, orderId: o.id, type: "reservation.expired", message: `${o.reference} expired unpaid - reserved stock released` },
        tx,
      );
      expired++;
    });
  }
  return expired;
}

let sweeper: NodeJS.Timeout | null = null;

export function startReservationSweeper(intervalMs = 60_000) {
  if (sweeper) return;
  sweeper = setInterval(() => {
    expireReservations().catch((err) => logger.warn({ err }, "reservation sweep failed"));
  }, intervalMs);
  sweeper.unref();
}
