import { NextResponse } from "next/server";
import { sendWhatsAppTextMessage } from "@/lib/whatsappCloud";
import {
  getDueWhatsAppJobs,
  listWhatsAppJobs,
  markJobFailed,
  markJobProcessing,
  markJobSent,
} from "@/lib/whatsappQueue";

export const runtime = "nodejs";

export async function POST() {
  const dueJobs = getDueWhatsAppJobs();

  if (dueJobs.length === 0) {
    return NextResponse.json({
      success: true,
      dispatched: 0,
      message: "No due WhatsApp jobs",
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
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const target of job.targets) {
      if (!target.recipient) {
        skipped += 1;
        errors.push(
          `Target '${target.id}' has no mapped recipient phone number for Cloud API dispatch.`,
        );
        continue;
      }

      const result = await sendWhatsAppTextMessage({
        to: target.recipient,
        body: job.caption,
      });

      if (result.ok) {
        sent += 1;
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
    dispatched: dueJobs.length,
    results,
  });
}

export async function GET() {
  const queue = listWhatsAppJobs();
  const due = getDueWhatsAppJobs();

  return NextResponse.json({
    count: queue.length,
    dueCount: due.length,
    queue,
  });
}
