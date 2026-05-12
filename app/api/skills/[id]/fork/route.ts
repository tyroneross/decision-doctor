// POST /api/skills/:id/fork

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { runWithActor } from "@/lib/db/actor";
import { forkSkill } from "@/lib/plugin-lib";
import {
  UUID_RE,
  badRequest,
  gateRateLimit,
  notFound,
  requireActor,
  writeAudit,
} from "@/lib/plugin-lib/route-helpers";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const actor = await requireActor();
  if (actor instanceof Response) return actor;
  const rl = await gateRateLimit(actor.userId);
  if (rl) return rl;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return badRequest({ id: "invalid_uuid" });

  try {
    const result = await runWithActor(
      { userId: actor.userId, tenantId: actor.tenantId },
      () => forkSkill(id, actor.userId),
    );
    writeAudit(actor, "skill.fork", id, {
      fork_id: result.id,
      fork_slug: result.slug,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "not_found") return notFound();
    return NextResponse.json(
      { error: "fork_failed", detail: msg },
      { status: 500 },
    );
  }
}
