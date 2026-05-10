// PRD §6 (chat extension) — conversational front door.
// Single non-streaming endpoint. Two phases:
//   Phase A (status: "asking"): Groq picks the next question. Frontend appends to thread.
//   Phase B (status: "ready"): Groq has full intake; we call runDecision(); frontend renders.
//
// Server-side rate limit + audit just like /api/decisions.

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { groq, GROQ_MODEL } from "@/lib/groq";
import { CHAT_SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { runDecision } from "@/lib/engine/orchestrator";
import { getSessionActor } from "@/lib/auth-session";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions, auditEvents } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  TemplateIdSchema,
  type DecisionInput,
  type DecisionOutput,
  type TemplateId,
} from "@/shared/schema";

export const runtime = "nodejs";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
});

const FieldValueSchema = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(80)),
  z.array(z.number().finite()),
]);

const AssistantPayloadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("asking"),
    reply: z.string().min(1).max(2000),
  }),
  z.object({
    status: z.literal("ready"),
    reply: z.string().min(1).max(2000),
    templateId: TemplateIdSchema,
    fields: z.record(z.string(), FieldValueSchema),
    painPoints: z.array(z.string().max(140)).max(5).default([]),
  }),
]);

export async function POST(req: Request) {
  // 1. Auth
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse + validate
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  // 3. Rate limit (shared bucket with /api/decisions — chat-driven runs cost
  //    the same Groq budget).
  const rl = checkRateLimit(actor.userId);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Daily decision limit reached. Try again tomorrow.",
        resetAt: new Date(rl.resetAt).toISOString(),
      },
      { status: 429 },
    );
  }

  // 4. Ask Groq for next message OR ready directive.
  let raw = "{}";
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...parsed.data.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
      response_format: { type: "json_object" },
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  } catch (e) {
    console.error("[/api/chat] groq failure:", e);
    // Don't 500 the user — surface a friendly message and let them retry.
    return NextResponse.json({
      status: "asking",
      reply:
        "I'm having trouble reaching my reasoning model right now. Could you try sending that again in a moment?",
    });
  }
  let parsedAssistant: z.infer<typeof AssistantPayloadSchema>;
  try {
    parsedAssistant = AssistantPayloadSchema.parse(JSON.parse(raw));
  } catch {
    // Fallback: if the LLM produced invalid output, treat it as a question.
    return NextResponse.json({
      status: "asking",
      reply:
        "Sorry, I lost the thread. Could you restate the situation in a sentence or two?",
    });
  }

  // Phase A — continue the conversation
  if (parsedAssistant.status === "asking") {
    return NextResponse.json({
      status: "asking",
      reply: parsedAssistant.reply,
    });
  }

  // Phase B — assistant says it's ready. Run the engine.
  const engineInput: DecisionInput = {
    templateId: parsedAssistant.templateId as TemplateId,
    source: { type: "user_form", capturedAt: new Date() },
    fields: parsedAssistant.fields as DecisionInput["fields"],
    context: { userId: actor.userId, tenantId: actor.tenantId },
  };

  let engineResult: Awaited<ReturnType<typeof runDecision>>;
  try {
    engineResult = await runDecision(engineInput);
  } catch (e) {
    return NextResponse.json(
      {
        status: "asking",
        reply:
          "I had trouble running that. Mind sharing the numbers again or skipping any I got wrong?",
      },
      { status: 200 },
    );
  }

  // Persist + audit (best-effort)
  let decisionId: string | undefined;
  try {
    await runWithActor(
      { userId: actor.userId, tenantId: actor.tenantId },
      () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(decisions)
            .values({
              userId: actor.userId,
              tenantId: actor.tenantId,
              templateId: engineInput.templateId,
              intake: engineInput.fields,
              recommendation: engineResult.output.recommendation,
              alternatives: engineResult.output.alternatives,
              robustAlternative: engineResult.output.robustAlternative,
              methodTrace: engineResult.output.methodTrace,
              workloadReducers: engineResult.output.workloadReducers,
              destinations: engineResult.output.destinations,
              status: "complete",
            })
            .returning({ id: decisions.id });
          decisionId = row?.id;

          const totalIn = engineResult.llmCalls.reduce(
            (s, c) => s + c.tokensIn,
            0,
          );
          const totalOut = engineResult.llmCalls.reduce(
            (s, c) => s + c.tokensOut,
            0,
          );
          await tx.insert(auditEvents).values({
            userId: actor.userId,
            tenantId: actor.tenantId,
            action: "decision.create.via-chat",
            targetId: decisionId,
            metadata: {
              tokensIn: totalIn,
              tokensOut: totalOut,
              model: GROQ_MODEL,
              painPoints: parsedAssistant.painPoints,
            },
          });
        }),
    );
  } catch {
    // Persistence is non-fatal here; we still return the recommendation.
  }

  const decisionOutput: DecisionOutput = {
    decisionId: decisionId ?? "ephemeral",
    decidedAt: new Date(),
    ...engineResult.output,
  };

  return NextResponse.json({
    status: "ready",
    reply: parsedAssistant.reply,
    painPoints: parsedAssistant.painPoints,
    decision: decisionOutput,
  });
}
