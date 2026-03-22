# Eazee Frontend ⚡

This folder contains the Eazee Next.js frontend for:

- Compose (AI caption generation + media upload)
- Schedule (audience targeting + time planning)
- Dashboard (posts + payments activity)

## Current UX Behavior

- Compose includes a dedicated product name field used across dashboard views.
- Schedule account dropdown validates WhatsApp numbers and stores formatted valid numbers only.
- Dashboard payments row layout keeps product name + status on one line for tablet/desktop, with wallet address/time beneath.

---

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS + shadcn/ui + Framer Motion
- Zustand (state)
- Viem + Wagmi v2 + Thirdweb SDK

## Required Environment Variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=your_thirdweb_client_id
THIRDWEB_SECRET_KEY=your_thirdweb_secret_key
THIRDWEB_X402_MODE=mock
THIRDWEB_X402_RECIPIENT_ADDRESS=0x08225517402546f3dA111F2cd54B5C0342C86C1d
THIRDWEB_X402_PRICE=$0.01
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_CELO_CHAIN_ID=11142220
EAZEE_MESSAGING_PROVIDER=telegram
NEXT_PUBLIC_EAZEE_MESSAGING_PROVIDER=telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_PARSE_MODE=
TELEGRAM_BOT_USERNAME=eazee_dispatch_bot
TELEGRAM_WEBHOOK_SECRET=optional_secret_for_webhook_header_validation
TELEGRAM_MINI_APP_URL=https://your-domain.com
TELEGRAM_POLLING_WEBHOOK_URL=http://localhost:3000/api/telegram/webhook
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
WHATSAPP_DEADLINE_TEMPLATE_NAME=hello_world
WHATSAPP_DEADLINE_TEMPLATE_LANGUAGE=en_US
WHATSAPP_DEADLINE_TEMPLATE_BODY_PARAMS=
WHATSAPP_GROUPS_SOURCE_URL=https://your-backend.example.com/api/whatsapp/groups
WHATSAPP_GROUPS_SOURCE_TOKEN=your_optional_backend_bearer_token
WHATSAPP_GROUPS_ALLOW_MOCK=true
WHATSAPP_TEMPLATE_TEST_MODE=mock
CRON_SECRET=your_cron_secret
EAZEE_DB_FILE=.data/eazee.sqlite
TELEGRAM_BIND_TOKEN_TTL_MINUTES=10
EAZEE_WALLET_AUTH_CHALLENGE_TTL_MINUTES=5
EAZEE_WALLET_SESSION_TTL_HOURS=24
EAZEE_DASHBOARD_API_TOKEN=optional_static_dashboard_bearer_token
EAZEE_ALLOW_INSECURE_BIND_UPSERT=false
```

## Thirdweb API Keys (Fix KEY_NOT_FOUND)

1. Go to https://thirdweb.com/dashboard and sign in.
2. Create or open a project.
3. Copy the **Client ID** and set it as `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`.
4. Copy the **Secret Key** and set it as `THIRDWEB_SECRET_KEY` (server-only).
5. Restart dev server after updating `.env.local`.

`KEY_NOT_FOUND` usually means `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` is missing or still set to a placeholder like `your_thirdweb_client_id`.

### Social Login + Celo

Yes. Thirdweb social/in-app wallet login works with EVM chains, including Celo (and Celo Sepolia), as long as your `ConnectButton` is configured with the Celo chain and a valid Thirdweb client ID.

### Telegram Mini App Wallet Login

- Telegram in-app webviews are more reliable with in-app wallet `email` OTP than injected wallets.
- The wallet button now auto-detects Telegram webview and uses in-app wallet auth in `redirect` mode.
- In Telegram Mini App context, external wallets like MetaMask/Coinbase are hidden to avoid failed connect attempts.
- On desktop/mobile browsers outside Telegram, Google/Apple/email + external wallets remain available.
- Recommended UX: keep Telegram Mini App on email OTP for sign-in, then use the existing Telegram binding flow to link chat identity to the same wallet account.

### x402 Payments (server-side)

An x402-protected endpoint is available at `GET /api/premium-content`.

- Uses `THIRDWEB_SECRET_KEY` on the server only.
- Uses `THIRDWEB_X402_RECIPIENT_ADDRESS` as `payTo` and facilitator wallet.
- Reads payment header from `PAYMENT-SIGNATURE` or `X-PAYMENT`.
- If `THIRDWEB_SECRET_KEY` is missing in development, route falls back to mock mode when `THIRDWEB_X402_MODE=mock`.

## WhatsApp Backend Scaffold

Scaffolded API routes:

- `POST /api/telegram/send`
- `GET|POST /api/telegram/webhook`
- `POST /api/whatsapp/send`
- `GET|POST /api/whatsapp/webhook`
- `POST /api/whatsapp/dispatch-due`
- `GET /api/whatsapp/import-groups`

Queue/webhook persistence notes:

- Queue jobs, receipts, webhook ingests, Telegram bindings, bind tokens, and wallet auth sessions are persisted to SQLite.
- Default DB path is `.data/eazee.sqlite`.
- Override DB path with `EAZEE_DB_FILE`.

### Telegram Wallet Binding + Dashboard Auth (Phase 2)

The bind route now supports wallet-signature verification and short-lived wallet sessions.

1. Request challenge:

```bash
curl -X POST http://localhost:3000/api/telegram/bind \
  -H "Content-Type: application/json" \
  -d '{"action":"challenge","walletAddress":"0xYourWallet","chatId":"123456789"}'
```

2. Sign returned `challenge.message` with the connected wallet.

3. Request Telegram bind token with signature:

```bash
curl -X POST http://localhost:3000/api/telegram/bind \
  -H "Content-Type: application/json" \
  -d '{"action":"request","chatId":"123456789","walletAddress":"0xYourWallet","nonce":"<nonce>","signature":"0x..."}'
```

Response includes:

- `token` for in-chat `/link <token>` confirmation
- `walletSessionToken` for authorized dashboard/scheduling API access

4. In Telegram chat, run:

```text
/link <token>
```

5. Query dashboard history with session token:

```bash
curl "http://localhost:3000/api/dashboard/history?walletAddress=0xyourwallet" \
  -H "Authorization: Bearer <walletSessionToken>"
```

Optional admin access: set `EAZEE_DASHBOARD_API_TOKEN` and use it as bearer token for server-to-server reads.

### SQLite in Production

- SQLite here is a real relational database engine (not an in-memory mock), embedded in your app process.
- It is local to the filesystem path configured by `EAZEE_DB_FILE`.
- It deploys fine on single-instance servers/VMs with persistent disk.
- On Vercel serverless deployments, local function filesystem storage is not a durable shared database layer, so SQLite file storage is not recommended for production app state.
- It is not ideal for many concurrent writers across multiple app replicas.
- For Vercel or horizontal scale/multi-instance deployments, migrate this operational store to Postgres (for example Vercel Postgres, Neon, Supabase, or Prisma Postgres) while keeping the same API boundaries.
- Smart contracts remain for on-chain settlement/proof; queue/session/retry/receipt state should stay off-chain in DB.

#### What is currently stored in SQLite

- Telegram identity bindings (`telegram_bindings`) and one-time bind tokens (`telegram_binding_tokens`).
- Scheduled dispatch jobs (`dispatch_jobs`) including ownership metadata (`owner_chat_id`, `owner_wallet_address`) and idempotency keys.
- Per-target delivery receipts (`dispatch_receipts`) for sent/failed status tracking.
- Inbound webhook event payloads (`whatsapp_webhook_events`) for audit/debug replay.
- Wallet auth challenges and nonces (`wallet_auth_challenges`) for signature verification.
- Wallet API sessions (`wallet_auth_sessions`) for dashboard/scheduling authorization.

Cron notes:

- `vercel.json` includes a cron for `/api/whatsapp/dispatch-due` every 2 minutes.
- If `CRON_SECRET` is set, `POST /api/whatsapp/dispatch-due` requires `Authorization: Bearer <CRON_SECRET>`.
- `POST /api/whatsapp/dispatch-due` now dispatches through Telegram when `EAZEE_MESSAGING_PROVIDER=telegram`.

### Telegram Workaround Mode

- Set `EAZEE_MESSAGING_PROVIDER=telegram` and `NEXT_PUBLIC_EAZEE_MESSAGING_PROVIDER=telegram`.
- Set `TELEGRAM_BOT_TOKEN` from BotFather.
- Set `TELEGRAM_BOT_USERNAME` (example: `eazee_dispatch_bot`) for command mention handling.
- Set `TELEGRAM_MINI_APP_URL` so inline keyboard includes the Web App button.
- In Schedule, add account destinations as Telegram `chat_id` values (e.g. `-1001234567890`) or usernames (e.g. `@mychannel`).
- In Telegram mode, the Template Fallback section is hidden on Schedule.

Inbound bot capabilities in `/api/telegram/webhook`:

- Commands: `/start`, `/create`, `/dashboard`, `/help`, `/status`
- Inline keyboard navigation + callback query handling
- Per-chat session tracking persisted in `.data/telegram-webhook-state.json`
- Request logging and structured error responses

`/dashboard` now returns linked wallet summary data in chat (recent schedules, receipts, and payment transactions) and keeps the mini-app dashboard button for full detail.

Development polling mode:

```bash
npm run telegram:poll
```

This uses Telegram `getUpdates` and forwards updates to your local webhook route. Keep webhook mode for production.

Cloud API notes:

- Send endpoint supports `recipient_type: individual` payload dispatch.
- Delivery targets like groups/broadcast/channel should be mapped to recipient numbers and fanned out by worker.
- WhatsApp Cloud API does not directly post into group chats from this endpoint; Schedule includes a provider-aware forward action ("Open WhatsApp forward" or "Open Telegram forward") so users can forward the prepared caption to selected groups.

### Groups Import Adapter (upstream backend contract)

`GET /api/whatsapp/import-groups` expects your upstream endpoint (`WHATSAPP_GROUPS_SOURCE_URL`) to return either:

- a raw array of groups, or
- an object with one of these array keys: `groups`, `data`, or `items`.

Each group item should include at least:

- `id` (or `groupId`/`slug`/`key`)
- `name` (or `title`/`label`)

Optional fields:

- `members` (or `memberCount`/`participants`)
- `recipient` (or `recipientPhone`/`phone`) for Cloud API fan-out mapping

Example response:

```json
{
  "groups": [
    {
      "id": "vip-customers",
      "name": "VIP Customers",
      "members": 42,
      "recipient": "+2348012345678"
    },
    {
      "id": "community-updates",
      "name": "Community Updates",
      "members": 64
    }
  ]
}
```

Minimal Express adapter example:

```ts
import express from "express";

const app = express();

app.get("/api/whatsapp/groups", (req, res) => {
  const waAccount = String(req.query.waAccount || "");

  res.json({
    groups: [
      {
        id: `${waAccount || "default"}-vip`,
        name: "VIP Customers",
        members: 42,
        recipient: "+2348012345678",
      },
      {
        id: `${waAccount || "default"}-community`,
        name: "Community Updates",
        members: 64,
      },
    ],
  });
});
```

MVP behavior:

- If `WHATSAPP_GROUPS_SOURCE_URL` is missing in non-production (or `WHATSAPP_GROUPS_ALLOW_MOCK=true`), import route returns mock groups so UI stays usable.
- If template test fails due account/token readiness and `WHATSAPP_TEMPLATE_TEST_MODE=mock`, `/api/whatsapp/send` returns a mock success payload for demo continuity.

Current feature readiness:

- Compose, Schedule, Groups Import, and queued dispatch are usable in Telegram mode once bot token + chat ids are set.
- Live sends to arbitrary numbers remain restricted until Meta go-live/business approval; during test mode, use allowlisted recipients in Meta App Dashboard → WhatsApp → API Setup.

### Template Test Script (Graph API)

Run direct Graph API checks for default templates (`hello_world`, `promo_dynamic_v1`) and optional extra template names:

```bash
npm run test:wa-templates -- --to=2349034018552
npm run test:wa-templates -- --to=2349034018552 --template=eazee --template=eazeee
```

Optional overrides:

- `--language=en_US` for extra templates
- `--dry-run` to preview payloads without sending
- `--version=v22.0`, `--phone-id=<id>`, `--token=<token>`

You can customize default `promo_dynamic_v1` parameters via `WHATSAPP_PROMO_DYNAMIC_PARAMS`, e.g. `Jossy|Ankara Bundle|12%|11:59 PM`.

### Telegram Test Script

Run a direct Telegram Bot API send check:

```bash
npm run test:telegram -- --chat-id=-1001234567890 --text="Hello from Eazee"
npm run test:telegram -- --chat-id=@mychannel --dry-run
```

## Setup Guides

- Cron trigger setup: `CRON_TRIGGER_README.md`
- WhatsApp keys setup: `WHATSAPP_KEYS_GUIDE.md`
- Telegram setup guide: `TELEGRAM_BOT_GUIDE.md`
- Privacy policy page (app review): `/privacy`

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

```bash
npm run lint
npm run build
```

## Deployment (Vercel)

Configure Vercel project:

- Root Directory: `frontend`
- Install Command: `npm install`
- Build Command: `npm run build`

Add the same environment variables from `.env.local` to Vercel Project Settings.

---

For contract deployment and escrow details, see `../smart-contract/README.md`.
