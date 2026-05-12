// GET /api/skills?scope=&q=&attached=&include_hidden=

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { runWithActor } from "@/lib/db/actor";
import { listSkills } from "@/lib/plugin-lib";
import { requireActor } from "@/lib/plugin-lib/route-helpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof Response) return actor;

  const url = new URL(req.url);
  const rawScope = url.searchParams.get("scope") ?? "all";
  const scope =
    rawScope === "global" || rawScope === "mine" || rawScope === "all"
      ? rawScope
      : "all";
  const q = url.searchParams.get("q") ?? undefined;
  const rawAttached = url.searchParams.get("attached") ?? "all";
  const attached =
    rawAttached === "nested" || rawAttached === "standalone" || rawAttached === "all"
      ? rawAttached
      : "all";
  const includeHidden = url.searchParams.get("include_hidden") === "1";

  const items = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    () =>
      listSkills({
        scope,
        q,
        attached,
        includeHidden,
        userId: actor.userId,
      }),
  );

  return NextResponse.json({ skills: items, count: items.length });
}
