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
  npm run test:wa-templates -- --to=2349034018552
  npm run test:wa-templates -- --to=2349034018552 --template=eazee --template=eazeee

Options:
  --to=<phone>           Recipient phone number (required)
  --template=<name>      Extra template name(s) to test (optional, repeatable)
  --language=<code>      Language code for extra templates (default: en_US)
  --version=<v22.0>      Graph API version override
  --phone-id=<id>        WhatsApp phone number ID override
  --token=<token>        WhatsApp access token override
  --dry-run              Print payloads only, do not send
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const result = {
    to: "",
    templates: [],
    language: "en_US",
    version: "",
    phoneId: "",
    token: "",
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

    if (arg.startsWith("--to=")) {
      result.to = arg.slice("--to=".length).trim();
      continue;
    }

    if (arg.startsWith("--template=")) {
      const value = arg.slice("--template=".length).trim();
      if (value) {
        result.templates.push(value);
      }
      continue;
    }

    if (arg.startsWith("--language=")) {
      const value = arg.slice("--language=".length).trim();
      if (value) {
        result.language = value;
      }
      continue;
    }

    if (arg.startsWith("--version=")) {
      result.version = arg.slice("--version=".length).trim();
      continue;
    }

    if (arg.startsWith("--phone-id=")) {
      result.phoneId = arg.slice("--phone-id=".length).trim();
      continue;
    }

    if (arg.startsWith("--token=")) {
      result.token = arg.slice("--token=".length).trim();
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

function normalizePhoneNumber(value) {
  const cleaned = value.replace(/[^\d+]/g, "").trim();
  if (!cleaned) return "";

  if (cleaned.startsWith("+")) {
    return cleaned.slice(1);
  }

  if (cleaned.startsWith("00")) {
    return cleaned.slice(2);
  }

  return cleaned;
}

function buildTemplatePayload(to, scenario) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: scenario.name,
      language: { code: scenario.languageCode },
    },
  };

  if (
    Array.isArray(scenario.bodyParameters) &&
    scenario.bodyParameters.length
  ) {
    payload.template.components = [
      {
        type: "body",
        parameters: scenario.bodyParameters.map((text) => ({
          type: "text",
          text,
        })),
      },
    ];
  }

  return payload;
}

async function sendTemplate({ endpoint, token, payload, dryRun }) {
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
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function toArrayFromPipeSeparated(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const localEnv = loadLocalEnv(envFilePath);

  const accessToken =
    args.token ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    localEnv.WHATSAPP_ACCESS_TOKEN ||
    "";
  const phoneNumberId =
    args.phoneId ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    localEnv.WHATSAPP_PHONE_NUMBER_ID ||
    "";
  const apiVersion =
    args.version ||
    process.env.WHATSAPP_CLOUD_API_VERSION ||
    localEnv.WHATSAPP_CLOUD_API_VERSION ||
    "v22.0";

  const recipient = normalizePhoneNumber(
    args.to ||
      process.env.WHATSAPP_TEST_RECIPIENT ||
      localEnv.WHATSAPP_TEST_RECIPIENT ||
      "",
  );

  if (!recipient) {
    console.error(
      "Missing recipient phone number. Pass --to=<recipient_phone>.",
    );
    process.exit(1);
  }

  if (!accessToken || !phoneNumberId) {
    console.error(
      "Missing WhatsApp Cloud API credentials. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
    );
    process.exit(1);
  }

  const defaultPromoParams = ["Jossy", "Ankara Bundle", "12%", "11:59 PM"];
  const promoParams =
    toArrayFromPipeSeparated(
      process.env.WHATSAPP_PROMO_DYNAMIC_PARAMS ||
        localEnv.WHATSAPP_PROMO_DYNAMIC_PARAMS ||
        "",
    ) || [];

  const scenarios = [
    {
      name: "hello_world",
      languageCode: "en_US",
      bodyParameters: [],
    },
    {
      name: "promo_dynamic_v1",
      languageCode: "en_US",
      bodyParameters: promoParams.length > 0 ? promoParams : defaultPromoParams,
    },
    ...args.templates.map((templateName) => ({
      name: templateName,
      languageCode: args.language,
      bodyParameters: [],
    })),
  ];

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  console.log("Running WhatsApp template checks...");
  console.log(`Recipient: +${recipient}`);
  console.log(
    `Templates: ${scenarios.map((scenario) => scenario.name).join(", ")}`,
  );
  if (args.dryRun) {
    console.log("Mode: dry-run (no messages will be sent)");
  }

  let failures = 0;

  for (const scenario of scenarios) {
    const payload = buildTemplatePayload(recipient, scenario);
    const result = await sendTemplate({
      endpoint,
      token: accessToken,
      payload,
      dryRun: args.dryRun,
    });

    if (result.ok) {
      const messageId =
        Array.isArray(result.data?.messages) && result.data.messages[0]?.id
          ? result.data.messages[0].id
          : "(no message id returned)";
      console.log(
        `✅ ${scenario.name} (${scenario.languageCode}) -> ${messageId}`,
      );
      continue;
    }

    failures += 1;

    const error = result.data?.error || {};
    const errorCode = typeof error.code === "number" ? error.code : "n/a";
    const errorMessage =
      typeof error.message === "string"
        ? error.message
        : `Request failed with status ${result.status}`;

    console.log(
      `❌ ${scenario.name} (${scenario.languageCode}) -> code ${errorCode}`,
    );
    console.log(`   ${errorMessage}`);
  }

  if (failures > 0) {
    process.exit(1);
  }

  console.log("All template checks completed successfully.");
}

main().catch((error) => {
  console.error(
    "Template test script failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
