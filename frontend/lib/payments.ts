import { prisma } from "@/lib/prisma";
import { createPublicClient, decodeEventLog, defineChain, http } from "viem";
import { ESCROW_ABI } from "@/lib/escrow";

export type EscrowStatus = "pending" | "confirmed" | "refunded";

export interface PersistPaymentInput {
  txHash: string;
  buyer: string;
  seller: string;
  tokenAddress: string;
  amount: string;
  currency: string;
  productId: string;
  productName: string;
  contractAddress: string;
  ownerWalletAddress: string;
  chainId?: number;
  escrowId?: number;
  escrowStatus?: EscrowStatus;
}

export interface PaymentRecord {
  id: string;
  txHash: string;
  buyer: string;
  seller: string;
  tokenAddress: string;
  amount: string;
  currency: string;
  productId: string;
  productName: string;
  contractAddress: string;
  ownerWalletAddress: string;
  chainId: number;
  escrowId: number | null;
  escrowStatus: EscrowStatus;
  blockNumber: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_CHAIN_ID = 11142220;
const DEFAULT_CELO_SEPOLIA_RPC = "https://forno.celo-sepolia.celo-testnet.org";

function now() {
  return new Date();
}

function normalizeAddress(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function mapRecord(
  row: Awaited<ReturnType<typeof prisma.paymentTransaction.findMany>>[number],
): PaymentRecord {
  return {
    id: row.id,
    txHash: row.txHash,
    buyer: row.buyer,
    seller: row.seller,
    tokenAddress: row.tokenAddress,
    amount: row.amount,
    currency: row.currency,
    productId: row.productId,
    productName: row.productName,
    contractAddress: row.contractAddress,
    ownerWalletAddress: row.ownerWalletAddress,
    chainId: row.chainId,
    escrowId: row.escrowId,
    escrowStatus: row.escrowStatus as EscrowStatus,
    blockNumber: row.blockNumber ? row.blockNumber.toString() : null,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertPayment(
  input: PersistPaymentInput,
): Promise<PaymentRecord> {
  const txHash = String(input.txHash || "").trim();
  const chainId = Number.isFinite(input.chainId)
    ? Number(input.chainId)
    : DEFAULT_CHAIN_ID;
  const timestamp = now();

  const row = await prisma.paymentTransaction.upsert({
    where: { txHash },
    create: {
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      txHash,
      chainId,
      contractAddress: normalizeAddress(input.contractAddress),
      buyer: normalizeAddress(input.buyer),
      seller: normalizeAddress(input.seller),
      tokenAddress: normalizeAddress(input.tokenAddress),
      amount: String(input.amount || ""),
      currency: String(input.currency || "cUSD"),
      productId: String(input.productId || ""),
      productName: String(input.productName || ""),
      escrowId: Number.isFinite(input.escrowId) ? Number(input.escrowId) : null,
      escrowStatus: input.escrowStatus || "pending",
      ownerWalletAddress: normalizeAddress(
        input.ownerWalletAddress || input.buyer,
      ),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    update: {
      chainId,
      contractAddress: normalizeAddress(input.contractAddress),
      buyer: normalizeAddress(input.buyer),
      seller: normalizeAddress(input.seller),
      tokenAddress: normalizeAddress(input.tokenAddress),
      amount: String(input.amount || ""),
      currency: String(input.currency || "cUSD"),
      productId: String(input.productId || ""),
      productName: String(input.productName || ""),
      escrowId: Number.isFinite(input.escrowId)
        ? Number(input.escrowId)
        : undefined,
      escrowStatus: input.escrowStatus || "pending",
      ownerWalletAddress: normalizeAddress(
        input.ownerWalletAddress || input.buyer,
      ),
      updatedAt: timestamp,
    },
  });

  return mapRecord(row);
}

export async function listPaymentsByOwner(input: {
  ownerWalletAddress: string;
  limit?: number;
}): Promise<PaymentRecord[]> {
  const ownerWalletAddress = normalizeAddress(input.ownerWalletAddress);
  const limit = Number.isFinite(input.limit)
    ? Math.max(1, Math.floor(input.limit || 100))
    : 100;

  const rows = await prisma.paymentTransaction.findMany({
    where: {
      ownerWalletAddress,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  return rows.map(mapRecord);
}

function createChainClient(chainId: number) {
  const rpcUrl =
    process.env.CELO_SEPOLIA_RPC_URL?.trim() || DEFAULT_CELO_SEPOLIA_RPC;

  return createPublicClient({
    chain: defineChain({
      id: chainId,
      name: chainId === DEFAULT_CHAIN_ID ? "Celo Sepolia" : `Chain ${chainId}`,
      nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
      rpcUrls: {
        default: { http: [rpcUrl] },
      },
    }),
    transport: http(rpcUrl),
  });
}

export async function reconcilePaymentByTxHash(
  txHash: string,
): Promise<PaymentRecord | null> {
  const existing = await prisma.paymentTransaction.findUnique({
    where: { txHash: String(txHash || "").trim() },
  });

  if (!existing) {
    return null;
  }

  const client = createChainClient(existing.chainId || DEFAULT_CHAIN_ID);
  const receipt = await client.getTransactionReceipt({
    hash: existing.txHash as `0x${string}`,
  });

  let escrowId = existing.escrowId;
  const normalizedContract = normalizeAddress(existing.contractAddress);

  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== normalizedContract) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: ESCROW_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName !== "PaymentDeposited") {
        continue;
      }

      const rawEscrowId = decoded.args.escrowId;
      escrowId =
        typeof rawEscrowId === "bigint" ? Number(rawEscrowId) : escrowId;
      break;
    } catch {
      // Ignore unrelated logs.
    }
  }

  const updated = await prisma.paymentTransaction.update({
    where: { txHash: existing.txHash },
    data: {
      escrowStatus: receipt.status === "success" ? "confirmed" : "pending",
      blockNumber: receipt.blockNumber,
      confirmedAt: receipt.status === "success" ? now() : null,
      escrowId,
      updatedAt: now(),
    },
  });

  return mapRecord(updated);
}
