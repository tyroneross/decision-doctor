#!/usr/bin/env tsx
/**
 * scripts/curate-smb-eval.ts — LLM-curate expected_matches for SMB eval.
 *
 * For each query in SMB_EVAL_QUERIES (mirrored from tests/smb-query-eval.test.ts):
 *   1. Fetch a candidate pool — BM25 OR-quorum on corpus + ILIKE on library/kb titles.
 *   2. Send the candidates + the query to Groq (openai/gpt-oss-120b).
 *   3. Groq returns 3-7 EXACT titles that genuinely answer the query (or empty).
 *   4. Write results to scripts/output/smb-eval-curated.json so a patch script
 *      can inject them into the test file.
 *
 * Output: scripts/output/smb-eval-curated.json
 *   [ { category, q, picks: string[], rationale: string }, ... ]
 *
 * Notes:
 *  - Empty `picks` → caller should mark the query expected_coverage: 'gap'.
 *  - Picks are exact titles. The test file's substring-match logic still
 *    works (title.includes(anchor) is true when anchor === title).
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

import { mkdirSync, writeFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

// ─── The eval set (mirrored from tests/smb-query-eval.test.ts) ──────────────

const QUERIES: { category: string; q: string }[] = [
  // compare-tools
  { category: "compare-tools", q: "Claude vs ChatGPT for writing medical documentation" },
  { category: "compare-tools", q: "which AI model is best for legal contract review" },
  { category: "compare-tools", q: "GPT-5 vs Claude Opus for complex reasoning tasks" },
  { category: "compare-tools", q: "comparing AI coding assistants for software development teams" },
  { category: "compare-tools", q: "Gemini vs Claude for enterprise customer support automation" },
  { category: "compare-tools", q: "Mistral vs GPT-4 for French language business applications" },

  // prompt-writing
  { category: "prompt-writing", q: "how to write a prompt for generating SOAP notes from patient conversation" },
  { category: "prompt-writing", q: "best practices for prompting Claude to summarize research papers" },
  { category: "prompt-writing", q: "chain of thought prompting for multi-step business analysis" },
  { category: "prompt-writing", q: "few-shot examples for invoice data extraction prompts" },
  { category: "prompt-writing", q: "system prompt design for consistent AI customer service tone" },
  { category: "prompt-writing", q: "structured output prompts for JSON extraction from unstructured text" },

  // skill-design
  { category: "skill-design", q: "how to design a skill for patient intake triage summaries" },
  { category: "skill-design", q: "designing reusable AI skills for HR onboarding workflows" },
  { category: "skill-design", q: "AI skill architecture for multi-step financial report generation" },
  { category: "skill-design", q: "building a skill that extracts action items from meeting transcripts" },
  { category: "skill-design", q: "skill design patterns for structured knowledge base queries" },

  // plugin-design
  { category: "plugin-design", q: "build a Claude plugin to read and summarize lab results from EHR" },
  { category: "plugin-design", q: "how to create a plugin that connects Claude to Salesforce CRM data" },
  { category: "plugin-design", q: "MCP server setup for connecting AI agents to internal databases" },
  { category: "plugin-design", q: "building an agentic plugin for automated Slack notifications" },
  { category: "plugin-design", q: "Claude tool use API for function calling with external APIs" },
  { category: "plugin-design", q: "designing a retrieval plugin for company document search" },

  // workflow-automation
  { category: "workflow-automation", q: "automate insurance pre-authorization letters with AI" },
  { category: "workflow-automation", q: "AI pipeline for processing and routing customer support emails" },
  { category: "workflow-automation", q: "automating financial report generation from spreadsheet data" },
  { category: "workflow-automation", q: "multi-agent system for parallel document review and approval" },
  { category: "workflow-automation", q: "building an AI workflow to summarize and file research papers weekly" },

  // decision-frameworks
  { category: "decision-frameworks", q: "MCDA framework for choosing between two AI billing platforms" },
  { category: "decision-frameworks", q: "AHP analytic hierarchy process for vendor selection decisions" },
  { category: "decision-frameworks", q: "how to use AI to score and rank strategic options" },
  { category: "decision-frameworks", q: "decision tree construction for clinical diagnostic pathways" },
  { category: "decision-frameworks", q: "structured approach to evaluating AI tools before procurement" },

  // ai-adoption-solo-healthcare
  { category: "ai-adoption-solo-healthcare", q: "writing prior authorization letters for insurance approvals" },
  { category: "ai-adoption-solo-healthcare", q: "structured referral templates for primary care to specialist" },
  { category: "ai-adoption-solo-healthcare", q: "AI for capacity planning in a solo psychiatry practice" },
  { category: "ai-adoption-solo-healthcare", q: "automating patient follow-up reminders for therapy practice" },
  { category: "ai-adoption-solo-healthcare", q: "summarizing intake forms for new patient appointments" },
  { category: "ai-adoption-solo-healthcare", q: "drafting denial appeal letter for prescribing decision" },
  { category: "ai-adoption-solo-healthcare", q: "research synthesis for a clinical decision a solo provider faces" },
  { category: "ai-adoption-solo-healthcare", q: "psychiatry workflows that benefit from AI assistance" },
  { category: "ai-adoption-solo-healthcare", q: "automating chart-prep before a busy clinic day" },
  { category: "ai-adoption-solo-healthcare", q: "templated patient education content for newly-diagnosed conditions" },
];

// ─── Candidate fetching ─────────────────────────────────────────────────────

interface Candidate {
  title: string;
  source: "corpus" | "library_use_case" | "library_prompt" | "library_skill" | "library_plugin" | "kb_article";
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9-]/g, ""))
    .filter((t) => t.length >= 3);
}

async function fetchCandidates(pool: Pool, query: string): Promise<Candidate[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const orQuery = tokens.join(" | ");

  // BM25 corpus (broad — no audience filter, OR-quorum, top 30 by rank)
  const corpus = await pool.query<{ title: string }>(
    `WITH tsq AS (SELECT to_tsquery('english', $1) AS q)
     SELECT title FROM corpus_documents, tsq
      WHERE search_tsv @@ tsq.q AND title IS NOT NULL
      ORDER BY ts_rank_cd(search_tsv, tsq.q, 32) DESC
      LIMIT 30`,
    [orQuery],
  );

  // Library + KB titles via simple ILIKE on each token
  const orPattern = tokens.map((t) => `%${t}%`);
  // Postgres requires parens around each branch when using LIMIT inside UNION ALL.
  const libParts = await pool.query<{ title: string; src: string }>(
    `
    (SELECT title, 'library_use_case' AS src FROM library_use_cases
       WHERE title ILIKE ANY($1::text[]) OR body ILIKE ANY($1::text[]) LIMIT 20)
    UNION ALL
    (SELECT title, 'library_prompt' AS src FROM library_prompts
       WHERE title ILIKE ANY($1::text[]) OR body ILIKE ANY($1::text[]) LIMIT 20)
    UNION ALL
    (SELECT title, 'library_skill' AS src FROM library_skills
       WHERE title ILIKE ANY($1::text[]) OR body ILIKE ANY($1::text[]) LIMIT 20)
    UNION ALL
    (SELECT title, 'library_plugin' AS src FROM library_plugins
       WHERE title ILIKE ANY($1::text[]) OR body ILIKE ANY($1::text[]) LIMIT 20)
    UNION ALL
    (SELECT title, 'kb_article' AS src FROM kb_articles
       WHERE title ILIKE ANY($1::text[]) OR body ILIKE ANY($1::text[]) LIMIT 20)
    `,
    [orPattern],
  );

  const out: Candidate[] = [];
  for (const r of corpus.rows) out.push({ title: r.title, source: "corpus" });
  for (const r of libParts.rows) {
    if (!r.title) continue;
    out.push({ title: r.title, source: r.src as Candidate["source"] });
  }

  // Dedupe by title (case-insensitive). Keep first occurrence (which is BM25-ranked
  // for corpus, ILIKE-found for library — both are good).
  const seen = new Set<string>();
  const deduped: Candidate[] = [];
  for (const c of out) {
    const key = c.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped.slice(0, 50);
}

// ─── Groq curation ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You curate ground-truth match lists for a retrieval-quality eval.

You are given:
  - A practitioner's query (typically an SMB or solo healthcare clinician).
  - A candidate pool of titles (corpus + library + KB content) that some
    keyword filter pre-selected.

Your job: pick the 1-7 titles from the candidate pool that GENUINELY answer
the query. A genuine answer is one where, if a user posed this exact query
to a search box, they would reasonably expect to see that title near the top.

Strict rules:
- Pick ONLY from the candidate pool. Do NOT invent titles.
- Return EXACT titles (verbatim, including punctuation).
- 3-5 picks is typical. 7 max. 0 (empty list) is acceptable if NONE of the
  candidates genuinely answer the query.
- Prefer titles that directly address the query topic over titles that share
  keywords but discuss a different angle.
- For healthcare-clinician queries, prefer library use_case / prompt /
  skill / plugin titles (these are curated for clinicians) over generic
  corpus content.

Return STRICT JSON only, no prose, no markdown fences:
{
  "picks": ["<exact title 1>", "<exact title 2>"],
  "rationale": "one sentence on why these were picked (or why empty)"
}`;

interface CurationResult {
  category: string;
  q: string;
  picks: string[];
  rationale: string;
  candidate_count: number;
}

async function curateOne(query: string, candidates: Candidate[]): Promise<{ picks: string[]; rationale: string }> {
  if (candidates.length === 0) {
    return { picks: [], rationale: "no candidates found by keyword pre-filter" };
  }
  const list = candidates
    .map((c, i) => `${i + 1}. [${c.source}] ${c.title}`)
    .join("\n");
  const userPrompt = `Query: ${query}\n\nCandidates:\n${list}\n\nReturn picks as exact titles from the list above.`;

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    // @ts-expect-error reasoning_format not in groq-sdk types yet
    reasoning_format: "parsed",
    response_format: { type: "json_object" },
  });
  const text = completion.choices[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(text) as { picks?: unknown; rationale?: unknown };
    const picks = Array.isArray(parsed.picks)
      ? parsed.picks.filter((p): p is string => typeof p === "string")
      : [];
    const rationale = typeof parsed.rationale === "string" ? parsed.rationale : "";
    // Sanity: drop picks that aren't in the candidate list (LLM hallucination guard).
    const candidateTitles = new Set(candidates.map((c) => c.title));
    const filtered = picks.filter((p) => candidateTitles.has(p));
    return { picks: filtered, rationale };
  } catch {
    return { picks: [], rationale: `LLM parse failure: ${text.slice(0, 80)}` };
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const results: CurationResult[] = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const item = QUERIES[i]!;
    const { category, q } = item;
    const candidates = await fetchCandidates(pool, q);
    const { picks, rationale } = await curateOne(q, candidates);
    results.push({ category, q, picks, rationale, candidate_count: candidates.length });
    const status = picks.length === 0 ? "(no good match)" : `${picks.length} picks`;
    console.log(`[${i + 1}/${QUERIES.length}] ${category} — ${status} — ${q.slice(0, 60)}`);
  }

  mkdirSync("scripts/output", { recursive: true });
  const outPath = "scripts/output/smb-eval-curated.json";
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} curated queries to ${outPath}`);

  const gap = results.filter((r) => r.picks.length === 0).length;
  const total = results.length;
  console.log(`Gap-flagged (no good match): ${gap}/${total}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
