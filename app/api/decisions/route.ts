// PRD §6 + §7.3 — Decisions API.
// Wires Better Auth session + actor context + (Phase 3) engine pipeline.

import "server-only";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions, auditEvents } from "@/lib/db/schema";
import { DecisionInputSchema } from "@/shared/schema";
import { getSessionActor } from "@/lib/auth-session";
import { runDecision } from "@/lib/engine/orchestrator";
import { GROQ_MODEL } from "@/lib/groq";
import { desc, eq } from "drizzle-orm";

// LD-08 — Edge runtime breaks the Neon WebSocket pool that RLS depends on.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const actor = await getSessionActor();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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

        // Audit-log every Groq call (security checklist AT1). Each stage's
        // tokens are summed into one event per decision for readability;
        // C9 may split this finer.
        const totalIn = engineResult.llmCalls.reduce(
          (a, c) => a + c.tokensIn,
          0,
        );
        const totalOut = engineResult.llmCalls.reduce(
          (a, c) => a + c.tokensOut,
          0,
        );
        await tx.insert(auditEvents).values({
          userId: actor.userId,
          tenantId: actor.tenantId,
          action: "decision.create",
          targetId: row!.id,
          metadata: {
            model: GROQ_MODEL,
            templateId: parsed.data.templateId,
            tokensIn: totalIn,
            tokensOut: totalOut,
            stages: engineResult.llmCalls.map((c) => c.stage),
          },
        });

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
