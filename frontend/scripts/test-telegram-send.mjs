#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envFilePath = path.join(projectRoot, ".env.local");

function printUsage() {
  console.log(`Usage:
  npm run test:telegram -- --chat-id=<chat_id_or_username> --text="Hello from Eazee"

Options:
  --chat-id=<id>         Telegram chat id or @channelusername (required)
  --text=<message>       Message text (default: Telegram test from Eazee)
  --token=<token>        Telegram bot token override
  --parse-mode=<mode>    Optional parse mode: MarkdownV2, Markdown, or HTML
  --dry-run              Print payload only, do not send
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const result = {
    chatId: "",
    text: "Telegram test from Eazee",
    token: "",
    parseMode: "",
    dryRun: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }

    if (arg.startsWith("--chat-id=")) {
      result.chatId = arg.slice("--chat-id=".length).trim();
      continue;
    }

    if (arg.startsWith("--text=")) {
      const value = arg.slice("--text=".length);
      if (value) {
        result.text = value;
      }
      continue;
    }

    if (arg.startsWith("--token=")) {
      result.token = arg.slice("--token=".length).trim();
      continue;
    }

    if (arg.startsWith("--parse-mode=")) {
      result.parseMode = arg.slice("--parse-mode=".length).trim();
      continue;
    }
  }

  return result;
}

function parseEnv(rawContent) {
  const env = {};
  const lines = rawContent.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (!key) continue;

    env[key] = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }

  return env;
}

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return parseEnv(raw);
}

async function sendTelegramMessage({ endpoint, payload, dryRun }) {
  if (dryRun) {
    return {
      ok: true,
      status: 200,
      data: { dryRun: true, payload },
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok && data?.ok === true,
    status: response.status,
    data,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const localEnv = loadLocalEnv(envFilePath);

  const token =
    args.token || process.env.TELEGRAM_BOT_TOKEN || localEnv.TELEGRAM_BOT_TOKEN;
  const chatId = String(args.chatId || "").trim();
  const parseMode = String(args.parseMode || "").trim();

  if (!token && !args.dryRun) {
    console.error(
      "Missing Telegram token. Set TELEGRAM_BOT_TOKEN or pass --token=<token>.",
    );
    process.exit(1);
  }

  if (!chatId) {
    console.error(
      "Missing Telegram chat id. Pass --chat-id=<chat_id_or_username>.",
    );
    process.exit(1);
  }

  const endpoint = `https://api.telegram.org/bot${token || "dry-run"}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: args.text,
    ...(parseMode ? { parse_mode: parseMode } : {}),
  };

  console.log("Running Telegram send test...");
  console.log(`Chat: ${chatId}`);
  if (args.dryRun) {
    console.log("Mode: dry-run (message will not be sent)");
  }

  const result = await sendTelegramMessage({
    endpoint,
    payload,
    dryRun: args.dryRun,
  });

  if (!result.ok) {
    const errorCode =
      typeof result.data?.error_code === "number"
        ? result.data.error_code
        : result.status;
    const errorMessage =
      typeof result.data?.description === "string"
        ? result.data.description
        : "Telegram send failed";

    console.error(`❌ Telegram send failed (code ${errorCode})`);
    console.error(`   ${errorMessage}`);
    process.exit(1);
  }

  if (result.data?.dryRun) {
    console.log("✅ Dry-run payload prepared successfully.");
    process.exit(0);
  }

  const messageId =
    typeof result.data?.result?.message_id === "number"
      ? result.data.result.message_id
      : "(no message id returned)";

  console.log(`✅ Telegram message sent -> ${messageId}`);
}

main().catch((error) => {
  console.error(
    "Telegram test script failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
