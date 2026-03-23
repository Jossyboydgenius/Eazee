import { NextResponse } from "next/server";
import {
  enqueueWhatsAppJob,
  listWhatsAppJobs,
  type WhatsAppDispatchTarget,
} from "@/lib/whatsappQueue";
import { getTelegramBindingByChatId } from "@/lib/telegramIdentity";
import { getWalletSessionFromRequest } from "@/lib/walletAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const walletSession = await getWalletSessionFromRequest(request);
    const {
      caption,
      productName,
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
      ownerChatId,
      ownerWalletAddress,
      idempotencyKey,
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

    const normalizedOwnerChatId =
      typeof ownerChatId === "string" ? ownerChatId.trim() : "";
    const normalizedOwnerWalletAddress =
      typeof ownerWalletAddress === "string"
        ? ownerWalletAddress.trim().toLowerCase()
        : "";
    const binding = normalizedOwnerChatId
      ? await getTelegramBindingByChatId(normalizedOwnerChatId)
      : null;
    if (
      walletSession &&
      normalizedOwnerWalletAddress &&
      normalizedOwnerWalletAddress !== walletSession.walletAddress
    ) {
      return NextResponse.json(
        {
          error:
            "ownerWalletAddress does not match authenticated wallet session",
        },
        { status: 403 },
      );
    }

    if (
      walletSession &&
      binding?.walletAddress &&
      binding.walletAddress !== walletSession.walletAddress
    ) {
      return NextResponse.json(
        {
          error:
            "Authenticated wallet session does not match Telegram chat binding wallet",
        },
        { status: 403 },
      );
    }

    const resolvedOwnerWalletAddress =
      normalizedOwnerWalletAddress ||
      walletSession?.walletAddress ||
      binding?.walletAddress ||
      "";

    const scheduledFor = buildScheduledDate(sendTime);

    const job = await enqueueWhatsAppJob({
      caption,
      productName:
        typeof productName === "string" ? productName.trim() : undefined,
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
      ownerChatId: normalizedOwnerChatId || undefined,
      ownerWalletAddress: resolvedOwnerWalletAddress || undefined,
      idempotencyKey:
        typeof idempotencyKey === "string" ? idempotencyKey.trim() : undefined,
    });

    console.log(`✅ Scheduled job ${job.id} for ${job.scheduledFor}`);

    const scheduledTimestamp = Date.parse(job.scheduledFor);
    let immediateDispatchTriggered = false;
    let immediateDispatchError: string | null = null;

    if (
      Number.isFinite(scheduledTimestamp) &&
      scheduledTimestamp <= Date.now() + 15_000
    ) {
      const dispatchUrl = new URL("/api/whatsapp/dispatch-due", request.url);
      const cronSecret = process.env.CRON_SECRET?.trim() || "";

      try {
        const dispatchResponse = await fetch(dispatchUrl.toString(), {
          method: "POST",
          headers: cronSecret
            ? {
                Authorization: `Bearer ${cronSecret}`,
              }
            : undefined,
          cache: "no-store",
        });

        immediateDispatchTriggered = dispatchResponse.ok;

        if (!dispatchResponse.ok) {
          const dispatchPayload = await dispatchResponse
            .json()
            .catch(() => ({}));
          immediateDispatchError =
            typeof dispatchPayload?.error === "string"
              ? dispatchPayload.error
              : `Dispatch trigger failed with status ${dispatchResponse.status}`;
          console.error("Immediate dispatch trigger failed:", {
            status: dispatchResponse.status,
            error: immediateDispatchError,
          });
        }
      } catch (dispatchError) {
        immediateDispatchError =
          dispatchError instanceof Error
            ? dispatchError.message
            : "Unknown immediate dispatch error";
        console.error("Immediate dispatch trigger failed:", dispatchError);
      }
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      scheduledFor: job.scheduledFor,
      ownerChatId: job.ownerChatId || null,
      ownerWalletAddress: job.ownerWalletAddress || null,
      queuedTargets: normalizedTargets.length,
      immediateDispatchTriggered,
      immediateDispatchError,
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
  const queue = await listWhatsAppJobs();
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
  if (
    String(sendTime || "")
      .trim()
      .toLowerCase() === "now"
  ) {
    return new Date().toISOString();
  }

  if (sendTime.includes("T")) return sendTime;

  const [hours] = sendTime.split(":");
  const now = new Date();
  now.setHours(parseInt(hours, 10), 0, 0, 0);

  if (now.getTime() < Date.now()) {
    now.setDate(now.getDate() + 1);
  }

  return now.toISOString();
}
