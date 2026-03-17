import { NextResponse } from "next/server";
import {
  isWhatsAppCloudConfigured,
  sendWhatsAppTextMessage,
} from "@/lib/whatsappCloud";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const to = String(body?.to || "");
    const textBody = String(body?.body || "");
    const targetType = String(body?.targetType || "individual");
    const contextMessageId =
      typeof body?.contextMessageId === "string"
        ? body.contextMessageId
        : undefined;

    if (!to || !textBody) {
      return NextResponse.json(
        { error: "Missing required fields: to, body" },
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

    const result = await sendWhatsAppTextMessage({
      to,
      body: textBody,
      contextMessageId,
    });

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
  return NextResponse.json({
    configured: isWhatsAppCloudConfigured(),
    supportedRecipientType: "individual",
    endpoint: "POST /api/whatsapp/send",
  });
}
