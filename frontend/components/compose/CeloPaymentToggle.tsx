"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, DollarSign } from "lucide-react";
import { useState } from "react";
import { useEazeeStore } from "@/lib/store";
import { STABLECOINS } from "@/lib/utils";
import { formatPriceInput } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

export function CeloPaymentToggle() {
  const {
    hasCeloPayment,
    setHasCeloPayment,
    price,
    setPrice,
    currency,
    setCurrency,
  } = useEazeeStore();
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const selectedStablecoin =
    STABLECOINS.find((coin) => coin.symbol === currency) ?? STABLECOINS[0];

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        background: hasCeloPayment ? "var(--brand-dim)" : "var(--bg-elevated)",
        borderColor: hasCeloPayment ? "var(--brand-green)" : "var(--border)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Add CELO paymenet Button
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Customers tap to pay in cUSD right from WhatsApp
          </p>
        </div>

        <Switch
          checked={hasCeloPayment}
          onCheckedChange={setHasCeloPayment}
          aria-label="Enable Celo payment"
        />
      </div>

      <AnimatePresence>
        {hasCeloPayment && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p
                  className="text-xs mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Product price
                </p>
                <div className="relative">
                  <DollarSign
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--text-primary)", opacity: 0.45 }}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(formatPriceInput(e.target.value))}
                    className="input-base pl-9"
                  />
                </div>
              </div>

              <div>
                <p
                  className="text-xs mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Stablecoin
                </p>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCurrencyMenu((open) => !open)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all"
                    style={{
                      background: "var(--bg-elevated)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {selectedStablecoin.symbol} - {selectedStablecoin.name}
                      </p>
                    </div>

                    <ChevronDown
                      className={`w-4 h-4 shrink-0 transition-transform ${showCurrencyMenu ? "rotate-180" : ""}`}
                      style={{ color: "var(--text-muted)" }}
                    />
                  </button>

                  <AnimatePresence>
                    {showCurrencyMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border overflow-hidden z-50 shadow-xl"
                        style={{
                          background: "var(--bg-card)",
                          borderColor: "var(--border)",
                        }}
                      >
                        {STABLECOINS.map((coin) => {
                          const isActive = currency === coin.symbol;

                          return (
                            <button
                              key={coin.symbol}
                              type="button"
                              onClick={() => {
                                setCurrency(coin.symbol);
                                setShowCurrencyMenu(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-all"
                              style={{
                                color: isActive
                                  ? "var(--brand-dark)"
                                  : "var(--text-secondary)",
                                background: isActive
                                  ? "var(--brand-dim)"
                                  : "transparent",
                              }}
                            >
                              <span className="font-semibold">
                                {coin.symbol}
                              </span>
                              <span className="opacity-80">- {coin.name}</span>
                              {isActive && (
                                <Check className="w-4 h-4 ml-auto" />
                              )}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
