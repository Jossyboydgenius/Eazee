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
}

export interface NewWhatsAppDispatchJob {
  caption: string;
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
}

export interface WhatsAppWebhookEvent {
  id: string;
  receivedAt: string;
  payload: unknown;
}

const whatsappQueue: WhatsAppDispatchJob[] = [];
const webhookEvents: WhatsAppWebhookEvent[] = [];

export function enqueueWhatsAppJob(
  input: NewWhatsAppDispatchJob,
): WhatsAppDispatchJob {
  const now = new Date().toISOString();
  const job: WhatsAppDispatchJob = {
    id: `wa-job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...input,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    attemptCount: 0,
  };

  whatsappQueue.push(job);
  return job;
}

export function listWhatsAppJobs(): WhatsAppDispatchJob[] {
  return whatsappQueue.map((job) => ({ ...job, targets: [...job.targets] }));
}

export function getDueWhatsAppJobs(
  referenceDate = new Date(),
): WhatsAppDispatchJob[] {
  const nowMs = referenceDate.getTime();
  return whatsappQueue.filter((job) => {
    if (job.status !== "queued") return false;
    const scheduledMs = Date.parse(job.scheduledFor);
    return Number.isFinite(scheduledMs) && scheduledMs <= nowMs;
  });
}

export function markJobProcessing(
  jobId: string,
): WhatsAppDispatchJob | undefined {
  const job = whatsappQueue.find((entry) => entry.id === jobId);
  if (!job) return undefined;

  job.status = "processing";
  job.attemptCount += 1;
  job.updatedAt = new Date().toISOString();
  return job;
}

export function markJobSent(
  jobId: string,
  messageIds: string[],
): WhatsAppDispatchJob | undefined {
  const job = whatsappQueue.find((entry) => entry.id === jobId);
  if (!job) return undefined;

  job.status = "sent";
  job.lastError = undefined;
  job.messageIds = messageIds;
  job.updatedAt = new Date().toISOString();
  return job;
}

export function markJobFailed(
  jobId: string,
  errorMessage: string,
): WhatsAppDispatchJob | undefined {
  const job = whatsappQueue.find((entry) => entry.id === jobId);
  if (!job) return undefined;

  job.status = "failed";
  job.lastError = errorMessage;
  job.updatedAt = new Date().toISOString();
  return job;
}

export function recordWebhookEvent(payload: unknown): WhatsAppWebhookEvent {
  const event: WhatsAppWebhookEvent = {
    id: `wa-webhook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    receivedAt: new Date().toISOString(),
    payload,
  };

  webhookEvents.push(event);
  return event;
}

export function listWebhookEvents(): WhatsAppWebhookEvent[] {
  return [...webhookEvents];
}
