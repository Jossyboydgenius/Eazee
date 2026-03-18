"use client";

import { motion } from "framer-motion";
import { Sparkles, RotateCcw, ArrowRight } from "lucide-react";
import { useEazeeStore } from "@/lib/store";
import { PhotoUploadZone } from "@/components/compose/PhotoUploadZone";
import { PostTypeSelector, ToneSelector } from "@/components/compose/Selectors";
import { CeloPaymentToggle } from "@/components/compose/CeloPaymentToggle";
import { WhatsAppPreview } from "@/components/compose/WhatsAppPreview";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import Image, { type StaticImageData } from "next/image";
import addAPhotoIcon from "@/svg/add-a-photo.svg";
import tagIcon from "@/svg/tag.svg";
import voiceChatIcon from "@/svg/voice-chat.svg";
import circleDollarSignIcon from "@/svg/circle-dollar-sign.svg";
import spannerIcon from "@/svg/spanner.svg";
import phoneIcon from "@/svg/phone.svg";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: "easeOut" } },
};

const RETRYABLE_CAPTION_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_GENERATION_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 25000;
const AI_TYPING_INTERVAL_MS = 18;

type PremiumRouteState =
  | "idle"
  | "checking"
  | "required"
  | "mock"
  | "success"
  | "error";

type PremiumRouteApiPayload = {
  mode?: string;
  warning?: string;
  message?: string;
  error?: string;
};

export default function ComposePage() {
  const router = useRouter();
  const [showPreview, setShowPreview] = useState(false);
  const [premiumRouteState, setPremiumRouteState] =
    useState<PremiumRouteState>("idle");
  const [premiumRouteMessage, setPremiumRouteMessage] = useState("");
  const captionTypingIntervalRef = useRef<number | null>(null);

  const {
    brief,
    setBrief,
    productName,
    setProductName,
    postType,
    tone,
    isGenerating,
    photos,
    setGeneratedCaption,
    setCaptionDraft,
    setIsGenerating,
    generatedCaption,
    captionDraft,
    hasCeloPayment,
    price,
    currency,
    resetCompose,
  } = useEazeeStore();

  const minBriefWords = 3;
  const briefWordCount = brief.trim().split(/\s+/).filter(Boolean).length;
  const hasEnoughBriefWords = briefWordCount >= minBriefWords;
  const canGenerate = postType && hasEnoughBriefWords && tone;
  const activeCaption = (captionDraft || generatedCaption).trim();
  const hasCaption = Boolean(activeCaption);
  const shouldShowPremiumStatus =
    hasCeloPayment &&
    premiumRouteState !== "idle" &&
    premiumRouteState !== "mock";

  useEffect(() => {
    let cancelled = false;

    if (!hasCeloPayment) {
      setPremiumRouteState("idle");
      setPremiumRouteMessage("");
      return;
    }

    const checkPremiumRoute = async () => {
      setPremiumRouteState("checking");
      setPremiumRouteMessage("Checking payment route...");

      try {
        const response = await fetch("/api/premium-content", {
          method: "GET",
          cache: "no-store",
        });
        const payload = await extractPremiumRoutePayload(response.clone());
        const apiMessage = await extractErrorMessage(response.clone());

        if (cancelled) return;

        if (response.status === 402) {
          setPremiumRouteState("required");
          setPremiumRouteMessage(apiMessage || "Payment required");
          return;
        }

        if (response.ok) {
          if (payload.mode === "mock") {
            setPremiumRouteState("idle");
            setPremiumRouteMessage("");
            return;
          }

          setPremiumRouteState("success");
          setPremiumRouteMessage(apiMessage || "Payment route ready");
          return;
        }

        setPremiumRouteState("error");
        setPremiumRouteMessage(apiMessage || "Payment route unavailable");
      } catch {
        if (cancelled) return;
        setPremiumRouteState("error");
        setPremiumRouteMessage("Payment route unavailable");
      }
    };

    void checkPremiumRoute();

    return () => {
      cancelled = true;
    };
  }, [hasCeloPayment]);

  useEffect(() => {
    return () => {
      if (captionTypingIntervalRef.current !== null) {
        window.clearInterval(captionTypingIntervalRef.current);
        captionTypingIntervalRef.current = null;
      }
    };
  }, []);

  const animateCaptionTyping = (caption: string) => {
    return new Promise<void>((resolve) => {
      if (!caption) {
        setCaptionDraft("");
        resolve();
        return;
      }

      if (captionTypingIntervalRef.current !== null) {
        window.clearInterval(captionTypingIntervalRef.current);
      }

      const step = caption.length > 360 ? 6 : caption.length > 240 ? 4 : 2;
      let cursor = 0;
      setCaptionDraft("");

      captionTypingIntervalRef.current = window.setInterval(() => {
        cursor = Math.min(caption.length, cursor + step);
        setCaptionDraft(caption.slice(0, cursor));

        if (
          cursor >= caption.length &&
          captionTypingIntervalRef.current !== null
        ) {
          window.clearInterval(captionTypingIntervalRef.current);
          captionTypingIntervalRef.current = null;
          resolve();
        }
      }, AI_TYPING_INTERVAL_MS);
    });
  };

  async function handleGenerate() {
    if (!canGenerate || isGenerating) return;

    const previousCaption = captionDraft || generatedCaption;
    setIsGenerating(true);
    setGeneratedCaption("");
    setCaptionDraft("");
    // Auto-show preview when generating
    setShowPreview(true);

    try {
      const caption = await fetchCaptionWithRetry({
        postType,
        brief,
        productName,
        tone,
        hasCeloPayment,
        price,
        currency,
        previousCaption,
      });
      await animateCaptionTyping(caption);
      setGeneratedCaption(caption);
      console.log("[compose] Generated caption (full):", caption);
    } catch (err) {
      console.error(err);
      if (previousCaption) {
        setGeneratedCaption(previousCaption);
        setCaptionDraft(previousCaption);
      }
      toast({
        title: "Caption generation failed",
        description:
          "Network is unstable or AI is busy. Please tap Write with AI again.",
        variant: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div
      className="min-h-screen p-4 sm:p-6 lg:p-8"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <p className="step-label mb-1">Compose</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-xl sm:text-2xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Build Your Post
            </h1>
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Create an AI-powered WhatsApp marketing post in 5 steps
            </p>
          </div>
          {/* Toggle preview button (visible on large screens) */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="btn-ghost shrink-0 hidden lg:flex"
          >
            <Image
              src={phoneIcon}
              alt=""
              width={16}
              height={16}
              className="w-4 h-4"
            />
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
        </div>
      </motion.div>

      {/* Layout: two-column on lg+ */}
      <div
        className={`flex gap-6 items-start ${showPreview ? "lg:flex-row" : ""} flex-col lg:flex-row`}
      >
        {/* Left / main column */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex-1 min-w-0 w-full space-y-4"
        >
          {/* Step 1 — Photos */}
          <motion.div variants={item} className="glass-card p-4 sm:p-5">
            <StepHeader n={1} title="Product Photos" iconSrc={addAPhotoIcon} />
            <PhotoUploadZone />
          </motion.div>

          {/* Step 2 — Type + brief */}
          <motion.div variants={item} className="glass-card p-4 sm:p-5">
            <StepHeader n={2} title="What are you sharing?" iconSrc={tagIcon} />
            <PostTypeSelector />
            <div className="mt-4">
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Product name"
                className="input-base"
              />
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Brief description of what you are selling"
                rows={3}
                maxLength={200}
                className="input-base resize-none mt-3"
              />
              <p
                className="text-right text-[11px] mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {brief.length}/200
              </p>
              {brief.trim().length > 0 && (
                <p
                  className="text-[11px] mt-1"
                  style={{
                    color: hasEnoughBriefWords
                      ? "var(--text-muted)"
                      : "var(--brand-red)",
                  }}
                >
                  {hasEnoughBriefWords
                    ? "Brief looks good"
                    : `Use at least ${minBriefWords} words (${briefWordCount}/${minBriefWords})`}
                </p>
              )}
            </div>
          </motion.div>

          {/* Step 3 — Tone */}
          <motion.div variants={item} className="glass-card p-4 sm:p-5">
            <StepHeader n={3} title="Post Tone" iconSrc={voiceChatIcon} />
            <ToneSelector />
          </motion.div>

          {/* Step 4 — Celo */}
          <motion.div variants={item} className="glass-card p-4 sm:p-5">
            <StepHeader
              n={4}
              title="Celo payment"
              iconSrc={circleDollarSignIcon}
            />
            <CeloPaymentToggle />
            {shouldShowPremiumStatus && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <PremiumStatusBadge state={premiumRouteState} />
                {premiumRouteMessage && (
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {premiumRouteMessage}
                  </span>
                )}
              </div>
            )}
          </motion.div>

          {/* Mobile preview toggle */}
          <motion.div variants={item} className="lg:hidden">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="w-full btn-ghost py-3"
            >
              <Image
                src={phoneIcon}
                alt=""
                width={16}
                height={16}
                className="w-4 h-4"
              />
              {showPreview ? "Hide WhatsApp Preview" : "Show WhatsApp Preview"}
            </button>
          </motion.div>

          {/* Inline preview on mobile when visible */}
          {showPreview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden flex justify-center py-2"
            >
              <WhatsAppPreview />
            </motion.div>
          )}

          {/* Step 5 — Generate */}
          <motion.div variants={item} className="glass-card p-4 sm:p-5">
            <StepHeader n={5} title="Generate Caption" iconSrc={spannerIcon} />
            {/* Validation hints */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { done: photos.length > 0, label: "Photos added" },
                { done: !!postType, label: "Post type" },
                { done: hasEnoughBriefWords, label: "Brief written" },
                { done: !!tone, label: "Tone chosen" },
              ].map((hint) => (
                <div key={hint.label} className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      hint.done ? "text-white" : "text-transparent"
                    }`}
                    style={{
                      background: hint.done
                        ? "var(--brand-green)"
                        : "var(--bg-elevated)",
                      border: `1px solid ${hint.done ? "var(--brand-green)" : "var(--border)"}`,
                    }}
                  >
                    {hint.done && "✓"}
                  </div>
                  <span
                    className="text-xs transition-all"
                    style={{
                      color: hint.done
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                    }}
                  >
                    {hint.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating}
                className="btn-brand flex-1 py-3.5"
              >
                {isGenerating ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                    />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Write with AI
                  </>
                )}
              </button>
              {hasCaption && (
                <button onClick={resetCompose} className="btn-ghost px-4">
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="mt-4">
              <p
                className="text-xs mb-1.5 font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Caption (editable)
              </p>
              <textarea
                value={captionDraft}
                onChange={(event) => setCaptionDraft(event.target.value)}
                placeholder="Generated caption appears here. You can edit before scheduling."
                rows={5}
                className="input-base resize-none"
              />
              <p
                className="text-right text-[11px] mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {captionDraft.length}/600
              </p>
            </div>

            {hasCaption && (
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => router.push("/schedule")}
                className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border transition-all"
                style={{
                  borderColor: "var(--brand-green)",
                  color: "var(--brand-dark)",
                  background: "var(--brand-dim)",
                }}
              >
                Schedule this post
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            )}
          </motion.div>
        </motion.div>

        {/* Right column: WhatsApp preview — desktop only when toggled on */}
        {showPreview && (
          <div className="shrink-0 w-80 hidden lg:block">
            <div className="sticky top-8">
              <WhatsAppPreview />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface CaptionPayload {
  postType: string;
  brief: string;
  productName: string;
  tone: string;
  hasCeloPayment: boolean;
  price: string;
  currency: string;
  previousCaption: string;
}

async function fetchCaptionWithRetry(payload: CaptionPayload): Promise<string> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= MAX_GENERATION_RETRIES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch("/api/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const isRetryable = RETRYABLE_CAPTION_STATUSES.has(res.status);
        const apiMessage = await extractErrorMessage(res);

        if (isRetryable && attempt < MAX_GENERATION_RETRIES) {
          await wait(600 * 2 ** attempt);
          attempt += 1;
          continue;
        }

        throw new Error(
          apiMessage || `Caption generation failed (${res.status})`,
        );
      }

      const caption = await readCaptionText(res);
      if (caption.length < 20) {
        throw new Error("Generated caption is too short. Try again.");
      }

      return caption;
    } catch (error) {
      lastError = error;
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error);
      const isAbort = error instanceof Error && error.name === "AbortError";
      const shouldRetry =
        (isAbort || message.includes("network")) &&
        attempt < MAX_GENERATION_RETRIES;

      if (!shouldRetry) {
        throw error;
      }

      await wait(600 * 2 ** attempt);
      attempt += 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Caption generation failed");
}

async function readCaptionText(response: Response): Promise<string> {
  if (!response.body) {
    return (await response.text()).trim();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fullText += decoder.decode(value, { stream: true });
  }

  fullText += decoder.decode();
  return fullText.trim();
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data === "object") {
      if ("error" in data && typeof data.error === "string") {
        return data.error;
      }

      if ("warning" in data && typeof data.warning === "string") {
        return data.warning;
      }

      if ("message" in data && typeof data.message === "string") {
        return data.message;
      }
    }
  } catch {
    return "";
  }

  return "";
}

async function extractPremiumRoutePayload(
  response: Response,
): Promise<PremiumRouteApiPayload> {
  try {
    const data = await response.json();
    if (data && typeof data === "object") {
      return data as PremiumRouteApiPayload;
    }
  } catch {
    return {};
  }

  return {};
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function PremiumStatusBadge({ state }: { state: PremiumRouteState }) {
  const config: Record<PremiumRouteState, { label: string; color: string }> = {
    idle: { label: "Not checked", color: "var(--text-muted)" },
    checking: { label: "Checking", color: "var(--text-secondary)" },
    required: { label: "Payment required", color: "var(--brand-dark)" },
    mock: { label: "Mock mode", color: "var(--text-muted)" },
    success: { label: "Payment success", color: "var(--brand-green)" },
    error: { label: "Payment error", color: "var(--brand-red)" },
  };

  const { label, color } = config[state];

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border"
      style={{
        color,
        borderColor: color,
        background: "var(--bg-elevated)",
      }}
    >
      {label}
    </span>
  );
}

function StepHeader({
  n,
  title,
  iconSrc,
}: {
  n: number;
  title: string;
  iconSrc?: StaticImageData;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      {iconSrc ? (
        <Image
          src={iconSrc}
          alt=""
          width={16}
          height={16}
          className="w-4 h-4 shrink-0"
        />
      ) : (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ background: "var(--brand-dark)" }}
        >
          {n}
        </div>
      )}
      <h2
        className="font-semibold text-sm"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h2>
    </div>
  );
}
