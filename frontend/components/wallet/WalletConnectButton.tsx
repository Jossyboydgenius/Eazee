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
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23d8b4fe'/%3E%3Cstop offset='100%25' stop-color='%237e22ce'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='96' height='96' rx='48' fill='url(%23g)'/%3E%3C/svg%3E";

  const compactConnectButtonClass =
    "eazee-wallet-connect-compact !w-10 !h-10 !min-h-[40px] !max-w-[40px] !min-w-[40px] !rounded-full !p-0 !text-[10px] !overflow-hidden !justify-center";

  const standardConnectButtonClass =
    "eazee-wallet-connect-primary !w-full !min-h-[48px] !rounded-xl !px-4 !py-3 !text-sm !font-semibold !justify-center";

  const compactDetailsButtonClass =
    "eazee-wallet-details-compact !w-10 !h-10 !min-h-[40px] !max-w-[40px] !min-w-[40px] !rounded-full !p-0 !overflow-hidden !justify-center";

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
            ? "w-10 h-10 min-h-[40px] rounded-full font-semibold text-xs opacity-70 cursor-not-allowed border"
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
        description: "AI social marketing with Celo payments",
      }}
      connectButton={{
        label: label || (compact ? "Connect" : "Connect Wallet"),
        className: compact
          ? compactConnectButtonClass
          : standardConnectButtonClass,
      }}
      detailsButton={{
        className: compact ? compactDetailsButtonClass : undefined,
        connectedAccountAvatarUrl: fallbackAvatar,
      }}
      detailsModal={{
        showTestnetFaucet: true,
        connectedAccountAvatarUrl: fallbackAvatar,
        manageWallet: {
          allowLinkingProfiles: false,
        },
      }}
    />
  );
}
