import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/layout/Sidebar";
import { WalletGate } from "@/components/wallet/WalletGate";

export const metadata: Metadata = {
  title: "Eazee — AI WhatsApp Marketing on Celo",
  description:
    "Upload products, generate AI captions, schedule posts, and accept cUSD payments via Celo blockchain — all from one dashboard.",
  keywords: [
    "WhatsApp marketing",
    "AI caption generator",
    "Celo",
    "cUSD",
    "web3 marketing",
  ],
  openGraph: {
    title: "Eazee — AI WhatsApp Marketing on Celo",
    description:
      "The AI marketing agent for WhatsApp sellers, powered by Celo.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-dvh overflow-hidden">
        <Providers>
          <WalletGate>
            <div className="flex h-full overflow-hidden">
              {/* Sidebar — hidden on mobile (drawer handles mobile) */}
              <Sidebar />
              {/* Main content — has top padding on mobile to account for fixed topbar */}
              <main className="flex-1 min-w-0 pt-14 md:pt-0 overflow-x-hidden overflow-y-auto">
                {children}
              </main>
            </div>
          </WalletGate>
        </Providers>
      </body>
    </html>
  );
}
