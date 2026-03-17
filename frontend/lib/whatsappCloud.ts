const apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v19.0";
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";

export interface SendWhatsAppTextInput {
  to: string;
  body: string;
  contextMessageId?: string;
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
      error: getGraphErrorMessage(data) || "WhatsApp Cloud API send failed",
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
