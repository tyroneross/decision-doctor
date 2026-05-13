#!/usr/bin/env tsx
/**
 * scripts/backfill-content-audience.ts — Track A audience-tag backfill.
 *
 * Per-article LLM classifier for corpus_documents (0015 follow-up):
 * sends title + body excerpt to Groq (openai/gpt-oss-120b) and writes the
 * model's verdict + rationale + confidence into content_audience.
 *
 * Source-rule classifier (lib/audience/classify.ts) is used for:
 *   - library_use_case / library_prompt / library_skill / library_plugin
 *   - kb_article
 *   - plugin / skill
 * and as the FALLBACK for corpus_document on LLM failure or with --no-llm.
 *
 * Flags:
 *   --dry-run          Plan-only. Reads source rows, runs the classifier
 *                      (LLM for corpus_document, source-rule elsewhere),
 *                      and prints the would-be inserts. EXITS without
 *                      touching content_audience.
 *
 *   --content-type=X   Restrict the run to one content_type (default: all).
 *
 *   --no-llm           Skip the LLM call for corpus_document; use the
 *                      source-rule fallback. Useful for offline testing.
 *
 *   --concurrency=N    Parallel LLM calls (default 8). Groq tolerates this
 *                      easily; bump higher if you confirm rate-limit headroom.
 *
 *   --low-conf=X       Threshold for the "flagged for review" report
 *                      (default 0.6). Rows below this are committed but
 *                      included in the review-list output.
 *
 *   --limit=N          Cap the number of corpus rows processed (default
 *                      none). Useful for sampling before a full run.
 *
 * Idempotency: live mode uses INSERT ... ON CONFLICT (content_type, content_id,
 * audience) DO UPDATE SET rationale, confidence, source = excluded values.
 * Re-runs refresh rationale + confidence; row count of "new inserts" drops
 * to 0 on the second run.
 *
 * Connection: DATABASE_URL (owner) so the inserts bypass RLS.
 *
 * Exit codes:
 *   0  — completed (or dry-run rendered) successfully
 *   1  — argument error
 *   2  — DB error
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

import { Pool } from "@neondatabase/serverless";
import {
  classifyAudience,
  classifyArticleAudience,
  type Audience,
  type AudienceContentType,
} from "../lib/audience/classify";

interface CliArgs {
  dryRun: boolean;
  contentType: AudienceContentType | "all";
  noLlm: boolean;
  concurrency: number;
  lowConfThreshold: number;
  limit: number | null;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    dryRun: false,
    contentType: "all",
    noLlm: false,
    concurrency: 6,
    lowConfThreshold: 0.6,
    limit: null,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--no-llm") {
      out.noLlm = true;
    } else if (arg.startsWith("--concurrency=")) {
      out.concurrency = Math.max(1, Number(arg.slice("--concurrency=".length)) || 6);
    } else if (arg.startsWith("--low-conf=")) {
      const v = Number(arg.slice("--low-conf=".length));
      if (Number.isFinite(v) && v >= 0 && v <= 1) {
        out.lowConfThreshold = v;
      }
    } else if (arg.startsWith("--limit=")) {
      const v = Number(arg.slice("--limit=".length));
      if (Number.isFinite(v) && v > 0) out.limit = v;
    } else if (arg.startsWith("--content-type=")) {
      const v = arg.slice("--content-type=".length);
      if (
        v === "all" ||
        v === "corpus_document" ||
        v === "library_use_case" ||
        v === "library_prompt" ||
        v === "library_skill" ||
        v === "library_plugin" ||
        v === "kb_article" ||
        v === "plugin" ||
        v === "skill"
      ) {
        out.contentType = v;
      } else {
        console.error(`Unknown --content-type=${v}`);
        process.exit(1);
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: tsx scripts/backfill-content-audience.ts [flags]\n\n" +
          "  --dry-run            Plan only; no DB writes.\n" +
          "  --content-type=X     One of: all (default), corpus_document, library_use_case,\n" +
          "                       library_prompt, library_skill, library_plugin, kb_article,\n" +
          "                       plugin, skill.\n" +
          "  --no-llm             Skip per-article LLM classifier; source-rule fallback only.\n" +
          "  --concurrency=N      Parallel LLM calls (default 8).\n" +
          "  --low-conf=X         Review threshold, 0..1 (default 0.6).\n" +
          "  --limit=N            Cap corpus rows processed.",
      );
      process.exit(0);
    }
  }
  return out;
}

interface CorpusRow {
  id: string;
  sourceType: string;
  title: string;
  body: string;
}

interface IdOnlyRow {
  id: string;
}

interface PluginSkillRow {
  id: string;
  sourceUrl: string | null;
}

interface PlanEntry {
  contentType: AudienceContentType;
  contentId: string;
  audiences: Audience[];
  reason: string;
  confidence: number;
  /** Whether this row used the LLM classifier vs source-rule. */
  classifierSource: "llm" | "source-rule" | "source-rule-fallback";
}

interface PlanSummary {
  byType: Map<AudienceContentType, number>;
  byAudience: Map<Audience, number>;
  flaggedForReview: PlanEntry[];
  lowConfidence: PlanEntry[];
  fallbackCount: number;
}

const BODY_EXCERPT_CHARS = 1000;

async function fetchCorpusRows(
  pool: Pool,
  limit: number | null,
): Promise<CorpusRow[]> {
  const limitClause = limit ? `LIMIT ${Math.floor(limit)}` : "";
  const res = await pool.query<{
    id: string;
    source_type: string;
    title: string | null;
    body: string | null;
  }>(
    `SELECT id, source_type, title, LEFT(COALESCE(body, ''), ${BODY_EXCERPT_CHARS}) AS body
       FROM corpus_documents
       ${limitClause}`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    sourceType: r.source_type ?? "",
    title: r.title ?? "",
    body: r.body ?? "",
  }));
}

async function fetchIdRows(pool: Pool, table: string): Promise<IdOnlyRow[]> {
  const res = await pool.query<{ id: string }>(`SELECT id FROM ${table}`);
  return res.rows.map((r) => ({ id: r.id }));
}

async function fetchPluginSkillRows(
  pool: Pool,
  table: "plugins" | "skills",
): Promise<PluginSkillRow[]> {
  const res = await pool.query<{ id: string; source_url: string | null }>(
    `SELECT id, source_url FROM ${table}`,
  );
  return res.rows.map((r) => ({ id: r.id, sourceUrl: r.source_url }));
}

// Source-rule classifier for non-corpus rows (synchronous; never fails).
function classifyNonCorpus(
  contentType: AudienceContentType,
  row: IdOnlyRow | PluginSkillRow,
): PlanEntry {
  if (contentType === "plugin" || contentType === "skill") {
    const r = classifyAudience({
      contentType,
      sourceUrl: (row as PluginSkillRow).sourceUrl,
    });
    return {
      contentType,
      contentId: row.id,
      audiences: r.audiences,
      reason: r.reason,
      confidence: r.confidence,
      classifierSource: "source-rule",
    };
  }
  if (
    contentType === "library_use_case" ||
    contentType === "library_prompt" ||
    contentType === "library_skill" ||
    contentType === "library_plugin" ||
    contentType === "kb_article"
  ) {
    const r = classifyAudience({ contentType });
    return {
      contentType,
      contentId: row.id,
      audiences: r.audiences,
      reason: r.reason,
      confidence: r.confidence,
      classifierSource: "source-rule",
    };
  }
  throw new Error(`classifyNonCorpus called with corpus_document`);
}

// Bounded-concurrency map helper. No external deps.
async function mapWithConcurrency<I, O>(
  items: I[],
  concurrency: number,
  fn: (item: I, index: number) => Promise<O>,
  onProgress?: (done: number, total: number) => void,
): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let nextIndex = 0;
  let done = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      const item = items[i] as I;
      out[i] = await fn(item, i);
      done++;
      if (onProgress && done % 25 === 0) onProgress(done, items.length);
    }
  }
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  if (onProgress) onProgress(done, items.length);
  return out;
}

async function classifyCorpusRows(
  rows: CorpusRow[],
  args: CliArgs,
): Promise<PlanEntry[]> {
  if (rows.length === 0) return [];

  if (args.noLlm) {
    return rows.map((row) => {
      const r = classifyAudience({
        contentType: "corpus_document",
        sourceType: row.sourceType,
      });
      return {
        contentType: "corpus_document",
        contentId: row.id,
        audiences: r.audiences,
        reason: r.reason,
        confidence: r.confidence,
        classifierSource: "source-rule",
      };
    });
  }

  console.log(`Classifying ${rows.length} corpus_document rows via LLM (concurrency ${args.concurrency})...`);
  return mapWithConcurrency(
    rows,
    args.concurrency,
    async (row): Promise<PlanEntry> => {
      const r = await classifyArticleAudience({
        contentId: row.id,
        sourceType: row.sourceType,
        title: row.title,
        bodyExcerpt: row.body,
      });
      return {
        contentType: "corpus_document",
        contentId: row.id,
        audiences: r.audiences,
        reason: r.reason,
        confidence: r.confidence,
        classifierSource: r.source === "llm" ? "llm" : "source-rule-fallback",
      };
    },
    (done, total) => console.log(`  ${done}/${total} classified...`),
  );
}

function emptySummary(): PlanSummary {
  return {
    byType: new Map(),
    byAudience: new Map(),
    flaggedForReview: [],
    lowConfidence: [],
    fallbackCount: 0,
  };
}

function accumulate(
  summary: PlanSummary,
  plan: PlanEntry[],
  lowConfThreshold: number,
): void {
  for (const e of plan) {
    if (e.audiences.length === 0) {
      summary.flaggedForReview.push(e);
      continue;
    }
    summary.byType.set(
      e.contentType,
      (summary.byType.get(e.contentType) ?? 0) + e.audiences.length,
    );
    for (const a of e.audiences) {
      summary.byAudience.set(a, (summary.byAudience.get(a) ?? 0) + 1);
    }
    if (e.confidence < lowConfThreshold) {
      summary.lowConfidence.push(e);
    }
    if (e.classifierSource === "source-rule-fallback") {
      summary.fallbackCount++;
    }
  }
}

async function applyPlan(pool: Pool, plan: PlanEntry[]): Promise<number> {
  let inserts = 0;
  for (const e of plan) {
    for (const a of e.audiences) {
      const res = await pool.query(
        `INSERT INTO content_audience (content_type, content_id, audience, source, rationale, confidence)
         VALUES ($1, $2, $3, 'auto', $4, $5)
         ON CONFLICT (content_type, content_id, audience)
         DO UPDATE SET
           rationale = EXCLUDED.rationale,
           confidence = EXCLUDED.confidence,
           source = EXCLUDED.source`,
        [e.contentType, e.contentId, a, e.reason, e.confidence],
      );
      inserts += res.rowCount ?? 0;
    }
  }
  return inserts;
}

function renderSummary(
  summary: PlanSummary,
  args: CliArgs,
): void {
  console.log("");
  console.log(`=== Audience backfill ${args.dryRun ? "DRY RUN" : "LIVE"} summary ===`);
  console.log("");
  console.log("Tags by content_type:");
  for (const [t, n] of [...summary.byType.entries()].sort()) {
    console.log(`  ${t.padEnd(20)} ${n}`);
  }
  console.log("");
  console.log("Tags by audience:");
  for (const [a, n] of [...summary.byAudience.entries()].sort()) {
    console.log(`  ${a.padEnd(22)} ${n}`);
  }
  console.log("");

  if (summary.fallbackCount > 0) {
    console.log(`LLM fallback (source-rule used): ${summary.fallbackCount}`);
    console.log("");
  }

  if (summary.lowConfidence.length > 0) {
    console.log(
      `Low-confidence (< ${args.lowConfThreshold}) — committed, flagged for review: ${summary.lowConfidence.length}`,
    );
    for (const e of summary.lowConfidence.slice(0, 15)) {
      console.log(
        `  [${e.confidence.toFixed(2)}] ${e.contentType} ${e.contentId.slice(0, 8)} → ${e.audiences.join(",")}\n        ${e.reason.slice(0, 140)}`,
      );
    }
    if (summary.lowConfidence.length > 15) {
      console.log(`  ... ${summary.lowConfidence.length - 15} more`);
    }
    console.log("");
  }

  if (summary.flaggedForReview.length > 0) {
    console.log(
      `Flagged with NO audience tag (zero-confidence): ${summary.flaggedForReview.length}`,
    );
    for (const e of summary.flaggedForReview.slice(0, 10)) {
      console.log(`  ${e.contentType} ${e.contentId.slice(0, 8)}  — ${e.reason.slice(0, 140)}`);
    }
    if (summary.flaggedForReview.length > 10) {
      console.log(`  ... ${summary.flaggedForReview.length - 10} more`);
    }
  } else {
    console.log("No rows missing audience entirely.");
  }
}

const ALL_TYPES: AudienceContentType[] = [
  "corpus_document",
  "library_use_case",
  "library_prompt",
  "library_skill",
  "library_plugin",
  "kb_article",
  "plugin",
  "skill",
];

async function buildPlanForType(
  pool: Pool,
  contentType: AudienceContentType,
  args: CliArgs,
): Promise<PlanEntry[]> {
  switch (contentType) {
    case "corpus_document": {
      const rows = await fetchCorpusRows(pool, args.limit);
      return classifyCorpusRows(rows, args);
    }
    case "library_use_case":
    case "library_prompt":
    case "library_skill":
    case "library_plugin":
    case "kb_article": {
      const table =
        contentType === "library_use_case"
          ? "library_use_cases"
          : contentType === "library_prompt"
            ? "library_prompts"
            : contentType === "library_skill"
              ? "library_skills"
              : contentType === "library_plugin"
                ? "library_plugins"
                : "kb_articles";
      const rows = await fetchIdRows(pool, table);
      return rows.map((r) => classifyNonCorpus(contentType, r));
    }
    case "plugin": {
      const rows = await fetchPluginSkillRows(pool, "plugins");
      return rows.map((r) => classifyNonCorpus("plugin", r));
    }
    case "skill": {
      const rows = await fetchPluginSkillRows(pool, "skills");
      return rows.map((r) => classifyNonCorpus("skill", r));
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(2);
  }

  const pool = new Pool({ connectionString: dbUrl });
  const summary = emptySummary();
  const plan: PlanEntry[] = [];
  const types = args.contentType === "all" ? ALL_TYPES : [args.contentType];

  try {
    for (const t of types) {
      let entries: PlanEntry[];
      try {
        entries = await buildPlanForType(pool, t, args);
      } catch (err) {
        console.warn(`[skip] ${t}: ${(err as Error).message}`);
        continue;
      }
      plan.push(...entries);
    }
    accumulate(summary, plan, args.lowConfThreshold);
    renderSummary(summary, args);

    if (!args.dryRun) {
      const eligible = plan.filter((p) => p.audiences.length > 0);
      const writes = await applyPlan(pool, eligible);
      console.log("");
      console.log(
        `Insert attempts: ${eligible.reduce((n, e) => n + e.audiences.length, 0)}`,
      );
      console.log(`Rows written (insert + update): ${writes}`);
    } else {
      console.log("");
      console.log("(dry-run — no rows written)");
    }
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exit(2);
  } finally {
    await pool.end();
  }
}

void main();
