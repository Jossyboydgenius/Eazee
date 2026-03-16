"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEazeeStore } from "@/lib/store";
import { formatNumberWithDelimiters } from "@/lib/utils";
import Image from "next/image";
import { ShoppingCart, CheckCheck, Wifi, Battery } from "lucide-react";

export function WhatsAppPreview() {
  const {
    generatedCaption,
    isGenerating,
    photos,
    hasCeloPayment,
    price,
    currency,
    postType,
  } = useEazeeStore();

  const hasContent = generatedCaption || isGenerating;
  const firstPhoto = photos[0];

  return (
    <div className="flex flex-col items-center">
      {/* Phone frame */}
      <div
        className="relative w-72 h-[580px] rounded-[3rem] border-4 border-white/15 overflow-hidden shadow-2xl"
        style={{ background: "#1a1a2e" }}
      >
        {/* Status bar */}
        <div
          className="flex items-center justify-between px-6 pt-3 pb-1"
          style={{ background: "#075E54" }}
        >
          <span className="text-white text-[10px] font-semibold">9:41</span>
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3 h-3 text-white" />
            <Battery className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        {/* WA Header */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ background: "#075E54" }}
        >
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold text-white">
            S
          </div>
          <div className="flex-1">
            <p className="text-white text-sm font-semibold leading-tight">
              My Status
            </p>
            <p className="text-white/70 text-[10px]">Today</p>
          </div>
        </div>

        {/* Chat background */}
        <div
          className="flex-1 h-full overflow-y-auto wa-bg px-3 py-4 flex flex-col justify-end"
          style={{ background: "#ECE5DD", maxHeight: "calc(100% - 120px)" }}
        >
          <AnimatePresence mode="wait">
            {!hasContent && !firstPhoto ? (
              /* Empty state */
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full gap-3 py-8"
              >
                <div className="w-14 h-14 rounded-full bg-white/60 flex items-center justify-center">
                  <span className="text-2xl">💬</span>
                </div>
                <p className="text-center text-xs font-medium text-gray-500 px-4">
                  Your WhatsApp preview will appear here after generating a
                  caption
                </p>
              </motion.div>
            ) : (
              /* Message bubble */
              <motion.div
                key="bubble"
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="ml-auto max-w-[85%]"
              >
                <div
                  className="rounded-2xl rounded-br-sm overflow-hidden shadow-sm"
                  style={{ background: "#DCF8C6" }}
                >
                  {/* Photo */}
                  {firstPhoto && (
                    <div className="relative w-full aspect-square max-h-44">
                      <Image
                        src={firstPhoto.preview}
                        alt="Product"
                        fill
                        className="object-cover"
                      />
                      {/* Photo count badge */}
                      {photos.length > 1 && (
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                          +{photos.length - 1}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Caption text */}
                  <div className="px-3 py-2.5">
                    {isGenerating && !generatedCaption ? (
                      /* Typing indicator */
                      <div className="flex items-center gap-1 py-1">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ y: [0, -4, 0] }}
                            transition={{
                              duration: 0.6,
                              repeat: Infinity,
                              delay: i * 0.15,
                            }}
                            className="w-1.5 h-1.5 rounded-full bg-gray-500"
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-gray-800 text-xs leading-relaxed whitespace-pre-wrap">
                          {generatedCaption}
                        </p>

                        {/* Celo Buy Now button (in-bubble) */}
                        {hasCeloPayment && price && generatedCaption && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-2 pt-2 border-t border-gray-300/60"
                          >
                            <button
                              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white shadow-sm active:scale-95 transition-transform"
                              style={{
                                background:
                                  "linear-gradient(135deg, #35D07F, #14b8a6)",
                              }}
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              Buy Now · {formatNumberWithDelimiters(price)}{" "}
                              {currency}
                            </button>
                          </motion.div>
                        )}
                      </div>
                    )}

                    {/* Message time + tick */}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[9px] text-gray-500">
                        {new Date().toLocaleTimeString("en", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <CheckCheck className="w-3 h-3 text-[#34B7F1]" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Label */}
      <p
        className="mt-3 text-xs font-medium"
        style={{ color: "var(--color-text-muted)" }}
      >
        WhatsApp Preview
      </p>
    </div>
  );
}
