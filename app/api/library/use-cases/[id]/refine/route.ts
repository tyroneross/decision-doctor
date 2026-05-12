// app/api/library/use-cases/[id]/refine/route.ts — V2 L4: chat refine continuation.
//
// POST /api/library/use-cases/[id]/refine
// Body: { message: string, history: { role: "user" | "assistant", content: string }[] }
//
// Streams a Groq chat continuation grounded in the use-case context + the
// cached example baseline. Mirrors the SSE shape from /api/library/use-cases/[id]/example.
//
// PHI guard: hard-block before any LLM call (mirrors /api/ai-adoption-qa).
// Rate-limit: per-user (mirrors plugin-lib helpers).
// Audit:     use_case.refine on accepted call, use_case.refine_phi_blocked on block.
//
// Hardening:
//   - Item 7: nodejs runtime required for Neon WebSocket pool + RLS.

import "server-only";
import { createHash } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { runWithActor, withActor } from "@/lib/db/actor";
import { auditEvents } from "@/lib/db/schema";
import { getUseCaseWithPrompt } from "@/lib/library";
import { groq, GROQ_MODEL } from "@/lib/groq";
import { createSSEResponse } from "@/lib/qa/stream";
import { detectPHI } from "@/lib/phi-guard";
import {
  badRequest,
  gateRateLimit,
  notFound,
  requireActor,
  writeAudit,
  UUID_RE,
} from "@/lib/plugin-lib/route-helpers";

export const runtime = "nodejs";

const RequestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .max(20)
    .default([]),
});

function buildSystemPrompt(args: {
  title: string;
  body: string;
  exampleBaseline: string | null;
}): string {
  return `You are Decision Doctor refining the example output below for the practitioner's
specific situation. Stay practical. Privacy reminder: never echo or invent
patient identifiers. Keep responses focused and actionable.

USE CASE: ${args.title}
DESCRIPTION: ${args.body}

EXAMPLE BASELINE:
${args.exampleBaseline ?? "(not yet generated. Describe what you would change once an example is available, and ask clarifying questions about the practitioner's situation.)"}
`.trim();
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await requireActor();
  if (actor instanceof Response) return actor;

  const rl = await gateRateLimit(actor.userId);
  if (rl) return rl;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return badRequest({ id: "invalid_uuid" });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest({ body: "invalid_json" });
  }
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.flatten());
  const { message, history } = parsed.data;

  // PHI guard: hard-block before any DB or LLM call.
  const phi = detectPHI(message);
  if (phi.hasPHI) {
    const msgHash = createHash("sha256")
      .update(message)
      .digest("hex")
      .slice(0, 16);
    void runWithActor(
      { userId: actor.userId, tenantId: actor.tenantId },
      () =>
        withActor(async (tx) => {
          await tx.insert(auditEvents).values({
            userId: actor.userId,
            tenantId: actor.tenantId,
            action: "use_case.refine_phi_blocked",
            targetId: id,
            metadata: {
              message_hash: msgHash,
              reasons: phi.reasons,
            },
          });
        }),
    ).catch(() => {
      /* non-fatal */
    });
    return new Response(
      JSON.stringify({
        phiBlocked: true,
        reasons: phi.reasons,
        message:
          "We don't process protected health information (PHI). Please remove patient identifiers and try again.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const loaded = await getUseCaseWithPrompt(actor.userId, actor.tenantId, id);
  if (!loaded) return notFound();
  const { useCase } = loaded;

  const systemPrompt = buildSystemPrompt({
    title: useCase.title,
    body: useCase.body,
    exampleBaseline: useCase.exampleOutput,
  });

  // Compose the conversation. System first; then prior turns; then new user msg.
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [{ role: "system", content: systemPrompt }];
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: message });

  const abortController = new AbortController();

  async function* buildStream() {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0.3,
        stream: true,
        messages,
      });
      for await (const chunk of completion) {
        if (abortController.signal.aborted) break;
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) yield { type: "token" as const, text: delta };
      }
      yield { type: "done" as const };
    } catch (err) {
      yield {
        type: "error" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  writeAudit(actor, "use_case.refine", id, {
    pain_path: useCase.painPath,
    history_turns: history.length,
    message_chars: message.length,
  });

  return createSSEResponse(buildStream(), abortController.signal);
}
