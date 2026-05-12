// GET /api/library/use-cases?path=<pain_path>&includeUserSaved=<bool>
//
// Guest-friendly: guests see scope='global' rows only (RLS enforces via
// synthetic UUID pattern from /api/search commit 13317f5).
// Authed users see global + their own user-scoped rows.

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { GUEST_TENANT_ID, GUEST_USER_ID } from "@/lib/guest-identity";
import { getUseCasesForPath } from "@/lib/library";
import type { PainPath } from "@/lib/library";

// Hardening item 7: nodejs runtime required for Neon WebSocket pool + RLS.
export const runtime = "nodejs";

const QuerySchema = z.object({
  path: z
    .enum(["referrals", "research", "admin", "capacity_growth", "follow_up", "custom"])
    .optional(),
  includeUserSaved: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

export async function GET(req: Request) {
  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    path: searchParams.get("path") ?? undefined,
    includeUserSaved: searchParams.get("includeUserSaved") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = actor?.userId ?? GUEST_USER_ID;
  const tenantId = actor?.tenantId ?? GUEST_TENANT_ID;

  // If no path provided, return all use cases (path filter applied inside the module).
  // For simplicity: when path is omitted, return all visible rows per RLS.
  const paths: PainPath[] = parsed.data.path
    ? [parsed.data.path]
    : ["referrals", "research", "admin", "capacity_growth", "follow_up", "custom"];

  const allRows = await Promise.all(
    paths.map((p) =>
      getUseCasesForPath(userId, tenantId, p, {
        includeUserSaved: actor ? (parsed.data.includeUserSaved ?? true) : false,
      }),
    ),
  );
  const rows = allRows.flat();

  return NextResponse.json({ use_cases: rows, count: rows.length });
}
