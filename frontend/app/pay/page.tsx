import { Suspense } from "react";
import { PayCheckoutClient } from "@/components/pay/PayCheckoutClient";

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
          <div
            className="rounded-2xl border p-4"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            Loading checkout...
          </div>
        </div>
      }
    >
      <PayCheckoutClient />
    </Suspense>
  );
}
