// PRD §F-03 / F-06 — POST creates a decision; GET lists user's decisions.
// Engine pipeline runs inline here; persists DecisionOutput to Neon under RLS.

import "server-only";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions, auditEvents } from "@/lib/db/schema";
import { DecisionInputSchema, type DecisionInput } from "@/shared/schema";
import { runDecision } from "@/lib/engine/orchestrator";
import {
  runAiLeverageDecision,
  isAiLeverageTemplate,
} from "@/lib/engine/ai-leverage-orchestrator";
import { getActorSession } from "@/lib/session";
import { checkAndConsume } from "@/lib/rate-limit";
import { signShareToken } from "@/lib/share";
import { loadTemplate } from "@/lib/engine/templates";
import { desc, eq } from "drizzle-orm";

// LD-08 — REQUIRED. Edge runtime breaks the Neon WebSocket pool that RLS depends on.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getActorSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // T-10 — per-user rate limit BEFORE Zod parsing so spam doesn't waste CPU.
  const rl = checkAndConsume(session.userId);
  if (!rl.allowed) {
    return Response.json(
      {
        error: "Rate limit exceeded",
        message: `You've reached your daily limit of ${rl.limit} decisions. Try again after ${new Date(rl.resetAt).toISOString()}.`,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)),
        },
      },
    );
  }

  // T-09 — PHI rejection happens HERE: DecisionInputSchema caps free-form strings at 200 chars.
  const body = await req.json().catch(() => ({}));
  const incoming = {
    ...body,
    context: {
      userId: session.userId,
      tenantId: session.tenantId,
      previousDecisionIds: (body as { context?: { previousDecisionIds?: string[] } })?.context?.previousDecisionIds,
    },
    source: (body as { source?: unknown }).source ?? {
      type: "user_form",
      capturedAt: new Date().toISOString(),
    },
  };
  const parsed = DecisionInputSchema.safeParse(incoming);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input: DecisionInput = parsed.data;

  // Per-template strict field validation (catches PHI / out-of-range).
  try {
    loadTemplate(input.templateId).buildZodSchema().parse(input.fields);
  } catch (e) {
    return Response.json(
      { error: "Invalid template fields", details: (e as Error).message },
      { status: 400 },
    );
  }

  // Run the engine in actor context so auditEvents writes also enforce RLS.
  return runWithActor({ userId: session.userId, tenantId: session.tenantId }, async () => {
    // Dispatch to the right orchestrator based on the template's candidate set.
    const tpl = loadTemplate(input.templateId);
    const useAiLeverage = isAiLeverageTemplate(tpl.candidates);
    let result;
    try {
      result = useAiLeverage
        ? await runAiLeverageDecision(input, { decisionId: crypto.randomUUID(), now: new Date() })
        : await runDecision(input, { decisionId: crypto.randomUUID(), now: new Date() });
    } catch (err) {
      console.error("[decisions] engine failed:", err);
      return Response.json(
        { error: "Engine failed", message: (err as Error).message },
        { status: 500 },
      );
    }

    const shareToken = signShareToken(result.output.decisionId);

    return withActor(async (tx) => {
      await tx.insert(decisions).values({
        id: result.output.decisionId,
        userId: session.userId,
        tenantId: session.tenantId,
        templateId: input.templateId,
        intake: input.fields as object,
        recommendation: result.output.recommendation as object,
        alternatives: result.output.alternatives as object,
        robustAlternative: result.output.robustAlternative as object,
        methodTrace: result.output.methodTrace as object,
        workloadReducers: result.output.workloadReducers as object,
        destinations: result.output.destinations as object,
        status: "complete",
        shareToken,
      });
      await tx.insert(auditEvents).values({
        userId: session.userId,
        tenantId: session.tenantId,
        action: "decision.create",
        targetId: result.output.decisionId,
        metadata: {
          templateId: input.templateId,
          totalLatencyMs: result.metrics.totalLatencyMs,
          totalTokensIn: result.metrics.totalTokensIn,
          totalTokensOut: result.metrics.totalTokensOut,
        } as object,
      });

      return Response.json(
        {
          decision: result.output,
          shareToken,
          metrics: result.metrics,
        },
        { status: 201 },
      );
    });
  });
}

export async function GET() {
  const session = await getActorSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return runWithActor({ userId: session.userId, tenantId: session.tenantId }, async () => {
    return withActor(async (tx) => {
      const rows = await tx
        .select({
          id: decisions.id,
          templateId: decisions.templateId,
          createdAt: decisions.createdAt,
          recommendation: decisions.recommendation,
          status: decisions.status,
        })
        .from(decisions)
        .where(eq(decisions.userId, session.userId))
        .orderBy(desc(decisions.createdAt))
        .limit(50);
      return Response.json({ decisions: rows });
    });
  });
}
