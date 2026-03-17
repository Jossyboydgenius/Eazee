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
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
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

- `POST /api/whatsapp/send`
- `GET|POST /api/whatsapp/webhook`
- `POST /api/whatsapp/dispatch-due`

Cloud API notes:

- Send endpoint supports `recipient_type: individual` payload dispatch.
- Delivery targets like groups/broadcast/channel should be mapped to recipient numbers and fanned out by worker.

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
