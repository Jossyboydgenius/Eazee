import { NextResponse } from "next/server";
import { createPublicClient, defineChain, formatUnits, http } from "viem";

export const runtime = "nodejs";

const NATIVE_TOKEN_ALIASES = new Set([
  "",
  "native",
  "celo",
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function resolveChainId(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 42220;
  }
  return parsed;
}

function resolveRpcUrl(chainId: number): string {
  if (chainId === 11142220) {
    return (
      process.env.CELO_SEPOLIA_RPC_URL?.trim() ||
      "https://forno.celo-sepolia.celo-testnet.org/"
    );
  }

  return process.env.CELO_MAINNET_RPC_URL?.trim() || "https://forno.celo.org";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = String(searchParams.get("walletAddress") || "").trim();
  const tokenAddress = String(searchParams.get("tokenAddress") || "").trim();
  const chainId = resolveChainId(
    String(searchParams.get("chainId") || "42220"),
  );

  if (!isAddress(walletAddress)) {
    return NextResponse.json(
      { error: "walletAddress must be a valid address" },
      { status: 400 },
    );
  }

  const normalizedTokenAddress = tokenAddress.toLowerCase();
  const isNativeBalanceRequest = NATIVE_TOKEN_ALIASES.has(
    normalizedTokenAddress,
  );

  if (!isNativeBalanceRequest && !isAddress(tokenAddress)) {
    return NextResponse.json(
      {
        error: "tokenAddress must be a valid address, or one of: native, celo",
      },
      { status: 400 },
    );
  }

  const rpcUrl = resolveRpcUrl(chainId);

  try {
    const client = createPublicClient({
      chain: defineChain({
        id: chainId,
        name: chainId === 11142220 ? "Celo Sepolia" : "Celo Mainnet",
        nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
        rpcUrls: {
          default: { http: [rpcUrl] },
          public: { http: [rpcUrl] },
        },
      }),
      transport: http(rpcUrl),
    });

    const balance = isNativeBalanceRequest
      ? await client.getBalance({
          address: walletAddress as `0x${string}`,
        })
      : await client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: [
            {
              type: "function",
              name: "balanceOf",
              stateMutability: "view",
              inputs: [{ name: "account", type: "address" }],
              outputs: [{ name: "", type: "uint256" }],
            },
          ],
          functionName: "balanceOf",
          args: [walletAddress as `0x${string}`],
        });

    return NextResponse.json({
      walletAddress,
      tokenAddress: isNativeBalanceRequest ? "native" : tokenAddress,
      isNative: isNativeBalanceRequest,
      chainId,
      balanceRaw: balance.toString(),
      balanceFormatted: formatUnits(balance, 18),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch token balance",
      },
      { status: 500 },
    );
  }
}
