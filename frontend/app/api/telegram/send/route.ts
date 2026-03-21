import { NextResponse } from "next/server";
import {
  isTelegramBotConfigured,
  sendTelegramTextMessage,
} from "@/lib/telegramBot";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const chatId = String(body?.chatId || body?.to || "").trim();
    const text = String(body?.text || body?.body || "").trim();
    const parseMode =
      typeof body?.parseMode === "string" ? body.parseMode.trim() : undefined;

    if (!chatId) {
      return NextResponse.json(
        { error: "Missing required field: chatId (or to)" },
        { status: 400 },
      );
    }

    if (!text) {
      return NextResponse.json(
        { error: "Missing required field: text (or body)" },
        { status: 400 },
      );
    }

    const result = await sendTelegramTextMessage({
      chatId,
      text,
      parseMode,
      disableLinkPreview: body?.disableLinkPreview === true,
      disableNotification: body?.disableNotification === true,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error || "Failed to send Telegram message",
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
    console.error("Telegram send route error:", error);
    return NextResponse.json(
      { error: "Failed to send Telegram message" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    configured: isTelegramBotConfigured(),
    supportedRecipientType: "chat_id",
    supportedMessageTypes: ["text"],
    endpoint: "POST /api/telegram/send",
  });
}
