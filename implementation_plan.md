# Eazee MVP — Implementation Plan

Eazee is a WhatsApp AI marketing agent that lets merchants upload product photos, brief an AI to generate captions, schedule posts, and accept cUSD payments via Celo blockchain escrow — all from a single web dashboard.

This plan covers everything needed to build and submit to the **Build Agents for the Real World Celo Hackathon V2** (deadline March 22nd 2026).

---

## Tech Stack

| Layer             | Technology                                            |
| ----------------- | ----------------------------------------------------- |
| Frontend          | Next.js 16 App Router, TypeScript                     |
| UI / Styling      | shadcn/ui + Tailwind CSS + Framer Motion              |
| State             | Zustand                                               |
| Web3 Client       | Viem + Wagmi v2 + Thirdweb React SDK                  |
| Payments          | Thirdweb x402 protocol (cUSD on Celo)                 |
| Smart Contracts   | Solidity + Hardhat (deployed to Celo Alfajores)       |
| AI Captions       | Gemini 2.0 Flash via Next.js API route                |
| Agent Backend     | Next.js API Routes (scheduling queue via `node-cron`) |
| Blockchain Events | Viem `watchContractEvent`                             |

---

## User Review Required

> [!IMPORTANT]
> **API Keys required before execution:**
>
> - `GEMINI_API_KEY` — for caption generation
> - `THIRDWEB_SECRET_KEY` and `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` — for x402 payments and wallet connection
> - A funded Celo Alfajores wallet private key (`DEPLOYER_PRIVATE_KEY`) for contract deployment
>
> Confirm whether real keys are ready or mock/placeholder values should be used for local demo mode.

> [!IMPORTANT]
> **Design assets**: A product design is available. Keep implementation aligned to provided Figma/screenshots/exported assets for UI parity.

> [!WARNING]
> **WhatsApp integration scope**: Actual WhatsApp posting (via WhatsApp Business API or Baileys) is out of MVP scope for the hackathon build. The scheduling tab simulates dispatch with status indicators. Real WhatsApp integration can be layered in after hackathon submission.

---

## Proposed Changes

### Project Bootstrap

#### Project root (`c:/Users/ADMIN/Projects/Eazee/`)

Current repository is split so frontend and contracts can be developed/deployed independently:

```text
Eazee/
├── frontend/
│   ├── app/
│   │   ├── compose/page.tsx
│   │   ├── schedule/page.tsx
│   │   ├── dashboard/page.tsx
│   │   └── api/
│   │       ├── generate-caption/route.ts
│   │       ├── schedule-post/route.ts
│   │       └── payments/route.ts
│   ├── components/
│   │   ├── compose/
│   │   ├── schedule/
│   │   ├── dashboard/
│   │   ├── ui/
│   │   └── whatsapp-preview/
│   ├── lib/
│   │   ├── contracts/
│   │   ├── celo.ts
│   │   ├── openai.ts
│   │   └── store.ts
│   └── public/
├── smart-contract/
│   ├── contracts/
│   │   └── EazeeEscrow.sol
│   ├── hardhat.config.ts
│   └── scripts/deploy.ts
├── README.md
└── implementation_plan.md
```

---

### Smart Contracts

#### `smart-contract/contracts/EazeeEscrow.sol`

ERC-20 escrow contract on Celo. Flow:

1. **Buyer** calls `deposit(productId, amount, token)` — locks cUSD in contract
2. **Agent/Merchant** calls `release(escrowId)` after confirming delivery
3. `refund(escrowId)` available if delivery fails within timeout

Key events: `PaymentDeposited`, `PaymentReleased`, `PaymentRefunded`  
Tokens supported: cUSD on Celo Alfajores.

#### `smart-contract/scripts/deploy.ts`

Hardhat deploy script targeting Celo Alfajores (`chainId: 44787`).

---

### Screen 1 — Compose

#### `frontend/app/compose/page.tsx`

**Step 1 — Photo Upload**

- `<PhotoUploadZone>`: Drag & drop + click-to-browse, max 6 images, image preview grid
- Uses `react-dropzone`

**Step 2 — Post Type + Brief**

- Category chips: Product, Sale, Service, Announcement, Event
- Product name input (used for dashboard post/payment identification)
- Textarea for brief (200 char limit with counter)
- Minimum brief guidance (at least 3 words)

**Step 3 — Tone Picker**

- Horizontal chip row: Friendly, Urgent, Promotional, Informative, Inspiring

**Step 4 — Celo Payment Toggle**

- `<Switch>` expands price input + `<StablecoinSelect>` (cUSD, cEUR, cREAL)

**Step 5 — Generate + Preview**

- "Write with AI" button → POST to `/api/generate-caption` with streaming response
- `<WhatsAppPreview>` bubble with photo thumbnail + streamed caption text

---

### Screen 2 — Schedule & Target

#### `frontend/app/schedule/page.tsx`

- WhatsApp account selector (numbers in Zustand, editable, validated/normalized)
- Send time: AI-suggested chips OR datetime picker
- Repeat: one-time / daily / weekly / monthly
- Delivery target: Status / Groups / Broadcast (with groups picker)
- "Schedule Post" button → saves queue entry and routes to dashboard

---

### Screen 3 — Dashboard

#### `frontend/app/dashboard/page.tsx`

**Posts Tab**

- Cards: photo thumbnail, caption snippet, scheduled time, audience tag, Celo price badge
- Tabs: Upcoming | Sent

**Payments Tab**

- Recent transactions list styled for escrow monitoring
- Row includes buyer, product details, amount, and escrow status badge

**Agent Info (Future extension)**

- Architecture diagram (Mermaid SVG)
- Team/role table

---

### AI Caption Agent

#### `frontend/app/api/generate-caption/route.ts`

```ts
// POST body: { postType, brief, tone, hasCeloPayment, price, currency }
// Streams Gemini response using OpenAI-compatible Streaming + ReadableStream
// System prompt: WhatsApp-optimized caption, emojis, CTA
// If Celo payment enabled: append cUSD payment CTA
```

---

### Celo & Web3 Layer

#### `frontend/lib/celo.ts`

```ts
// Wagmi config: Celo + Alfajores
// Chains from viem/chains
// HTTP transports by RPC URL
// Thirdweb client configured with NEXT_PUBLIC_THIRDWEB_CLIENT_ID
```

#### `frontend/lib/contracts/index.ts`

Exports contract addresses and ABIs for `EazeeEscrow` on Alfajores.

#### `frontend/components/BuyNowButton.tsx`

- Shows in WhatsApp preview when Celo payment is enabled
- Calls `deposit()` on `EazeeEscrow` via Wagmi `useWriteContract`
- Uses Thirdweb `ConnectButton`
- Handles loading/success/error states

---

## Verification Plan

### Automated Tests

No dedicated test suite yet. Manual browser + contract verification flows are the acceptance criteria.

### Manual Verification (Browser)

**Test 1: Caption Generation**

1. Run `npm run dev` in `frontend/`, open `http://localhost:3000/compose`
2. Upload 1-3 photos → select post type + write brief → choose tone
3. Toggle Celo payment ON → enter amount and select cUSD
4. Click "Write with AI" → caption streams into WhatsApp preview
5. ✅ Expected: Caption includes Buy Now CTA and payment context

**Test 2: Scheduling**

1. Navigate to `/schedule`
2. Select WhatsApp number → choose send time → set repeat
3. Choose target (and groups if needed) → click "Schedule Post"
4. ✅ Expected: Post appears in Dashboard as "Upcoming"

**Test 3: Celo Payment Flow**

1. Deploy contracts: `cd smart-contract && npm run deploy:alfajores`
2. Open `/compose` and complete post with Celo payment ON
3. Connect wallet on Alfajores
4. Click "Buy Now" and sign transaction
5. ✅ Expected: Transaction appears in Dashboard Payments as pending/confirmed by status flow

**Test 4: Contract Verification**

1. After deploy, check contract on [Alfajores Explorer](https://alfajores.celoscan.io/)
2. ✅ Expected: Contract address and events are visible; optional source verification can be completed

---

## Execution Delta Plan (March 16, 2026)

This section captures what is still missing in the current repo, what is currently blocked, and the exact execution path to finish end-to-end.

### 1) Current State Snapshot

#### Missing integration items (still planned, not fully implemented)

- `frontend/lib/celo.ts` setup and finalized chain transport wiring
- Frontend contract bindings export (`ABI + address`) for escrow reads/writes
- Buy Now onchain write component wired to `deposit()`
- Payments API route for persistence/sync with dashboard state
- WhatsApp outbound + webhook + scheduler bridge

#### Contract/deploy blockers (verified)

- `smart-contract` compile currently fails:
  - Hardhat warning: Node.js `v25.x` is unsupported
  - TypeScript error `TS5109` (`moduleResolution` must align with `module: NodeNext`)
- Contract location mismatch with planned structure:
  - Plan expects `smart-contract/contracts/EazeeEscrow.sol`
  - Current file is at `smart-contract/EazeeEscrow.sol`
- Network references are mixed legacy/new:
  - Current config targets Alfajores
  - Celo explorer/faucet flow is now primarily Celo Sepolia

### 2) Phase-by-Phase Delivery Guide

#### Phase A — Unblock smart-contract compilation

1. Use a Hardhat-supported Node LTS (recommended Node 20).
2. Add `smart-contract/tsconfig.json` with compatible compiler options:
   - `module: "NodeNext"`
   - `moduleResolution: "NodeNext"`
3. Normalize contract path (pick one):
   - Move `EazeeEscrow.sol` into `smart-contract/contracts/`, **or**
   - Keep it in root and set Hardhat `paths.sources` explicitly.
4. Re-run:

```bash
cd smart-contract
npm run compile
```

#### Phase B — Deploy and verify contract

1. Add `.env` values:
   - `DEPLOYER_PRIVATE_KEY`
   - `CELOSCAN_API_KEY` (optional but recommended for source verification)
2. Fund deployer wallet with test CELO (see faucet guide below).
3. Deploy to selected testnet (prefer Celo Sepolia if aligning with current ecosystem tooling).
4. Save deployed address into frontend env:
   - `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS`
   - `NEXT_PUBLIC_CELO_CHAIN_ID`

#### Phase C — Frontend onchain payment integration

1. Finalize `frontend/lib/celo.ts` (wagmi/viem + chain config).
2. Add `frontend/lib/contracts/index.ts` (ABI + deployed address).
3. Implement Buy Now write flow:
   - prepare `deposit(productId, amount, token)`
   - call with wallet connected
   - persist tx hash + pending status
4. Add payments sync route in `frontend/app/api/payments/route.ts`.

#### Phase D — WhatsApp automation + scheduling

1. Scheduler emits due post jobs.
2. Job worker calls outbound WhatsApp send route.
3. Outbound route returns/store `wamid`.
4. Webhook route receives delivery/read/failure status updates.
5. Dashboard reconciles post + payment status from webhook events.

---

### 3) WhatsApp Cloud API (Context7-Backed) — Feasibility + Implementation

Real automation and scheduled posting are feasible using Meta WhatsApp Cloud API + a scheduler worker.

#### Outbound send (confirmed structure)

Context7 docs show versioned Graph API call shape:

```bash
POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

Required body fields:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<E164_PHONE>",
  "type": "text",
  "text": { "body": "..." }
}
```

You can also send contextual replies using `context.message_id` when replying to a prior inbound message.

#### Webhooks (confirmed shape)

Context7 docs show webhook event payload flow:

- top-level `object`
- `entry[]`
- `changes[]`
- `value.messages` (inbound messages)
- `value.statuses` (delivery/read/fail lifecycle)

Implementation rules:

1. `GET` handler verifies `hub.mode`, `hub.verify_token`, `hub.challenge`.
2. `POST` handler parses payload and **returns HTTP 200 quickly**.
3. Process webhook business logic asynchronously (queue/job) to avoid retries/timeouts.

#### Session window + templates

- For users outside the customer service window, template messages are required.
- Keep both paths in the sender service:
  - session text path
  - template path

#### Recommended API routes

- `POST /api/whatsapp/send` — sends message via Graph API
- `GET /api/whatsapp/webhook` — verify callback
- `POST /api/whatsapp/webhook` — ingest messages/statuses

---

### 4) WhatsApp API Access Setup Guide

1. Create Meta app in Meta for Developers.
2. Add WhatsApp product to the app.
3. Connect/create a WhatsApp Business Account (WABA).
4. Get these values from Meta dashboards:
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`
5. Generate access token strategy:
   - start with temporary token for development
   - move to longer-lived/system user token for production-like automation
6. Configure webhook callback URL + verify token.
7. Subscribe webhook fields for message and status events.
8. Register/approve templates for out-of-session messaging.

Environment variables to maintain:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`

---

### 5) Faucet + Gas Guide (Deploy Readiness)

Current faucet endpoint is:

- `https://faucet.celo.org`

Observed faucet page behavior:

- Supports Celo Sepolia token requests
- Higher limits available with GitHub authentication
- Provides alternative faucet links if rate-limited

Recommended flow:

1. Open `https://faucet.celo.org`.
2. Connect/paste deployer wallet address.
3. Request CELO for gas (authenticate with GitHub for higher quota if needed).
4. Confirm CELO received in wallet explorer.
5. Re-run `npm run compile` and deploy command.
6. If faucet limits are hit:
   - use listed alternative faucet links,
   - request larger test allocation via the faucet’s advanced request form.

---

### 6) Required Keys Matrix (Consolidated)

#### Frontend

- `GEMINI_API_KEY`
- `THIRDWEB_SECRET_KEY`
- `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`
- `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_CELO_CHAIN_ID`

#### Smart-contract

- `DEPLOYER_PRIVATE_KEY`
- `CELOSCAN_API_KEY` (optional verification)

#### WhatsApp Cloud API

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`

---

### 7) Immediate Next Execution Order

1. Fix Node + TS config and pass `smart-contract` compile.
2. Normalize contract path and deploy to active target network.
3. Wire frontend contract bindings + Buy Now write flow.
4. Scaffold WhatsApp send + webhook routes.
5. Connect scheduler worker to WhatsApp send route and persist `wamid/status`.
6. Run full frontend build and smoke-test compose → schedule → dashboard flow.
