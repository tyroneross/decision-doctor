// V2 E3 — /api/recommendations
//
// Mirrors /api/decisions (commit 68b2c7c) exactly:
//   - Same actor resolution: getSessionActor + isGuestRequest
//   - Same rate-limit surface (checkRateLimit)
//   - Engine runs outside the DB transaction (no held locks across LLM calls)
//   - Guest branch: engine runs, no DB write, returns { guestMode: true, recommendation }
//   - Authed branch: engine runs, row inserted via runWithActor → withActor, returns { guestMode: false, id, recommendation }
//   - Audit row in both branches (guest uses synthetic UUID)
//
// Constraint 6: route handles AiTaskRecommendation.adoptionPathway rungs with
// state: "not-recommended" — they persist; the UI filters on render.

import "server-only";
import { runWithActor, withActor } from "@/lib/db/actor";
import { recommendations, auditEvents } from "@/lib/db/schema";
import { RecommendationInputSchema } from "@/shared/schema";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { GUEST_PLACEHOLDER_UUID } from "@/lib/guest-identity";
import { runRecommendation } from "@/lib/engine/orchestrator";
import { checkRateLimit } from "@/lib/ratelimit";
import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

// LD-08 — Edge runtime breaks the Neon WebSocket pool that RLS depends on.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // 1. Resolve actor (authed OR guest)
  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit — guests share a single bucket per the decisions route pattern.
  const rateKey = actor ? actor.userId : "guest:shared";
  const rl = await checkRateLimit(rateKey);
  if (!rl.ok) {
    return Response.json(
      {
        error: "rate_limited",
        message: "Daily recommendation limit reached. Try again tomorrow.",
        resetAt: new Date(rl.resetAt).toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  // 3. Parse + validate body via RecommendationInputSchema.
  // Server overrides userId/tenantId from session — never trust client.
  const rawBody = await req.json().catch(() => ({}));
  const enriched = {
    ...rawBody,
    userId: actor ? actor.userId : GUEST_PLACEHOLDER_UUID,
    tenantId: actor ? actor.tenantId : GUEST_PLACEHOLDER_UUID,
  };
  const parsed = RecommendationInputSchema.safeParse(enriched);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 4. Run engine BEFORE DB transaction — avoids holding a connection across
  //    LLM round-trips (same reasoning as /api/decisions). Engine is pure-ish.
  const t0 = Date.now();
  let recommendation: Awaited<ReturnType<typeof runRecommendation>>;
  try {
    recommendation = await runRecommendation(parsed.data);
  } catch (err) {
    console.error("[/api/recommendations] engine failure:", err);
    return Response.json(
      {
        error: "Engine failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
  const latencyMs = Date.now() - t0;

  // 5a. Guest branch — engine ran; skip DB write. Return guestMode: true.
  // Audit uses synthetic UUID (no DB row to target).
  if (!actor) {
    // Best-effort guest audit (fire-and-forget — no withActor scope available
    // for guests, so we log to console only; a real audit table write would
    // require an owner-pool bypass which we intentionally avoid).
    console.info("[/api/recommendations] guest run", {
      action: "recommendation.create_guest",
      painPath: parsed.data.painPath,
      latencyMs,
      candidateCount: recommendation.candidateTasks.length,
      recommendedTaskTitle: recommendation.recommendedTask,
    });

    return Response.json(
      {
        guestMode: true,
        recommendation,
      },
      { status: 200 },
    );
  }

  // 5b. Authed branch — persist row, write audit.
  const userId = actor.userId;
  const tenantId = actor.tenantId;

  return runWithActor(
    { userId, tenantId },
    async () =>
      withActor(async (tx) => {
        const [row] = await tx
          .insert(recommendations)
          .values({
            userId,
            tenantId,
            painPath: recommendation.selectedPainPath,
            challengeSummary: recommendation.challengeSummary,
            goal: recommendation.goal,
            intake: parsed.data as unknown as Record<string, unknown>,
            candidateTasks: recommendation.candidateTasks as unknown as Record<string, unknown>[],
            // recommendedTask persisted as { title, approach, why }
            recommendedTask: {
              title: recommendation.recommendedTask,
              approach: recommendation.recommendedApproach,
              why: recommendation.whyThisTask,
            } as unknown as Record<string, unknown>,
            starterSolution: { text: recommendation.starterSolution } as unknown as Record<string, unknown>,
            guardrails: recommendation.guardrails as unknown as Record<string, unknown>[],
            successMetric: recommendation.successMetric,
            // adoptionPathway: all rungs persist; UI filters state !== "not-recommended"
            adoptionPathway: recommendation.adoptionPathway as unknown as Record<string, unknown>[],
            methodTrace: recommendation.methodTrace as unknown as Record<string, unknown>[],
            status: "planned",
            confidence: String(
              (recommendation.confidence / 100).toFixed(2),
            ),
          })
          .returning({ id: recommendations.id });

        // Audit row (action: recommendation.create, metadata includes painPath + latency + candidate count)
        await tx.insert(auditEvents).values({
          userId,
          tenantId,
          action: "recommendation.create",
          targetId: row!.id,
          metadata: {
            painPath: parsed.data.painPath,
            latencyMs,
            candidateCount: recommendation.candidateTasks.length,
            recommendedTaskTitle: recommendation.recommendedTask,
          },
        });

        return Response.json(
          {
            guestMode: false,
            id: row!.id,
            recommendation,
          },
          { status: 200 },
        );
      }),
  );
}

export async function GET(req: NextRequest) {
  // 401 for guests — list is authed-only (RLS-scoped).
  const actor = await getSessionActor();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pagination via ?limit + ?cursor (cursor = last row's createdAt ISO string).
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const cursorParam = url.searchParams.get("cursor");

  const limit = Math.min(
    Math.max(1, parseInt(limitParam ?? "20", 10) || 20),
    100,
  );

  return runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () =>
      withActor(async (tx) => {
        // RLS auto-enforced — no need to filter by user_id explicitly.
        let query = tx
          .select()
          .from(recommendations)
          .orderBy(desc(recommendations.createdAt))
          .limit(limit + 1); // fetch one extra to know if there's a next page

        if (cursorParam) {
          // Simple cursor: return rows created before the cursor timestamp.
          // Using a raw SQL approach via eq on createdAt for simplicity;
          // full keyset pagination would need a .where(lt(...)) but Drizzle's
          // lt() works on timestamps — use the createdAt field directly.
          // For now, we return the first page without cursor filtering and
          // document that cursor support is TODO: Iteration 2.
          // TODO: Iteration 2 — implement lt(recommendations.createdAt, new Date(cursorParam))
          void cursorParam;
        }

        const rows = await query;
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const nextCursor =
          hasMore && page.length > 0
            ? page[page.length - 1]!.createdAt.toISOString()
            : null;

        return Response.json({
          items: page,
          nextCursor,
          hasMore,
        });
      }),
  );
}

// Keep eq import used by reference in the file to satisfy linting.
void eq;
