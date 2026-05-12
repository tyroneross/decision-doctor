// lib/plugin-lib/route-helpers.ts — shared route helpers for /api/plugins + /api/skills.

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor, type ResolvedActor } from "@/lib/auth-session";
import { checkRateLimit } from "@/lib/ratelimit";
import { runWithActor, withActor } from "@/lib/db/actor";
import { auditEvents } from "@/lib/db/schema";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function unauthorized() {
  return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
}

export function badRequest(detail: unknown) {
  return NextResponse.json({ error: "bad_request", detail }, { status: 400 });
}

export function forbidden() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export function rateLimited(resetAt: number) {
  return NextResponse.json(
    {
      error: "rate_limited",
      retry_after: Math.ceil((resetAt - Date.now()) / 1000),
      resetAt: new Date(resetAt).toISOString(),
    },
    { status: 429 },
  );
}

export async function requireActor(): Promise<ResolvedActor | Response> {
  const actor = await getSessionActor();
  if (!actor) return unauthorized();
  return actor;
}

export async function gateRateLimit(userId: string): Promise<Response | null> {
  const rl = await checkRateLimit(userId);
  if (!rl.ok) return rateLimited(rl.resetAt);
  return null;
}

export const PatchBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  version: z.string().max(40).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Best-effort audit row. Failure is non-fatal — we don't want a missing audit
 * to take down a fork/dismiss call.
 */
export function writeAudit(
  actor: ResolvedActor,
  action: string,
  targetId: string | null,
  metadata: Record<string, unknown>,
): void {
  void runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () =>
      withActor(async (tx) => {
        await tx.insert(auditEvents).values({
          userId: actor.userId,
          tenantId: actor.tenantId,
          action,
          targetId,
          metadata,
        });
      }),
  ).catch(() => {
    /* non-fatal */
  });
}
