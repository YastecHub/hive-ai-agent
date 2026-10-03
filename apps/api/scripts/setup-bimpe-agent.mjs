/**
 * Create (or update) the BimpeAI voice agent that sells for Hive, and register
 * Hive's voice tools on it as a BimpeAI "custom API" integration.
 *
 * Talks to the BimpeAI Console API directly (same endpoints @bimpeai/sdk 0.4.x
 * wraps), so it runs on the repo's Node version without the SDK's Node 24 floor.
 *
 * Usage (from repo root):
 *   node --env-file=apps/api/.env apps/api/scripts/setup-bimpe-agent.mjs            # customer voice agent
 *   node --env-file=apps/api/.env apps/api/scripts/setup-bimpe-agent.mjs --merchant # merchant inventory agent
 *
 * Re-running with BIMPEAI_AGENT_ID (or BIMPEAI_MERCHANT_AGENT_ID) set updates that
 * agent's workflow prompt and re-registers its tools instead of creating a new one.
 *
 * Needs: BIMPEAI_API_KEY, PUBLIC_BASE_URL (public HTTPS - BimpeAI can't reach
 * localhost), VOICE_TOOL_KEY (or VOICE_MERCHANT_TOOL_KEY with --merchant).
 *
 * Not scriptable (Console dashboard only, per BimpeAI docs): connecting the voice
 * channel (Deploy → Telephony or Web Voice), phone numbers, voice/greeting, and
 * the AI model provider key. See docs/VOICE-COMMERCE.md.
 */
const MERCHANT = process.argv.includes("--merchant");
const API = (process.env.BIMPEAI_BASE_URL || "https://api.bimpe.ai").replace(/\/$/, "") + "/api/v1/console";
const KEY = process.env.BIMPEAI_API_KEY;
const PUBLIC = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const TOOL_KEY = MERCHANT ? process.env.VOICE_MERCHANT_TOOL_KEY : process.env.VOICE_TOOL_KEY;
const EXISTING_AGENT = MERCHANT ? process.env.BIMPEAI_MERCHANT_AGENT_ID : process.env.BIMPEAI_AGENT_ID;

const missing = [
  !KEY && "BIMPEAI_API_KEY",
  !TOOL_KEY && (MERCHANT ? "VOICE_MERCHANT_TOOL_KEY" : "VOICE_TOOL_KEY"),
  !PUBLIC && "PUBLIC_BASE_URL",
].filter(Boolean);
if (missing.length) {
  console.error(`Missing ${missing.join(", ")} in env.`);
  process.exit(1);
}
if (!PUBLIC.startsWith("https://") || /localhost|127\.0\.0\.1/.test(PUBLIC)) {
  console.error(`PUBLIC_BASE_URL must be a public https URL BimpeAI can reach (got ${PUBLIC}). Start a tunnel first (scripts/tunnel.*).`);
  process.exit(1);
}

async function call(method, path, body, idempotencyKey) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${json.code ?? ""} ${json.message ?? text}`.trim());
  }
  return json.data;
}

// ── Prompts ──────────────────────────────────────────────────────────────

const CUSTOMER_PROMPT = `You are Hive, an AI assistant taking orders for this store (call get_store_info if you need its name, address or hours). Start by saying you are Hive, the store's AI assistant, and ask how you can help. You are on a voice call, so speak in short, natural sentences and ask one question at a time. Never read out IDs, URLs or JSON.

Facts come only from your tools. Never guess a price, a total, or whether something is in stock.

How to sell:
1. When the caller asks for something, call search_products with what they said (pass colour and size separately when they give them). If several variants match, ask which colour and size they want. If nothing matches or it is out of stock, say so plainly and offer what is in stock.
2. Only when the caller clearly wants to buy a specific variant, call create_quote with its product_id and the quantity. Browsing or asking about price is NOT a reason to quote.
3. Read the quote back exactly as the tool's read_back says (item, quantity, store pickup, total) and ask for a clear yes.
4. If they change the quantity, call revise_quote and read the new version back.
5. Only after an explicit yes ("yes", "go ahead", "place it"), ask for the phone number to attach to the order if you don't have it, then call confirm_order with the quote_id and the version you read back. Never call confirm_order without that yes. If the result says it needs an email, ask for one and call confirm_order again with the same quote_id, version and customer_email - this does not create a second order.
6. Tell them what the tool's "say" field says. An order being reserved, a payment link being generated, and a payment being confirmed are different things - never blur them. A customer saying "I've paid" does not make an order paid.
Payment instruction: If the caller asks for bank details or how to pay, tell them clearly: "Please transfer to our OPay account: 9068913009, name Adunni Fashion. Send your receipt or payment screenshot on WhatsApp to confirm delivery."
Never ask for card numbers, PINs, passwords or OTPs.
If a tool fails, say so honestly and offer to log a request for the store team; never describe success a tool didn't return.

Order status: ask for the order reference and the phone number used, then call get_order_status. If it doesn't match, say you can't find it.
Problems or complaints: apologise, then call raise_support with a short summary.
Only store pickup is available. You cannot change stock, prices or other customers' orders.`;

const MERCHANT_PROMPT = `You are Hive, the store's inventory assistant, speaking with the store owner by voice. Keep answers short.
- For stock questions call get_inventory (optionally with a product query) and report on-hand, reserved and available units.
- To change stock: call propose_stock_adjustment with the product_id and the change (+ to add, - to remove), read back its read_back sentence, and only after the owner clearly says yes call confirm_stock_adjustment with the adjustment_id. Never confirm without that yes.`;

// ── Tools (Hive endpoints) ───────────────────────────────────────────────

const p = (name, type, description, required = true) => ({ name, type, description, required });

const CUSTOMER_TOOLS = [
  {
    name: "search_products",
    description: "Find products/variants matching what the caller asked for. Read-only. Returns matches with product_id, price, available units, and a hint.",
    http_method: "GET",
    url_template: "/customer/products?query={{query}}&color={{color}}&size={{size}}",
    url_params: [p("query", "string", "What the caller asked for, e.g. 'ankara classic gown'"), p("color", "string", "Colour if stated", false), p("size", "string", "Size if stated", false)],
  },
  {
    name: "create_quote",
    description: "Price a specific variant for the caller. Holds no stock. Only call when the caller wants to buy. Returns quote_id, version, total and a read_back sentence.",
    http_method: "POST",
    url_template: "/customer/quotes",
    body_params: [p("product_id", "string", "product_id from search_products"), p("quantity", "integer", "Number of units")],
  },
  {
    name: "revise_quote",
    description: "Change the quantity on an open quote. Returns a new version and read_back.",
    http_method: "POST",
    url_template: "/customer/quotes/{{quote_id}}/revise",
    url_params: [p("quote_id", "string", "quote_id from create_quote")],
    body_params: [p("quantity", "integer", "New number of units")],
  },
  {
    name: "confirm_order",
    description: "Place the order for a quote the caller explicitly said yes to. Reserves stock. Safe to retry.",
    http_method: "POST",
    url_template: "/customer/orders",
    body_params: [
      p("quote_id", "string", "quote_id that was read back"),
      p("version", "integer", "version of the quote that was read back"),
      p("customer_phone", "string", "Caller's phone number as they said it"),
      p("customer_name", "string", "Caller's name if given", false),
      p("customer_email", "string", "Caller's email, only if they chose to give it", false),
    ],
  },
  {
    name: "get_order_status",
    description: "Look up an order. Requires the order reference and the phone number it was placed with.",
    http_method: "GET",
    url_template: "/customer/orders/{{reference}}?customer_phone={{customer_phone}}",
    url_params: [p("reference", "string", "Order reference, e.g. HIVE-7Q2K9F"), p("customer_phone", "string", "Phone number used for the order")],
  },
  {
    name: "raise_support",
    description: "Log a complaint or request for the store team.",
    http_method: "POST",
    url_template: "/customer/support",
    body_params: [p("customer_phone", "string", "Caller's phone number"), p("message", "string", "Short summary of the issue"), p("order_reference", "string", "Related order reference", false)],
  },
  {
    name: "get_store_info",
    description: "Store name, address, opening hours and how payment works.",
    http_method: "GET",
    url_template: "/customer/store",
  },
  {
    name: "get_payment_info",
    description: "Store bank transfer details: OPay account number (9068913009), account name (Adunni Fashion), and instructions.",
    http_method: "GET",
    url_template: "/customer/payment-info",
  },
];

const MERCHANT_TOOLS = [
  {
    name: "get_inventory",
    description: "On-hand, reserved and available units per product. Optional product query.",
    http_method: "GET",
    url_template: "/merchant/inventory?query={{query}}",
    url_params: [p("query", "string", "Product to look up", false)],
  },
  {
    name: "propose_stock_adjustment",
    description: "Propose adding (+) or removing (-) units. Changes nothing until confirmed. Returns adjustment_id and read_back.",
    http_method: "POST",
    url_template: "/merchant/inventory/adjustments",
    body_params: [p("product_id", "string", "product_id from get_inventory"), p("delta", "integer", "Units to add (positive) or remove (negative)")],
  },
  {
    name: "confirm_stock_adjustment",
    description: "Apply a proposed adjustment after the owner explicitly said yes. Safe to retry.",
    http_method: "POST",
    url_template: "/merchant/inventory/adjustments/{{adjustment_id}}/confirm",
    url_params: [p("adjustment_id", "string", "adjustment_id from propose_stock_adjustment")],
    require_human_approval: false,
  },
];

// ── Run ──────────────────────────────────────────────────────────────────

const label = MERCHANT ? "Hive merchant voice" : "Hive voice commerce";
const prompt = MERCHANT ? MERCHANT_PROMPT : CUSTOMER_PROMPT;
const tools = MERCHANT ? MERCHANT_TOOLS : CUSTOMER_TOOLS;

let agent;
if (EXISTING_AGENT) {
  agent = await call("GET", `/agents/${EXISTING_AGENT}`);
  if (!agent.workflow_id) throw new Error(`Agent ${EXISTING_AGENT} has no workflow.`);
  await call("PATCH", `/workflows/${agent.workflow_id}`, { system_prompt: prompt });
  console.log(`↻ Updated workflow ${agent.workflow_id} on agent ${agent.id}`);
} else {
  const workflow = await call(
    "POST",
    "/workflows",
    { name: label, system_prompt: prompt, description: MERCHANT ? "Inventory checks and confirmed stock changes" : "Voice ordering backed by Hive's live catalogue", category: "Retail", channels: ["telephony"] },
    `hive-${MERCHANT ? "merchant" : "customer"}-workflow-v1`,
  );
  agent = await call(
    "POST",
    "/agents",
    { workflow_id: workflow.id, name: label, description: MERCHANT ? "Store owner inventory assistant" : "Takes product orders by voice for the store", persona: "friendly", language: "en", timezone: "Africa/Lagos" },
    `hive-${MERCHANT ? "merchant" : "customer"}-agent-v1`,
  );
  console.log(`✅ Created workflow ${workflow.id} and agent ${agent.id}`);
}

// Replace any previous Hive tools integration so re-runs don't duplicate tools.
const integrationName = `${label} tools`;
for (const existing of await call("GET", `/agents/${agent.id}/integrations/custom_api`)) {
  if (existing.config?.name === integrationName) {
    await call("DELETE", `/agents/${agent.id}/integrations/custom_api/${existing.id}`);
    console.log(`↻ Removed previous integration ${existing.id}`);
  }
}

const integration = await call("POST", `/agents/${agent.id}/integrations/custom_api/configure`, {
  name: integrationName,
  description: "Hive backend - authoritative prices, stock and orders",
  base_url: `${PUBLIC}/api/voice-tools`,
  auth_type: "api_key",
  auth_config: { header_name: "x-hive-tool-key", api_key: TOOL_KEY },
  test_endpoint: MERCHANT ? "/merchant/inventory" : "/customer/store",
});
console.log(`✅ Custom API integration ${integration.id} → ${PUBLIC}/api/voice-tools`);

for (const t of tools) {
  const tool = await call("POST", `/agents/${agent.id}/integrations/custom_api/${integration.id}/tools`, { timeout: 15000, category: "commerce", ...t });
  console.log(`   + ${tool.action_name ?? t.name}`);
}

try {
  const test = await call("GET", `/agents/${agent.id}/deployment/agent-test-code`);
  console.log(`\nTest code: ${test.code}  (telephony enabled: ${test.channels?.telephony?.is_enabled ?? "unknown"})`);
} catch (err) {
  console.log(`\n(Couldn't fetch test code: ${err.message})`);
}

console.log(`\nNext (dashboard only):
  1. Settings → AI Model: choose a provider/model and add its key.
  2. Deploy → Voice: enable Web Voice, or Telephony → Set up, then Team settings → Phone numbers (link a number to agent ${agent.id}).
  3. Settings → Voice: voice and greeting.
  4. Set ${MERCHANT ? "BIMPEAI_MERCHANT_AGENT_ID" : "BIMPEAI_AGENT_ID"}=${agent.id} in apps/api/.env so re-runs update this agent.`);
