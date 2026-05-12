// app/api/library/use-cases/[id]/example/route.ts — V2 L4: cached example output.
//
// POST /api/library/use-cases/[id]/example
// Streams a Groq-synthesized example of what the use-case looks like in practice.
//
// Behavior:
//   - If example_output IS NULL: generate, cache to the column, stream tokens.
//   - If example_output is populated: stream cached value tokenized (instant).
//
// Reuses the SSE wrapper from /api/ai-adoption-qa (lib/qa/stream.ts) + the
// Groq client + scope-based RLS via runWithActor.
//
// Hardening:
//   - Item 7: nodejs runtime required for Neon WebSocket pool + RLS.
//   - Authenticated callers only (write-cache requires actor for audit).
//     Guests can read cached values via the page server-component path.
//   - Race-safe cache write: setUseCaseExampleOutputIfNull() uses
//     `WHERE example_output IS NULL` so a concurrent second writer no-ops.

import "server-only";
import { type NextRequest } from "next/server";
import {
  getUseCaseWithPrompt,
  setUseCaseExampleOutputIfNull,
} from "@/lib/library";
import { groq, GROQ_MODEL } from "@/lib/groq";
import { createSSEResponse } from "@/lib/qa/stream";
import {
  badRequest,
  gateRateLimit,
  notFound,
  requireActor,
  writeAudit,
  UUID_RE,
} from "@/lib/plugin-lib/route-helpers";

export const runtime = "nodejs";

function buildSystemPrompt(args: {
  title: string;
  body: string;
  rationale: string;
  promptBody: string | null;
}): string {
  return `You are Decision Doctor's library example generator. Show a solo healthcare
practitioner what a good output looks like for the AI use case described below.
Use plausible but generic content — NEVER real patient data, identifiers, or
specific clinical details that could resemble a real person. Keep it concrete,
2-6 short sections, markdown-formatted. End with a 1-line "Refine this for
your situation by chatting below."

USE CASE: ${args.title}
DESCRIPTION: ${args.body}
RATIONALE: ${args.rationale || "(none provided)"}
MATCHING PROMPT (if available): ${args.promptBody ?? "(none)"}
`.trim();
}

const DEFAULT_USER_PROMPT =
  "Show me a concrete example of what this AI use case looks like in practice for a solo healthcare practitioner.";

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

  const loaded = await getUseCaseWithPrompt(actor.userId, actor.tenantId, id);
  if (!loaded) return notFound();
  const { useCase, prompt } = loaded;

  // Cached path — tokenise and stream the cached value. Same SSE shape so
  // the client doesn't need to switch on response source.
  if (useCase.exampleOutput) {
    const cached = useCase.exampleOutput;
    async function* cachedStream() {
      // Chunk into ~64-char slices for a stream-like feel without re-billing
      // Groq. Clients render whitespace-pre-wrap so this is purely cosmetic.
      const STEP = 64;
      for (let i = 0; i < cached.length; i += STEP) {
        yield { type: "token" as const, text: cached.slice(i, i + STEP) };
      }
      yield { type: "done" as const };
    }
    return createSSEResponse(cachedStream());
  }

  // Generate path — build prompts, stream tokens, cache full text at end.
  const systemPrompt = buildSystemPrompt({
    title: useCase.title,
    body: useCase.body,
    rationale: useCase.rationale,
    promptBody: prompt?.body ?? null,
  });

  const abortController = new AbortController();
  const collected: string[] = [];
  // Capture actor + id for the post-stream cache write. We can't reference
  // outer-scope closures in async generators safely across the SSE wrapper's
  // controller lifecycle, so we hoist what we need.
  const userId = actor.userId;
  const tenantId = actor.tenantId;
  const useCaseId = id;

  async function* buildStream() {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0.4,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: DEFAULT_USER_PROMPT },
        ],
      });
      for await (const chunk of completion) {
        if (abortController.signal.aborted) break;
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          collected.push(delta);
          yield { type: "token" as const, text: delta };
        }
      }
      // Cache full text iff stream completed normally (not aborted mid-flight).
      if (!abortController.signal.aborted && collected.length > 0) {
        const full = collected.join("");
        try {
          await setUseCaseExampleOutputIfNull(
            userId,
            tenantId,
            useCaseId,
            full,
          );
        } catch {
          // Cache write failure is non-fatal — user still got the stream.
        }
      }
      yield { type: "done" as const };
    } catch (err) {
      yield {
        type: "error" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Best-effort audit (fire and forget).
  writeAudit(actor, "use_case.example_generated", id, {
    pain_path: useCase.painPath,
    scope: useCase.scope,
    used_prompt_scaffold: !!prompt,
  });

  return createSSEResponse(buildStream(), abortController.signal);
}
