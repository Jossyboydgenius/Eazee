import { createThirdwebClient } from "thirdweb";
import { celoSepoliaTestnet, defineChain } from "thirdweb/chains";

const DEFAULT_CELO_CHAIN_ID = 11142220;

const configuredChainId = Number(process.env.NEXT_PUBLIC_CELO_CHAIN_ID);
const chainId = Number.isFinite(configuredChainId)
  ? configuredChainId
  : DEFAULT_CELO_CHAIN_ID;

export const celoChain =
  chainId === DEFAULT_CELO_CHAIN_ID ? celoSepoliaTestnet : defineChain(chainId);

export const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
});

export const celoExplorerBaseUrl =
  chainId === 11142220
    ? "https://celo-sepolia.blockscout.com"
    : chainId === 44787
      ? "https://alfajores.celoscan.io"
      : "https://celoscan.io";
