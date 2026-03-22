import { NextResponse } from "next/server";
import {
  deleteQueuedWhatsAppJob,
  getWhatsAppJobById,
  type WhatsAppDispatchTarget,
  updateQueuedWhatsAppJob,
} from "@/lib/whatsappQueue";
import { getWalletSessionFromRequest } from "@/lib/walletAuth";

export const runtime = "nodejs";

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
  now.setHours(Number.parseInt(hours, 10), 0, 0, 0);

  if (now.getTime() < Date.now()) {
    now.setDate(now.getDate() + 1);
  }

  return now.toISOString();
}

async function assertAuthorizedOwner(input: {
  request: Request;
  ownerWalletAddress: string;
}) {
  const allowInsecureMutation =
    process.env.EAZEE_ALLOW_INSECURE_SCHEDULE_MUTATION?.trim().toLowerCase() ===
    "true";

  const walletSession = await getWalletSessionFromRequest(input.request);
  const normalizedOwnerWalletAddress = String(input.ownerWalletAddress || "")
    .trim()
    .toLowerCase();

  if (allowInsecureMutation) {
    return {
      ok: true as const,
      walletSession,
      normalizedOwnerWalletAddress,
    };
  }

  if (!walletSession) {
    return {
      ok: false as const,
      status: 401,
      error: "Missing wallet session token",
    };
  }

  if (
    normalizedOwnerWalletAddress &&
    walletSession.walletAddress !== normalizedOwnerWalletAddress
  ) {
    return {
      ok: false as const,
      status: 403,
      error: "Wallet session does not match post owner",
    };
  }

  return {
    ok: true as const,
    walletSession,
    normalizedOwnerWalletAddress,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const existing = await getWhatsAppJobById(jobId);

    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const auth = await assertAuthorizedOwner({
      request,
      ownerWalletAddress: existing.ownerWalletAddress || "",
    });

    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

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
      ownerChatId,
      ownerWalletAddress,
    } = body || {};

    if (!caption || !waAccount || !sendTime || !Array.isArray(targets)) {
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
    const scheduledFor = buildScheduledDate(String(sendTime));
    const resolvedOwnerWalletAddress =
      String(ownerWalletAddress || "")
        .trim()
        .toLowerCase() ||
      auth.walletSession?.walletAddress ||
      existing.ownerWalletAddress ||
      "";

    const updated = await updateQueuedWhatsAppJob(jobId, {
      caption: String(caption),
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
      postType: String(postType || ""),
      brief: String(brief || ""),
      tone: String(tone || ""),
      photos: Array.isArray(photos) ? photos.map((value) => String(value)) : [],
      hasCeloPayment: Boolean(hasCeloPayment),
      price: String(price || ""),
      currency: String(currency || "cUSD"),
      waAccount: String(waAccount),
      sendTime: String(sendTime),
      repeat: String(repeat || "one-time"),
      targets: normalizedTargets,
      scheduledFor,
      ownerChatId: String(ownerChatId || "").trim() || undefined,
      ownerWalletAddress: resolvedOwnerWalletAddress || undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      jobId: updated.id,
      scheduledFor: updated.scheduledFor,
      queuedTargets: updated.targets.length,
      status: updated.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    const status = /queued/i.test(message) ? 409 : 500;

    return NextResponse.json(
      { error: message || "Failed to update scheduled post" },
      { status },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const existing = await getWhatsAppJobById(jobId);

    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const auth = await assertAuthorizedOwner({
      request,
      ownerWalletAddress: existing.ownerWalletAddress || "",
    });

    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const deleted = await deleteQueuedWhatsAppJob(jobId);
    if (!deleted) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    const status = /queued/i.test(message) ? 409 : 500;

    return NextResponse.json(
      { error: message || "Failed to delete scheduled post" },
      { status },
    );
  }
}
