import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ParsedTelegramUpdate {
  updateId: string;
  updateType: string;
  chatId: string;
  chatType: string;
  fromId: string;
  messageId: string;
  text: string;
  command: string;
  callbackQueryId: string;
  callbackData: string;
}

export interface TelegramWebhookEvent {
  id: string;
  receivedAt: string;
  update: ParsedTelegramUpdate;
  payload: unknown;
}

export interface TelegramSessionState {
  chatId: string;
  updatedAt: string;
  interactionCount: number;
  lastUpdateType: string;
  lastCommand: string;
  lastCallbackData: string;
  lastText: string;
}

interface PersistedTelegramWebhookState {
  events: TelegramWebhookEvent[];
  sessions: Record<string, TelegramSessionState>;
}

const telegramWebhookStateFilePath =
  process.env.TELEGRAM_WEBHOOK_STATE_FILE?.trim() ||
  join(process.cwd(), ".data", "telegram-webhook-state.json");

const persistedState = loadPersistedState();
const webhookEvents: TelegramWebhookEvent[] = persistedState.events;
const webhookSessions: Record<string, TelegramSessionState> =
  persistedState.sessions;

function loadPersistedState(): PersistedTelegramWebhookState {
  if (!existsSync(telegramWebhookStateFilePath)) {
    return { events: [], sessions: {} };
  }

  try {
    const raw = readFileSync(telegramWebhookStateFilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedTelegramWebhookState>;

    const sessionsSource =
      parsed.sessions && typeof parsed.sessions === "object"
        ? parsed.sessions
        : {};

    const sessions = Object.entries(sessionsSource).reduce<
      Record<string, TelegramSessionState>
    >((accumulator, [chatId, state]) => {
      if (!state || typeof state !== "object") {
        return accumulator;
      }

      const session = state as Partial<TelegramSessionState>;
      const normalizedChatId = String(session.chatId || chatId).trim();
      if (!normalizedChatId) {
        return accumulator;
      }

      accumulator[normalizedChatId] = {
        chatId: normalizedChatId,
        updatedAt:
          typeof session.updatedAt === "string"
            ? session.updatedAt
            : new Date(0).toISOString(),
        interactionCount:
          typeof session.interactionCount === "number" &&
          Number.isFinite(session.interactionCount)
            ? session.interactionCount
            : 0,
        lastUpdateType:
          typeof session.lastUpdateType === "string"
            ? session.lastUpdateType
            : "",
        lastCommand:
          typeof session.lastCommand === "string" ? session.lastCommand : "",
        lastCallbackData:
          typeof session.lastCallbackData === "string"
            ? session.lastCallbackData
            : "",
        lastText: typeof session.lastText === "string" ? session.lastText : "",
      };

      return accumulator;
    }, {});

    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      sessions,
    };
  } catch (error) {
    console.error("Failed to load persisted Telegram webhook state:", error);
    return { events: [], sessions: {} };
  }
}

function persistState() {
  try {
    mkdirSync(dirname(telegramWebhookStateFilePath), { recursive: true });
    writeFileSync(
      telegramWebhookStateFilePath,
      JSON.stringify(
        {
          events: webhookEvents,
          sessions: webhookSessions,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch (error) {
    console.error("Failed to persist Telegram webhook state:", error);
  }
}

export function parseTelegramUpdate(
  payload: unknown,
  botUsername: string,
): ParsedTelegramUpdate {
  if (!payload || typeof payload !== "object") {
    return {
      updateId: "",
      updateType: "unknown",
      chatId: "",
      chatType: "",
      fromId: "",
      messageId: "",
      text: "",
      command: "",
      callbackQueryId: "",
      callbackData: "",
    };
  }

  const asRecord = payload as {
    update_id?: unknown;
    message?: unknown;
    edited_message?: unknown;
    channel_post?: unknown;
    edited_channel_post?: unknown;
    callback_query?: unknown;
  };

  const callbackQuery =
    asRecord.callback_query && typeof asRecord.callback_query === "object"
      ? (asRecord.callback_query as {
          id?: unknown;
          data?: unknown;
          from?: { id?: unknown };
          message?: unknown;
        })
      : undefined;

  const callbackQueryMessage =
    callbackQuery?.message && typeof callbackQuery.message === "object"
      ? callbackQuery.message
      : undefined;

  const messageSource =
    asRecord.message ||
    asRecord.edited_message ||
    asRecord.channel_post ||
    asRecord.edited_channel_post ||
    callbackQueryMessage;

  const message =
    messageSource && typeof messageSource === "object"
      ? (messageSource as {
          text?: unknown;
          message_id?: unknown;
          chat?: { id?: unknown; type?: unknown };
          from?: { id?: unknown };
        })
      : undefined;

  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const updateId =
    typeof asRecord.update_id === "number" ||
    typeof asRecord.update_id === "string"
      ? String(asRecord.update_id)
      : "";

  const updateType = asRecord.message
    ? "message"
    : asRecord.edited_message
      ? "edited_message"
      : asRecord.channel_post
        ? "channel_post"
        : asRecord.edited_channel_post
          ? "edited_channel_post"
          : callbackQuery
            ? "callback_query"
            : "unknown";

  const chatId =
    typeof message?.chat?.id === "number" ||
    typeof message?.chat?.id === "string"
      ? String(message?.chat?.id)
      : "";

  const chatType =
    typeof message?.chat?.type === "string" ? message.chat.type : "";
  const fromSource = callbackQuery?.from?.id ?? message?.from?.id;
  const fromId =
    typeof fromSource === "number" || typeof fromSource === "string"
      ? String(fromSource)
      : "";

  const messageId =
    typeof message?.message_id === "number" ||
    typeof message?.message_id === "string"
      ? String(message.message_id)
      : "";

  const callbackQueryId =
    typeof callbackQuery?.id === "string" ? callbackQuery.id.trim() : "";

  const callbackData =
    typeof callbackQuery?.data === "string" ? callbackQuery.data.trim() : "";

  return {
    updateId,
    updateType,
    chatId,
    chatType,
    fromId,
    messageId,
    text,
    command: callbackQuery ? "" : extractCommand(text, botUsername),
    callbackQueryId,
    callbackData,
  };
}

function extractCommand(text: string, botUsername: string): string {
  const firstToken = text.trim().split(/\s+/)[0] || "";
  if (!firstToken.startsWith("/")) return "";

  const withoutSlash = firstToken.slice(1);
  if (!withoutSlash) return "";

  const [commandRaw, mentionRaw] = withoutSlash.split("@");
  if (!commandRaw) return "";

  const normalizedBot = botUsername.trim().replace(/^@/, "").toLowerCase();
  const mentionedBot = String(mentionRaw || "")
    .trim()
    .toLowerCase();

  if (mentionedBot && normalizedBot && mentionedBot !== normalizedBot) {
    return "";
  }

  return commandRaw.toLowerCase();
}

export function recordTelegramWebhookEvent(
  payload: unknown,
  update: ParsedTelegramUpdate,
): TelegramWebhookEvent {
  const event: TelegramWebhookEvent = {
    id: `tg-webhook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    receivedAt: new Date().toISOString(),
    update,
    payload,
  };

  webhookEvents.push(event);
  persistState();

  return event;
}

export function listTelegramWebhookEvents(): TelegramWebhookEvent[] {
  return webhookEvents.map((event) => ({
    ...event,
    update: { ...event.update },
  }));
}

interface TouchTelegramSessionInput {
  updateType?: string;
  command?: string;
  callbackData?: string;
  text?: string;
}

export function touchTelegramSession(
  chatId: string,
  input: TouchTelegramSessionInput = {},
): TelegramSessionState | null {
  const normalizedChatId = String(chatId || "").trim();
  if (!normalizedChatId) {
    return null;
  }

  const existing = webhookSessions[normalizedChatId];
  const next: TelegramSessionState = {
    chatId: normalizedChatId,
    updatedAt: new Date().toISOString(),
    interactionCount: (existing?.interactionCount || 0) + 1,
    lastUpdateType:
      String(input.updateType || "").trim() || existing?.lastUpdateType || "",
    lastCommand:
      String(input.command || "").trim() || existing?.lastCommand || "",
    lastCallbackData:
      String(input.callbackData || "").trim() ||
      existing?.lastCallbackData ||
      "",
    lastText: String(input.text || "").trim() || existing?.lastText || "",
  };

  webhookSessions[normalizedChatId] = next;
  persistState();

  return { ...next };
}

export function getTelegramSession(
  chatId: string,
): TelegramSessionState | null {
  const normalizedChatId = String(chatId || "").trim();
  if (!normalizedChatId) {
    return null;
  }

  const session = webhookSessions[normalizedChatId];
  return session ? { ...session } : null;
}

export function listTelegramSessions(): TelegramSessionState[] {
  return Object.values(webhookSessions)
    .map((session) => ({ ...session }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
