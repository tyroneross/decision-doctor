// POST   /api/skills/:id/dismiss — hide
// DELETE /api/skills/:id/dismiss — unhide

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { runWithActor } from "@/lib/db/actor";
import { dismissAsset, undismissAsset } from "@/lib/plugin-lib";
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
    await runWithActor(
      { userId: actor.userId, tenantId: actor.tenantId },
      () => dismissAsset("skill", id, actor.userId),
    );
    writeAudit(actor, "skill.dismiss", id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "not_found") return notFound();
    throw e;
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const actor = await requireActor();
  if (actor instanceof Response) return actor;
  const rl = await gateRateLimit(actor.userId);
  if (rl) return rl;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return badRequest({ id: "invalid_uuid" });
  await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    () => undismissAsset("skill", id, actor.userId),
  );
  writeAudit(actor, "skill.undismiss", id, {});
  return NextResponse.json({ ok: true });
}
