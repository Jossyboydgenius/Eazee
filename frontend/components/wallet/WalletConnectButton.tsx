"use client";

import { ConnectButton } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import {
  celoChain,
  thirdwebClientConfigState,
  isThirdwebClientConfigured,
  thirdwebClient,
} from "@/lib/celo";

interface WalletConnectButtonProps {
  compact?: boolean;
  label?: string;
}

export function WalletConnectButton({
  compact = false,
  label,
}: WalletConnectButtonProps) {
  const fallbackAvatar =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='48' fill='%2322c55e'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='Poppins,Arial,sans-serif' font-size='34' font-weight='700' fill='white'%3EW%3C/text%3E%3C/svg%3E";

  const compactButtonClass =
    "!w-full !max-w-full !min-w-0 !h-9 !min-h-[36px] !rounded-xl !font-semibold !text-[11px] !px-2 !overflow-hidden";

  const regularButtonClass =
    "!w-full !max-w-full !min-w-0 !h-10 !min-h-[40px] !rounded-xl !font-semibold !text-sm !px-3";

  const wallets = [
    inAppWallet({ auth: { options: ["google", "apple", "email"] } }),
    createWallet("io.metamask"),
    createWallet("com.coinbase.wallet"),
  ];

  if (!isThirdwebClientConfigured) {
    const labelText =
      thirdwebClientConfigState === "invalid"
        ? "Use a valid Client ID"
        : "Configure wallet key first";

    return (
      <button
        type="button"
        disabled
        className={
          compact
            ? "w-full min-h-[38px] rounded-xl font-semibold text-xs opacity-70 cursor-not-allowed border"
            : "w-full min-h-[40px] rounded-xl font-semibold text-sm opacity-70 cursor-not-allowed border"
        }
        style={{
          borderColor: "var(--border)",
          color: "var(--text-secondary)",
          background: "var(--bg-elevated)",
        }}
      >
        {labelText}
      </button>
    );
  }

  return (
    <ConnectButton
      client={thirdwebClient}
      chain={celoChain}
      chains={[celoChain]}
      wallets={wallets}
      appMetadata={{
        name: "Eazee",
        url: "https://eazee.app",
        description: "AI WhatsApp marketing with Celo payments",
      }}
      connectButton={{
        label: label || (compact ? "Wallet" : "Connect Wallet"),
        className: compact ? compactButtonClass : regularButtonClass,
      }}
      detailsButton={{
        className: compact ? compactButtonClass : regularButtonClass,
      }}
      detailsModal={{
        showTestnetFaucet: true,
        connectedAccountName: "My Wallet",
        connectedAccountAvatarUrl: fallbackAvatar,
        manageWallet: {
          allowLinkingProfiles: false,
        },
      }}
    />
  );
}
