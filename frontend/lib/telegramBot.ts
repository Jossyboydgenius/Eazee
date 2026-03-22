import {
  isTelegramDestinationAllowed,
  isValidTelegramDestination,
  normalizeTelegramDestination,
  parseAllowedTelegramDestinations,
} from "@/lib/telegramDestination";
import { listTelegramBindings } from "@/lib/telegramIdentity";
import { listTelegramSessions } from "@/lib/telegramWebhook";
import { listWhatsAppJobs } from "@/lib/whatsappQueue";

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const telegramDefaultParseMode = process.env.TELEGRAM_PARSE_MODE?.trim() || "";
const telegramAllowedDestinationsRaw =
  process.env.TELEGRAM_ALLOWED_DESTINATIONS?.trim() || "";
const telegramAllowedDestinations = parseAllowedTelegramDestinations(
  telegramAllowedDestinationsRaw,
);
const telegramDynamicAllowlistCacheTtlMs = 60_000;

let telegramDestinationCache:
  | {
      expiresAt: number;
      allowlist: Set<string>;
      enforceAllowlist: boolean;
    }
  | undefined;

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: {
    url: string;
  };
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface SendTelegramTextInput {
  chatId: string;
  text: string;
  parseMode?: string;
  disableLinkPreview?: boolean;
  disableNotification?: boolean;
  replyMarkup?: TelegramInlineKeyboardMarkup;
}

export interface SendTelegramTextResult {
  ok: boolean;
  status: number;
  mode: "live" | "mock";
  messageId?: string;
  error?: string;
  data: unknown;
}

export interface TelegramBotApiResult {
  ok: boolean;
  status: number;
  mode: "live" | "mock";
  error?: string;
  data: unknown;
}

export interface AnswerTelegramCallbackQueryInput {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
  url?: string;
  cacheTime?: number;
}

export function isTelegramBotConfigured(): boolean {
  return Boolean(telegramBotToken);
}

export async function sendTelegramTextMessage(
  input: SendTelegramTextInput,
): Promise<SendTelegramTextResult> {
  const chatId = normalizeTelegramDestination(input.chatId);
  const text = String(input.text || "").trim();

  if (!chatId || !text) {
    return {
      ok: false,
      status: 400,
      mode: "mock",
      error: "Missing valid Telegram chat_id or text body",
      data: null,
    };
  }

  if (!isValidTelegramDestination(chatId)) {
    return {
      ok: false,
      status: 400,
      mode: "mock",
      error:
        "Invalid Telegram destination. Use numeric chat_id (example: -1001234567890) or @username.",
      data: null,
    };
  }

  const destinationPolicy = await resolveTelegramDestinationPolicy();

  if (
    destinationPolicy.enforceAllowlist &&
    !isTelegramDestinationAllowed(chatId, destinationPolicy.allowlist)
  ) {
    return {
      ok: false,
      status: 403,
      mode: "mock",
      error:
        "Telegram destination is not permitted. Link the chat/group first or add it to TELEGRAM_ALLOWED_DESTINATIONS.",
      data: {
        chatId,
        knownDestinationCount: destinationPolicy.allowlist.size,
      },
    };
  }

  if (!isTelegramBotConfigured()) {
    return {
      ok: true,
      status: 200,
      mode: "mock",
      messageId: createMockMessageId(),
      data: {
        warning:
          "Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN for live dispatch.",
      },
    };
  }

  const endpoint = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
  const parseMode = (input.parseMode || telegramDefaultParseMode).trim();

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (parseMode) {
    payload.parse_mode = parseMode;
  }

  if (input.disableLinkPreview === true) {
    payload.link_preview_options = { is_disabled: true };
  }

  if (input.disableNotification === true) {
    payload.disable_notification = true;
  }

  if (input.replyMarkup) {
    payload.reply_markup = input.replyMarkup;
  }

  const response = await callTelegramBotApi("sendMessage", payload);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      mode: response.mode,
      error: response.error,
      data: response.data,
    };
  }

  return {
    ok: true,
    status: response.status,
    mode: response.mode,
    messageId: getTelegramMessageId(response.data),
    data: response.data,
  };
}

export async function answerTelegramCallbackQuery(
  input: AnswerTelegramCallbackQueryInput,
): Promise<TelegramBotApiResult> {
  const callbackQueryId = String(input.callbackQueryId || "").trim();

  if (!callbackQueryId) {
    return {
      ok: false,
      status: 400,
      mode: "mock",
      error: "Missing callback_query_id",
      data: null,
    };
  }

  if (!isTelegramBotConfigured()) {
    return {
      ok: true,
      status: 200,
      mode: "mock",
      data: {
        warning:
          "Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN for live callback acknowledgements.",
      },
    };
  }

  const payload: Record<string, unknown> = {
    callback_query_id: callbackQueryId,
  };

  const text = String(input.text || "").trim();
  if (text) {
    payload.text = text;
  }

  if (input.showAlert === true) {
    payload.show_alert = true;
  }

  const url = String(input.url || "").trim();
  if (url) {
    payload.url = url;
  }

  if (typeof input.cacheTime === "number" && Number.isFinite(input.cacheTime)) {
    payload.cache_time = Math.max(0, Math.floor(input.cacheTime));
  }

  return callTelegramBotApi("answerCallbackQuery", payload);
}

async function callTelegramBotApi(
  method: string,
  payload: Record<string, unknown>,
): Promise<TelegramBotApiResult> {
  const endpoint = `https://api.telegram.org/bot${telegramBotToken}/${method}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await safeParseJson(response);

  if (!response.ok || !isTelegramApiSuccess(data)) {
    return {
      ok: false,
      status: response.status || 502,
      mode: "live",
      error:
        getTelegramApiErrorDescription(data) ||
        `Telegram Bot API ${method} failed`,
      data,
    };
  }

  return {
    ok: true,
    status: response.status,
    mode: "live",
    data,
  };
}

function createMockMessageId(): string {
  return `tg.mock.${Date.now()}`;
}

async function safeParseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function isTelegramApiSuccess(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }

  return (data as { ok?: unknown }).ok === true;
}

function getTelegramMessageId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const result = (data as { result?: { message_id?: unknown } }).result;
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const messageId = result.message_id;
  if (typeof messageId === "number") {
    return String(messageId);
  }

  if (typeof messageId === "string") {
    return messageId;
  }

  return undefined;
}

function getTelegramApiErrorDescription(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const description = (data as { description?: unknown }).description;
  if (typeof description === "string") {
    return description;
  }

  return "";
}

async function resolveTelegramDestinationPolicy(): Promise<{
  enforceAllowlist: boolean;
  allowlist: Set<string>;
}> {
  const now = Date.now();
  if (telegramDestinationCache && telegramDestinationCache.expiresAt > now) {
    return {
      enforceAllowlist: telegramDestinationCache.enforceAllowlist,
      allowlist: new Set(telegramDestinationCache.allowlist),
    };
  }

  const resolvedAllowlist = new Set<string>(telegramAllowedDestinations);
  const normalized = (value: string) => normalizeTelegramDestination(value);

  try {
    const [bindingsResult, jobsResult] = await Promise.allSettled([
      listTelegramBindings(500),
      listWhatsAppJobs(),
    ]);

    if (bindingsResult.status === "fulfilled") {
      for (const binding of bindingsResult.value) {
        const destination = normalized(binding.chatId);
        if (destination && isValidTelegramDestination(destination)) {
          resolvedAllowlist.add(destination);
        }
      }
    }

    if (jobsResult.status === "fulfilled") {
      for (const job of jobsResult.value) {
        const ownerChatDestination = normalized(job.ownerChatId || "");
        if (
          ownerChatDestination &&
          isValidTelegramDestination(ownerChatDestination)
        ) {
          resolvedAllowlist.add(ownerChatDestination);
        }

        for (const target of job.targets || []) {
          const targetDestination = normalized(target.recipient || "");
          if (
            targetDestination &&
            isValidTelegramDestination(targetDestination)
          ) {
            resolvedAllowlist.add(targetDestination);
          }
        }
      }
    }
  } catch {
    // Fall through to static env list when dynamic discovery fails.
  }

  for (const session of listTelegramSessions()) {
    const destination = normalized(session.chatId);
    if (destination && isValidTelegramDestination(destination)) {
      resolvedAllowlist.add(destination);
    }
  }

  const shouldEnforceAllowlist = resolvedAllowlist.size > 0;

  telegramDestinationCache = {
    expiresAt: now + telegramDynamicAllowlistCacheTtlMs,
    allowlist: new Set(resolvedAllowlist),
    enforceAllowlist: shouldEnforceAllowlist,
  };

  return {
    enforceAllowlist: shouldEnforceAllowlist,
    allowlist: resolvedAllowlist,
  };
}
