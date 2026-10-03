/**
 * Business tests for voice ordering, reservations and payments. They run against
 * a real Postgres (row locks and conditional updates are the point), so they need
 * TEST_DATABASE_URL pointing at a throwaway database with the schema pushed:
 *
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @hive/api test
 *
 * Without it, the DB suites are skipped and only the pure tests run.
 */
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const DB = process.env.TEST_DATABASE_URL;
const STORE_PHONE = "2348100000010";
const TOOL_KEY = "test-voice-key";
const MERCHANT_KEY = "test-merchant-key";
const PAYSTACK_KEY = "sk_test_dummy";

// Configure before any app module reads env.
process.env.DATABASE_URL = DB ?? "postgresql://unused:unused@localhost:1/unused";
process.env.VOICE_TOOL_KEY = TOOL_KEY;
process.env.VOICE_MERCHANT_TOOL_KEY = MERCHANT_KEY;
process.env.VOICE_STORE_PHONE = STORE_PHONE;
process.env.PAYSTACK_SECRET_KEY = PAYSTACK_KEY;
process.env.NODE_ENV = "test";

const { isValidSignature } = await import("../integrations/payments/paystack.client.js");
const { normalizeCallerPhone } = await import("../utils/ref.js");

describe("pure helpers", () => {
  test("Paystack signature: HMAC-SHA512 of the raw body", () => {
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "X" } }));
    const sig = crypto.createHmac("sha512", PAYSTACK_KEY).update(body).digest("hex");
    assert.equal(isValidSignature(body, sig, PAYSTACK_KEY), true);
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    assert.equal(isValidSignature(body, flipped, PAYSTACK_KEY), false);
    assert.equal(isValidSignature(Buffer.from(body.toString() + " "), sig, PAYSTACK_KEY), false, "tampered body");
    assert.equal(isValidSignature(body, undefined, PAYSTACK_KEY), false);
    assert.equal(isValidSignature(undefined, sig, PAYSTACK_KEY), false);
  });

  test("caller phone normalisation", () => {
    assert.equal(normalizeCallerPhone("0803 123 4567"), "2348031234567");
    assert.equal(normalizeCallerPhone("+234 803 123 4567"), "2348031234567");
    assert.equal(normalizeCallerPhone("call me maybe"), null);
  });
});

describe("voice commerce (database)", { skip: DB ? false : "TEST_DATABASE_URL not set" }, () => {
  let prisma: (typeof import("../config/db.js"))["prisma"];
  let svc: typeof import("../services/voice-commerce.service.js");
  let pay: typeof import("../services/payment.service.js");
  let orders: typeof import("../services/order.service.js");
  let server: Server;
  let base: string;
  let merchantId: string;
  let black12: string;
  let red12: string;

  before(async () => {
    ({ prisma } = await import("../config/db.js"));
    svc = await import("../services/voice-commerce.service.js");
    pay = await import("../services/payment.service.js");
    orders = await import("../services/order.service.js");
    const { createApp } = await import("../app.js");
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  after(async () => {
    server?.close();
    await prisma?.$disconnect();
  });

  // Fresh issue-#2 fixture for every test: Black/12 ×3, Red/12 ×0 at ₦18,500; Gold gele ×5 at ₦7,500.
  beforeEach(async () => {
    await prisma.activity.deleteMany();
    await prisma.stockAdjustment.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.merchant.deleteMany();
    const m = await prisma.merchant.create({ data: { whatsappPhone: STORE_PHONE, businessName: "Adunni Fashion", onboarded: true } });
    merchantId = m.id;
    const mk = (color: string, size: string, stock: number) =>
      prisma.product.create({ data: { merchantId, name: "Ankara Classic Gown", color, size, priceKobo: 1_850_000, stock } });
    black12 = (await mk("Black", "12", 3)).id;
    red12 = (await mk("Red", "12", 0)).id;
    await prisma.product.create({ data: { merchantId, name: "Gele", color: "Gold", size: "standard", priceKobo: 750_000, stock: 5 } });
  });

  const product = (id: string) => prisma.product.findUniqueOrThrow({ where: { id } });
  const avail = (p: { stock: number; reserved: number }) => p.stock - p.reserved;

  const paid = (reference: string, amount: number, overrides: Partial<{ status: string; currency: string; domain: string }> = {}) => ({
    status: "success",
    reference,
    amount,
    currency: "NGN",
    domain: "test",
    paid_at: new Date().toISOString(),
    ...overrides,
  });

  /** Quote 2 black size-12 gowns and confirm, returning the order with a payment reference set. */
  async function reserveTwo() {
    const q = await svc.createQuote(merchantId, { productId: black12, quantity: 2 });
    const { order } = await svc.confirmQuote(merchantId, { quoteId: q.quote_id, version: q.version, customerPhone: "2348031234567" });
    const ref = `${order.reference}-TEST`;
    await prisma.order.update({ where: { id: order.id }, data: { paymentReference: ref, paymentStatus: "PENDING" } });
    return { order, ref };
  }

  test("ambiguous request lists variants; colour+size resolves exactly one", async () => {
    const broad = await svc.searchProducts(merchantId, { query: "ankara gown" });
    assert.equal(broad.ambiguous, true);
    assert.equal(broad.matches.length, 2);
    const exact = await svc.searchProducts(merchantId, { query: "black ankara classic gown size 12" });
    assert.equal(exact.matches.length, 1);
    assert.equal(exact.matches[0].product_id, black12);
    assert.equal(exact.matches[0].price_kobo, 1_850_000);
  });

  test("quote for 2 totals ₦37,000 (3,700,000 kobo) and holds no stock", async () => {
    const q = await svc.createQuote(merchantId, { productId: black12, quantity: 2 });
    assert.equal(q.total_kobo, 3_700_000);
    const p = await product(black12);
    assert.deepEqual([p.stock, p.reserved], [3, 0]);
    assert.equal(await prisma.order.count(), 0, "an enquiry/quote never creates an order");
  });

  test("out-of-stock and over-quantity requests change nothing", async () => {
    await assert.rejects(svc.createQuote(merchantId, { productId: red12, quantity: 1 }), { code: "out_of_stock" });
    await assert.rejects(svc.createQuote(merchantId, { productId: black12, quantity: 4 }), { code: "out_of_stock" });
    assert.equal(await prisma.quote.count(), 0);
    assert.equal(await prisma.order.count(), 0);
    const p = await product(black12);
    assert.deepEqual([p.stock, p.reserved], [3, 0]);
  });

  test("confirm reserves: on-hand 3, reserved 2, available 1", async () => {
    const { order } = await reserveTwo();
    assert.equal(order.status, "RESERVED");
    assert.equal(order.totalKobo, 3_700_000);
    const p = await product(black12);
    assert.deepEqual([p.stock, p.reserved, avail(p)], [3, 2, 1]);
  });

  test("duplicate and concurrent confirmations create one order and one reservation", async () => {
    const q = await svc.createQuote(merchantId, { productId: black12, quantity: 2 });
    const input = { quoteId: q.quote_id, version: q.version, customerPhone: "2348031234567" };
    const results = await Promise.all(Array.from({ length: 6 }, () => svc.confirmQuote(merchantId, input)));
    const again = await svc.confirmQuote(merchantId, input);
    const refs = new Set([...results, again].map((r) => r.order.reference));
    assert.equal(refs.size, 1);
    assert.equal(await prisma.order.count(), 1);
    assert.equal((await product(black12)).reserved, 2);
    assert.equal(again.idempotent, true);
  });

  test("concurrent buyers cannot oversell", async () => {
    const quotes = await Promise.all(Array.from({ length: 4 }, () => svc.createQuote(merchantId, { productId: black12, quantity: 2 })));
    const outcomes = await Promise.allSettled(
      quotes.map((q, i) => svc.confirmQuote(merchantId, { quoteId: q.quote_id, version: q.version, customerPhone: `234803000000${i}` })),
    );
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1, "3 units fit one order of 2");
    for (const o of outcomes) if (o.status === "rejected") assert.equal((o.reason as { code: string }).code, "out_of_stock");
    const p = await product(black12);
    assert.deepEqual([p.stock, p.reserved], [3, 2]);
  });

  test("confirmation is bound to the quote version that was read back", async () => {
    const q = await svc.createQuote(merchantId, { productId: black12, quantity: 1 });
    const revised = await svc.reviseQuote(merchantId, q.quote_id, { quantity: 2 });
    assert.equal(revised.version, q.version + 1);
    await assert.rejects(
      svc.confirmQuote(merchantId, { quoteId: q.quote_id, version: q.version, customerPhone: "2348031234567" }),
      { code: "version_mismatch" },
    );
    assert.equal(await prisma.order.count(), 0);
    const { order } = await svc.confirmQuote(merchantId, { quoteId: q.quote_id, version: revised.version, customerPhone: "2348031234567" });
    assert.equal(order.items[0].quantity, 2);
  });

  test("quote session binding is enforced when set", async () => {
    const q = await svc.createQuote(merchantId, { productId: black12, quantity: 1, sessionId: "call-A" });
    await assert.rejects(
      svc.confirmQuote(merchantId, { quoteId: q.quote_id, version: q.version, customerPhone: "2348031234567", sessionId: "call-B" }),
      { code: "session_mismatch" },
    );
  });

  test("verified payment finalizes once: on-hand 1, reserved 0, available 1", async () => {
    const { order, ref } = await reserveTwo();
    const results = await Promise.all(Array.from({ length: 5 }, () => pay.applyVerifiedPayment(paid(ref, 3_700_000))));
    assert.equal(results.filter((r) => r.ok && r.result === "paid").length, 1);
    assert.ok(results.every((r) => r.ok && (r.result === "paid" || r.result === "already_paid")));
    const p = await product(black12);
    assert.deepEqual([p.stock, p.reserved, avail(p)], [1, 0, 1]);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.deepEqual([o.status, o.paymentStatus], ["CONFIRMED", "PAID"]);
  });

  test("mismatched amount, currency, mode or a failed charge change nothing", async () => {
    const { order, ref } = await reserveTwo();
    for (const bad of [
      paid(ref, 100),
      paid(ref, 3_700_000, { currency: "USD" }),
      paid(ref, 3_700_000, { domain: "live" }),
      paid(ref, 3_700_000, { status: "failed" }),
      paid("UNKNOWN-REF", 3_700_000),
    ]) {
      const r = await pay.applyVerifiedPayment(bad);
      assert.equal(r.ok, false);
    }
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.deepEqual([o.status, o.paymentStatus], ["RESERVED", "PENDING"]);
    const p = await product(black12);
    assert.deepEqual([p.stock, p.reserved], [3, 2]);
  });

  test("expiry releases the hold; a late payment is flagged for review, not fulfilled", async () => {
    const { order, ref } = await reserveTwo();
    await prisma.order.update({ where: { id: order.id }, data: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await svc.expireReservations(), 1);
    assert.equal(await svc.expireReservations(), 0, "sweeping twice releases once");
    let p = await product(black12);
    assert.deepEqual([p.stock, p.reserved], [3, 0]);

    const r = await pay.applyVerifiedPayment(paid(ref, 3_700_000));
    assert.ok(r.ok && r.result === "needs_review");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.deepEqual([o.status, o.paymentStatus], ["EXPIRED", "NEEDS_REVIEW"]);
    p = await product(black12);
    assert.deepEqual([p.stock, p.reserved], [3, 0], "late payment never moves stock");
  });

  test("cancelling a reserved order releases the hold exactly once", async () => {
    const { order } = await reserveTwo();
    await Promise.all([orders.cancelOrder({ reference: order.reference, merchantId }), orders.cancelOrder({ reference: order.reference, merchantId })]);
    const p = await product(black12);
    assert.deepEqual([p.stock, p.reserved], [3, 0]);
  });

  test("WhatsApp orders can't take units held by a voice reservation", async () => {
    await reserveTwo();
    const customer = await prisma.customer.create({ data: { merchantId, whatsappPhone: "2348099999999" } });
    await assert.rejects(orders.createOrder({ merchantId, customerId: customer.id, lines: [{ product: black12, quantity: 2 }] }), /available/);
    await orders.createOrder({ merchantId, customerId: customer.id, lines: [{ product: black12, quantity: 1 }] });
    const p = await product(black12);
    assert.deepEqual([p.stock, p.reserved, avail(p)], [2, 2, 0]);
  });

  // ── HTTP tool surface ──

  const call = (path: string, init: RequestInit & { key?: string } = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.key !== undefined ? { "x-hive-tool-key": init.key } : {}) },
    });

  test("customer tools reject a missing or wrong key", async () => {
    assert.equal((await call("/voice-tools/customer/products?query=gown")).status, 401);
    assert.equal((await call("/voice-tools/customer/products?query=gown", { key: "nope" })).status, 401);
    assert.equal((await call("/voice-tools/customer/products?query=gown", { key: MERCHANT_KEY })).status, 401, "merchant key is not a customer key");
    assert.equal((await call("/voice-tools/merchant/inventory", { key: TOOL_KEY })).status, 401, "customer key can't reach merchant tools");
  });

  test("end-to-end over HTTP: search → quote → confirm → status by reference + phone", async () => {
    const search = await (await call("/voice-tools/customer/products?query=gown&color=black&size=12", { key: TOOL_KEY })).json();
    assert.equal(search.matches.length, 1);
    const quote = await (
      await call("/voice-tools/customer/quotes", { key: TOOL_KEY, method: "POST", body: JSON.stringify({ product_id: search.matches[0].product_id, quantity: "2" }) })
    ).json();
    assert.equal(quote.total_kobo, 3_700_000);
    const body = JSON.stringify({ quote_id: quote.quote_id, version: quote.version, customer_phone: "0803 123 4567", customer_name: "Tolu" });
    const [a, b] = await Promise.all([
      call("/voice-tools/customer/orders", { key: TOOL_KEY, method: "POST", body }).then((r) => r.json()),
      call("/voice-tools/customer/orders", { key: TOOL_KEY, method: "POST", body }).then((r) => r.json()),
    ]);
    assert.equal(a.order.reference, b.order.reference);
    assert.equal(a.order.status, "RESERVED");
    assert.equal(await prisma.order.count(), 1);
    // No caller email and no disclosed demo email: no checkout, and no invented address.
    assert.equal(a.payment.link_generated, false);
    assert.equal(a.payment.needs, "customer_email");

    const ref = a.order.reference;
    const mine = await (await call(`/voice-tools/customer/orders/${ref}?customer_phone=08031234567`, { key: TOOL_KEY })).json();
    assert.equal(mine.ok, true);
    const other = await (await call(`/voice-tools/customer/orders/${ref}?customer_phone=08030000000`, { key: TOOL_KEY })).json();
    assert.equal(other.ok, false, "another caller can't read this order");
  });

  test("a model-supplied product from another store is refused", async () => {
    const other = await prisma.merchant.create({ data: { whatsappPhone: "2348100000099", businessName: "Other" } });
    const foreign = await prisma.product.create({ data: { merchantId: other.id, name: "Ankara Classic Gown", priceKobo: 100, stock: 50 } });
    const res = await (
      await call("/voice-tools/customer/quotes", { key: TOOL_KEY, method: "POST", body: JSON.stringify({ product_id: foreign.id, quantity: 1 }) })
    ).json();
    assert.equal(res.code, "not_found");
  });

  test("merchant adjustment needs an explicit confirm and applies once (+10 → 11 on hand)", async () => {
    const { ref } = await reserveTwo();
    await pay.applyVerifiedPayment(paid(ref, 3_700_000)); // on-hand 1
    const proposal = await (
      await call("/voice-tools/merchant/inventory/adjustments", { key: MERCHANT_KEY, method: "POST", body: JSON.stringify({ product_id: black12, delta: 10 }) })
    ).json();
    assert.equal((await product(black12)).stock, 1, "proposal alone changes nothing");
    const confirm = () => call(`/voice-tools/merchant/inventory/adjustments/${proposal.adjustment_id}/confirm`, { key: MERCHANT_KEY, method: "POST" }).then((r) => r.json());
    const [x, y] = await Promise.all([confirm(), confirm()]);
    assert.equal([x, y].filter((r) => r.applied).length, 1);
    assert.equal((await product(black12)).stock, 11);
  });

  test("webhook with an invalid signature changes nothing", async () => {
    const { order, ref } = await reserveTwo();
    const res = await fetch(`${base}/payments/paystack/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-paystack-signature": "deadbeef" },
      body: JSON.stringify({ event: "charge.success", data: { reference: ref, amount: 3_700_000 } }),
    });
    assert.equal(res.status, 401);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.deepEqual([o.status, o.paymentStatus], ["RESERVED", "PENDING"]);
  });
});
