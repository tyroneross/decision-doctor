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
import {
  runAiLeverageDecision,
  isAiLeverageTemplate,
} from "@/lib/engine/ai-leverage-orchestrator";
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
      // existing 5-stage engine. Modes 2-4 store a "saved conversation" placeholder
      // that the recommendation page detects and renders as a transcript view —
      // not a fake recommendation. (Persona panel 2026-05-10: previous placeholder
      // copy leaked "v1.1" + internal mode names into user copy and crashed the
      // recommendation page render.)
      const tplId = turn.transcript.routerOutput?.templateMatch ?? null;
      if (turn.mode !== "structured_enumerable" || !tplId) {
        const friendlyMode =
          turn.mode === "values_dominant"
            ? "values question"
            : turn.mode === "generative_design"
              ? "open exploration"
              : "open decision";
        // Persist the conversation as "complete" but with a sentinel
        // recommendation shape that the rec page recognizes and renders as
        // a saved-conversation card. NO version numbers, NO internal mode names.
        await tx.update(decisions).set({
          status: "complete",
          recommendation: {
            option: "Conversation saved",
            confidence: 0,
            rationale: `We saved your ${friendlyMode}. A full structured output for this kind of decision is in development — for now you can re-read the conversation, or start a new one and try a different angle.`,
          } as object,
          alternatives: [
            {
              option: "Start over with a more specific framing",
              eliminatedAtStage: 4,
              reason: "If you can name two or three concrete options you're choosing between, the ranked-recommendation flow handles that today.",
            },
            {
              option: "Talk it through in the conversation again",
              eliminatedAtStage: 4,
              reason: "Sometimes naming what's at stake out loud is the work.",
            },
          ] as object,
          robustAlternative: {
            option: "No clearly different fallback",
            why: "We didn't want to fabricate a backup option for an open question.",
          } as object,
          methodTrace: [
            { stage: 1, name: "values", output: { savedConversation: true } },
          ] as object,
          workloadReducers: [
            {
              type: "playbook",
              title: "Re-read the conversation",
              description: "Note the words you kept coming back to. Those are usually your real constructs.",
              artifact: { playbookSteps: ["Open the saved conversation", "Highlight what you'd repeat", "Note what felt forced"] },
              automationLevel: "user_executes",
              coverage: "task_setup",
              permission_tier: "T0",
            },
            {
              type: "playbook",
              title: "Try the structured form",
              description: "If your decision fits patient load, pricing, or hiring, the structured form gives you a full ranked recommendation.",
              artifact: { playbookSteps: ["Visit the templates page from the menu", "Pick the closest fit", "Answer the questions"] },
              automationLevel: "user_executes",
              coverage: "task_setup",
              permission_tier: "T0",
            },
            {
              type: "prompt",
              title: "Take it to your trusted advisor",
              description: "Paste this prompt into ChatGPT, Claude, or send it to a peer-consult colleague.",
              artifact: {
                promptText: `I'm a solo healthcare practitioner. I've been thinking through a decision and the conversation went like this:\n\n${turn.transcript.messages
                  .filter((m) => m.role !== "system")
                  .map((m) => `${m.role}: ${m.content}`)
                  .join("\n\n")}\n\nWhat questions am I not asking? What would you push back on?`,
              },
              automationLevel: "ai_assisted",
              coverage: "partial_task",
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
      // If validation fails (e.g. user gave a budget the parser couldn't shape),
      // surface a friendly retry message in the chat — NEVER bubble the raw
      // Zod error to the user. (Maya persona retest 2026-05-10: a raw red
      // bubble saying "Extracted fields invalid" was where she closed the tab.)
      try {
        loadTemplate(tplId).buildZodSchema().parse(turn.transcript.extractedFields);
      } catch {
        const friendly = {
          role: "assistant" as const,
          content:
            "I lost track of one of your answers — could you tell me again, in your own words? Most often it's a number or range I didn't quite catch.",
          timestamp: new Date(),
        };
        return Response.json({
          decisionId,
          status: "chatting",
          assistant: friendly,
          transcript: turn.transcript,
        });
      }

      // Dispatch to the right orchestrator based on template's candidate set:
      // AI-leverage templates use the deterministic-first pipeline (~2s);
      // legacy MCDA templates use the full 5-LLM-call pipeline (~9s).
      const tpl = loadTemplate(tplId);
      const useAiLeverage = isAiLeverageTemplate(tpl.candidates);
      let result;
      try {
        result = useAiLeverage
          ? await runAiLeverageDecision(decisionInput, { decisionId, now: new Date() })
          : await runDecision(decisionInput, { decisionId, now: new Date() });
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
