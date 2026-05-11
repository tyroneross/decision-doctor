// POST /api/library/promote
//
// Authed-only: promotes a recommendation artifact to library_skills or
// library_plugins with source_recommendation_id for traceability.
//
// Body:
//   {
//     kind: 'skill' | 'plugin',
//     recommendationId: string,  // UUID soft-FK to recommendations(id) — validated format only
//     painPath: PainPath,
//     title: string,
//     body: string,
//     qualityDiagnostic?: Record<string, unknown>,
//     metadata?: Record<string, unknown>,
//   }
//
// The route validates input shape. Quality gating (lib/builders/quality-gate.ts)
// is the caller's responsibility — the UI or bridge calls the gate BEFORE
// submitting here. The qualityDiagnostic payload is stored for auditability.

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import { promoteToSkill, promoteToPlugin } from "@/lib/library";

// Hardening item 7.
export const runtime = "nodejs";

const PromoteSchema = z.object({
  kind: z.enum(["skill", "plugin"]),
  recommendationId: z.string().uuid(),
  painPath: z.enum([
    "referrals",
    "research",
    "admin",
    "capacity_growth",
    "follow_up",
    "custom",
  ]),
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
  qualityDiagnostic: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PromoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const payload = {
    scope: actor.userId, // promoted artifacts are always user-scoped
    painPath: parsed.data.painPath,
    title: parsed.data.title,
    body: parsed.data.body,
    qualityDiagnostic: parsed.data.qualityDiagnostic,
    metadata: parsed.data.metadata,
  };

  if (parsed.data.kind === "skill") {
    const skill = await promoteToSkill(
      actor.userId,
      actor.tenantId,
      parsed.data.recommendationId,
      payload,
    );
    return NextResponse.json({ skill }, { status: 201 });
  } else {
    const plugin = await promoteToPlugin(
      actor.userId,
      actor.tenantId,
      parsed.data.recommendationId,
      payload,
    );
    return NextResponse.json({ plugin }, { status: 201 });
  }
}
