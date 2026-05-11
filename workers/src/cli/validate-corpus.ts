// X-5: corpus data-quality validation.
//
// Read-only script that emits a report covering every source_type in
// corpus_documents (or one passed on the CLI). For each source:
//   - Total rows
//   - Rows with body length < STUB_THRESHOLD (placeholders / stubs)
//   - Rows with no corpus_embeddings row
//   - Rows with no ai_document_entity_mentions row
//   - Sample 5 random rows with title + first 200 chars of body + source_url
//
// Output:
//   Markdown report at the path passed via --out (default:
//   .build-loop/memory/pattern_corpus_quality_<UTC-date>.md).
//
// Usage:
//   pnpm exec tsx src/cli/validate-corpus.ts
//   pnpm exec tsx src/cli/validate-corpus.ts --source mistral-blog
//   pnpm exec tsx src/cli/validate-corpus.ts --out path/to/report.md
//
// Hard-stop signal for X-5 acceptance: no source_type with >5% stub bodies.
// The existing openai-news 50-placeholder gap is the baseline noise floor and
// is called out explicitly in the report.

import { config as loadEnv } from "dotenv";
loadEnv();

import { closePool, getPool } from "../db.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const STUB_THRESHOLD = 200;

interface SourceStats {
  source_type: string;
  total: number;
  stub_count: number;
  unembedded_count: number;
  unmentioned_count: number;
  stub_pct: number;
  avg_body: number;
  samples: Array<{
    source_id: string;
    title: string;
    body_excerpt: string;
    source_url: string;
    body_len: number;
  }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function statsForSource(
  client: import("pg").PoolClient,
  sourceType: string,
): Promise<SourceStats> {
  const counts = await client.query<{
    total: number;
    stub_count: number;
    unembedded_count: number;
    unmentioned_count: number;
    avg_body: number;
  }>(
    `WITH base AS (
       SELECT id, body
         FROM corpus_documents
        WHERE scope='global' AND source_type=$1
     )
     SELECT
       (SELECT count(*)::int FROM base) AS total,
       (SELECT count(*)::int FROM base WHERE length(body) < $2) AS stub_count,
       (SELECT count(*)::int FROM base b
          WHERE NOT EXISTS (SELECT 1 FROM corpus_embeddings e WHERE e.document_id = b.id)) AS unembedded_count,
       (SELECT count(*)::int FROM base b
          WHERE NOT EXISTS (SELECT 1 FROM ai_document_entity_mentions m WHERE m.document_id = b.id)) AS unmentioned_count,
       (SELECT COALESCE(avg(length(body))::int, 0) FROM base) AS avg_body`,
    [sourceType, STUB_THRESHOLD],
  );
  const c = counts.rows[0]!;

  const samples = await client.query<{
    source_id: string;
    title: string;
    body_excerpt: string;
    source_url: string;
    body_len: number;
  }>(
    `SELECT source_id, title,
            substring(body for 200) AS body_excerpt,
            source_url,
            length(body)::int AS body_len
       FROM corpus_documents
      WHERE scope='global' AND source_type=$1
      ORDER BY random()
      LIMIT 5`,
    [sourceType],
  );

  const stub_pct = c.total > 0 ? Math.round((c.stub_count / c.total) * 1000) / 10 : 0;

  return {
    source_type: sourceType,
    total: c.total,
    stub_count: c.stub_count,
    unembedded_count: c.unembedded_count,
    unmentioned_count: c.unmentioned_count,
    stub_pct,
    avg_body: c.avg_body,
    samples: samples.rows,
  };
}

function renderMarkdown(stats: SourceStats[], totalDocs: number): string {
  const lines: string[] = [];
  lines.push(`# Corpus data-quality report — ${todayUtc()}`);
  lines.push("");
  lines.push(`Generated: ${nowIso()} (X-5 validate-corpus CLI)`);
  lines.push("");
  lines.push(`**Total docs (global scope):** ${totalDocs}`);
  lines.push(`**Stub threshold:** body length < ${STUB_THRESHOLD} chars`);
  lines.push("");

  // Quality summary table.
  lines.push("## Summary");
  lines.push("");
  lines.push("| Source | Total | Stubs | Stub % | No embedding | No KG mentions | Avg body |");
  lines.push("|--------|-------|-------|--------|--------------|----------------|----------|");
  for (const s of stats) {
    const flag = s.stub_pct > 5 ? " ⚠️" : "";
    lines.push(
      `| ${s.source_type} | ${s.total} | ${s.stub_count} | ${s.stub_pct}%${flag} | ${s.unembedded_count} | ${s.unmentioned_count} | ${s.avg_body} |`,
    );
  }
  lines.push("");

  // Highlight the openai-news baseline noise floor.
  const openai = stats.find((s) => s.source_type === "openai-news");
  if (openai && openai.stub_pct > 5) {
    lines.push("> **Known baseline:** openai-news 50-placeholder gap predates X-1..X-5; tracked separately (decision_pg_search_install.md / F-12 hard-stop).");
    lines.push("");
  }

  // Per-source samples.
  for (const s of stats) {
    lines.push(`## ${s.source_type} — 5 random samples`);
    lines.push("");
    if (s.samples.length === 0) {
      lines.push("_no rows present_");
      lines.push("");
      continue;
    }
    for (const samp of s.samples) {
      lines.push(`- **${samp.title.slice(0, 140)}** (${samp.body_len} chars)`);
      lines.push(`  - source_id: \`${samp.source_id}\``);
      lines.push(`  - url: ${samp.source_url}`);
      lines.push(`  - body: ${samp.body_excerpt.replace(/\s+/g, " ").trim()}…`);
    }
    lines.push("");
  }

  // Pass/fail verdict — excludes openai-news baseline from the gate.
  const worstNonBaseline = stats
    .filter((s) => s.source_type !== "openai-news")
    .reduce((m, s) => Math.max(m, s.stub_pct), 0);
  const verdict = worstNonBaseline <= 5 ? "✅ PASS" : "⚠️ FAIL";
  lines.push(`## Verdict: ${verdict}`);
  lines.push("");
  lines.push(`worst non-baseline stub %: ${worstNonBaseline}% (gate: ≤5%)`);
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--out");
  const outPath =
    idx >= 0 && args[idx + 1]
      ? resolve(args[idx + 1]!)
      : resolve(`.build-loop/memory/pattern_corpus_quality_${todayUtc()}.md`);
  const sidx = args.indexOf("--source");
  const onlySource = sidx >= 0 ? args[sidx + 1] : null;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', 'global', true)");

    const totalRow = await client.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM corpus_documents WHERE scope='global'`,
    );
    const totalDocs = totalRow.rows[0]?.total ?? 0;

    let sourceTypes: string[];
    if (onlySource) {
      sourceTypes = [onlySource];
    } else {
      const sourcesRow = await client.query<{ source_type: string }>(
        `SELECT DISTINCT source_type FROM corpus_documents WHERE scope='global' ORDER BY source_type`,
      );
      sourceTypes = sourcesRow.rows.map((r) => r.source_type);
    }

    const all: SourceStats[] = [];
    for (const st of sourceTypes) {
      const s = await statsForSource(client, st);
      all.push(s);
    }
    await client.query("COMMIT");

    const md = renderMarkdown(all, totalDocs);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, md, "utf8");

    console.log("[validate-corpus] wrote", outPath);
    console.log("[validate-corpus] total docs:", totalDocs);
    for (const s of all) {
      console.log(
        "  - %s\ttotal=%d\tstubs=%d (%s%%)\tno-embed=%d\tno-kg=%d",
        s.source_type.padEnd(26),
        s.total,
        s.stub_count,
        s.stub_pct,
        s.unembedded_count,
        s.unmentioned_count,
      );
    }
    const worst = all
      .filter((s) => s.source_type !== "openai-news")
      .reduce((m, s) => Math.max(m, s.stub_pct), 0);
    console.log(
      "[validate-corpus] verdict: %s (worst non-baseline stub %% = %s%%)",
      worst <= 5 ? "✅ PASS" : "⚠️ FAIL",
      worst,
    );
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error("[validate-corpus] fatal:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
