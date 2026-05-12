// GET    /api/skills/:id
// PATCH  /api/skills/:id
// DELETE /api/skills/:id

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { runWithActor } from "@/lib/db/actor";
import {
  getSkillById,
  patchSkill,
  deleteSkill,
} from "@/lib/plugin-lib";
import {
  PatchBodySchema,
  UUID_RE,
  badRequest,
  forbidden,
  gateRateLimit,
  notFound,
  requireActor,
  writeAudit,
} from "@/lib/plugin-lib/route-helpers";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const actor = await requireActor();
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return badRequest({ id: "invalid_uuid" });

  const detail = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    () => getSkillById(id, actor.userId),
  );
  if (!detail) return notFound();
  return NextResponse.json({ skill: detail });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const actor = await requireActor();
  if (actor instanceof Response) return actor;
  const rl = await gateRateLimit(actor.userId);
  if (rl) return rl;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return badRequest({ id: "invalid_uuid" });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest({ body: "invalid_json" });
  }
  const parsed = PatchBodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.flatten());

  const result = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    () => patchSkill(id, actor.userId, parsed.data),
  );
  if (!result.ok) {
    if (result.reason === "not_found") return notFound();
    return forbidden();
  }
  writeAudit(actor, "skill.edit", id, { fields: Object.keys(parsed.data) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const actor = await requireActor();
  if (actor instanceof Response) return actor;
  const rl = await gateRateLimit(actor.userId);
  if (rl) return rl;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return badRequest({ id: "invalid_uuid" });

  const result = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    () => deleteSkill(id, actor.userId),
  );
  if (!result.ok) {
    if (result.reason === "not_found") return notFound();
    return forbidden();
  }
  writeAudit(actor, "skill.delete", id, {});
  return NextResponse.json({ ok: true });
}
