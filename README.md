# Eazee ⚡

**Eazee** is a WhatsApp-first AI commerce agent built for the **Build Agents for the Real World Celo V2 Hackathon**.

It empowers merchants to effortlessly create sales-ready posts, schedule automated distributions, and seamlessly accept **cUSD stablecoin payments** via an onchain escrow smart contract structure on the Celo network.

---

## 🚀 Features

- **AI-Powered Captions**: Upload product photos, provide a brief, and let AI generate highly converting, WhatsApp-optimized captions.
- **Product Metadata Flow**: Capture a product name in Compose and carry it into Dashboard cards and payment activity rows.
- **Automated Scheduling**: Select delivery targets (Status, Groups, Broadcasts) and schedule posts using AI-suggested peak engagement hours.
- **Validated WhatsApp Accounts**: Add account dropdown accepts digits-only input and saves only valid, formatted phone numbers.
- **cUSD Crypto Checkout**: Attach "Buy Now" Web3 payment buttons directly to posts.
- **Celo Escrow Contracts**: Secure payments using an intermediate smart contract (`EazeeEscrow`) that holds funds until delivery is confirmed.
- **Agent Dashboard**: Manage scheduled posts, view real-time Celo transactions, and monitor performance activity.

### Dashboard UX Notes

- Posts tab uses `calendar.svg` icon.
- Sidebar dashboard entry uses `store.svg` icon.
- Payments list shows product name on the first row with escrow status aligned to end on tablet/desktop.
- Wallet address is displayed on a sub-row with wallet icon and relative time.

## 🛠 Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion
- **State Management**: Zustand
- **Web3 & Blockchain**: Viem, Wagmi v2, Celo Alfajores Testnet, Thirdweb SDK
- **Smart Contracts**: Solidity, Hardhat
- **AI Integration**: Gemini API (streaming responses, with optional OpenAI-compatible fallback)

## 📦 Project Structure

```text
Eazee/
├── frontend/              # Next.js app (Compose, Schedule, Dashboard)
├── smart-contract/        # Hardhat + Solidity project (EazeeEscrow)
├── implementation_plan.md
└── README.md
```

---

## 🏁 Getting Started

### Prerequisites

- Node.js (v18+)
- A funded Celo Alfajores wallet private key
- API keys (AI provider + Thirdweb)

### 1) Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=your_thirdweb_client_id
THIRDWEB_SECRET_KEY=your_thirdweb_secret_key
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_CELO_CHAIN_ID=44787
```

Run frontend:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 2) Smart Contract Setup

```bash
cd smart-contract
npm install
```

Create `smart-contract/.env`:

```env
DEPLOYER_PRIVATE_KEY=your_wallet_private_key
```

Compile and deploy:

```bash
npm run compile
npm run deploy:alfajores
```

---

## 🔗 Smart Contract Docs

- Smart contract instructions: [smart-contract/README.md](smart-contract/README.md)

## 🌐 Frontend Docs

- Frontend-only setup and deployment: [frontend/README.md](frontend/README.md)
- Telegram bind hardening, dashboard auth, and SQLite production notes: [frontend/README.md#telegram-wallet-binding--dashboard-auth-phase-2](frontend/README.md#telegram-wallet-binding--dashboard-auth-phase-2)

## 🚢 Deploy to Vercel (Frontend)

Use the repository as source and configure:

- **Root Directory**: `frontend`
- **Install Command**: `npm install`
- **Build Command**: `npm run build`

Add frontend env vars from `frontend/.env.local` in Vercel Project Settings.

Database note for Vercel:

- Current operational persistence uses SQLite file storage (`.data/eazee.sqlite`) for local/dev and single-host persistent-disk deployments.
- For production on Vercel, prefer a managed Postgres backend (optionally via Prisma) because local function filesystem storage is not a durable shared database layer.

## 🏆 Hackathon Tracks

Built specifically for:

- **Track 1:** Best Agent on Celo
- **Track 3:** Highest Rank in 8004scan (AgentScan)
