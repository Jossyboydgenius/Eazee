import { createHash, randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "viem";
import { prisma } from "@/lib/prisma";

interface WalletAuthSession {
  walletAddress: string;
  chatId?: string;
  expiresAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeWalletAddress(value: string): string {
  const input = String(value || "").trim();
  if (!input) return "";

  try {
    return getAddress(input).toLowerCase();
  } catch {
    return "";
  }
}

function normalizeChatId(value: string): string {
  return String(value || "").trim();
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getChallengeTtlMinutes(): number {
  const configured = Number(
    process.env.EAZEE_WALLET_AUTH_CHALLENGE_TTL_MINUTES || "5",
  );

  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }

  return 5;
}

function getSessionTtlHours(): number {
  const configured = Number(process.env.EAZEE_WALLET_SESSION_TTL_HOURS || "24");

  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }

  return 24;
}

function buildWalletAuthMessage(input: {
  walletAddress: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  chatId?: string;
}) {
  const appName = process.env.EAZEE_APP_NAME?.trim() || "Eazee";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.TELEGRAM_MINI_APP_URL?.trim() ||
    "http://localhost:3000";

  return [
    `${appName} Wallet Link Authorization`,
    "",
    `Address: ${input.walletAddress}`,
    `Chat ID: ${input.chatId || "(none)"}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expires At: ${input.expiresAt}`,
    `URI: ${appUrl}`,
    "",
    "Sign this message to authorize Telegram wallet binding and dashboard access.",
  ].join("\n");
}

function issueWalletSession(input: { walletAddress: string; chatId?: string }) {
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  const chatId = normalizeChatId(input.chatId || "");
  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  const createdAt = nowIso();
  const expiresAt = new Date(
    Date.now() + getSessionTtlHours() * 60 * 60 * 1000,
  ).toISOString();

  return prisma.walletAuthSession
    .create({
      data: {
        tokenHash,
        walletAddress,
        chatId: chatId || null,
        createdAt: new Date(createdAt),
        expiresAt: new Date(expiresAt),
        lastUsedAt: new Date(createdAt),
      },
    })
    .then(() => ({
      token,
      walletAddress,
      chatId: chatId || undefined,
      expiresAt,
    }));
}

export async function createWalletAuthChallenge(input: {
  walletAddress: string;
  chatId?: string;
}) {
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  const chatId = normalizeChatId(input.chatId || "");

  if (!walletAddress) {
    return {
      ok: false as const,
      error: "A valid walletAddress is required",
    };
  }

  const nonce = randomBytes(18).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = new Date(
    Date.now() + getChallengeTtlMinutes() * 60_000,
  ).toISOString();
  const message = buildWalletAuthMessage({
    walletAddress,
    nonce,
    issuedAt: createdAt,
    expiresAt,
    chatId: chatId || undefined,
  });

  await prisma.walletAuthChallenge.create({
    data: {
      nonce,
      walletAddress,
      chatId: chatId || null,
      message,
      createdAt: new Date(createdAt),
      expiresAt: new Date(expiresAt),
    },
  });

  return {
    ok: true as const,
    challenge: {
      nonce,
      message,
      walletAddress,
      chatId: chatId || undefined,
      createdAt,
      expiresAt,
      ttlMinutes: getChallengeTtlMinutes(),
    },
  };
}

export async function consumeWalletAuthChallenge(input: {
  walletAddress: string;
  nonce: string;
  signature: string;
}) {
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  const nonce = String(input.nonce || "").trim();
  const signature = String(input.signature || "").trim();

  if (!walletAddress || !nonce || !signature) {
    return {
      ok: false as const,
      error: "walletAddress, nonce, and signature are required",
    };
  }

  const challenge = await prisma.walletAuthChallenge.findUnique({
    where: { nonce },
  });

  if (!challenge) {
    return {
      ok: false as const,
      error: "Invalid wallet auth challenge",
    };
  }

  if (challenge.usedAt) {
    return {
      ok: false as const,
      error: "Wallet auth challenge already used",
    };
  }

  const challengeWallet = normalizeWalletAddress(challenge.walletAddress);
  if (!challengeWallet || challengeWallet !== walletAddress) {
    return {
      ok: false as const,
      error: "Challenge wallet does not match walletAddress",
    };
  }

  const expiresAtMs = challenge.expiresAt.getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return {
      ok: false as const,
      error: "Wallet auth challenge expired",
    };
  }

  const message = challenge.message;
  const verified = await verifyMessage({
    address: getAddress(walletAddress),
    message,
    signature: signature as `0x${string}`,
  }).catch(() => false);

  if (!verified) {
    return {
      ok: false as const,
      error: "Invalid wallet signature",
    };
  }

  await prisma.walletAuthChallenge.update({
    where: { nonce },
    data: { usedAt: new Date(nowIso()) },
  });

  const chatId = normalizeChatId(challenge.chatId || "");
  const session = await issueWalletSession({
    walletAddress,
    chatId: chatId || undefined,
  });

  return {
    ok: true as const,
    session,
  };
}

export async function getWalletSessionFromRequest(
  request: Request,
): Promise<WalletAuthSession | null> {
  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const sessionToken =
    bearerToken || request.headers.get("x-eazee-session-token")?.trim() || "";

  if (!sessionToken) {
    return null;
  }

  const tokenHash = hashToken(sessionToken);
  const row = await prisma.walletAuthSession.findUnique({
    where: { tokenHash },
  });

  if (!row || row.revokedAt) {
    return null;
  }

  const expiresAt = row.expiresAt.toISOString();
  const expiresAtMs = row.expiresAt.getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return null;
  }

  const walletAddress = normalizeWalletAddress(row.walletAddress);
  if (!walletAddress) {
    return null;
  }

  const chatId = normalizeChatId(row.chatId || "");

  await prisma.walletAuthSession.update({
    where: { tokenHash },
    data: { lastUsedAt: new Date(nowIso()) },
  });

  return {
    walletAddress,
    chatId: chatId || undefined,
    expiresAt,
  };
}
