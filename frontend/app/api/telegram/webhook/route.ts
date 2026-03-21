import { NextResponse } from "next/server";
import {
  answerTelegramCallbackQuery,
  isTelegramBotConfigured,
  type TelegramInlineKeyboardMarkup,
  sendTelegramTextMessage,
} from "@/lib/telegramBot";
import {
  getTelegramSession,
  listTelegramWebhookEvents,
  listTelegramSessions,
  parseTelegramUpdate,
  recordTelegramWebhookEvent,
  touchTelegramSession,
} from "@/lib/telegramWebhook";

export const runtime = "nodejs";

const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME?.trim() || "";
const telegramMiniAppUrl =
  process.env.TELEGRAM_MINI_APP_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "";

type CommandName = "start" | "create" | "dashboard" | "help" | "status";

const SUPPORTED_COMMANDS: CommandName[] = [
  "start",
  "create",
  "dashboard",
  "help",
  "status",
];

function logTelegramWebhook(
  level: "info" | "warn" | "error",
  message: string,
  details?: Record<string, unknown>,
) {
  const logger =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  logger(
    `[telegram-webhook] ${message}`,
    details && Object.keys(details).length > 0 ? details : "",
  );
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function createMainMenuKeyboard(): TelegramInlineKeyboardMarkup {
  const inlineKeyboard: TelegramInlineKeyboardMarkup["inline_keyboard"] = [
    [
      { text: "🧩 Create Post", callback_data: "nav:create" },
      { text: "📊 Dashboard", callback_data: "nav:dashboard" },
    ],
    [{ text: "❓ Help", callback_data: "nav:help" }],
  ];

  if (isValidHttpsUrl(telegramMiniAppUrl)) {
    inlineKeyboard.push([
      {
        text: "🚀 Open Eazee Mini App",
        web_app: { url: telegramMiniAppUrl },
      },
    ]);
  }

  return {
    inline_keyboard: inlineKeyboard,
  };
}

function createDashboardKeyboard(): TelegramInlineKeyboardMarkup {
  const inlineKeyboard: TelegramInlineKeyboardMarkup["inline_keyboard"] = [
    [{ text: "⬅️ Back to Menu", callback_data: "nav:start" }],
  ];

  if (isValidHttpsUrl(telegramMiniAppUrl)) {
    inlineKeyboard.unshift([
      {
        text: "📈 Open Dashboard",
        web_app: { url: telegramMiniAppUrl },
      },
    ]);
  }

  return {
    inline_keyboard: inlineKeyboard,
  };
}

function getCommandFromCallbackData(callbackData: string): CommandName | null {
  const normalized = String(callbackData || "")
    .trim()
    .toLowerCase();
  if (normalized === "nav:start") return "start";
  if (normalized === "nav:create") return "create";
  if (normalized === "nav:dashboard") return "dashboard";
  if (normalized === "nav:help") return "help";
  return null;
}

function isAuthorizedWebhookRequest(request: Request): boolean {
  if (!telegramWebhookSecret) {
    return true;
  }

  const requestSecret =
    request.headers.get("x-telegram-bot-api-secret-token")?.trim() || "";

  return requestSecret === telegramWebhookSecret;
}

async function handleInboundCommand(
  command: string,
  chatId: string,
): Promise<{
  handled: boolean;
  replyMode: "live" | "mock" | "none";
  error?: string;
  action?: string;
}> {
  if (!command || !chatId) {
    return {
      handled: false,
      replyMode: "none",
    };
  }

  const normalizedCommand = String(command).trim().toLowerCase() as CommandName;
  if (!SUPPORTED_COMMANDS.includes(normalizedCommand)) {
    return {
      handled: false,
      replyMode: "none",
    };
  }

  let replyText = "";
  let replyMarkup: TelegramInlineKeyboardMarkup | undefined;

  if (normalizedCommand === "start") {
    replyText =
      "✅ Eazee bot is active. Use the buttons below to create content, open your dashboard, or get help instantly.";
    replyMarkup = createMainMenuKeyboard();
  } else if (normalizedCommand === "create") {
    replyText = [
      "🧩 Create flow",
      "1) Open the Eazee Mini App",
      "2) Go to Compose",
      "3) Add product details, generate caption, and schedule",
      "",
      "Tip: use /dashboard to track posts and payments.",
    ].join("\n");
    replyMarkup = createMainMenuKeyboard();
  } else if (normalizedCommand === "dashboard") {
    replyText =
      "📊 Dashboard quick access: open your Eazee dashboard to monitor scheduled posts, deliveries, and wallet activity.";
    replyMarkup = createDashboardKeyboard();
  } else if (normalizedCommand === "help") {
    replyText = [
      "Eazee Telegram Bot Commands:",
      "/start - Verify the bot is active",
      "/create - Open content creation flow",
      "/dashboard - Open dashboard actions",
      "/help - Show available commands",
      "/status - Show bot + webhook status",
      "",
      "Use the inline menu buttons for quick navigation.",
    ].join("\n");
    replyMarkup = createMainMenuKeyboard();
  } else if (normalizedCommand === "status") {
    const provider = process.env.EAZEE_MESSAGING_PROVIDER?.trim() || "whatsapp";
    const configured = isTelegramBotConfigured()
      ? "configured"
      : "not configured";
    const session = getTelegramSession(chatId);
    replyText = [
      `Provider: ${provider}`,
      `Bot token: ${configured}`,
      "Webhook: enabled at /api/telegram/webhook",
      `Session interactions: ${session?.interactionCount || 0}`,
      `Last command: ${session?.lastCommand || "(none)"}`,
    ].join("\n");
  }

  const sendResult = await sendTelegramTextMessage({
    chatId,
    text: replyText,
    disableLinkPreview: true,
    replyMarkup,
  });

  if (!sendResult.ok) {
    return {
      handled: true,
      replyMode: sendResult.mode,
      error: sendResult.error || "Failed to send command response",
    };
  }

  return {
    handled: true,
    replyMode: sendResult.mode,
    action: normalizedCommand,
  };
}

async function handleCallbackQuery(input: {
  callbackQueryId: string;
  callbackData: string;
  chatId: string;
}): Promise<{
  handled: boolean;
  replyMode: "live" | "mock" | "none";
  error?: string;
  action?: string;
}> {
  if (!input.callbackQueryId) {
    return {
      handled: false,
      replyMode: "none",
    };
  }

  const mappedCommand = getCommandFromCallbackData(input.callbackData);

  const callbackAck = await answerTelegramCallbackQuery({
    callbackQueryId: input.callbackQueryId,
    text: mappedCommand ? "Opening..." : "Action received",
    cacheTime: 1,
  });

  if (!callbackAck.ok) {
    return {
      handled: true,
      replyMode: callbackAck.mode,
      error: callbackAck.error || "Failed to acknowledge callback query",
      action: "callback_ack_failed",
    };
  }

  if (!mappedCommand) {
    return {
      handled: true,
      replyMode: callbackAck.mode,
      action: "callback_ack",
    };
  }

  const commandResult = await handleInboundCommand(mappedCommand, input.chatId);
  if (!commandResult.handled) {
    return {
      handled: true,
      replyMode: callbackAck.mode,
      action: "callback_only",
    };
  }

  return {
    ...commandResult,
    handled: true,
    action: `callback:${mappedCommand}`,
  };
}

export async function GET() {
  const events = listTelegramWebhookEvents();
  const sessions = listTelegramSessions();

  return NextResponse.json({
    configured: isTelegramBotConfigured(),
    endpoint: "POST /api/telegram/webhook",
    requiresSecretHeader: Boolean(telegramWebhookSecret),
    expectedSecretHeaderName: "X-Telegram-Bot-Api-Secret-Token",
    botUsername: telegramBotUsername || null,
    miniAppUrl: isValidHttpsUrl(telegramMiniAppUrl) ? telegramMiniAppUrl : null,
    supportedCommands: SUPPORTED_COMMANDS.map((command) => `/${command}`),
    supportsInlineKeyboard: true,
    supportsCallbackQueries: true,
    supportsSessions: true,
    receivedEvents: events.length,
    activeSessions: sessions.length,
    note: "Set this URL via Telegram setWebhook for inbound updates.",
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedWebhookRequest(request)) {
    return NextResponse.json(
      {
        error:
          "Unauthorized webhook request. Invalid X-Telegram-Bot-Api-Secret-Token header.",
      },
      { status: 401 },
    );
  }

  try {
    const payload = await request.json();
    const parsedUpdate = parseTelegramUpdate(payload, telegramBotUsername);
    const event = recordTelegramWebhookEvent(payload, parsedUpdate);
    const session = touchTelegramSession(parsedUpdate.chatId, {
      updateType: parsedUpdate.updateType,
      command: parsedUpdate.command,
      callbackData: parsedUpdate.callbackData,
      text: parsedUpdate.text,
    });

    logTelegramWebhook("info", "Inbound update received", {
      eventId: event.id,
      updateType: parsedUpdate.updateType,
      command: parsedUpdate.command || null,
      callbackData: parsedUpdate.callbackData || null,
      chatId: parsedUpdate.chatId || null,
    });

    const commandResult = parsedUpdate.callbackQueryId
      ? await handleCallbackQuery({
          callbackQueryId: parsedUpdate.callbackQueryId,
          callbackData: parsedUpdate.callbackData,
          chatId: parsedUpdate.chatId,
        })
      : await handleInboundCommand(parsedUpdate.command, parsedUpdate.chatId);

    if (commandResult.error) {
      logTelegramWebhook("warn", "Handled update with recoverable error", {
        eventId: event.id,
        error: commandResult.error,
      });
    }

    return NextResponse.json({
      received: true,
      eventId: event.id,
      updateId: parsedUpdate.updateId || null,
      updateType: parsedUpdate.updateType,
      chatId: parsedUpdate.chatId || null,
      command: parsedUpdate.command || null,
      callbackData: parsedUpdate.callbackData || null,
      callbackQueryId: parsedUpdate.callbackQueryId || null,
      commandHandled: commandResult.handled,
      handledAction: commandResult.action || null,
      replyMode: commandResult.replyMode,
      replyError: commandResult.error || null,
      session: session
        ? {
            chatId: session.chatId,
            interactionCount: session.interactionCount,
            updatedAt: session.updatedAt,
            lastCommand: session.lastCommand || null,
            lastCallbackData: session.lastCallbackData || null,
          }
        : null,
    });
  } catch (error) {
    logTelegramWebhook("error", "Telegram webhook ingest error", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Invalid webhook payload" },
      { status: 400 },
    );
  }
}
