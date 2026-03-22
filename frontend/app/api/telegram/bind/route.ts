import { NextResponse } from "next/server";
import {
  confirmTelegramBindingToken,
  createTelegramBindingIntent,
  getTelegramBindingByChatId,
  getTelegramBindingByWallet,
  listTelegramBindings,
  upsertTelegramBinding,
} from "@/lib/telegramIdentity";
import {
  consumeWalletAuthChallenge,
  createWalletAuthChallenge,
  getWalletSessionFromRequest,
} from "@/lib/walletAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = String(searchParams.get("chatId") || "").trim();
  const walletAddress = String(searchParams.get("walletAddress") || "")
    .trim()
    .toLowerCase();

  if (chatId) {
    return NextResponse.json({
      binding: await getTelegramBindingByChatId(chatId),
    });
  }

  if (walletAddress) {
    return NextResponse.json({
      binding: await getTelegramBindingByWallet(walletAddress),
    });
  }

  return NextResponse.json({
    bindings: await listTelegramBindings(200),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || "request")
      .trim()
      .toLowerCase();

    if (action === "challenge") {
      const walletAddress = String(body?.walletAddress || "")
        .trim()
        .toLowerCase();
      const chatId = String(body?.chatId || "").trim();

      const challenge = await createWalletAuthChallenge({
        walletAddress,
        chatId: chatId || undefined,
      });

      if (!challenge.ok) {
        return NextResponse.json({ error: challenge.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        action: "challenge",
        challenge: challenge.challenge,
      });
    }

    if (action === "request") {
      const chatId = String(body?.chatId || "").trim();
      const walletAddress = String(body?.walletAddress || "")
        .trim()
        .toLowerCase();

      const activeSession = await getWalletSessionFromRequest(request);
      const sessionWalletMatches =
        activeSession?.walletAddress === walletAddress &&
        Boolean(walletAddress);
      let walletSessionToken: string | undefined;
      let walletSessionExpiresAt: string | undefined;

      if (!sessionWalletMatches) {
        const nonce = String(body?.nonce || "").trim();
        const signature = String(body?.signature || "").trim();

        const verification = await consumeWalletAuthChallenge({
          walletAddress,
          nonce,
          signature,
        });

        if (!verification.ok) {
          return NextResponse.json(
            { error: verification.error },
            { status: 401 },
          );
        }

        walletSessionToken = verification.session.token;
        walletSessionExpiresAt = verification.session.expiresAt;
      }

      const intent = await createTelegramBindingIntent({
        chatId,
        walletAddress,
      });

      if (!intent.ok) {
        return NextResponse.json({ error: intent.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        action: "request",
        chatId: intent.chatId,
        walletAddress: intent.walletAddress,
        token: intent.token,
        expiresAt: intent.expiresAt,
        ttlMinutes: intent.ttlMinutes,
        walletSessionToken: walletSessionToken || null,
        walletSessionExpiresAt: walletSessionExpiresAt || null,
        nextStep:
          "Send /link <token> in your Telegram bot chat to confirm binding.",
      });
    }

    if (action === "confirm") {
      const token = String(body?.token || "").trim();
      const chatId = String(body?.chatId || "").trim();

      const result = await confirmTelegramBindingToken({
        token,
        chatId,
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        action: "confirm",
        binding: result.binding,
      });
    }

    if (action === "upsert") {
      const chatId = String(body?.chatId || "").trim();
      const walletAddress = String(body?.walletAddress || "")
        .trim()
        .toLowerCase();

      const activeSession = await getWalletSessionFromRequest(request);
      const allowInsecureUpsert =
        process.env.EAZEE_ALLOW_INSECURE_BIND_UPSERT?.trim().toLowerCase() ===
        "true";

      if (
        !allowInsecureUpsert &&
        (!activeSession || activeSession.walletAddress !== walletAddress)
      ) {
        return NextResponse.json(
          {
            error:
              "Unauthorized upsert. Sign a challenge first or set EAZEE_ALLOW_INSECURE_BIND_UPSERT=true for local-only bypass.",
          },
          { status: 401 },
        );
      }

      const result = await upsertTelegramBinding({
        chatId,
        walletAddress,
        status: "active",
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        action: "upsert",
        binding: result.binding,
      });
    }

    return NextResponse.json(
      {
        error:
          "Unsupported action. Use action=challenge|request|confirm|upsert",
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("Telegram bind route error:", error);
    return NextResponse.json(
      { error: "Failed to process Telegram binding request" },
      { status: 500 },
    );
  }
}
