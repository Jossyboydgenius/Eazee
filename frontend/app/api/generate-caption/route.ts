import { NextResponse } from "next/server";
import OpenAI from "openai";

const configuredApiKey =
  process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const isGemini = Boolean(process.env.GEMINI_API_KEY);
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const model =
  process.env.AI_MODEL || (isGemini ? DEFAULT_GEMINI_MODEL : "gpt-4o");
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const TONE_PLAYBOOK: Record<
  string,
  { voice: string; urgency: string; ctaStyle: string }
> = {
  friendly: {
    voice: "Warm, conversational, relatable and easy-going",
    urgency: "No pressure; encourage replies naturally",
    ctaStyle: "Invite DMs with a welcoming prompt",
  },
  urgent: {
    voice: "Direct, punchy, high-energy",
    urgency: "Use scarcity and time-sensitive wording",
    ctaStyle: "Strong immediate action language",
  },
  promotional: {
    voice: "Value-forward, offer-driven, persuasive",
    urgency: "Highlight discount, offer, or bundle value",
    ctaStyle: "Benefit-led CTA with clear next step",
  },
  informative: {
    voice: "Clear, practical, trustworthy",
    urgency: "Low urgency, clarity-first",
    ctaStyle: "Action CTA focused on learning/order details",
  },
  inspiring: {
    voice: "Aspirational, uplifting, emotionally engaging",
    urgency: "Motivational urgency, not pushy",
    ctaStyle: "Empowering CTA that encourages confidence",
  },
};

export async function POST(request: Request) {
  try {
    const {
      postType,
      brief,
      tone: rawTone,
      hasCeloPayment,
      price,
      currency,
    } = await request.json();

    const normalizedTone = String(rawTone || "friendly").toLowerCase();
    const tone = TONE_PLAYBOOK[normalizedTone] ? normalizedTone : "friendly";
    const toneGuide = TONE_PLAYBOOK[tone];

    if (!brief || !postType || !tone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const celoInstructions =
      hasCeloPayment && price
        ? `\n\nIMPORTANT: End the caption with a clear call-to-action for payment:\n"💳 Pay with ${currency}: $${price}\nTap Buy Now 👇"\n\nMake this feel natural and exciting.`
        : "";

    const systemPrompt = `You are an expert WhatsApp marketing copywriter specializing in African e-commerce. Write compelling captions for WhatsApp Status and Groups.

RULES:
  - Keep it under 200 words
  - Use 2-5 relevant emojis naturally (not spammy)
  - Include 1-2 relevant hashtags at the end
  - Keep language personal, not corporate

  TONE PROFILE (${tone.toUpperCase()}):
  - Voice: ${toneGuide.voice}
  - Urgency style: ${toneGuide.urgency}
  - CTA style: ${toneGuide.ctaStyle}${celoInstructions}`;

    const userPrompt = `Write one WhatsApp marketing caption.

Post Type: ${postType}
Brief: ${brief}
Tone: ${tone}

  Return only the final caption text.`;

    const mockCaption = generateMockCaption(
      postType,
      brief,
      tone,
      hasCeloPayment,
      price,
      currency,
    );

    // Try streaming first, fall back to regular if no API key
    if (
      !configuredApiKey ||
      configuredApiKey === "your_gemini_api_key" ||
      configuredApiKey === "your_openai_api_key" ||
      configuredApiKey === "your_ai_api_key"
    ) {
      return createMockCaptionResponse(mockCaption, "missing_api_key");
    }

    const openai = new OpenAI({
      apiKey: configuredApiKey,
      ...(isGemini
        ? {
            baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
          }
        : {}),
    });

    let stream;
    try {
      stream = await createCompletionStream(openai, systemPrompt, userPrompt);
    } catch (streamError) {
      const status = getErrorStatus(streamError);
      if (isGemini && status && RETRYABLE_STATUSES.has(status)) {
        console.warn(
          `Gemini caption generation fallback triggered (status ${status}). Returning mock caption.`,
        );
        return createMockCaptionResponse(mockCaption, `gemini_${status}`);
      }
      throw streamError;
    }

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      },
    });

    return new Response(readableStream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Caption generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate caption" },
      { status: 500 },
    );
  }
}

function generateMockCaption(
  postType: string,
  brief: string,
  tone: string,
  hasCeloPayment: boolean,
  price: string,
  currency: string,
): string {
  const openers: Record<string, string[]> = {
    friendly: ["Hey fam! 👋", "✨ Good news!", "🎉 Exciting update!"],
    urgent: [
      "⚡ Don't miss this!",
      "🔥 Limited time offer!",
      "⏰ Almost gone!",
    ],
    promotional: [
      "🎯 Special offer just for you!",
      "💎 Premium quality, best price!",
      "🏷️ Best deal in town!",
    ],
    informative: [
      "📋 Important update:",
      "🔍 Here's what you need to know:",
      "📢 Announcement:",
    ],
    inspiring: [
      "✨ Elevate your style!",
      "🌟 Quality that speaks for itself!",
      "💫 Because you deserve the best!",
    ],
  };

  const opener = openers[tone]?.[0] || "🔥 Check this out!";

  const caption = `${opener}\n\n${brief}\n\n📦 Quality guaranteed\n🚚 Fast delivery across Nigeria\n📱 DM to order now!\n\n${hasCeloPayment && price ? `💳 Pay with ${currency}: $${price}\nTap Buy Now 👇\n\n` : ""}#Eazee #${postType.charAt(0).toUpperCase() + postType.slice(1)} #MadeInNigeria`;

  return caption;
}

async function createCompletionStream(
  openai: OpenAI,
  systemPrompt: string,
  userPrompt: string,
) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= MAX_RETRIES) {
    try {
      return await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 300,
        temperature: model.includes("gemini") ? 1 : 0.8,
        stream: true,
      });
    } catch (error) {
      lastError = error;
      const status = getErrorStatus(error);
      const shouldRetry =
        isGemini &&
        status !== undefined &&
        RETRYABLE_STATUSES.has(status) &&
        attempt < MAX_RETRIES;

      if (!shouldRetry) {
        throw error;
      }

      const retryAfterMs = getRetryAfterMs(error);
      const backoffMs = retryAfterMs ?? 700 * 2 ** attempt;
      await wait(backoffMs);
      attempt += 1;
    }
  }

  throw lastError;
}

function createMockCaptionResponse(caption: string, reason: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const words = caption.split(" ");
      for (const word of words) {
        controller.enqueue(encoder.encode(word + " "));
        await wait(50);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "x-eazee-caption-fallback": reason,
    },
  });
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const status = (error as { status?: number }).status;
  return typeof status === "number" ? status : undefined;
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const headers = (error as { headers?: unknown }).headers;

  if (headers && typeof headers === "object") {
    if ("get" in headers && typeof headers.get === "function") {
      const value = headers.get("retry-after");
      const retryAfterSeconds = Number(value);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1000;
      }
    } else {
      const record = headers as Record<string, string | undefined>;
      const retryAfterSeconds = Number(record["retry-after"]);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1000;
      }
    }
  }

  return undefined;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
