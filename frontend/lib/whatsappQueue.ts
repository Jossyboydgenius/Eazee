import { prisma } from "@/lib/prisma";

type DispatchJobRow = Awaited<
  ReturnType<typeof prisma.dispatchJob.findMany>
>[number];
type DispatchReceiptRow = Awaited<
  ReturnType<typeof prisma.dispatchReceipt.findMany>
>[number];
type WhatsAppWebhookEventRow = Awaited<
  ReturnType<typeof prisma.whatsAppWebhookEvent.findMany>
>[number];

export type WhatsAppTargetType =
  | "individual"
  | "status"
  | "groups"
  | "broadcast"
  | "channel";

export interface WhatsAppDispatchTarget {
  id: string;
  type: WhatsAppTargetType;
  recipient?: string;
  label?: string;
}

export type WhatsAppDispatchStatus =
  | "queued"
  | "processing"
  | "sent"
  | "failed";

export interface WhatsAppDispatchJob {
  id: string;
  caption: string;
  templateName?: string;
  templateLanguageCode?: string;
  templateBodyParameters?: string[];
  templateHeaderImageUrl?: string;
  postType: string;
  brief: string;
  tone: string;
  photos: string[];
  hasCeloPayment: boolean;
  price: string;
  currency: string;
  waAccount: string;
  sendTime: string;
  repeat: string;
  scheduledFor: string;
  targets: WhatsAppDispatchTarget[];
  status: WhatsAppDispatchStatus;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastError?: string;
  messageIds?: string[];
  ownerChatId?: string;
  ownerWalletAddress?: string;
  idempotencyKey?: string;
}

export interface NewWhatsAppDispatchJob {
  caption: string;
  templateName?: string;
  templateLanguageCode?: string;
  templateBodyParameters?: string[];
  templateHeaderImageUrl?: string;
  postType: string;
  brief: string;
  tone: string;
  photos: string[];
  hasCeloPayment: boolean;
  price: string;
  currency: string;
  waAccount: string;
  sendTime: string;
  repeat: string;
  scheduledFor: string;
  targets: WhatsAppDispatchTarget[];
  ownerChatId?: string;
  ownerWalletAddress?: string;
  idempotencyKey?: string;
}

export interface WhatsAppWebhookEvent {
  id: string;
  receivedAt: string;
  payload: unknown;
}

const MAX_DISPATCH_ATTEMPTS = Number.parseInt(
  process.env.EAZEE_MAX_DISPATCH_ATTEMPTS || "3",
  10,
);

function nowIso(): string {
  return new Date().toISOString();
}

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function createJobId(): string {
  return `wa-job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function mapJobRow(row: DispatchJobRow): WhatsAppDispatchJob {
  return {
    id: row.id,
    caption: row.caption,
    templateName: row.templateName || undefined,
    templateLanguageCode: row.templateLanguageCode || undefined,
    templateBodyParameters: jsonArray<string>(row.templateBodyParameters),
    templateHeaderImageUrl: row.templateHeaderImageUrl || undefined,
    postType: row.postType,
    brief: row.brief,
    tone: row.tone,
    photos: jsonArray<string>(row.photos),
    hasCeloPayment: row.hasCeloPayment,
    price: row.price,
    currency: row.currency,
    waAccount: row.waAccount,
    sendTime: row.sendTime,
    repeat: row.repeatValue,
    scheduledFor: row.scheduledFor.toISOString(),
    targets: jsonArray<WhatsAppDispatchTarget>(row.targets),
    status: row.status as WhatsAppDispatchStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    attemptCount: row.attemptCount,
    lastError: row.lastError || undefined,
    messageIds: jsonArray<string>(row.messageIds),
    ownerChatId: row.ownerChatId || undefined,
    ownerWalletAddress: row.ownerWalletAddress || undefined,
    idempotencyKey: row.idempotencyKey || undefined,
  };
}

async function getJobById(
  jobId: string,
): Promise<WhatsAppDispatchJob | undefined> {
  const row = await prisma.dispatchJob.findUnique({ where: { id: jobId } });
  return row ? mapJobRow(row) : undefined;
}

export async function enqueueWhatsAppJob(
  input: NewWhatsAppDispatchJob,
): Promise<WhatsAppDispatchJob> {
  const now = nowIso();
  const idempotencyKey = String(input.idempotencyKey || "").trim();

  if (idempotencyKey) {
    const existing = await prisma.dispatchJob.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return mapJobRow(existing);
    }
  }

  const jobId = createJobId();

  await prisma.dispatchJob.create({
    data: {
      id: jobId,
      caption: input.caption,
      templateName: input.templateName || null,
      templateLanguageCode: input.templateLanguageCode || null,
      templateBodyParameters: input.templateBodyParameters || [],
      templateHeaderImageUrl: input.templateHeaderImageUrl || null,
      postType: input.postType,
      brief: input.brief,
      tone: input.tone,
      photos: input.photos || [],
      hasCeloPayment: input.hasCeloPayment,
      price: input.price,
      currency: input.currency,
      waAccount: input.waAccount,
      sendTime: input.sendTime,
      repeatValue: input.repeat,
      scheduledFor: new Date(input.scheduledFor),
      targets: input.targets || [],
      status: "queued",
      createdAt: new Date(now),
      updatedAt: new Date(now),
      attemptCount: 0,
      lastError: null,
      messageIds: [],
      ownerChatId: input.ownerChatId || null,
      ownerWalletAddress: input.ownerWalletAddress || null,
      idempotencyKey: idempotencyKey || null,
    },
  });

  return (await getJobById(jobId))!;
}

export async function listWhatsAppJobs(): Promise<WhatsAppDispatchJob[]> {
  const rows = await prisma.dispatchJob.findMany({
    orderBy: { createdAt: "desc" },
  });

  return rows.map(mapJobRow);
}

export async function getDueWhatsAppJobs(
  referenceDate = new Date(),
): Promise<WhatsAppDispatchJob[]> {
  const rows = await prisma.dispatchJob.findMany({
    where: {
      status: "queued",
      scheduledFor: {
        lte: referenceDate,
      },
    },
    orderBy: { scheduledFor: "asc" },
  });

  return rows.map(mapJobRow);
}

export async function markJobProcessing(
  jobId: string,
): Promise<WhatsAppDispatchJob | undefined> {
  const existing = await getJobById(jobId);
  if (!existing) return undefined;

  await prisma.dispatchJob.update({
    where: { id: jobId },
    data: {
      status: "processing",
      attemptCount: { increment: 1 },
      updatedAt: new Date(nowIso()),
    },
  });

  return getJobById(jobId);
}

export async function markJobSent(
  jobId: string,
  messageIds: string[],
): Promise<WhatsAppDispatchJob | undefined> {
  const existing = await getJobById(jobId);
  if (!existing) return undefined;

  await prisma.dispatchJob.update({
    where: { id: jobId },
    data: {
      status: "sent",
      lastError: null,
      messageIds,
      updatedAt: new Date(nowIso()),
    },
  });

  return getJobById(jobId);
}

export async function markJobFailed(
  jobId: string,
  errorMessage: string,
): Promise<WhatsAppDispatchJob | undefined> {
  const existing = await getJobById(jobId);
  if (!existing) return undefined;

  const safeMaxAttempts =
    Number.isFinite(MAX_DISPATCH_ATTEMPTS) && MAX_DISPATCH_ATTEMPTS > 0
      ? MAX_DISPATCH_ATTEMPTS
      : 3;

  const nextStatus =
    existing.attemptCount < safeMaxAttempts ? "queued" : "failed";

  await prisma.dispatchJob.update({
    where: { id: jobId },
    data: {
      status: nextStatus,
      lastError: errorMessage,
      updatedAt: new Date(nowIso()),
    },
  });

  return getJobById(jobId);
}

export async function recordWebhookEvent(
  payload: unknown,
): Promise<WhatsAppWebhookEvent> {
  const event: WhatsAppWebhookEvent = {
    id: `wa-webhook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    receivedAt: nowIso(),
    payload,
  };

  await prisma.whatsAppWebhookEvent.create({
    data: {
      id: event.id,
      receivedAt: new Date(event.receivedAt),
      payload: payload as never,
    },
  });

  return event;
}

export async function listWebhookEvents(): Promise<WhatsAppWebhookEvent[]> {
  const rows: WhatsAppWebhookEventRow[] =
    await prisma.whatsAppWebhookEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: 500,
    });

  return rows.map((row) => ({
    id: row.id,
    receivedAt: row.receivedAt.toISOString(),
    payload: row.payload,
  }));
}

export async function recordDispatchReceipt(input: {
  jobId: string;
  provider: "whatsapp" | "telegram";
  targetId: string;
  recipient?: string;
  status: "sent" | "failed" | "skipped";
  messageId?: string;
  error?: string;
}): Promise<string> {
  const id = `wa-receipt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  await prisma.dispatchReceipt.create({
    data: {
      id,
      jobId: input.jobId,
      provider: input.provider,
      targetId: input.targetId,
      recipient: input.recipient || null,
      status: input.status,
      messageId: input.messageId || null,
      error: input.error || null,
      attemptedAt: new Date(nowIso()),
    },
  });

  return id;
}

export async function listDispatchReceiptsByOwner(input: {
  chatId?: string;
  walletAddress?: string;
  limit?: number;
}) {
  const chatId = String(input.chatId || "").trim();
  const walletAddress = String(input.walletAddress || "")
    .trim()
    .toLowerCase();
  const limit = Number.isFinite(input.limit)
    ? Math.max(1, Math.floor(input.limit!))
    : 100;

  if (!chatId && !walletAddress) {
    return [];
  }

  const rows: DispatchReceiptRow[] = await prisma.dispatchReceipt.findMany({
    where: chatId
      ? {
          job: {
            ownerChatId: chatId,
          },
        }
      : {
          job: {
            ownerWalletAddress: walletAddress,
          },
        },
    orderBy: { attemptedAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    jobId: row.jobId,
    provider: row.provider,
    targetId: row.targetId,
    recipient: row.recipient,
    status: row.status,
    messageId: row.messageId,
    error: row.error,
    attemptedAt: row.attemptedAt.toISOString(),
  }));
}

export async function listWhatsAppJobsByOwner(input: {
  chatId?: string;
  walletAddress?: string;
  limit?: number;
}): Promise<WhatsAppDispatchJob[]> {
  const chatId = String(input.chatId || "").trim();
  const walletAddress = String(input.walletAddress || "")
    .trim()
    .toLowerCase();
  const limit = Number.isFinite(input.limit)
    ? Math.max(1, Math.floor(input.limit!))
    : 100;

  if (!chatId && !walletAddress) {
    return [];
  }

  const rows: DispatchJobRow[] = await prisma.dispatchJob.findMany({
    where: chatId
      ? { ownerChatId: chatId }
      : { ownerWalletAddress: walletAddress },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map(mapJobRow);
}
