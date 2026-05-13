// app/api/chat/save-skill/route.ts
//
// Phase-4 chat-as-decision-front-door — persist a chat-generated Survey
// as a reusable skill in library_skills so the user can re-run the same
// decision flow next time.
//
// What gets saved:
//   - The Survey schema (so the saved skill renders the same fields)
//   - The user's original decision question (anchor)
//   - An optional user-provided name (overrides survey.title)
//   - Optional custom instructions appended for future re-runs
//
// This is intentionally a SEPARATE endpoint from /api/library/promote,
// because that route runs the builder + quality-gate pipeline tuned for
// recommendation artifacts (prompts / skills / plugins). Chat-generated
// surveys are a different shape — they're the input form for a future
// decision, not a generated output.

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { runWithActor, withActor } from "@/lib/db/actor";
import { librarySkills, auditEvents } from "@/lib/db/schema";
import { SurveySchema } from "@/lib/engine/survey";
import { detectPHI } from "@/lib/phi-guard";

export const runtime = "nodejs";

const PainPathSchema = z.enum([
  "referrals",
  "research",
  "admin",
  "capacity_growth",
  "follow_up",
  "custom",
]);

const RequestSchema = z.object({
  /** User-provided name. Optional — falls back to survey.title. */
  name: z.string().min(1).max(200).optional(),
  /** User-provided custom instructions appended to the skill body. */
  customInstructions: z.string().max(2000).optional(),
  /** The original survey produced by the generator. */
  survey: SurveySchema,
  /** The user's original decision question (anchor for re-runs). */
  originalQuestion: z.string().min(1).max(2000),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a survey's suggestedPath to the library_skills.pain_path column.
 * The pain_path enum is recommendation-engine-flavored; for MCDA-style
 * decisions we default to "custom" since none of the named buckets fit.
 */
function painPathForSurvey(
  suggestedPath: "decision" | "recommendation",
): z.infer<typeof PainPathSchema> {
  if (suggestedPath === "recommendation") return "custom";
  return "custom";
}

function buildBody(input: {
  originalQuestion: string;
  customInstructions?: string;
  surveyTitle: string;
}): string {
  const parts = [
    `# ${input.surveyTitle}`,
    "",
    `**Original question:** ${input.originalQuestion}`,
  ];
  if (input.customInstructions && input.customInstructions.trim()) {
    parts.push("", "**Custom instructions:**", input.customInstructions.trim());
  }
  parts.push(
    "",
    "_Re-running this skill opens the same survey so the decision can be made consistently each time._",
  );
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (guest) {
    // Guests have no DB row to attribute to — surface an inline upgrade
    // path the client renders as a "sign in to save" affordance.
    return NextResponse.json(
      {
        error: "guest_no_persistence",
        message: "Sign in to save this decision flow as a skill.",
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, customInstructions, survey, originalQuestion } = parsed.data;

  // PHI guard on every free-text input. Defense in depth: even though the
  // detector/generator/adapter run guards upstream, the user could enter
  // PHI in the name or custom instructions field.
  const phiTargets: string[] = [originalQuestion];
  if (name) phiTargets.push(name);
  if (customInstructions) phiTargets.push(customInstructions);
  for (const t of phiTargets) {
    const phi = detectPHI(t);
    if (phi.hasPHI) {
      return NextResponse.json(
        {
          phiBlocked: true,
          reasons: phi.reasons,
          message:
            "One of the fields you entered appears to contain patient identifiers. Please rephrase without PHI.",
        },
        { status: 400 },
      );
    }
  }

  const title = (name?.trim() || survey.title).slice(0, 200);
  const painPath = painPathForSurvey(survey.suggestedPath);
  const skillBody = buildBody({
    originalQuestion,
    customInstructions,
    surveyTitle: survey.title,
  });

  try {
    const saved = await runWithActor(
      { userId: actor!.userId, tenantId: actor!.tenantId },
      () =>
        withActor(async (tx) => {
          const rows = await tx
            .insert(librarySkills)
            .values({
              scope: actor!.tenantId,
              painPath,
              title,
              body: skillBody,
              sourceRecommendationId: null,
              qualityDiagnostic: sql`'{}'::jsonb`,
              metadata: {
                kind: "decision-survey",
                survey,
                originalQuestion,
                customInstructions: customInstructions ?? null,
                source: "chat",
                createdAt: new Date().toISOString(),
              } as Record<string, unknown>,
            })
            .returning({ id: librarySkills.id });
          const skillId = rows[0]?.id;
          if (skillId) {
            await tx.insert(auditEvents).values({
              userId: actor!.userId,
              tenantId: actor!.tenantId,
              action: "chat.save_skill",
              targetId: skillId,
              metadata: {
                surveyId: survey.id,
                fields: survey.fields.length,
                hasCustomInstructions: !!customInstructions,
              },
            });
          }
          return skillId ?? null;
        }),
    );
    if (!saved) {
      throw new Error("insert returned no id");
    }
    return NextResponse.json({
      ok: true,
      skill: { id: saved, title },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[/api/chat/save-skill] persist failed:", err);
    }
    return NextResponse.json(
      { error: "persist_failed", message: "Could not save the skill. Try again." },
      { status: 500 },
    );
  }
}
