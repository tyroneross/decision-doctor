// X-4: tier-1 historical backfill CLI.
//
// One-shot script that runs each new source's sitemap-adapter in "historical"
// mode (ignoreLookback=true, maxOverride = soft cap). Idempotent — relies on
// content_hash + ON CONFLICT collision skip.
//
// Flow:
//   1. Show per-source preview ("about to enqueue N docs, total $X").
//   2. If projected cost > $35 OR projected docs > 2500: prompt for confirm.
//   3. For each source: load ai_sources.crawl_config, runSitemapAdapter
//      with the soft cap. Each newly-inserted doc id is enqueued through
//      content-extract → ai-summarize + kg-extract + arxiv-embed (the
//      existing chain — pg-boss serializes downstream).
//   4. Print a summary; exit. Railway-side worker drains in background.
//
// Cost model: $0.01 per doc through the chain (Groq summarize + embed). The
// per-source caps below add up to ~2070 docs / ~$20.70 — under threshold so
// runs without prompting unless adjusted.
//
// Usage:
//   pnpm exec tsx src/cli/backfill-historical.ts                  # all 11 sources
//   pnpm exec tsx src/cli/backfill-historical.ts mcp-spec         # one source
//   BACKFILL_DRY_RUN=1 pnpm exec tsx src/cli/backfill-historical.ts  # preview only
//   BACKFILL_FORCE=1 pnpm exec tsx src/cli/backfill-historical.ts     # skip prompt
//
// Optional env:
//   BACKFILL_COST_PER_DOC_USD     override per-doc cost projection (default 0.01)
//   BACKFILL_MAX_TOTAL_USD        cost ceiling above which we prompt (default 35)
//   BACKFILL_MAX_TOTAL_DOCS       doc ceiling above which we prompt (default 2500)

import { config as loadEnv } from "dotenv";
loadEnv();

import { startQueue, stopQueue, loadCrawlConfig, getBoss } from "../queue.js";
import { runSitemapAdapter, type SitemapAdapterConfig } from "../adapters/sitemap-adapter.js";
import { closePool, pingPostgres } from "../db.js";
import { createInterface } from "node:readline/promises";

interface BackfillTarget {
  sourceKey: string;
  cap: number;
}

// Soft caps per the X-4 spec. Meta AI is intentionally absent — sitemap
// path loops to 404 and is deferred for follow-up rediscovery.
const TARGETS: BackfillTarget[] = [
  { sourceKey: "anthropic-docs",          cap: 500 },
  { sourceKey: "mcp-spec",                cap: 190 },
  { sourceKey: "perplexity-research",     cap: 20 },
  { sourceKey: "huggingface-blog",        cap: 300 },
  { sourceKey: "deepmind-blog",           cap: 150 },
  { sourceKey: "google-blog-ai",          cap: 200 },
  { sourceKey: "mistral-blog",            cap: 50 },
  { sourceKey: "stanford-hai",            cap: 200 },
  { sourceKey: "mit-csail",               cap: 200 },
  { sourceKey: "ibm-research",            cap: 250 },
  { sourceKey: "chicago-booth-research",  cap: 100 },
];

const COST_PER_DOC = Number(process.env.BACKFILL_COST_PER_DOC_USD ?? "0.01");
const MAX_TOTAL_COST = Number(process.env.BACKFILL_MAX_TOTAL_USD ?? "35");
const MAX_TOTAL_DOCS = Number(process.env.BACKFILL_MAX_TOTAL_DOCS ?? "2500");

interface RunSummary {
  sourceKey: string;
  cap: number;
  ingested: number;
  skipped_count: number;
  considered: number;
  fetched: number;
  errors: string[];
}

async function confirmPrompt(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = await rl.question(message);
    return /^(y|yes)$/i.test(ans.trim());
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const argSource = process.argv[2];
  const targets = argSource
    ? TARGETS.filter((t) => t.sourceKey === argSource)
    : TARGETS;
  if (targets.length === 0) {
    console.error(
      `[backfill] unknown source '${argSource}'. Known: ${TARGETS.map((t) => t.sourceKey).join(", ")}`,
    );
    process.exit(1);
  }

  // ---- Preview ----
  const totalDocs = targets.reduce((s, t) => s + t.cap, 0);
  const totalCost = totalDocs * COST_PER_DOC;
  console.log("[backfill] tier-1 historical backfill preview");
  console.log("[backfill] cost model: $%s per doc", COST_PER_DOC.toFixed(3));
  for (const t of targets) {
    console.log(
      "  - %s\tcap=%d\t≈$%s",
      t.sourceKey.padEnd(26),
      t.cap,
      (t.cap * COST_PER_DOC).toFixed(2),
    );
  }
  console.log("[backfill] projected total: %d docs / $%s", totalDocs, totalCost.toFixed(2));

  if (process.env.BACKFILL_DRY_RUN === "1") {
    console.log("[backfill] BACKFILL_DRY_RUN=1 — exit before fetch.");
    return;
  }

  const needsConfirm = totalCost > MAX_TOTAL_COST || totalDocs > MAX_TOTAL_DOCS;
  if (needsConfirm && process.env.BACKFILL_FORCE !== "1") {
    console.log(
      "[backfill] projection exceeds ceiling (cost $%s > $%s OR docs %d > %d).",
      totalCost.toFixed(2),
      MAX_TOTAL_COST.toFixed(2),
      totalDocs,
      MAX_TOTAL_DOCS,
    );
    const ok = await confirmPrompt("[backfill] proceed anyway? (y/N): ");
    if (!ok) {
      console.log("[backfill] cancelled by user.");
      return;
    }
  }

  // ---- Boot dependencies ----
  const pgOk = await pingPostgres();
  if (!pgOk) {
    console.error("[backfill] postgres unreachable; aborting.");
    process.exit(2);
  }
  // We start the queue so that runSitemapAdapter's inserted ids can be
  // enqueued to content-extract through getBoss().send. The cron registration
  // is intentionally skipped — we don't want this CLI run to also start the
  // schedule loop.
  await startQueue();
  const boss = getBoss();

  // ---- Execute ----
  const summaries: RunSummary[] = [];
  for (const target of targets) {
    console.log("[backfill] %s — cap=%d", target.sourceKey, target.cap);
    const cfg = await loadCrawlConfig("global", target.sourceKey);
    if (!cfg) {
      console.warn("  ⚠️  no ai_sources row; skipping");
      summaries.push({
        sourceKey: target.sourceKey,
        cap: target.cap,
        ingested: 0,
        skipped_count: 0,
        considered: 0,
        fetched: 0,
        errors: ["source not found in ai_sources"],
      });
      continue;
    }
    const r = await runSitemapAdapter({
      scope: "global",
      sourceKey: target.sourceKey,
      config: cfg as SitemapAdapterConfig,
      maxOverride: target.cap,
      ignoreLookback: true,
    });
    // Enqueue content-extract for every newly-inserted doc so the chain
    // (content-extract → ai-summarize + kg-extract + arxiv-embed) drains
    // Railway-side without each adapter doing its own enqueue.
    for (const docId of r.ingestedIds) {
      try {
        await boss.send("content-extract", { documentId: docId });
      } catch (e) {
        console.error(
          "  ⚠️  failed to enqueue content-extract for %s: %s",
          docId,
          (e as Error).message,
        );
      }
    }
    summaries.push({
      sourceKey: r.sourceKey,
      cap: target.cap,
      ingested: r.ingested,
      skipped_count: r.skipped_count,
      considered: r.considered,
      fetched: r.fetched,
      errors: r.errors,
    });
    console.log(
      "  considered=%d fetched=%d ingested=%d skipped=%d errors=%d",
      r.considered,
      r.fetched,
      r.ingested,
      r.skipped_count,
      r.errors.length,
    );
    if (r.errors.length > 0) {
      for (const e of r.errors.slice(0, 5)) {
        console.log("    error: %s", e);
      }
    }
  }

  // ---- Summary ----
  const totalIngested = summaries.reduce((s, r) => s + r.ingested, 0);
  const totalFetched = summaries.reduce((s, r) => s + r.fetched, 0);
  const totalErrors = summaries.reduce((s, r) => s + r.errors.length, 0);
  const actualCost = totalIngested * COST_PER_DOC;
  console.log("");
  console.log("[backfill] DONE — drain runs on Railway worker.");
  console.log(JSON.stringify({
    event: "backfill-historical-complete",
    targets: summaries.length,
    total_ingested: totalIngested,
    total_fetched: totalFetched,
    total_errors: totalErrors,
    estimated_cost_usd: Number(actualCost.toFixed(2)),
    by_source: summaries.map((s) => ({
      source_key: s.sourceKey,
      ingested: s.ingested,
      skipped_count: s.skipped_count,
      considered: s.considered,
      errors: s.errors.length,
    })),
  }, null, 2));
}

main()
  .catch((e) => {
    console.error("[backfill] fatal:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await stopQueue();
    } catch {}
    await closePool();
  });
