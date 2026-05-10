// PRD §6 + §7.3 — Decisions API.
// Wires Better Auth session + actor context + (Phase 3) engine pipeline.

import "server-only";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions, auditEvents } from "@/lib/db/schema";
import { DecisionInputSchema } from "@/shared/schema";
import { getSessionActor } from "@/lib/auth-session";
import { runDecision } from "@/lib/engine/orchestrator";
import { GROQ_MODEL } from "@/lib/groq";
import { checkRateLimit } from "@/lib/ratelimit";
import { desc, eq } from "drizzle-orm";

// LD-08 — Edge runtime breaks the Neon WebSocket pool that RLS depends on.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await getSessionActor();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // T-10 — per-user rate limit (20 / 24h).
  const rl = await checkRateLimit(actor.userId);
  if (!rl.ok) {
    return Response.json(
      {
        error: "rate_limited",
        message: "Daily decision limit reached. Try again tomorrow.",
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

  // PHI rejection: Zod schema rejects free-form long strings (T-09).
  const body = await req.json().catch(() => ({}));
  // Force the input.context to the server-side actor — never trust client.
  const enriched = {
    ...body,
    context: {
      ...(body?.context ?? {}),
      userId: actor.userId,
      tenantId: actor.tenantId,
    },
  };
  const parsed = DecisionInputSchema.safeParse(enriched);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Run the engine BEFORE the DB transaction. Two reasons:
  //   1. Stages 1+5 each call Groq (~1.5s each); we don't want to hold a
  //      DB transaction open across two LLM round-trips.
  //   2. The engine is pure-ish — no DB writes — so it's safe to run outside
  //      the actor scope. The persistence happens inside the actor scope.
  let engineResult: Awaited<ReturnType<typeof runDecision>>;
  try {
    engineResult = await runDecision(parsed.data);
  } catch (err) {
    console.error("[/api/decisions] engine failure:", err);
    return Response.json(
      {
        error: "Engine failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  return runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () =>
      withActor(async (tx) => {
        const [row] = await tx
          .insert(decisions)
          .values({
            userId: actor.userId,
            tenantId: actor.tenantId,
            templateId: parsed.data.templateId,
            title: engineResult.output.recommendation.option,
            intake: parsed.data.fields,
            recommendation: engineResult.output.recommendation,
            alternatives: engineResult.output.alternatives,
            robustAlternative: engineResult.output.robustAlternative,
            methodTrace: engineResult.output.methodTrace,
            workloadReducers: engineResult.output.workloadReducers,
            destinations: engineResult.output.destinations,
            status: "complete",
          })
          .returning({ id: decisions.id });

        // T-10 audit log: one row per Groq call (P1 / AT1) + one summary row.
        const auditRows = engineResult.llmCalls.map((c) => ({
          userId: actor.userId,
          tenantId: actor.tenantId,
          action: "groq.call",
          targetId: row!.id,
          metadata: {
            model: GROQ_MODEL,
            stage: c.stage,
            tokensIn: c.tokensIn,
            tokensOut: c.tokensOut,
            templateId: parsed.data.templateId,
          },
        }));
        auditRows.push({
          userId: actor.userId,
          tenantId: actor.tenantId,
          action: "decision.create",
          targetId: row!.id,
          metadata: {
            model: GROQ_MODEL,
            stage: 0 as unknown as 1, // summary row; widened to satisfy stage union
            tokensIn: engineResult.llmCalls.reduce((a, c) => a + c.tokensIn, 0),
            tokensOut: engineResult.llmCalls.reduce((a, c) => a + c.tokensOut, 0),
            templateId: parsed.data.templateId,
          },
        });
        await tx.insert(auditEvents).values(auditRows);

        return Response.json(
          {
            decisionId: row!.id,
            decidedAt: new Date(),
            ...engineResult.output,
          },
          { status: 200 },
        );
      }),
  );
}

// GET /api/decisions/<id> handled in [id]/route.ts — list endpoint stays here.
void eq;

export async function GET() {
  const actor = await getSessionActor();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () =>
      withActor(async (tx) => {
        // RLS auto-enforced — no need to filter by tenant_id.
        const rows = await tx
          .select()
          .from(decisions)
          .orderBy(desc(decisions.createdAt))
          .limit(50);
        return Response.json(rows);
      }),
  );
}
