import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export interface TelegramBinding {
  id: string;
  chatId: string;
  walletAddress: string;
  status: "pending" | "active" | "revoked";
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeChatId(value: string): string {
  return String(value || "").trim();
}

function normalizeWalletAddress(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getBindingTokenTtlMinutes(): number {
  const configured = Number(
    process.env.TELEGRAM_BIND_TOKEN_TTL_MINUTES || "10",
  );
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }

  return 10;
}

export function createTelegramBindingIntent(input: {
  chatId: string;
  walletAddress: string;
}) {
  const chatId = normalizeChatId(input.chatId);
  const walletAddress = normalizeWalletAddress(input.walletAddress);

  if (!chatId || !walletAddress) {
    return {
      ok: false as const,
      error: "chatId and walletAddress are required",
    };
  }

  const token = randomBytes(18).toString("base64url");
  const tokenHash = hashToken(token);
  const createdAt = nowIso();
  const ttlMinutes = getBindingTokenTtlMinutes();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  return prisma.telegramBindingToken
    .create({
      data: {
        tokenHash,
        chatId,
        walletAddress,
        createdAt: new Date(createdAt),
        expiresAt: new Date(expiresAt),
      },
    })
    .then(() => ({
      ok: true as const,
      token,
      expiresAt,
      ttlMinutes,
      chatId,
      walletAddress,
    }));
}

function mapBindingRow(row: {
  id: string;
  chatId: string;
  walletAddress: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastVerifiedAt: Date | null;
}): TelegramBinding {
  return {
    id: row.id,
    chatId: row.chatId,
    walletAddress: row.walletAddress,
    status: row.status as TelegramBinding["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastVerifiedAt: row.lastVerifiedAt
      ? row.lastVerifiedAt.toISOString()
      : undefined,
  };
}

export async function upsertTelegramBinding(input: {
  chatId: string;
  walletAddress: string;
  status?: TelegramBinding["status"];
}) {
  const chatId = normalizeChatId(input.chatId);
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  const status = input.status || "active";

  if (!chatId || !walletAddress) {
    return {
      ok: false as const,
      error: "chatId and walletAddress are required",
    };
  }

  const now = nowIso();

  const saved = await prisma.telegramBinding.upsert({
    where: { chatId },
    update: {
      walletAddress,
      status,
      updatedAt: new Date(now),
      lastVerifiedAt: new Date(now),
    },
    create: {
      id: createId("tg-bind"),
      chatId,
      walletAddress,
      status,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      lastVerifiedAt: new Date(now),
    },
  });

  return {
    ok: true as const,
    binding: mapBindingRow(saved),
  };
}

export async function confirmTelegramBindingToken(input: {
  token: string;
  chatId?: string;
}) {
  const token = String(input.token || "").trim();
  const expectedChatId = normalizeChatId(input.chatId || "");

  if (!token) {
    return {
      ok: false as const,
      error: "Missing token",
    };
  }

  const tokenHash = hashToken(token);

  const tokenRow = await prisma.telegramBindingToken.findUnique({
    where: { tokenHash },
  });

  if (!tokenRow) {
    return {
      ok: false as const,
      error: "Invalid binding token",
    };
  }

  if (tokenRow.usedAt) {
    return {
      ok: false as const,
      error: "Binding token already used",
    };
  }

  const expiresAtMs = tokenRow.expiresAt.getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return {
      ok: false as const,
      error: "Binding token expired",
    };
  }

  const tokenChatId = normalizeChatId(tokenRow.chatId);
  if (expectedChatId && tokenChatId && expectedChatId !== tokenChatId) {
    return {
      ok: false as const,
      error: "Token chat does not match this Telegram chat",
    };
  }

  const walletAddress = normalizeWalletAddress(tokenRow.walletAddress);
  const bindingResult = await upsertTelegramBinding({
    chatId: tokenChatId,
    walletAddress,
    status: "active",
  });

  if (!bindingResult.ok) {
    return bindingResult;
  }

  await prisma.telegramBindingToken.update({
    where: { tokenHash },
    data: {
      usedAt: new Date(nowIso()),
    },
  });

  return {
    ok: true as const,
    binding: bindingResult.binding,
  };
}

export async function getTelegramBindingByChatId(
  chatIdInput: string,
  options?: {
    includeInactive?: boolean;
  },
): Promise<TelegramBinding | null> {
  const chatId = normalizeChatId(chatIdInput);
  if (!chatId) return null;

  const includeInactive = options?.includeInactive === true;

  const row = await prisma.telegramBinding.findUnique({
    where: { chatId },
  });

  if (!row) {
    return null;
  }

  if (!includeInactive && row.status !== "active") {
    return null;
  }

  return mapBindingRow(row);
}

export async function getTelegramBindingByWallet(
  walletAddressInput: string,
  options?: {
    includeInactive?: boolean;
  },
): Promise<TelegramBinding | null> {
  const walletAddress = normalizeWalletAddress(walletAddressInput);
  if (!walletAddress) return null;

  const includeInactive = options?.includeInactive === true;

  const row = await prisma.telegramBinding.findFirst({
    where: includeInactive
      ? { walletAddress }
      : {
          walletAddress,
          status: "active",
        },
    orderBy: { updatedAt: "desc" },
  });

  return row ? mapBindingRow(row) : null;
}

export async function revokeTelegramBindingByChatId(input: { chatId: string }) {
  const chatId = normalizeChatId(input.chatId);

  if (!chatId) {
    return {
      ok: false as const,
      error: "chatId is required",
    };
  }

  const existing = await prisma.telegramBinding.findUnique({
    where: { chatId },
  });

  if (!existing) {
    return {
      ok: false as const,
      error: "No binding found for this Telegram chat",
    };
  }

  const updated = await prisma.telegramBinding.update({
    where: { chatId },
    data: {
      status: "revoked",
      updatedAt: new Date(nowIso()),
      lastVerifiedAt: null,
    },
  });

  return {
    ok: true as const,
    binding: mapBindingRow(updated),
  };
}

export async function listTelegramBindings(
  limit = 100,
): Promise<TelegramBinding[]> {
  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100;
  const rows = await prisma.telegramBinding.findMany({
    orderBy: { updatedAt: "desc" },
    take: safeLimit,
  });

  return rows.map(mapBindingRow);
}
