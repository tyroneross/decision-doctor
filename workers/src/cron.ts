// node-cron schedules.
//
// Wires the F-30 ingest schedules. Each tick enqueues a pg-boss job; the job
// handler is the unit of concurrency control, not cron itself. We use
// pg-boss's singletonKey to coalesce overlapping fires (matches the
// "concurrency=1 on RLS-scoped writes" pattern from ADR-011 and the
// SET LOCAL discipline used by the Perplexity adapter; addresses the
// cron-overlap class of bug DEBT-11 in the Atomize debt audit).
//
// Every schedule logs a structured {event:'cron-tick'} line per fire and
// updates a module-local last-fire map exposed via /cron-status.
import cron from "node-cron";
import { getBoss } from "./queue.js";
import { getPool } from "./db.js";

// Threshold above which the embed-gap health-check logs a warning event.
// Set to 100 per the F-31 recall-fixes plan: any sustained gap >100 means
// the embed-document queue is falling behind ingestion. Tunable via env so
// ops can dampen alerts during legitimate large backfills.
const EMBED_GAP_WARN_THRESHOLD = Number(
  process.env.EMBED_GAP_WARN_THRESHOLD ?? 100,
);

let _registered = false;

/**
 * Last-fire timestamp per schedule. Read by /cron-status. We keep this map
 * module-local rather than persisting to Postgres — restart is rare and
 * losing this state across deploys is acceptable (the schedules themselves
 * are durable; ops just need a "is the worker firing?" signal).
 */
const lastFire: Map<string, string> = new Map();

export interface CronStatusEntry {
  schedule: string;
  cron: string;
  last_fire: string | null;
}

export function getCronStatus(): CronStatusEntry[] {
  return REGISTRY.map((r) => ({
    schedule: r.name,
    cron: r.cron,
    last_fire: lastFire.get(r.name) ?? null,
  }));
}

interface ScheduleDef {
  name: string;
  cron: string;
  fire: () => Promise<void>;
}

/**
 * The registry holds every defined schedule. Inactive entries (commented in
 * the dispatch as "adapter not yet built") are recorded with a no-op `fire`
 * so /cron-status still lists them as known-but-pending.
 */
const REGISTRY: ScheduleDef[] = [
  {
    name: "arxiv-cs-ai-hourly",
    cron: "0 * * * *", // every hour at :00
    fire: async () => {
      const boss = getBoss();
      // singletonKey coalesces overlapping fires — only one queued at a time.
      await boss.send(
        "arxiv-fetch",
        { query: "cat:cs.AI", scope: "global", maxResults: 25 },
        { singletonKey: "arxiv-cs-ai-hourly" },
      );
    },
  },
  {
    name: "anthropic-news-6h",
    cron: "0 */6 * * *", // 00:00, 06:00, 12:00, 18:00 UTC
    fire: async () => {
      const boss = getBoss();
      await boss.send(
        "anthropic-news-fetch",
        { scope: "global", maxArticles: 20 },
        { singletonKey: "anthropic-news-6h" },
      );
    },
  },
  {
    name: "openai-news-rss-6h",
    cron: "10 */6 * * *", // 00:10, 06:10, 12:10, 18:10 UTC (offset to avoid pile-up with Anthropic)
    fire: async () => {
      const boss = getBoss();
      await boss.send(
        "rss-fetch",
        {
          url: "https://openai.com/news/rss.xml",
          sourceType: "openai-news",
          scope: "global",
          maxItems: 50,
        },
        { singletonKey: "openai-news-rss-6h" },
      );
    },
  },
  {
    name: "perplexity-hub-24h",
    cron: "20 3 * * *",
    fire: async () => {
      // TODO(F-31): wire when the Perplexity hub adapter lands.
      // Perplexity Hub may need scraping (need to verify feed availability).
    },
  },

  // ----- F-31 FIX-2: embed-gap health-check -----
  // Detects when corpus_documents are accumulating without matching
  // corpus_embeddings rows. Emits a structured warning event so Railway log
  // tailing / metric scraping can alert. Cadence: hourly at :05 (offset from
  // the arxiv-cs-ai-hourly :00 tick to avoid contention with the embed jobs
  // that arxiv-fetch chain-enqueues). Pure read query — no writes, no jobs.
  {
    name: "embed-gap-health-hourly",
    cron: "5 * * * *",
    fire: async () => {
      const pool = getPool();
      const { rows } = await pool.query<{
        total: string;
        embedded: string;
        gap: string;
      }>(
        `SELECT
           (SELECT count(*) FROM corpus_documents)::text AS total,
           (SELECT count(DISTINCT document_id) FROM corpus_embeddings)::text AS embedded,
           ((SELECT count(*) FROM corpus_documents) -
            (SELECT count(DISTINCT document_id) FROM corpus_embeddings))::text AS gap`,
      );
      const r = rows[0]!;
      const gap = Number(r.gap);
      const total = Number(r.total);
      const pct = total > 0 ? Math.round((gap / total) * 10000) / 100 : 0;
      const level = gap > EMBED_GAP_WARN_THRESHOLD ? "warn" : "info";
      console.log(
        JSON.stringify({
          event: "embed-gap-health",
          level,
          total,
          embedded: Number(r.embedded),
          gap,
          gap_pct: pct,
          threshold: EMBED_GAP_WARN_THRESHOLD,
        }),
      );
    },
  },

  // ----- X-3: tier-1 corpus-expansion sitemap schedules -----
  // Staggered to avoid hour-boundary pile-up; cadence per
  // decision_tier_1_source_roster.md. All route through the generic
  // sitemap-fetch queue; per-source behavior lives in ai_sources.crawl_config.
  // Each schedule enqueues one job per fire, singleton-coalesced so an
  // overlapping fire doesn't double-queue.
  ...buildSitemapSchedules([
    { name: "daily-perplexity",          cron: "15 1 * * *",  sourceKey: "perplexity-research" },
    { name: "daily-blog-google",         cron: "30 1 * * *",  sourceKey: "google-blog-ai" },
    { name: "daily-deepmind",            cron: "45 1 * * *",  sourceKey: "deepmind-blog" },
    { name: "daily-huggingface-blog",    cron: "0 2 * * *",   sourceKey: "huggingface-blog" },
    { name: "3-day-mistral",             cron: "0 3 */3 * *", sourceKey: "mistral-blog" },
    { name: "3-day-ibm-research",        cron: "0 4 */3 * *", sourceKey: "ibm-research" },
    { name: "weekly-anthropic-docs",     cron: "0 5 * * 0",   sourceKey: "anthropic-docs" },
    { name: "weekly-mcp-spec",           cron: "30 5 * * 0",  sourceKey: "mcp-spec" },
    { name: "weekly-stanford-hai",       cron: "0 6 * * 1",   sourceKey: "stanford-hai" },
    { name: "weekly-mit-csail",          cron: "30 6 * * 1",  sourceKey: "mit-csail" },
    { name: "weekly-booth",              cron: "0 6 * * 2",   sourceKey: "chicago-booth-research" },
  ]),
];

function buildSitemapSchedules(
  defs: Array<{ name: string; cron: string; sourceKey: string }>,
): ScheduleDef[] {
  return defs.map((d) => ({
    name: d.name,
    cron: d.cron,
    fire: async () => {
      const boss = getBoss();
      await boss.send(
        "sitemap-fetch",
        { sourceKey: d.sourceKey, scope: "global" },
        { singletonKey: d.name },
      );
    },
  }));
}

export function registerSchedules(): void {
  if (_registered) return;
  _registered = true;

  for (const def of REGISTRY) {
    cron.schedule(def.cron, async () => {
      const firedAt = new Date().toISOString();
      lastFire.set(def.name, firedAt);
      console.log(
        JSON.stringify({
          event: "cron-tick",
          schedule: def.name,
          fired_at: firedAt,
        }),
      );
      try {
        await def.fire();
      } catch (e) {
        console.error(
          `[cron] schedule=${def.name} fire failed:`,
          (e as Error).message ?? e,
        );
      }
    });
  }

  console.log(
    `[cron] schedules registered: ${REGISTRY.map((r) => r.name).join(", ")}`,
  );

  // Diagnostic probe — set CRON_PROBE=1 to verify cron wiring without
  // waiting an hour for the first hourly fire.
  if (process.env.CRON_PROBE === "1") {
    cron.schedule("* * * * *", () => {
      console.log("[cron] probe tick");
    });
  }
}
