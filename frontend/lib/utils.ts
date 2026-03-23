import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}

export function formatCUSD(amount: string | number): string {
  return `${Number(amount).toFixed(2)} cUSD`;
}

export function stripNumberFormatting(value: string): string {
  return value.replace(/,/g, "");
}

export function formatNumberWithDelimiters(value: string | number): string {
  const input = String(value ?? "").trim();
  if (!input) return "";

  const normalized = stripNumberFormatting(input);
  const [integerRaw = "", decimalRaw] = normalized.split(".");
  const integer = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return decimalRaw !== undefined
    ? `${formattedInteger}.${decimalRaw}`
    : formattedInteger;
}

export function formatPriceInput(value: string): string {
  const digitsAndDot = value.replace(/[^\d.]/g, "");
  if (!digitsAndDot) return "";

  const hasTrailingDot = digitsAndDot.endsWith(".");
  const [integerRaw = "", ...decimalParts] = digitsAndDot.split(".");
  const decimalRaw = decimalParts.join("").slice(0, 6);
  const normalizedInteger = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  let base =
    decimalParts.length > 0
      ? `${normalizedInteger}.${decimalRaw}`
      : normalizedInteger;

  if (hasTrailingDot && decimalParts.length === 1 && decimalRaw.length === 0) {
    base = `${normalizedInteger}.`;
  }

  return formatNumberWithDelimiters(base);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getTimeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export const STABLECOINS = [
  {
    symbol: "CELO",
    name: "Celo Native",
    address: "native",
    icon: "🟢",
  },
  {
    symbol: "cUSD",
    name: "Celo Dollar",
    address:
      process.env.NEXT_PUBLIC_CUSD_ADDRESS?.trim() ||
      "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
    icon: "💵",
  },
  {
    symbol: "cEUR",
    name: "Celo Euro",
    address:
      process.env.NEXT_PUBLIC_CEUR_ADDRESS?.trim() ||
      "0x10c892A6EC43a53E45D0B916B4b7D383B1b78d0F",
    icon: "💶",
  },
  {
    symbol: "cREAL",
    name: "Celo Brazilian Real",
    address:
      process.env.NEXT_PUBLIC_CREAL_ADDRESS?.trim() ||
      "0xE4D517785D091D3c54818832dB6094bcc2744545",
    icon: "🇧🇷",
  },
];

export const POST_TYPES = [
  { id: "product", label: "Product", emoji: "📦" },
  { id: "sale", label: "Sale", emoji: "🏷️" },
  { id: "service", label: "Service", emoji: "🛠️" },
  { id: "announcement", label: "Announcement", emoji: "📢" },
  { id: "event", label: "Event", emoji: "🎉" },
];

export const TONES = [
  { id: "friendly", label: "Friendly", emoji: "😊" },
  { id: "urgent", label: "Urgent", emoji: "⚡" },
  { id: "promotional", label: "Promotional", emoji: "🎯" },
  { id: "informative", label: "Informative", emoji: "📋" },
  { id: "inspiring", label: "Inspiring", emoji: "✨" },
];

export const AI_SUGGESTED_TIMES = [
  { label: "9 AM", value: 9, description: "Morning commute peak" },
  { label: "5 PM", value: 17, description: "After-work browsing" },
  { label: "7 PM", value: 19, description: "Evening prime time" },
];
