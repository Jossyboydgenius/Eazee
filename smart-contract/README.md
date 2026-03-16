# Eazee Smart Contracts ⚡🔗

This directory contains the Solidity smart contracts and Hardhat environment for the **Eazee** platform. The central focus is the `EazeeEscrow.sol` contract, designed to securely handle payment settlements using cUSD stablecoins on the Celo network.

## 📝 Contract Overview

### `EazeeEscrow.sol`

An ERC-20 compatible escrow contract on Celo.
Flow of funds:

1. **Deposit**: A buyer clicks "Buy Now" on a generated WhatsApp post and calls `deposit(productId, amount, token)`, locking cUSD in the contract.
2. **Release**: The Eazee AI Agent (or merchant) confirms delivery of the product/service and calls `release(escrowId)` to transfer the funds to the merchant's wallet.
3. **Refund**: If the order cannot be fulfilled or fails tracking timeout, `refund(escrowId)` is called, returning funds to the buyer.

**Key Events Emitted:**

- `PaymentDeposited`
- `PaymentReleased`
- `PaymentRefunded`

## ⚙️ Setup & Deployment

### Prerequisites

Create a `.env` file inside this `smart-contract` folder before proceeding:

```env
DEPLOYER_PRIVATE_KEY=your_funded_testnet_private_key
```

You will need testnet CELO and cUSD to deploy and interact. You can request test funds from the [Celo Alfajores Faucet](https://faucet.celo.org/alfajores).

### Available Scripts

1. **Install Dependencies:**
   Ensure you are in the `/smart-contract` directory:

   ```bash
   npm install
   ```

2. **Compile the Contracts:**

   ```bash
   npx hardhat compile
   ```

3. **Deploy to Celo Alfajores Testnet:**

   ```bash
   npx hardhat run scripts/deploy.ts --network alfajores
   ```

   _Note: Upon successful deployment, copy the contract address and set it in your frontend environment variables if required for UI integration._

4. **Verify Contract (Optional):**
   ```bash
   npx hardhat verify --network alfajores <DEPLOYED_CONTRACT_ADDRESS>
   ```

## 🌐 Network Information

**Celo Alfajores Testnet**

- Chain ID: `44787`
- Explorer: [https://alfajores.celoscan.io/](https://alfajores.celoscan.io/)
- Native Token: `CELO`
- Stablecoin: `cUSD` (Testnet Address: `0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1`)
