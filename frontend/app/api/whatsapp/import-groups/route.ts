import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface ImportedGroup {
  id: string;
  name: string;
  members?: number;
  recipient?: string;
}

interface ImportedGroupsPayload {
  groups?: unknown;
  data?: unknown;
  items?: unknown;
}

function shouldUseMockGroupImport(): boolean {
  const override = process.env.WHATSAPP_GROUPS_ALLOW_MOCK?.trim().toLowerCase();

  if (override === "true") {
    return true;
  }

  if (override === "false") {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}

function createMockGroups(accountNumber: string): ImportedGroup[] {
  const recipient = accountNumber.trim() || undefined;

  return [
    {
      id: "vip-customers",
      name: "VIP Customers",
      members: 42,
      recipient,
    },
    {
      id: "repeat-buyers",
      name: "Repeat Buyers",
      members: 28,
      recipient,
    },
    {
      id: "community-updates",
      name: "Community Updates",
      members: 64,
      recipient,
    },
  ];
}

function normalizeGroup(value: unknown): ImportedGroup | null {
  if (!value || typeof value !== "object") return null;

  const entry = value as Record<string, unknown>;
  const idRaw = entry.id ?? entry.groupId ?? entry.slug ?? entry.key;
  const nameRaw = entry.name ?? entry.title ?? entry.label;

  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";

  if (!id || !name) return null;

  const membersRaw = entry.members ?? entry.memberCount ?? entry.participants;
  const recipientRaw =
    typeof entry.recipient === "string"
      ? entry.recipient
      : typeof entry.recipientPhone === "string"
        ? entry.recipientPhone
        : typeof entry.phone === "string"
          ? entry.phone
          : undefined;

  return {
    id,
    name,
    members:
      typeof membersRaw === "number" && Number.isFinite(membersRaw)
        ? Math.max(0, Math.floor(membersRaw))
        : undefined,
    recipient: recipientRaw?.trim() || undefined,
  };
}

function extractGroups(payload: unknown): ImportedGroup[] {
  if (Array.isArray(payload)) {
    return payload.map(normalizeGroup).filter(Boolean) as ImportedGroup[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const objectPayload = payload as ImportedGroupsPayload;
  const candidate =
    objectPayload.groups ?? objectPayload.data ?? objectPayload.items ?? [];

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.map(normalizeGroup).filter(Boolean) as ImportedGroup[];
}

function buildImportUrl(
  baseUrl: string,
  accountId: string,
  accountNumber: string,
  requestUrl: string,
): string {
  const url = new URL(baseUrl, requestUrl);

  if (accountId) {
    url.searchParams.set("waAccount", accountId);
  }

  if (accountNumber) {
    url.searchParams.set("accountNumber", accountNumber);
  }

  return url.toString();
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const sourceUrl = process.env.WHATSAPP_GROUPS_SOURCE_URL?.trim() || "";
  const sourceToken = process.env.WHATSAPP_GROUPS_SOURCE_TOKEN?.trim() || "";
  const { searchParams } = new URL(request.url);
  const waAccount = searchParams.get("waAccount")?.trim() || "";
  const accountNumber = searchParams.get("accountNumber")?.trim() || "";

  if (!sourceUrl) {
    if (shouldUseMockGroupImport()) {
      const groups = createMockGroups(accountNumber);

      return NextResponse.json({
        success: true,
        source: "mock",
        waAccount,
        count: groups.length,
        warning:
          "WHATSAPP_GROUPS_SOURCE_URL is not set, so mock groups are returned for local MVP/testing.",
        groups,
      });
    }

    return NextResponse.json(
      {
        error:
          "Group import source is not configured. Set WHATSAPP_GROUPS_SOURCE_URL to your backend groups endpoint.",
      },
      { status: 503 },
    );
  }

  try {
    const upstreamUrl = buildImportUrl(
      sourceUrl,
      waAccount,
      accountNumber,
      request.url,
    );

    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(sourceToken ? { Authorization: `Bearer ${sourceToken}` } : {}),
      },
      cache: "no-store",
    });

    const payload = await safeParseJson(response);

    if (!response.ok) {
      const upstreamError =
        payload && typeof payload === "object"
          ? String(
              (payload as { error?: unknown; message?: unknown }).error ||
                (payload as { message?: unknown }).message ||
                "",
            )
          : "";

      return NextResponse.json(
        {
          error:
            upstreamError ||
            `Failed to import groups from source endpoint (${response.status}).`,
          status: response.status,
          upstream: payload,
        },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }

    const groups = extractGroups(payload);

    return NextResponse.json({
      success: true,
      source: "live",
      waAccount,
      count: groups.length,
      groups,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import groups from upstream source.",
      },
      { status: 502 },
    );
  }
}
