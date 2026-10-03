# Hive Deployment Guide (Vercel + NeonDB + BimpeAI)

This guide covers deploying Hive to Vercel with NeonDB and connecting your live Nigerian phone number (`+2342013507509`).

---

## 1. Setup NeonDB (1 minute)

1. Go to [neon.tech](https://neon.tech) and create a free project named `hive`.
2. Copy your PostgreSQL connection string (`DATABASE_URL`), which looks like:
   ```text
   postgresql://neondb_owner:npg_xxxx@ep-xxxx.c-xxxx.aws.neon.tech/neondb?sslmode=require
   ```
3. Run the schema push and deterministic demo seed:
   ```powershell
   $env:DATABASE_URL="postgresql://neondb_owner:npg_xxxx@ep-xxxx.c-xxxx.aws.neon.tech/neondb?sslmode=require"
   pnpm db:push
   pnpm db:seed
   ```
   *(This populates **Adunni Fashion** with the hackathon demo inventory: Ankara Classic Gowns in sizes 12 and 14, and Gele).*

---

## 2. Deploy to Vercel (2 minutes)

The repository has been configured with serverless handlers and build scripts for Vercel.

### Unified Deployment (Single Project - Recommended):
1. Go to [vercel.com/new](https://vercel.com/new) and import the **`hive-ai-agent`** repository.
2. In **Environment Variables**, add:
   - `DATABASE_URL`: Your NeonDB connection string
   - `PUBLIC_BASE_URL`: Your Vercel app URL (e.g. `https://hive-ai-agent.vercel.app`)
   - `VOICE_TOOL_KEY`: `hive_voice_secret_key_2026`
   - `VOICE_STORE_PHONE`: `2348100000010`
   - `VOICE_PHONE_NUMBER`: `+2342013507509`
   - `BIMPEAI_API_KEY`: `sk_xG0KhWNEmxmLEeEjBRIgdM70kL9i8FhJQlddXISEtFk`
   - `BIMPEAI_AGENT_ID`: `cmushainp0146ms881j00xkoh`
   - `QUOTE_TTL_MINUTES`: `15`
   - `RESERVATION_TTL_MINUTES`: `30`
   - `PAYSTACK_SECRET_KEY`: *(Optional: your test secret key `sk_test_...`)*
   - `GROQ_API_KEY`: *(Optional: your Groq API key for WhatsApp text)*
3. Click **Deploy**. Both the Vite frontend dashboard and the Express serverless API will be live on the same URL!

---

## 3. Link Your BimpeAI Phone Number & Tools (1 minute)

### Step A: Assign the Phone Number
1. In [agent.bimpe.ai](https://agent.bimpe.ai), go to **Team settings > Phone numbers**.
2. Next to your active number **`+2342013507509`**, click the **No agent** dropdown.
3. Select **Oyebo Yasir's Agent** (`cmushainp0146ms881j00xkoh`).

### Step B: Update Tool Endpoints with Your Vercel URL
Once your Vercel deployment finishes, point BimpeAI's custom tools to your live Vercel URL by running:
```powershell
$env:BIMPEAI_API_KEY="sk_xG0KhWNEmxmLEeEjBRIgdM70kL9i8FhJQlddXISEtFk"
$env:PUBLIC_BASE_URL="https://your-vercel-domain.vercel.app"
$env:VOICE_TOOL_KEY="hive_voice_secret_key_2026"
$env:BIMPEAI_AGENT_ID="cmushainp0146ms881j00xkoh"
node apps/api/scripts/setup-bimpe-agent.mjs
```

---

## 4. Live Hackathon Demo Script

1. **Call `+2342013507509`** from your phone (or test via Web Voice in BimpeAI console).
2. **Speak**: *"Hello, I want to buy two black Ankara gowns in size 12."*
3. **Agent**: Calls `search_products` and `create_quote`, then reads back:
   *"Two Ankara Classic Gown in black size 12 for store pickup at Adunni Fashion comes to thirty-seven thousand naira. Would you like me to go ahead?"*
4. **Speak**: *"Yes, go ahead."*
5. **Agent**: Calls `confirm_order`, reserves the stock in NeonDB, and sends the Paystack checkout link!
6. **Show Dashboard**: Open your Vercel URL. The order appears instantly as **RESERVED / Voice Channel** with real inventory decremented.
