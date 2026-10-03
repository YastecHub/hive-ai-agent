# BimpeAI evaluation for Hive (issue #1)

**Recommendation: Option C, extended.** Keep Hive's WhatsApp engine as it is. Stand up one
**buyer-only** BimpeAI agent that calls a small, new Hive tool API, and deploy that agent on
**telephony (voice ordering)**. The same agent can be added to Web Chat and Instagram from the
Deploy screen with no extra code. Do not migrate the engine (Option A). Option B is not a shape
BimpeAI supports.

Sources: [docs.bimpe.ai](https://docs.bimpe.ai/docs/) and the `@bimpeai/sdk` source
([BimpeAI/bimpe-sdk](https://github.com/BimpeAI/bimpe-sdk), v0.4.1, read 2026-10-03).
Nothing here was tested against a live Console account; see "Still to verify" below.

---

## What BimpeAI actually is

A **hosted agent runtime**. BimpeAI runs the LLM, holds the conversation history and owns
the channel connections. You don't self-host a runner. You configure it:

| Concept | What it holds |
|---|---|
| **Workflow** | `system_prompt`, `rules` (trigger/condition/response), `flows` (keyword-triggered step lists) |
| **Agent** | Bound to exactly one workflow (`workflow_id` is required), plus business details, persona, `escalation_email`, live status (`development`/`live`/`paused`) |
| **Channels** | WhatsApp, Instagram, Messenger, Web Chat, Web Voice, Telephony. **Connected in the dashboard only**; the API is read-only for channels |
| **Integrations** | First-party (`bumpa`, `paystack`, `stripe`, `google_sheets`, `google_calendar`), `customApi`, `mcpServer`, `pipedream`. **Writable from the SDK** |
| **Model** | Chosen per agent in Settings → AI Model: OpenAI, Gemini, Grok or Claude with your own key. **No Groq**, so Hive's Llama-on-Groq setup doesn't carry over |

## Answers to the issue's questions

### 1. Multi-channel

1. **WhatsApp provisioning:** Deploy → WhatsApp card → link a WhatsApp Business number. Dashboard
   only, no API. Testing uses a shared BimpeAI number plus a `start <code>` message
   (`agents.getTestCode`).
2. **Instagram / Web Chat:** each is a Connect card on the same agent, with no per-channel code. The
   catch is that it's *BimpeAI's* agent answering, not Hive's. One quirk: Instagram and Messenger
   appear in Deploy and `getTestCode`, but `conversations.list` only filters on
   `whatsapp | webchat | telephony`, so check how IG conversations surface before relying on the API.
3. **Voice commerce: feasible.** Telephony is a paid, usage-based add-on. Numbers are requested
   under Team settings → Phone numbers (`phoneNumbers.requests.create` supports region `ng`), then
   linked to an agent, and inbound calls route to it. Requests go through approval, so **request a
   number on day one**. While it's pending, demo with `calls.make({ is_test_call: true })`
   (outbound test call, no live minutes used) or Playground → Voice. Call transcripts come back from
   `calls.retrieve` as `conversation_logs`.

### 2. Execution model and personas

1. **Hosted by BimpeAI.** We only reach it over the Console API.
2. **Yes**, BimpeAI stores conversations and messages itself. We read them via `conversations` /
   `messages` (paged, or live over SSE).
3. **Merchant and buyer don't map well.** One agent runs one workflow, and nothing in the
   docs describes routing by caller. Hive picks the persona and tool set per message from the sender's phone
   (`apps/api/src/services/router.service.ts`), across **many stores** (lobby → `choose_store`). In
   BimpeAI that would mean an agent (and number) per persona, and roughly an agent per merchant.

### 3. Tools and integrations

1. **Hive's endpoints can be exposed via `customApi`, but they need to be built first.** The
   `/api/orders`, `/api/products` and `/api/inventory` routes from the issue don't exist. Hive's only
   REST routes are the read-only, unauthenticated `/api/dashboard/*`, and every write goes through
   agent tools in `apps/api/src/agent/tools.ts`.
2. **Auth is a static credential, with no signing and no caller identity.** `customApi` supports
   `none | bearer | basic | api_key | custom` with a fixed token. The `{{parameter}}` placeholders in
   `url_template`/`body_template` are filled from **LLM-supplied** params, and the docs mention no
   variable for the caller's phone or conversation id and no request signature. **This is the main
   risk:** Hive's tools take identity from server-side `ToolContext` (`merchantId`, `customerId`,
   `customerPhone`), never from the model. Behind BimpeAI the model would have to pass a phone number,
   so a buyer could claim to be a merchant or read someone else's orders. Merchant tools must never
   be exposed this way.
3. **Bumpa / Paystack:** `bimpeai.configure({ type: "bumpa", token })` and
   `{ type: "paystack", public_key, secret_key }` connect them directly. They act on *Bumpa's* or
   *Paystack's* data, not Hive's Postgres, so Bumpa would be a second, unsynced catalogue rather than
   "instant sync". Paystack is the more useful one: a payment step in the voice/web flow without
   Hive building it. Which actions each connector exposes is only visible in a live account.

### 4. Human-in-the-loop

1. Agent-level `escalation_email`, plus notification channels (Email / WhatsApp / Phone) in Settings
   → Agent. Conversations carry `needs_attention`, which you can filter on. Each tool has a
   `require_human_approval` flag.
2. **Yes.** Pause the AI on the thread (`setAiStatus(..., { is_ai_chat_paused: true })` or the AI
   toggle in the dashboard), then post with `role: "assistant"`. That role is rejected while the AI is live.
   This is the Console dashboard, though. A merchant replying from their own WhatsApp, as Hive does
   today with `raise_support`, would need us to relay it via the API.

---

## The three options

| | Verdict | Why |
|---|---|---|
| **A: Full migration** | ✗ Not now | Loses multi-store routing, server-side identity on tools, Groq, and the vision step for product photos. Means rebuilding all 20+ tools as authenticated REST endpoints, with identity supplied by the model. Too much work and new risk for a hackathon. |
| **B: Channel gateway** | ✗ Doesn't fit | BimpeAI has no documented inbound-message webhook that hands a message to our engine. It runs its own LLM on every message. Relaying would mean pausing AI on every conversation and SSE-streaming each one, which works against the platform. |
| **C: Voice add-on** | ✓ Do this | Hive's WhatsApp stays untouched. A buyer-only agent with a small, low-risk tool set gets voice ordering, and the same agent can go on Web Chat and Instagram for free. Best demo value for the work. |

## Plan for Option C

1. **Hive (about half a day):** add `apps/api/src/routes/agent-tools.routes.ts` under
   `/api/agent-tools`, guarded by an `x-api-key` header (`BIMPE_TOOL_KEY` in `env.ts`), **pinned
   to one demo `merchantId` from env**. Endpoints wrap existing services:
   - `GET  /products?q=` → `listProducts`
   - `GET  /orders/:reference` → order status (reference-only lookup)
   - `POST /orders` `{ phone, items[] }` → create a **pending** order, then text the buyer on WhatsApp to confirm.
     The confirmation goes to the stated number, so a spoofed phone can't complete someone else's order.
   - `POST /support` `{ phone, message, orderRef? }` → `raiseTicket` (already alerts the merchant)
2. **BimpeAI (scriptable with `@bimpeai/sdk`):** `workflows.create` (buyer prompt adapted from
   `CUSTOMER_PROMPT`, voice-friendly, no `BUTTONS:` lines) → `agents.create` →
   `integrations.customApi.configure({ base_url, auth_type: "api_key", auth_config: { header_name: "x-api-key", api_key } })`
   → `customApi.tools.add` for each endpoint above.
3. **Dashboard (manual):** Deploy → Telephony → Set up; request an `ng` number; set voice and greeting;
   optionally connect Web Chat and Instagram.
4. **Demo:** call the number, ask what's in stock, order, get the WhatsApp confirmation, then show the
   order in Hive's merchant chat and dashboard.

**Credentials needed:** BimpeAI Console account and API key (Team settings → API keys, with integration
scopes); an LLM provider key from OpenAI, Gemini, Grok or Anthropic; the telephony add-on on a paid plan;
a public HTTPS URL for the Hive API (the existing `scripts/tunnel.*` works for the demo); a new `BIMPE_TOOL_KEY`.

## Still to verify (needs a Console account)

- [ ] Whether the agent's runtime context exposes the caller's phone / `channel_user_id` to tools (undocumented). If it does, the spoofing risk mostly goes away.
- [ ] Turnaround time and cost for an `ng` telephony number, and per-minute pricing.
- [ ] Voice latency when a tool call goes through our tunnel.
- [ ] Which actions the Bumpa and Paystack connectors expose.
- [ ] How Instagram conversations appear in `conversations.list`.
- [ ] What the Integrations → **Webhooks** tab does (dashboard only, not in the SDK). If it's an outbound event webhook, revisit Option B.
