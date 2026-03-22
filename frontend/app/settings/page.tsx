import Link from "next/link";
import { ArrowUpRight, Send, Settings } from "lucide-react";

const TELEGRAM_BOT_USERNAME =
  process.env.TELEGRAM_BOT_USERNAME?.trim() || "eazee_dispatch_bot";

export default function SettingsPage() {
  return (
    <div
      className="min-h-screen p-4 sm:p-6 lg:p-8"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="mb-6">
        <p className="step-label mb-1">Settings</p>
        <h1
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Account &amp; Integrations
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Manage account connections and Telegram binding.
        </p>
      </div>

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
              Use your Telegram bot chat to confirm wallet-to-chat binding for
              dashboard access and scheduled delivery ownership.
            </p>

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
                Quick steps
              </p>
              <ol
                className="mt-2 space-y-1 text-sm list-decimal list-inside"
                style={{ color: "var(--text-secondary)" }}
              >
                <li>Connect your wallet in the app.</li>
                <li>Generate a binding token from Telegram bind flow.</li>
                <li>
                  In Telegram, open @{TELEGRAM_BOT_USERNAME} and send:
                  <span
                    className="ml-1 font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    /link &lt;token&gt;
                  </span>
                </li>
              </ol>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
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

              <Link
                href="/schedule"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all"
                style={{
                  color: "var(--text-secondary)",
                  background: "var(--bg-elevated)",
                  borderColor: "var(--border)",
                }}
              >
                Go to Schedule
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
