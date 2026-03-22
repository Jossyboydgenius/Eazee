# Eazee Smart Contracts ⚡🔗

This folder contains the Hardhat project for `EazeeEscrow.sol` on Celo.

## Contract flow

1. Buyer deposits supported token to escrow.
2. Agent/owner releases funds after fulfillment.
3. Buyer/agent can refund when conditions are met.

## Network used now

- Active testnet: **Celo Sepolia**
- Chain ID: `11142220`
- RPC: `https://forno.celo-sepolia.celo-testnet.org/`
- Explorer: `https://celo-sepolia.blockscout.com/`
- Testnet cUSD token: `0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1`

If you open the RPC URL in a browser and get `HTTP 405`, that is expected.
RPC nodes accept JSON-RPC `POST` requests, not browser `GET` requests.

`deploy:alfajores` is kept only as a compatibility alias and deploys to the same Sepolia testnet config.

## Testnet funding answer (important)

- **You do not need real/mainnet money to deploy on testnet.**
- Use the Celo faucet to receive **testnet CELO** for gas.
- Faucet link: `https://faucet.celo.org/`
- Testnet is not gasless by default; gas is still paid, but with faucet tokens.

## MetaMask private key: how to export safely

1. Open MetaMask extension and switch to the account you want to deploy from.
2. Click the account menu (top-right) → `Account details`.
3. Click `Show private key` (or `Export private key` depending on version).
4. Enter your MetaMask password.
5. Copy the private key and store it in a secure password manager.

Security rules:

- Never share this key in chat, screenshots, git commits, or `.env.example`.
- Use this deployer account only for testnet.
- If exposed, create a new account immediately and stop using the old key.

## Environment setup

Create `smart-contract/.env.local`:

```env
DEPLOYER_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
CELO_SEPOLIA_RPC_URL=https://forno.celo-sepolia.celo-testnet.org/
BLOCKSCOUT_API_KEY=your_blockscout_api_key
CELO_SEPOLIA_SUPPORTED_TOKENS=0xTokenA,0xTokenB
# Optional for mainnet deploy:
# CELO_MAINNET_SUPPORTED_TOKENS=0xTokenMainnetA,0xTokenMainnetB
# Optional shared fallback when network-specific value is not set:
# EAZEE_SUPPORTED_TOKENS=0xToken1,0xToken2
```

## Commands

From `smart-contract`:

1. Install dependencies

```bash
npm install
```

2. Compile

```bash
npm run compile
```

3. Deploy (recommended)

```bash
npm run deploy:sepolia
```

The deploy script now configures supported tokens from env after deployment.
If token env vars are missing or invalid, deployment fails early with a clear error.

4. Deploy (compat alias)

```bash
npm run deploy:alfajores
```

5. Verify on Blockscout (optional)

```bash
npm run verify:sepolia -- <DEPLOYED_CONTRACT_ADDRESS>
```

6. Diagnose API key / verifier issues

```bash
npm run verify:diagnose-keys -- <KEY_1> <KEY_2> <KEY_3> --address=<DEPLOYED_CONTRACT_ADDRESS>
```

This script checks each key against:

- Blockscout-style API key behavior and compatibility fallbacks
- Hardhat `verify:sepolia` output per key

7. Mainnet deploy + verify (when ready)

```bash
npm run deploy:celo
npm run hardhat:node20 -- verify --network celo <DEPLOYED_MAINNET_CONTRACT_ADDRESS>
```

After deploy, set `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` in `frontend/.env.local`.

## Troubleshooting

- `ENOTFOUND alfajores-forno.celo-testnet.org`: old endpoint; use Sepolia RPC above.
- `No deployer account configured`: add `DEPLOYER_PRIVATE_KEY` to `smart-contract/.env.local`.
- `insufficient funds for intrinsic transaction cost`: request more faucet CELO, then retry.
- `Invalid API Key` during `verify:sepolia`: set `BLOCKSCOUT_API_KEY` in `smart-contract/.env.local` and ensure there are no extra spaces/newlines in the value.
- `You are using a deprecated V1 endpoint` from `api.celoscan.io`/`api-sepolia.celoscan.io`: expected on old Celoscan flows. Use Blockscout endpoints configured in `blockscout.config.ts`.
