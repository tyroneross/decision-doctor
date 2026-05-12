// lib/qa/synthesizer.ts — Q1: Groq streaming synthesis with citation extraction.
//
// Calls Groq's streaming API with a grounding prompt. As tokens arrive,
// it scans for [[doc:<uuid>]] citation tokens and yields them as separate
// `citation` events alongside the raw `token` events.
//
// Callers (the route handler) consume this AsyncIterable and forward
// events to the SSE stream.

import "server-only";
import { groq, GROQ_MODEL } from "@/lib/groq";
import { formatSourcesForPrompt } from "@/lib/qa/grounding";
import type { SourceForGrounding } from "@/lib/qa/grounding";

export type { SourceForGrounding };

export type SynthesisEvent =
  | { type: "token"; text: string }
  | { type: "citation"; uuid: string };

// Re-export so route.ts can import from one place.

const CITATION_RE = /\[\[doc:([0-9a-f-]{36})\]\]/g;

const QA_SYSTEM_PROMPT = `You are Aida — an AI-adoption advisor for solo healthcare practitioners (psychiatry, primary care, LCSW/LMFT, nutrition, PT/OT).

## Your job
Answer the practitioner's question about AI tools or AI adoption for their practice using ONLY the provided source documents. Do not draw on external knowledge. If the sources don't cover the question, say so explicitly.

## Citation rules
When you reference a fact from a source, emit the token [[doc:<uuid>]] immediately after that fact (same line, no space before). Use the exact UUID from the source header — never invent one.

Example:
  "AI scheduling tools can reduce no-show rates[[doc:a1b2c3d4-0000-0000-0000-000000000001]]."

If no source covers a claim, do NOT emit a citation token. Instead, say: "I don't have a grounded source for that in this context."

## Hard constraints
- Do not provide clinical advice or clinical recommendations.
- Do not include patient names, MRNs, or any PHI in your response.
- If sources are insufficient to answer, say: "I don't have grounded sources for that question yet. Try asking about a specific AI tool, workflow, or pain point, or browse the library for more resources."
- Answer in plain language. American English. No jargon.

## Personalization
{{PERSONALIZATION_BLOCK}}

## Sources
{{SOURCES_BLOCK}}`;

/**
 * Stream a grounded answer from Groq for the given question.
 *
 * Yields:
 *   { type: 'token', text: string }       — raw text chunks from Groq
 *   { type: 'citation', uuid: string }    — emitted when [[doc:<uuid>]] detected
 *
 * Citation events are emitted alongside the token that contains the pattern;
 * the raw [[doc:...]] text is preserved in the token stream so AnswerStream
 * can replace it with a CitationChip via renderWithCitations().
 */
export async function* synthesizeAnswer(
  question: string,
  sources: SourceForGrounding[],
  options?: {
    personalization?: string;
    abortSignal?: AbortSignal;
  },
): AsyncIterable<SynthesisEvent> {
  const personalizationBlock =
    options?.personalization?.trim() ||
    "(no personalization — guest user or no prior recommendations)";

  const sourcesBlock = formatSourcesForPrompt(sources);

  const systemPrompt = QA_SYSTEM_PROMPT.replace(
    "{{PERSONALIZATION_BLOCK}}",
    personalizationBlock,
  ).replace("{{SOURCES_BLOCK}}", sourcesBlock);

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.3,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
  });

  // Accumulate a small rolling buffer so we can detect [[doc:...]] tokens
  // that span multiple streamed chunks.
  let buffer = "";

  for await (const chunk of completion) {
    if (options?.abortSignal?.aborted) break;

    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!delta) continue;

    buffer += delta;

    // Find any complete [[doc:<uuid>]] patterns in the buffer.
    // Yield citation events for each, then flush completed text.
    let lastFlushIdx = 0;
    CITATION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = CITATION_RE.exec(buffer)) !== null) {
      // Yield the text before this citation token.
      const before = buffer.slice(lastFlushIdx, m.index);
      if (before) yield { type: "token", text: before };

      // Yield the citation event.
      yield { type: "citation", uuid: m[1]! };

      // Yield the raw token (so AnswerStream can use renderWithCitations).
      yield { type: "token", text: m[0] };

      lastFlushIdx = CITATION_RE.lastIndex;
    }

    // Keep only the trailing partial match in the buffer (could be a split
    // [[doc:... token). Everything before lastFlushIdx is flushed.
    const flushed = buffer.slice(lastFlushIdx);

    // If the buffer ends with a partial [[doc: opener, hold it.
    const partialOpenIdx = flushed.lastIndexOf("[[");
    if (partialOpenIdx >= 0) {
      const toYield = flushed.slice(0, partialOpenIdx);
      if (toYield) yield { type: "token", text: toYield };
      buffer = flushed.slice(partialOpenIdx);
    } else {
      if (flushed) yield { type: "token", text: flushed };
      buffer = "";
    }
  }

  // Flush remaining buffer after stream ends.
  if (buffer) {
    yield { type: "token", text: buffer };
  }
}
