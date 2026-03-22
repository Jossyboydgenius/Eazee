import { NextResponse } from "next/server";
import { listPaymentsByOwner, upsertPayment } from "@/lib/payments";

export const runtime = "nodejs";

function toSafeLimit(input: string): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(200, Math.floor(parsed));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ownerWalletAddress = String(searchParams.get("walletAddress") || "")
    .trim()
    .toLowerCase();

  if (!ownerWalletAddress) {
    return NextResponse.json(
      { error: "walletAddress is required" },
      { status: 400 },
    );
  }

  const payments = await listPaymentsByOwner({
    ownerWalletAddress,
    limit: toSafeLimit(String(searchParams.get("limit") || "50")),
  });

  return NextResponse.json({ payments, count: payments.length });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const txHash = String(body.txHash || "").trim();
    const buyer = String(body.buyer || "").trim();
    const seller = String(body.seller || "").trim();
    const tokenAddress = String(body.tokenAddress || "").trim();
    const amount = String(body.amount || "").trim();
    const currency = String(body.currency || "cUSD").trim();
    const productId = String(body.productId || "").trim();
    const productName = String(body.productName || "").trim();
    const contractAddress = String(body.contractAddress || "").trim();
    const ownerWalletAddress = String(body.ownerWalletAddress || buyer)
      .trim()
      .toLowerCase();

    if (
      !txHash ||
      !buyer ||
      !seller ||
      !tokenAddress ||
      !amount ||
      !productName ||
      !contractAddress ||
      !ownerWalletAddress
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: txHash, buyer, seller, tokenAddress, amount, productName, contractAddress, ownerWalletAddress",
        },
        { status: 400 },
      );
    }

    const payment = await upsertPayment({
      txHash,
      buyer,
      seller,
      tokenAddress,
      amount,
      currency,
      productId,
      productName,
      contractAddress,
      ownerWalletAddress,
      chainId: Number(body.chainId),
      escrowId: Number.isFinite(Number(body.escrowId))
        ? Number(body.escrowId)
        : undefined,
      escrowStatus:
        body.escrowStatus === "confirmed" || body.escrowStatus === "refunded"
          ? body.escrowStatus
          : "pending",
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error("payments POST error:", error);
    return NextResponse.json(
      { error: "Failed to persist payment" },
      { status: 500 },
    );
  }
}
