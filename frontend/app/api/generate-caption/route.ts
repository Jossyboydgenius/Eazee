import { NextResponse } from "next/server";

const configuredApiKey =
  process.env.GEMINI_API_KEY?.trim() ||
  process.env.GOOGLE_API_KEY?.trim() ||
  process.env.AI_API_KEY?.trim() ||
  "";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MODEL_FALLBACKS = [DEFAULT_GEMINI_MODEL, "gemini-1.5-flash"];
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MIN_CAPTION_WORDS = 12;
const CAPTION_TRUNCATED_STATUS = 422;

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
      productName,
      tone: rawTone,
      hasCeloPayment,
      price,
      currency,
      previousCaption,
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

    const paymentDetails =
      hasCeloPayment && price
        ? `Payment details to include naturally: ${currency || "cUSD"} ${price}.`
        : "No payment line required unless it naturally fits.";

    const productLine = productName
      ? `Product name: ${productName}`
      : "Product name not provided. Derive from the brief.";

    const variationLine = previousCaption
      ? `Previous caption to avoid repeating too closely:\n${previousCaption}`
      : "No previous caption provided.";

    const systemPrompt = `You are an expert WhatsApp marketing copywriter specializing in African e-commerce. Write compelling captions for WhatsApp Status and Groups.

RULES:
  - Write 40-90 words only
  - Use 2-5 relevant emojis naturally (not spammy)
  - Include 1-2 relevant hashtags at the end
  - Keep language personal, not corporate
  - Output complete sentences only (never end mid-word or mid-sentence)
  - Do not use markdown, code fences, or labels
  - Ensure the core offer, context, and CTA are clear

  TONE PROFILE (${tone.toUpperCase()}):
  - Voice: ${toneGuide.voice}
  - Urgency style: ${toneGuide.urgency}
  - CTA style: ${toneGuide.ctaStyle}`;

    const userPrompt = `Write one WhatsApp marketing caption.

Post Type: ${postType}
Brief: ${brief}
${productLine}
Tone: ${tone}
${paymentDetails}
${variationLine}

Return only the final caption text.`;

    const mockCaption = generateMockCaption(
      postType,
      brief,
      tone,
      hasCeloPayment,
      price,
      currency,
    );

    if (
      !configuredApiKey ||
      configuredApiKey === "your_gemini_api_key" ||
      configuredApiKey === "your_ai_api_key"
    ) {
      return createMockCaptionResponse(mockCaption, "missing_api_key");
    }

    let caption;
    try {
      caption = await createCompletionText(systemPrompt, userPrompt);
      console.info("[generate-caption] Generated caption (full):", caption);
      console.info("[generate-caption] Caption length:", caption.length);
    } catch (completionError) {
      const status = getErrorStatus(completionError);
      if (status === CAPTION_TRUNCATED_STATUS) {
        console.warn(
          "Gemini caption generation produced truncated/short output. Returning mock caption.",
        );
        return createMockCaptionResponse(mockCaption, "gemini_truncated");
      }

      if (status && RETRYABLE_STATUSES.has(status)) {
        console.warn(
          `Gemini caption generation fallback triggered (status ${status}). Returning mock caption.`,
        );
        return createMockCaptionResponse(mockCaption, `gemini_${status}`);
      }
      throw completionError;
    }

    return new Response(caption, {
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

  const caption = `${opener}\n\n${brief}\n\n📦 Quality guaranteed\n🚚 Fast delivery across Nigeria\n📱 DM to order now!\n\n${hasCeloPayment && price ? `💳 Pay with ${currency}: ${price} ${currency}\nTap Buy Now 👇\n\n` : ""}#Eazee #${postType.charAt(0).toUpperCase() + postType.slice(1)} #MadeInNigeria`;

  return caption;
}

async function createCompletionText(systemPrompt: string, userPrompt: string) {
  const modelCandidates = resolveModelCandidates();
  let lastError: unknown;

  for (const candidateModel of modelCandidates) {
    try {
      return await createCompletionTextForModel(
        systemPrompt,
        userPrompt,
        candidateModel,
      );
    } catch (error) {
      lastError = error;

      const status = getErrorStatus(error);
      const shouldTryNextModel = (status === 400 || status === 404) &&
        candidateModel !== modelCandidates[modelCandidates.length - 1];

      if (!shouldTryNextModel) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("Failed to generate caption");
}

async function createCompletionTextForModel(
  systemPrompt: string,
  userPrompt: string,
  model: string,
) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model,
        )}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": configuredApiKey,
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemPrompt }],
            },
            contents: [
              {
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              temperature: 1.0,
              topP: 0.9,
              topK: 40,
              maxOutputTokens: 360,
            },
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await safeParseJson(response);
        throw {
          status: response.status,
          body: errorBody,
          headers: response.headers,
          model,
        };
      }

      const data = await response.json();
      const text = extractGeminiText(data);

      if (text.length < 20) {
        throw {
          status: CAPTION_TRUNCATED_STATUS,
          message: "Caption response too short",
        };
      }

      if (isLikelyTruncatedCaption(text)) {
        throw {
          status: CAPTION_TRUNCATED_STATUS,
          message: "Caption appears truncated",
        };
      }

      return text;
    } catch (error) {
      lastError = error;
      const status = getErrorStatus(error);
      const shouldRetry =
        (status === undefined || RETRYABLE_STATUSES.has(status)) &&
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

function resolveModelCandidates(): string[] {
  const preferredModel = String(process.env.AI_MODEL || "").trim();
  const models = [preferredModel, ...MODEL_FALLBACKS].filter(Boolean);
  return [...new Set(models)];
}

function extractGeminiText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const candidates = (data as { candidates?: unknown[] }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }

  const firstCandidate = candidates[0] as {
    content?: { parts?: Array<{ text?: string }> };
  };

  const parts = firstCandidate.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function isLikelyTruncatedCaption(text: string): boolean {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_CAPTION_WORDS) {
    return true;
  }

  const endsWithStrongPunctuation = /[.!?…]$/.test(text);
  const endsWithHashtag = /#[\p{L}\p{N}_]+$/u.test(text);
  const endsWithEmoji = /\p{Extended_Pictographic}$/u.test(text);
  const endsWithOrphanDigit = /\s\d$/.test(text);

  if (endsWithOrphanDigit) {
    return true;
  }

  return !(endsWithStrongPunctuation || endsWithHashtag || endsWithEmoji);
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
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
