// GET /api/recommendations/[id]
//
// Auth-scoped detail endpoint for a persisted V2 AiTaskRecommendation.
// The table stores the recommendation across normalized DB columns, so this
// route rehydrates the API/UI contract consumed by /app/recommendations/[id].

import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { runWithActor, withActor } from "@/lib/db/actor";
import { recommendations } from "@/lib/db/schema";
import { getSessionActor } from "@/lib/auth-session";
import {
  AiTaskRecommendationSchema,
  type AiTaskRecommendation,
} from "@/shared/schema";

export const runtime = "nodejs";

const IdSchema = z.string().uuid();

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RecommendationRow = typeof recommendations.$inferSelect;

export async function GET(_req: Request, { params }: RouteContext) {
  const actor = await getSessionActor();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsedId = IdSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "Invalid recommendation id" }, { status: 400 });
  }

  return runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () =>
      withActor(async (tx) => {
        const rows = await tx
          .select()
          .from(recommendations)
          .where(eq(recommendations.id, parsedId.data))
          .limit(1);

        const row = rows[0];
        if (!row) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        const recommendation = rowToRecommendation(row);
        const validated = AiTaskRecommendationSchema.safeParse(recommendation);
        if (!validated.success) {
          console.error(
            "[/api/recommendations/[id]] stored recommendation failed contract:",
            validated.error.flatten(),
          );
          return Response.json(
            { error: "Stored recommendation is invalid" },
            { status: 500 },
          );
        }

        return Response.json({
          id: row.id,
          guestMode: false,
          recommendation: validated.data,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        });
      }),
  );
}

function rowToRecommendation(row: RecommendationRow): unknown {
  const recommendedTask = asRecord(row.recommendedTask);
  const starterSolution = asRecord(row.starterSolution);
  const confidenceRatio = Number(row.confidence ?? 0);
  const confidence =
    Number.isFinite(confidenceRatio) && confidenceRatio <= 1
      ? Math.round(confidenceRatio * 100)
      : Math.round(confidenceRatio);

  return {
    selectedPainPath: row.painPath,
    challengeSummary: row.challengeSummary,
    goal: row.goal ?? row.challengeSummary,
    candidateTasks: asArray(row.candidateTasks),
    recommendedTask: asString(recommendedTask.title, "Recommended AI task"),
    recommendedApproach: asApproach(recommendedTask.approach),
    whyThisTask: asString(
      recommendedTask.why,
      "This task was selected as the highest-value starting point.",
    ),
    starterSolution: asString(starterSolution.text, ""),
    guardrails: asArray(row.guardrails),
    successMetric: row.successMetric ?? "Track time saved after one week.",
    // The current table does not persist `tryThisWeek`; rehydrate a stable
    // action from the starter solution so existing rows satisfy the UI contract.
    tryThisWeek: ["Try the starter solution on one low-risk task this week."],
    adoptionPathway: asArray(row.adoptionPathway),
    confidence: Math.max(0, Math.min(100, confidence)),
    methodTrace: asArray(row.methodTrace),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asApproach(
  value: unknown,
): AiTaskRecommendation["recommendedApproach"] {
  const allowed = new Set<AiTaskRecommendation["recommendedApproach"]>([
    "existing_tool",
    "prompt",
    "checklist",
    "sop",
    "skill",
    "plugin",
    "agent",
    "human_only",
  ]);
  return typeof value === "string" && allowed.has(value as never)
    ? (value as AiTaskRecommendation["recommendedApproach"])
    : "prompt";
}
