// ai-summarize pg-boss job handler.
//
// Chained from content-extract: reads the (possibly newly-enriched) body and
// asks Groq Llama 3.3 70B for a structured SMB-framed summary. Writes the
// JSON envelope to corpus_documents.metadata.ai_summary.
//
// SMB persona: the user is a solo psychiatrist evaluating AI tools for their
// practice. The system prompt explicitly forbids patient-specific examples /
// PHI references and frames the user as a small-business owner.
//
// Idempotency: skip if metadata.ai_summary.generated_at is set AND
// metadata.ai_summary.prompt_version >= AI_SUMMARIZE_PROMPT_VERSION.
//
// Graceful degrade: Groq error → write metadata.ai_summary = {
//   degraded: true, generated_at, prompt_version
// }. Does NOT throw; downstream chain unaffected.

import { getPool } from "../db.js";
import { getGroqClient } from "../llm/groq-client.js";

export const AI_SUMMARIZE_PROMPT_VERSION = "2026-05-11.1";
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are an analyst summarizing AI-industry articles for a solo psychiatrist who runs a small private practice and evaluates AI tools as a small-business owner. The user is a clinician but you are NOT advising on medical decisions and you do NOT reference patients or PHI. Frame every application generically — treat the user as someone who happens to be a clinician, not as a clinician seeking clinical AI guidance.

Return ONE JSON object with these fields:
  tl_dr (string, max 280 characters): the one-sentence what-this-is-about.
  novel_capability (string or null): the single most novel capability introduced, or null if the article restates known capabilities.
  risks (string[], max 3): the most material practical / business / governance risks for an SMB adopting this. Empty array if none clearly stated.
  automation_candidates (string[], max 3): concrete workflows an SMB could automate using what the article describes. Empty array if no application is obvious.
  who_should_care_level (1 | 2 | 3): 1=niche/researcher only · 2=AI-curious SMB owner · 3=any SMB.
  est_skill_level ("low" | "mid" | "high"): the technical skill the SMB owner needs to actually use the described capability.

Output STRICT JSON. No markdown fences, no prose preamble.`;

interface AiSummary {
  tl_dr: string;
  novel_capability: string | null;
  risks: string[];
  automation_candidates: string[];
  who_should_care_level: 1 | 2 | 3;
  est_skill_level: "low" | "mid" | "high";
}

interface DocumentRow {
  id: string;
  scope: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

export interface AiSummarizePayload {
  documentId: string;
}

export interface AiSummarizeResult {
  documentId: string;
  status:
    | "summarized"
    | "skipped-already-summarized"
    | "skipped-not-found"
    | "degraded";
  prompt_version: string;
  latency_ms: number;
}

function clampSummary(raw: unknown): AiSummary {
  const r = (raw ?? {}) as Partial<AiSummary> & Record<string, unknown>;
  const tl = typeof r.tl_dr === "string" ? r.tl_dr.slice(0, 280) : "";
  const novel =
    typeof r.novel_capability === "string" ? r.novel_capability : null;
  const risks = Array.isArray(r.risks)
    ? r.risks.filter((x): x is string => typeof x === "string").slice(0, 3)
    : [];
  const auto = Array.isArray(r.automation_candidates)
    ? r.automation_candidates
        .filter((x): x is string => typeof x === "string")
        .slice(0, 3)
    : [];
  const wsc =
    r.who_should_care_level === 1 ||
    r.who_should_care_level === 2 ||
    r.who_should_care_level === 3
      ? r.who_should_care_level
      : 2;
  const skill =
    r.est_skill_level === "low" ||
    r.est_skill_level === "mid" ||
    r.est_skill_level === "high"
      ? r.est_skill_level
      : "mid";
  return {
    tl_dr: tl,
    novel_capability: novel,
    risks,
    automation_candidates: auto,
    who_should_care_level: wsc,
    est_skill_level: skill,
  };
}

export async function callGroqSummary(
  title: string,
  body: string,
): Promise<AiSummary> {
  const client = getGroqClient();
  const resp = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `TITLE: ${title}\n\nBODY:\n${body}\n\nReturn the JSON object now.`,
      },
    ],
  });
  const raw = resp.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Groq returned invalid JSON: ${String(e).slice(0, 200)}`);
  }
  return clampSummary(parsed);
}

export async function handleAiSummarize(
  payload: AiSummarizePayload,
): Promise<AiSummarizeResult> {
  const t0 = Date.now();
  const pool = getPool();
  const client = await pool.connect();
  try {
    const docQ = await client.query<DocumentRow>(
      `SELECT id, scope, title, body, metadata
         FROM corpus_documents
        WHERE id = $1
        LIMIT 1`,
      [payload.documentId],
    );
    if (docQ.rows.length === 0) {
      return {
        documentId: payload.documentId,
        status: "skipped-not-found",
        prompt_version: AI_SUMMARIZE_PROMPT_VERSION,
        latency_ms: Date.now() - t0,
      };
    }
    const doc = docQ.rows[0]!;
    const existing = (doc.metadata?.ai_summary ?? null) as
      | { generated_at?: string; prompt_version?: string }
      | null;
    if (
      existing?.generated_at &&
      typeof existing.prompt_version === "string" &&
      existing.prompt_version >= AI_SUMMARIZE_PROMPT_VERSION
    ) {
      return {
        documentId: doc.id,
        status: "skipped-already-summarized",
        prompt_version: AI_SUMMARIZE_PROMPT_VERSION,
        latency_ms: Date.now() - t0,
      };
    }

    let payloadMeta: Record<string, unknown>;
    let degraded = false;
    try {
      const summary = await callGroqSummary(doc.title, doc.body);
      payloadMeta = {
        ...summary,
        prompt_version: AI_SUMMARIZE_PROMPT_VERSION,
        generated_at: new Date().toISOString(),
      };
    } catch (e) {
      console.error(`[ai-summarize] Groq call failed for ${doc.id}:`, e);
      payloadMeta = {
        degraded: true,
        prompt_version: AI_SUMMARIZE_PROMPT_VERSION,
        generated_at: new Date().toISOString(),
      };
      degraded = true;
    }

    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true)",
      [doc.scope],
    );
    await client.query(
      `UPDATE corpus_documents
          SET metadata = COALESCE(metadata, '{}'::jsonb)
                         || jsonb_build_object('ai_summary', $1::jsonb)
        WHERE id = $2`,
      [JSON.stringify(payloadMeta), doc.id],
    );
    await client.query("COMMIT");

    const result: AiSummarizeResult = {
      documentId: doc.id,
      status: degraded ? "degraded" : "summarized",
      prompt_version: AI_SUMMARIZE_PROMPT_VERSION,
      latency_ms: Date.now() - t0,
    };
    console.log(JSON.stringify({ event: "ai-summarize-complete", ...result }));
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
