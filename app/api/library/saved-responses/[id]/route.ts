// DELETE /api/library/saved-responses/[id] — remove a saved response.
//
// Authed-only. RLS scopes to the current user.

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import { deleteSavedResponse } from "@/lib/library";

export const runtime = "nodejs";

const UuidSchema = z.string().uuid();

interface Params {
  params: Promise<{ id: string }>;
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

  const removed = await deleteSavedResponse(actor.userId, actor.tenantId, id);
  if (!removed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
