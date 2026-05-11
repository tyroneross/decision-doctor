// GET /api/library/skills
//
// Authed-only: 401 for guests. Returns the authenticated user's promoted skills.
// Skills are always user-scoped (scope=user_id). Global skills surface through
// the search endpoint.

import "server-only";
import { NextResponse } from "next/server";
import { getSessionActor } from "@/lib/auth-session";
import { getUserSkills } from "@/lib/library";

// Hardening item 7.
export const runtime = "nodejs";

export async function GET() {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const skills = await getUserSkills(actor.userId, actor.tenantId);
  return NextResponse.json({ skills, count: skills.length });
}
