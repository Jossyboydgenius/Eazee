const apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v19.0";
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
const deadlineTemplateName =
  process.env.WHATSAPP_DEADLINE_TEMPLATE_NAME?.trim() || "";
const deadlineTemplateLanguageCode =
  process.env.WHATSAPP_DEADLINE_TEMPLATE_LANGUAGE?.trim() || "en_US";
const deadlineTemplateBodyParams = parseTemplateBodyParams(
  process.env.WHATSAPP_DEADLINE_TEMPLATE_BODY_PARAMS,
);

export interface SendWhatsAppTextInput {
  to: string;
  body: string;
  contextMessageId?: string;
}

export interface SendWhatsAppTemplateInput {
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParameters?: string[];
  headerImageUrl?: string;
}

export interface SendWhatsAppMessageWithFallbackInput extends SendWhatsAppTextInput {
  enableDeadlineTemplateFallback?: boolean;
  fallbackTemplateName?: string;
  fallbackTemplateLanguageCode?: string;
  fallbackTemplateBodyParameters?: string[];
  fallbackTemplateHeaderImageUrl?: string;
}

export interface WhatsAppTemplateFallbackConfig {
  enabled: boolean;
  templateName: string;
  languageCode: string;
  bodyParameterCount: number;
}

export interface SendWhatsAppTextResult {
  ok: boolean;
  status: number;
  mode: "live" | "mock";
  messageId?: string;
  error?: string;
  data: unknown;
}

export function isWhatsAppCloudConfigured(): boolean {
  return Boolean(accessToken && phoneNumberId);
}

export function getWhatsAppTemplateFallbackConfig(): WhatsAppTemplateFallbackConfig {
  return {
    enabled: Boolean(deadlineTemplateName),
    templateName: deadlineTemplateName,
    languageCode: deadlineTemplateLanguageCode,
    bodyParameterCount: deadlineTemplateBodyParams.length,
  };
}

export async function sendWhatsAppTextMessage(
  input: SendWhatsAppTextInput,
): Promise<SendWhatsAppTextResult> {
  const to = normalizePhoneNumber(input.to);
  const body = input.body.trim();

  if (!to || !body) {
    return {
      ok: false,
      status: 400,
      mode: "mock",
      error: "Missing valid 'to' number or text body",
      data: null,
    };
  }

  if (!isWhatsAppCloudConfigured()) {
    return {
      ok: true,
      status: 200,
      mode: "mock",
      messageId: createMockMessageId(),
      data: {
        warning:
          "WhatsApp Cloud API not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID for live dispatch.",
      },
    };
  }

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      body,
      preview_url: false,
    },
  };

  if (input.contextMessageId) {
    payload.context = {
      message_id: input.contextMessageId,
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await safeParseJson(response);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      mode: "live",
      error:
        mapKnownGraphErrorMessage(data) ||
        getGraphErrorMessage(data) ||
        "WhatsApp Cloud API send failed",
      data,
    };
  }

  return {
    ok: true,
    status: response.status,
    mode: "live",
    messageId: getGraphMessageId(data),
    data,
  };
}

export async function sendWhatsAppTemplateMessage(
  input: SendWhatsAppTemplateInput,
): Promise<SendWhatsAppTextResult> {
  const to = normalizePhoneNumber(input.to);
  const templateName = input.templateName.trim();
  const languageCode = (input.languageCode || "en_US").trim() || "en_US";
  const bodyParameters = normalizeTemplateBodyParameters(input.bodyParameters);
  const headerImageUrl = normalizeTemplateHeaderImageUrl(input.headerImageUrl);

  if (!to || !templateName) {
    return {
      ok: false,
      status: 400,
      mode: "mock",
      error: "Missing valid 'to' number or template name",
      data: null,
    };
  }

  if (!isWhatsAppCloudConfigured()) {
    return {
      ok: true,
      status: 200,
      mode: "mock",
      messageId: createMockMessageId(),
      data: {
        warning:
          "WhatsApp Cloud API not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID for live dispatch.",
      },
    };
  }

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const components: Array<
    | {
        type: "header";
        parameters: Array<{
          type: "image";
          image: { link: string };
        }>;
      }
    | {
        type: "body";
        parameters: Array<{ type: "text"; text: string }>;
      }
  > = [];

  if (headerImageUrl) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: { link: headerImageUrl },
        },
      ],
    });
  }

  if (bodyParameters.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParameters.map((value) => ({
        type: "text",
        text: value,
      })),
    });
  }

  const template: {
    name: string;
    language: { code: string };
    components?: typeof components;
  } = {
    name: templateName,
    language: { code: languageCode },
  };

  if (components.length > 0) {
    template.components = components;
  }

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await safeParseJson(response);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      mode: "live",
      error:
        mapKnownGraphErrorMessage(data) ||
        getGraphErrorMessage(data) ||
        "WhatsApp Cloud API template send failed",
      data,
    };
  }

  return {
    ok: true,
    status: response.status,
    mode: "live",
    messageId: getGraphMessageId(data),
    data,
  };
}

export async function sendWhatsAppMessageWithDeadlineFallback(
  input: SendWhatsAppMessageWithFallbackInput,
): Promise<SendWhatsAppTextResult> {
  const textResult = await sendWhatsAppTextMessage(input);

  if (textResult.ok || textResult.mode === "mock") {
    return textResult;
  }

  const enableFallback = input.enableDeadlineTemplateFallback !== false;
  if (!enableFallback || !isLikelyTemplateRequiredError(textResult)) {
    return textResult;
  }

  const templateName =
    input.fallbackTemplateName?.trim() || deadlineTemplateName;

  if (!templateName) {
    return textResult;
  }

  const templateLanguageCode =
    input.fallbackTemplateLanguageCode?.trim() || deadlineTemplateLanguageCode;
  const normalizedFallbackParameters = normalizeTemplateBodyParameters(
    input.fallbackTemplateBodyParameters,
  );
  const templateBodyParameters =
    normalizedFallbackParameters.length > 0
      ? normalizedFallbackParameters
      : deadlineTemplateBodyParams;

  const templateResult = await sendWhatsAppTemplateMessage({
    to: input.to,
    templateName,
    languageCode: templateLanguageCode,
    bodyParameters: templateBodyParameters,
    headerImageUrl: input.fallbackTemplateHeaderImageUrl,
  });

  if (templateResult.ok) {
    return {
      ...templateResult,
      data: {
        fallbackApplied: true,
        fallbackReason: textResult.error || "Text send rejected",
        initialTextAttempt: textResult.data,
        templateAttempt: templateResult.data,
      },
    };
  }

  return {
    ...templateResult,
    error: `${textResult.error || "Text send failed"} | Template fallback failed: ${templateResult.error || "Unknown error"}`,
    data: {
      fallbackApplied: true,
      initialTextAttempt: textResult.data,
      templateAttempt: templateResult.data,
    },
  };
}

function getGraphMessageId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const messages = (data as { messages?: Array<{ id?: unknown }> }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return undefined;

  const value = messages[0]?.id;
  return typeof value === "string" ? value : undefined;
}

function getGraphErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "";

  const error = (data as { error?: { message?: unknown } }).error;
  if (!error || typeof error !== "object") return "";

  const message = error.message;
  return typeof message === "string" ? message : "";
}

function getGraphErrorCode(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;

  const error = (data as { error?: { code?: unknown } }).error;
  if (!error || typeof error !== "object") return undefined;

  const code = error.code;
  return typeof code === "number" ? code : undefined;
}

function getGraphErrorSubcode(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;

  const error = (data as { error?: { error_subcode?: unknown } }).error;
  if (!error || typeof error !== "object") return undefined;

  const subcode = error.error_subcode;
  return typeof subcode === "number" ? subcode : undefined;
}

function mapKnownGraphErrorMessage(data: unknown): string {
  const code = getGraphErrorCode(data);
  const subcode = getGraphErrorSubcode(data);

  if (code === 190 && subcode === 467) {
    return "WhatsApp access token session is invalid (190/467). Generate a new permanent System User token in Meta Business Manager and update WHATSAPP_ACCESS_TOKEN.";
  }

  if (code === 190) {
    return "WhatsApp access token is invalid or expired (code 190). Update WHATSAPP_ACCESS_TOKEN with a valid long-lived token.";
  }

  if (code === 10 || code === 200) {
    return "WhatsApp API permission error. Confirm your app is connected to the phone number and has whatsapp_business_messaging permission.";
  }

  if (code === 131030) {
    return "Recipient phone number is not in your WhatsApp API test allowlist (131030). Add and verify that recipient in Meta App Dashboard → WhatsApp → API Setup, or complete app/business go-live to message non-allowlisted users.";
  }

  return "";
}

function isLikelyTemplateRequiredError(
  result: SendWhatsAppTextResult,
): boolean {
  if (result.mode !== "live") return false;

  const code = getGraphErrorCode(result.data);
  if (code === 131047 || code === 470) {
    return true;
  }

  const errorText = `${result.error || ""}`.toLowerCase();
  return (
    errorText.includes("24-hour") ||
    errorText.includes("24 hour") ||
    errorText.includes("customer service window") ||
    errorText.includes("outside the allowed window") ||
    errorText.includes("template")
  );
}

function parseTemplateBodyParams(raw: string | undefined): string[] {
  if (!raw) return [];

  return raw
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeTemplateBodyParameters(
  values: string[] | undefined,
): string[] {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => `${value}`.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeTemplateHeaderImageUrl(value: string | undefined): string {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return "";
}

function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = trimmed.replace(/[^\d+]/g, "");

  if (normalized.startsWith("+")) {
    return normalized;
  }

  if (normalized.startsWith("00")) {
    return `+${normalized.slice(2)}`;
  }

  return `+${normalized}`;
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function createMockMessageId(): string {
  return `wamid.mock.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
}
