// PATCH  /api/library/saved-searches/[id] — rename
// DELETE /api/library/saved-searches/[id] — delete
//
// Authed-only. RLS scopes both operations to the current user.

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import {
  deleteSavedSearch,
  renameSavedSearch,
} from "@/lib/library";

export const runtime = "nodejs";

const UuidSchema = z.string().uuid();
const PatchSchema = z.object({
  name: z.string().min(1).max(120).nullable(),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Params) {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const idCheck = UuidSchema.safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const row = await renameSavedSearch(
    actor.userId,
    actor.tenantId,
    id,
    parsed.data.name,
  );
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ saved_search: row });
}

export async function DELETE(_req: Request, { params }: Params) {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const idCheck = UuidSchema.safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const removed = await deleteSavedSearch(actor.userId, actor.tenantId, id);
  if (!removed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
