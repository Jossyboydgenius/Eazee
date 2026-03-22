import { NextResponse } from "next/server";
import {
  getTelegramBindingByChatId,
  getTelegramBindingByWallet,
} from "@/lib/telegramIdentity";
import {
  listDispatchReceiptsByOwner,
  listWhatsAppJobsByOwner,
} from "@/lib/whatsappQueue";
import { getWalletSessionFromRequest } from "@/lib/walletAuth";
import { listPaymentsByOwner } from "@/lib/payments";

export const runtime = "nodejs";

function toSafeLimit(input: string): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100;
  }

  return Math.min(500, Math.floor(parsed));
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const chatId = String(searchParams.get("chatId") || "").trim();
  const walletAddress = String(searchParams.get("walletAddress") || "")
    .trim()
    .toLowerCase();
  const limit = toSafeLimit(String(searchParams.get("limit") || "100"));

  const configuredDashboardToken =
    process.env.EAZEE_DASHBOARD_API_TOKEN?.trim() || "";
  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const hasStaticTokenAccess = Boolean(
    configuredDashboardToken && bearerToken === configuredDashboardToken,
  );
  const walletSession = await getWalletSessionFromRequest(request);

  if (!hasStaticTokenAccess && !walletSession) {
    return NextResponse.json(
      {
        error:
          "Unauthorized. Provide a valid wallet session token or EAZEE_DASHBOARD_API_TOKEN bearer token.",
      },
      { status: 401 },
    );
  }

  if (!chatId && !walletAddress) {
    return NextResponse.json(
      {
        error: "Provide chatId or walletAddress",
      },
      { status: 400 },
    );
  }

  const bindingByChat = chatId
    ? await getTelegramBindingByChatId(chatId)
    : null;
  const bindingByWallet = walletAddress
    ? await getTelegramBindingByWallet(walletAddress)
    : null;

  const resolvedChatId = chatId || bindingByWallet?.chatId || "";
  const resolvedWalletAddress =
    walletAddress ||
    bindingByChat?.walletAddress ||
    walletSession?.walletAddress ||
    "";

  if (
    !hasStaticTokenAccess &&
    walletSession &&
    resolvedWalletAddress &&
    walletSession.walletAddress !== resolvedWalletAddress
  ) {
    return NextResponse.json(
      {
        error: "Forbidden. Wallet session does not match requested owner.",
      },
      { status: 403 },
    );
  }

  const jobs = await listWhatsAppJobsByOwner({
    chatId: resolvedChatId || undefined,
    walletAddress: resolvedWalletAddress || undefined,
    limit,
  });

  const receipts = await listDispatchReceiptsByOwner({
    chatId: resolvedChatId || undefined,
    walletAddress: resolvedWalletAddress || undefined,
    limit,
  });

  const payments = resolvedWalletAddress
    ? await listPaymentsByOwner({
        ownerWalletAddress: resolvedWalletAddress,
        limit,
      })
    : [];

  const summary = jobs.reduce(
    (accumulator, job) => {
      if (job.status === "queued") accumulator.queued += 1;
      if (job.status === "processing") accumulator.processing += 1;
      if (job.status === "sent") accumulator.sent += 1;
      if (job.status === "failed") accumulator.failed += 1;

      if (job.hasCeloPayment) {
        accumulator.paymentTaggedJobs += 1;
        accumulator.totalTaggedAmount += toNumber(job.price);
      }

      return accumulator;
    },
    {
      queued: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      paymentTaggedJobs: 0,
      totalTaggedAmount: 0,
    },
  );

  return NextResponse.json({
    owner: {
      chatId: resolvedChatId || null,
      walletAddress: resolvedWalletAddress || null,
      binding: bindingByChat || bindingByWallet || null,
    },
    summary,
    jobs,
    receipts,
    payments,
    count: {
      jobs: jobs.length,
      receipts: receipts.length,
      payments: payments.length,
    },
  });
}
