"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEazeeStore, type ScheduledPost } from "@/lib/store";
import { useRouter } from "next/navigation";
import Image, { type StaticImageData } from "next/image";
import confetti from "canvas-confetti";
import {
  Clock,
  Users,
  Radio,
  Check,
  Phone,
  ChevronDown,
  Sparkles,
  NotebookPen,
  Plus,
  Repeat,
  Send,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import addAPhotoIcon from "@/svg/add-a-photo.svg";
import calendarIcon from "@/svg/calendar.svg";
import announcementMegaphoneIcon from "@/svg/announcement-megaphone.svg";

type MessagingProvider = "whatsapp" | "telegram";

const MESSAGING_PROVIDER: MessagingProvider =
  process.env.NEXT_PUBLIC_EAZEE_MESSAGING_PROVIDER?.trim().toLowerCase() ===
  "telegram"
    ? "telegram"
    : "whatsapp";

const REPEAT_OPTIONS = [
  { id: "one-time", label: "One-time", icon: "1️⃣" },
  { id: "daily", label: "Daily", icon: "📅" },
  { id: "weekly", label: "Weekly", icon: "📆" },
  { id: "monthly", label: "Monthly", icon: "🗓️" },
];

interface TargetOption {
  id: string;
  label: string;
  description: string;
  icon?: LucideIcon;
  iconSrc?: StaticImageData;
}

const TARGET_OPTIONS: TargetOption[] = [
  {
    id: "status",
    label: "Status",
    icon: Radio,
    description: "Post to WhatsApp Status",
  },
  {
    id: "groups",
    label: "Groups",
    icon: Users,
    description: "Send to group chats",
  },
  {
    id: "broadcast",
    label: "Broadcast",
    iconSrc: announcementMegaphoneIcon,
    description: "Broadcast list",
  },
];

const TIME_CHIPS = [
  "7:00",
  "9:00",
  "12:00",
  "15:00",
  "17:00",
  "19:00",
  "20:00",
  "21:00",
];
const TIME_CHIP_HOURS = TIME_CHIPS.map((time) => {
  const [hourRaw] = time.split(":");
  return Number.parseInt(hourRaw, 10);
});
const STATUS_PEAK_WINDOWS = new Set(["9:00", "17:00", "19:00"]);
const TEMPLATE_LANGUAGE_OPTIONS = [
  { value: "en_US", label: "English (US) — en_US" },
  { value: "en_GB", label: "English (UK) — en_GB" },
  { value: "en", label: "English (generic) — en" },
];
const TEMPLATE_FALLBACK_STORAGE_KEY = "eazee-template-fallback-by-account";
const GROUP_DIRECTORY_STORAGE_KEY = "eazee-groups-by-account";
const DEFAULT_TEMPLATE_FALLBACK_ACCOUNT_KEY = "__default__";

interface TemplateFallbackDraft {
  useTemplateFallback: boolean;
  templateName: string;
  templateLanguageCode: string;
  templateBodyParamsInput: string;
  templateHeaderImageUrl: string;
}

type TemplateFallbackDraftByAccount = Record<string, TemplateFallbackDraft>;

interface GroupOption {
  id: string;
  name: string;
  members?: number;
  recipient?: string;
}

interface AllowlistChecklistState {
  recipient: string;
  templateName: string;
  graphErrorCode?: number;
}

type GroupDirectoryByAccount = Record<string, GroupOption[]>;

const DEFAULT_TEMPLATE_FALLBACK_DRAFT: TemplateFallbackDraft = {
  useTemplateFallback: true,
  templateName: "hello_world",
  templateLanguageCode: "en_US",
  templateBodyParamsInput: "",
  templateHeaderImageUrl: "",
};

function canUseBrowserStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function getTemplateFallbackAccountKey(accountId: string): string {
  const trimmed = accountId.trim();
  return trimmed || DEFAULT_TEMPLATE_FALLBACK_ACCOUNT_KEY;
}

function readTemplateFallbackDraftByAccount(): TemplateFallbackDraftByAccount {
  if (!canUseBrowserStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(TEMPLATE_FALLBACK_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as TemplateFallbackDraftByAccount;
    if (!parsed || typeof parsed !== "object") return {};

    return parsed;
  } catch {
    return {};
  }
}

function writeTemplateFallbackDraftByAccount(
  draftsByAccount: TemplateFallbackDraftByAccount,
): void {
  if (!canUseBrowserStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      TEMPLATE_FALLBACK_STORAGE_KEY,
      JSON.stringify(draftsByAccount),
    );
  } catch {
    // Ignore localStorage write failures.
  }
}

function readGroupDirectoryByAccount(): GroupDirectoryByAccount {
  if (!canUseBrowserStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(GROUP_DIRECTORY_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as GroupDirectoryByAccount;
    if (!parsed || typeof parsed !== "object") return {};

    return parsed;
  } catch {
    return {};
  }
}

function writeGroupDirectoryByAccount(
  groupsByAccount: GroupDirectoryByAccount,
): void {
  if (!canUseBrowserStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      GROUP_DIRECTORY_STORAGE_KEY,
      JSON.stringify(groupsByAccount),
    );
  } catch {
    // Ignore localStorage write failures.
  }
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

function normalizeRecipientPhone(value: string): string {
  const normalized = value.trim().replace(/[^\d+]/g, "");
  if (!normalized) return "";

  if (normalized.startsWith("+")) {
    return normalized;
  }

  if (normalized.startsWith("00")) {
    return `+${normalized.slice(2)}`;
  }

  return `+${normalized}`;
}

function normalizeTelegramRecipient(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function normalizeRecipientForProvider(
  value: string,
  provider: MessagingProvider,
): string {
  if (provider === "telegram") {
    return normalizeTelegramRecipient(value);
  }

  return normalizeRecipientPhone(value);
}

function buildTargetRecipients(
  targets: string[],
  selectedGroups: string[],
  accountNumber: string,
  groupRecipientsById: Record<string, string>,
  provider: MessagingProvider,
): Record<string, string> {
  const normalizedAccount = normalizeRecipientForProvider(
    accountNumber,
    provider,
  );
  if (!normalizedAccount) return {};

  const recipients: Record<string, string> = {};

  for (const target of targets) {
    if (target === "groups") {
      if (selectedGroups.length > 0) {
        for (const groupId of selectedGroups) {
          const groupRecipient = normalizeRecipientForProvider(
            groupRecipientsById[groupId] || normalizedAccount,
            provider,
          );

          if (groupRecipient) {
            recipients[groupId] = groupRecipient;
          }
        }
      } else {
        recipients.groups = normalizedAccount;
      }
      continue;
    }

    recipients[target] = normalizedAccount;
  }

  return recipients;
}

function toTimeChip(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (TIME_CHIPS.includes(trimmed)) {
    return trimmed;
  }

  const simpleMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (simpleMatch) {
    const hour = Number.parseInt(simpleMatch[1] || "", 10);
    if (!Number.isFinite(hour)) {
      return null;
    }

    const nearestIndex = TIME_CHIP_HOURS.reduce(
      (bestIndex, candidateHour, index) => {
        const bestDistance = Math.abs(TIME_CHIP_HOURS[bestIndex] - hour);
        const candidateDistance = Math.abs(candidateHour - hour);

        return candidateDistance < bestDistance ? index : bestIndex;
      },
      0,
    );

    return TIME_CHIPS[nearestIndex] || null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const hour = parsed.getHours();
  const nearestIndex = TIME_CHIP_HOURS.reduce(
    (bestIndex, candidateHour, index) => {
      const bestDistance = Math.abs(TIME_CHIP_HOURS[bestIndex] - hour);
      const candidateDistance = Math.abs(candidateHour - hour);

      return candidateDistance < bestDistance ? index : bestIndex;
    },
    0,
  );

  return TIME_CHIPS[nearestIndex] || null;
}

function buildStableScoreSeed(value: string): number {
  let seed = 0;

  for (const char of value) {
    seed = (seed * 31 + char.charCodeAt(0)) % 2147483647;
  }

  return seed;
}

function getRelevantPostsForAi(
  posts: ScheduledPost[],
  selectedAccountId: string,
  targets: string[],
): ScheduledPost[] {
  const activeTargets = new Set(targets);

  return posts.filter((post) => {
    if (selectedAccountId && post.waAccount !== selectedAccountId) {
      return false;
    }

    if (activeTargets.size === 0) {
      return true;
    }

    if (!Array.isArray(post.targets) || post.targets.length === 0) {
      return false;
    }

    return post.targets.some((target) => activeTargets.has(target));
  });
}

function getAiRecommendedTimes(
  targets: string[],
  repeatValue: string,
  posts: ScheduledPost[],
  selectedAccountId: string,
): string[] {
  const isStatusTargeted = targets.includes("status");
  const isRecurring = repeatValue !== "one-time";
  const now = new Date();
  const isWeekend = [0, 6].includes(now.getDay());
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const shouldPenalizePastToday = currentHour < 21.5;
  const rotationSeed = buildStableScoreSeed(
    `${selectedAccountId}|${[...targets].sort().join(",")}|${repeatValue}|${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`,
  );
  const rotatingAnchorTime =
    TIME_CHIPS[rotationSeed % TIME_CHIPS.length] || TIME_CHIPS[0];

  const relevantPosts = getRelevantPostsForAi(
    posts,
    selectedAccountId,
    targets,
  );
  const usageByTime = relevantPosts.reduce<
    Record<string, { scheduled: number; sent: number; failed: number }>
  >((accumulator, post) => {
    const normalizedTime = toTimeChip(post.sendTime);
    if (!normalizedTime) {
      return accumulator;
    }

    const createdAtMs = Date.parse(post.createdAt || "");
    const ageInDays = Number.isFinite(createdAtMs)
      ? Math.max(0, (now.getTime() - createdAtMs) / (1000 * 60 * 60 * 24))
      : 60;
    const recencyWeight = Math.max(0.35, 1 - ageInDays / 60);

    const existing = accumulator[normalizedTime] || {
      scheduled: 0,
      sent: 0,
      failed: 0,
    };

    existing.scheduled += recencyWeight;
    if (post.status === "sent") {
      existing.sent += recencyWeight * 1.1;
    }
    if (post.status === "failed") {
      existing.failed += recencyWeight * 1.2;
    }

    accumulator[normalizedTime] = existing;
    return accumulator;
  }, {});

  const scored = TIME_CHIPS.map((time) => {
    const [hourValueRaw] = time.split(":");
    const hourValue = Number.parseInt(hourValueRaw, 10);
    const usage = usageByTime[time] || { scheduled: 0, sent: 0, failed: 0 };
    let score = 34;

    if (STATUS_PEAK_WINDOWS.has(time)) {
      score += 22;
    } else if (hourValue >= 8 && hourValue <= 10) {
      score += 14;
    } else if (hourValue >= 16 && hourValue <= 20) {
      score += 17;
    } else {
      score += 6;
    }

    if (isStatusTargeted) {
      if (time === "19:00") score += 9;
      if (time === "17:00") score += 7;
      if (time === "9:00") score += 6;
    }

    if (isRecurring && (time === "9:00" || time === "19:00")) {
      score += 4;
    }

    if (isWeekend) {
      if (hourValue >= 18 && hourValue <= 21) {
        score += 7;
      }

      if (hourValue < 10) {
        score -= 4;
      }
    }

    if (shouldPenalizePastToday && repeatValue === "one-time") {
      if (hourValue + 0.25 < currentHour) {
        score -= 42;
      } else if (hourValue <= currentHour + 2.5) {
        score += 8;
      }
    }

    score -= usage.scheduled * 4;
    score += usage.sent * 5;
    score -= usage.failed * 8;

    if (relevantPosts.length === 0) {
      if (currentHour >= 14 && hourValue >= 17 && hourValue <= 21) {
        score += 5;
      }

      if (currentHour < 10 && hourValue >= 8 && hourValue <= 12) {
        score += 4;
      }

      if (time === rotatingAnchorTime) {
        score += 5;
      }
    }

    return {
      time,
      score,
      scheduledCount: usage.scheduled,
    };
  });

  return scored
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.scheduledCount !== right.scheduledCount) {
        return left.scheduledCount - right.scheduledCount;
      }

      return left.time.localeCompare(right.time);
    })
    .slice(0, 3)
    .map((entry) => entry.time);
}

function getGraphErrorCodeFromPayload(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;

  const error = (data as { error?: { code?: unknown } }).error;
  if (!error || typeof error !== "object") return undefined;

  return typeof error.code === "number" ? error.code : undefined;
}

function getTemplateTestGraphErrorCode(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const payloadRecord = payload as {
    details?: unknown;
    data?: { liveDetails?: unknown };
  };

  return (
    getGraphErrorCodeFromPayload(payloadRecord.data?.liveDetails) ||
    getGraphErrorCodeFromPayload(payloadRecord.details) ||
    getGraphErrorCodeFromPayload(payload)
  );
}

function isAllowlistErrorPayload(payload: unknown): boolean {
  const graphErrorCode = getTemplateTestGraphErrorCode(payload);
  if (graphErrorCode === 131030) {
    return true;
  }

  if (!payload || typeof payload !== "object") {
    return false;
  }

  const payloadRecord = payload as {
    error?: unknown;
    details?: { error?: { message?: unknown } };
    data?: { liveError?: unknown };
  };

  const text = [
    typeof payloadRecord.error === "string" ? payloadRecord.error : "",
    typeof payloadRecord.data?.liveError === "string"
      ? payloadRecord.data.liveError
      : "",
    typeof payloadRecord.details?.error?.message === "string"
      ? payloadRecord.details.error.message
      : "",
  ]
    .join(" ")
    .toLowerCase();

  return text.includes("allowed list") || text.includes("allowlist");
}

function formatTimeLabel(time: string): string {
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw || "0", 10);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return time;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  const normalizedMinute = minute.toString().padStart(2, "0");

  return `${normalizedHour}:${normalizedMinute} ${suffix}`;
}

function StepHeader({
  label,
  icon: Icon,
  className = "mb-4",
}: {
  label: string;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Icon
        className="w-4 h-4 shrink-0"
        style={{ color: "var(--brand-dark)" }}
      />
      <h2
        className="font-semibold text-sm"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </h2>
    </div>
  );
}

export default function SchedulePage() {
  const router = useRouter();
  const {
    waAccounts,
    selectedAccount,
    setSelectedAccount,
    addWAAccount,
    sendTime,
    setSendTime,
    customDateTime,
    setCustomDateTime,
    repeat,
    setRepeat,
    targets,
    setTargets,
    selectedGroups,
    setSelectedGroups,
    generatedCaption,
    captionDraft,
    savePost,
    posts,
    editingPostId,
    photos,
    brief,
  } = useEazeeStore();

  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [newAccountNumberError, setNewAccountNumberError] = useState("");
  const [timeMode, setTimeMode] = useState<"ai" | "custom">("ai");
  const [isScheduling, setIsScheduling] = useState(false);
  const [showTemplateLanguageMenu, setShowTemplateLanguageMenu] =
    useState(false);
  const [useTemplateFallback, setUseTemplateFallback] = useState(
    DEFAULT_TEMPLATE_FALLBACK_DRAFT.useTemplateFallback,
  );
  const [templateName, setTemplateName] = useState(
    DEFAULT_TEMPLATE_FALLBACK_DRAFT.templateName,
  );
  const [templateLanguageCode, setTemplateLanguageCode] = useState(
    DEFAULT_TEMPLATE_FALLBACK_DRAFT.templateLanguageCode,
  );
  const [templateBodyParamsInput, setTemplateBodyParamsInput] = useState(
    DEFAULT_TEMPLATE_FALLBACK_DRAFT.templateBodyParamsInput,
  );
  const [templateHeaderImageUrl, setTemplateHeaderImageUrl] = useState(
    DEFAULT_TEMPLATE_FALLBACK_DRAFT.templateHeaderImageUrl,
  );
  const [availableGroups, setAvailableGroups] = useState<GroupOption[]>([]);
  const [isImportingGroups, setIsImportingGroups] = useState(false);
  const [isSendingTemplateTest, setIsSendingTemplateTest] = useState(false);
  const [allowlistChecklist, setAllowlistChecklist] =
    useState<AllowlistChecklistState | null>(null);
  const scheduleSubmitLockRef = useRef(false);
  const isTelegramProvider = MESSAGING_PROVIDER === "telegram";
  const platformLabel = isTelegramProvider ? "Telegram" : "WhatsApp";
  const showTemplateFallbackSection = !isTelegramProvider;

  const selectedAccountObj = waAccounts.find(
    (account) => account.id === selectedAccount,
  );
  const captionSource =
    captionDraft.trim() || generatedCaption.trim() || brief.trim();
  const postReadyCaption = captionSource
    ? captionSource.length > 90
      ? `${captionSource.slice(0, 87)}...`
      : captionSource
    : "Your post is ready to schedule.";
  const isPostComposed =
    photos.length > 0 ||
    Boolean(captionDraft.trim()) ||
    Boolean(generatedCaption.trim()) ||
    Boolean(brief.trim());

  const toggleTarget = (id: string) =>
    setTargets(
      targets.includes(id)
        ? targets.filter((target) => target !== id)
        : [...targets, id],
    );

  const toggleGroup = (id: string) =>
    setSelectedGroups(
      selectedGroups.includes(id)
        ? selectedGroups.filter((groupId) => groupId !== id)
        : [...selectedGroups, id],
    );

  const canSchedule =
    selectedAccount &&
    (timeMode === "custom" ? customDateTime : sendTime) &&
    targets.length > 0 &&
    (!targets.includes("groups") || selectedGroups.length > 0) &&
    (!showTemplateFallbackSection ||
      !useTemplateFallback ||
      Boolean(templateName.trim()));

  const templateBodyParameters = templateBodyParamsInput
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
  const templateHeaderImageUrlValue = templateHeaderImageUrl.trim();
  const selectedTemplateLanguageOption =
    TEMPLATE_LANGUAGE_OPTIONS.find(
      (option) => option.value === templateLanguageCode,
    ) || TEMPLATE_LANGUAGE_OPTIONS[0];
  const groupRecipientsById = availableGroups.reduce<Record<string, string>>(
    (accumulator, group) => {
      if (group.recipient) {
        accumulator[group.id] = group.recipient;
      }

      return accumulator;
    },
    {},
  );
  const aiRecommendedTimes = useMemo(
    () => getAiRecommendedTimes(targets, repeat, posts, selectedAccount),
    [targets, repeat, posts, selectedAccount],
  );
  const aiRelevantHistoryCount = useMemo(
    () => getRelevantPostsForAi(posts, selectedAccount, targets).length,
    [posts, selectedAccount, targets],
  );
  const aiRecommendationText = aiRecommendedTimes
    .map((time) => formatTimeLabel(time))
    .join(", ");
  const aiRecommendationReason =
    aiRelevantHistoryCount > 0
      ? `from ${aiRelevantHistoryCount} scheduled post${aiRelevantHistoryCount === 1 ? "" : "s"}, your audience mix, and current local time.`
      : "from audience engagement patterns and current local time.";

  useEffect(() => {
    if (timeMode !== "ai") return;

    const primaryRecommendation = aiRecommendedTimes[0] || "9:00";
    if (!sendTime || !aiRecommendedTimes.includes(sendTime)) {
      setSendTime(primaryRecommendation);
    }
  }, [timeMode, aiRecommendedTimes, sendTime, setSendTime]);

  useEffect(() => {
    const accountKey = getTemplateFallbackAccountKey(selectedAccount);
    const draftsByAccount = readTemplateFallbackDraftByAccount();
    const draft =
      draftsByAccount[accountKey] || DEFAULT_TEMPLATE_FALLBACK_DRAFT;

    setUseTemplateFallback(Boolean(draft.useTemplateFallback));
    setTemplateName(draft.templateName || "hello_world");
    setTemplateLanguageCode(draft.templateLanguageCode || "en_US");
    setTemplateBodyParamsInput(draft.templateBodyParamsInput || "");
    setTemplateHeaderImageUrl(draft.templateHeaderImageUrl || "");
    setShowTemplateLanguageMenu(false);
  }, [selectedAccount]);

  useEffect(() => {
    const accountKey = getTemplateFallbackAccountKey(selectedAccount);
    const groupsByAccount = readGroupDirectoryByAccount();
    const groups = Array.isArray(groupsByAccount[accountKey])
      ? groupsByAccount[accountKey]
          .filter((group) => Boolean(group?.id) && Boolean(group?.name))
          .map((group) => ({
            id: String(group.id),
            name: String(group.name),
            members:
              typeof group.members === "number" &&
              Number.isFinite(group.members)
                ? Math.max(0, Math.floor(group.members))
                : undefined,
            recipient:
              typeof group.recipient === "string" && group.recipient.trim()
                ? group.recipient.trim()
                : undefined,
          }))
      : [];

    setAvailableGroups(groups);
  }, [selectedAccount]);

  useEffect(() => {
    if (selectedGroups.length === 0) return;

    const allowedGroupIds = new Set(availableGroups.map((group) => group.id));
    const filtered = selectedGroups.filter((groupId) =>
      allowedGroupIds.has(groupId),
    );

    if (filtered.length !== selectedGroups.length) {
      setSelectedGroups(filtered);
    }
  }, [availableGroups, selectedGroups, setSelectedGroups]);

  useEffect(() => {
    const accountKey = getTemplateFallbackAccountKey(selectedAccount);
    const draftsByAccount = readTemplateFallbackDraftByAccount();

    draftsByAccount[accountKey] = {
      useTemplateFallback,
      templateName,
      templateLanguageCode,
      templateBodyParamsInput,
      templateHeaderImageUrl,
    };

    writeTemplateFallbackDraftByAccount(draftsByAccount);
  }, [
    selectedAccount,
    useTemplateFallback,
    templateName,
    templateLanguageCode,
    templateBodyParamsInput,
    templateHeaderImageUrl,
  ]);

  const formatWhatsAppNumber = (value: string) => {
    if (isTelegramProvider) {
      const normalized = normalizeTelegramRecipient(value);
      if (!normalized) return null;

      if (/^@[A-Za-z0-9_]{5,}$/.test(normalized)) {
        return normalized;
      }

      if (/^-?\d{5,}$/.test(normalized)) {
        return normalized;
      }

      return null;
    }

    const digitsOnly = value.replace(/\D/g, "");
    if (!digitsOnly) return null;

    const normalized = digitsOnly.startsWith("234")
      ? `+${digitsOnly}`
      : digitsOnly.startsWith("0")
        ? `+234${digitsOnly.slice(1)}`
        : digitsOnly.length === 10
          ? `+234${digitsOnly}`
          : `+${digitsOnly}`;

    const parsed = parsePhoneNumberFromString(normalized, "NG");
    if (!parsed || !parsed.isValid()) return null;

    return parsed.formatInternational();
  };

  const formattedNewAccountNumber = formatWhatsAppNumber(newAccountNumber);
  const canSaveNewAccount =
    Boolean(newAccountLabel.trim()) && Boolean(formattedNewAccountNumber);

  const handleAddAccount = () => {
    const label = newAccountLabel.trim();
    const number = newAccountNumber.trim();
    if (!label || !number) return;

    const formattedNumber = formatWhatsAppNumber(number);
    if (!formattedNumber) {
      setNewAccountNumberError(
        isTelegramProvider
          ? "Enter a valid Telegram chat id (e.g. -100... or @channelusername)."
          : "Enter a valid WhatsApp number (digits only).",
      );
      toast({
        title: `Invalid ${platformLabel} destination`,
        description: isTelegramProvider
          ? "Use a numeric chat id (example: -1001234567890) or @username."
          : "Use a valid local or international number.",
        variant: "error",
      });
      return;
    }

    addWAAccount({ label, number: formattedNumber });
    setNewAccountLabel("");
    setNewAccountNumber("");
    setNewAccountNumberError("");
    setShowAddAccountForm(false);
    setShowAccountMenu(false);
  };

  const handleSchedule = async () => {
    if (!canSchedule || isScheduling || scheduleSubmitLockRef.current) return;

    scheduleSubmitLockRef.current = true;
    setIsScheduling(true);

    try {
      const {
        photos,
        productName,
        postType,
        brief,
        tone,
        hasCeloPayment,
        price,
        currency,
        posts,
      } = useEazeeStore.getState();
      const existingPost = editingPostId
        ? posts.find((post) => post.id === editingPostId)
        : undefined;

      const resolvedSendTime =
        timeMode === "custom" ? customDateTime : sendTime;

      const targetRecipients = buildTargetRecipients(
        targets,
        selectedGroups,
        selectedAccountObj?.number || "",
        groupRecipientsById,
        MESSAGING_PROVIDER,
      );

      const scheduleResponse = await fetch("/api/schedule-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caption: captionSource,
          templateName:
            showTemplateFallbackSection && useTemplateFallback
              ? templateName.trim()
              : undefined,
          templateLanguageCode:
            showTemplateFallbackSection && useTemplateFallback
              ? templateLanguageCode.trim()
              : undefined,
          templateBodyParameters:
            showTemplateFallbackSection && useTemplateFallback
              ? templateBodyParameters
              : undefined,
          templateHeaderImageUrl:
            showTemplateFallbackSection &&
            useTemplateFallback &&
            templateHeaderImageUrlValue
              ? templateHeaderImageUrlValue
              : undefined,
          postType,
          brief,
          tone,
          photos: photos.map((photo) => photo.preview),
          hasCeloPayment,
          price,
          currency,
          waAccount: selectedAccount,
          sendTime: resolvedSendTime,
          repeat,
          targets,
          groups: selectedGroups,
          targetRecipients,
        }),
      });

      const scheduleResult = await scheduleResponse.json().catch(() => ({}));

      if (!scheduleResponse.ok) {
        const errorMessage =
          typeof scheduleResult?.error === "string"
            ? scheduleResult.error
            : "Failed to schedule post";
        throw new Error(errorMessage);
      }

      const scheduledFor =
        typeof scheduleResult?.scheduledFor === "string"
          ? Date.parse(scheduleResult.scheduledFor)
          : Number.NaN;

      if (
        Number.isFinite(scheduledFor) &&
        scheduledFor <= Date.now() + 15_000
      ) {
        void fetch("/api/whatsapp/dispatch-due", { method: "POST" });
      }

      savePost({
        id: editingPostId ?? `post-${Date.now()}`,
        photos: photos.map((photo) => photo.preview),
        productName,
        postType,
        brief,
        tone,
        caption: captionSource,
        templateName:
          showTemplateFallbackSection && useTemplateFallback
            ? templateName.trim()
            : undefined,
        templateLanguageCode:
          showTemplateFallbackSection && useTemplateFallback
            ? templateLanguageCode.trim()
            : undefined,
        templateBodyParameters:
          showTemplateFallbackSection && useTemplateFallback
            ? templateBodyParameters
            : undefined,
        templateHeaderImageUrl:
          showTemplateFallbackSection &&
          useTemplateFallback &&
          templateHeaderImageUrlValue
            ? templateHeaderImageUrlValue
            : undefined,
        hasCeloPayment,
        price,
        currency,
        waAccount: selectedAccount,
        sendTime: resolvedSendTime,
        repeat: repeat as "one-time" | "daily" | "weekly" | "monthly",
        targets,
        groups: selectedGroups,
        status: "upcoming",
        createdAt: existingPost?.createdAt ?? new Date().toISOString(),
      });

      confetti({
        particleCount: 120,
        spread: 95,
        startVelocity: 40,
        origin: { y: 0.62 },
        disableForReducedMotion: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 600));
      const searchParams = new URLSearchParams();
      searchParams.set("scheduled", "1");
      searchParams.set("mode", editingPostId ? "updated" : "created");
      searchParams.set(
        "toast",
        typeof scheduleResult?.jobId === "string"
          ? scheduleResult.jobId
          : `${Date.now()}`,
      );

      if (typeof scheduleResult?.queuedTargets === "number") {
        searchParams.set("queued", String(scheduleResult.queuedTargets));
      }

      router.push(`/dashboard?${searchParams.toString()}`);
    } catch (error) {
      console.error(error);
      toast({
        title: "Scheduling failed",
        description: "Please try again.",
        variant: "error",
      });
    } finally {
      setIsScheduling(false);
      scheduleSubmitLockRef.current = false;
    }
  };

  const handleImportGroups = async () => {
    if (isImportingGroups) return;

    if (!selectedAccount) {
      toast({
        title: `Select a ${platformLabel} destination`,
        description: "Choose an account before importing groups.",
        variant: "error",
      });
      return;
    }

    setIsImportingGroups(true);

    try {
      const params = new URLSearchParams();
      params.set("waAccount", selectedAccount);

      if (selectedAccountObj?.number?.trim()) {
        params.set("accountNumber", selectedAccountObj.number.trim());
      }

      const response = await fetch(`/api/whatsapp/import-groups?${params}`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to import groups.",
        );
      }

      const importedGroups: GroupOption[] = Array.isArray(payload?.groups)
        ? (payload.groups as Array<Record<string, unknown>>)
            .filter((group) => Boolean(group?.id) && Boolean(group?.name))
            .map((group) => ({
              id: String(group.id),
              name: String(group.name),
              members:
                typeof group.members === "number" &&
                Number.isFinite(group.members)
                  ? Math.max(0, Math.floor(group.members))
                  : undefined,
              recipient:
                typeof group.recipient === "string" && group.recipient.trim()
                  ? group.recipient.trim()
                  : undefined,
            }))
        : [];

      setAvailableGroups(importedGroups);

      const accountKey = getTemplateFallbackAccountKey(selectedAccount);
      const groupsByAccount = readGroupDirectoryByAccount();
      groupsByAccount[accountKey] = importedGroups;
      writeGroupDirectoryByAccount(groupsByAccount);

      toast({
        title: "Groups imported",
        description:
          importedGroups.length > 0
            ? `Imported ${importedGroups.length} group(s) for this account.`
            : "No groups were returned by your backend source.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Group import failed",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setIsImportingGroups(false);
    }
  };

  const buildForwardMessage = () => {
    const groupNameById = availableGroups.reduce<Record<string, string>>(
      (accumulator, group) => {
        accumulator[group.id] = group.name;
        return accumulator;
      },
      {},
    );

    const selectedGroupNames = selectedGroups
      .map((groupId) => groupNameById[groupId])
      .filter(Boolean);

    return selectedGroupNames.length > 0
      ? `${captionSource.trim()}\n\nForward to groups:\n${selectedGroupNames
          .map((name, index) => `${index + 1}. ${name}`)
          .join("\n")}`
      : captionSource.trim();
  };

  const handleOpenWhatsAppForward = () => {
    if (selectedGroups.length === 0) {
      toast({
        title: "Select groups first",
        description: "Choose at least one group to forward this message.",
        variant: "error",
      });
      return;
    }

    if (!captionSource.trim()) {
      toast({
        title: "Caption required",
        description: "Generate or write a caption before forwarding.",
        variant: "error",
      });
      return;
    }

    const forwardMessage = buildForwardMessage();
    const isMobileDevice =
      typeof navigator !== "undefined" &&
      /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    const encodedMessage = encodeURIComponent(forwardMessage);
    const mobileDeepLink = `whatsapp://send?text=${encodedMessage}`;
    const mobileWebFallback = `https://wa.me/?text=${encodedMessage}`;
    const desktopWebUrl = `https://web.whatsapp.com/send?text=${encodedMessage}`;
    const primaryUrl = isMobileDevice ? mobileDeepLink : desktopWebUrl;

    const popup = window.open(primaryUrl, "_blank");

    if (!popup) {
      window.location.assign(
        isMobileDevice ? mobileWebFallback : desktopWebUrl,
      );
      toast({
        title: "Opening WhatsApp",
        description:
          "If your browser blocked the popup, WhatsApp is now opening in this tab.",
        variant: "info",
      });
      return;
    }

    if (isMobileDevice) {
      window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.assign(mobileWebFallback);
        }
      }, 900);
    }

    toast({
      title: "WhatsApp opened",
      description:
        "Select your groups in WhatsApp and forward the prepared message.",
      variant: "info",
    });
  };

  const handleOpenTelegramForward = () => {
    if (selectedGroups.length === 0) {
      toast({
        title: "Select groups first",
        description: "Choose at least one group to forward this message.",
        variant: "error",
      });
      return;
    }

    if (!captionSource.trim()) {
      toast({
        title: "Caption required",
        description: "Generate or write a caption before forwarding.",
        variant: "error",
      });
      return;
    }

    const forwardMessage = buildForwardMessage();
    const encodedMessage = encodeURIComponent(forwardMessage);
    const fallbackShareUrl = `https://t.me/share/url?url=${encodeURIComponent("https://eazee.app")}&text=${encodedMessage}`;
    const deepLink = `tg://msg_url?url=${encodeURIComponent("https://eazee.app")}&text=${encodedMessage}`;
    const popup = window.open(deepLink, "_blank");

    if (!popup) {
      window.location.assign(fallbackShareUrl);
      toast({
        title: "Opening Telegram",
        description:
          "If your browser blocked the popup, Telegram share is opening in this tab.",
        variant: "info",
      });
      return;
    }

    window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.open(fallbackShareUrl, "_blank");
      }
    }, 900);

    toast({
      title: "Telegram opened",
      description:
        "Select the destination in Telegram and forward the prepared message.",
      variant: "info",
    });
  };

  const handleSendTemplateTestNow = async () => {
    if (isSendingTemplateTest) return;

    const destination = selectedAccountObj?.number?.trim() || "";
    const trimmedTemplateName = templateName.trim();

    if (!destination) {
      toast({
        title: "Select a WhatsApp account",
        description: "Pick an account so we know where to send the test.",
        variant: "error",
      });
      return;
    }

    if (!trimmedTemplateName) {
      toast({
        title: "Template name required",
        description: "Enter your approved template name before sending a test.",
        variant: "error",
      });
      return;
    }

    setIsSendingTemplateTest(true);

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "template",
          to: destination,
          templateName: trimmedTemplateName,
          templateLanguageCode: templateLanguageCode.trim(),
          templateBodyParameters,
          templateHeaderImageUrl: templateHeaderImageUrlValue || undefined,
          targetType: "individual",
          allowMvpTemplateBypass: true,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      const graphErrorCode = getTemplateTestGraphErrorCode(payload);
      const hasAllowlistError = isAllowlistErrorPayload(payload);

      if (hasAllowlistError) {
        setAllowlistChecklist({
          recipient: destination,
          templateName: trimmedTemplateName,
          graphErrorCode,
        });
      } else if (response.ok) {
        setAllowlistChecklist(null);
      }

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Template test send failed",
        );
      }

      toast({
        title:
          payload?.data?.mvpBypass === true
            ? "Template test simulated"
            : "Template test sent",
        description:
          payload?.data?.mvpBypass === true
            ? String(payload?.data?.liveError || "")
                .toLowerCase()
                .includes("allowed list")
              ? "MVP bypass is active because this recipient is not yet in your WhatsApp test allowlist. You can keep demoing while you add/verify the number in Meta."
              : "MVP bypass is active because live template delivery is currently blocked. You can keep demoing the flow now."
            : payload?.mode === "mock"
              ? "Sent in mock mode. Add live Cloud API keys for real delivery."
              : "Delivered through WhatsApp send API.",
        variant: payload?.data?.mvpBypass === true ? "info" : "success",
      });
    } catch (error) {
      toast({
        title: "Template test failed",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setIsSendingTemplateTest(false);
    }
  };

  return (
    <div
      className="min-h-screen p-4 sm:p-6 lg:p-8"
      style={{ background: "var(--bg-primary)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <p className="step-label mb-1">Schedule</p>
        <h1
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Set Time &amp; Audience
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Choose when to post and who sees it
        </p>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="w-full space-y-4"
      >
        {isPostComposed && (
          <motion.div
            variants={item}
            className="flex gap-4 p-4 rounded-xl border"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border)",
            }}
          >
            {photos.length > 0 ? (
              <div className="relative w-14 h-14 shrink-0">
                <div className="w-14 h-14 rounded-xl relative overflow-hidden border border-[var(--border)]">
                  <Image
                    src={photos[0].preview}
                    alt="Post preview"
                    fill
                    className="object-cover"
                  />
                </div>
                {photos.length > 1 && (
                  <span className="absolute -top-1.5 -right-1.5 z-20 min-w-[22px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white border border-white/70 bg-[var(--brand-dark)] shadow-sm">
                    +{photos.length - 1}
                  </span>
                )}
              </div>
            ) : (
              <div className="w-14 h-14 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                <Image
                  src={addAPhotoIcon}
                  alt=""
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
              </div>
            )}
            <div className="flex flex-col justify-center">
              <h3
                className="font-bold text-sm"
                style={{ color: "var(--brand-dark)" }}
              >
                Post Ready
              </h3>
              <p
                className="text-xs mt-1 line-clamp-1"
                style={{ color: "var(--text-secondary)" }}
                title={captionSource || undefined}
              >
                {postReadyCaption}
              </p>
            </div>
          </motion.div>
        )}

        <motion.div variants={item} className="glass-card p-4 sm:p-5">
          <StepHeader
            icon={Phone}
            label={
              isTelegramProvider ? "Telegram Destination" : "WhatsApp Account"
            }
          />

          <div className="relative">
            <button
              onClick={() => setShowAccountMenu((open) => !open)}
              className="w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all"
              style={{
                background: "var(--bg-elevated)",
                borderColor: "var(--border)",
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--brand-dim)" }}
              >
                <Phone
                  className="w-4 h-4"
                  style={{ color: "var(--brand-dark)" }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {selectedAccountObj?.label || "Select destination"}
                </p>
                <p
                  className="text-xs truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {selectedAccountObj?.number || "No account selected"}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "w-4 h-4 shrink-0 transition-transform",
                  showAccountMenu && "rotate-180",
                )}
                style={{ color: "var(--text-muted)" }}
              />
            </button>

            <AnimatePresence>
              {showAccountMenu && (
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
                  {waAccounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => {
                        setSelectedAccount(account.id);
                        setShowAccountMenu(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3.5 text-sm transition-all text-left",
                        selectedAccount === account.id ? "font-semibold" : "",
                      )}
                      style={{
                        color:
                          selectedAccount === account.id
                            ? "var(--brand-dark)"
                            : "var(--text-secondary)",
                        background:
                          selectedAccount === account.id
                            ? "var(--brand-dim)"
                            : "transparent",
                      }}
                    >
                      <Phone className="w-4 h-4 shrink-0" />
                      <div className="flex-1 text-left">
                        <p className="font-semibold">{account.label}</p>
                        <p className="text-[11px] opacity-70">
                          {account.number}
                        </p>
                      </div>
                      {selectedAccount === account.id && (
                        <Check className="w-4 h-4 ml-auto" />
                      )}
                    </button>
                  ))}

                  <div
                    className="border-t p-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <button
                      onClick={() => setShowAddAccountForm((show) => !show)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        color: "var(--text-primary)",
                        background: "var(--bg-elevated)",
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Add account
                    </button>

                    <AnimatePresence>
                      {showAddAccountForm && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2.5 space-y-2.5 px-1">
                            <input
                              value={newAccountLabel}
                              onChange={(event) =>
                                setNewAccountLabel(event.target.value)
                              }
                              placeholder="Account label (e.g. Main Business)"
                              className="input-base"
                            />
                            <input
                              value={newAccountNumber}
                              onChange={(event) => {
                                const inputValue = event.target.value;
                                setNewAccountNumber(
                                  isTelegramProvider
                                    ? inputValue.replace(/\s+/g, "")
                                    : inputValue.replace(/\D/g, ""),
                                );
                                if (newAccountNumberError) {
                                  setNewAccountNumberError("");
                                }
                              }}
                              onBlur={() => {
                                if (
                                  newAccountNumber.trim() &&
                                  !formatWhatsAppNumber(newAccountNumber)
                                ) {
                                  setNewAccountNumberError(
                                    isTelegramProvider
                                      ? "Enter a valid Telegram chat id (e.g. -100... or @channelusername)."
                                      : "Enter a valid WhatsApp number (digits only).",
                                  );
                                }
                              }}
                              inputMode={
                                isTelegramProvider ? "text" : "numeric"
                              }
                              pattern={
                                isTelegramProvider ? undefined : "[0-9]*"
                              }
                              placeholder={
                                isTelegramProvider
                                  ? "Telegram chat id (e.g. -1001234567890 or @channelusername)"
                                  : "WhatsApp number (include country code)"
                              }
                              className="input-base"
                            />
                            {newAccountNumberError && (
                              <p
                                className="text-[11px]"
                                style={{ color: "var(--brand-red)" }}
                              >
                                {newAccountNumberError}
                              </p>
                            )}
                            {formattedNewAccountNumber && (
                              <p
                                className="text-[11px]"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Destination: {formattedNewAccountNumber}
                              </p>
                            )}
                            <button
                              onClick={handleAddAccount}
                              disabled={!canSaveNewAccount}
                              className="w-full py-2.5 rounded-lg border text-sm font-semibold transition-all"
                              style={{
                                borderColor: "var(--border)",
                                background: "var(--bg-primary)",
                                color: "var(--brand-dark)",
                                opacity: canSaveNewAccount ? 1 : 0.55,
                              }}
                            >
                              Save account
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {showTemplateFallbackSection && (
          <motion.div variants={item} className="glass-card p-4 sm:p-5">
            <StepHeader icon={NotebookPen} label="Template Fallback" />

            <button
              onClick={() => setUseTemplateFallback((value) => !value)}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all"
              style={{
                background: "var(--bg-elevated)",
                borderColor: "var(--border)",
              }}
            >
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Use approved template when text send is blocked
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Recommended for pre-verification/demo reliability.
                </p>
              </div>
              <div
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                style={{
                  borderColor: useTemplateFallback
                    ? "var(--brand-green)"
                    : "var(--border)",
                  background: useTemplateFallback
                    ? "var(--brand-green)"
                    : "transparent",
                }}
              >
                {useTemplateFallback && (
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                )}
              </div>
            </button>

            {useTemplateFallback && (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">
                    Template name (required)
                  </p>
                  <input
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder="e.g. hello_world or eazee_offer_v1"
                    className="input-base"
                  />
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Use the exact approved template slug from WhatsApp Manager.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">
                    Language code (required)
                  </p>
                  <div className="relative">
                    <button
                      onClick={() =>
                        setShowTemplateLanguageMenu((open) => !open)
                      }
                      className="w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all"
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
                          {selectedTemplateLanguageOption.label}
                        </p>
                        <p
                          className="text-xs truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Approved template locale
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 shrink-0 transition-transform",
                          showTemplateLanguageMenu && "rotate-180",
                        )}
                        style={{ color: "var(--text-muted)" }}
                      />
                    </button>

                    <AnimatePresence>
                      {showTemplateLanguageMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border overflow-hidden z-40 shadow-xl"
                          style={{
                            background: "var(--bg-card)",
                            borderColor: "var(--border)",
                          }}
                        >
                          {TEMPLATE_LANGUAGE_OPTIONS.map((option) => {
                            const isSelected =
                              option.value === templateLanguageCode;

                            return (
                              <button
                                key={option.value}
                                onClick={() => {
                                  setTemplateLanguageCode(option.value);
                                  setShowTemplateLanguageMenu(false);
                                }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-4 py-3.5 text-sm transition-all text-left",
                                  isSelected ? "font-semibold" : "",
                                )}
                                style={{
                                  color: isSelected
                                    ? "var(--brand-dark)"
                                    : "var(--text-secondary)",
                                  background: isSelected
                                    ? "var(--brand-dim)"
                                    : "transparent",
                                }}
                              >
                                <span className="flex-1 truncate">
                                  {option.label}
                                </span>
                                {isSelected && (
                                  <Check className="w-4 h-4 ml-auto" />
                                )}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Must match the exact approved language on WhatsApp Manager.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">
                    Body parameters (optional)
                  </p>
                  <input
                    value={templateBodyParamsInput}
                    onChange={(event) =>
                      setTemplateBodyParamsInput(event.target.value)
                    }
                    placeholder="Use | separator, e.g. Ada|Fabric Bundle|15%|31 Mar"
                    className="input-base"
                  />
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Order must match template placeholders in sequence (1st,
                    2nd, 3rd, ...).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">
                    Media header image URL (optional)
                  </p>
                  <input
                    value={templateHeaderImageUrl}
                    onChange={(event) =>
                      setTemplateHeaderImageUrl(event.target.value)
                    }
                    placeholder="https://your-domain.com/product-image.jpg"
                    className="input-base"
                  />
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Use this only for templates with IMAGE header. The URL must
                    be publicly reachable over HTTPS.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSendTemplateTestNow}
                  disabled={
                    isSendingTemplateTest ||
                    !selectedAccountObj?.number ||
                    !Boolean(templateName.trim())
                  }
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg-primary)",
                    color: "var(--brand-dark)",
                    opacity:
                      isSendingTemplateTest ||
                      !selectedAccountObj?.number ||
                      !Boolean(templateName.trim())
                        ? 0.6
                        : 1,
                  }}
                >
                  {isSendingTemplateTest ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="w-4 h-4 border-2 border-[var(--brand-dark)]/30 border-t-[var(--brand-dark)] rounded-full"
                      />
                      Sending template test...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send template test now
                    </>
                  )}
                </button>

                {allowlistChecklist && (
                  <div
                    className="mt-3 rounded-xl border p-3 space-y-1"
                    style={{
                      background: "var(--bg-elevated)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <p
                      className="text-xs font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Recipient allowlist required
                      {typeof allowlistChecklist.graphErrorCode === "number"
                        ? ` (${allowlistChecklist.graphErrorCode})`
                        : ""}
                    </p>
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Template {allowlistChecklist.templateName} to{" "}
                      {allowlistChecklist.recipient} is blocked until this
                      number is in your Meta test recipient list.
                    </p>
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      1) Meta App Dashboard → WhatsApp → API Setup.
                    </p>
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      2) Add and verify this phone number under the test
                      recipient list.
                    </p>
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      3) Retry the test; until Meta go-live, only allowlisted
                      recipients can receive Cloud API template tests.
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        <motion.div variants={item} className="glass-card p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <StepHeader icon={Clock} label="Send Time" className="mb-0" />

            <div className="flex w-full justify-start sm:w-auto sm:justify-end">
              <div
                className="flex w-fit p-1 rounded-full border border-[var(--border)]"
                style={{ background: "var(--bg-primary)" }}
              >
                <button
                  onClick={() => setTimeMode("ai")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                    timeMode === "ai"
                      ? "text-[var(--brand-dark)] border shadow-sm"
                      : "text-[var(--text-secondary)] border border-transparent",
                  )}
                  style={{
                    background:
                      timeMode === "ai" ? "var(--bg-card)" : "transparent",
                    borderColor:
                      timeMode === "ai" ? "var(--brand-green)" : "transparent",
                  }}
                >
                  <Sparkles className="w-3 h-3" /> AI Suggest
                </button>
                <button
                  onClick={() => setTimeMode("custom")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                    timeMode === "custom"
                      ? "text-[var(--brand-dark)] border shadow-sm"
                      : "text-[var(--text-secondary)] border border-transparent",
                  )}
                  style={{
                    background:
                      timeMode === "custom" ? "var(--bg-card)" : "transparent",
                    borderColor:
                      timeMode === "custom"
                        ? "var(--brand-green)"
                        : "transparent",
                  }}
                >
                  <Image
                    src={calendarIcon}
                    alt=""
                    width={12}
                    height={12}
                    className="w-3 h-3"
                  />{" "}
                  Custom
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {timeMode === "ai" ? (
              <motion.div
                key="ai"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div
                  className="flex items-center gap-2 p-3 rounded-xl border mb-5"
                  style={{
                    background: "var(--brand-dim)",
                    borderColor: "var(--border)",
                  }}
                >
                  <Sparkles className="w-4 h-4 text-[var(--brand-dark)] shrink-0" />
                  <p className="text-[11px] text-[var(--text-primary)]">
                    AI recommends <strong>{aiRecommendationText}</strong> based
                    {` ${aiRecommendationReason}`}
                  </p>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {TIME_CHIPS.map((time) => {
                    const isAiTagged = aiRecommendedTimes.includes(time);
                    const isActive = sendTime === time;

                    return (
                      <button
                        key={time}
                        onClick={() => {
                          setSendTime(time);
                          setTimeMode("ai");
                        }}
                        className="px-2.5 py-2.5 rounded-full border text-[11px] font-semibold transition-all relative"
                        style={{
                          borderColor: isAiTagged
                            ? "#F54E38"
                            : isActive
                              ? "var(--brand-green)"
                              : "var(--border)",
                          color: isAiTagged
                            ? "#F54E38"
                            : isActive
                              ? "var(--brand-dark)"
                              : "var(--text-secondary)",
                          background:
                            isAiTagged && isActive
                              ? "rgba(245, 78, 56, 0.08)"
                              : isActive
                                ? "var(--brand-dim)"
                                : "transparent",
                        }}
                      >
                        {time}
                        {isAiTagged && (
                          <span className="absolute -top-[3px] right-0.5 translate-x-[24%] -translate-y-1/2 min-w-[14px] h-[11px] px-[3px] rounded-full text-[6px] font-semibold uppercase leading-[11px] text-center tracking-tight bg-[#F54E38] text-white">
                            AI
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="custom"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <input
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(event) => setCustomDateTime(event.target.value)}
                  className="input-base"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div variants={item} className="glass-card p-4 sm:p-5">
          <StepHeader icon={Repeat} label="Repeat Schedule" />

          <div className="grid grid-cols-4 gap-2">
            {REPEAT_OPTIONS.map((option) => {
              const isActive = repeat === option.id;

              return (
                <motion.button
                  key={option.id}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() =>
                    setRepeat(
                      option.id as "one-time" | "daily" | "weekly" | "monthly",
                    )
                  }
                  className="py-3 rounded-xl border text-center transition-all"
                  style={{
                    borderColor: isActive
                      ? "var(--brand-green)"
                      : "var(--border)",
                    background: isActive
                      ? "var(--brand-dim)"
                      : "var(--bg-elevated)",
                  }}
                >
                  <p className="text-base sm:text-lg mb-1">{option.icon}</p>
                  <p
                    className="text-[11px] font-semibold"
                    style={{
                      color: isActive
                        ? "var(--brand-dark)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {option.label}
                  </p>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        <motion.div variants={item} className="glass-card p-4 sm:p-5">
          <StepHeader icon={Users} label="Delivery Target" />

          <div className="space-y-2.5">
            {TARGET_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isActive = targets.includes(option.id);

              return (
                <Fragment key={option.id}>
                  <motion.button
                    whileTap={{ scale: 0.99 }}
                    onClick={() => toggleTarget(option.id)}
                    className="w-full flex items-center gap-3 sm:gap-3.5 p-3.5 sm:p-4 rounded-xl border text-left transition-all"
                    style={{
                      borderColor: isActive
                        ? "var(--brand-green)"
                        : "var(--border)",
                      background: isActive
                        ? "var(--brand-dim)"
                        : "var(--bg-elevated)",
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all"
                      style={{
                        background: isActive
                          ? "var(--brand-dim)"
                          : "var(--bg-secondary)",
                      }}
                    >
                      {Icon && (
                        <Icon
                          className="w-4 h-4"
                          style={{
                            color: isActive
                              ? "var(--brand-dark)"
                              : "var(--text-muted)",
                          }}
                        />
                      )}
                      {option.iconSrc && (
                        <Image
                          src={option.iconSrc}
                          alt=""
                          width={16}
                          height={16}
                          className={cn(
                            "w-4 h-4",
                            isActive ? "opacity-100" : "opacity-60",
                          )}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {option.label}
                      </p>
                      <p
                        className="text-[11px] mt-0.5 hidden sm:block"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {option.description}
                      </p>
                    </div>
                    <div
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                      style={{
                        borderColor: isActive
                          ? "var(--brand-green)"
                          : "var(--border)",
                        background: isActive
                          ? "var(--brand-green)"
                          : "transparent",
                      }}
                    >
                      {isActive && (
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      )}
                    </div>
                  </motion.button>

                  <AnimatePresence>
                    {option.id === "groups" && isActive && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mt-1"
                      >
                        <p
                          className="text-xs font-semibold uppercase tracking-wide mb-2.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Select groups
                        </p>
                        <div className="mb-2.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleImportGroups}
                            disabled={isImportingGroups || !selectedAccount}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                            style={{
                              borderColor: "var(--border)",
                              background: "var(--bg-primary)",
                              color: "var(--brand-dark)",
                              opacity:
                                isImportingGroups || !selectedAccount ? 0.6 : 1,
                            }}
                          >
                            {isImportingGroups
                              ? "Importing..."
                              : "Import groups"}
                          </button>
                          {isTelegramProvider ? (
                            <button
                              type="button"
                              onClick={handleOpenTelegramForward}
                              disabled={
                                selectedGroups.length === 0 ||
                                !captionSource.trim()
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                              style={{
                                borderColor: "var(--border)",
                                background: "var(--bg-primary)",
                                color: "var(--brand-dark)",
                                opacity:
                                  selectedGroups.length === 0 ||
                                  !captionSource.trim()
                                    ? 0.6
                                    : 1,
                              }}
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              Open Telegram forward
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleOpenWhatsAppForward}
                              disabled={
                                selectedGroups.length === 0 ||
                                !captionSource.trim()
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                              style={{
                                borderColor: "var(--border)",
                                background: "var(--bg-primary)",
                                color: "var(--brand-dark)",
                                opacity:
                                  selectedGroups.length === 0 ||
                                  !captionSource.trim()
                                    ? 0.6
                                    : 1,
                              }}
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              Open WhatsApp forward
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {availableGroups.map((group) => {
                            const isSelected = selectedGroups.includes(
                              group.id,
                            );

                            return (
                              <button
                                key={group.id}
                                onClick={() => toggleGroup(group.id)}
                                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left text-sm transition-all"
                                style={{
                                  borderColor: isSelected
                                    ? "var(--brand-green)"
                                    : "var(--border)",
                                  color: isSelected
                                    ? "var(--text-primary)"
                                    : "var(--text-secondary)",
                                  background: isSelected
                                    ? "var(--brand-dim)"
                                    : "var(--bg-elevated)",
                                }}
                              >
                                <Users className="w-4 h-4 shrink-0 opacity-60" />
                                <span className="flex-1 font-medium truncate">
                                  {group.name}
                                </span>
                                {typeof group.members === "number" && (
                                  <span className="text-[10px] shrink-0 opacity-50">
                                    {group.members}
                                  </span>
                                )}
                                {isSelected && (
                                  <Check
                                    className="w-3.5 h-3.5 shrink-0"
                                    style={{ color: "var(--brand-dark)" }}
                                  />
                                )}
                              </button>
                            );
                          })}

                          {availableGroups.length === 0 && (
                            <div
                              className="rounded-xl border p-4 text-center"
                              style={{
                                borderColor: "var(--border)",
                                background: "var(--bg-elevated)",
                              }}
                            >
                              <p className="text-2xl mb-1.5">📭</p>
                              <p
                                className="text-xs font-semibold"
                                style={{ color: "var(--text-primary)" }}
                              >
                                No synced groups yet
                              </p>
                              <p
                                className="text-[11px] mt-1"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Use Import groups to load real groups from your
                                backend source endpoint.
                              </p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Fragment>
              );
            })}
          </div>
        </motion.div>

        <motion.div variants={item}>
          <button
            onClick={handleSchedule}
            disabled={!canSchedule || isScheduling}
            className="btn-brand w-full py-4 text-base"
            style={{ opacity: canSchedule ? 1 : 0.55 }}
          >
            {isScheduling ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                />
                Scheduling...
              </>
            ) : editingPostId ? (
              "Confirm Edit & Re-schedule"
            ) : (
              "Confirm & Schedule"
            )}
          </button>

          {!captionSource && (
            <p
              className="text-center text-xs mt-2.5"
              style={{ color: "var(--text-muted)" }}
            >
              ⚠️ No caption generated yet.{" "}
              <button
                onClick={() => router.push("/compose")}
                style={{ color: "var(--brand-dark)" }}
                className="underline font-medium"
              >
                Go to Compose first
              </button>
            </p>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
