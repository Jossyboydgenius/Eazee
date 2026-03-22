"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { ArrowUpRight, Copy, Send, Settings } from "lucide-react";
import {
  isTelegramNumericDestination,
  normalizeTelegramDestination,
} from "@/lib/telegramDestination";
import { toast } from "@/lib/toast";
import calendarIcon from "@/svg/calendar.svg";

interface TelegramBinding {
  id: string;
  chatId: string;
  walletAddress: string;
  status: "pending" | "active" | "revoked";
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
}

interface TelegramBindResponse {
  binding?: TelegramBinding | null;
  error?: string;
}

const WALLET_SESSION_STORAGE_KEY = "eazee-wallet-session";

interface WalletSessionCacheRecord {
  token: string;
  walletAddress: string;
  expiresAt: string;
}

function canUseBrowserStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function writeWalletSessionCache(session: WalletSessionCacheRecord): void {
  if (!canUseBrowserStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      WALLET_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } catch {
    // Ignore localStorage write failures.
  }
}

function normalizeBotUsername(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^@+/, "");
}

function buildTelegramBotHref(botUsername: string, bindToken: string): string {
  const username = normalizeBotUsername(botUsername);
  if (!username) {
    return "https://t.me";
  }

  const token = String(bindToken || "").trim();
  if (!token) {
    return `https://t.me/${username}`;
  }

  return `https://t.me/${username}?start=bind_${encodeURIComponent(token)}`;
}

export default function TelegramLinkPanel({
  botUsername,
}: {
  botUsername: string;
}) {
  const activeAccount = useActiveAccount();
  const walletAddress = (activeAccount?.address || "").trim().toLowerCase();

  const [telegramChatId, setTelegramChatId] = useState("");
  const [walletBinding, setWalletBinding] = useState<TelegramBinding | null>(
    null,
  );
  const [chatBinding, setChatBinding] = useState<TelegramBinding | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

  const [isRequestingToken, setIsRequestingToken] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [bindToken, setBindToken] = useState("");
  const [bindTokenExpiresAt, setBindTokenExpiresAt] = useState("");

  const normalizedChatId = useMemo(
    () => normalizeTelegramDestination(telegramChatId),
    [telegramChatId],
  );

  const telegramBotHref = useMemo(
    () => buildTelegramBotHref(botUsername, bindToken),
    [botUsername, bindToken],
  );

  const linkCommand = bindToken ? `/link ${bindToken}` : "/link <token>";

  const loadWalletBinding = async (address: string) => {
    if (!address) {
      setWalletBinding(null);
      return;
    }

    const response = await fetch(
      `/api/telegram/bind?walletAddress=${encodeURIComponent(address)}`,
      { cache: "no-store" },
    );
    const data = (await response
      .json()
      .catch(() => ({}))) as TelegramBindResponse;

    if (!response.ok) {
      throw new Error(data?.error || "Failed to fetch wallet link status");
    }

    setWalletBinding(data?.binding || null);
  };

  const loadChatBinding = async (chatId: string) => {
    const normalized = normalizeTelegramDestination(chatId);
    if (!normalized || !isTelegramNumericDestination(normalized)) {
      setChatBinding(null);
      return;
    }

    const response = await fetch(
      `/api/telegram/bind?chatId=${encodeURIComponent(normalized)}`,
      { cache: "no-store" },
    );
    const data = (await response
      .json()
      .catch(() => ({}))) as TelegramBindResponse;

    if (!response.ok) {
      throw new Error(data?.error || "Failed to fetch chat link status");
    }

    setChatBinding(data?.binding || null);
  };

  const refreshStatus = async () => {
    setStatusError("");
    setIsLoadingStatus(true);

    try {
      await loadWalletBinding(walletAddress);
      await loadChatBinding(normalizedChatId);
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : "Failed to refresh link status",
      );
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    setStatusError("");

    if (!walletAddress) {
      setWalletBinding(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetch(
          `/api/telegram/bind?walletAddress=${encodeURIComponent(walletAddress)}`,
          { cache: "no-store" },
        );
        const data = (await response
          .json()
          .catch(() => ({}))) as TelegramBindResponse;

        if (!response.ok) {
          throw new Error(data?.error || "Failed to fetch wallet link status");
        }

        if (!cancelled) {
          setWalletBinding(data?.binding || null);
        }
      } catch (error) {
        if (!cancelled) {
          setStatusError(
            error instanceof Error
              ? error.message
              : "Failed to fetch wallet link status",
          );
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const handleRequestBindToken = async () => {
    setRequestError("");

    if (!activeAccount || !walletAddress) {
      setRequestError(
        "Connect your wallet first before requesting a Telegram link token.",
      );
      return;
    }

    if (!normalizedChatId || !isTelegramNumericDestination(normalizedChatId)) {
      setRequestError(
        "Enter a valid Telegram ID (numeric chat id like -1001234567890).",
      );
      return;
    }

    setIsRequestingToken(true);

    try {
      const chatCheckResponse = await fetch(
        `/api/telegram/bind?chatId=${encodeURIComponent(normalizedChatId)}`,
        { cache: "no-store" },
      );
      const chatCheckData = (await chatCheckResponse
        .json()
        .catch(() => ({}))) as TelegramBindResponse;

      if (!chatCheckResponse.ok) {
        throw new Error(
          chatCheckData?.error || "Failed to check Telegram chat link status",
        );
      }

      const existingChatBinding = chatCheckData?.binding || null;
      setChatBinding(existingChatBinding);

      if (
        existingChatBinding?.walletAddress &&
        existingChatBinding.walletAddress !== walletAddress
      ) {
        throw new Error(
          `This Telegram destination is already linked to wallet ${existingChatBinding.walletAddress}.`,
        );
      }

      const challengeResponse = await fetch("/api/telegram/bind", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "challenge",
          walletAddress,
          chatId: normalizedChatId,
        }),
      });

      const challengeData = await challengeResponse.json().catch(() => ({}));
      if (!challengeResponse.ok || !challengeData?.challenge?.message) {
        throw new Error(
          typeof challengeData?.error === "string"
            ? challengeData.error
            : "Failed to create wallet auth challenge",
        );
      }

      const signature = await activeAccount.signMessage({
        message: String(challengeData.challenge.message),
      });

      const requestResponse = await fetch("/api/telegram/bind", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "request",
          chatId: normalizedChatId,
          walletAddress,
          nonce: String(challengeData.challenge.nonce || ""),
          signature,
        }),
      });

      const requestData = await requestResponse.json().catch(() => ({}));
      if (!requestResponse.ok) {
        throw new Error(
          typeof requestData?.error === "string"
            ? requestData.error
            : "Failed to request Telegram link token",
        );
      }

      const token =
        typeof requestData?.token === "string" ? requestData.token.trim() : "";
      if (!token) {
        throw new Error("Bind token is missing from server response");
      }

      setBindToken(token);
      setBindTokenExpiresAt(
        typeof requestData?.expiresAt === "string" ? requestData.expiresAt : "",
      );

      const walletSessionToken =
        typeof requestData?.walletSessionToken === "string"
          ? requestData.walletSessionToken.trim()
          : "";
      const walletSessionExpiresAt =
        typeof requestData?.walletSessionExpiresAt === "string"
          ? requestData.walletSessionExpiresAt
          : "";

      if (walletSessionToken && walletSessionExpiresAt) {
        writeWalletSessionCache({
          token: walletSessionToken,
          walletAddress,
          expiresAt: walletSessionExpiresAt,
        });
      }

      toast({
        title: "Telegram link token ready",
        description:
          "Open Telegram and send /link <token>, or use the deep-link button below.",
        variant: "info",
      });

      await refreshStatus();
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Failed to request Telegram link token",
      );
    } finally {
      setIsRequestingToken(false);
    }
  };

  const handleCopyLinkCommand = async () => {
    try {
      if (!navigator?.clipboard) {
        throw new Error("Clipboard is not available in this browser context");
      }

      await navigator.clipboard.writeText(linkCommand);
      toast({
        title: "Copied",
        description: "Telegram link command copied to clipboard.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the command manually.",
        variant: "error",
      });
    }
  };

  const walletLinkedToCurrentAddress =
    Boolean(walletAddress) &&
    Boolean(walletBinding?.walletAddress) &&
    walletBinding?.walletAddress === walletAddress;
  const linkedWalletBinding =
    walletLinkedToCurrentAddress && walletBinding ? walletBinding : null;

  return (
    <section id="telegram-link-settings" className="glass-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "var(--brand-dim)" }}
        >
          <Settings
            className="w-5 h-5"
            style={{ color: "var(--brand-dark)" }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h2
            className="text-base sm:text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Link Telegram
          </h2>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Connect your wallet and Telegram destination to unlock bot-owned
            scheduling and dashboard access.
          </p>

          {!linkedWalletBinding && (
            <>
              <div
                className="mt-4 rounded-xl border p-3 sm:p-4"
                style={{
                  background: "var(--bg-elevated)",
                  borderColor: "var(--border)",
                }}
              >
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Telegram ID
                </p>
                <input
                  value={telegramChatId}
                  onChange={(event) =>
                    setTelegramChatId(event.target.value.replace(/\s+/g, ""))
                  }
                  placeholder="Enter your Telegram ID"
                  className="mt-2 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                  style={{
                    background: "var(--bg-primary)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                <p
                  className="mt-2 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Wallet: {walletAddress || "Not connected"}
                </p>
              </div>

              <div
                className="mt-3 rounded-xl border p-3 sm:p-4"
                style={{
                  background: "var(--bg-elevated)",
                  borderColor: "var(--border)",
                }}
              >
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Quick steps
                </p>
                <ol
                  className="mt-2 space-y-1 text-sm list-decimal list-inside"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <li>Connect your wallet in the app.</li>
                  <li>Enter Telegram ID and request token.</li>
                  <li>
                    Open @{normalizeBotUsername(botUsername)} and confirm with
                    /link &lt;token&gt;.
                  </li>
                </ol>
              </div>
            </>
          )}

          {(requestError || statusError) && (
            <div
              className="mt-3 rounded-xl border px-3 py-2 text-sm"
              style={{
                background: "var(--bg-elevated)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            >
              {requestError || statusError}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!linkedWalletBinding && (
              <button
                onClick={handleRequestBindToken}
                disabled={isRequestingToken}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all disabled:opacity-60"
                style={{
                  color: "var(--brand-dark)",
                  background: "var(--bg-elevated)",
                  borderColor: "var(--border)",
                }}
              >
                <Send className="w-4 h-4" />
                {isRequestingToken ? "Requesting..." : "Request Link Token"}
              </button>
            )}

            <a
              href={telegramBotHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all"
              style={{
                color: "var(--brand-dark)",
                background: "var(--bg-elevated)",
                borderColor: "var(--border)",
              }}
            >
              <Send className="w-4 h-4" />
              Open Telegram Bot
              <ArrowUpRight className="w-4 h-4" />
            </a>

            <button
              onClick={refreshStatus}
              disabled={isLoadingStatus}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all disabled:opacity-60"
              style={{
                color: "var(--text-secondary)",
                background: "var(--bg-elevated)",
                borderColor: "var(--border)",
              }}
            >
              {isLoadingStatus ? "Refreshing..." : "Refresh Status"}
            </button>

            <Link
              href="/schedule"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all"
              style={{
                color: "var(--text-secondary)",
                background: "var(--bg-elevated)",
                borderColor: "var(--border)",
              }}
            >
              <Image
                src={calendarIcon}
                alt=""
                width={16}
                height={16}
                className="w-4 h-4"
              />
              Go to Schedule
            </Link>
          </div>

          {bindToken && !linkedWalletBinding && (
            <div
              className="mt-4 rounded-xl border p-3"
              style={{
                background: "var(--bg-elevated)",
                borderColor: "var(--border)",
              }}
            >
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Send this command in Telegram
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p
                  className="text-sm font-semibold break-all"
                  style={{ color: "var(--text-primary)" }}
                >
                  {linkCommand}
                </p>
                <button
                  onClick={handleCopyLinkCommand}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold"
                  style={{
                    color: "var(--text-secondary)",
                    background: "var(--bg-primary)",
                    borderColor: "var(--border)",
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
              {bindTokenExpiresAt && (
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Expires at: {new Date(bindTokenExpiresAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          <div
            className="mt-4 rounded-xl border p-3 text-sm"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          >
            {linkedWalletBinding ? (
              <p>
                ✅ Linked: wallet {linkedWalletBinding.walletAddress} is
                connected to Telegram {linkedWalletBinding.chatId}.
              </p>
            ) : walletAddress ? (
              <p>
                ⏳ This wallet is not linked yet. Request a token and confirm in
                Telegram.
              </p>
            ) : (
              <p>
                Connect your wallet to view and manage Telegram link status.
              </p>
            )}

            {chatBinding?.walletAddress &&
              normalizedChatId &&
              chatBinding.walletAddress !== walletAddress && (
                <p className="mt-2">
                  ⚠️ {normalizedChatId} is currently linked to wallet{" "}
                  {chatBinding.walletAddress}.
                </p>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}
