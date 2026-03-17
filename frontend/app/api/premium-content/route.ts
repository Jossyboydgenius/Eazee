import { NextResponse } from "next/server";
import { createThirdwebClient } from "thirdweb";
import { celoSepoliaTestnet } from "thirdweb/chains";
import { facilitator, settlePayment } from "thirdweb/x402";

export const runtime = "nodejs";

const THIRDWEB_SECRET_KEY_PLACEHOLDERS = new Set([
  "",
  "your_thirdweb_secret_key",
  "your-secret-key",
  "<your_secret_key>",
]);

const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY?.trim() || "";
const isX402Configured =
  !THIRDWEB_SECRET_KEY_PLACEHOLDERS.has(thirdwebSecretKey);

const x402Mode =
  process.env.THIRDWEB_X402_MODE?.trim().toLowerCase() ||
  (process.env.NODE_ENV === "production" ? "live" : "mock");

const x402RecipientAddress =
  process.env.THIRDWEB_X402_RECIPIENT_ADDRESS?.trim() ||
  "0x08225517402546f3dA111F2cd54B5C0342C86C1d";

const x402Price = process.env.THIRDWEB_X402_PRICE?.trim() || "$0.01";

const thirdwebX402Client = isX402Configured
  ? createThirdwebClient({ secretKey: thirdwebSecretKey })
  : null;

const thirdwebX402Facilitator = thirdwebX402Client
  ? facilitator({
      client: thirdwebX402Client,
      serverWalletAddress: x402RecipientAddress,
    })
  : null;

function readPaymentHeader(request: Request) {
  return (
    request.headers.get("PAYMENT-SIGNATURE") ||
    request.headers.get("X-PAYMENT") ||
    request.headers.get("x-payment") ||
    undefined
  );
}

export async function GET(request: Request) {
  if (x402Mode === "mock") {
    return NextResponse.json(
      {
        data: "premium content",
        mode: "mock",
        warning:
          "x402 mock mode active. Set THIRDWEB_X402_MODE=live to enforce paid access.",
      },
      {
        status: 200,
        headers: {
          "x-eazee-x402": "mock",
        },
      },
    );
  }

  if (!thirdwebX402Facilitator) {
    return NextResponse.json(
      {
        error:
          "x402 is not configured. Set THIRDWEB_SECRET_KEY in frontend/.env.local and restart the server.",
      },
      { status: 500 },
    );
  }

  try {
    const result = await settlePayment({
      resourceUrl: request.url,
      method: "GET",
      paymentData: readPaymentHeader(request),
      payTo: x402RecipientAddress,
      network: celoSepoliaTestnet,
      price: x402Price,
      facilitator: thirdwebX402Facilitator,
      routeConfig: {
        description: "Eazee premium content",
        mimeType: "application/json",
        maxTimeoutSeconds: 60 * 60,
      },
    });

    if (result.status === 200) {
      return NextResponse.json({ data: "premium content", mode: "live" });
    }

    return Response.json(result.responseBody, {
      status: result.status,
      headers: result.responseHeaders,
    });
  } catch (error) {
    console.error("x402 settlement error:", error);
    return NextResponse.json(
      { error: "Failed to settle x402 payment" },
      { status: 502 },
    );
  }
}
