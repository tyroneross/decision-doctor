// Chat-first API. Each turn:
//  - new chat: POST without decisionId → create row, init empty transcript
//  - continuing: POST with decisionId → append message, persist, return next turn
//  - ready: when chat-orchestrator returns kind: "ready", run the engine and
//    persist the DecisionOutput; return {action: "ready", decisionId} so the
//    UI can redirect to /app/decisions/<id>
//
// Architecture per .build-loop/decisions/2026-05-10-research-digest.md.

import "server-only";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions, auditEvents } from "@/lib/db/schema";
import {
  type ChatTranscript,
  ChatTranscriptSchema,
  type DecisionInput,
} from "@/shared/schema";
import { processChatTurn } from "@/lib/engine/chat-orchestrator";
import { runDecision } from "@/lib/engine/orchestrator";
import { getActorSession } from "@/lib/session";
import { checkAndConsume } from "@/lib/rate-limit";
import { signShareToken } from "@/lib/share";
import { loadTemplate } from "@/lib/engine/templates";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const EMPTY_TRANSCRIPT: ChatTranscript = {
  messages: [],
  extractedFields: {},
  pendingClarifications: [],
};

interface ChatRequestBody {
  decisionId?: string;
  message: string;
}

export async function POST(req: Request) {
  const session = await getActorSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as ChatRequestBody;
  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }
  // T-09 — bound the chat message length to keep it from carrying paste-loads
  // of patient data into the transcript. 2000 chars is plenty for a sentence
  // or two; longer than the field max (200) because chat is conversational.
  if (body.message.length > 2000) {
    return Response.json(
      { error: "Message too long", message: "Keep messages under 2000 characters." },
      { status: 400 },
    );
  }

  return runWithActor({ userId: session.userId, tenantId: session.tenantId }, async () => {
    return withActor(async (tx) => {
      // 1. Resolve / create the decision row + transcript
      let decisionId = body.decisionId;
      let transcript: ChatTranscript = EMPTY_TRANSCRIPT;

      if (decisionId) {
        const rows = await tx.select().from(decisions).where(eq(decisions.id, decisionId)).limit(1);
        const row = rows[0];
        if (!row) return Response.json({ error: "Decision not found" }, { status: 404 });
        const parsed = ChatTranscriptSchema.safeParse(row.transcript);
        if (parsed.success) transcript = parsed.data;
      } else {
        decisionId = crypto.randomUUID();
        await tx.insert(decisions).values({
          id: decisionId,
          userId: session.userId,
          tenantId: session.tenantId,
          templateId: "chat", // sentinel — replaced when router commits a real templateMatch
          intake: {} as object,
          mode: null,
          transcript: EMPTY_TRANSCRIPT as object,
          status: "pending",
        });
      }

      // 2. Run chat-orchestrator for one turn
      const turn = await processChatTurn({ userMessage: body.message, transcript });

      // 3. Persist updated transcript on every turn
      await tx
        .update(decisions)
        .set({
          transcript: turn.transcript as object,
          mode: turn.transcript.routerOutput?.mode ?? null,
          templateId:
            turn.transcript.routerOutput?.templateMatch ??
            (await tx.select({ templateId: decisions.templateId }).from(decisions).where(eq(decisions.id, decisionId)).limit(1))[0]?.templateId ??
            "chat",
        })
        .where(eq(decisions.id, decisionId));

      // 4. If still chatting → return the next assistant turn
      if (turn.kind === "chatting" || turn.kind === "needs_confirm_mode") {
        return Response.json({
          decisionId,
          status: turn.kind,
          assistant: turn.assistant,
          transcript: turn.transcript,
        });
      }

      // 5. Ready to run engine. Rate-limit BEFORE the engine call.
      const rl = checkAndConsume(session.userId);
      if (!rl.allowed) {
        return Response.json(
          {
            decisionId,
            status: "rate_limited",
            assistant: {
              role: "assistant",
              content: `You've hit your daily limit of ${rl.limit} decisions. Try again after ${new Date(rl.resetAt).toLocaleTimeString()}.`,
              timestamp: new Date(),
            },
          },
          { status: 429 },
        );
      }

      // For v1: only structured_enumerable + matched template path runs the
      // existing 5-stage engine. Modes 2-4 are ROUTED + transcript captured but
      // produce a placeholder output (engine fan-out for design-brief + values-map
      // lands in v1.1 per the dynamic-frameworks-roadmap).
      const tplId = turn.transcript.routerOutput?.templateMatch ?? null;
      if (turn.mode !== "structured_enumerable" || !tplId) {
        // Placeholder: store transcript + mode, mark complete, return a brief explainer.
        await tx.update(decisions).set({
          status: "complete",
          recommendation: {
            option: "Mode-specific output coming in v1.1",
            confidence: 50,
            rationale: `This conversation classified as ${turn.mode}. The full output for this mode (design brief or values map) ships in v1.1; the chat transcript is saved.`,
          } as object,
          alternatives: [
            { option: "Run a structured template instead", eliminatedAtStage: 4, reason: "If this fits one of the 3 templates (capacity / pricing / hire), starting from a template gives a full ranked output today." },
            { option: "Continue the conversation tomorrow", eliminatedAtStage: 4, reason: "We saved the transcript; you can pick up where you left off." },
          ] as object,
          robustAlternative: {
            option: "No clearly different fallback",
            why: "Mode 2/3/4 outputs ship in v1.1.",
          } as object,
          methodTrace: [
            { stage: 1, name: "values", output: { mode: turn.mode, transcript: turn.transcript } },
          ] as object,
          workloadReducers: [
            {
              type: "playbook",
              title: "Save this conversation for later",
              description: "We've stored the transcript. v1.1 ships full design-brief + values-map output for this mode.",
              artifact: { playbookSteps: ["Bookmark this URL", "Continue when v1.1 ships"] },
              automationLevel: "user_executes",
              coverage: "task_setup",
              permission_tier: "T0",
            },
            {
              type: "playbook",
              title: "Try a structured template",
              description: "If this fits capacity / pricing / hire, those templates run the full engine today.",
              artifact: { playbookSteps: ["Go to /app", "Pick the template that fits"] },
              automationLevel: "user_executes",
              coverage: "task_setup",
              permission_tier: "T0",
            },
            {
              type: "playbook",
              title: "Talk it through",
              description: "Sometimes the chat itself helped you see the shape of the problem.",
              artifact: { playbookSteps: ["Re-read the transcript", "Note the constructs that came up"] },
              automationLevel: "user_executes",
              coverage: "task_setup",
              permission_tier: "T0",
            },
          ] as object,
          destinations: [{ type: "user_ui", delivered: true, deliveredAt: new Date() }] as object,
          shareToken: signShareToken(decisionId),
        }).where(eq(decisions.id, decisionId));

        return Response.json({
          decisionId,
          status: "ready",
          assistant: turn.assistant,
          mode: turn.mode,
          note: "v1.1: this mode renders a full output. v1: chat is captured + a placeholder card is shown.",
        });
      }

      // structured_enumerable + template match → run the real engine
      const decisionInput: DecisionInput = {
        templateId: tplId,
        source: { type: "user_form", capturedAt: new Date() },
        // Cast OK — buildZodSchema().parse below validates the shape concretely;
        // chat-orchestrator's extractFieldValue returns FieldValue-compatible types.
        fields: turn.transcript.extractedFields as DecisionInput["fields"],
        context: { userId: session.userId, tenantId: session.tenantId },
      };
      // Validate the extracted fields against the template's strict schema.
      try {
        loadTemplate(tplId).buildZodSchema().parse(turn.transcript.extractedFields);
      } catch (e) {
        return Response.json(
          { error: "Extracted fields invalid", details: (e as Error).message, transcript: turn.transcript },
          { status: 400 },
        );
      }

      let result;
      try {
        result = await runDecision(decisionInput, { decisionId, now: new Date() });
      } catch (err) {
        console.error("[chat] engine failed:", err);
        return Response.json(
          { error: "Engine failed", message: (err as Error).message },
          { status: 500 },
        );
      }

      const shareToken = signShareToken(result.output.decisionId);
      await tx.update(decisions).set({
        templateId: tplId,
        intake: turn.transcript.extractedFields as object,
        recommendation: result.output.recommendation as object,
        alternatives: result.output.alternatives as object,
        robustAlternative: result.output.robustAlternative as object,
        methodTrace: result.output.methodTrace as object,
        workloadReducers: result.output.workloadReducers as object,
        destinations: result.output.destinations as object,
        status: "complete",
        shareToken,
      }).where(eq(decisions.id, decisionId));
      await tx.insert(auditEvents).values({
        userId: session.userId,
        tenantId: session.tenantId,
        action: "chat.decision.create",
        targetId: decisionId,
        metadata: {
          templateId: tplId,
          mode: turn.mode,
          totalLatencyMs: result.metrics.totalLatencyMs,
          totalTokensIn: result.metrics.totalTokensIn,
          totalTokensOut: result.metrics.totalTokensOut,
          chatTurns: turn.transcript.messages.length,
        } as object,
      });

      return Response.json({
        decisionId,
        status: "ready",
        assistant: turn.assistant,
        mode: turn.mode,
        shareToken,
      });
    });
  });
}
