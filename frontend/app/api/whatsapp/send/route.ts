import { NextResponse } from "next/server";
import {
  getWhatsAppTemplateFallbackConfig,
  isWhatsAppCloudConfigured,
  sendWhatsAppMessageWithDeadlineFallback,
  sendWhatsAppTemplateMessage,
} from "@/lib/whatsappCloud";

export const runtime = "nodejs";

function getGraphErrorCode(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;

  const error = (data as { error?: { code?: unknown } }).error;
  if (!error || typeof error !== "object") return undefined;

  return typeof error.code === "number" ? error.code : undefined;
}

function getGraphErrorSubcode(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;

  const error = (data as { error?: { error_subcode?: unknown } }).error;
  if (!error || typeof error !== "object") return undefined;

  return typeof error.error_subcode === "number"
    ? error.error_subcode
    : undefined;
}

function shouldAllowMvpTemplateBypass(body: unknown): boolean {
  const envMode = process.env.WHATSAPP_TEMPLATE_TEST_MODE?.trim().toLowerCase();
  if (envMode === "mock" || envMode === "mvp") {
    return true;
  }

  if (!body || typeof body !== "object") {
    return false;
  }

  return (
    (body as { allowMvpTemplateBypass?: unknown }).allowMvpTemplateBypass ===
    true
  );
}

function isMvpBypassCandidate(
  error: string | undefined,
  data: unknown,
): boolean {
  const code = getGraphErrorCode(data);
  const subcode = getGraphErrorSubcode(data);
  const errorText = `${error || ""}`.toLowerCase();

  if (
    code === 190 ||
    subcode === 467 ||
    code === 10 ||
    code === 200 ||
    code === 131030
  ) {
    return true;
  }

  return (
    errorText.includes("under review") ||
    errorText.includes("not approved") ||
    errorText.includes("permission") ||
    errorText.includes("invalid") ||
    errorText.includes("logged out") ||
    errorText.includes("allowed list")
  );
}

function buildMvpTemplateManualUrl(to: string, templateName: string): string {
  const digits = to.replace(/\D/g, "");
  const previewText = encodeURIComponent(
    `MVP template preview (${templateName})`,
  );

  if (digits) {
    return `https://wa.me/${digits}?text=${previewText}`;
  }

  return `https://wa.me/?text=${previewText}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const to = String(body?.to || "");
    const textBody = String(body?.body || "");
    const type = String(
      body?.type ||
        (typeof body?.templateName === "string" ? "template" : "text"),
    );
    const targetType = String(body?.targetType || "individual");
    const contextMessageId =
      typeof body?.contextMessageId === "string"
        ? body.contextMessageId
        : undefined;
    const templateName =
      typeof body?.templateName === "string" ? body.templateName.trim() : "";
    const templateLanguageCode =
      typeof body?.templateLanguageCode === "string"
        ? body.templateLanguageCode.trim()
        : undefined;
    const templateBodyParameters = Array.isArray(body?.templateBodyParameters)
      ? body.templateBodyParameters
          .map((value: unknown) => String(value).trim())
          .filter(Boolean)
      : undefined;
    const templateHeaderImageUrl =
      typeof body?.templateHeaderImageUrl === "string"
        ? body.templateHeaderImageUrl.trim()
        : undefined;
    const enableDeadlineTemplateFallback =
      body?.enableDeadlineTemplateFallback !== false;
    const allowMvpTemplateBypass = shouldAllowMvpTemplateBypass(body);

    if (!to) {
      return NextResponse.json(
        { error: "Missing required field: to" },
        { status: 400 },
      );
    }

    if (targetType !== "individual") {
      return NextResponse.json(
        {
          error:
            "WhatsApp Cloud API send endpoint supports individual recipient dispatch only. Map target groups/broadcast/channel to recipient numbers first.",
        },
        { status: 422 },
      );
    }

    let result;

    if (type === "template") {
      if (!templateName) {
        return NextResponse.json(
          {
            error:
              "Missing required field: templateName (required when type='template').",
          },
          { status: 400 },
        );
      }

      result = await sendWhatsAppTemplateMessage({
        to,
        templateName,
        languageCode: templateLanguageCode,
        bodyParameters: templateBodyParameters,
        headerImageUrl: templateHeaderImageUrl,
      });

      if (
        !result.ok &&
        allowMvpTemplateBypass &&
        isMvpBypassCandidate(result.error, result.data)
      ) {
        return NextResponse.json({
          success: true,
          mode: "mock",
          messageId: `wamid.mvp.${Date.now()}`,
          data: {
            mvpBypass: true,
            warning:
              "Template send is in MVP bypass mode (live delivery blocked).",
            liveError: result.error,
            liveDetails: result.data,
            manualSendUrl: buildMvpTemplateManualUrl(to, templateName),
          },
        });
      }
    } else {
      if (!textBody) {
        return NextResponse.json(
          {
            error: "Missing required field: body (required when type='text').",
          },
          { status: 400 },
        );
      }

      result = await sendWhatsAppMessageWithDeadlineFallback({
        to,
        body: textBody,
        contextMessageId,
        enableDeadlineTemplateFallback,
        fallbackTemplateName: templateName || undefined,
        fallbackTemplateLanguageCode: templateLanguageCode,
        fallbackTemplateBodyParameters: templateBodyParameters,
        fallbackTemplateHeaderImageUrl: templateHeaderImageUrl,
      });
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error || "Failed to send WhatsApp message",
          mode: result.mode,
          details: result.data,
        },
        { status: result.status || 502 },
      );
    }

    return NextResponse.json({
      success: true,
      mode: result.mode,
      messageId: result.messageId,
      data: result.data,
    });
  } catch (error) {
    console.error("WhatsApp send route error:", error);
    return NextResponse.json(
      { error: "Failed to send WhatsApp message" },
      { status: 500 },
    );
  }
}

export async function GET() {
  const templateFallback = getWhatsAppTemplateFallbackConfig();

  return NextResponse.json({
    configured: isWhatsAppCloudConfigured(),
    supportedRecipientType: "individual",
    supportedMessageTypes: ["text", "template"],
    deadlineTemplateFallback: templateFallback,
    endpoint: "POST /api/whatsapp/send",
  });
}
