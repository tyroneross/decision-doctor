// Idempotent seed: writes the three global lab sources (arxiv-cs.AI,
// anthropic-news, openai-news) into ai_sources. Runs once at boot via
// index.ts between startQueue() and registerSchedules().
//
// trust_tier is EXPLICIT (schema default is 2; we want 1 for the three labs).
// crawl_config carries the enriched routing shape introduced in F-2
// (2026-05-11). The shape is the contract between this seed file and the
// per-source ingest adapters.
//
// crawl_config schema (one row per global lab source):
//   discovery:        ["rss" | "sitemap" | "atom"] — discovery channels in priority order
//   category:         "lab_research" | "lab_announcement" — routing hint for KG + display
//   rate_limit_ms:    integer milliseconds between requests for this source
//   content_type:     "paper" | "article" — downstream extractor selection
//   render_fallback:  boolean — if true, retry failed fetches through the CDP renderer
//                     (used by openai.com/index/* which ships JS-rendered article bodies)
//
// ON CONFLICT now UPDATEs `crawl_config` (was DO NOTHING) so re-seeding pushes
// the enriched shape onto existing rows. source_kind, trust_tier, etc. stay
// stable; we only own the routing metadata here.

import { getPool } from "./db.js";

export async function seedSources(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true)",
      ["global"],
    );
    await client.query(
      `INSERT INTO ai_sources
         (scope, source_kind, source_key, display_name, origin_url, trust_tier, crawl_config)
       VALUES
         ('global', 'paper_index', 'arxiv-cs-ai',    'arXiv cs.AI',    'https://arxiv.org/list/cs.AI/recent',   1,
           '{"discovery":["rss"],"category":"lab_research","rate_limit_ms":1000,"content_type":"paper","render_fallback":false}'::jsonb),
         ('global', 'lab_news',    'anthropic-news', 'Anthropic News', 'https://www.anthropic.com/sitemap.xml', 1,
           '{"discovery":["sitemap"],"category":"lab_announcement","rate_limit_ms":1000,"content_type":"article","render_fallback":false}'::jsonb),
         ('global', 'lab_news',    'openai-news',    'OpenAI News',    'https://openai.com/news/rss.xml',       1,
           '{"discovery":["rss"],"category":"lab_announcement","rate_limit_ms":1000,"content_type":"article","render_fallback":true}'::jsonb)
       ON CONFLICT (scope, source_key) DO UPDATE
         SET crawl_config = EXCLUDED.crawl_config`,
    );
    await client.query("COMMIT");
    console.log("[seed-sources] global lab sources ensured (enriched crawl_config)");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[seed-sources] failed:", e);
    throw e;
  } finally {
    client.release();
  }
}

// Allow direct invocation: `pnpm exec tsx src/seed-sources.ts`.
// Mirrors the Atomize verification pattern — seeds can be run out-of-band
// from the worker boot loop when re-shaping crawl_config or backfilling new
// sources without restarting the live process.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("seed-sources.ts") === true;

if (isDirectInvocation) {
  (async () => {
    try {
      const { config: loadEnv } = await import("dotenv");
      loadEnv();
      await seedSources();
      const { closePool } = await import("./db.js");
      await closePool();
      process.exit(0);
    } catch (e) {
      console.error("[seed-sources] direct invocation failed:", e);
      process.exit(1);
    }
  })();
}
