// F-8 — gpt-4o-mini listwise rerank fallback.
//
// Sent the query + numbered candidate snippets, asked to return a JSON
// array of ids in best-first order. Robust JSON-mode (response_format).
// If the model can't parse / returns garbage, we passthrough the input
// order (degraded but not catastrophic — the F-9 route still returns
// results).

import "server-only";
import OpenAI from "openai";
import type { RerankInput, RerankResult } from "./types";

const MODEL = process.env.OPENAI_RERANK_MODEL ?? "gpt-4o-mini";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing — gpt4oRerank cannot run.");
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

// Cap snippet length so the prompt stays bounded.
const SNIPPET_CHARS = 400;
const MAX_DOCS = 30; // gpt-4o-mini context budget is fine well past this; cap for latency.

export async function gpt4oRerank(
  input: RerankInput,
): Promise<RerankResult> {
  const docs = input.docs.slice(0, MAX_DOCS);
  if (docs.length === 0) {
    return {
      doc_ids: [],
      degraded: false,
      degraded_reason: null,
      rerank_ms: 0,
      source: "passthrough",
    };
  }
  const start = Date.now();
  const candidates = docs
    .map(
      (d, i) =>
        `[${i}] id=${d.id}\n${d.text.slice(0, SNIPPET_CHARS).replace(/\s+/g, " ")}`,
    )
    .join("\n\n");
  const systemPrompt =
    "You rerank search candidates by relevance to a user query. " +
    "Return ONLY a JSON object {\"ids\": [\"<id1>\", \"<id2>\", ...]} listing " +
    "every input id exactly once, ordered most-relevant first. No prose.";
  const userPrompt = `Query: ${input.query}\n\nCandidates:\n${candidates}`;
  try {
    const resp = await client().chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const content = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { ids?: unknown };
    const ids = Array.isArray(parsed.ids)
      ? parsed.ids.filter((x): x is string => typeof x === "string")
      : [];
    const knownIds = new Set(docs.map((d) => d.id));
    // Keep only ids the model actually saw; preserve order. Append any
    // missing ids at the end (defensive — model sometimes drops ties).
    const ordered = ids.filter((id) => knownIds.has(id));
    for (const d of docs) {
      if (!ordered.includes(d.id)) ordered.push(d.id);
    }
    return {
      doc_ids: ordered,
      degraded: false,
      degraded_reason: null,
      rerank_ms: Date.now() - start,
      source: "gpt4o-mini",
    };
  } catch {
    return {
      doc_ids: docs.map((d) => d.id),
      degraded: true,
      degraded_reason: "fallback_failed",
      rerank_ms: Date.now() - start,
      source: "passthrough",
    };
  }
}
