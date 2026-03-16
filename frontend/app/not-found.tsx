import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen p-4 sm:p-6 lg:p-8 flex items-center justify-center"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="glass-card w-full max-w-lg p-7 sm:p-8 text-center">
        <p className="step-label mb-2">404</p>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Page not found
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          The page you are looking for doesn&apos;t exist yet.
        </p>

        <div className="mt-6 flex justify-center">
          <Link href="/compose" className="btn-brand">
            Go to Compose
          </Link>
        </div>
      </div>
    </div>
  );
}
