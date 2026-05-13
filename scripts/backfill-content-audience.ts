#!/usr/bin/env tsx
/**
 * scripts/backfill-content-audience.ts — Track A audience-tag backfill.
 *
 * Tags every curated content row with one or more audience values per the
 * deterministic rules in lib/audience/classify.ts.
 *
 * Flags:
 *   --dry-run        Plan-only. Reads the source tables, runs classify(),
 *                    prints the would-be inserts, and EXITS without
 *                    touching content_audience.
 *   --content-type=X Restrict the run to one content_type (default: all).
 *
 * Idempotency: live mode uses INSERT ... ON CONFLICT (content_type, content_id,
 * audience) DO NOTHING against the unique index from drizzle/0014. Re-runs are
 * safe; counts will show 0 inserts.
 *
 * Connection: DATABASE_URL (owner) so the inserts bypass RLS — content_audience
 * is RLS-free anyway but the source-table reads still go through owner for the
 * cross-tenant view.
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
  type Audience,
  type AudienceContentType,
} from "../lib/audience/classify";

interface CliArgs {
  dryRun: boolean;
  contentType: AudienceContentType | "all";
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { dryRun: false, contentType: "all" };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") {
      out.dryRun = true;
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
        "Usage: tsx scripts/backfill-content-audience.ts [--dry-run] [--content-type=<type>]\n" +
          "  --dry-run            Plan only; no DB writes.\n" +
          "  --content-type=X     One of: all (default), corpus_document, library_use_case, library_prompt, library_skill, library_plugin, kb_article, plugin, skill.",
      );
      process.exit(0);
    }
  }
  return out;
}

interface Row {
  id: string;
  sourceType?: string;
  sourceUrl?: string | null;
}

interface PlanEntry {
  contentType: AudienceContentType;
  contentId: string;
  audiences: Audience[];
  reason: string;
}

interface PlanSummary {
  byType: Map<AudienceContentType, number>;
  byAudience: Map<Audience, number>;
  flaggedForReview: PlanEntry[];
}

async function fetchRows(
  pool: Pool,
  contentType: AudienceContentType,
): Promise<Row[]> {
  switch (contentType) {
    case "corpus_document": {
      const res = await pool.query<{ id: string; source_type: string }>(
        "SELECT id, source_type FROM corpus_documents",
      );
      return res.rows.map((r) => ({ id: r.id, sourceType: r.source_type }));
    }
    case "library_use_case": {
      const res = await pool.query<{ id: string }>(
        "SELECT id FROM library_use_cases",
      );
      return res.rows.map((r) => ({ id: r.id }));
    }
    case "library_prompt": {
      const res = await pool.query<{ id: string }>(
        "SELECT id FROM library_prompts",
      );
      return res.rows.map((r) => ({ id: r.id }));
    }
    case "library_skill": {
      const res = await pool.query<{ id: string }>(
        "SELECT id FROM library_skills",
      );
      return res.rows.map((r) => ({ id: r.id }));
    }
    case "library_plugin": {
      const res = await pool.query<{ id: string }>(
        "SELECT id FROM library_plugins",
      );
      return res.rows.map((r) => ({ id: r.id }));
    }
    case "kb_article": {
      const res = await pool.query<{ id: string }>(
        "SELECT id FROM kb_articles",
      );
      return res.rows.map((r) => ({ id: r.id }));
    }
    case "plugin": {
      const res = await pool.query<{ id: string; source_url: string | null }>(
        "SELECT id, source_url FROM plugins",
      );
      return res.rows.map((r) => ({ id: r.id, sourceUrl: r.source_url }));
    }
    case "skill": {
      const res = await pool.query<{ id: string; source_url: string | null }>(
        "SELECT id, source_url FROM skills",
      );
      return res.rows.map((r) => ({ id: r.id, sourceUrl: r.source_url }));
    }
  }
}

function classifyRow(
  contentType: AudienceContentType,
  row: Row,
): PlanEntry | null {
  if (contentType === "corpus_document") {
    const result = classifyAudience({
      contentType: "corpus_document",
      sourceType: row.sourceType ?? "",
    });
    return {
      contentType,
      contentId: row.id,
      audiences: result.audiences,
      reason: result.reason,
    };
  }
  if (contentType === "plugin" || contentType === "skill") {
    const result = classifyAudience({
      contentType,
      sourceUrl: row.sourceUrl ?? null,
    });
    return {
      contentType,
      contentId: row.id,
      audiences: result.audiences,
      reason: result.reason,
    };
  }
  if (
    contentType === "library_use_case" ||
    contentType === "library_prompt" ||
    contentType === "library_skill" ||
    contentType === "library_plugin" ||
    contentType === "kb_article"
  ) {
    const result = classifyAudience({ contentType });
    return {
      contentType,
      contentId: row.id,
      audiences: result.audiences,
      reason: result.reason,
    };
  }
  return null;
}

function emptySummary(): PlanSummary {
  return {
    byType: new Map(),
    byAudience: new Map(),
    flaggedForReview: [],
  };
}

function accumulate(summary: PlanSummary, plan: PlanEntry[]): void {
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
  }
}

async function applyPlan(pool: Pool, plan: PlanEntry[]): Promise<number> {
  let inserts = 0;
  for (const e of plan) {
    for (const a of e.audiences) {
      const res = await pool.query(
        `INSERT INTO content_audience (content_type, content_id, audience, source)
         VALUES ($1, $2, $3, 'auto')
         ON CONFLICT (content_type, content_id, audience) DO NOTHING`,
        [e.contentType, e.contentId, a],
      );
      // pg driver returns rowCount; null on no-op is safe to coerce to 0.
      inserts += res.rowCount ?? 0;
    }
  }
  return inserts;
}

function renderSummary(summary: PlanSummary, dryRun: boolean): void {
  console.log("");
  console.log(`=== Audience backfill ${dryRun ? "DRY RUN" : "LIVE"} summary ===`);
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
  if (summary.flaggedForReview.length > 0) {
    console.log(
      `Flagged for human review (no audience tag): ${summary.flaggedForReview.length}`,
    );
    for (const e of summary.flaggedForReview.slice(0, 10)) {
      console.log(`  ${e.contentType} ${e.contentId}  — ${e.reason}`);
    }
    if (summary.flaggedForReview.length > 10) {
      console.log(`  ... ${summary.flaggedForReview.length - 10} more`);
    }
  } else {
    console.log("No rows flagged for human review.");
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
      let rows: Row[];
      try {
        rows = await fetchRows(pool, t);
      } catch (err) {
        // Tables may not exist in every environment (e.g. kb_articles before
        // 0009 lands). Surface the error but keep going — partial dry-runs
        // are still useful.
        console.warn(`[skip] ${t}: ${(err as Error).message}`);
        continue;
      }
      for (const r of rows) {
        const entry = classifyRow(t, r);
        if (entry) plan.push(entry);
      }
    }
    accumulate(summary, plan);
    renderSummary(summary, args.dryRun);

    if (!args.dryRun) {
      const eligible = plan.filter((p) => p.audiences.length > 0);
      const inserts = await applyPlan(pool, eligible);
      console.log("");
      console.log(`Inserts attempted: ${eligible.reduce((n, e) => n + e.audiences.length, 0)}`);
      console.log(`New rows inserted: ${inserts} (rest were already present)`);
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
