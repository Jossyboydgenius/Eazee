import { NextResponse } from "next/server";
import { sendWhatsAppMessageWithDeadlineFallback } from "@/lib/whatsappCloud";
import { sendTelegramTextMessage } from "@/lib/telegramBot";
import {
  enqueueWhatsAppJob,
  getDueWhatsAppJobs,
  listWhatsAppJobs,
  markJobFailed,
  markJobProcessing,
  markJobSent,
  recordDispatchReceipt,
} from "@/lib/whatsappQueue";

export const runtime = "nodejs";

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildTelegramBuyNowUrl(input: {
  jobId: string;
  productName: string;
  price: string;
  currency: string;
  sellerAddress: string;
  ownerWalletAddress: string;
}): string {
  const appUrl =
    process.env.TELEGRAM_MINI_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";

  if (!isValidHttpsUrl(appUrl)) {
    return "";
  }

  const url = new URL("/pay", appUrl);
  url.searchParams.set("jobId", input.jobId);
  url.searchParams.set("productName", input.productName);
  url.searchParams.set("price", input.price);
  url.searchParams.set("currency", input.currency);
  url.searchParams.set("seller", input.sellerAddress);
  url.searchParams.set("ownerWalletAddress", input.ownerWalletAddress);

  return url.toString();
}

type MessagingProvider = "whatsapp" | "telegram";

function getMessagingProvider(): MessagingProvider {
  const configured =
    process.env.EAZEE_MESSAGING_PROVIDER?.trim().toLowerCase() || "";

  if (configured === "telegram") {
    return "telegram";
  }

  return "whatsapp";
}

function isAuthorizedDispatchRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return true;

  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  return bearerToken === cronSecret;
}

function getTriggerSource(request: Request): string {
  if (request.headers.get("x-vercel-cron")) {
    return "vercel-cron";
  }

  return "manual";
}

function computeNextScheduledFor(
  currentScheduledFor: string,
  repeat: string,
): string | null {
  const current = new Date(currentScheduledFor);
  if (Number.isNaN(current.getTime())) {
    return null;
  }

  const next = new Date(current);
  if (repeat === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else if (repeat === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (repeat === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + 1);
  } else {
    return null;
  }

  return next.toISOString();
}

async function dispatchDueJobs(request: Request) {
  if (!isAuthorizedDispatchRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getMessagingProvider();

  const dueJobs = await getDueWhatsAppJobs();

  if (dueJobs.length === 0) {
    return NextResponse.json({
      success: true,
      provider,
      dispatched: 0,
      message: "No due queued jobs",
    });
  }

  const results: Array<{
    jobId: string;
    finalStatus?: string;
    attemptCount?: number;
    nextJobId?: string;
    nextScheduledFor?: string;
    sent: number;
    failed: number;
    skipped: number;
    errors: string[];
    messageIds: string[];
  }> = [];

  for (const job of dueJobs) {
    await markJobProcessing(job.id);

    const messageIds: string[] = [];
    const errors: string[] = [];
    const dispatchedRecipients = new Set<string>();
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const target of job.targets) {
      if (!target.recipient) {
        skipped += 1;
        const skippedMessage = `Target '${target.id}' has no mapped recipient destination for dispatch.`;
        errors.push(skippedMessage);
        await recordDispatchReceipt({
          jobId: job.id,
          provider,
          targetId: target.id,
          status: "skipped",
          error: skippedMessage,
        });
        continue;
      }

      if (dispatchedRecipients.has(target.recipient)) {
        skipped += 1;
        const duplicateMessage = `Target '${target.id}' shares recipient '${target.recipient}' with an already-dispatched target. Skipped duplicate send.`;
        errors.push(duplicateMessage);
        await recordDispatchReceipt({
          jobId: job.id,
          provider,
          targetId: target.id,
          recipient: target.recipient,
          status: "skipped",
          error: duplicateMessage,
        });
        continue;
      }

      const recipient = target.recipient;

      const result =
        provider === "telegram"
          ? await (async () => {
              const sellerAddress =
                process.env.NEXT_PUBLIC_ESCROW_SELLER_ADDRESS?.trim() || "";
              const productName =
                String(
                  job.productName || job.brief || job.postType || "Post",
                ).trim() || "Post";
              const isPaymentEnabled =
                Boolean(job.hasCeloPayment) &&
                Boolean(String(job.price || "").trim()) &&
                Boolean(String(job.currency || "").trim()) &&
                Boolean(sellerAddress);

              const buyNowUrl = isPaymentEnabled
                ? buildTelegramBuyNowUrl({
                    jobId: job.id,
                    productName,
                    price: String(job.price || "").trim(),
                    currency: String(job.currency || "cUSD").trim(),
                    sellerAddress,
                    ownerWalletAddress: String(
                      job.ownerWalletAddress || sellerAddress,
                    ).trim(),
                  })
                : "";

              return sendTelegramTextMessage({
                chatId: recipient,
                text: isPaymentEnabled
                  ? `${job.caption}\n\nTap Buy Now to pay on Celo.`
                  : job.caption,
                disableLinkPreview: true,
                replyMarkup: buyNowUrl
                  ? {
                      inline_keyboard: [
                        [
                          {
                            text: `🛒 Buy Now · ${String(job.price || "").trim()} ${String(job.currency || "cUSD").trim()}`,
                            url: buyNowUrl,
                          },
                        ],
                      ],
                    }
                  : undefined,
              });
            })()
          : await sendWhatsAppMessageWithDeadlineFallback({
              to: recipient,
              body: job.caption,
              fallbackTemplateName: job.templateName,
              fallbackTemplateLanguageCode: job.templateLanguageCode,
              fallbackTemplateBodyParameters: job.templateBodyParameters,
              fallbackTemplateHeaderImageUrl: job.templateHeaderImageUrl,
            });

      if (result.ok) {
        sent += 1;
        dispatchedRecipients.add(target.recipient);
        await recordDispatchReceipt({
          jobId: job.id,
          provider,
          targetId: target.id,
          recipient: target.recipient,
          status: "sent",
          messageId: result.messageId,
        });
        if (result.messageId) {
          messageIds.push(result.messageId);
        }
      } else {
        failed += 1;
        const failureMessage =
          result.error || `Send failed for target '${target.id}'`;
        errors.push(failureMessage);
        await recordDispatchReceipt({
          jobId: job.id,
          provider,
          targetId: target.id,
          recipient: target.recipient,
          status: "failed",
          error: failureMessage,
        });
      }
    }

    let finalJob = undefined;
    let nextJobId: string | undefined;
    let nextScheduledFor: string | undefined;

    if (sent > 0 && failed === 0) {
      finalJob = await markJobSent(job.id, messageIds);

      const computedNextScheduledFor = computeNextScheduledFor(
        job.scheduledFor,
        job.repeat,
      );

      if (computedNextScheduledFor) {
        const recurringJob = await enqueueWhatsAppJob({
          caption: job.caption,
          productName: job.productName,
          templateName: job.templateName,
          templateLanguageCode: job.templateLanguageCode,
          templateBodyParameters: job.templateBodyParameters,
          templateHeaderImageUrl: job.templateHeaderImageUrl,
          postType: job.postType,
          brief: job.brief,
          tone: job.tone,
          photos: job.photos,
          hasCeloPayment: job.hasCeloPayment,
          price: job.price,
          currency: job.currency,
          waAccount: job.waAccount,
          sendTime: job.sendTime,
          repeat: job.repeat,
          targets: job.targets,
          scheduledFor: computedNextScheduledFor,
          ownerChatId: job.ownerChatId,
          ownerWalletAddress: job.ownerWalletAddress,
        });

        nextJobId = recurringJob.id;
        nextScheduledFor = recurringJob.scheduledFor;
      }
    } else {
      const reason =
        errors.length > 0
          ? errors.join(" | ")
          : "Dispatch failed with no successful sends";
      finalJob = await markJobFailed(job.id, reason);
    }

    results.push({
      jobId: job.id,
      finalStatus: finalJob?.status,
      attemptCount: finalJob?.attemptCount,
      nextJobId,
      nextScheduledFor,
      sent,
      failed,
      skipped,
      errors,
      messageIds,
    });
  }

  return NextResponse.json({
    success: true,
    provider,
    trigger: getTriggerSource(request),
    dispatched: dueJobs.length,
    results,
  });
}

export async function POST(request: Request) {
  return dispatchDueJobs(request);
}

export async function GET(request: Request) {
  if (request.headers.get("x-vercel-cron")) {
    return dispatchDueJobs(request);
  }

  const queue = await listWhatsAppJobs();
  const due = await getDueWhatsAppJobs();

  return NextResponse.json({
    provider: getMessagingProvider(),
    count: queue.length,
    dueCount: due.length,
    queue,
  });
}
