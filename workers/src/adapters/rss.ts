// Generic RSS 2.0 ingest adapter.
//
// Used today by:
//   • openai-news (https://openai.com/news/rss.xml) — official RSS 2.0
// Extensible to any other source that publishes a standard RSS 2.0 feed.
// For Atom feeds (arXiv) see adapters/arxiv.ts; for sitemap-only sources
// (Anthropic) see adapters/anthropic-sitemap.ts.
//
// Atomize precedent: lib/web-scrapers/ (much larger surface — sitemap, HTML,
// robots.txt, Perplexity fallback). We're starting tight: only RSS here, only
// the metadata level (no per-article full-content fetch). F-31 can extend
// when search recall needs full body text.
//
// Dedup is via the corpus_documents UNIQUE(source_type, source_id, scope)
// constraint. source_id is the `<guid>` (preferred) or falls back to `<link>`.
import { createHash } from "node:crypto";
import { getPool } from "../db.js";

const UA =
  "decision-doctor-workers/0.1 (+https://github.com/tyroneross/decision-doctor-cc; contact: tyrone.ross@gmail.com)";

export interface RssItem {
  guid: string;
  link: string;
  title: string;
  description: string;
  pubDate: string | null;
  categories: string[];
}

/** Pull text between <tag>…</tag> from a string. First match. */
function pullTag(xml: string, tag: string): string | null {
  // Tolerate attributes on the open tag (e.g. `<title type="text">`)
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() ?? null;
}

function pullAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1]) out.push(m[1].trim());
  }
  return out;
}

/**
 * Strip CDATA wrapper and decode HTML entities. RSS commonly embeds
 * descriptions inside `<![CDATA[…]]>`.
 */
function decodeRssText(s: string): string {
  return s
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "") // strip HTML tags from descriptions
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse an RSS 2.0 channel into items. */
export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1]!;
    const link = pullTag(body, "link");
    const title = pullTag(body, "title");
    const description = pullTag(body, "description") ?? "";
    const pubDate = pullTag(body, "pubDate");
    const guidRaw = pullTag(body, "guid") ?? link;
    const categories = pullAllTags(body, "category").map(decodeRssText);
    if (!link || !title || !guidRaw) continue;
    items.push({
      guid: decodeRssText(guidRaw),
      link: decodeRssText(link),
      title: decodeRssText(title),
      description: decodeRssText(description),
      pubDate,
      categories,
    });
  }
  return items;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface FetchRssOptions {
  /** Feed URL. */
  url: string;
  /** Source type label written to corpus_documents.source_type. */
  sourceType: string;
  /** Scope: 'global' for shared corpus, user_id::text for private. */
  scope: string;
  /** Cap on items pulled per fetch (default: all). */
  maxItems?: number;
}

export interface FetchRssResult {
  ingested: number;
  duplicates: number;
  fetched: number;
  url: string;
  sourceType: string;
  ingestedIds: string[];
}

/**
 * Fetch an RSS 2.0 feed and INSERT new items into corpus_documents.
 * Returns the UUIDs of newly-ingested rows so the caller can chain
 * embedding jobs (mirrors arxiv.ts).
 */
export async function fetchRssFeed(
  opts: FetchRssOptions,
): Promise<FetchRssResult> {
  const resp = await fetch(opts.url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(
      `RSS fetch ${opts.url} → ${resp.status}: ${await resp.text()}`,
    );
  }
  const xml = await resp.text();
  let items = parseRssItems(xml);
  if (opts.maxItems !== undefined && items.length > opts.maxItems) {
    items = items.slice(0, opts.maxItems);
  }

  if (items.length === 0) {
    return {
      ingested: 0,
      duplicates: 0,
      fetched: 0,
      url: opts.url,
      sourceType: opts.sourceType,
      ingestedIds: [],
    };
  }

  const pool = getPool();
  const client = await pool.connect();
  let ingested = 0;
  const ingestedIds: string[] = [];
  try {
    await client.query("BEGIN");
    // Set the GUC so the scope_write RLS policy passes when scope='global'.
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true)",
      [opts.scope],
    );

    for (const it of items) {
      // Use guid as the stable source_id; fall back to link if guid was
      // missing (parseRssItems already substituted link if guid absent).
      const sourceId = it.guid;
      const body = it.description || it.title;
      const contentHash = sha256(body);
      const metadata = {
        link: it.link,
        categories: it.categories,
        pubDate: it.pubDate,
      };
      const r = await client.query(
        `INSERT INTO corpus_documents
           (scope, source_type, source_id, source_url, title, body, content_hash, published_at, metadata)
         VALUES
           ($1,    $2,          $3,        $4,         $5,    $6,   $7,           $8,           $9::jsonb)
         ON CONFLICT (source_type, source_id, scope) DO NOTHING
         RETURNING id`,
        [
          opts.scope,
          opts.sourceType,
          sourceId,
          it.link,
          it.title,
          body,
          contentHash,
          it.pubDate ? new Date(it.pubDate) : null,
          JSON.stringify(metadata),
        ],
      );
      if (r.rowCount && r.rowCount > 0) {
        ingested++;
        const id = r.rows[0]?.id as string | undefined;
        if (id) ingestedIds.push(id);
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  return {
    ingested,
    duplicates: items.length - ingested,
    fetched: items.length,
    url: opts.url,
    sourceType: opts.sourceType,
    ingestedIds,
  };
}
