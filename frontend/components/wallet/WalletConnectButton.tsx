"use client";

import { ConnectButton } from "thirdweb/react";
import { celoChain, thirdwebClient } from "@/lib/celo";

interface WalletConnectButtonProps {
  compact?: boolean;
  label?: string;
}

export function WalletConnectButton({
  compact = false,
  label,
}: WalletConnectButtonProps) {
  return (
    <ConnectButton
      client={thirdwebClient}
      chain={celoChain}
      chains={[celoChain]}
      appMetadata={{
        name: "Eazee",
        url: "https://eazee.app",
        description: "AI WhatsApp marketing with Celo payments",
      }}
      connectButton={{
        label: label || (compact ? "Wallet" : "Connect Wallet"),
        className: compact
          ? "!w-full !min-h-[38px] !rounded-xl !font-semibold !text-xs"
          : "!w-full !min-h-[40px] !rounded-xl !font-semibold !text-sm",
      }}
      detailsModal={{
        showTestnetFaucet: true,
      }}
    />
  );
}
