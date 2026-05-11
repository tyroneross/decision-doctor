// Idempotent seed: writes the three global lab sources (arxiv-cs.AI,
// anthropic-news, openai-news) into ai_sources. Runs once at boot via
// index.ts between startQueue() and registerSchedules().
//
// trust_tier is EXPLICIT (schema default is 2; we want 1 for the three labs).
// crawl_config carries Atomize-style category metadata for future routing.

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
         ('global', 'paper_index', 'arxiv-cs-ai',    'arXiv cs.AI',    'https://arxiv.org/list/cs.AI/recent',     1, '{"category":"lab_research"}'::jsonb),
         ('global', 'lab_news',    'anthropic-news', 'Anthropic News', 'https://www.anthropic.com/sitemap.xml',   1, '{"category":"lab_announcement","rate_limit_ms":1000}'::jsonb),
         ('global', 'lab_news',    'openai-news',    'OpenAI News',    'https://openai.com/news/rss.xml',         1, '{"category":"lab_announcement","content_extract":"cdp"}'::jsonb)
       ON CONFLICT (scope, source_key) DO NOTHING`,
    );
    await client.query("COMMIT");
    console.log("[seed-sources] global lab sources ensured");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[seed-sources] failed:", e);
    throw e;
  } finally {
    client.release();
  }
}
