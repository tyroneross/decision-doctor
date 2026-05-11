// Generic config-driven sitemap adapter.
//
// Behavior driven by ai_sources.crawl_config (or an in-process SitemapAdapterConfig
// for tests). The original anthropic-sitemap.ts is now a thin wrapper that
// calls runSitemapAdapter() with the canonical Anthropic config (preserves the
// existing cron + tests + corpus rows on source_type='anthropic-news').
//
// crawl_config schema (read from ai_sources.crawl_config JSONB):
//   discovery        : ["sitemap"]                  -- routing tag (informational here)
//   sitemap_url      : string                       -- entry URL
//   url_filter       : string[]                      -- regex array, OR-joined; empty/missing = match-all
//   sitemap_index    : boolean                       -- if true, recurse one level (cap at 3 child sitemaps)
//   rate_limit_ms    : number                        -- sleep between article fetches (default 1000)
//   content_type     : "docs" | "article" | "paper" -- routing hint stored on metadata
//   category         : string                        -- categorical label written to metadata
//   render_fallback  : boolean                       -- if true AND extracted body < 200 chars, retry via CDP
//   lookback_days    : number                        -- only URLs with lastmod >= now - N days; full-history backfill ignores via opts override
//   max_per_run      : number                        -- soft cap on URLs processed per fire
//
// Insert path: corpus_documents (scope, source_type, source_id, ...)
// source_type   = sourceKey (matches ai_sources.source_key)
// source_id     = stable slug derived from URL path; collisions fall through ON CONFLICT
// content_hash  = sha256(body)
// metadata      = { lastmod, category, content_type, sitemap_origin, extraction_method }
//
// Idempotency:
//   1. Pre-filter URLs whose slug already exists for (source_type, scope) — saves HTTP.
//   2. INSERT … ON CONFLICT (source_type, source_id, scope) DO NOTHING — second-line.
//   3. Per-doc INSERT runs in its own transaction so a single failure can't lose the batch.
//
// Returns enqueued (newly inserted ids), skipped_count, errors[] — matches the
// FetchAnthropicResult shape callers depend on.
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { getPool } from "../db.js";
import { extractRenderedHtml } from "../cdp/extract-content.js";

const UA =
  "decision-doctor-workers/0.1 (+https://github.com/tyroneross/decision-doctor-cc; contact: tyrone.ross@gmail.com)";

const SITEMAP_FETCH_TIMEOUT_MS = 15_000;
const ARTICLE_FETCH_TIMEOUT_MS = 15_000;
const RENDER_FALLBACK_MIN_BODY = 200;
const MAX_CHILD_SITEMAPS = 3;

export interface SitemapAdapterConfig {
  /** Sitemap entry URL. */
  sitemap_url: string;
  /** OR-joined regex filter. Empty or missing = match all URLs. */
  url_filter?: string[];
  /** If the sitemap is a <sitemapindex>, recurse one level. Default false. */
  sitemap_index?: boolean;
  /** Sleep between article fetches in ms. Default 1000. */
  rate_limit_ms?: number;
  /** Routing label written to metadata.content_type. */
  content_type?: "docs" | "article" | "paper" | string;
  /** Categorical label written to metadata.category. */
  category?: string;
  /** Retry CDP fetch if cheerio body < 200 chars. Default false. */
  render_fallback?: boolean;
  /** Lookback in days; URLs older than cutoff are skipped. 0 or missing = no filter (backfill mode). */
  lookback_days?: number;
  /** Soft cap on URLs processed per run. Default 50. */
  max_per_run?: number;
  /**
   * If set, the slug used as corpus_documents.source_id is the URL path with
   * this prefix stripped (single leading prefix). Allows wrappers to preserve
   * legacy slug shapes — e.g. anthropic-news has historic slugs like
   * 'claude-4' (no 'news/' prefix), so its wrapper passes slug_strip_prefix:'news/'.
   * Falls back to the full path when the prefix doesn't match.
   */
  slug_strip_prefix?: string;
}

export interface RunSitemapAdapterOptions {
  /** Scope for RLS (typically 'global'). */
  scope: string;
  /** source_type label written to corpus_documents.source_type — matches ai_sources.source_key. */
  sourceKey: string;
  /** crawl_config-shaped behavior. */
  config: SitemapAdapterConfig;
  /** Override max_per_run from the caller (used by historical backfill CLI). */
  maxOverride?: number;
  /** Set to true to ignore lookback_days entirely. */
  ignoreLookback?: boolean;
}

export interface RunSitemapAdapterResult {
  /** source_key the adapter ran against. */
  sourceKey: string;
  /** Newly-inserted corpus_documents UUIDs (caller chains content-extract / embed). */
  ingestedIds: string[];
  /** Number of URLs newly inserted. */
  ingested: number;
  /** Number of URLs skipped because they already existed in corpus_documents. */
  skipped_count: number;
  /** Total URLs considered after filtering. */
  considered: number;
  /** Total URLs we actually issued GET for. */
  fetched: number;
  /** Non-fatal per-URL error messages (truncated). */
  errors: string[];
}

interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

function pullTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() ?? null;
}

function pullMeta(html: string, property: string): string | null {
  for (const attr of ["property", "name"]) {
    const re = new RegExp(
      `<meta\\s+(?:[^>]*\\s+)?${attr}=["']${property}["']\\s+[^>]*content=["']([^"']*)["']`,
      "i",
    );
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
    const re2 = new RegExp(
      `<meta\\s+(?:[^>]*\\s+)?content=["']([^"']*)["']\\s+[^>]*${attr}=["']${property}["']`,
      "i",
    );
    const m2 = html.match(re2);
    if (m2?.[1]) return m2[1].trim();
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .trim();
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Fetch URL with timeout + UA. Returns null on non-200. */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<{ ok: true; text: string } | { ok: false; status: number; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status };
    }
    const text = await resp.text();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

/** Parse a flat <urlset> sitemap. */
export function parseUrlset(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const re = /<url>([\s\S]*?)<\/url>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1]!;
    const loc = pullTag(body, "loc");
    const lastmod = pullTag(body, "lastmod");
    if (!loc) continue;
    entries.push({ loc, lastmod });
  }
  return entries;
}

/** Parse a <sitemapindex> sitemap, returning the child sitemap URLs (no lastmod tracking here). */
export function parseSitemapIndex(xml: string): string[] {
  const urls: string[] = [];
  const re = /<sitemap>([\s\S]*?)<\/sitemap>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1]!;
    const loc = pullTag(body, "loc");
    if (loc) urls.push(loc);
  }
  return urls;
}

/** Detect if XML is a sitemap-index (has <sitemapindex>) vs a flat urlset. */
function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * Derive a stable slug from a URL path. Falls back to the full URL if the path
 * is empty (e.g. https://example.com/).
 * Examples:
 *   https://www.anthropic.com/news/claude-4         → news/claude-4
 *   https://platform.claude.com/docs/en/build-with  → docs/en/build-with
 *   https://mistral.ai/news/codestral-25-01         → news/codestral-25-01
 */
export function deriveSlug(url: string, stripPrefix?: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/^\/+|\/+$/g, "");
    if (stripPrefix) {
      const norm = stripPrefix.replace(/^\/+|\/+$/g, "") + "/";
      if (path.startsWith(norm)) {
        path = path.slice(norm.length);
      }
    }
    return path.length > 0 ? path : url;
  } catch {
    return url;
  }
}

/** Extract readable text from article HTML. */
function extractArticleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, noscript").remove();
  for (const sel of ["article", "main", "body"]) {
    const el = $(sel).first();
    if (el.length > 0) {
      const txt = el.text().replace(/\s+/g, " ").trim();
      if (txt.length > 0) return txt;
    }
  }
  return "";
}

interface ArticleMeta {
  url: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  publishedTime: string | null;
  lastmod: string | null;
  extractionMethod: "cheerio_article" | "og_description" | "cdp_rendered" | "title_only";
}

/** Fetch one article URL and extract title/description/body. */
async function fetchArticle(
  url: string,
  lastmod: string | null,
  renderFallback: boolean,
  slugStripPrefix: string | undefined,
): Promise<ArticleMeta | null> {
  const got = await fetchWithTimeout(url, ARTICLE_FETCH_TIMEOUT_MS);
  if (!got.ok) {
    return null;
  }
  const html = got.text;

  const ogTitle = pullMeta(html, "og:title");
  const ogDescription = pullMeta(html, "og:description") ?? "";
  const ogPublished =
    pullMeta(html, "article:published_time") ?? pullMeta(html, "og:published_time");
  const titleTag = pullTag(html, "title");
  const title = decodeHtmlEntities(ogTitle ?? titleTag ?? "");
  if (!title) {
    return null;
  }

  // Body candidates, in priority order:
  //   1. cheerio article/main/body extraction
  //   2. og:description
  //   3. CDP render fallback if render_fallback=true and (1)+(2) too short
  let body = extractArticleText(html);
  let method: ArticleMeta["extractionMethod"] = "cheerio_article";

  if (body.length < RENDER_FALLBACK_MIN_BODY) {
    // Pre-CDP, prefer og:description over the article tag if og is longer.
    if (ogDescription.length > body.length) {
      body = decodeHtmlEntities(ogDescription);
      method = "og_description";
    }
    if (renderFallback && body.length < RENDER_FALLBACK_MIN_BODY) {
      try {
        const rendered = await extractRenderedHtml(url);
        const cdpBody = extractArticleText(rendered);
        if (cdpBody.length > body.length) {
          body = cdpBody;
          method = "cdp_rendered";
        }
      } catch {
        // CDP failure tolerated — fall through with whatever body we have.
      }
    }
  }

  if (!body) {
    body = title;
    method = "title_only";
  }

  return {
    url,
    slug: deriveSlug(url, slugStripPrefix),
    title,
    description: decodeHtmlEntities(ogDescription),
    body,
    publishedTime: ogPublished,
    lastmod,
    extractionMethod: method,
  };
}

/** OR-join the regex array; empty array = match-all. */
function buildFilterFn(patterns: string[] | undefined): (url: string) => boolean {
  if (!patterns || patterns.length === 0) {
    return () => true;
  }
  const compiled: RegExp[] = [];
  for (const p of patterns) {
    try {
      compiled.push(new RegExp(p));
    } catch (e) {
      console.warn(`[sitemap-adapter] invalid regex skipped: ${p} — ${(e as Error).message}`);
    }
  }
  if (compiled.length === 0) {
    return () => true;
  }
  return (url: string) => compiled.some((re) => re.test(url));
}

/** Resolve a flat list of <urlset> entries from a sitemap_url, recursing once for sitemap-index. */
async function resolveEntries(
  sitemapUrl: string,
  isIndex: boolean,
): Promise<{ entries: SitemapEntry[]; errors: string[] }> {
  const errors: string[] = [];
  const got = await fetchWithTimeout(sitemapUrl, SITEMAP_FETCH_TIMEOUT_MS);
  if (!got.ok) {
    return {
      entries: [],
      errors: [`sitemap ${sitemapUrl} → status ${got.status}${got.error ? ` (${got.error})` : ""}`],
    };
  }
  const xml = got.text;

  // Auto-detect index even if config didn't claim one.
  if (isIndex || isSitemapIndex(xml)) {
    const children = parseSitemapIndex(xml).slice(0, MAX_CHILD_SITEMAPS);
    if (children.length === 0) {
      // Maybe the caller set sitemap_index:true but it's actually a flat urlset.
      const flat = parseUrlset(xml);
      return { entries: flat, errors };
    }
    const all: SitemapEntry[] = [];
    for (const child of children) {
      const childGot = await fetchWithTimeout(child, SITEMAP_FETCH_TIMEOUT_MS);
      if (!childGot.ok) {
        errors.push(`child sitemap ${child} → status ${childGot.status}`);
        continue;
      }
      all.push(...parseUrlset(childGot.text));
    }
    return { entries: all, errors };
  }

  return { entries: parseUrlset(xml), errors };
}

/**
 * Run the generalized sitemap adapter against a single source.
 *
 * Caller (queue handler) typically uses the source's crawl_config verbatim;
 * the historical backfill CLI passes ignoreLookback + maxOverride for full-history pulls.
 */
export async function runSitemapAdapter(
  opts: RunSitemapAdapterOptions,
): Promise<RunSitemapAdapterResult> {
  const cfg = opts.config;
  const rateLimit = Math.max(0, cfg.rate_limit_ms ?? 1000);
  const renderFallback = cfg.render_fallback === true;
  const maxPerRun = opts.maxOverride ?? cfg.max_per_run ?? 50;
  const lookbackDays = opts.ignoreLookback ? 0 : (cfg.lookback_days ?? 0);
  const cutoff =
    lookbackDays > 0 ? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000) : null;
  const matchUrl = buildFilterFn(cfg.url_filter);

  const errors: string[] = [];

  // Step 1: discover URLs.
  const { entries, errors: discoveryErrors } = await resolveEntries(
    cfg.sitemap_url,
    cfg.sitemap_index === true,
  );
  errors.push(...discoveryErrors);

  if (entries.length === 0) {
    return {
      sourceKey: opts.sourceKey,
      ingestedIds: [],
      ingested: 0,
      skipped_count: 0,
      considered: 0,
      fetched: 0,
      errors,
    };
  }

  // Step 2: filter + sort newest-first + cap.
  const filtered = entries
    .filter((e) => matchUrl(e.loc))
    .filter((e) => {
      if (!cutoff || !e.lastmod) return true;
      const d = new Date(e.lastmod);
      if (Number.isNaN(d.getTime())) return true;
      return d >= cutoff;
    })
    .sort((a, b) => {
      const ad = a.lastmod ? new Date(a.lastmod).getTime() : 0;
      const bd = b.lastmod ? new Date(b.lastmod).getTime() : 0;
      return bd - ad;
    })
    .slice(0, maxPerRun);

  const considered = filtered.length;
  if (considered === 0) {
    return {
      sourceKey: opts.sourceKey,
      ingestedIds: [],
      ingested: 0,
      skipped_count: 0,
      considered: 0,
      fetched: 0,
      errors,
    };
  }

  // Step 3: pre-filter URLs whose slug already exists for this source — saves HTTP.
  const pool = getPool();
  const preClient = await pool.connect();
  let needFetch: SitemapEntry[];
  try {
    await preClient.query("BEGIN");
    await preClient.query("SELECT set_config('app.current_user_id', $1, true)", [opts.scope]);
    const slugs = filtered.map((e) => deriveSlug(e.loc, cfg.slug_strip_prefix));
    const existing = await preClient.query<{ source_id: string }>(
      `SELECT source_id FROM corpus_documents
         WHERE source_type = $1
           AND scope = $2
           AND source_id = ANY($3::text[])`,
      [opts.sourceKey, opts.scope, slugs],
    );
    await preClient.query("COMMIT");
    const existingSet = new Set(existing.rows.map((r) => r.source_id));
    needFetch = filtered.filter(
      (e) => !existingSet.has(deriveSlug(e.loc, cfg.slug_strip_prefix)),
    );
  } catch (e) {
    await preClient.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    preClient.release();
  }

  // Step 4: fetch + INSERT per URL with rate limiting.
  const ingestedIds: string[] = [];
  let ingested = 0;
  let fetched = 0;

  for (const entry of needFetch) {
    if (rateLimit > 0 && fetched > 0) {
      await sleep(rateLimit);
    }
    const meta = await fetchArticle(
      entry.loc,
      entry.lastmod,
      renderFallback,
      cfg.slug_strip_prefix,
    );
    fetched++;
    if (!meta) {
      errors.push(`article ${entry.loc} → fetch/parse failed`);
      continue;
    }

    const contentHash = sha256(meta.body);
    const metadata: Record<string, unknown> = {
      lastmod: meta.lastmod,
      og_published_time: meta.publishedTime,
      category: cfg.category ?? null,
      content_type: cfg.content_type ?? null,
      sitemap_origin: cfg.sitemap_url,
      extraction_method: meta.extractionMethod,
    };
    const publishedAt = meta.publishedTime ?? meta.lastmod ?? null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [opts.scope]);
      const r = await client.query<{ id: string }>(
        `INSERT INTO corpus_documents
           (scope, source_type, source_id, source_url, title, body, content_hash, published_at, metadata)
         VALUES
           ($1,    $2,          $3,        $4,         $5,    $6,   $7,           $8,           $9::jsonb)
         ON CONFLICT (source_type, source_id, scope) DO NOTHING
         RETURNING id`,
        [
          opts.scope,
          opts.sourceKey,
          meta.slug,
          meta.url,
          meta.title,
          meta.body,
          contentHash,
          publishedAt,
          JSON.stringify(metadata),
        ],
      );
      await client.query("COMMIT");
      if (r.rowCount && r.rowCount > 0 && r.rows[0]?.id) {
        ingested++;
        ingestedIds.push(r.rows[0].id);
      }
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      errors.push(`insert ${meta.url} → ${(e as Error).message}`.slice(0, 240));
    } finally {
      client.release();
    }
  }

  return {
    sourceKey: opts.sourceKey,
    ingestedIds,
    ingested,
    skipped_count: considered - needFetch.length,
    considered,
    fetched,
    errors,
  };
}
