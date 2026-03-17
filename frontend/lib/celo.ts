import { createThirdwebClient } from "thirdweb";
import { celoSepoliaTestnet, defineChain } from "thirdweb/chains";

const DEFAULT_CELO_CHAIN_ID = 11142220;

const configuredChainId = Number(process.env.NEXT_PUBLIC_CELO_CHAIN_ID);
const chainId = Number.isFinite(configuredChainId)
  ? configuredChainId
  : DEFAULT_CELO_CHAIN_ID;

const THIRDWEB_CLIENT_ID_PLACEHOLDERS = new Set([
  "",
  "your-client-id",
  "your_thirdweb_client_id",
  "replace_with_thirdweb_client_id",
  "<your_client_id>",
]);

const rawThirdwebClientId =
  process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID?.trim() || "";

const isValidThirdwebClientId = /^[a-f0-9]{32}$/i.test(rawThirdwebClientId);

const thirdwebClientId = THIRDWEB_CLIENT_ID_PLACEHOLDERS.has(
  rawThirdwebClientId,
)
  ? ""
  : isValidThirdwebClientId
    ? rawThirdwebClientId
    : "";

export const isThirdwebClientConfigured = Boolean(thirdwebClientId);

export const thirdwebClientConfigState = !rawThirdwebClientId
  ? "missing"
  : THIRDWEB_CLIENT_ID_PLACEHOLDERS.has(rawThirdwebClientId)
    ? "placeholder"
    : isValidThirdwebClientId
      ? "valid"
      : "invalid";

export const celoChain =
  chainId === DEFAULT_CELO_CHAIN_ID ? celoSepoliaTestnet : defineChain(chainId);

export const thirdwebClient = createThirdwebClient({
  clientId: thirdwebClientId || "unconfigured-thirdweb-client-id",
});

export const celoExplorerBaseUrl =
  chainId === 11142220
    ? "https://celo-sepolia.blockscout.com"
    : chainId === 44787
      ? "https://alfajores.celoscan.io"
      : "https://celoscan.io";
