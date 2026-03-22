"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import {
  isThirdwebClientConfigured,
  thirdwebClientConfigState,
} from "@/lib/celo";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import appLogo from "@/images/logo.png";

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

  const helperText =
    thirdwebClientConfigState === "invalid"
      ? "NEXT_PUBLIC_THIRDWEB_CLIENT_ID is invalid. Use your public Client ID (not the Secret Key)."
      : "Add NEXT_PUBLIC_THIRDWEB_CLIENT_ID in .env.local, then restart dev server.";

  const footerText =
    thirdwebClientConfigState === "invalid"
      ? "Client ID format is a 32-character hex string from thirdweb dashboard."
      : "Get keys at thirdweb.com/dashboard";

  if (!isProtectedRoute(pathname) || account) {
    return <>{children}</>;
  }

  return (
    <div
      className="min-h-screen p-4 sm:p-6 flex items-center justify-center"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="glass-card w-full max-w-xl p-6 sm:p-7 text-center">
        <div className="flex items-center justify-center mb-3">
          <Image
            src={appLogo}
            alt=""
            width={320}
            height={92}
            className="w-[176px] sm:w-[208px] h-auto object-contain object-center"
          />
        </div>

        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Connect Wallet
        </h1>

        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          {isThirdwebClientConfigured
            ? "Connect your wallet to continue using Eazee."
            : helperText}
        </p>

        <div className="mt-6">
          <WalletConnectButton label="Connect Wallet" />
        </div>

        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
          {isThirdwebClientConfigured ? "Network: Celo Sepolia" : footerText}
        </p>
      </div>
    </div>
  );
}
