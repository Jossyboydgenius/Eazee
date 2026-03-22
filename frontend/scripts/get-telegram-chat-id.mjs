#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const defaultStateFile = path.join(
  projectRoot,
  ".data",
  "telegram-webhook-state.json",
);

function printUsage() {
  console.log(`Usage:
  npm run telegram:chat-id
  npm run telegram:chat-id -- --state-file=.data/telegram-webhook-state.json --limit=20

Options:
  --state-file=<path>   Optional state file override (default: .data/telegram-webhook-state.json)
  --limit=<number>      Max sessions to print (default: 20)
  --help                Show this help
`);
}

function parseArgs(argv) {
  const args = {
    stateFile: "",
    limit: 20,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg.startsWith("--state-file=")) {
      args.stateFile = arg.slice("--state-file=".length).trim();
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length).trim());
      if (Number.isFinite(value) && value > 0) {
        args.limit = Math.floor(value);
      }
    }
  }

  return args;
}

function loadStateFile(stateFilePath) {
  if (!fs.existsSync(stateFilePath)) {
    return {
      ok: false,
      error: `State file not found: ${stateFilePath}`,
      sessions: [],
    };
  }

  try {
    const raw = fs.readFileSync(stateFilePath, "utf8");
    const parsed = JSON.parse(raw);
    const sessionsSource =
      parsed && typeof parsed === "object" && parsed.sessions
        ? parsed.sessions
        : {};

    const sessions = Object.values(sessionsSource)
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const session = item;
        return {
          chatId: String(session.chatId || "").trim(),
          updatedAt: String(session.updatedAt || "").trim(),
          interactionCount: Number(session.interactionCount || 0),
          lastCommand: String(session.lastCommand || "").trim(),
          lastText: String(session.lastText || "").trim(),
          lastCallbackData: String(session.lastCallbackData || "").trim(),
        };
      })
      .filter((session) => Boolean(session.chatId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return {
      ok: true,
      error: "",
      sessions,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to parse telegram webhook state file",
      sessions: [],
    };
  }
}

function truncate(value, maxLength = 80) {
  if (!value) {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const stateFilePath = path.resolve(
    projectRoot,
    args.stateFile || defaultStateFile,
  );
  const loaded = loadStateFile(stateFilePath);

  if (!loaded.ok) {
    console.error(`❌ ${loaded.error}`);
    console.error(
      "Tip: run `npm run dev`, message your bot on Telegram, then run this script again.",
    );
    process.exit(1);
  }

  const sessions = loaded.sessions.slice(0, args.limit);

  if (sessions.length === 0) {
    console.log("No Telegram sessions found yet.");
    console.log(
      "Send /start to your bot first, then rerun: npm run telegram:chat-id",
    );
    process.exit(0);
  }

  console.log(`Telegram chat IDs (source: ${stateFilePath})`);
  console.log(`Showing ${sessions.length} session(s)`);

  for (const session of sessions) {
    console.log("---");
    console.log(`chat_id: ${session.chatId}`);
    console.log(`updated_at: ${session.updatedAt || "(unknown)"}`);
    console.log(`interaction_count: ${session.interactionCount}`);
    console.log(`last_command: ${session.lastCommand || "(none)"}`);
    console.log(`last_callback: ${session.lastCallbackData || "(none)"}`);
    console.log(`last_text: ${truncate(session.lastText || "(none)")}`);
  }

  console.log("---");
  console.log(
    "Use these chat_id values in schedule destinations or test scripts.",
  );
}

main();
