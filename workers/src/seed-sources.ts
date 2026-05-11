// Idempotent seed: writes the global lab + tier-1 corpus-expansion sources
// into ai_sources. Runs once at boot via index.ts between startQueue() and
// registerSchedules().
//
// trust_tier is EXPLICIT (schema default is 2; we want 1 for lab primaries).
// crawl_config carries the enriched routing shape (F-2, 2026-05-11) plus the
// sitemap-adapter shape (X-1/X-2, 2026-05-11) — the contract between this seed
// file and the per-source ingest adapters.
//
// crawl_config schema:
//   discovery:           ["rss" | "sitemap" | "atom"] discovery channels in priority order
//   category:            "lab_research" | "lab_announcement" | "docs" | "research" | "blog" |
//                        "spec" | "academia" | "enterprise" — routing hint for KG + display
//   rate_limit_ms:       integer ms between requests for this source
//   content_type:        "paper" | "article" | "docs" — downstream extractor selection
//   render_fallback:     boolean — if true, retry via CDP renderer on short body
//   sitemap_url:         sitemap-adapter entry (for sitemap-discovery sources)
//   url_filter:          OR-joined regex array (sitemap-adapter)
//   sitemap_index:       sitemap-index recursion (sitemap-adapter)
//   lookback_days:       cron-mode incrementality window (sitemap-adapter)
//   max_per_run:         per-fire soft cap (sitemap-adapter)
//   slug_strip_prefix:   optional URL-path prefix to strip when deriving source_id
//                        (anthropic-news legacy shape: 'claude-4' not 'news/claude-4')
//
// ON CONFLICT UPDATEs crawl_config so re-seeding pushes the enriched shape onto
// existing rows. source_kind, trust_tier, etc. stay stable on the original
// 3 rows.
//
// X-2 (2026-05-11): adds 11 tier-1 corpus-expansion sources (anthropic-docs,
// mcp-spec, perplexity-research, huggingface-blog, deepmind-blog, google-blog-ai,
// mistral-blog, stanford-hai, mit-csail, ibm-research, chicago-booth-research).
// meta-ai deferred — https://ai.meta.com/sitemap.xml redirects to 404; see
// decision_tier_1_source_roster.md.

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
    // -- Original 3 lab sources (F-2). Slug shape preserved. -----------------
    await client.query(
      `INSERT INTO ai_sources
         (scope, source_kind, source_key, display_name, origin_url, trust_tier, crawl_config)
       VALUES
         ('global', 'paper_index', 'arxiv-cs-ai',    'arXiv cs.AI',    'https://arxiv.org/list/cs.AI/recent',   1,
           '{"discovery":["rss"],"category":"lab_research","rate_limit_ms":1000,"content_type":"paper","render_fallback":false}'::jsonb),
         ('global', 'lab_news',    'anthropic-news', 'Anthropic News', 'https://www.anthropic.com/sitemap.xml', 1,
           '{"discovery":["sitemap"],"category":"lab_announcement","rate_limit_ms":1000,"content_type":"article","render_fallback":false,
             "sitemap_url":"https://www.anthropic.com/sitemap.xml","url_filter":["\\\\/news\\\\/[^/]+"],"sitemap_index":false,"lookback_days":30,"max_per_run":20,"slug_strip_prefix":"news/"}'::jsonb),
         ('global', 'lab_news',    'openai-news',    'OpenAI News',    'https://openai.com/news/rss.xml',       1,
           '{"discovery":["rss"],"category":"lab_announcement","rate_limit_ms":1000,"content_type":"article","render_fallback":true}'::jsonb)
       ON CONFLICT (scope, source_key) DO UPDATE
         SET crawl_config = EXCLUDED.crawl_config`,
    );

    // -- X-2 tier-1 corpus-expansion sources (sitemap-adapter routed). -------
    // schema-constrained source_kind values only: lab_news | lab_research |
    // paper_index | industry_news | user_url | user_rss | user_file.
    // Discovery method (sitemap) lives inside crawl_config.discovery.
    await client.query(
      `INSERT INTO ai_sources
         (scope, source_kind, source_key, display_name, origin_url, trust_tier, crawl_config)
       VALUES
         ('global', 'lab_news', 'anthropic-docs', 'Anthropic Platform Docs', 'https://platform.claude.com/docs', 1,
           '{"discovery":["sitemap"],"category":"docs","rate_limit_ms":1000,"content_type":"docs","render_fallback":false,
             "sitemap_url":"https://platform.claude.com/sitemap.xml",
             "url_filter":["^https://platform\\\\.claude\\\\.com/docs/en/(build-with-claude|claude-code|agents-and-tools|prompt-engineering)/.*"],
             "sitemap_index":false,"lookback_days":7,"max_per_run":50}'::jsonb),
         ('global', 'industry_news', 'mcp-spec', 'Model Context Protocol Spec', 'https://modelcontextprotocol.io', 1,
           '{"discovery":["sitemap"],"category":"spec","rate_limit_ms":1000,"content_type":"docs","render_fallback":false,
             "sitemap_url":"https://modelcontextprotocol.io/sitemap.xml",
             "url_filter":[],"sitemap_index":false,"lookback_days":7,"max_per_run":50}'::jsonb),
         ('global', 'lab_research', 'perplexity-research', 'Perplexity Research', 'https://research.perplexity.ai', 2,
           '{"discovery":["sitemap"],"category":"research","rate_limit_ms":1500,"content_type":"article","render_fallback":true,
             "sitemap_url":"https://research.perplexity.ai/sitemap.xml",
             "url_filter":[],"sitemap_index":false,"lookback_days":7,"max_per_run":20}'::jsonb),
         ('global', 'lab_research', 'huggingface-blog', 'Hugging Face Blog', 'https://huggingface.co/blog', 1,
           '{"discovery":["sitemap"],"category":"blog","rate_limit_ms":1000,"content_type":"article","render_fallback":false,
             "sitemap_url":"https://huggingface.co/sitemap-blog.xml",
             "url_filter":["^https://huggingface\\\\.co/blog/.*"],"sitemap_index":false,"lookback_days":7,"max_per_run":50}'::jsonb),
         ('global', 'lab_research', 'deepmind-blog', 'Google DeepMind Blog', 'https://deepmind.google', 1,
           '{"discovery":["sitemap"],"category":"blog","rate_limit_ms":1000,"content_type":"article","render_fallback":true,
             "sitemap_url":"https://deepmind.google/sitemap.xml",
             "url_filter":["^https://deepmind\\\\.google/(blog|discover)/.*"],"sitemap_index":false,"lookback_days":7,"max_per_run":50}'::jsonb),
         ('global', 'lab_news', 'google-blog-ai', 'Google Blog (AI)', 'https://blog.google', 1,
           '{"discovery":["sitemap"],"category":"blog","rate_limit_ms":1000,"content_type":"article","render_fallback":false,
             "sitemap_url":"https://blog.google/en-us/sitemap.xml",
             "url_filter":["^https://blog\\\\.google/technology/(ai|safety-security/ai)/.*"],"sitemap_index":false,"lookback_days":7,"max_per_run":50}'::jsonb),
         ('global', 'lab_news', 'mistral-blog', 'Mistral AI News', 'https://mistral.ai/news', 1,
           '{"discovery":["sitemap"],"category":"blog","rate_limit_ms":1500,"content_type":"article","render_fallback":false,
             "sitemap_url":"https://mistral.ai/sitemap.xml",
             "url_filter":["^https://mistral\\\\.ai/news/.*"],"sitemap_index":false,"lookback_days":7,"max_per_run":30}'::jsonb),
         ('global', 'industry_news', 'stanford-hai', 'Stanford HAI', 'https://hai.stanford.edu', 2,
           '{"discovery":["sitemap"],"category":"academia","rate_limit_ms":1500,"content_type":"article","render_fallback":false,
             "sitemap_url":"https://hai.stanford.edu/sitemap.xml",
             "url_filter":["^https://hai\\\\.stanford\\\\.edu/(news|research|policy)/.*"],"sitemap_index":false,"lookback_days":14,"max_per_run":40}'::jsonb),
         ('global', 'industry_news', 'mit-csail', 'MIT CSAIL', 'https://www.csail.mit.edu', 2,
           '{"discovery":["sitemap"],"category":"academia","rate_limit_ms":1500,"content_type":"article","render_fallback":false,
             "sitemap_url":"https://www.csail.mit.edu/sitemap.xml",
             "url_filter":["^https://www\\\\.csail\\\\.mit\\\\.edu/(news|research)/.*"],"sitemap_index":false,"lookback_days":14,"max_per_run":40}'::jsonb),
         ('global', 'industry_news', 'ibm-research', 'IBM Research', 'https://research.ibm.com', 2,
           '{"discovery":["sitemap"],"category":"enterprise","rate_limit_ms":1500,"content_type":"article","render_fallback":false,
             "sitemap_url":"https://research.ibm.com/sitemap.xml",
             "url_filter":["^https://research\\\\.ibm\\\\.com/(blog|publications|projects)/.*"],"sitemap_index":true,"lookback_days":14,"max_per_run":50}'::jsonb),
         ('global', 'industry_news', 'chicago-booth-research', 'Chicago Booth Research', 'https://research.chicagobooth.edu', 3,
           '{"discovery":["sitemap"],"category":"academia","rate_limit_ms":1500,"content_type":"article","render_fallback":false,
             "sitemap_url":"https://research.chicagobooth.edu/sitemap.xml",
             "url_filter":["^https://research\\\\.chicagobooth\\\\.edu/.*"],"sitemap_index":false,"lookback_days":14,"max_per_run":40}'::jsonb)
       ON CONFLICT (scope, source_key) DO UPDATE
         SET crawl_config = EXCLUDED.crawl_config,
             display_name = EXCLUDED.display_name,
             origin_url   = EXCLUDED.origin_url,
             trust_tier   = EXCLUDED.trust_tier`,
    );

    await client.query("COMMIT");
    console.log(
      "[seed-sources] global lab sources + 11 tier-1 corpus-expansion sources ensured",
    );
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
