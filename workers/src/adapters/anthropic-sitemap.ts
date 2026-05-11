// Anthropic news ingest via official sitemap + per-article og: meta tags.
//
// Anthropic does not publish an official RSS feed. Their sitemap at
// https://www.anthropic.com/sitemap.xml is the official discovery path —
// flat <urlset> with ~700 URLs including all /news/* entries with lastmod
// timestamps.
//
// Approach (Atomize-aligned, but simpler):
//   1. GET sitemap.xml → parse for /news/* URLs
//   2. Filter to URLs with lastmod >= cutoff (default: last 30 days)
//   3. For each new URL, fetch the article page
//   4. Extract title / description / published_time from og: meta tags
//      (Anthropic pages are server-rendered Next.js — meta tags are in the
//      raw HTML; no JS execution needed)
//   5. INSERT into corpus_documents with source_type='anthropic-news'
//
// Rate limiting: 1 req/sec per host (Atomize convention from
// lib/scraping-rate-limiter.ts). Simple sleep between fetches; pg-boss
// already serializes this job to batchSize=1.
//
// Dedup: UNIQUE(source_type, source_id, scope) on corpus_documents.
// source_id is the URL slug (e.g., 'claude-4', 'model-context-protocol').
import { createHash } from "node:crypto";
import { getPool } from "../db.js";

const UA =
  "decision-doctor-workers/0.1 (+https://github.com/tyroneross/decision-doctor-cc; contact: tyrone.ross@gmail.com)";

const SITEMAP_URL = "https://www.anthropic.com/sitemap.xml";

interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

interface ArticleMeta {
  url: string;
  slug: string;
  title: string;
  description: string;
  publishedTime: string | null;
  /** Sitemap lastmod, used as fallback for published date if og:published_time is absent. */
  lastmod: string | null;
}

function pullTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() ?? null;
}

/** Pull og:* or other meta-tag content attributes from raw HTML. */
function pullMeta(html: string, property: string): string | null {
  // Try property="..." (Open Graph) and name="..." (Twitter/standard) forms.
  // Anthropic uses og: properties.
  for (const attr of ["property", "name"]) {
    const re = new RegExp(
      `<meta\\s+(?:[^>]*\\s+)?${attr}=["']${property}["']\\s+[^>]*content=["']([^"']*)["']`,
      "i",
    );
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
    // Also try content first, then property/name (HTML attribute order flips)
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

function parseSitemap(xml: string): SitemapEntry[] {
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

function extractSlug(url: string): string {
  const m = url.match(/\/news\/([^/?#]+)/i);
  return m?.[1] ?? url;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Fetch one Anthropic article page and extract title + description from og: meta. */
async function fetchArticleMeta(
  url: string,
  lastmod: string | null,
): Promise<ArticleMeta | null> {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    console.warn(
      `[anthropic-sitemap] article ${url} → ${resp.status}; skipping`,
    );
    return null;
  }
  const html = await resp.text();
  const ogTitle = pullMeta(html, "og:title");
  const ogDescription = pullMeta(html, "og:description");
  const ogPublished =
    pullMeta(html, "article:published_time") ??
    pullMeta(html, "og:published_time");

  // Fall back to <title> if og:title is missing (rare for Anthropic but be safe).
  const titleTag = pullTag(html, "title");
  const title = ogTitle ?? titleTag;
  if (!title) {
    console.warn(`[anthropic-sitemap] no title for ${url}; skipping`);
    return null;
  }
  return {
    url,
    slug: extractSlug(url),
    title: decodeHtmlEntities(title),
    description: ogDescription ? decodeHtmlEntities(ogDescription) : "",
    publishedTime: ogPublished,
    lastmod,
  };
}

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

export async function fetchAnthropicNews(
  opts: FetchAnthropicOptions,
): Promise<FetchAnthropicResult> {
  const sitemapUrl = opts.sitemapUrl ?? SITEMAP_URL;
  const since = opts.sinceIso
    ? new Date(opts.sinceIso)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const maxArticles = opts.maxArticles ?? 20;

  // Step 1: fetch sitemap
  const sitemapResp = await fetch(sitemapUrl, {
    headers: { "User-Agent": UA },
  });
  if (!sitemapResp.ok) {
    throw new Error(
      `Sitemap fetch ${sitemapUrl} → ${sitemapResp.status}`,
    );
  }
  const sitemapXml = await sitemapResp.text();
  const allEntries = parseSitemap(sitemapXml);

  // Step 2: filter to /news/* with recent lastmod
  const newsCandidates = allEntries
    .filter((e) => /\/news\/[^/]+/.test(e.loc))
    .filter((e) => {
      if (!e.lastmod) return true; // include if no lastmod (be lenient)
      return new Date(e.lastmod) >= since;
    })
    // Sort newest-first by lastmod
    .sort((a, b) => {
      const ad = a.lastmod ? new Date(a.lastmod).getTime() : 0;
      const bd = b.lastmod ? new Date(b.lastmod).getTime() : 0;
      return bd - ad;
    })
    .slice(0, maxArticles);

  const considered = newsCandidates.length;
  if (considered === 0) {
    return {
      ingested: 0,
      duplicates: 0,
      considered: 0,
      fetched: 0,
      ingestedIds: [],
    };
  }

  // Step 3: pre-filter duplicates BEFORE fetching to save HTTP requests
  const pool = getPool();
  const existingClient = await pool.connect();
  let needFetch: SitemapEntry[];
  try {
    await existingClient.query("BEGIN");
    await existingClient.query(
      "SELECT set_config('app.current_user_id', $1, true)",
      [opts.scope],
    );
    const slugs = newsCandidates.map((e) => extractSlug(e.loc));
    const existing = await existingClient.query<{ source_id: string }>(
      `SELECT source_id FROM corpus_documents
         WHERE source_type = 'anthropic-news'
           AND scope = $1
           AND source_id = ANY($2::text[])`,
      [opts.scope, slugs],
    );
    await existingClient.query("COMMIT");
    const existingSet = new Set(existing.rows.map((r) => r.source_id));
    needFetch = newsCandidates.filter(
      (e) => !existingSet.has(extractSlug(e.loc)),
    );
  } finally {
    existingClient.release();
  }

  // Step 4: fetch each new article, extract meta, INSERT. 1 req/sec rate limit.
  const ingestedIds: string[] = [];
  let ingested = 0;
  let fetched = 0;

  for (const entry of needFetch) {
    const meta = await fetchArticleMeta(entry.loc, entry.lastmod);
    fetched++;
    if (!meta) {
      await sleep(1000);
      continue;
    }

    const body = meta.description || meta.title;
    const contentHash = sha256(body);
    const metadata = {
      lastmod: meta.lastmod,
      og_published_time: meta.publishedTime,
    };
    const publishedAt =
      meta.publishedTime ?? meta.lastmod ?? null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [opts.scope],
      );
      const r = await client.query(
        `INSERT INTO corpus_documents
           (scope, source_type, source_id, source_url, title, body, content_hash, published_at, metadata)
         VALUES
           ($1,    $2,          $3,        $4,         $5,    $6,   $7,           $8,           $9::jsonb)
         ON CONFLICT (source_type, source_id, scope) DO NOTHING
         RETURNING id`,
        [
          opts.scope,
          "anthropic-news",
          meta.slug,
          meta.url,
          meta.title,
          body,
          contentHash,
          publishedAt,
          JSON.stringify(metadata),
        ],
      );
      await client.query("COMMIT");
      if (r.rowCount && r.rowCount > 0) {
        ingested++;
        const id = r.rows[0]?.id as string | undefined;
        if (id) ingestedIds.push(id);
      }
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`[anthropic-sitemap] insert failed for ${meta.url}:`, e);
    } finally {
      client.release();
    }

    // Rate limit: 1 req/sec between article fetches.
    await sleep(1000);
  }

  return {
    ingested,
    duplicates: considered - needFetch.length,
    considered,
    fetched,
    ingestedIds,
  };
}
