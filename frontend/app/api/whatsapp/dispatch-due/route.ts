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

      const result =
        provider === "telegram"
          ? await sendTelegramTextMessage({
              chatId: target.recipient,
              text: job.caption,
              disableLinkPreview: true,
            })
          : await sendWhatsAppMessageWithDeadlineFallback({
              to: target.recipient,
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
