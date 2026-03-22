# Scripts Reference (`frontend/scripts`)

This document explains what each script does, how to run it, expected output, and how to fix common errors.

## Quick start order (Telegram)

1. Start local app + poller

```bash
npm run dev
```

2. Message your bot on Telegram (`/start`)
3. Get your real `chat_id`

```bash
npm run telegram:chat-id
```

4. Send direct Telegram test

```bash
npm run test:telegram -- --chat-id=<chat_id> --text="Hello from Eazee"
```

---

## 1) `dev-with-telegram.mjs`

### Purpose

- Starts Next.js dev server.
- Auto-starts Telegram long-polling bridge when `TELEGRAM_BOT_TOKEN` exists.
- Prevents duplicate Next.js dev processes by checking `.next/dev/lock`.

### Run

```bash
npm run dev
```

### Expected output

- New dev process:
  - `[dev-with-telegram] Starting Telegram polling bridge -> http://localhost:3000/api/telegram/webhook`
  - `▲ Next.js ...`
  - `✓ Ready ...`
- If Next already running:
  - `[dev-with-telegram] Detected existing Next.js dev instance. Reusing it instead of starting a duplicate process.`

### Notes

- This is the default entrypoint for local development.
- Stop with `Ctrl+C` in the terminal where you started it.

---

## 2) `telegram-long-polling.mjs`

### Purpose

- Uses Telegram `getUpdates` in local development.
- Forwards every update to local webhook route `/api/telegram/webhook`.
- Adds lock file guard so only one poller runs (`.data/telegram-polling.lock`).

### Run

```bash
npm run telegram:poll
```

Optional:

```bash
npm run telegram:poll -- --webhook-url=http://localhost:3000/api/telegram/webhook --timeout=25
```

### Expected output

- Startup:
  - `Starting Telegram long polling...`
  - `Webhook target: http://localhost:3000/api/telegram/webhook`
- Per update:
  - `Forwarded update <id> -> webhook (200)`
  - `Webhook handled update <id>: action=..., commandHandled=..., replyMode=..., replyError=...`

### Why you saw this message

`Another telegram:poll process appears to be running (pid XXXX). Reusing existing poller.`

It means a poller is already active (expected when one terminal already started polling). This is not a failure.

### One poller rule

Telegram supports one active `getUpdates` consumer per bot token. Keep exactly one poller process running.

---

## 3) `test-telegram-send.mjs`

### Purpose

- Sends one direct Telegram message through Bot API `sendMessage`.
- Validates bot token + destination `chat_id` quickly.

### Run

```bash
npm run test:telegram -- --chat-id=<chat_id_or_username> --text="Hello from Eazee"
```

Dry-run:

```bash
npm run test:telegram -- --chat-id=<chat_id_or_username> --dry-run
```

### Expected output

- Success: `✅ Telegram message sent -> <message_id>`
- Dry-run: `✅ Dry-run payload prepared successfully.`
- Missing chat id:
  - `Missing Telegram chat id. Pass --chat-id=<chat_id_or_username>.`

---

## 4) `get-telegram-chat-id.mjs` (new)

### Purpose

- Reads known Telegram sessions from `.data/telegram-webhook-state.json`.
- Prints discovered `chat_id` values and recent activity.

### Run

```bash
npm run telegram:chat-id
```

Optional:

```bash
npm run telegram:chat-id -- --limit=50
```

### Expected output

- With known sessions: list of `chat_id`, `updated_at`, `last_command`, `last_text`.
- No sessions yet:
  - `No Telegram sessions found yet.`
  - `Send /start to your bot first, then rerun: npm run telegram:chat-id`

### Important

- If state file doesn’t exist yet, first run `npm run dev`, message your bot, then rerun this command.

---

## 5) `test-whatsapp-templates.mjs`

### Purpose

- Sends WhatsApp template test messages to verify Cloud API setup.

### Run

```bash
npm run test:wa-templates -- --to=2349034018552
```

With extra templates:

```bash
npm run test:wa-templates -- --to=2349034018552 --template=eazee --template=eazeee
```

### Expected output

- Success per template:
  - `✅ <template_name> (<language>) -> <message_id>`
- Missing recipient:
  - `Missing recipient phone number. Pass --to=<recipient_phone>.`

---

## Get real Telegram `chat_id` (production-safe guide)

### Method A (recommended in this project)

1. Run `npm run dev`
2. DM your bot and send `/start`
3. Run `npm run telegram:chat-id`
4. Copy the printed `chat_id` into:
   - schedule destination field
   - `npm run test:telegram -- --chat-id=<that_id>`

### Method B (raw Telegram API)

1. Message your bot first.
2. Call:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates
```

3. Copy `message.chat.id`.

---

## What “100% working” requires (Telegram end-to-end)

- Bot created in BotFather and token set in `.env.local`.
- `EAZEE_MESSAGING_PROVIDER=telegram` and `NEXT_PUBLIC_EAZEE_MESSAGING_PROVIDER=telegram` set.
- Real `chat_id` captured and used for each destination.
- Exactly one polling process locally (or webhook mode in production).
- In production, configure Telegram `setWebhook` to `/api/telegram/webhook` with optional secret token.
- Destination governance:
  - private chats: user must start bot (`/start`)
  - groups/channels: bot must be added and granted send permissions

---

## Troubleshooting map (based on your logs)

- `Missing Telegram chat id...`
  - Add `--chat-id=<real_chat_id>`.
- `Another telegram:poll process appears to be running...`
  - Poller already running; keep one process only.
- `Detected existing Next.js dev instance...`
  - Dev server already active; expected safe reuse.
- `chat not found`
  - Invalid chat ID or bot lacks permission in that chat.
