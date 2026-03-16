"use client";

import { motion } from "framer-motion";
import { Sparkles, RotateCcw, ArrowRight } from "lucide-react";
import { useEazeeStore } from "@/lib/store";
import { PhotoUploadZone } from "@/components/compose/PhotoUploadZone";
import { PostTypeSelector, ToneSelector } from "@/components/compose/Selectors";
import { CeloPaymentToggle } from "@/components/compose/CeloPaymentToggle";
import { WhatsAppPreview } from "@/components/compose/WhatsAppPreview";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

export default function ComposePage() {
  const router = useRouter();
  const [showPreview, setShowPreview] = useState(false);

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
    setIsGenerating,
    generatedCaption,
    hasCeloPayment,
    price,
    currency,
    resetCompose,
  } = useEazeeStore();

  const minBriefWords = 3;
  const briefWordCount = brief.trim().split(/\s+/).filter(Boolean).length;
  const hasEnoughBriefWords = briefWordCount >= minBriefWords;
  const canGenerate = postType && hasEnoughBriefWords && tone;

  const handleBriefChange = (value: string) => {
    setBrief(value);
    if (generatedCaption) {
      setGeneratedCaption(value);
    }
  };

  async function handleGenerate() {
    if (!canGenerate || isGenerating) return;
    setIsGenerating(true);
    setGeneratedCaption("");
    // Auto-show preview when generating
    setShowPreview(true);

    try {
      const res = await fetch("/api/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postType,
          brief,
          tone,
          hasCeloPayment,
          price,
          currency,
        }),
      });
      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setGeneratedCaption(fullText);
        setBrief(fullText);
      }
    } catch (err) {
      console.error(err);
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
                placeholder="Product name e.g. Ankara Fabric Bundle"
                className="input-base"
              />
              <textarea
                value={brief}
                onChange={(e) => handleBriefChange(e.target.value)}
                placeholder="Brief e.g. New ankara fabric bundle, premium quality, available in 3 sizes…"
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
              title="Celo paymenet"
              iconSrc={circleDollarSignIcon}
            />
            <CeloPaymentToggle />
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
              {generatedCaption && (
                <button onClick={resetCompose} className="btn-ghost px-4">
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            {generatedCaption && (
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
