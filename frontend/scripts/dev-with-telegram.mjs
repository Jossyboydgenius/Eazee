#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envFilePath = path.join(projectRoot, ".env.local");
const nextDevLockPath = path.join(projectRoot, ".next", "dev", "lock");

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

function pickEnvValue(localEnv, key) {
  return String(process.env[key] || localEnv[key] || "").trim();
}

function isTruthy(value, fallback = false) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function resolveDevPort(args, localEnv) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg.startsWith("--port=")) {
      const value = Number(arg.slice("--port=".length).trim());
      if (Number.isFinite(value) && value > 0) {
        return Math.floor(value);
      }
    }

    if ((arg === "--port" || arg === "-p") && args[index + 1]) {
      const value = Number(args[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        return Math.floor(value);
      }
    }
  }

  const envPort = Number(pickEnvValue(localEnv, "PORT") || "3000");
  if (Number.isFinite(envPort) && envPort > 0) {
    return Math.floor(envPort);
  }

  return 3000;
}

function startProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
}

function forwardSignal(child, signal) {
  if (!child || child.exitCode !== null) {
    return;
  }

  try {
    child.kill(signal);
  } catch {
    // no-op
  }
}

function ensureNextDevLockState(lockFilePath) {
  if (!fs.existsSync(lockFilePath)) {
    return "missing";
  }

  try {
    const fd = fs.openSync(lockFilePath, "r+");
    fs.closeSync(fd);
    fs.unlinkSync(lockFilePath);
    return "stale-cleared";
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      ["EPERM", "EACCES", "EBUSY"].includes(error.code)
    ) {
      return "active";
    }

    return "active";
  }
}

async function main() {
  const localEnv = loadLocalEnv(envFilePath);
  const nextArgs = process.argv.slice(2);
  const port = resolveDevPort(nextArgs, localEnv);

  const nextBinPath = path.join(
    projectRoot,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );

  const nextLockState = ensureNextDevLockState(nextDevLockPath);
  if (nextLockState === "stale-cleared") {
    console.log("[dev-with-telegram] Cleared stale Next.js dev lock file.");
  }

  const nextProcess =
    nextLockState === "active"
      ? null
      : startProcess(process.execPath, [nextBinPath, "dev", ...nextArgs]);

  if (nextLockState === "active") {
    console.log(
      "[dev-with-telegram] Detected existing Next.js dev instance. Reusing it instead of starting a duplicate process.",
    );
  }

  const telegramToken = pickEnvValue(localEnv, "TELEGRAM_BOT_TOKEN");
  const autoStartPolling = isTruthy(
    pickEnvValue(localEnv, "TELEGRAM_LOCAL_BOT_AUTOSTART"),
    true,
  );

  const webhookUrl =
    pickEnvValue(localEnv, "TELEGRAM_POLLING_WEBHOOK_URL") ||
    `http://localhost:${port}/api/telegram/webhook`;

  let pollProcess = null;
  if (telegramToken && autoStartPolling) {
    console.log(
      `[dev-with-telegram] Starting Telegram polling bridge -> ${webhookUrl}`,
    );
    pollProcess = startProcess(process.execPath, [
      path.join(projectRoot, "scripts", "telegram-long-polling.mjs"),
      `--webhook-url=${webhookUrl}`,
    ]);

    pollProcess.on("exit", (code) => {
      if (nextProcess && nextProcess.exitCode === null && (code ?? 0) !== 0) {
        console.error(
          `Telegram polling bridge stopped (code ${code ?? 1}). Stopping dev server.`,
        );
        forwardSignal(nextProcess, "SIGINT");
        return;
      }

      if (nextProcess && nextProcess.exitCode === null && (code ?? 0) === 0) {
        console.log(
          "[dev-with-telegram] Telegram polling bridge is already active in another process.",
        );
        return;
      }

      if (!nextProcess && (code ?? 0) === 0) {
        console.log(
          "[dev-with-telegram] Telegram polling bridge is already active in another process.",
        );
        process.exit(0);
      }

      if (!nextProcess && (code ?? 0) !== 0) {
        console.error(
          `[dev-with-telegram] Telegram polling bridge exited with code ${code ?? 1}.`,
        );
        process.exit(code ?? 1);
      }
    });
  } else {
    const reason = !telegramToken
      ? "TELEGRAM_BOT_TOKEN is missing"
      : "TELEGRAM_LOCAL_BOT_AUTOSTART is disabled";
    console.log(`[dev-with-telegram] Telegram polling not started: ${reason}.`);
  }

  const shutdown = (signal) => {
    forwardSignal(pollProcess, signal);
    forwardSignal(nextProcess, signal);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  if (nextProcess) {
    nextProcess.on("exit", (code) => {
      forwardSignal(pollProcess, "SIGINT");
      process.exit(code ?? 0);
    });
  }

  if (!nextProcess && !pollProcess) {
    process.exit(0);
  }
}

main().catch((error) => {
  console.error(
    "dev-with-telegram failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
