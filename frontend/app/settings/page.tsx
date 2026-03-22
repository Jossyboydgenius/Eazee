import TelegramLinkPanel from "@/components/settings/TelegramLinkPanel";

const TELEGRAM_BOT_USERNAME =
  process.env.TELEGRAM_BOT_USERNAME?.trim() || "eazee_dispatch_bot";

export default function SettingsPage() {
  const telegramBotUsername =
    process.env.TELEGRAM_BOT_USERNAME?.trim() || TELEGRAM_BOT_USERNAME;

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

      <TelegramLinkPanel botUsername={telegramBotUsername} />
    </div>
  );
}
