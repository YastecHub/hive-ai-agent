import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { env, features } from "../config/env.js";
import { logger } from "../config/logger.js";
import { normalizeCallerPhone, normalizePhone } from "../utils/ref.js";
import {
  VoiceOrderError,
  confirmQuote,
  createQuote,
  orderStatusForCaller,
  orderView,
  productView,
  reviseQuote,
  searchProducts,
} from "../services/voice-commerce.service.js";
import { startCheckout } from "../services/payment.service.js";
import { raiseTicket } from "../services/support.service.js";
import { available } from "../services/inventory.service.js";
import { logActivity } from "../services/activity.service.js";

/**
 * HTTP tools for the BimpeAI voice agent (registered as a BimpeAI "custom API"
 * integration). BimpeAI authenticates with a static header key; it does not tell
 * us who is calling, so:
 *
 *  - the store is pinned server-side (VOICE_STORE_PHONE), never taken from the model;
 *  - customer tools can't change inventory directly or read arbitrary orders
 *    (status needs reference + the phone the order was placed with);
 *  - the caller's phone is recorded as *unverified*.
 *
 * Business outcomes (out of stock, ambiguous, expired) return 200 with ok:false and
 * a `code`, so the agent can read them. Auth/config/validation problems use 4xx/5xx.
 */
export const voiceToolsRouter = Router();

function keyMatches(given: string | undefined, expected: string): boolean {
  if (!given || !expected) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function voiceStoreId(): Promise<string | null> {
  const phone = normalizePhone(env.VOICE_STORE_PHONE);
  if (!phone) return null;
  const m = await prisma.merchant.findUnique({ where: { whatsappPhone: phone }, select: { id: true } });
  return m?.id ?? null;
}

/**
 * Fixed-window throttle per tool key. In-memory is enough for one server; it
 * stops a looping agent or leaked key from hammering the database.
 */
function throttle(limitPerMinute: number) {
  const hits = new Map<string, { windowStart: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const id = crypto.createHash("sha256").update(req.header("x-hive-tool-key") ?? req.ip ?? "anon").digest("hex");
    const now = Date.now();
    const h = hits.get(id);
    if (!h || now - h.windowStart > 60_000) hits.set(id, { windowStart: now, count: 1 });
    else if (++h.count > limitPerMinute) return res.status(429).json({ ok: false, code: "rate_limited", error: "Too many requests; slow down." });
    next();
  };
}

voiceToolsRouter.use(throttle(240));

/** Require the given shared key and pin the voice store onto res.locals.merchantId. */
function requireKey(expected: () => string, name: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!expected()) return res.status(503).json({ ok: false, code: "not_configured", error: `${name} is not configured on this server.` });
    if (!keyMatches(req.header("x-hive-tool-key"), expected())) {
      return res.status(401).json({ ok: false, code: "unauthorized", error: "Invalid tool key." });
    }
    try {
      const merchantId = await voiceStoreId();
      if (!merchantId) {
        return res.status(503).json({ ok: false, code: "not_configured", error: "VOICE_STORE_PHONE does not match any store." });
      }
      res.locals.merchantId = merchantId;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Wrap a handler: zod errors -> 400, VoiceOrderError -> 200 ok:false, anything else -> 500. */
function tool(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await fn(req, res));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ ok: false, code: "invalid_request", error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      if (err instanceof VoiceOrderError) return res.json({ ok: false, code: err.code, error: err.message, ...err.extra });
      next(err);
    }
  };
}

// Some tool runners send numbers as strings; accept both.
const int = z.coerce.number().int();
const fulfilment = z
  .enum(["pickup", "delivery", "PICKUP", "DELIVERY"])
  .transform((v) => v.toUpperCase() as "PICKUP" | "DELIVERY")
  .optional();
const sessionId = z.string().trim().min(1).max(200).optional();

const customer = voiceToolsRouter;
customer.use("/customer", requireKey(() => env.VOICE_TOOL_KEY, "Voice ordering"));

customer.get(
  "/customer/store",
  tool(async (_req, res) => {
    const m = await prisma.merchant.findUniqueOrThrow({ where: { id: res.locals.merchantId } });
    return {
      ok: true,
      name: m.businessName,
      address: m.address,
      hours: m.businessHours,
      fulfilment_options: ["store pickup"],
      payment: features.paystack ? "Online card/transfer via a Paystack link" : "Online payment is not set up yet",
    };
  }),
);

customer.get(
  "/customer/products",
  tool(async (req, res) => {
    // Optional filters may arrive empty or as an unfilled "{{color}}" template placeholder.
    const optional = (max: number) =>
      z.preprocess((v) => (typeof v === "string" && (/^\{\{.*\}\}$/.test(v.trim()) || !v.trim()) ? undefined : v), z.string().trim().max(max).optional());
    const q = z.object({ query: z.string().trim().min(1).max(200), color: optional(50), size: optional(20) }).parse(req.query);
    return { ok: true, ...(await searchProducts(res.locals.merchantId, q)) };
  }),
);

customer.post(
  "/customer/quotes",
  tool(async (req, res) => {
    const b = z.object({ product_id: z.string().min(1), quantity: int, fulfilment, session_id: sessionId }).parse(req.body);
    const quote = await createQuote(res.locals.merchantId, { productId: b.product_id, quantity: b.quantity, fulfilment: b.fulfilment, sessionId: b.session_id });
    return { ok: true, ...quote };
  }),
);

customer.post(
  "/customer/quotes/:quoteId/revise",
  tool(async (req, res) => {
    const b = z.object({ quantity: int.optional(), fulfilment, session_id: sessionId }).parse(req.body);
    const quote = await reviseQuote(res.locals.merchantId, req.params.quoteId, { quantity: b.quantity, fulfilment: b.fulfilment, sessionId: b.session_id });
    return { ok: true, ...quote };
  }),
);

customer.post(
  "/customer/orders",
  tool(async (req, res) => {
    const b = z
      .object({
        quote_id: z.string().min(1),
        version: int,
        customer_phone: z.string().min(5).max(30),
        customer_name: z.string().trim().max(80).optional(),
        customer_email: z.string().trim().email().max(120).optional(),
        session_id: sessionId,
      })
      .parse(req.body);
    const phone = normalizeCallerPhone(b.customer_phone);
    if (!phone) throw new VoiceOrderError("invalid_phone", "That doesn't look like a phone number. Ask the customer to repeat it.");

    const { order, idempotent } = await confirmQuote(res.locals.merchantId, {
      quoteId: b.quote_id,
      version: b.version,
      customerPhone: phone,
      customerName: b.customer_name,
      sessionId: b.session_id,
    });

    // Payment link: generate it, never claim it was delivered. We don't message
    // callers automatically - a phone call doesn't make a WhatsApp send permitted.
    // Calling confirm_order again (idempotent) retries a failed checkout start.
    let payment: Record<string, unknown> = { status: order.paymentStatus, link_generated: false };
    let say = `Order ${order.reference} is reserved for ${env.RESERVATION_TTL_MINUTES} minutes and is awaiting payment. Online payment isn't set up, so the store will contact you about paying.`;
    if (order.status === "RESERVED" && features.paystack) {
      try {
        const checkout = await startCheckout(order.id, b.customer_email);
        if (checkout) {
          payment = { status: "PENDING", link_generated: true };
          say = `Order ${order.reference} is reserved for ${env.RESERVATION_TTL_MINUTES} minutes. A payment link has been generated; the store will share it with you. It only counts as paid once the payment is confirmed.`;
        } else {
          payment = { status: order.paymentStatus, link_generated: false, needs: "customer_email" };
          say = `Order ${order.reference} is reserved. To create a payment link I need an email address - would you like to give one?`;
        }
      } catch (err) {
        logger.error({ err, order: order.reference }, "Paystack checkout failed");
        payment = { status: order.paymentStatus, link_generated: false, error: "payment_provider_unavailable" };
        say = `Order ${order.reference} is reserved, but I couldn't create the payment link just now. The store can retry it; your items stay held for ${env.RESERVATION_TTL_MINUTES} minutes.`;
      }
    }

    return { ok: true, idempotent, order: orderView(order), payment, say };
  }),
);

customer.get(
  "/customer/orders/:reference",
  tool(async (req, res) => {
    const q = z.object({ customer_phone: z.string().min(5).max(30) }).parse(req.query);
    const phone = normalizeCallerPhone(q.customer_phone);
    const order = phone ? await orderStatusForCaller(res.locals.merchantId, req.params.reference, phone) : null;
    if (!order) return { ok: false, code: "not_found", error: "No order matches that reference and phone number." };
    return { ok: true, order: orderView(order) };
  }),
);

customer.post(
  "/customer/support",
  tool(async (req, res) => {
    const b = z
      .object({ customer_phone: z.string().min(5).max(30), message: z.string().trim().min(3).max(1000), order_reference: z.string().max(40).optional() })
      .parse(req.body);
    const phone = normalizeCallerPhone(b.customer_phone);
    if (!phone) throw new VoiceOrderError("invalid_phone", "That doesn't look like a phone number.");
    const ticket = await raiseTicket({ merchantId: res.locals.merchantId, phone, category: "voice", message: b.message, orderRef: b.order_reference });
    await logActivity({ merchantId: res.locals.merchantId, type: "support.raised", message: `Voice support request from ${phone}: "${b.message.slice(0, 80)}"` });
    return { ok: true, ticket_id: ticket.id, say: "I've logged this for the store team; they'll follow up with you." };
  }),
);

// ── Merchant tools (separate key, separate BimpeAI agent) ──────────────────
// Writes are two-step: propose returns a read-back, and only an explicit confirm applies it.

voiceToolsRouter.use("/merchant", requireKey(() => env.VOICE_MERCHANT_TOOL_KEY, "Merchant voice tools"));

voiceToolsRouter.get(
  "/merchant/inventory",
  tool(async (req, res) => {
    const q = z.object({ query: z.string().trim().max(200).optional() }).parse(req.query);
    const products = await prisma.product.findMany({ where: { merchantId: res.locals.merchantId, active: true }, orderBy: { name: "asc" } });
    const result = q.query ? (await searchProducts(res.locals.merchantId, { query: q.query })).matches : products.map(productView);
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      ok: true,
      products: result.map((r) => ({ ...r, on_hand: byId.get(r.product_id)?.stock ?? 0, reserved: byId.get(r.product_id)?.reserved ?? 0 })),
    };
  }),
);

voiceToolsRouter.post(
  "/merchant/inventory/adjustments",
  tool(async (req, res) => {
    const b = z.object({ product_id: z.string().min(1), delta: int.refine((d) => d !== 0 && Math.abs(d) <= 1000, "delta must be non-zero, at most 1000") }).parse(req.body);
    const product = await prisma.product.findFirst({ where: { id: b.product_id, merchantId: res.locals.merchantId } });
    if (!product) throw new VoiceOrderError("not_found", "No such product.");
    const next = product.stock + b.delta;
    if (next < product.reserved) throw new VoiceOrderError("invalid_quantity", `On-hand can't go below the ${product.reserved} reserved units.`);
    const adj = await prisma.stockAdjustment.create({ data: { merchantId: res.locals.merchantId, productId: product.id, delta: b.delta } });
    return {
      ok: true,
      adjustment_id: adj.id,
      read_back: `${b.delta > 0 ? "Add" : "Remove"} ${Math.abs(b.delta)} ${product.name}${product.color ? ` (${product.color}` : ""}${product.size ? `, size ${product.size})` : product.color ? ")" : ""}: on-hand ${product.stock} → ${next}. Confirm?`,
    };
  }),
);

voiceToolsRouter.post(
  "/merchant/inventory/adjustments/:id/confirm",
  tool(async (req, res) => {
    const merchantId = res.locals.merchantId as string;
    const result = await prisma.$transaction(async (tx) => {
      const adj = await tx.stockAdjustment.findFirst({ where: { id: req.params.id, merchantId } });
      if (!adj) throw new VoiceOrderError("not_found", "No such adjustment.");
      const claim = await tx.stockAdjustment.updateMany({ where: { id: adj.id, status: "PROPOSED" }, data: { status: "APPLIED" } });
      const product = await tx.product.findUniqueOrThrow({ where: { id: adj.productId } });
      if (claim.count !== 1) return { product, applied: false }; // already applied: idempotent
      const n = await tx.$executeRaw`
        UPDATE "Product" SET "stock" = "stock" + ${adj.delta}, "updatedAt" = now()
        WHERE "id" = ${adj.productId} AND "stock" + ${adj.delta} >= "reserved"`;
      if (n !== 1) throw new VoiceOrderError("invalid_quantity", "That would take on-hand below reserved units.");
      const updated = await tx.product.findUniqueOrThrow({ where: { id: adj.productId } });
      await logActivity(
        { merchantId, type: "inventory.adjusted", message: `Merchant voice: ${adj.delta > 0 ? "+" : ""}${adj.delta} ${updated.name} → ${updated.stock} on hand` },
        tx,
      );
      return { product: updated, applied: true };
    });
    return { ok: true, applied: result.applied, on_hand: result.product.stock, reserved: result.product.reserved, available: available(result.product) };
  }),
);
