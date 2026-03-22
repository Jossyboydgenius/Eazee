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
import {
  confirmTelegramBindingToken,
  getTelegramBindingByChatId,
} from "@/lib/telegramIdentity";
import {
  listDispatchReceiptsByOwner,
  listWhatsAppJobsByOwner,
} from "@/lib/whatsappQueue";
import { listPaymentsByOwner } from "@/lib/payments";

export const runtime = "nodejs";

const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME?.trim() || "";
const telegramMiniAppUrl =
  process.env.TELEGRAM_MINI_APP_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "";

type CommandName = "start" | "create" | "dashboard" | "help" | "status";

const EXTRA_SUPPORTED_COMMANDS = ["/link <token>"];

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
  const createPostUrl = buildMiniAppUrl("/compose");
  const dashboardUrl = buildMiniAppUrl("/dashboard");

  const inlineKeyboard: TelegramInlineKeyboardMarkup["inline_keyboard"] = [
    [
      createPostUrl
        ? { text: "🧩 Create Post", web_app: { url: createPostUrl } }
        : { text: "🧩 Create Post", callback_data: "nav:create" },
      dashboardUrl
        ? { text: "📊 Dashboard", web_app: { url: dashboardUrl } }
        : { text: "📊 Dashboard", callback_data: "nav:dashboard" },
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

  const dashboardUrl = buildMiniAppUrl("/dashboard");
  if (dashboardUrl) {
    inlineKeyboard.unshift([
      {
        text: "📈 Open Dashboard",
        web_app: { url: dashboardUrl },
      },
    ]);
  }

  return {
    inline_keyboard: inlineKeyboard,
  };
}

function createLinkWalletKeyboard(): TelegramInlineKeyboardMarkup {
  const inlineKeyboard: TelegramInlineKeyboardMarkup["inline_keyboard"] = [
    [{ text: "🏠 Main Menu", callback_data: "nav:start" }],
  ];

  const appUrl = buildMiniAppUrl("/");
  if (appUrl) {
    inlineKeyboard.unshift([
      { text: "🚀 Open Eazee App", web_app: { url: appUrl } },
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

function buildMiniAppUrl(pathname = "/"): string | null {
  if (!isValidHttpsUrl(telegramMiniAppUrl)) {
    return null;
  }

  try {
    const baseUrl = new URL(telegramMiniAppUrl);
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return new URL(path, baseUrl).toString();
  } catch {
    return null;
  }
}

function formatTxHash(txHash: string): string {
  const value = String(txHash || "").trim();
  if (!value) {
    return "-";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

async function buildDashboardSummaryText(chatId: string): Promise<string> {
  const binding = await getTelegramBindingByChatId(chatId);
  if (!binding?.walletAddress) {
    return [
      "📊 Dashboard",
      "Link your wallet first to view schedules, payments, and transactions.",
      "",
      "Steps:",
      "1) From Eazee app, request Telegram bind token",
      "2) Run /link <token> in this chat",
      "3) Run /dashboard again",
    ].join("\n");
  }

  const [jobs, receipts, payments] = await Promise.all([
    listWhatsAppJobsByOwner({
      chatId,
      walletAddress: binding.walletAddress,
      limit: 5,
    }),
    listDispatchReceiptsByOwner({
      chatId,
      walletAddress: binding.walletAddress,
      limit: 5,
    }),
    listPaymentsByOwner({
      ownerWalletAddress: binding.walletAddress,
      limit: 5,
    }),
  ]);

  const statusSummary = jobs.reduce(
    (accumulator, job) => {
      if (job.status === "queued") accumulator.queued += 1;
      if (job.status === "processing") accumulator.processing += 1;
      if (job.status === "sent") accumulator.sent += 1;
      if (job.status === "failed") accumulator.failed += 1;
      return accumulator;
    },
    { queued: 0, processing: 0, sent: 0, failed: 0 },
  );

  const recentScheduleLines = jobs.slice(0, 3).map((job, index) => {
    const scheduleTime = new Date(job.scheduledFor).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return `${index + 1}. ${job.postType || "post"} • ${job.status} • ${scheduleTime}`;
  });

  const recentPaymentLines = payments.slice(0, 3).map((payment, index) => {
    return `${index + 1}. ${payment.amount} ${payment.currency} • ${payment.productName || "payment"} • ${formatTxHash(payment.txHash)}`;
  });

  const receiptSentCount = receipts.filter(
    (receipt) => receipt.status === "sent",
  ).length;
  const receiptFailedCount = receipts.filter(
    (receipt) => receipt.status === "failed",
  ).length;

  return [
    "📊 Dashboard summary",
    `Wallet: ${binding.walletAddress}`,
    "",
    "Schedules:",
    `- Queued: ${statusSummary.queued}`,
    `- Processing: ${statusSummary.processing}`,
    `- Sent: ${statusSummary.sent}`,
    `- Failed: ${statusSummary.failed}`,
    ...(recentScheduleLines.length > 0
      ? ["Recent schedules:", ...recentScheduleLines]
      : ["Recent schedules: none yet"]),
    "",
    "Payments:",
    `- Recent records: ${payments.length}`,
    ...(recentPaymentLines.length > 0
      ? ["Recent transactions:", ...recentPaymentLines]
      : ["Recent transactions: none yet"]),
    "",
    "Delivery receipts:",
    `- Sent: ${receiptSentCount}`,
    `- Failed: ${receiptFailedCount}`,
    "",
    "Use the Dashboard button to open full details in mini app.",
  ].join("\n");
}

function isAuthorizedWebhookRequest(request: Request): boolean {
  if (!telegramWebhookSecret) {
    return true;
  }

  const requestSecret =
    request.headers.get("x-telegram-bot-api-secret-token")?.trim() || "";

  return requestSecret === telegramWebhookSecret;
}

function extractLinkTokenFromText(text: string): string {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }

  const tokens = normalized.split(/\s+/);
  if (tokens.length < 2) {
    return "";
  }

  const commandToken = String(tokens[0] || "")
    .trim()
    .toLowerCase();

  if (!commandToken.startsWith("/link")) {
    return "";
  }

  return String(tokens[1] || "").trim();
}

async function handleInboundCommand(
  command: string,
  chatId: string,
  text = "",
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
    const deepLinkToken = extractBindTokenFromStartPayload(text);

    if (deepLinkToken) {
      const confirmation = await confirmTelegramBindingToken({
        token: deepLinkToken,
        chatId,
      });

      replyText = confirmation.ok
        ? [
            "✅ Wallet linked successfully.",
            `Wallet: ${confirmation.binding.walletAddress}`,
            "You can now schedule and track posts from this Telegram chat.",
          ].join("\n")
        : [
            "❌ Could not link wallet from this start link.",
            confirmation.error,
            "Open Eazee app, request a new token, then run /link <token>.",
          ].join("\n");

      replyMarkup = createMainMenuKeyboard();
    } else {
      replyText =
        "✅ Eazee bot is active. Use the buttons below to create content, open your dashboard, or get help instantly.";
      replyMarkup = createMainMenuKeyboard();
    }
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
    replyText = await buildDashboardSummaryText(chatId);
    replyMarkup = createDashboardKeyboard();
  } else if (normalizedCommand === "help") {
    replyText = [
      "Eazee Telegram Bot Commands:",
      "/start - Verify the bot is active",
      "/start bind_<token> - Link wallet directly from app button",
      "/link <token> - Link wallet using token from app",
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
    const binding = await getTelegramBindingByChatId(chatId);
    replyText = [
      `Provider: ${provider}`,
      `Bot token: ${configured}`,
      "Webhook: enabled at /api/telegram/webhook",
      `Session interactions: ${session?.interactionCount || 0}`,
      `Last command: ${session?.lastCommand || "(none)"}`,
      `Wallet binding: ${binding?.walletAddress || "(not linked)"}`,
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
      action: `${normalizedCommand}:send_failed`,
    };
  }

  return {
    handled: true,
    replyMode: sendResult.mode,
    action: normalizedCommand,
  };
}

function extractBindTokenFromStartPayload(text: string): string {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }

  const tokens = normalized.split(/\s+/);
  if (tokens.length < 2) {
    return "";
  }

  const commandToken = String(tokens[0] || "")
    .trim()
    .toLowerCase();

  if (!commandToken.startsWith("/start")) {
    return "";
  }

  const payloadToken = String(tokens[1] || "").trim();
  if (!payloadToken.startsWith("bind_")) {
    return "";
  }

  return payloadToken.slice("bind_".length).trim();
}

async function handleBindCommand(
  text: string,
  chatId: string,
): Promise<{
  handled: boolean;
  replyMode: "live" | "mock" | "none";
  error?: string;
  action?: string;
}> {
  const normalizedChatId = String(chatId || "").trim();
  if (!normalizedChatId) {
    return {
      handled: false,
      replyMode: "none",
    };
  }

  const token = extractLinkTokenFromText(text);
  if (!token) {
    const usageResult = await sendTelegramTextMessage({
      chatId: normalizedChatId,
      text: [
        "🔗 Link Your Wallet",
        "",
        "To link your wallet to this Telegram account:",
        "1) Open Eazee web app",
        "2) Connect your wallet",
        "3) Go to Settings → Link Telegram",
        `4) Enter your Telegram ID: ${normalizedChatId}`,
        "",
        "Once linked, you'll be able to:",
        "✅ View your intents in Telegram",
        "✅ Manage payments directly from here",
        "✅ Receive instant notifications",
        "✅ Quick actions without opening the app",
        "",
        "After requesting your bind token in the app, confirm here with:",
        "/link <token>",
      ].join("\n"),
      disableLinkPreview: true,
      replyMarkup: createLinkWalletKeyboard(),
    });

    if (!usageResult.ok) {
      return {
        handled: true,
        replyMode: usageResult.mode,
        error: usageResult.error || "Failed to send link usage response",
        action: "link_usage_send_failed",
      };
    }

    return {
      handled: true,
      replyMode: usageResult.mode,
      action: "link_usage",
    };
  }

  const confirmation = await confirmTelegramBindingToken({
    token,
    chatId: normalizedChatId,
  });

  const replyText = confirmation.ok
    ? [
        "✅ Wallet linked successfully.",
        `Wallet: ${confirmation.binding.walletAddress}`,
        "You can now schedule and track posts from this Telegram chat.",
      ].join("\n")
    : [
        "❌ Could not link wallet.",
        confirmation.error,
        "Generate a new token and retry /link <token>.",
      ].join("\n");

  const sendResult = await sendTelegramTextMessage({
    chatId: normalizedChatId,
    text: replyText,
    disableLinkPreview: true,
    replyMarkup: createMainMenuKeyboard(),
  });

  if (!sendResult.ok) {
    return {
      handled: true,
      replyMode: sendResult.mode,
      error: sendResult.error || "Failed to send link confirmation response",
      action: confirmation.ok
        ? "link_confirm_send_failed"
        : "link_reject_send_failed",
    };
  }

  return {
    handled: true,
    replyMode: sendResult.mode,
    action: confirmation.ok ? "link_confirmed" : "link_rejected",
    error: confirmation.ok ? undefined : confirmation.error,
  };
}

async function handleInboundTextFallback(
  text: string,
  chatId: string,
): Promise<{
  handled: boolean;
  replyMode: "live" | "mock" | "none";
  error?: string;
  action?: string;
}> {
  const normalizedText = String(text || "").trim();
  const normalizedChatId = String(chatId || "").trim();

  if (!normalizedText || !normalizedChatId) {
    return {
      handled: false,
      replyMode: "none",
    };
  }

  const sendResult = await sendTelegramTextMessage({
    chatId: normalizedChatId,
    text: [
      "👋 I’m here.",
      "Use /start for the main menu or /help to see all commands.",
    ].join("\n"),
    disableLinkPreview: true,
    replyMarkup: createMainMenuKeyboard(),
  });

  if (!sendResult.ok) {
    return {
      handled: true,
      replyMode: sendResult.mode,
      error: sendResult.error || "Failed to send fallback response",
      action: "fallback_reply_failed",
    };
  }

  return {
    handled: true,
    replyMode: sendResult.mode,
    action: "fallback_reply",
  };
}

async function handleUnsupportedCommand(
  command: string,
  chatId: string,
): Promise<{
  handled: boolean;
  replyMode: "live" | "mock" | "none";
  error?: string;
  action?: string;
}> {
  const normalizedCommand = String(command || "")
    .trim()
    .toLowerCase();
  const normalizedChatId = String(chatId || "").trim();

  if (!normalizedCommand || !normalizedChatId) {
    return {
      handled: false,
      replyMode: "none",
    };
  }

  const sendResult = await sendTelegramTextMessage({
    chatId: normalizedChatId,
    text: [
      `Unknown command: /${normalizedCommand}`,
      "Use /help to view available commands.",
    ].join("\n"),
    disableLinkPreview: true,
    replyMarkup: createMainMenuKeyboard(),
  });

  if (!sendResult.ok) {
    return {
      handled: true,
      replyMode: sendResult.mode,
      error: sendResult.error || "Failed to send unsupported command response",
      action: "unsupported_command_reply_failed",
    };
  }

  return {
    handled: true,
    replyMode: sendResult.mode,
    action: `unsupported_command:${normalizedCommand}`,
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
    supportedCommands: [
      ...SUPPORTED_COMMANDS.map((command) => `/${command}`),
      ...EXTRA_SUPPORTED_COMMANDS,
    ],
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
    logTelegramWebhook("warn", "Rejected webhook request with invalid secret");

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

    let commandResult = parsedUpdate.callbackQueryId
      ? await handleCallbackQuery({
          callbackQueryId: parsedUpdate.callbackQueryId,
          callbackData: parsedUpdate.callbackData,
          chatId: parsedUpdate.chatId,
        })
      : parsedUpdate.command === "link"
        ? await handleBindCommand(parsedUpdate.text, parsedUpdate.chatId)
        : parsedUpdate.command
          ? await handleInboundCommand(
              parsedUpdate.command,
              parsedUpdate.chatId,
              parsedUpdate.text,
            )
          : await handleInboundTextFallback(
              parsedUpdate.text,
              parsedUpdate.chatId,
            );

    if (parsedUpdate.command && !commandResult.handled) {
      commandResult = await handleUnsupportedCommand(
        parsedUpdate.command,
        parsedUpdate.chatId,
      );
    }

    logTelegramWebhook("info", "Update processed", {
      eventId: event.id,
      handledAction: commandResult.action || null,
      replyMode: commandResult.replyMode,
      replyError: commandResult.error || null,
      commandHandled: commandResult.handled,
    });

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
