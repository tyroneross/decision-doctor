// POST /api/library/promote
//
// Authed-only: runs the appropriate builder bridge, validates output through
// the quality gate, then inserts into library_skills or library_plugins.
//
// Body:
//   {
//     kind: 'prompt' | 'skill' | 'plugin',
//     recommendationId: string,  // UUID
//     painPath: PainPath,
//     payload: BuilderHandoffSeed,  // typed seed from Stage 8 builderHandoff
//   }
//
// Quality gate failure returns 422 with structured diagnostics.
// Audit row written on every attempt (action: 'recommendation.promote').
//
// Hardening item 7.

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import { promoteToSkill, promoteToPlugin } from "@/lib/library";
import { generatePrompt } from "@/lib/builders/prompt-bridge";
import { generateSkill } from "@/lib/builders/skill-bridge";
import { generatePlugin } from "@/lib/builders/agent-bridge";
import { validateArtifact } from "@/lib/builders/quality-gate";
import { runWithActor, withActor } from "@/lib/db/actor";
import { auditEvents } from "@/lib/db/schema";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const PainPathSchema = z.enum([
  "referrals",
  "research",
  "admin",
  "capacity_growth",
  "follow_up",
  "custom",
]);

// Seed payload schema — permissive on the seed contents (validated by quality gate).
const PromoteSchema = z.object({
  kind: z.enum(["prompt", "skill", "plugin"]),
  recommendationId: z.string().uuid(),
  painPath: PainPathSchema,
  payload: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

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

  const { kind, recommendationId, painPath, payload } = parsed.data;
  const seed = payload as Record<string, unknown>;
  const now = Date.now();

  // Cast seed to the correct typed seed shape — bridges accept the union.
  // builderKind is set server-side by Stage 8; we trust it here.

  let artifact: Record<string, unknown>;
  let gateKind: "prompt" | "skill" | "plugin";

  try {
    if (kind === "prompt") {
      // Also handles "checklist" seeds (builderKind='checklist') — prompt-bridge
      // accepts both PromptBuilderSeed and ChecklistBuilderSeed.
      const seedWithKind = { ...seed, builderKind: seed.builderKind ?? "prompt" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artifact = await generatePrompt(seedWithKind as any) as unknown as Record<string, unknown>;
      gateKind = "prompt";
    } else if (kind === "skill") {
      const seedWithKind = { ...seed, builderKind: "skill" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artifact = await generateSkill(seedWithKind as any) as unknown as Record<string, unknown>;
      gateKind = "skill";
    } else {
      // plugin — also covers agent seeds (both map to plugin rung)
      const seedWithKind = {
        ...seed,
        builderKind: seed.builderKind ?? "plugin",
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artifact = await generatePlugin(seedWithKind as any) as unknown as Record<string, unknown>;
      gateKind = "plugin";
    }
  } catch (err) {
    await writeAuditEvent(actor, recommendationId, kind, false, Date.now() - now);
    console.error("[promote] Bridge generation failed:", err);
    return NextResponse.json(
      { error: "bridge_error", detail: String(err) },
      { status: 500 },
    );
  }

  // --- Quality gate ---
  const gateResult = await validateArtifact(gateKind, artifact);
  if (!gateResult.passed) {
    await writeAuditEvent(actor, recommendationId, kind, false, Date.now() - now);
    return NextResponse.json(
      {
        error: "quality_gate_failed",
        diagnostics: gateResult,
      },
      { status: 422 },
    );
  }

  // --- Insert into library ---
  const title = String(artifact.name ?? artifact.title ?? "Untitled");
  // For skills: artifactBody = skillMdBody. For plugins: pluginJson. For prompts: instructions.
  const artifactBody =
    gateKind === "skill"
      ? String(artifact.skillMdBody ?? "")
      : gateKind === "plugin"
        ? String(artifact.pluginJson ?? "")
        : String(artifact.instructions ?? "");

  const qualityDiagnostic = { passed: true } as Record<string, unknown>;
  const metadata: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    sourceKind: seed.builderKind ?? kind,
    ...(gateKind === "skill"
      ? { frontmatter: artifact.frontmatter, description: artifact.description }
      : {}),
    ...(gateKind === "plugin"
      ? { componentsManifest: artifact.componentsManifest, description: artifact.description }
      : {}),
    ...(gateKind === "prompt"
      ? {
          requiredInputs: artifact.requiredInputs,
          outputFormat: artifact.outputFormat,
          safetyNotes: artifact.safetyNotes,
          reviewRequirements: artifact.reviewRequirements,
        }
      : {}),
  };

  try {
    if (gateKind === "skill") {
      const skill = await promoteToSkill(actor.userId, actor.tenantId, recommendationId, {
        scope: actor.userId,
        painPath,
        title,
        body: artifactBody,
        qualityDiagnostic,
        metadata,
      });
      await writeAuditEvent(actor, recommendationId, kind, true, Date.now() - now);
      return NextResponse.json({ skill }, { status: 201 });
    } else {
      // plugin (covers both plugin and prompt kinds — prompts stored in library_plugins for now
      // until a library_prompts promote path is added in U5/L3)
      // TODO: Iteration U5 — route prompt kind to library_prompts via promoteToPrompt() once L3 ships.
      const plugin = await promoteToPlugin(actor.userId, actor.tenantId, recommendationId, {
        scope: actor.userId,
        painPath,
        title,
        body: artifactBody,
        qualityDiagnostic,
        metadata,
      });
      await writeAuditEvent(actor, recommendationId, kind, true, Date.now() - now);
      return NextResponse.json({ plugin }, { status: 201 });
    }
  } catch (err) {
    await writeAuditEvent(actor, recommendationId, kind, false, Date.now() - now);
    console.error("[promote] Insert failed:", err);
    return NextResponse.json(
      { error: "insert_failed", detail: String(err) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------

async function writeAuditEvent(
  actor: { userId: string; tenantId: string },
  recommendationId: string,
  kind: string,
  validated: boolean,
  latencyMs: number,
) {
  try {
    await runWithActor({ userId: actor.userId, tenantId: actor.tenantId }, async () =>
      withActor(async (tx) => {
        await tx.insert(auditEvents).values({
          userId: actor.userId,
          tenantId: actor.tenantId,
          action: "recommendation.promote",
          targetId: recommendationId,
          metadata: {
            kind,
            validated,
            latencyMs,
          },
        });
      }),
    );
  } catch (err) {
    // Audit writes are best-effort; never block the response.
    console.warn("[promote] Audit write failed:", err);
  }
}
