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
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_CELO_CHAIN_ID=44787
```

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
