import { NextResponse } from "next/server";
import { reconcilePaymentByTxHash } from "@/lib/payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const txHash = String(body.txHash || "").trim();

    if (!txHash) {
      return NextResponse.json(
        { error: "txHash is required" },
        { status: 400 },
      );
    }

    const payment = await reconcilePaymentByTxHash(txHash);
    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found for txHash" },
        { status: 404 },
      );
    }

    return NextResponse.json({ payment });
  } catch (error) {
    console.error("payments reconcile error:", error);
    return NextResponse.json(
      { error: "Failed to reconcile payment" },
      { status: 500 },
    );
  }
}
