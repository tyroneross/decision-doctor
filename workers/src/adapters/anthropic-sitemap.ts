// Thin wrapper around the generalized sitemap-adapter for the
// canonical Anthropic news source. Exists for two reasons:
//   1. Preserve the `fetchAnthropicNews` export name (queue.ts imports it).
//   2. Preserve the legacy slug shape ("claude-4", not "news/claude-4") so
//      the 121 existing corpus_documents rows stay idempotent on re-ingest.
//
// All real logic lives in runSitemapAdapter(). The hardcoded config below
// matches the row currently in ai_sources for source_key='anthropic-news'.
//
// New sources call runSitemapAdapter() directly via the queue handler in
// queue.ts (sitemap-fetch); they do NOT route through this wrapper.

import {
  runSitemapAdapter,
  type RunSitemapAdapterResult,
  type SitemapAdapterConfig,
} from "./sitemap-adapter.js";

const ANTHROPIC_CONFIG: SitemapAdapterConfig = {
  sitemap_url: "https://www.anthropic.com/sitemap.xml",
  url_filter: ["\\/news\\/[^/]+"],
  sitemap_index: false,
  rate_limit_ms: 1000,
  content_type: "article",
  category: "lab_announcement",
  render_fallback: false,
  // lookback_days is set per-call below to preserve the existing FetchAnthropicOptions contract.
  // slug_strip_prefix preserves the historic 'claude-4' shape instead of 'news/claude-4'.
  slug_strip_prefix: "news/",
};

export interface FetchAnthropicOptions {
  scope: string;
  /** Sitemap lastmod cutoff (ISO date). Items older than this are ignored. Default: 30 days ago. */
  sinceIso?: string;
  /** Max articles to fetch per run (rate-limited at 1 req/sec). Default: 20. */
  maxArticles?: number;
  /** Override sitemap URL (for tests). */
  sitemapUrl?: string;
}

export interface FetchAnthropicResult {
  ingested: number;
  duplicates: number;
  considered: number;
  fetched: number;
  ingestedIds: string[];
}

/**
 * Anthropic-news adapter. Now backed by runSitemapAdapter() with the canonical
 * Anthropic config. The legacy return shape is preserved for queue.ts +
 * any downstream consumers.
 */
export async function fetchAnthropicNews(
  opts: FetchAnthropicOptions,
): Promise<FetchAnthropicResult> {
  // Translate the legacy options shape into the generalized adapter contract.
  // sinceIso → lookback_days (round up). The original default was 30 days.
  const sinceIso = opts.sinceIso;
  const lookbackDays = sinceIso
    ? Math.max(
        1,
        Math.ceil((Date.now() - new Date(sinceIso).getTime()) / (24 * 60 * 60 * 1000)),
      )
    : 30;

  const cfg: SitemapAdapterConfig = {
    ...ANTHROPIC_CONFIG,
    ...(opts.sitemapUrl ? { sitemap_url: opts.sitemapUrl } : {}),
    lookback_days: lookbackDays,
    max_per_run: opts.maxArticles ?? 20,
  };

  const r: RunSitemapAdapterResult = await runSitemapAdapter({
    scope: opts.scope,
    sourceKey: "anthropic-news",
    config: cfg,
    ignoreLookback: false,
  });

  return {
    ingested: r.ingested,
    duplicates: r.skipped_count,
    considered: r.considered,
    fetched: r.fetched,
    ingestedIds: r.ingestedIds,
  };
}
