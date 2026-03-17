import { NextResponse } from "next/server";
import {
  enqueueWhatsAppJob,
  listWhatsAppJobs,
  type WhatsAppDispatchTarget,
} from "@/lib/whatsappQueue";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      caption,
      templateName,
      templateLanguageCode,
      templateBodyParameters,
      templateHeaderImageUrl,
      postType,
      brief,
      tone,
      photos,
      hasCeloPayment,
      price,
      currency,
      waAccount,
      sendTime,
      repeat,
      targets,
      groups,
      targetRecipients,
    } = body;

    if (!caption || !waAccount || !sendTime || !targets?.length) {
      return NextResponse.json(
        { error: "Missing required scheduling fields" },
        { status: 400 },
      );
    }

    const normalizedTargets = normalizeTargets(
      targets,
      groups,
      targetRecipients,
    );

    const scheduledFor = buildScheduledDate(sendTime);

    const job = enqueueWhatsAppJob({
      caption,
      templateName:
        typeof templateName === "string" ? templateName.trim() : undefined,
      templateLanguageCode:
        typeof templateLanguageCode === "string"
          ? templateLanguageCode.trim()
          : undefined,
      templateBodyParameters: Array.isArray(templateBodyParameters)
        ? templateBodyParameters
            .map((value: unknown) => String(value).trim())
            .filter(Boolean)
        : undefined,
      templateHeaderImageUrl:
        typeof templateHeaderImageUrl === "string"
          ? templateHeaderImageUrl.trim()
          : undefined,
      postType,
      brief,
      tone,
      photos: Array.isArray(photos) ? photos : [],
      hasCeloPayment: Boolean(hasCeloPayment),
      price: String(price || ""),
      currency: String(currency || "cUSD"),
      waAccount: String(waAccount),
      sendTime: String(sendTime),
      repeat: String(repeat || "one-time"),
      targets: normalizedTargets,
      scheduledFor,
    });

    console.log(`✅ Scheduled job ${job.id} for ${job.scheduledFor}`);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      scheduledFor: job.scheduledFor,
      queuedTargets: normalizedTargets.length,
      message: `Post scheduled for ${sendTime} (${repeat})`,
    });
  } catch (error) {
    console.error("Scheduling error:", error);
    return NextResponse.json(
      { error: "Failed to schedule post" },
      { status: 500 },
    );
  }
}

export async function GET() {
  const queue = listWhatsAppJobs();
  return NextResponse.json({ queue, count: queue.length });
}

function normalizeTargets(
  targets: unknown,
  groups: unknown,
  targetRecipients: unknown,
): WhatsAppDispatchTarget[] {
  if (!Array.isArray(targets)) {
    return [];
  }

  const recipientsByTarget =
    targetRecipients && typeof targetRecipients === "object"
      ? (targetRecipients as Record<string, string>)
      : {};

  const normalized: WhatsAppDispatchTarget[] = [];

  for (const target of targets) {
    const targetId = String(target);

    if (targetId === "groups") {
      if (Array.isArray(groups) && groups.length > 0) {
        for (const groupId of groups) {
          const key = String(groupId);
          normalized.push({
            type: "groups",
            id: key,
            recipient: recipientsByTarget[key],
          });
        }
        continue;
      }

      normalized.push({
        type: "groups",
        id: "groups",
        recipient: recipientsByTarget.groups,
      });
      continue;
    }

    if (targetId === "broadcast") {
      normalized.push({
        type: "broadcast",
        id: "broadcast",
        recipient: recipientsByTarget.broadcast,
      });
      continue;
    }

    if (targetId === "channel") {
      normalized.push({
        type: "channel",
        id: "channel",
        recipient: recipientsByTarget.channel,
      });
      continue;
    }

    normalized.push({
      type: "status",
      id: targetId,
      recipient: recipientsByTarget[targetId],
    });
  }

  return normalized;
}

function buildScheduledDate(sendTime: string): string {
  if (sendTime.includes("T")) return sendTime;

  const [hours] = sendTime.split(":");
  const now = new Date();
  now.setHours(parseInt(hours, 10), 0, 0, 0);

  if (now.getTime() < Date.now()) {
    now.setDate(now.getDate() + 1);
  }

  return now.toISOString();
}
