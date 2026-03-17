import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

interface PersistedQueueState {
  jobs: WhatsAppDispatchJob[];
  webhookEvents: WhatsAppWebhookEvent[];
}

const queueStateFilePath =
  process.env.WHATSAPP_QUEUE_STATE_FILE?.trim() ||
  join(process.cwd(), ".data", "whatsapp-queue-state.json");

const persistedState = loadPersistedState();

const whatsappQueue: WhatsAppDispatchJob[] = persistedState.jobs;
const webhookEvents: WhatsAppWebhookEvent[] = persistedState.webhookEvents;

function loadPersistedState(): PersistedQueueState {
  if (!existsSync(queueStateFilePath)) {
    return { jobs: [], webhookEvents: [] };
  }

  try {
    const raw = readFileSync(queueStateFilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedQueueState>;

    const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    const events = Array.isArray(parsed.webhookEvents)
      ? parsed.webhookEvents
      : [];

    return {
      jobs,
      webhookEvents: events,
    };
  } catch (error) {
    console.error("Failed to load persisted WhatsApp queue state:", error);
    return { jobs: [], webhookEvents: [] };
  }
}

function persistState() {
  try {
    mkdirSync(dirname(queueStateFilePath), { recursive: true });
    writeFileSync(
      queueStateFilePath,
      JSON.stringify(
        {
          jobs: whatsappQueue,
          webhookEvents,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch (error) {
    console.error("Failed to persist WhatsApp queue state:", error);
  }
}

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
  persistState();
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
  persistState();
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
  persistState();
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
  persistState();
  return job;
}

export function recordWebhookEvent(payload: unknown): WhatsAppWebhookEvent {
  const event: WhatsAppWebhookEvent = {
    id: `wa-webhook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    receivedAt: new Date().toISOString(),
    payload,
  };

  webhookEvents.push(event);
  persistState();
  return event;
}

export function listWebhookEvents(): WhatsAppWebhookEvent[] {
  return [...webhookEvents];
}
