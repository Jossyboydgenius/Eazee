"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import whatsappAiIcon from "@/svg/whatsapp-ai.svg";

const PROTECTED_ROUTES = ["/compose", "/schedule", "/dashboard"];

function isProtectedRoute(pathname: string) {
  return (
    pathname === "/" ||
    PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
  );
}

export function WalletGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const account = useActiveAccount();

  if (!isProtectedRoute(pathname) || account) {
    return <>{children}</>;
  }

  return (
    <div
      className="min-h-screen p-4 sm:p-6 flex items-center justify-center"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="glass-card w-full max-w-md p-6 sm:p-7 text-center">
        <div className="flex items-center justify-center gap-2.5">
          <Image
            src={whatsappAiIcon}
            alt=""
            width={34}
            height={34}
            className="w-8.5 h-8.5"
          />
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Connect Wallet
          </h1>
        </div>

        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          Connect your wallet to continue using Eazee.
        </p>

        <div className="mt-5">
          <WalletConnectButton label="Connect Wallet" />
        </div>

        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
          Network: Celo Sepolia
        </p>
      </div>
    </div>
  );
}
