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
WHATSAPP_QUEUE_STATE_FILE=.data/whatsapp-queue-state.json
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

- Queue jobs + webhook ingests are persisted to `.data/whatsapp-queue-state.json` by default.
- Override storage location with `WHATSAPP_QUEUE_STATE_FILE`.

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
