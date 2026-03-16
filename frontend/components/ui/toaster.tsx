"use client";

import * as React from "react";
import * as Toast from "@radix-ui/react-toast";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import {
  subscribeToasts,
  type ToastMessage,
  type ToastVariant,
} from "@/lib/toast";

interface QueuedToast extends ToastMessage {
  open: boolean;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; icon: string; title: string }
> = {
  success: {
    border: "var(--brand-green)",
    icon: "var(--brand-dark)",
    title: "var(--text-primary)",
  },
  error: {
    border: "var(--brand-red)",
    icon: "var(--brand-red)",
    title: "var(--text-primary)",
  },
  info: {
    border: "var(--brand-mid)",
    icon: "var(--brand-mid)",
    title: "var(--text-primary)",
  },
};

const VARIANT_ICON: Record<
  ToastVariant,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function Toaster() {
  const [items, setItems] = React.useState<QueuedToast[]>([]);

  const dismissToast = React.useCallback((id: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, open: false } : item)),
    );

    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 180);
  }, []);

  React.useEffect(() => {
    return subscribeToasts((message) => {
      setItems((current) => [...current, { ...message, open: true }]);
    });
  }, []);

  return (
    <Toast.Provider swipeDirection="right" duration={3200} label="Notification">
      {items.map((item) => {
        const Icon = VARIANT_ICON[item.variant];
        const styles = VARIANT_STYLES[item.variant];

        return (
          <Toast.Root
            key={item.id}
            open={item.open}
            onOpenChange={(open) => {
              if (!open) dismissToast(item.id);
            }}
            duration={item.duration}
            className="group relative w-full rounded-xl border p-3.5 shadow-lg"
            style={{
              background: "var(--bg-card)",
              borderColor: styles.border,
            }}
          >
            <div className="flex items-start gap-2.5">
              <Icon
                className="w-4 h-4 mt-0.5 shrink-0"
                style={{ color: styles.icon }}
              />

              <div className="min-w-0 flex-1">
                <Toast.Title
                  className="text-sm font-semibold"
                  style={{ color: styles.title }}
                >
                  {item.title}
                </Toast.Title>
                {item.description && (
                  <Toast.Description
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {item.description}
                  </Toast.Description>
                )}
              </div>

              <Toast.Close
                className="w-6 h-6 rounded-full inline-flex items-center justify-center transition-colors"
                style={{ color: "var(--text-muted)" }}
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </Toast.Close>
            </div>
          </Toast.Root>
        );
      })}

      <Toast.Viewport className="fixed top-4 right-4 z-[120] flex w-[calc(100vw-2rem)] max-w-[360px] flex-col gap-2 outline-none" />
    </Toast.Provider>
  );
}
