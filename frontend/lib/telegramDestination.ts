export function normalizeTelegramDestination(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}

export function isTelegramUsernameDestination(value: string): boolean {
  return /^@[A-Za-z0-9_]{5,}$/.test(value);
}

export function isTelegramNumericDestination(value: string): boolean {
  return /^-?\d{5,20}$/.test(value);
}

export function isValidTelegramDestination(value: string): boolean {
  const normalized = normalizeTelegramDestination(value);

  if (!normalized) {
    return false;
  }

  return (
    isTelegramUsernameDestination(normalized) ||
    isTelegramNumericDestination(normalized)
  );
}

export function parseAllowedTelegramDestinations(raw: string): Set<string> {
  return new Set(
    String(raw || "")
      .split(",")
      .map((item) => normalizeTelegramDestination(item))
      .filter(Boolean),
  );
}

export function isTelegramDestinationAllowed(
  destination: string,
  allowlist: Set<string>,
): boolean {
  if (allowlist.size === 0) {
    return true;
  }

  const normalized = normalizeTelegramDestination(destination);
  if (!normalized) {
    return false;
  }

  return allowlist.has(normalized);
}
