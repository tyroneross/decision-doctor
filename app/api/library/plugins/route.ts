// GET /api/library/plugins
//
// Authed-only: 401 for guests. Returns the authenticated user's promoted plugins.

import "server-only";
import { NextResponse } from "next/server";
import { getSessionActor } from "@/lib/auth-session";
import { getUserPlugins } from "@/lib/library";

// Hardening item 7.
export const runtime = "nodejs";

export async function GET() {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plugins = await getUserPlugins(actor.userId, actor.tenantId);
  return NextResponse.json({ plugins, count: plugins.length });
}
