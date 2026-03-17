import { NextResponse } from "next/server";
import { recordWebhookEvent } from "@/lib/whatsappQueue";

export const runtime = "nodejs";

const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || "";
const legacyVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "";
const activeVerifyToken = verifyToken || legacyVerifyToken;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge") || "";

  if (!activeVerifyToken) {
    return NextResponse.json(
      {
        error:
          "WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured. Set it in frontend/.env.local.",
      },
      { status: 500 },
    );
  }

  if (mode === "subscribe" && token === activeVerifyToken) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return NextResponse.json(
    { error: "Webhook verification failed" },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const event = recordWebhookEvent(payload);
    const summary = summarizeWebhookPayload(payload);

    return NextResponse.json({
      received: true,
      eventId: event.id,
      summary,
    });
  } catch (error) {
    console.error("WhatsApp webhook ingest error:", error);
    return NextResponse.json(
      { error: "Invalid webhook payload" },
      { status: 400 },
    );
  }
}

function summarizeWebhookPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { messages: 0, statuses: 0, entries: 0 };
  }

  const entry = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entry)) {
    return { messages: 0, statuses: 0, entries: 0 };
  }

  let messages = 0;
  let statuses = 0;

  for (const item of entry) {
    const changes =
      item && typeof item === "object"
        ? (item as { changes?: unknown[] }).changes
        : undefined;

    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value =
        change && typeof change === "object"
          ? (
              change as {
                value?: { messages?: unknown[]; statuses?: unknown[] };
              }
            ).value
          : undefined;

      if (Array.isArray(value?.messages)) {
        messages += value.messages.length;
      }

      if (Array.isArray(value?.statuses)) {
        statuses += value.statuses.length;
      }
    }
  }

  return {
    entries: entry.length,
    messages,
    statuses,
  };
}
