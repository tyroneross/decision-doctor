// app/api/users/me/search-scope/route.ts — Track A C3: user search-scope toggle.
//
// PATCH /api/users/me/search-scope
// Body: { scope: 'focused' | 'broad' }
//
// Updates the signed-in user's users.search_scope_default. Validates the value
// against the same enum the DB CHECK constraint enforces (drizzle/0014).
//
// Guests receive 401 — they have no server row to persist to. The client
// keeps their toggle state in localStorage only (see lib/search-scope/context.tsx).

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getSessionActor } from "@/lib/auth-session";
import { runWithActor, withActor } from "@/lib/db/actor";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const BodySchema = z.object({
  scope: z.enum(["focused", "broad"]),
});

export async function PATCH(req: NextRequest) {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { scope } = parsed.data;

  // Update users.search_scope_default. RLS does not restrict this row — the
  // users table is a Better Auth-managed surface — but we still run inside
  // a withActor transaction for audit-trail consistency.
  try {
    await runWithActor(
      { userId: actor.userId, tenantId: actor.tenantId },
      async () =>
        withActor(async (tx) => {
          await tx
            .update(users)
            .set({ searchScopeDefault: scope, updatedAt: new Date() })
            .where(eq(users.id, actor.userId));
        }),
    );
  } catch (err) {
    return NextResponse.json(
      { error: "update_failed", detail: String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({ scope });
}

// GET — convenience for client hydration on first paint.
export async function GET(_req: NextRequest) {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Single-column read; no need to enter withActor for an audit trail here.
  try {
    const result = await runWithActor(
      { userId: actor.userId, tenantId: actor.tenantId },
      async () =>
        withActor(async (tx) => {
          const rows = await tx.execute(sql`
            SELECT search_scope_default
              FROM users
             WHERE id = ${actor.userId}::uuid
             LIMIT 1
          `);
          return (rows.rows as Array<{ search_scope_default: string }>)[0];
        }),
    );
    const scope = result?.search_scope_default === "broad" ? "broad" : "focused";
    return NextResponse.json({ scope });
  } catch (err) {
    return NextResponse.json(
      { error: "read_failed", detail: String(err) },
      { status: 500 },
    );
  }
}
