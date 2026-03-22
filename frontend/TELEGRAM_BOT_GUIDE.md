# Telegram Bot Setup Guide (Eazee)

This guide explains how to enable Telegram delivery for Eazee end-to-end.

## 1) What is already integrated in this repo

Telegram outbound sending is already integrated into this project. You do **not** need a separate server just to send scheduled Telegram messages.

Current implementation:

- `lib/telegramBot.ts` → Telegram Bot API `sendMessage` client
- `app/api/telegram/send/route.ts` → direct test/send endpoint
- `app/api/telegram/webhook/route.ts` → inbound updates/commands handler
- `app/api/whatsapp/dispatch-due/route.ts` → queue dispatcher that sends via Telegram when provider is set to `telegram`
- `app/schedule/page.tsx` → Telegram-mode destination validation + forward UX

You only need to configure environment variables and provide valid Telegram destinations (`chat_id` or `@channelusername`).

---

## 2) Create your Telegram bot (BotFather)

1. Open Telegram and search for `@BotFather`.
2. Run `/newbot`.
3. Provide:
   - Bot display name (e.g. `Eazee Bot`)
   - Bot username ending with `bot` (e.g. `eazee_dispatch_bot`)
4. BotFather returns your bot token (format similar to `123456789:AA...`).
5. Save this token securely.

Set in `frontend/.env.local`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_PARSE_MODE=
TELEGRAM_BOT_USERNAME=eazee_dispatch_bot
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_MINI_APP_URL=https://your-domain.com
TELEGRAM_POLLING_WEBHOOK_URL=http://localhost:3000/api/telegram/webhook
```

`TELEGRAM_PARSE_MODE` is optional. For text formatting, Telegram Bot API supports modes such as `MarkdownV2`, `Markdown`, and `HTML`.

`TELEGRAM_MINI_APP_URL` is optional, but if set it must be an HTTPS URL. Telegram rejects inline Web App buttons with non-HTTPS URLs.

## 2b) Bot profile fields (BotFather `/mybots`)

Use these values so your bot profile is complete:

- **Name**: `Eazee`
- **About**: `AI dispatch assistant for Eazee sellers on Telegram.`
- **Description**:

```text
Eazee helps you create captions, schedule campaign posts, and track dispatch performance.
Use /create to start content flow, /dashboard to open metrics, and /help for command menu.
```

- **Description Picture**: upload your branded rectangular logo (`frontend/images/logo.png`).
- **Botpic**: upload a square icon variant of the Eazee logo.
- **Privacy Policy**: `https://your-domain.com/privacy`
- **Commands** (`/setcommands` in BotFather):

```text
start - Start bot and open navigation menu
create - Open create-post flow
dashboard - Open dashboard quick actions
help - List available commands
status - Show provider/webhook/session status
```

---

## 3) Enable Telegram mode in Eazee

Set provider flags in `frontend/.env.local`:

```env
EAZEE_MESSAGING_PROVIDER=telegram
NEXT_PUBLIC_EAZEE_MESSAGING_PROVIDER=telegram
```

Restart the frontend dev server after env updates.

---

## 4) Configure valid destinations (`chat_id`)

Telegram `sendMessage` requires a `chat_id`.

Accepted destination formats in this app:

- Numeric private/group/supergroup/channel chat ID (e.g. `123456789`, `-1001234567890`)
- Public channel username (e.g. `@mychannel`)

### Quick way to discover `chat_id`

1. Send a message in the target chat/channel (or DM your bot).
2. Call:

```bash
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates
```

3. Read `message.chat.id` from the response.

> Tip: For channels, add bot as admin first, then post in channel to ensure updates are visible.

---

## 5) Give bot permissions

### For private chat

- User starts bot with `/start`.

### For group/supergroup

1. Add bot to group.
2. Give send-message rights.
3. If required, disable privacy mode in BotFather (`/setprivacy` → Disable) so bot can process broader updates.

### For channel

1. Add bot as channel admin.
2. Grant permission to post messages.
3. Use channel `@username` or channel `chat_id`.

---

## 6) Validate with the built-in script

From `frontend`:

```bash
npm run test:telegram -- --chat-id=-1001234567890 --text="Hello from Eazee"
npm run test:telegram -- --chat-id=@mychannel --dry-run
```

If this works, Eazee can send via Telegram in live mode.

---

## 7) Runtime flow in production

1. User schedules post in UI (`/schedule`).
2. Job is persisted in queue storage.
3. Cron/manual call hits `POST /api/whatsapp/dispatch-due`.
4. Dispatcher checks `EAZEE_MESSAGING_PROVIDER`.
5. If `telegram`, it calls `sendTelegramTextMessage(...)` and sends to Telegram Bot API.

No extra microservice is required for outbound Telegram messaging in the current architecture.

---

## 8) Open forward action in Schedule

When Telegram mode is enabled (`NEXT_PUBLIC_EAZEE_MESSAGING_PROVIDER=telegram`):

- The Schedule page uses a Telegram-specific forward action/button.
- WhatsApp-forward action is hidden.
- Template fallback UI is hidden (Telegram path does not use WhatsApp template fallback).

---

## 9) Inbound webhook route (already included in this repo)

This project already includes `POST /api/telegram/webhook` for inbound updates.

Register your webhook:

```bash
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-domain.com/api/telegram/webhook
```

If you set `TELEGRAM_WEBHOOK_SECRET`, register with a matching `secret_token` so Telegram sends the `X-Telegram-Bot-Api-Secret-Token` header:

```bash
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-domain.com/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

Inbound commands currently handled in-app:

- `/start`
- `/create`
- `/dashboard`
- `/help`
- `/status`

Inline keyboard callback actions handled in-app:

- `nav:start`
- `nav:create`
- `nav:dashboard`
- `nav:help`

Mini App button support:

- Set `TELEGRAM_MINI_APP_URL` to show an inline `Open Eazee Mini App` button.

---

## 10) Long polling in development

For local development, run:

```bash
npm run dev
```

`npm run dev` now starts:

- Next.js dev server
- Telegram `getUpdates` long polling bridge (when `TELEGRAM_BOT_TOKEN` is set and `TELEGRAM_LOCAL_BOT_AUTOSTART` is not disabled)

The polling bridge forwards each update to your local webhook route so command/callback handling stays consistent with production.

You can still run the bridge manually:

```bash
npm run telegram:poll
```

Optional override:

```bash
npm run telegram:poll -- --webhook-url=http://localhost:3000/api/telegram/webhook --timeout=25
```

Important Telegram API behavior:

- `getUpdates` and `setWebhook` are mutually exclusive.
- The local poller disables webhook automatically unless you pass `--keep-webhook`.

Production should use webhooks (`setWebhook`) instead of long polling.

---

## 11) Feature checklist (implemented)

- ✅ Command handlers (`/start`, `/create`, `/dashboard`, `/help`, `/status`)
- ✅ Inline keyboards for navigation
- ✅ Mini App integration (Web App button)
- ✅ Callback query handling
- ✅ Session management
- ✅ Error handling
- ✅ Logging middleware-style tracing
- ✅ Long polling (dev) & webhooks (prod)

---

## 12) Troubleshooting

- `mode: "mock"` in API responses:
  - `TELEGRAM_BOT_TOKEN` missing/invalid.
- `chat not found`:
  - Wrong `chat_id`, bot not added to target, or channel permissions missing.
- `Forbidden: bot was blocked by the user`:
  - User blocked bot or never started it.
- `400 Bad Request` due to formatting:
  - Invalid `parse_mode` syntax; try plain text first.
- `Bad Request: inline keyboard button Web App URL ... is invalid`:
  - `TELEGRAM_MINI_APP_URL` is missing or not HTTPS. Use `https://...` or unset it.

---

## 13) Minimal env checklist

```env
EAZEE_MESSAGING_PROVIDER=telegram
NEXT_PUBLIC_EAZEE_MESSAGING_PROVIDER=telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_PARSE_MODE=
TELEGRAM_BOT_USERNAME=eazee_dispatch_bot
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_MINI_APP_URL=https://your-domain.com
TELEGRAM_POLLING_WEBHOOK_URL=http://localhost:3000/api/telegram/webhook
TELEGRAM_LOCAL_BOT_AUTOSTART=1
CRON_SECRET=...
```

Recommended: keep WhatsApp keys in `.env.local` as fallback for future dual-mode support.
