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
  npm run telegram:poll
  npm run telegram:poll -- --webhook-url=http://localhost:3000/api/telegram/webhook

Options:
  --token=<token>             Telegram bot token override
  --webhook-url=<url>         Local webhook URL (default: http://localhost:3000/api/telegram/webhook)
  --secret=<secret>           Optional webhook secret header override
  --timeout=<seconds>         Telegram getUpdates timeout, default 25
  --help                      Show this help
`);
}

function parseArgs(argv) {
  const args = {
    token: "",
    webhookUrl: "",
    secret: "",
    timeoutSeconds: 25,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg.startsWith("--token=")) {
      args.token = arg.slice("--token=".length).trim();
      continue;
    }

    if (arg.startsWith("--webhook-url=")) {
      args.webhookUrl = arg.slice("--webhook-url=".length).trim();
      continue;
    }

    if (arg.startsWith("--secret=")) {
      args.secret = arg.slice("--secret=".length).trim();
      continue;
    }

    if (arg.startsWith("--timeout=")) {
      const timeoutCandidate = Number(arg.slice("--timeout=".length).trim());
      if (Number.isFinite(timeoutCandidate) && timeoutCandidate >= 1) {
        args.timeoutSeconds = Math.floor(timeoutCandidate);
      }
    }
  }

  return args;
}

function parseEnv(rawContent) {
  const env = {};
  const lines = rawContent.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (!key) {
      continue;
    }

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function fetchUpdates({ token, offset, timeoutSeconds }) {
  const endpoint = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  endpoint.searchParams.set("offset", String(offset));
  endpoint.searchParams.set("timeout", String(timeoutSeconds));
  endpoint.searchParams.set(
    "allowed_updates",
    JSON.stringify(["message", "callback_query"]),
  );

  const response = await fetch(endpoint.toString(), {
    method: "GET",
  });

  const data = await safeJson(response);
  if (!response.ok || data?.ok !== true || !Array.isArray(data?.result)) {
    return {
      ok: false,
      status: response.status,
      result: [],
      error:
        typeof data?.description === "string"
          ? data.description
          : "Telegram getUpdates failed",
    };
  }

  return {
    ok: true,
    status: response.status,
    result: data.result,
    error: "",
  };
}

async function forwardUpdateToWebhook({ update, webhookUrl, secret }) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (secret) {
    headers["X-Telegram-Bot-Api-Secret-Token"] = secret;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(update),
  });

  const data = await safeJson(response);

  return {
    ok: response.ok,
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
  const webhookUrl =
    args.webhookUrl ||
    process.env.TELEGRAM_POLLING_WEBHOOK_URL ||
    localEnv.TELEGRAM_POLLING_WEBHOOK_URL ||
    "http://localhost:3000/api/telegram/webhook";
  const secret =
    args.secret ||
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    localEnv.TELEGRAM_WEBHOOK_SECRET ||
    "";

  if (!token) {
    console.error(
      "Missing TELEGRAM_BOT_TOKEN. Set it in .env.local or pass --token.",
    );
    process.exit(1);
  }

  if (!isValidHttpUrl(webhookUrl)) {
    console.error(`Invalid webhook URL: ${webhookUrl}`);
    process.exit(1);
  }

  console.log("Starting Telegram long polling...");
  console.log(`Webhook target: ${webhookUrl}`);
  console.log(`Timeout seconds: ${args.timeoutSeconds}`);

  let offset = 0;

  while (true) {
    try {
      const updatesResponse = await fetchUpdates({
        token,
        offset,
        timeoutSeconds: args.timeoutSeconds,
      });

      if (!updatesResponse.ok) {
        console.error(
          `Polling error (${updatesResponse.status}): ${updatesResponse.error}`,
        );
        await sleep(1500);
        continue;
      }

      for (const update of updatesResponse.result) {
        const updateId =
          typeof update?.update_id === "number"
            ? update.update_id
            : Number(update?.update_id || 0);

        if (Number.isFinite(updateId) && updateId >= offset) {
          offset = updateId + 1;
        }

        const webhookResult = await forwardUpdateToWebhook({
          update,
          webhookUrl,
          secret,
        });

        if (!webhookResult.ok) {
          console.error(
            `Forward failed (${webhookResult.status}) for update ${String(updateId)}:`,
            webhookResult.data,
          );
          continue;
        }

        console.log(
          `Forwarded update ${String(updateId)} -> webhook (${webhookResult.status})`,
        );
      }
    } catch (error) {
      console.error(
        "Polling loop error:",
        error instanceof Error ? error.message : String(error),
      );
      await sleep(1500);
    }
  }
}

main().catch((error) => {
  console.error(
    "telegram-long-polling failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
