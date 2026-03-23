import { NextResponse } from "next/server";
import {
  answerTelegramCallbackQuery,
  isTelegramBotConfigured,
  type TelegramInlineKeyboardButton,
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
  revokeTelegramBindingByChatId,
} from "@/lib/telegramIdentity";
import {
  getWhatsAppJobById,
  listDispatchReceiptsByOwner,
  scheduleQueuedJobForImmediateDispatch,
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

type CommandName =
  | "start"
  | "link"
  | "unbind"
  | "create"
  | "dashboard"
  | "schedules"
  | "postnow"
  | "help"
  | "status";

type DashboardSection =
  | "menu"
  | "summary"
  | "schedules"
  | "payments"
  | "receipts";
type PostNowMode = "saved" | "telegram";

type CallbackAction =
  | { type: "command"; command: CommandName }
  | { type: "dashboard"; section: DashboardSection }
  | { type: "schedules"; page: number }
  | { type: "post_now_pick"; jobId: string }
  | { type: "post_now_run"; mode: PostNowMode; jobId: string }
  | { type: "none" };

const EXTRA_SUPPORTED_COMMANDS = [
  "/start_bind_<token>",
  "/link <token>",
  "/postnow <jobId>",
  "/unbind",
];

const SUPPORTED_COMMANDS: CommandName[] = [
  "start",
  "link",
  "unbind",
  "create",
  "dashboard",
  "schedules",
  "postnow",
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

  const inlineKeyboard: TelegramInlineKeyboardMarkup["inline_keyboard"] = [
    [
      createPostUrl
        ? { text: "🧩 Create Post", web_app: { url: createPostUrl } }
        : { text: "🧩 Create Post", callback_data: "nav:create" },
      { text: "📊 Dashboard", callback_data: "dash:menu" },
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
  const miniAppDashboardUrl = buildMiniAppUrl("/dashboard");
  const inlineKeyboard: TelegramInlineKeyboardMarkup["inline_keyboard"] = [
    [
      { text: "📅 Schedules", callback_data: "dash:schedules:1" },
      { text: "💳 Payments", callback_data: "dash:payments" },
    ],
    [
      { text: "📬 Receipts", callback_data: "dash:receipts" },
      { text: "🧾 Summary", callback_data: "dash:summary" },
    ],
    [{ text: "⬅️ Back to Menu", callback_data: "nav:start" }],
  ];

  if (miniAppDashboardUrl) {
    inlineKeyboard.unshift([
      {
        text: "📈 Open Dashboard",
        web_app: { url: miniAppDashboardUrl },
      },
    ]);
  }

  return {
    inline_keyboard: inlineKeyboard,
  };
}

function createSchedulesKeyboard(input: {
  jobs: Awaited<ReturnType<typeof listWhatsAppJobsByOwner>>;
  page: number;
  totalPages: number;
  startIndex: number;
}): TelegramInlineKeyboardMarkup {
  const inlineKeyboard: TelegramInlineKeyboardMarkup["inline_keyboard"] = [];

  const actionableJobs = input.jobs.filter((job) => job.status === "queued");

  for (const [index, job] of actionableJobs.entries()) {
    const rowNumber = input.startIndex + index + 1;
    const reference = createPublicJobReference(job.id);
    inlineKeyboard.push([
      {
        text: `⚡ Post now #${rowNumber} (${reference})`,
        callback_data: `post:pick:${job.id}`,
      },
    ]);
  }

  const paginationRow: TelegramInlineKeyboardButton[] = [];
  if (input.page > 1) {
    paginationRow.push({
      text: "⬅️ Prev",
      callback_data: `dash:schedules:${input.page - 1}`,
    });
  }
  if (input.page < input.totalPages) {
    paginationRow.push({
      text: "Next ➡️",
      callback_data: `dash:schedules:${input.page + 1}`,
    });
  }
  if (paginationRow.length > 0) {
    inlineKeyboard.push(paginationRow);
  }

  inlineKeyboard.push([
    { text: "📊 Dashboard", callback_data: "dash:menu" },
    { text: "🏠 Main Menu", callback_data: "nav:start" },
  ]);

  return {
    inline_keyboard: inlineKeyboard,
  };
}

function createPostNowActionKeyboard(input: {
  jobId: string;
  whatsappShareUrl: string;
}): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "🚀 Send now (saved targets)",
          callback_data: `post:run:s:${input.jobId}`,
        },
      ],
      [
        {
          text: "📤 Send copy to this chat",
          callback_data: `post:run:t:${input.jobId}`,
        },
      ],
      [
        {
          text: "📲 Share to WhatsApp",
          url: input.whatsappShareUrl,
        },
      ],
      [{ text: "📅 Back to Schedules", callback_data: "dash:schedules:1" }],
    ],
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

function parseCallbackAction(callbackData: string): CallbackAction {
  const normalized = String(callbackData || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return { type: "none" };
  }

  if (normalized === "nav:start") return { type: "command", command: "start" };
  if (normalized === "nav:create")
    return { type: "command", command: "create" };
  if (normalized === "nav:dashboard") {
    return { type: "command", command: "dashboard" };
  }
  if (normalized === "nav:schedules") {
    return { type: "command", command: "schedules" };
  }
  if (normalized === "nav:help") return { type: "command", command: "help" };

  if (normalized === "dash:menu") {
    return { type: "dashboard", section: "menu" };
  }
  if (normalized === "dash:summary") {
    return { type: "dashboard", section: "summary" };
  }
  if (normalized === "dash:payments") {
    return { type: "dashboard", section: "payments" };
  }
  if (normalized === "dash:receipts") {
    return { type: "dashboard", section: "receipts" };
  }

  if (normalized.startsWith("dash:schedules:")) {
    const pageRaw = normalized.slice("dash:schedules:".length).trim();
    const parsed = Number.parseInt(pageRaw || "1", 10);
    return {
      type: "schedules",
      page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
    };
  }

  if (normalized.startsWith("post:pick:")) {
    const jobId = normalized.slice("post:pick:".length).trim();
    if (jobId) {
      return { type: "post_now_pick", jobId };
    }
  }

  if (normalized.startsWith("post:run:")) {
    const payload = normalized.slice("post:run:".length).trim();
    const [modeRaw, ...jobIdParts] = payload.split(":");
    const mode =
      modeRaw === "t" ? "telegram" : modeRaw === "s" ? "saved" : null;
    const jobId = jobIdParts.join(":").trim();

    if (mode && jobId) {
      return { type: "post_now_run", mode, jobId };
    }
  }

  return { type: "none" };
}

function buildShareableJobText(
  job: Awaited<ReturnType<typeof getWhatsAppJobById>>,
): string {
  if (!job) {
    return "";
  }

  const photoLinks = Array.isArray(job.photos)
    ? job.photos.filter((photo) => typeof photo === "string" && photo.trim())
    : [];

  const lines = [job.caption];
  if (photoLinks.length > 0) {
    lines.push("", "Media:", ...photoLinks.slice(0, 3));
  }

  return lines.filter(Boolean).join("\n").trim();
}

function createPublicJobReference(jobId: string): string {
  const normalized = String(jobId || "").trim();
  if (!normalized) {
    return "POST";
  }

  const suffix = normalized.split("-").slice(-1)[0] || normalized.slice(-6);
  return `POST-${suffix.toUpperCase()}`;
}

function formatScheduleStatusLabel(status: string): string {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (normalized === "queued") return "Scheduled";
  if (normalized === "processing") return "Sending";
  if (normalized === "sent") return "Sent";
  if (normalized === "failed") return "Needs attention";
  return "Scheduled";
}

function formatScheduleTitle(job: {
  productName?: string;
  brief?: string;
  caption?: string;
  postType?: string;
}): string {
  const productName = String(job.productName || "").trim();
  if (productName) {
    return productName.length > 48
      ? `${productName.slice(0, 48)}…`
      : productName;
  }

  const brief = String(job.brief || "").trim();
  if (brief) {
    return brief.length > 48 ? `${brief.slice(0, 48)}…` : brief;
  }

  const caption = String(job.caption || "").trim();
  if (caption) {
    return caption.length > 48 ? `${caption.slice(0, 48)}…` : caption;
  }

  const postType = String(job.postType || "post").trim();
  return `${postType} post`;
}

function buildWhatsAppShareUrl(text: string): string {
  const encodedText = encodeURIComponent(text || "Check this post from Eazee");
  return `https://wa.me/?text=${encodedText}`;
}

function buildTelegramBuyNowUrlForJob(job: {
  id: string;
  productName?: string;
  brief?: string;
  postType?: string;
  hasCeloPayment: boolean;
  price: string;
  currency: string;
  ownerWalletAddress?: string;
}): string {
  if (!job.hasCeloPayment) {
    return "";
  }

  const sellerAddress =
    process.env.NEXT_PUBLIC_ESCROW_SELLER_ADDRESS?.trim() || "";
  if (!sellerAddress) {
    return "";
  }

  const price = String(job.price || "").trim();
  const currency = String(job.currency || "cUSD").trim();
  if (!price || !currency) {
    return "";
  }

  const payBaseUrl = buildMiniAppUrl("/pay");
  if (!payBaseUrl) {
    return "";
  }

  const productName =
    String(job.productName || job.brief || job.postType || "Post").trim() ||
    "Post";

  const url = new URL(payBaseUrl);
  url.searchParams.set("jobId", String(job.id || "").trim());
  url.searchParams.set("productName", productName);
  url.searchParams.set("price", price);
  url.searchParams.set("currency", currency);
  url.searchParams.set("seller", sellerAddress);
  url.searchParams.set(
    "ownerWalletAddress",
    String(job.ownerWalletAddress || sellerAddress).trim(),
  );

  return url.toString();
}

function parseSchedulesPageFromText(text: string): number {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return 1;
  }

  const tokens = normalized.split(/\s+/);
  if (tokens.length < 2) {
    return 1;
  }

  const parsed = Number.parseInt(tokens[1] || "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function parseJobIdFromText(text: string): string {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }

  const tokens = normalized.split(/\s+/);
  if (tokens.length < 2) {
    return "";
  }

  return String(tokens[1] || "").trim();
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

async function triggerImmediateDispatchCycle(
  requestUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const dispatchUrl = new URL("/api/whatsapp/dispatch-due", requestUrl);
    const cronSecret = process.env.CRON_SECRET?.trim() || "";

    const response = await fetch(dispatchUrl.toString(), {
      method: "POST",
      headers: cronSecret
        ? {
            Authorization: `Bearer ${cronSecret}`,
          }
        : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Dispatch cycle returned ${response.status}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to trigger dispatch cycle",
    };
  }
}

async function buildDashboardSummaryText(chatId: string): Promise<string> {
  const binding = await getTelegramBindingByChatId(chatId).catch(() => null);
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

  let jobs = [] as Awaited<ReturnType<typeof listWhatsAppJobsByOwner>>;
  let receipts = [] as Awaited<ReturnType<typeof listDispatchReceiptsByOwner>>;
  let payments = [] as Awaited<ReturnType<typeof listPaymentsByOwner>>;

  try {
    [jobs, receipts, payments] = await Promise.all([
      listWhatsAppJobsByOwner({
        chatId,
        walletAddress: binding.walletAddress,
        limit: 30,
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
  } catch {
    return [
      "📊 Dashboard summary",
      `Wallet: ${binding.walletAddress}`,
      "",
      "We can see your wallet is linked, but your data is temporarily unavailable.",
      "Try /dashboard again in a few seconds.",
    ].join("\n");
  }

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

  const recentScheduleLines = jobs.slice(0, 20).map((job, index) => {
    const scheduleTime = new Date(job.scheduledFor).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const recipientCount = Array.isArray(job.targets) ? job.targets.length : 0;
    return `${index + 1}. ${formatScheduleTitle(job)} • ${job.status} • ${scheduleTime} • ${recipientCount} target${recipientCount === 1 ? "" : "s"}`;
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
    `- Total posts: ${jobs.length}`,
    ...(recentScheduleLines.length > 0
      ? ["Your schedules (latest first):", ...recentScheduleLines]
      : ["Your schedules: none yet"]),
    jobs.length > 20
      ? `Showing latest 20 of ${jobs.length}. Open dashboard for full list.`
      : "",
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

async function buildDashboardMenuText(chatId: string): Promise<string> {
  const binding = await getTelegramBindingByChatId(chatId).catch(() => null);

  if (!binding?.walletAddress) {
    return [
      "📊 Dashboard",
      "Link your wallet first to access schedules, payments, and delivery stats.",
      "",
      "Run /link <token> to connect this chat.",
    ].join("\n");
  }

  return [
    "📊 Dashboard options",
    `Wallet: ${binding.walletAddress}`,
    "",
    "Choose an option:",
    "- Schedules",
    "- Payments",
    "- Delivery receipts",
    "- Summary",
  ].join("\n");
}

async function buildPaymentsText(chatId: string): Promise<string> {
  const binding = await getTelegramBindingByChatId(chatId).catch(() => null);
  if (!binding?.walletAddress) {
    return ["💳 Payments", "Link your wallet first using /link <token>."].join(
      "\n",
    );
  }

  const payments = await listPaymentsByOwner({
    ownerWalletAddress: binding.walletAddress,
    limit: 10,
  }).catch(() => []);

  const lines = payments.slice(0, 10).map((payment, index) => {
    return `${index + 1}. ${payment.amount} ${payment.currency} • ${payment.productName || "payment"} • ${formatTxHash(payment.txHash)}`;
  });

  return [
    "💳 Payments",
    `Wallet: ${binding.walletAddress}`,
    `Recent records: ${payments.length}`,
    "",
    ...(lines.length > 0 ? lines : ["No recent transactions yet."]),
  ].join("\n");
}

async function buildReceiptsText(chatId: string): Promise<string> {
  const binding = await getTelegramBindingByChatId(chatId).catch(() => null);
  if (!binding?.walletAddress) {
    return [
      "📬 Delivery receipts",
      "Link your wallet first using /link <token>.",
    ].join("\n");
  }

  const receipts = await listDispatchReceiptsByOwner({
    chatId,
    walletAddress: binding.walletAddress,
    limit: 20,
  }).catch(() => []);

  const sentCount = receipts.filter(
    (receipt) => receipt.status === "sent",
  ).length;
  const failedCount = receipts.filter(
    (receipt) => receipt.status === "failed",
  ).length;

  const lines = receipts.slice(0, 8).map((receipt, index) => {
    const attemptedAt = new Date(receipt.attemptedAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    return `${index + 1}. ${receipt.status.toUpperCase()} • ${attemptedAt} • ${receipt.targetId}`;
  });

  return [
    "📬 Delivery receipts",
    `Wallet: ${binding.walletAddress}`,
    `Sent: ${sentCount} | Failed: ${failedCount}`,
    "",
    ...(lines.length > 0 ? lines : ["No delivery receipts yet."]),
  ].join("\n");
}

interface SchedulePageView {
  text: string;
  page: number;
  totalPages: number;
  jobs: Awaited<ReturnType<typeof listWhatsAppJobsByOwner>>;
  startIndex: number;
}

async function buildSchedulesText(
  chatId: string,
  requestedPage: number,
): Promise<SchedulePageView> {
  const binding = await getTelegramBindingByChatId(chatId).catch(() => null);
  if (!binding?.walletAddress) {
    return {
      text: [
        "📅 Schedules",
        "Link your wallet first to view your schedule list.",
        "",
        "Run /link <token> then /schedules",
      ].join("\n"),
      page: 1,
      totalPages: 1,
      jobs: [],
      startIndex: 0,
    };
  }

  const jobs = await listWhatsAppJobsByOwner({
    chatId,
    walletAddress: binding.walletAddress,
    limit: 100,
  }).catch(() => []);

  if (jobs.length === 0) {
    return {
      text: [
        "📅 Schedules",
        "No schedules found yet (or data is still syncing).",
        "",
        "Create one from the mini app and run /schedules again.",
      ].join("\n"),
      page: 1,
      totalPages: 1,
      jobs: [],
      startIndex: 0,
    };
  }

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const startIndex = (page - 1) * pageSize;
  const pageJobs = jobs.slice(startIndex, startIndex + pageSize);

  const lines = pageJobs.map((job, index) => {
    const rowNumber = startIndex + index + 1;
    const scheduleTime = new Date(job.scheduledFor).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const recipientCount = Array.isArray(job.targets) ? job.targets.length : 0;
    const reference = createPublicJobReference(job.id);

    return [
      `${rowNumber}. ${formatScheduleTitle(job)}`,
      `   ${formatScheduleStatusLabel(job.status)} • ${scheduleTime}`,
      `   ${recipientCount} destination${recipientCount === 1 ? "" : "s"} • Ref: ${reference}`,
    ].join("\n");
  });

  return {
    text: [
      "📅 Your schedules",
      `Wallet: ${binding.walletAddress}`,
      `Page ${page}/${totalPages} • Total ${jobs.length}`,
      "",
      ...lines,
      "",
      "Tap ⚡ Post now below each row to choose destination.",
      "Use /schedules <page> to move through pages.",
    ].join("\n"),
    page,
    totalPages,
    jobs: pageJobs,
    startIndex,
  };
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

function extractBindTokenFromStartCommand(command: string): string {
  const normalized = String(command || "")
    .trim()
    .toLowerCase();

  if (!normalized.startsWith("start_bind_")) {
    return "";
  }

  return normalized.slice("start_bind_".length).trim();
}

async function handleInboundCommand(
  command: string,
  chatId: string,
  text = "",
  requestUrl = "",
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

  const normalizedCommandRaw = String(command).trim().toLowerCase();
  const startBindCommandToken =
    extractBindTokenFromStartCommand(normalizedCommandRaw);

  if (startBindCommandToken) {
    const confirmation = await confirmTelegramBindingToken({
      token: startBindCommandToken,
      chatId,
    });

    const replyText = confirmation.ok
      ? [
          "✅ Wallet linked successfully.",
          `Wallet: ${confirmation.binding.walletAddress}`,
          "You can now schedule and track posts from this Telegram chat.",
          "",
          await buildDashboardSummaryText(chatId),
        ].join("\n")
      : [
          "❌ Could not link wallet from this start link.",
          confirmation.error,
          "Open Eazee app, request a new token, then run /link <token>.",
        ].join("\n");

    const sendResult = await sendTelegramTextMessage({
      chatId,
      text: replyText,
      disableLinkPreview: true,
      replyMarkup: createMainMenuKeyboard(),
    });

    if (!sendResult.ok) {
      return {
        handled: true,
        replyMode: sendResult.mode,
        error: sendResult.error || "Failed to send start_bind response",
        action: "start_bind_send_failed",
      };
    }

    return {
      handled: true,
      replyMode: sendResult.mode,
      action: confirmation.ok ? "start_bind_confirmed" : "start_bind_rejected",
      error: confirmation.ok ? undefined : confirmation.error,
    };
  }

  const normalizedCommand = normalizedCommandRaw as CommandName;
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
            "",
            await buildDashboardSummaryText(chatId),
          ].join("\n")
        : [
            "❌ Could not link wallet from this start link.",
            confirmation.error,
            "Open Eazee app, request a new token, then run /link <token>.",
          ].join("\n");

      replyMarkup = createMainMenuKeyboard();
    } else {
      const existingBinding = await getTelegramBindingByChatId(chatId).catch(
        () => null,
      );

      replyText = existingBinding?.walletAddress
        ? await buildDashboardSummaryText(chatId)
        : [
            "✅ Eazee bot is active.",
            "To link your wallet in 2 simple steps:",
            "1) Open Eazee app → Settings → Link Telegram",
            "2) Tap request token, then send /link <token> here",
            "",
            "After linking, use /dashboard and /schedules to manage posts from Telegram.",
          ].join("\n");
      replyMarkup = createMainMenuKeyboard();
    }
  } else if (normalizedCommand === "link") {
    return handleBindCommand(text, chatId);
  } else if (normalizedCommand === "unbind") {
    const revokeResult = await revokeTelegramBindingByChatId({ chatId });
    replyText = revokeResult.ok
      ? [
          "✅ Wallet unlinked from this Telegram chat.",
          "You can re-link anytime with /link <token>.",
        ].join("\n")
      : [
          "ℹ️ No active wallet binding found for this chat.",
          "If needed, link a wallet with /link <token>.",
        ].join("\n");
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
    replyText = await buildDashboardMenuText(chatId);
    replyMarkup = createDashboardKeyboard();
  } else if (normalizedCommand === "schedules") {
    const schedulesView = await buildSchedulesText(
      chatId,
      parseSchedulesPageFromText(text),
    );
    replyText = schedulesView.text;
    replyMarkup = createSchedulesKeyboard({
      jobs: schedulesView.jobs,
      page: schedulesView.page,
      totalPages: schedulesView.totalPages,
      startIndex: schedulesView.startIndex,
    });
  } else if (normalizedCommand === "postnow") {
    const binding = await getTelegramBindingByChatId(chatId).catch(() => null);
    if (!binding?.walletAddress) {
      replyText = [
        "❌ Wallet is not linked in this chat.",
        "Run /link <token> first, then use /postnow <jobId>.",
      ].join("\n");
      replyMarkup = createMainMenuKeyboard();
    } else {
      const jobId = parseJobIdFromText(text);
      if (!jobId) {
        replyText = [
          "Usage: /postnow <jobId>",
          "Run /schedules to copy a job ID first.",
        ].join("\n");
      } else {
        const job = await getWhatsAppJobById(jobId);
        if (!job) {
          replyText =
            "❌ Job not found. Run /schedules and copy a valid job ID.";
        } else if (job.status !== "queued") {
          replyText = `ℹ️ This post is ${job.status} and cannot be triggered now.`;
        } else if (
          (job.ownerWalletAddress || "").toLowerCase() !==
          binding.walletAddress.toLowerCase()
        ) {
          replyText = "❌ This job does not belong to your linked wallet.";
        } else {
          const shareText = buildShareableJobText(job);
          const reference = createPublicJobReference(job.id);
          replyText = [
            "⚡ Post now options",
            `Reference: ${reference}`,
            "Choose where to post this now:",
            "- Saved targets (scheduled recipients)",
            "- Telegram chat copy",
            "- WhatsApp share picker",
          ].join("\n");
          replyMarkup = createPostNowActionKeyboard({
            jobId: job.id,
            whatsappShareUrl: buildWhatsAppShareUrl(shareText),
          });
        }
      }

      if (!replyMarkup) {
        replyMarkup = createDashboardKeyboard();
      }
    }
  } else if (normalizedCommand === "help") {
    replyText = [
      "Eazee Telegram Bot Commands:",
      "/start - Verify the bot is active",
      "/start_bind_<token> - Link wallet directly from app button",
      "/link <token> - Paste the token from Eazee app to link wallet",
      "/unbind - Unlink wallet from this Telegram chat",
      "/create - Open content creation flow",
      "/dashboard - Open dashboard actions",
      "/schedules <page> - View schedules with paging",
      "/postnow <jobId> - Trigger one queued post immediately",
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
        "",
        await buildDashboardSummaryText(normalizedChatId),
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

async function triggerPostNowSavedTargets(input: {
  chatId: string;
  requestUrl?: string;
  jobId: string;
  walletAddress: string;
}): Promise<{ text: string; error?: string }> {
  const job = await getWhatsAppJobById(input.jobId);

  if (!job) {
    return {
      text: "❌ Job not found. Run /schedules and choose a valid queued job.",
    };
  }

  if (job.status !== "queued") {
    return {
      text: `ℹ️ This post is ${job.status} and cannot be triggered now.`,
    };
  }

  if ((job.ownerWalletAddress || "").toLowerCase() !== input.walletAddress) {
    return {
      text: "❌ This job does not belong to your linked wallet.",
    };
  }

  const marked = await scheduleQueuedJobForImmediateDispatch(job.id);
  if (!marked) {
    return {
      text: "❌ Could not mark this job for immediate dispatch.",
    };
  }

  const dispatchResult = input.requestUrl
    ? await triggerImmediateDispatchCycle(input.requestUrl)
    : { ok: false, error: "Missing request context" };

  if (dispatchResult.ok) {
    return {
      text: [
        "✅ Post queued for immediate send.",
        `Job ID: ${job.id}`,
        "Use /dashboard or /schedules to confirm status update.",
      ].join("\n"),
    };
  }

  return {
    text: [
      "⚠️ Job marked as due now, but dispatch trigger did not complete.",
      `Job ID: ${job.id}`,
      dispatchResult.error ? `Reason: ${dispatchResult.error}` : "",
      "The next dispatch cycle will still process it.",
    ]
      .filter(Boolean)
      .join("\n"),
    error: dispatchResult.error,
  };
}

async function sendPostCopyToCurrentChat(input: {
  chatId: string;
  jobId: string;
  walletAddress: string;
}): Promise<{ text: string; error?: string }> {
  const job = await getWhatsAppJobById(input.jobId);

  if (!job) {
    return {
      text: "❌ Job not found. Run /schedules and choose a valid queued job.",
    };
  }

  if ((job.ownerWalletAddress || "").toLowerCase() !== input.walletAddress) {
    return {
      text: "❌ This job does not belong to your linked wallet.",
    };
  }

  const lines = [job.caption];
  const photoLinks = Array.isArray(job.photos) ? job.photos.slice(0, 3) : [];

  if (photoLinks.length > 0) {
    lines.push("", "Media:", ...photoLinks);
  }

  const buyNowUrl = buildTelegramBuyNowUrlForJob({
    id: job.id,
    productName: job.productName,
    brief: job.brief,
    postType: job.postType,
    hasCeloPayment: Boolean(job.hasCeloPayment),
    price: String(job.price || ""),
    currency: String(job.currency || "cUSD"),
    ownerWalletAddress: job.ownerWalletAddress,
  });

  const priceLabel =
    `${String(job.price || "").trim()} ${String(job.currency || "cUSD").trim()}`.trim();

  if (buyNowUrl && priceLabel) {
    lines.push("", `💳 Buy now: ${priceLabel}`);
  }

  const postCopyResult = await sendTelegramTextMessage({
    chatId: input.chatId,
    text: lines.join("\n").trim(),
    disableLinkPreview: true,
    replyMarkup: buyNowUrl
      ? {
          inline_keyboard: [
            [
              {
                text: `🛒 Buy Now · ${priceLabel || "cUSD"}`,
                url: buyNowUrl,
              },
            ],
          ],
        }
      : undefined,
  });

  if (!postCopyResult.ok) {
    return {
      text: "❌ Could not send post copy to this chat.",
      error: postCopyResult.error || "Telegram send failed",
    };
  }

  return {
    text: [
      "✅ Sent a copy of this post to your current Telegram chat.",
      `Job ID: ${job.id}`,
      "Tip: Use “Send now (saved targets)” to dispatch to scheduled recipients.",
    ].join("\n"),
  };
}

async function handleCallbackQuery(input: {
  callbackQueryId: string;
  callbackData: string;
  chatId: string;
  requestUrl?: string;
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

  const callbackAction = parseCallbackAction(input.callbackData);

  const callbackAck = await answerTelegramCallbackQuery({
    callbackQueryId: input.callbackQueryId,
    text: callbackAction.type === "none" ? "Action received" : "Opening...",
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

  if (callbackAction.type === "none") {
    return {
      handled: true,
      replyMode: callbackAck.mode,
      action: "callback_ack",
    };
  }

  if (callbackAction.type === "command") {
    const commandResult = await handleInboundCommand(
      callbackAction.command,
      input.chatId,
      "",
      input.requestUrl || "",
    );

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
      action: `callback:${callbackAction.command}`,
    };
  }

  if (callbackAction.type === "dashboard") {
    const replyText =
      callbackAction.section === "menu"
        ? await buildDashboardMenuText(input.chatId)
        : callbackAction.section === "summary"
          ? await buildDashboardSummaryText(input.chatId)
          : callbackAction.section === "payments"
            ? await buildPaymentsText(input.chatId)
            : callbackAction.section === "receipts"
              ? await buildReceiptsText(input.chatId)
              : await buildDashboardMenuText(input.chatId);

    const sendResult = await sendTelegramTextMessage({
      chatId: input.chatId,
      text: replyText,
      disableLinkPreview: true,
      replyMarkup: createDashboardKeyboard(),
    });

    return {
      handled: true,
      replyMode: sendResult.mode,
      error: sendResult.ok
        ? undefined
        : sendResult.error || "Failed to send dashboard callback response",
      action: `callback:dash:${callbackAction.section}`,
    };
  }

  if (callbackAction.type === "schedules") {
    const schedulesView = await buildSchedulesText(
      input.chatId,
      callbackAction.page,
    );

    const sendResult = await sendTelegramTextMessage({
      chatId: input.chatId,
      text: schedulesView.text,
      disableLinkPreview: true,
      replyMarkup: createSchedulesKeyboard({
        jobs: schedulesView.jobs,
        page: schedulesView.page,
        totalPages: schedulesView.totalPages,
        startIndex: schedulesView.startIndex,
      }),
    });

    return {
      handled: true,
      replyMode: sendResult.mode,
      error: sendResult.ok
        ? undefined
        : sendResult.error || "Failed to send schedules callback response",
      action: `callback:schedules:${schedulesView.page}`,
    };
  }

  if (callbackAction.type === "post_now_pick") {
    const binding = await getTelegramBindingByChatId(input.chatId).catch(
      () => null,
    );

    if (!binding?.walletAddress) {
      const sendResult = await sendTelegramTextMessage({
        chatId: input.chatId,
        text: "❌ Wallet is not linked in this chat. Run /link <token> first.",
        disableLinkPreview: true,
        replyMarkup: createMainMenuKeyboard(),
      });

      return {
        handled: true,
        replyMode: sendResult.mode,
        error: sendResult.ok ? undefined : sendResult.error,
        action: "callback:postnow:pick_unlinked",
      };
    }

    const job = await getWhatsAppJobById(callbackAction.jobId);
    if (!job) {
      const sendResult = await sendTelegramTextMessage({
        chatId: input.chatId,
        text: "❌ Job not found. Open /schedules and select a valid queued job.",
        disableLinkPreview: true,
        replyMarkup: createDashboardKeyboard(),
      });

      return {
        handled: true,
        replyMode: sendResult.mode,
        error: sendResult.ok ? undefined : sendResult.error,
        action: "callback:postnow:pick_not_found",
      };
    }

    const replyText = [
      "⚡ Post now options",
      `Reference: ${createPublicJobReference(job.id)}`,
      "Choose where to post this immediately:",
      "- Saved targets",
      "- This Telegram chat",
      "- WhatsApp share picker",
    ].join("\n");

    const sendResult = await sendTelegramTextMessage({
      chatId: input.chatId,
      text: replyText,
      disableLinkPreview: true,
      replyMarkup: createPostNowActionKeyboard({
        jobId: job.id,
        whatsappShareUrl: buildWhatsAppShareUrl(buildShareableJobText(job)),
      }),
    });

    return {
      handled: true,
      replyMode: sendResult.mode,
      error: sendResult.ok
        ? undefined
        : sendResult.error || "Failed to send post-now options",
      action: "callback:postnow:pick",
    };
  }

  if (callbackAction.type === "post_now_run") {
    const binding = await getTelegramBindingByChatId(input.chatId).catch(
      () => null,
    );

    if (!binding?.walletAddress) {
      const sendResult = await sendTelegramTextMessage({
        chatId: input.chatId,
        text: "❌ Wallet is not linked in this chat. Run /link <token> first.",
        disableLinkPreview: true,
        replyMarkup: createMainMenuKeyboard(),
      });

      return {
        handled: true,
        replyMode: sendResult.mode,
        error: sendResult.ok ? undefined : sendResult.error,
        action: "callback:postnow:run_unlinked",
      };
    }

    const modeResult =
      callbackAction.mode === "saved"
        ? await triggerPostNowSavedTargets({
            chatId: input.chatId,
            requestUrl: input.requestUrl,
            jobId: callbackAction.jobId,
            walletAddress: binding.walletAddress.toLowerCase(),
          })
        : await sendPostCopyToCurrentChat({
            chatId: input.chatId,
            jobId: callbackAction.jobId,
            walletAddress: binding.walletAddress.toLowerCase(),
          });

    const sendResult = await sendTelegramTextMessage({
      chatId: input.chatId,
      text: modeResult.text,
      disableLinkPreview: true,
      replyMarkup: createDashboardKeyboard(),
    });

    return {
      handled: true,
      replyMode: sendResult.mode,
      error: sendResult.ok
        ? modeResult.error
        : sendResult.error ||
          modeResult.error ||
          "Failed to send post-now result",
      action:
        callbackAction.mode === "saved"
          ? "callback:postnow:run_saved"
          : "callback:postnow:run_telegram",
    };
  }

  return {
    handled: true,
    replyMode: callbackAck.mode,
    action: "callback_noop",
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
          requestUrl: request.url,
        })
      : parsedUpdate.command
        ? await handleInboundCommand(
            parsedUpdate.command,
            parsedUpdate.chatId,
            parsedUpdate.text,
            request.url,
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
