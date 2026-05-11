// GET /api/library/search?q=<query>&kinds=<csv>&paths=<csv>&onlyMine=<bool>
//
// Universal fan-out search:
//   - Queries all 4 library tables via tsvector with OR-quorum fallback (item 9c).
//   - When onlyMine=false (default): also fans out to corpus via bm25-leg.
//   - When onlyMine=true: only user-scoped rows in library tables; no corpus.
//   - Results are unified, badged by kind, ranked by score, capped at 50.
//
// Guest-friendly: guests see scope='global' rows only (RLS enforces).
// onlyMine=true with guest credentials returns empty (no user-scoped rows exist).

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { searchLibrary } from "@/lib/library";
import type { LibraryKind, PainPath } from "@/lib/library";

// Hardening item 7.
export const runtime = "nodejs";

const GUEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const GUEST_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const VALID_KINDS = ["use_case", "prompt", "skill", "plugin", "corpus"] as const;
const VALID_PATHS = [
  "referrals",
  "research",
  "admin",
  "capacity_growth",
  "follow_up",
  "custom",
] as const;

const QuerySchema = z.object({
  q: z.string().min(1).max(500),
  kinds: z.string().optional(), // comma-separated LibraryKind[]
  paths: z.string().optional(), // comma-separated PainPath[]
  onlyMine: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(req: Request) {
  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q"),
    kinds: searchParams.get("kinds") ?? undefined,
    paths: searchParams.get("paths") ?? undefined,
    onlyMine: searchParams.get("onlyMine") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = actor?.userId ?? GUEST_USER_ID;
  const tenantId = actor?.tenantId ?? GUEST_TENANT_ID;

  // Parse comma-separated kinds filter. Unknown values are silently dropped.
  const kindsFilter: LibraryKind[] | undefined = parsed.data.kinds
    ? (parsed.data.kinds
        .split(",")
        .map((k) => k.trim())
        .filter((k): k is LibraryKind =>
          (VALID_KINDS as readonly string[]).includes(k),
        ))
    : undefined;

  // Parse comma-separated paths filter.
  const pathsFilter: PainPath[] | undefined = parsed.data.paths
    ? (parsed.data.paths
        .split(",")
        .map((p) => p.trim())
        .filter((p): p is PainPath =>
          (VALID_PATHS as readonly string[]).includes(p),
        ))
    : undefined;

  const t0 = Date.now();
  const hits = await searchLibrary(parsed.data.q, {
    kinds: kindsFilter,
    paths: pathsFilter,
    onlyMine: parsed.data.onlyMine,
    includeCorpus: !parsed.data.onlyMine,
    userId,
    tenantId,
  });

  return NextResponse.json({
    results: hits.slice(0, parsed.data.limit),
    total: hits.length,
    total_ms: Date.now() - t0,
    onlyMine: parsed.data.onlyMine ?? false,
  });
}
