import { NextResponse } from "next/server";
import { upsertPayment } from "@/lib/payments";

export const runtime = "nodejs";

function getBearerToken(value: string | null): string {
  if (!value) return "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function POST(request: Request) {
  const secret = process.env.EAZEE_PAYMENTS_WEBHOOK_SECRET?.trim() || "";
  const authHeader = request.headers.get("authorization");
  const bearerToken = getBearerToken(authHeader);

  if (secret && bearerToken !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const payment = await upsertPayment({
      txHash: String(body.txHash || "").trim(),
      buyer: String(body.buyer || "").trim(),
      seller: String(body.seller || "").trim(),
      tokenAddress: String(body.tokenAddress || "").trim(),
      amount: String(body.amount || "").trim(),
      currency: String(body.currency || "cUSD").trim(),
      productId: String(body.productId || "").trim(),
      productName: String(body.productName || "").trim(),
      contractAddress: String(body.contractAddress || "").trim(),
      ownerWalletAddress: String(body.ownerWalletAddress || body.buyer || "")
        .trim()
        .toLowerCase(),
      chainId: Number(body.chainId),
      escrowId: Number.isFinite(Number(body.escrowId))
        ? Number(body.escrowId)
        : undefined,
      escrowStatus:
        body.escrowStatus === "confirmed" || body.escrowStatus === "refunded"
          ? body.escrowStatus
          : "pending",
    });

    return NextResponse.json({ ok: true, payment });
  } catch (error) {
    console.error("payments webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process payment webhook" },
      { status: 500 },
    );
  }
}
