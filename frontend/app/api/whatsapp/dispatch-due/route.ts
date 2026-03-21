import { NextResponse } from "next/server";
import { sendWhatsAppMessageWithDeadlineFallback } from "@/lib/whatsappCloud";
import { sendTelegramTextMessage } from "@/lib/telegramBot";
import {
  getDueWhatsAppJobs,
  listWhatsAppJobs,
  markJobFailed,
  markJobProcessing,
  markJobSent,
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

async function dispatchDueJobs(request: Request) {
  if (!isAuthorizedDispatchRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getMessagingProvider();

  const dueJobs = getDueWhatsAppJobs();

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
    sent: number;
    failed: number;
    skipped: number;
    errors: string[];
    messageIds: string[];
  }> = [];

  for (const job of dueJobs) {
    markJobProcessing(job.id);

    const messageIds: string[] = [];
    const errors: string[] = [];
    const dispatchedRecipients = new Set<string>();
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const target of job.targets) {
      if (!target.recipient) {
        skipped += 1;
        errors.push(
          `Target '${target.id}' has no mapped recipient destination for dispatch.`,
        );
        continue;
      }

      if (dispatchedRecipients.has(target.recipient)) {
        skipped += 1;
        errors.push(
          `Target '${target.id}' shares recipient '${target.recipient}' with an already-dispatched target. Skipped duplicate send.`,
        );
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
        if (result.messageId) {
          messageIds.push(result.messageId);
        }
      } else {
        failed += 1;
        errors.push(result.error || `Send failed for target '${target.id}'`);
      }
    }

    if (sent > 0 && failed === 0) {
      markJobSent(job.id, messageIds);
    } else {
      const reason =
        errors.length > 0
          ? errors.join(" | ")
          : "Dispatch failed with no successful sends";
      markJobFailed(job.id, reason);
    }

    results.push({
      jobId: job.id,
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

  const queue = listWhatsAppJobs();
  const due = getDueWhatsAppJobs();

  return NextResponse.json({
    provider: getMessagingProvider(),
    count: queue.length,
    dueCount: due.length,
    queue,
  });
}
