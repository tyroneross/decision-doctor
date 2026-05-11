// pg-boss singleton + job-handler registration.
//
// We use pg-boss against the same Neon database as the main app. pg-boss
// creates its own `pgboss` schema on first start — no manual migration needed.
//
// Queue jobs are registered here. Each handler should be small + crash-safe;
// long-running work should chunk itself across multiple jobs.
import PgBoss from "pg-boss";
import { fetchArxivQuery } from "./adapters/arxiv.js";
import { handleArxivEmbed } from "./adapters/arxiv-embed.js";
import { fetchRssFeed } from "./adapters/rss.js";
import { fetchAnthropicNews } from "./adapters/anthropic-sitemap.js";
import { handleContentExtract } from "./adapters/content-extract.js";
import { handleAiSummarize } from "./adapters/ai-summarize.js";
import { handleKgExtract } from "./adapters/kg-extract.js";
import {
  runSitemapAdapter,
  type SitemapAdapterConfig,
} from "./adapters/sitemap-adapter.js";
import { getPool } from "./db.js";

let _boss: PgBoss | null = null;
let _started = false;

/**
 * Look up a single ai_sources row's crawl_config and coerce to a
 * SitemapAdapterConfig. Returns null if the row doesn't exist or is missing
 * a sitemap_url. RLS-scoped read.
 */
async function loadCrawlConfig(
  scope: string,
  sourceKey: string,
): Promise<SitemapAdapterConfig | null> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [scope]);
    const r = await client.query<{ crawl_config: SitemapAdapterConfig }>(
      `SELECT crawl_config FROM ai_sources
        WHERE scope = $1 AND source_key = $2 AND enabled = true
        LIMIT 1`,
      [scope, sourceKey],
    );
    await client.query("COMMIT");
    if (r.rows.length === 0) return null;
    const cfg = r.rows[0]!.crawl_config;
    if (!cfg || typeof cfg !== "object" || !("sitemap_url" in cfg)) {
      console.warn(
        `[sitemap-fetch] ai_sources ${sourceKey} has no sitemap_url in crawl_config; skipping`,
      );
      return null;
    }
    return cfg;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export { loadCrawlConfig };

export function getBoss(): PgBoss {
  if (_boss) return _boss;
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_UNPOOLED or DATABASE_URL must be set for pg-boss",
    );
  }
  _boss = new PgBoss({
    connectionString,
    // Neon serverless / pooled connections cause idle-connection churn; we use
    // the unpooled URL here so pg-boss owns its own long-lived connection.
    schema: "pgboss",
    retentionDays: 7,
  });
  _boss.on("error", (err) => {
    // Never throw; pg-boss surfaces non-fatal errors here. Log + carry on.
    console.error("[pg-boss] error:", err);
  });
  return _boss;
}

export async function startQueue(): Promise<PgBoss> {
  const boss = getBoss();
  if (_started) return boss;
  await boss.start();
  _started = true;

  // pg-boss v10 requires explicit createQueue() before send/work.
  // Idempotent — safe to re-run.
  await boss.createQueue("arxiv-fetch");
  await boss.createQueue("arxiv-embed");
  await boss.createQueue("rss-fetch");
  await boss.createQueue("anthropic-news-fetch");
  await boss.createQueue("sitemap-fetch");
  await boss.createQueue("content-extract");
  await boss.createQueue("ai-summarize");
  await boss.createQueue("kg-extract");
  await boss.createQueue("test-job");

  // ---- Register handlers --------------------------------------------------
  // arxiv-fetch: ingest arXiv papers matching a query.
  // Payload: { query: string; scope?: string; maxResults?: number }
  // Chains: each newly-ingested corpus_documents row → enqueue arxiv-embed.
  await boss.work<{ query: string; scope?: string; maxResults?: number }>(
    "arxiv-fetch",
    { batchSize: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        const r = await fetchArxivQuery({
          query: job.data.query,
          scope: job.data.scope ?? "global",
          maxResults: job.data.maxResults ?? 25,
        });
        // Chain: enqueue an arxiv-embed job for each new document.
        // Idempotent at the handler level — replays hit the content_hash
        // cache and insert zero new chunks.
        for (const docId of r.ingestedIds) {
          await boss.send("content-extract", { documentId: docId });
        }
        results.push({ id: job.id, ...r });
      }
      console.log("[arxiv-fetch] processed:", JSON.stringify(results));
      return results;
    },
  );

  // arxiv-embed: chunk + embed a single corpus_documents row.
  // Payload: { documentId: string }
  // batchSize=1 to bound OpenAI throughput; pg-boss serializes per queue.
  await boss.work<{ documentId: string }>(
    "arxiv-embed",
    { batchSize: 1 },
    async (jobs) => {
      const out = [];
      for (const job of jobs) {
        const r = await handleArxivEmbed({ documentId: job.data.documentId });
        out.push({ id: job.id, ...r });
      }
      return out;
    },
  );

  // content-extract: per-source body enrichment (cheerio / CDP / noop).
  // Payload: { documentId: string }
  // Chains: arxiv-embed after the body is updated. ai-summarize + kg-extract
  // are added in later chunks; they fan out from here once registered.
  await boss.work<{ documentId: string }>(
    "content-extract",
    { batchSize: 1 },
    async (jobs) => {
      const out = [];
      for (const job of jobs) {
        const r = await handleContentExtract({ documentId: job.data.documentId });
        // Fan out downstream — all three run against the enriched body.
        await boss.send("arxiv-embed", { documentId: job.data.documentId });
        await boss.send("ai-summarize", { documentId: job.data.documentId });
        await boss.send("kg-extract", { documentId: job.data.documentId });
        out.push({ id: job.id, ...r });
      }
      return out;
    },
  );

  // ai-summarize: Groq Llama 3.3 70B JSON-mode summary written into
  // metadata.ai_summary. SMB-persona constrained; graceful-degrade on
  // Groq error. Payload: { documentId: string }
  await boss.work<{ documentId: string }>(
    "ai-summarize",
    { batchSize: 1 },
    async (jobs) => {
      const out = [];
      for (const job of jobs) {
        const r = await handleAiSummarize({ documentId: job.data.documentId });
        out.push({ id: job.id, ...r });
      }
      return out;
    },
  );

  // kg-extract: Groq Llama 3.3 70B JSON-mode entity + relationship
  // extraction. Canonicalizes against ai_entities via (exact → pg_trgm ≥ 0.7
  // → alias overlap → insert). Writes mentions + relationships in one txn.
  // Doc-level idempotent: skip if any mention row already exists.
  await boss.work<{ documentId: string }>(
    "kg-extract",
    { batchSize: 1 },
    async (jobs) => {
      const out = [];
      for (const job of jobs) {
        const r = await handleKgExtract({ documentId: job.data.documentId });
        out.push({ id: job.id, ...r });
      }
      return out;
    },
  );

  // rss-fetch: generic RSS 2.0 ingest. Used by OpenAI news and any other
  // source that publishes a standard RSS feed.
  // Payload: { url: string; sourceType: string; scope?: string; maxItems?: number }
  // Chains: each new corpus_documents row → arxiv-embed (handler is source-agnostic
  //   despite its name; chunks + embeds the body of any document).
  await boss.work<{
    url: string;
    sourceType: string;
    scope?: string;
    maxItems?: number;
  }>(
    "rss-fetch",
    { batchSize: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        const r = await fetchRssFeed({
          url: job.data.url,
          sourceType: job.data.sourceType,
          scope: job.data.scope ?? "global",
          maxItems: job.data.maxItems,
        });
        for (const docId of r.ingestedIds) {
          await boss.send("content-extract", { documentId: docId });
        }
        results.push({ id: job.id, ...r });
      }
      console.log("[rss-fetch] processed:", JSON.stringify(results));
      return results;
    },
  );

  // anthropic-news-fetch: discover via sitemap, fetch per-article og: meta,
  // INSERT into corpus_documents. Rate-limited 1 req/sec per Atomize pattern.
  // Payload: { scope?: string; sinceIso?: string; maxArticles?: number }
  await boss.work<{
    scope?: string;
    sinceIso?: string;
    maxArticles?: number;
  }>(
    "anthropic-news-fetch",
    { batchSize: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        const r = await fetchAnthropicNews({
          scope: job.data.scope ?? "global",
          sinceIso: job.data.sinceIso,
          maxArticles: job.data.maxArticles,
        });
        for (const docId of r.ingestedIds) {
          await boss.send("content-extract", { documentId: docId });
        }
        results.push({ id: job.id, ...r });
      }
      console.log("[anthropic-news-fetch] processed:", JSON.stringify(results));
      return results;
    },
  );

  // sitemap-fetch: generic config-driven sitemap ingest (X-1 adapter).
  // Reads ai_sources.crawl_config for the source_key, runs runSitemapAdapter,
  // and chains content-extract per newly-inserted document.
  // Payload: { sourceKey: string; scope?: string; maxOverride?: number;
  //            ignoreLookback?: boolean }
  // - maxOverride / ignoreLookback are used by the historical backfill CLI
  //   to ignore lookback_days and bump max_per_run for one-shot pulls.
  await boss.work<{
    sourceKey: string;
    scope?: string;
    maxOverride?: number;
    ignoreLookback?: boolean;
  }>(
    "sitemap-fetch",
    { batchSize: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        const scope = job.data.scope ?? "global";
        const cfg = await loadCrawlConfig(scope, job.data.sourceKey);
        if (!cfg) {
          console.warn(
            `[sitemap-fetch] no ai_sources row for source_key=${job.data.sourceKey}; skipping`,
          );
          results.push({
            id: job.id,
            sourceKey: job.data.sourceKey,
            ingested: 0,
            skipped_count: 0,
            considered: 0,
            fetched: 0,
            errors: ["source not found in ai_sources"],
            ingestedIds: [],
          });
          continue;
        }
        const r = await runSitemapAdapter({
          scope,
          sourceKey: job.data.sourceKey,
          config: cfg,
          maxOverride: job.data.maxOverride,
          ignoreLookback: job.data.ignoreLookback,
        });
        for (const docId of r.ingestedIds) {
          await boss.send("content-extract", { documentId: docId });
        }
        results.push({ id: job.id, ...r });
      }
      console.log("[sitemap-fetch] processed:", JSON.stringify(results));
      return results;
    },
  );

  // test-job: round-trips its payload. Used by tests and `pnpm enqueue:test`.
  await boss.work<{ echo: string }>("test-job", async (jobs) => {
    const out = jobs.map((j) => ({ ok: true, echo: j.data.echo, id: j.id }));
    console.log("[test-job] handled:", JSON.stringify(out));
    return out;
  });

  console.log("[pg-boss] queue started, handlers registered");
  return boss;
}

export async function stopQueue(): Promise<void> {
  if (_boss && _started) {
    await _boss.stop({ graceful: true, timeout: 5000 });
    _started = false;
    _boss = null;
  }
}

export async function queueCount(): Promise<number> {
  if (!_boss || !_started) return 0;
  // pg-boss doesn't expose a single count; we approximate via the active queues.
  const queues = [
    "arxiv-fetch",
    "arxiv-embed",
    "rss-fetch",
    "anthropic-news-fetch",
    "sitemap-fetch",
    "content-extract",
    "ai-summarize",
    "kg-extract",
    "test-job",
  ];
  let total = 0;
  for (const q of queues) {
    const size = await _boss.getQueueSize(q);
    total += size ?? 0;
  }
  return total;
}
