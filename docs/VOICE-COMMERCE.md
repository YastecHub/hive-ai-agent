# Voice commerce (BimpeAI) — issue #2

A caller asks for a product by voice. The BimpeAI agent calls Hive's tools, reads back
a server-priced quote and gets an explicit yes. Hive then creates one order and reserves
the stock. The order shows up in the console straight away, and only a payment verified
with Paystack finalizes it.

BimpeAI handles the conversation. Hive decides every price, total, stock change and order state.

## Status

| Piece | State |
|---|---|
| Hive tool API, quotes, reservations, expiry, payments, console UI | **Built and tested** locally (20 tests, real Postgres) |
| BimpeAI agent + tool registration | **Script ready** (`apps/api/scripts/setup-bimpe-agent.mjs`), **not run**: needs a BimpeAI API key |
| Voice channel (Telephony or Web Voice) | **Not connected**: dashboard-only step, needs a BimpeAI account |
| Paystack test checkout | **Built, not run live**: needs `sk_test_` key. Webhook + verify paths are unit-tested against the shared transition |
| Live spoken order | **Not done yet.** No live-test evidence exists; record it below once run |

Nothing in the console pretends otherwise: the **Voice ordering** card reads `/api/dashboard/integrations`
and shows "Not configured" for anything missing.

## Flow and where it lives

```
caller ──voice──▶ BimpeAI agent ──HTTPS + x-hive-tool-key──▶ /api/voice-tools/customer/*
                                                              │
  search_products ─▶ searchProducts()          read-only, flags ambiguous variants
  create_quote    ─▶ createQuote()             server price, version 1, no stock held
  revise_quote    ─▶ reviseQuote()             re-priced, version+1
  confirm_order   ─▶ confirmQuote()            quote claim + reserveStock() + order in one tx
                     startCheckout()           Paystack initialize (amount from the order);
                                               re-calling confirm_order retries a failed start
  get_order_status─▶ orderStatusForCaller()    needs reference AND the order's phone
Paystack ─webhook─▶ /api/payments/paystack/webhook   HMAC-SHA512 check → verify API → applyVerifiedPayment()
buyer ─redirect──▶ /api/payments/paystack/callback   verify API → applyVerifiedPayment()
every 60s ───────▶ expireReservations()        RESERVED → EXPIRED, hold released
```

| Concern | Code |
|---|---|
| Atomic stock ops (`stock - reserved >= qty` in one UPDATE) | `apps/api/src/services/inventory.service.ts` |
| Search, quotes, confirm, expiry | `apps/api/src/services/voice-commerce.service.ts` |
| Checkout + the single payment transition | `apps/api/src/services/payment.service.ts` |
| Paystack HTTP + signature | `apps/api/src/integrations/payments/paystack.client.ts` |
| Tool routes, key auth, store pinning | `apps/api/src/routes/voice-tools.routes.ts` |
| Webhook / callback | `apps/api/src/routes/payments.routes.ts` |
| Activity log | `apps/api/src/services/activity.service.ts`, `Activity` model |
| Tests | `apps/api/src/__tests__/voice-commerce.test.ts` |

### Console (existing UI, extended in place)

| Existing component | What it now shows |
|---|---|
| `OrdersTable.tsx` | **Voice** chip on voice orders; payment state under the status (awaiting / checkout opened / paid (verified) / paid after expiry), with the real checkout link while reserved so staff can share it |
| `StatusBadge.tsx`, `dashboard/derive.ts` | New `RESERVED` and `EXPIRED` statuses (badge + donut) |
| `ProductsPanel.tsx` | Variant colour/size; badge uses *available* (on-hand − reserved); "3 on hand · 2 reserved" when held |
| `VoicePanel.tsx` (new, right rail of `App.tsx`) | Truthful integration states + live activity feed |
| `hooks/useDashboard.ts` | Also polls `/activity` every 4 s |

Revenue and KPIs count only `CONFIRMED`/`FULFILLED` orders, so an unpaid reservation never shows as revenue.

## Data model changes (`prisma/schema.prisma`)

- `Product.reserved` holds units for unpaid voice orders. **Available = stock − reserved.**
- `Product.color`, `Product.size`: each sellable variant is its own row with a shared name.
  This keeps one inventory counter per SKU and leaves the WhatsApp tools working unchanged.
- `OrderStatus` gains `RESERVED` and `EXPIRED`. New `PaymentStatus`, `Fulfilment`.
- `Order.quoteId @unique` means one order per quote, enforced by the database.
- `Order.paymentReference @unique`, `checkoutUrl`, `paidAt`, `reservationExpiresAt`, `channel`.
- New `Quote`, `Activity`, `StockAdjustment` models.

Money is integer kobo throughout. Totals are always `unitKobo × quantity` computed on the server.

## Business and security rules: how each is enforced

| Rule (from the issue) | Enforcement |
|---|---|
| No orders/stock from casual enquiries | Search is read-only. A quote holds no stock. Only `confirm_order` reserves, and it needs a quote id and version |
| Confirmation bound to quote, session, version | `confirmQuote` requires the matching `version`; `session_id` must match when the quote has one; expired quotes are refused |
| Repeated/concurrent confirmation → one order, one reservation | Conditional `OPEN → CONFIRMED` claim inside the transaction + `quoteId @unique`; losers return the winner's order |
| Concurrent buyers can't oversell | `reserveStock` is a single conditional `UPDATE … WHERE stock - reserved >= qty` |
| Public tools can't change inventory or read others' orders | Customer routes have no inventory writes; status needs reference **and** the phone on the order (same reply for wrong phone and no order) |
| Don't trust model-supplied role/store/caller | Store comes from `VOICE_STORE_PHONE`; the product must belong to that store; customer and merchant tools use different keys; the caller's phone is stored as *unverified* in the activity data |
| Checkout redirect or "I paid" can't mark paid | Only `applyVerifiedPayment`, fed by Paystack's verify endpoint, changes payment state |
| Invalid signature / mismatched details change nothing | Webhook returns 401 before any DB access; amount, currency, test/live mode and reference must all match the order |
| Duplicate payment events | Conditional `RESERVED → CONFIRMED` update; replays return `already_paid` with no stock change |
| Late payment after expiry | `NEEDS_REVIEW` + activity entry; never auto-fulfilled, stock untouched |
| Merchant writes need auth + explicit confirm | Separate `VOICE_MERCHANT_TOOL_KEY`; propose → confirm, applied once; on-hand can't drop below reserved |
| Test payments labelled | Console shows "Paystack test mode - no real money"; the callback page says test mode |
| No invented checkout emails | Paystack gets the caller's email if they give one, else the explicitly configured `PAYSTACK_DEMO_EMAIL` (disclose it). With neither, no checkout is started and the agent asks for an email |
| "Link generated" ≠ "delivered" ≠ "paid" | The agent's `say` text keeps these apart. Hive does **not** auto-message callers on WhatsApp, because a phone call doesn't make a WhatsApp send permitted. The link is shown on the order in the console |
| Throttling | 240 requests/min per tool key, in memory |

WhatsApp orders now share the same rules: `createOrder` only takes *available* units, cancelling a
reserved order releases the hold, merchant stock edits can't go below reserved, and
`check_order_status` is scoped to the store/customer.

## Setup

1. **Database.** `pnpm db:push` then `pnpm db:seed` creates **Adunni Fashion** (fictional,
   merchant phone `2348100000010`): Ankara Classic Gown Black/12 ×3 and Red/12 ×0 at ₦18,500,
   Gold Gele ×5 at ₦7,500. The seed is also the demo reset. It's a CLI script that wipes and reseeds
   **all** stores, so run it only against the demo database. No reset endpoint is exposed.
2. **Env** (`apps/api/.env`, see `.env.example`): `VOICE_TOOL_KEY` (random), `VOICE_STORE_PHONE=2348100000010`,
   `PAYSTACK_SECRET_KEY=sk_test_…`, `PAYSTACK_DEMO_EMAIL=<team test inbox>` (optional), `PUBLIC_BASE_URL=<public https URL>`.
3. **Public HTTPS.** BimpeAI and Paystack can't reach localhost. Run `scripts/tunnel.ps1` / `tunnel.sh`
   (or deploy) and set `PUBLIC_BASE_URL` to that URL.
4. **Paystack dashboard (test mode)** → Settings → API Keys & Webhooks: webhook URL
   `<PUBLIC_BASE_URL>/api/payments/paystack/webhook`.
5. **BimpeAI agent:** set `BIMPEAI_API_KEY`, then
   `node --env-file=apps/api/.env apps/api/scripts/setup-bimpe-agent.mjs`.
   It creates the workflow (voice-sales prompt), the agent, a `custom_api` integration pointing at
   `<PUBLIC_BASE_URL>/api/voice-tools` with the `x-hive-tool-key` header, and the 7 tools. Save the printed agent id
   as `BIMPEAI_AGENT_ID`. Add `--merchant` (with `VOICE_MERCHANT_TOOL_KEY`) for the inventory agent.
6. **BimpeAI Console (dashboard only):** Settings → AI Model (provider + key) · Deploy → Voice →
   **Web Voice** (fastest) or **Telephony** → Team settings → Phone numbers (request an `ng` number,
   link it to the agent) · Settings → Voice (voice + greeting). Set `VOICE_PHONE_NUMBER` to show it in the console.

### Things to verify on the first live run

The BimpeAI docs don't settle these, so check them before the demo:

- **Query-string placeholders.** `search_products` and `get_order_status` put `{{param}}` in the query string.
  If BimpeAI leaves unused optional placeholders literally, the server already ignores `{{color}}`-style values.
  If it doesn't substitute query placeholders at all, move those params into the path.
- **Tool error handling.** Business errors return HTTP 200 with `ok:false` and a `code`, so the model can read them.
- **Integration auth fields.** The script uses `auth_type: "api_key"` with `header_name`/`api_key`; `test_endpoint` should succeed.
- **Caller identity.** If BimpeAI turns out to expose the caller's number to tools, use it instead of asking the caller.

## Demo script (store pickup)

1. Console: `pnpm dev:all`, open `/#dashboard`, select **Adunni Fashion**. Inventory: Black/12 shows **3 in stock**.
2. Customer: "I need two black Ankara gowns, size twelve." The agent searches, then reads back
   "2 × Ankara Classic Gown, Black, size 12 at ₦18,500.00 each, store pickup at Adunni Fashion. Total ₦37,000.00. Shall I place this order?"
   (Asking only for "an Ankara gown" makes it ask black or red first; nothing is created.)
3. "Yes." It asks for a phone number, then confirms. Console: order **Reserved · Voice · Checkout opened**
   with the real checkout link; inventory **1 left · 3 on hand · 2 reserved**; activity shows the quote and reservation.
4. Open the checkout link from the order row and pay with a Paystack test card. Webhook → order
   **Confirmed · Paid (verified)**; inventory **1 on hand, 0 reserved, 1 available**.
5. Optional merchant agent: "How many black Ankara size twelve remain?" → 1. "Add ten." → read-back → "yes" → **11 on hand**.
6. Optional: "Red, size twelve" → out of stock, nothing created.

Label the channel truthfully: say "browser voice" when using Web Voice. BimpeAI reports both Web Voice and
phone calls under the `telephony` channel, so the label alone doesn't prove a PSTN call.

Without Paystack configured, step 4 isn't possible. The order stays reserved and expires after
`RESERVATION_TTL_MINUTES`, which the console says.

## Tests

```bash
# needs a throwaway Postgres with the schema pushed
TEST_DATABASE_URL=postgresql://… pnpm --filter @hive/api test
```

Covers: ambiguous/exact search, quote totals (3,700,000 kobo), out-of-stock with no mutation, the reserve
numbers (3/2/1), 6 concurrent confirms → 1 order, 4 buyers racing for 3 units → 1 winner, version and session
binding, 5 concurrent payment applies → stock finalized once (1/0/1), mismatched amount/currency/mode/status,
expiry then late payment → `NEEDS_REVIEW`, double cancel, WhatsApp orders respecting reservations, key auth,
cross-store product ids, HTTP end-to-end with concurrent confirms and phone-scoped status, merchant
propose/confirm (+10 → 11) applied once, and invalid webhook signature.

## Live-test evidence

_None yet._ After the first real call, record: date, channel (Telephony/Web Voice), BimpeAI conversation/call id,
the order reference, and the Paystack test reference.

## Out of scope / not done

Delivery fees and logistics (voice offers pickup only), multi-line voice quotes, BimpeAI human
handoff (not verified; support requests are logged as tickets and the store follows up), an
optional `send_order_confirmation` messaging tool, generic request-fingerprinted idempotency keys
(idempotency is per quote, adjustment and payment reference instead), Bumpa sync, photo-to-product,
other voice providers. YarnGPT voice and Temlio numbers are selected in the BimpeAI dashboard if the
account has them. Not verified here.
