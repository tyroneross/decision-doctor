// PRD §10 Service Profile + LD-02 — Groq client wrapper (server-safe core).
//
// This file deliberately omits `import "server-only"` so that CLI scripts
// (e.g. scripts/backfill-content-audience.ts) and Node-side workers can
// import the same client without triggering the Next.js client-bundle
// guard.
//
// The boundary that `server-only` was protecting — the GROQ_API_KEY in
// process.env — is still owned by lib/env.ts. As long as nothing here is
// imported into a "use client" React tree, the key stays server-side.
//
// lib/groq.ts re-exports from this module behind `import "server-only"`,
// so existing app/server routes keep their compile-time guard. New code
// running outside Next.js (CLI, scripts, Jest-style harnesses) imports
// from "@/lib/groq-core" directly.

import Groq from "groq-sdk";
import { env } from "@/lib/env";

export const groq = new Groq({ apiKey: env.GROQ_API_KEY });

export const GROQ_MODEL = env.GROQ_MODEL;

/**
 * Per-stage prompt invocation (see PRD §6.2 + ADR-004).
 * Each MCDA stage calls this with its own system + user prompt.
 *
 * Returns both the parsed reasoning trace AND the final answer text.
 */
export async function callStage(opts: {
  systemPrompt: string;
  userPrompt: string;
  responseSchema?: object; // optional JSON schema for structured output
  temperature?: number;
}): Promise<{
  answer: string;
  reasoning: string | null;
  tokensIn: number;
  tokensOut: number;
}> {
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: opts.temperature ?? 0.2,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    // OQ-01 (PRD §20): verify exact response shape on day 1.
    // 'parsed' returns reasoning as a separate field; 'raw' wraps it in <thinking>.
    // @ts-expect-error — reasoning_format may not be in groq-sdk types yet
    reasoning_format: "parsed",
    ...(opts.responseSchema && {
      response_format: { type: "json_object" },
    }),
  });

  const choice = completion.choices[0];
  const message = choice?.message as unknown as {
    content?: string | null;
    reasoning?: string | null;
  };

  return {
    answer: message?.content ?? "",
    reasoning: message?.reasoning ?? null,
    tokensIn: completion.usage?.prompt_tokens ?? 0,
    tokensOut: completion.usage?.completion_tokens ?? 0,
  };
}
