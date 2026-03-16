# Eazee — Hackathon MVP Guide (`plan.md`)

## 1) Mission

Build **Eazee**, a WhatsApp-first AI commerce agent that helps merchants:

- Create sales-ready posts from product photos
- Schedule and auto-distribute posts
- Accept **Celo stablecoin payments** with escrow flow

Core loop:

> Upload photo → brief AI → review WA preview → set time & audience → auto post → customer taps Buy Now → pays in cUSD → escrow releases funds.

---

## 2) Hackathon Fit (Build Agents for the Real World Celo V2)

Target tracks:

1. **Track 1: Best Agent on Celo** (primary)
2. **Track 3: Highest Rank in 8004scan** (secondary, additive)

What judges should clearly see in Eazee:

- **Real-world utility:** SMB marketing + conversion + payment settlement
- **Agentic behavior:** AI content generation + scheduling + automated posting workflow
- **Celo-native economics:** stablecoin payment and escrow lifecycle on Celo
- **Trust + transparency:** visible onchain actions and payment feed

Timeline anchor:

- Build window: **now → Mar 22, 2026 (9:00 AM GMT submission close)**

---

## 3) Product Scope (MVP Only)

### Screen 1 — Compose

- Upload up to 6 photos
- Select share type + write brief
- Pick tone
- Toggle Celo payment; if ON set amount + stablecoin
- Generate caption with AI and render live in WhatsApp bubble preview

### Screen 2 — Schedule & Target

- Select WhatsApp account
- Pick send time (AI suggested or custom)
- Repeat: one-time/daily/weekly/monthly
- Delivery targets: Status / Groups / Broadcast

### Screen 3 — Dashboard

- **Posts tab:** scheduled + sent posts with thumbnail/time/audience/price badge
- **Payments tab:** live Celo tx feed (payer, amount, product, escrow status)
- **Agent Info tab:** architecture diagram + team responsibility matrix

### Explicit MVP boundaries

- No advanced analytics
- No multi-language generation beyond baseline prompt support
- No heavy CRM or inventory features
- If real WhatsApp API onboarding is blocked, ship with **demo-safe dispatch adapter** + clear “simulated send” labels

---

## 4) Architecture Blueprint

## Frontend

- Next.js (App Router) + TypeScript + Tailwind/shadcn
- Zustand for app state
- Three route groups for Compose, Schedule, Dashboard

## AI Layer

- API route for caption generation (streaming response)
- Prompt policy per tone + post type + payment CTA

## Agent Orchestration

- Scheduler service (cron/queue worker)
- Dispatch adapter interface:
  - `WhatsAppCloudAdapter` (real integration)
  - `MockDispatchAdapter` (fallback for demo reliability)

## Web3 + Celo Layer

- Wagmi/Viem for wallet + contract I/O
- Escrow smart contract for payment states
- Event listener/indexer to power Payments tab feed

## Contracts

- `EazeeEscrow` contract:
  - `deposit(productId, amount, token)`
  - `release(escrowId)`
  - `refund(escrowId)`
- Emit indexed events for UI syncing and auditability

## Agent Reputation / Registry

- Prepare ERC-8004-aligned metadata
- Register/list on AgentScan to support Track 3 visibility

---

## 5) Celo + Tooling Integration Plan

Reference docs:

- x402: https://portal.thirdweb.com/x402
- Celo Agent Skills: https://docs.celo.org/build-on-celo/build-with-ai/agent-skills
- AgentScan: https://agentscan.info/
- Build with AI on Celo: https://docs.celo.org/build-on-celo/build-with-ai/overview

### Must-have integrations

1. **Stablecoin payment UX** in Compose + Buy flow
2. **Onchain escrow state transitions** surfaced in dashboard
3. **Agent identity/reputation presence** on AgentScan/8004 ecosystem

### Nice-to-have (if time remains)

- x402-protected paid API endpoint (e.g., premium caption model or bulk scheduling endpoint)
- Gas fee abstraction in stablecoin where practical

---

## 6) Build Phases (Execution Order)

## Phase A — Foundation (Day 1)

- Finalize data models: `Post`, `Schedule`, `Payment`, `EscrowState`
- Scaffold app routes and shared UI shells
- Wire env schema and feature flags (`REAL_WA_ENABLED`, `CHAIN_ENV`)

## Phase B — Compose End-to-End (Day 1–2)

- Photo upload + form steps + tone selector + payment toggle
- Streaming AI caption generation
- WhatsApp preview with live photo + caption + Buy CTA state

## Phase C — Scheduling + Targeting (Day 2–3)

- Account selector + datetime + repeat rules + audience targeting
- Persist schedule records and queue jobs
- Job runner invokes dispatch adapter and updates status

## Phase D — Smart Contract + Wallet (Day 3–4)

- Build and deploy escrow contract (testnet first)
- Frontend contract calls for `deposit`
- Admin/reviewer flow for `release` and `refund`

## Phase E — Dashboard + Event Feed (Day 4–5)

- Posts tab with upcoming/sent states
- Payments tab from contract events and tx hashes
- Agent Info tab with architecture and responsibilities

## Phase F — Finalization + Submission (Day 5–6)

- Polish critical UX paths
- Record demo video and screenshots
- Complete registration, tweet, and submission form

---

## 7) Day-by-Day Sprint (Mar 16 → Mar 22)

## Mar 16

- Lock architecture + MVP boundaries
- Scaffold app + contract workspace

## Mar 17

- Complete Screen 1 (Compose) + AI streaming

## Mar 18

- Complete Screen 2 (Schedule & Target) + queue worker

## Mar 19

- Implement escrow contract + deploy to Celo testnet + connect wallet flow

## Mar 20

- Build Screen 3 tabs + payments event feed + agent info diagram

## Mar 21

- Full QA on core loop + fix blockers + record demo
- Prepare submission assets and social proof

## Mar 22 (before 9 AM GMT)

- Final smoke test
- Submit on Karma form + publish final tweet + share links

---

## 8) Definition of Done (Hackathon MVP)

Ship-ready means all are true:

1. Merchant can complete full core loop in one session
2. At least one successful onchain payment + escrow transition is visible
3. Dashboard clearly shows post lifecycle and payment lifecycle
4. Agent architecture and responsibilities are documented in-app
5. Submission package (repo, demo, links) is complete before deadline

---

## 9) Submission Checklist

## Project + Community

- [ ] Register project on Karma
- [ ] Join hackathon Telegram group
- [ ] Publish tweet with required tags + project link
- [ ] Submit form with tweet + project links

## Technical Proof

- [ ] Public GitHub repository with README and setup steps
- [ ] Deployed demo URL (or local demo instructions if unavoidable)
- [ ] Contract address(es) + explorer link(s)
- [ ] Screenshots/video of end-to-end flow

## Agent / Reputation

- [ ] Agent profile/metadata prepared for ERC-8004 context
- [ ] Agent listed or visible on AgentScan (where applicable)

## Compliance Notes

- [ ] If Self verification unavailable in your country, include required screenshot evidence

---

## 10) Risk Register + Mitigation

1. **WhatsApp API onboarding delays**
   - Mitigation: keep adapter abstraction; use mock adapter for reliable demo
2. **Onchain integration instability close to deadline**
   - Mitigation: freeze contract ABI early; test with scripted scenarios daily
3. **Scope creep**
   - Mitigation: strict MVP boundary; only ship features tied to judging criteria
4. **Submission-time issues**
   - Mitigation: prepare all links/assets 12+ hours before deadline

---

## 11) Suggested Team Split (if solo, treat as execution lanes)

- **Lane 1: Frontend UX** — 3 screens, form state, previews
- **Lane 2: Agent Backend** — AI route, scheduler, dispatch logic
- **Lane 3: Smart Contracts/Web3** — escrow contract, wallet flow, events
- **Lane 4: Demo & Submission Ops** — video, docs, social, form submission

---

## 12) Immediate Next Actions (Today)

1. Confirm exact design file handoff and component mapping
2. Lock chain target for demo (Celo testnet vs mainnet)
3. Create env template and secrets checklist
4. Implement Screen 1 first and demo the caption preview loop
5. Deploy initial escrow contract and wire payment button to `deposit`
