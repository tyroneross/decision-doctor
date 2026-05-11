// X-5: corpus data-quality validation.
//
// Read-only script that emits a report covering every source_type in
// corpus_documents (or one passed on the CLI). For each source:
//   - Total rows
//   - Rows with body length < STUB_THRESHOLD (placeholders / stubs)
//   - body_kind distribution from metadata.content_extract
//   - Rows whose content_hash no longer equals sha256(body)
//   - Rows that still contain challenge/loading shells
//   - Rows with no corpus_embeddings row
//   - Rows whose embedding chunks no longer match the current body chunks
//   - Rows with no ai_document_entity_mentions row
//   - Rows whose ai_summary/kg_extract input_content_hash is stale
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
import { chunkBody } from "../embed-chunker.js";
import {
  contentExtractMetadata,
  hasChallengeShell,
  sha256,
  type BodyKind,
} from "../ingestion/quality.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const STUB_THRESHOLD = 200;
const BODY_KIND_BUCKETS = [
  "full_text",
  "source_summary",
  "metadata_only",
  "blocked",
  "degraded",
  "unknown",
] as const;

type BodyKindBucket = BodyKind | "unknown";

interface EmbeddingChunkRef {
  chunk_index: number;
  content_hash: string;
}

interface SourceDocumentRow {
  id: string;
  source_id: string;
  title: string;
  body: string;
  content_hash: string;
  metadata: Record<string, unknown> | null;
  source_url: string;
  has_embedding: boolean;
  has_mentions: boolean;
  embedding_chunks: unknown;
}

interface SourceStats {
  source_type: string;
  total: number;
  stub_count: number;
  body_kind_counts: Record<BodyKindBucket, number>;
  stale_content_hash_count: number;
  challenge_shell_count: number;
  unembedded_count: number;
  stale_embedding_count: number;
  unmentioned_count: number;
  stale_summary_count: number;
  stale_kg_count: number;
  stub_pct: number;
  avg_body: number;
  samples: Array<{
    source_id: string;
    title: string;
    body_excerpt: string;
    source_url: string;
    body_len: number;
    body_kind: BodyKindBucket;
    content_hash_ok: boolean;
  }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyBodyKindCounts(): Record<BodyKindBucket, number> {
  return BODY_KIND_BUCKETS.reduce(
    (acc, kind) => ({ ...acc, [kind]: 0 }),
    {} as Record<BodyKindBucket, number>,
  );
}

function metadataObject(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return value && typeof value === "object" ? value : {};
}

function bodyKindFor(
  metadata: Record<string, unknown> | null | undefined,
): BodyKindBucket {
  const kind = contentExtractMetadata(metadataObject(metadata))?.body_kind;
  return BODY_KIND_BUCKETS.includes(kind as BodyKindBucket)
    ? (kind as BodyKindBucket)
    : "unknown";
}

function nestedInputHash(
  metadata: Record<string, unknown> | null | undefined,
  key: "ai_summary" | "kg_extract",
): string | null {
  const raw = metadataObject(metadata)[key];
  if (!raw || typeof raw !== "object") return null;
  const input = (raw as Record<string, unknown>).input_content_hash;
  return typeof input === "string" && input.length > 0 ? input : null;
}

function parseEmbeddingChunks(value: unknown): EmbeddingChunkRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): EmbeddingChunkRef | null => {
      if (!raw || typeof raw !== "object") return null;
      const rec = raw as Record<string, unknown>;
      const idx = rec.chunk_index;
      const hash = rec.content_hash;
      if (typeof idx !== "number" || typeof hash !== "string") return null;
      return { chunk_index: idx, content_hash: hash };
    })
    .filter((x): x is EmbeddingChunkRef => x !== null);
}

function embeddingsAreStale(row: SourceDocumentRow): boolean {
  const actual = parseEmbeddingChunks(row.embedding_chunks);
  if (actual.length === 0) return false;

  const expected = chunkBody(row.body).map((chunk) => ({
    chunk_index: chunk.index,
    content_hash: sha256(chunk.text),
  }));
  if (actual.length !== expected.length) return true;

  const actualByIndex = new Map(
    actual.map((chunk) => [chunk.chunk_index, chunk.content_hash]),
  );
  return expected.some(
    (chunk) => actualByIndex.get(chunk.chunk_index) !== chunk.content_hash,
  );
}

async function statsForSource(
  client: import("pg").PoolClient,
  sourceType: string,
): Promise<SourceStats> {
  const rowsQ = await client.query<SourceDocumentRow>(
    `SELECT d.id,
            d.source_id,
            d.title,
            d.body,
            d.content_hash,
            d.metadata,
            d.source_url,
            EXISTS (SELECT 1 FROM corpus_embeddings e WHERE e.document_id = d.id) AS has_embedding,
            EXISTS (SELECT 1 FROM ai_document_entity_mentions m WHERE m.document_id = d.id) AS has_mentions,
            COALESCE((
              SELECT jsonb_agg(
                       jsonb_build_object(
                         'chunk_index', e.chunk_index,
                         'content_hash', e.content_hash
                       )
                       ORDER BY e.chunk_index
                     )
                FROM corpus_embeddings e
               WHERE e.document_id = d.id
            ), '[]'::jsonb) AS embedding_chunks
       FROM corpus_documents d
      WHERE d.scope='global' AND d.source_type=$1`,
    [sourceType],
  );
  const rows = rowsQ.rows;
  const bodyKindCounts = emptyBodyKindCounts();
  let stubCount = 0;
  let staleContentHashCount = 0;
  let challengeShellCount = 0;
  let unembeddedCount = 0;
  let staleEmbeddingCount = 0;
  let unmentionedCount = 0;
  let staleSummaryCount = 0;
  let staleKgCount = 0;
  let totalBodyLength = 0;

  for (const row of rows) {
    const body = row.body ?? "";
    const kind = bodyKindFor(row.metadata);
    bodyKindCounts[kind] += 1;
    totalBodyLength += body.length;
    if (body.length < STUB_THRESHOLD) stubCount += 1;
    if (sha256(body) !== row.content_hash) staleContentHashCount += 1;
    if (hasChallengeShell(body)) challengeShellCount += 1;
    if (!row.has_embedding) unembeddedCount += 1;
    if (embeddingsAreStale(row)) staleEmbeddingCount += 1;
    if (!row.has_mentions) unmentionedCount += 1;

    const summaryInputHash = nestedInputHash(row.metadata, "ai_summary");
    const kgInputHash = nestedInputHash(row.metadata, "kg_extract");
    if (summaryInputHash && summaryInputHash !== row.content_hash) {
      staleSummaryCount += 1;
    }
    if (kgInputHash && kgInputHash !== row.content_hash) {
      staleKgCount += 1;
    }
  }

  const samples = [...rows]
    .sort(() => Math.random() - 0.5)
    .slice(0, 5)
    .map((row) => ({
      source_id: row.source_id,
      title: row.title,
      body_excerpt: (row.body ?? "").slice(0, 200),
      source_url: row.source_url,
      body_len: (row.body ?? "").length,
      body_kind: bodyKindFor(row.metadata),
      content_hash_ok: sha256(row.body ?? "") === row.content_hash,
    }));

  const total = rows.length;
  const stub_pct = total > 0 ? Math.round((stubCount / total) * 1000) / 10 : 0;

  return {
    source_type: sourceType,
    total,
    stub_count: stubCount,
    body_kind_counts: bodyKindCounts,
    stale_content_hash_count: staleContentHashCount,
    challenge_shell_count: challengeShellCount,
    unembedded_count: unembeddedCount,
    stale_embedding_count: staleEmbeddingCount,
    unmentioned_count: unmentionedCount,
    stale_summary_count: staleSummaryCount,
    stale_kg_count: staleKgCount,
    stub_pct,
    avg_body: total > 0 ? Math.round(totalBodyLength / total) : 0,
    samples,
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
  lines.push("| Source | Total | Full text | Summary | Blocked | Degraded | Metadata | Unknown | Stubs | Stub % | Challenge shell | Hash stale | Avg body |");
  lines.push("|--------|-------|-----------|---------|---------|----------|----------|---------|-------|--------|-----------------|------------|----------|");
  for (const s of stats) {
    const flag = s.stub_pct > 5 ? " ⚠️" : "";
    lines.push(
      `| ${s.source_type} | ${s.total} | ${s.body_kind_counts.full_text} | ${s.body_kind_counts.source_summary} | ${s.body_kind_counts.blocked} | ${s.body_kind_counts.degraded} | ${s.body_kind_counts.metadata_only} | ${s.body_kind_counts.unknown} | ${s.stub_count} | ${s.stub_pct}%${flag} | ${s.challenge_shell_count} | ${s.stale_content_hash_count} | ${s.avg_body} |`,
    );
  }
  lines.push("");

  lines.push("## Enrichment Tieouts");
  lines.push("");
  lines.push("| Source | No embedding | Stale embedding | No KG mentions | Stale summary hash | Stale KG hash |");
  lines.push("|--------|--------------|-----------------|----------------|--------------------|---------------|");
  for (const s of stats) {
    lines.push(
      `| ${s.source_type} | ${s.unembedded_count} | ${s.stale_embedding_count} | ${s.unmentioned_count} | ${s.stale_summary_count} | ${s.stale_kg_count} |`,
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
      lines.push(
        `- **${samp.title.slice(0, 140)}** (${samp.body_len} chars, ${samp.body_kind}, hash ${samp.content_hash_ok ? "ok" : "stale"})`,
      );
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
  const totalStaleHash = stats.reduce((sum, s) => sum + s.stale_content_hash_count, 0);
  const totalChallengeShells = stats.reduce((sum, s) => sum + s.challenge_shell_count, 0);
  const verdict =
    worstNonBaseline <= 5 && totalStaleHash === 0 && totalChallengeShells === 0
      ? "✅ PASS"
      : "⚠️ FAIL";
  lines.push(`## Verdict: ${verdict}`);
  lines.push("");
  lines.push(`worst non-baseline stub %: ${worstNonBaseline}% (gate: ≤5%)`);
  lines.push(`stale content_hash rows: ${totalStaleHash} (gate: 0)`);
  lines.push(`challenge shell rows: ${totalChallengeShells} (gate: 0)`);
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
        "  - %s\ttotal=%d\tfull=%d\tsummary=%d\tblocked=%d\tstubs=%d (%s%%)\tstale-hash=%d\tchallenge=%d\tno-embed=%d\tstale-embed=%d\tno-kg=%d",
        s.source_type.padEnd(26),
        s.total,
        s.body_kind_counts.full_text,
        s.body_kind_counts.source_summary,
        s.body_kind_counts.blocked,
        s.stub_count,
        s.stub_pct,
        s.stale_content_hash_count,
        s.challenge_shell_count,
        s.unembedded_count,
        s.stale_embedding_count,
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
