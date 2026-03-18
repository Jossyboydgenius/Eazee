"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useEazeeStore } from "@/lib/store";
import { cn, formatNumberWithDelimiters, getTimeAgo } from "@/lib/utils";
import { celoExplorerBaseUrl } from "@/lib/celo";
import { toast } from "@/lib/toast";
import calendarIcon from "@/svg/calendar.svg";
import dollarIcon from "@/svg/dollar.svg";
import circleDollarSignIcon from "@/svg/circle-dollar-sign.svg";
import {
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  Check,
  ArrowUpRight,
  Repeat,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";

const TABS = [
  { id: "posts", label: "Posts", iconSrc: calendarIcon },
  { id: "payments", label: "Payments", icon: Wallet },
];

type DashboardTabId = (typeof TABS)[number]["id"];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTabId>("posts");
  const hasProcessedScheduleToastRef = useRef(false);

  useEffect(() => {
    if (hasProcessedScheduleToastRef.current) return;
    hasProcessedScheduleToastRef.current = true;

    const searchParams = new URLSearchParams(window.location.search);
    const scheduled = searchParams.get("scheduled");
    if (!scheduled) return;

    const mode = searchParams.get("mode");
    const queuedTargets = Number.parseInt(searchParams.get("queued") || "", 10);
    const toastKey =
      searchParams.get("toast") ||
      `${scheduled}:${mode || "created"}:${Number.isFinite(queuedTargets) ? queuedTargets : "na"}`;

    if (typeof window !== "undefined") {
      const consumedKey = `eazee-dashboard-toast-consumed:${toastKey}`;
      if (window.sessionStorage.getItem(consumedKey)) {
        const timeoutId = window.setTimeout(() => {
          window.history.replaceState({}, "", "/dashboard");
        }, 0);

        return () => window.clearTimeout(timeoutId);
      }

      window.sessionStorage.setItem(consumedKey, "1");
    }

    toast({
      title: mode === "updated" ? "Post updated" : "Post scheduled",
      description:
        Number.isFinite(queuedTargets) && queuedTargets > 0
          ? `Queued for ${queuedTargets} delivery target(s).`
          : "Your post is now in the dashboard queue.",
      variant: "success",
    });

    const timeoutId = window.setTimeout(() => {
      window.history.replaceState({}, "", "/dashboard");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div
      className="min-h-screen p-4 sm:p-6 lg:p-8"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <p className="step-label mb-1">Dashboard</p>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Your Eazee Hub
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Track posts and payments
        </p>
      </motion.div>

      {/* Tab bar */}
      <div
        className="flex gap-1 p-1.5 rounded-2xl mb-8 w-fit"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                isActive ? "" : "opacity-50 hover:opacity-80",
              )}
              style={
                isActive
                  ? {
                      background: "var(--brand-dim)",
                      color: "var(--brand-dark)",
                    }
                  : { color: "var(--text-primary)" }
              }
            >
              {tab.iconSrc ? (
                <Image
                  src={tab.iconSrc}
                  alt=""
                  width={16}
                  height={16}
                  className="w-4 h-4"
                />
              ) : (
                tab.icon && <tab.icon className="w-4 h-4" />
              )}
              {tab.label}
            </motion.button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "posts" && <PostsTab />}
          {activeTab === "payments" && <PaymentsTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Posts Tab
 ───────────────────────────────────────────────────────────────── */
function PostsTab() {
  const router = useRouter();
  const { posts, removePost, startEditingPost } = useEazeeStore();
  const [filter, setFilter] = useState<"all" | "upcoming" | "sent">("all");
  const [pendingDeletePostId, setPendingDeletePostId] = useState<string | null>(
    null,
  );

  const filtered = posts.filter((p) => filter === "all" || p.status === filter);

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      {/* Filter chips */}
      <div className="mb-5 overflow-x-auto">
        <div className="flex gap-2 w-max min-w-full">
          {(["all", "upcoming", "sent"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn("chip capitalize", filter === f && "active")}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <motion.div variants={item} className="glass-card p-12 text-center">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No posts yet. Start composing!
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onEdit={() => {
                startEditingPost(post.id);
                router.push("/schedule");
              }}
              onDelete={() => setPendingDeletePostId(post.id)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {pendingDeletePostId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className="w-full max-w-sm rounded-2xl border p-5"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border)",
              }}
            >
              <h3
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Delete upcoming post?
              </h3>
              <p
                className="text-sm mt-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                This action cannot be undone.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => setPendingDeletePostId(null)}
                  className="px-3 py-2 rounded-lg text-sm font-medium border"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                    background: "var(--bg-elevated)",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    removePost(pendingDeletePostId);
                    setPendingDeletePostId(null);
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-semibold"
                  style={{
                    background: "#F54E38",
                    color: "white",
                  }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PostCard({
  post,
  onEdit,
  onDelete,
}: {
  post: ReturnType<typeof useEazeeStore.getState>["posts"][0];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showMoreActions, setShowMoreActions] = useState(false);

  const audienceEmoji = post.targets.includes("groups")
    ? "👥"
    : post.targets.includes("broadcast")
      ? "⚡"
      : "📢";
  const audienceLabel = post.targets.join(", ");

  return (
    <motion.div variants={item} className="glass-card-hover p-4 flex gap-4">
      {/* Photo thumbnail */}
      <div
        className="w-16 h-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
        style={{ background: "var(--bg-elevated)" }}
      >
        {post.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.photos[0]}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-2xl">📦</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-semibold line-clamp-1"
              style={{ color: "var(--text-primary)" }}
            >
              {post.productName || `${post.postType} post`}
            </p>
          </div>

          {post.status === "upcoming" && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowMoreActions((open) => !open)}
                className="w-7 h-7 rounded-lg border flex items-center justify-center transition-all"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-muted)",
                  background: "var(--bg-elevated)",
                }}
                aria-label="Open post actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              <AnimatePresence>
                {showMoreActions && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    className="absolute top-full right-0 mt-1.5 w-32 rounded-xl border overflow-hidden z-20 shadow-xl"
                    style={{
                      background: "var(--bg-card)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <button
                      onClick={() => {
                        setShowMoreActions(false);
                        onEdit();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-all"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setShowMoreActions(false);
                        onDelete();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-all border-t"
                      style={{
                        color: "#F54E38",
                        borderColor: "var(--border)",
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="mt-1 overflow-x-auto">
          <div className="flex items-center gap-2 w-max min-w-full pr-1">
            <span
              className={cn(
                "max-w-[110px]",
                post.status === "upcoming"
                  ? "badge-pending"
                  : post.status === "sent"
                    ? "badge-success"
                    : "badge-error",
              )}
            >
              {post.status === "upcoming" ? (
                <Clock className="w-3 h-3 shrink-0" />
              ) : post.status === "sent" ? (
                <CheckCircle2 className="w-3 h-3 shrink-0" />
              ) : (
                <XCircle className="w-3 h-3 shrink-0" />
              )}
              <span className="truncate">{post.status}</span>
            </span>

            {post.status === "upcoming" && (
              <>
                <span className="badge-pending capitalize max-w-[96px]">
                  <span className="truncate">{post.tone}</span>
                </span>
                <span className="badge-pending capitalize max-w-[96px]">
                  <span className="truncate">{post.postType}</span>
                </span>
              </>
            )}
          </div>
        </div>

        <p
          className="text-xs mt-1 line-clamp-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {post.caption || post.brief}
        </p>

        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          {/* Time */}
          <span
            className="flex items-center gap-1 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            <Clock className="w-3 h-3" />
            {post.sendTime}
          </span>
          {/* Repeat */}
          <span
            className="flex items-center gap-1 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            <Repeat className="w-3 h-3" />
            {post.repeat}
          </span>
          {/* Audience */}
          <span
            className="flex items-center gap-1 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {audienceEmoji} {audienceLabel}
          </span>
          {/* Celo badge */}
          {post.hasCeloPayment && post.price && (
            <span className="celo-badge">
              <Image
                src={dollarIcon}
                alt=""
                width={16}
                height={16}
                className="w-4 h-4"
              />
              {formatNumberWithDelimiters(post.price)} {post.currency}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Payments Tab
 ───────────────────────────────────────────────────────────────── */
function PaymentsTab() {
  const { transactions } = useEazeeStore();

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      <motion.div
        variants={item}
        className="rounded-xl border p-4"
        style={{
          background: "var(--brand-gold-dim)",
          borderColor: "rgba(223, 200, 23, 0.7)",
        }}
      >
        <h3
          className="font-semibold text-sm flex items-center gap-2"
          style={{ color: "#7a6800" }}
        >
          <Image
            src={circleDollarSignIcon}
            alt=""
            width={20}
            height={20}
            className="w-5 h-5"
          />
          Celo Smart Contract Escrow
        </h3>
        <p className="text-xs mt-2 max-w-2xl" style={{ color: "#7a6800" }}>
          Every &quot;Buy Now&quot; tap from your WhatsApp post triggers a cUSD
          payment to your escrow contract. Funds release when the order is
          confirmed. No middleman, no bank.
        </p>
      </motion.div>

      {/* Transaction list */}
      <motion.div variants={item} className="glass-card overflow-hidden">
        <div
          className="px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <h3
            className="font-semibold text-sm flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}
          >
            Recent Transactions
          </h3>
        </div>
        {transactions.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              No payments yet. Confirm orders to see escrow transactions.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-start gap-3 px-4 sm:px-5 py-3.5 hover:bg-[var(--bg-elevated)] transition-all"
              >
                <Image
                  src={dollarIcon}
                  alt=""
                  width={24}
                  height={24}
                  className="w-6 h-6 mt-0.5 shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: "var(--text-primary)" }}
                      title={tx.productName}
                    >
                      {tx.productName}
                    </p>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <p
                        className="text-sm font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {formatNumberWithDelimiters(tx.amount)} {tx.currency}
                      </p>
                    </div>
                  </div>

                  <div className="mt-0.5 min-w-0 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <Wallet
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: "var(--brand-dark)" }}
                      />
                      <p
                        className="text-[11px] truncate"
                        style={{ color: "var(--text-muted)" }}
                        title={tx.buyer}
                      >
                        {tx.buyer.slice(0, 6)}...{tx.buyer.slice(-4)}
                      </p>
                      <span
                        className="text-[11px] shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      >
                        · {getTimeAgo(tx.timestamp)}
                      </span>
                    </div>

                    <span
                      className={cn(
                        "shrink-0",
                        tx.escrowStatus === "confirmed"
                          ? "badge-success"
                          : tx.escrowStatus === "pending"
                            ? "badge-pending"
                            : "badge-error",
                      )}
                    >
                      {tx.escrowStatus === "confirmed" ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      {tx.escrowStatus}
                    </span>
                  </div>
                </div>

                <a
                  href={`${celoExplorerBaseUrl}/tx/${tx.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 hover:bg-[var(--bg-secondary)] transition-all"
                >
                  <ArrowUpRight
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--text-muted)" }}
                  />
                </a>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
