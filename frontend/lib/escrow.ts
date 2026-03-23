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
    type: "function",
    name: "depositNative",
    stateMutability: "payable",
    inputs: [
      { name: "seller", type: "address" },
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

const configuredChainId = Number(process.env.NEXT_PUBLIC_CELO_CHAIN_ID);
const isMainnet = configuredChainId === 42220;

const defaultCusd = isMainnet
  ? "0x765DE816845861e75A25fCA122bb6898B8B1282a"
  : "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1";

const defaultCeur = isMainnet
  ? "0xD8763CBA276a3738E6DE85b4B3BF5fded6d6cA73"
  : "0x10c892A6EC43a53E45D0B916B4b7D383B1b78d0F";

const defaultCreal = isMainnet
  ? "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787"
  : "0xE4D517785D091D3c54818832dB6094bcc2744545";

export const STABLECOIN_ADDRESS_BY_SYMBOL: Record<string, string> = {
  cUSD: isAddress(cUsdEnv) ? cUsdEnv : defaultCusd,
  cEUR: isAddress(cEurEnv) ? cEurEnv : defaultCeur,
  cREAL: isAddress(cRealEnv) ? cRealEnv : defaultCreal,
};

export function getEscrowContractAddress(): string {
  return process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS?.trim() || "";
}

export function getEscrowSellerAddress(): string {
  return process.env.NEXT_PUBLIC_ESCROW_SELLER_ADDRESS?.trim() || "";
}
