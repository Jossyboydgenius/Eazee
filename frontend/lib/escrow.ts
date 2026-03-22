import { isAddress } from "thirdweb";

export const ESCROW_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "seller", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "productId", type: "string" },
      { name: "productName", type: "string" },
    ],
    outputs: [{ name: "escrowId", type: "uint256" }],
  },
  {
    type: "event",
    name: "PaymentDeposited",
    anonymous: false,
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "productId", type: "string", indexed: false },
      { name: "productName", type: "string", indexed: false },
    ],
  },
] as const;

export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const cUsdEnv = process.env.NEXT_PUBLIC_CUSD_ADDRESS?.trim() || "";
const cEurEnv = process.env.NEXT_PUBLIC_CEUR_ADDRESS?.trim() || "";
const cRealEnv = process.env.NEXT_PUBLIC_CREAL_ADDRESS?.trim() || "";

export const STABLECOIN_ADDRESS_BY_SYMBOL: Record<string, string> = {
  cUSD: isAddress(cUsdEnv)
    ? cUsdEnv
    : "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
  cEUR: isAddress(cEurEnv)
    ? cEurEnv
    : "0x10c892A6EC43a53E45D0B916B4b7D383B1b78d0F",
  cREAL: isAddress(cRealEnv)
    ? cRealEnv
    : "0xE4D517785D091D3c54818832dB6094bcc2744545",
};

export function getEscrowContractAddress(): string {
  return process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS?.trim() || "";
}

export function getEscrowSellerAddress(): string {
  return process.env.NEXT_PUBLIC_ESCROW_SELLER_ADDRESS?.trim() || "";
}
