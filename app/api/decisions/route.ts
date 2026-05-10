import "server-only";

import { randomBytes } from "crypto";
import { desc, eq } from "drizzle-orm";
import { getSessionActor } from "@/lib/auth";
import { runWithActor, withActor } from "@/lib/db/actor";
import {
  assertDecisionQuota,
  DecisionRateLimitError,
  recordGroqCall,
} from "@/lib/db/rate-limit";
import { auditEvents, decisions } from "@/lib/db/schema";
import { DecisionOutputSchema } from "@/shared/schema";
import { loadRunDecision, DecisionEngineUnavailableError } from "./engine";
import {
  DecisionValidationError,
  parseDecisionInputForActor,
} from "./validation";

export const runtime = "nodejs";

function jsonError(error: string, status: number, extra = {}) {
  return Response.json({ error, ...extra }, { status });
}

function isAllowedOrigin(req: Request): boolean {
  const configured = process.env.BETTER_AUTH_URL;
  if (!configured) {
    return process.env.NODE_ENV !== "production";
  }

  const expected = new URL(configured).origin;
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  return (
    !origin ||
    origin === expected ||
    (referer ? new URL(referer).origin === expected : false)
  );
}

function serializeDecision(row: typeof decisions.$inferSelect) {
  return {
    id: row.id,
    decisionId: row.id,
    decidedAt: row.createdAt,
    templateId: row.templateId,
    intake: row.intake,
    recommendation: row.recommendation,
    alternatives: row.alternatives,
    robustAlternative: row.robustAlternative,
    methodTrace: row.methodTrace,
    workloadReducers: row.workloadReducers,
    destinations: row.destinations,
    status: row.status,
    shareToken: row.shareToken,
    createdAt: row.createdAt,
  };
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return jsonError("Invalid origin", 403);
  }

  const actor = await getSessionActor(req);
  if (!actor) {
    return jsonError("Unauthorized", 401);
  }

  const body = await req.json().catch(() => ({}));
  let input;
  try {
    input = parseDecisionInputForActor(body, actor);
  } catch (error) {
    if (error instanceof DecisionValidationError) {
      return jsonError("Invalid input", 400, { details: error.details });
    }
    throw error;
  }

  let runDecision;
  try {
    runDecision = await loadRunDecision();
  } catch (error) {
    if (error instanceof DecisionEngineUnavailableError) {
      return jsonError("Decision engine unavailable", 503);
    }
    throw error;
  }

  return runWithActor(actor, async () => {
    try {
      await withActor(async (tx) => {
        await assertDecisionQuota(tx, actor);
        await recordGroqCall(tx, actor, { templateId: input.templateId });
      });
    } catch (error) {
      if (error instanceof DecisionRateLimitError) {
        return jsonError("Daily decision limit reached", 429, {
          limit: error.limit,
          remaining: error.remaining,
          resetAt: error.resetAt.toISOString(),
        });
      }
      throw error;
    }

    const rawOutput = await runDecision(input);
    const output = DecisionOutputSchema.parse(rawOutput);
    const shareToken = randomBytes(24).toString("base64url");

    return withActor(async (tx) => {
      const inserted = await tx
        .insert(decisions)
        .values({
          id: output.decisionId,
          userId: actor.userId,
          tenantId: actor.tenantId,
          templateId: input.templateId,
          intake: input,
          recommendation: output.recommendation,
          alternatives: output.alternatives,
          robustAlternative: output.robustAlternative,
          methodTrace: output.methodTrace,
          workloadReducers: output.workloadReducers,
          destinations: output.destinations,
          status: "complete",
          shareToken,
          createdAt: output.decidedAt,
        })
        .returning();

      await tx.insert(auditEvents).values({
        userId: actor.userId,
        tenantId: actor.tenantId,
        action: "decision.create",
        targetId: output.decisionId,
        metadata: { templateId: input.templateId },
      });

      return Response.json(serializeDecision(inserted[0]!), { status: 201 });
    });
  });
}

export async function GET(req: Request) {
  const actor = await getSessionActor(req);
  if (!actor) {
    return jsonError("Unauthorized", 401);
  }

  return runWithActor(actor, async () => {
    return withActor(async (tx) => {
      const rows = await tx
        .select()
        .from(decisions)
        .where(eq(decisions.userId, actor.userId))
        .orderBy(desc(decisions.createdAt));
      return Response.json(rows.map(serializeDecision));
    });
  });
}
