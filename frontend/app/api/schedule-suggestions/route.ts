import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

type PostLike = {
  sendTime?: string;
  createdAt?: string;
  status?: string;
  waAccount?: string;
  targets?: string[];
};

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

function getRelevantPostsForAlgorithm(
  posts: PostLike[],
  selectedAccountId: string,
  targets: string[],
): PostLike[] {
  const activeTargets = new Set(targets);

  return posts.filter((post) => {
    if (
      selectedAccountId &&
      String(post.waAccount || "") !== selectedAccountId
    ) {
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

function getRecommendedTimes(input: {
  targets: string[];
  repeatValue: string;
  posts: PostLike[];
  selectedAccountId: string;
}): string[] {
  const { targets, repeatValue, posts, selectedAccountId } = input;
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

  const relevantPosts = getRelevantPostsForAlgorithm(
    posts,
    selectedAccountId,
    targets,
  );
  const usageByTime = relevantPosts.reduce<
    Record<string, { scheduled: number; sent: number; failed: number }>
  >((accumulator, post) => {
    const normalizedTime = toTimeChip(String(post.sendTime || ""));
    if (!normalizedTime) {
      return accumulator;
    }

    const createdAtMs = Date.parse(String(post.createdAt || ""));
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const targets = Array.isArray(body?.targets)
      ? body.targets
          .map((value: unknown) => String(value || ""))
          .filter(Boolean)
      : [];
    const repeatValue = String(body?.repeat || "one-time");
    const selectedAccountId = String(body?.selectedAccount || "");
    const posts = Array.isArray(body?.posts) ? (body.posts as PostLike[]) : [];

    const recommendedTimes = getRecommendedTimes({
      targets,
      repeatValue,
      posts,
      selectedAccountId,
    });

    return NextResponse.json({
      recommendedTimes,
      source: "algorithm",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to calculate recommended schedule times" },
      { status: 500 },
    );
  }
}
