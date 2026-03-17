import Link from "next/link";
import { Compass, ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen p-4 sm:p-6 lg:p-8 flex items-center justify-center"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="glass-card relative overflow-hidden w-full max-w-xl p-8 sm:p-10 text-center">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 50% 0%, var(--brand-dim), transparent 58%)",
          }}
        />

        <div className="relative">
          <div
            className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center border"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border)",
              color: "var(--brand-green)",
            }}
          >
            <Compass className="w-7 h-7" />
          </div>

          <p className="step-label mb-2">404</p>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Lost in the feed?
          </h1>
          <p
            className="text-sm sm:text-base mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            This page doesn&apos;t exist. Let&apos;s get you back to creating
            your next high-converting post.
          </p>

          <div className="mt-7 flex justify-center">
            <Link href="/compose" className="btn-brand">
              Go to Compose
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
