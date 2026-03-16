import { NextResponse } from "next/server";
import OpenAI from "openai";

const configuredApiKey =
  process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const isGemini = Boolean(process.env.GEMINI_API_KEY);
const model =
  process.env.AI_MODEL || (isGemini ? "gemini-2.0-flash" : "gpt-4o");

export async function POST(request: Request) {
  try {
    const { postType, brief, tone, hasCeloPayment, price, currency } =
      await request.json();

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

    const systemPrompt = `You are an expert WhatsApp marketing copywriter specializing in African e-commerce. You write compelling, emoji-rich captions that drive sales on WhatsApp Status and Groups.

RULES:
- Write in a conversational WhatsApp tone
- Use relevant emojis strategically (not excessively)
- Keep it under 200 words
- Include 1-2 relevant hashtags at the end
- Make it feel personal, not corporate
- Tone should be: ${tone}${celoInstructions}`;

    const userPrompt = `Write a WhatsApp marketing caption for this:
Post Type: ${postType}
Brief: ${brief}
Tone: ${tone}

Generate the caption now:`;

    // Try streaming first, fall back to regular if no API key
    if (
      !configuredApiKey ||
      configuredApiKey === "your_gemini_api_key" ||
      configuredApiKey === "your_openai_api_key" ||
      configuredApiKey === "your_ai_api_key"
    ) {
      // Mock response for demo
      const mockCaption = generateMockCaption(
        postType,
        brief,
        tone,
        hasCeloPayment,
        price,
        currency,
      );

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const words = mockCaption.split(" ");
          for (const word of words) {
            controller.enqueue(encoder.encode(word + " "));
            await new Promise((r) => setTimeout(r, 60));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const openai = new OpenAI({
      apiKey: configuredApiKey,
      ...(isGemini
        ? {
            baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
          }
        : {}),
    });

    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 300,
      temperature: 0.8,
      stream: true,
    });

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
