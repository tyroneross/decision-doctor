// arXiv ingest adapter.
//
// Fetches papers via the arXiv export API (Atom 1.0 XML feed) and inserts
// new rows into corpus_documents. The dedupe key is
// UNIQUE(source_type, source_id, scope), so re-running the same query is safe.
//
// API ref: https://info.arxiv.org/help/api/user-manual.html
// Rate limit: arXiv asks for ≤1 request per 3 seconds. We respect this by
// only ever invoking this adapter from within a pg-boss job — schedule
// concurrency is bounded by pg-boss's batchSize=1 in queue.ts.
//
// Embedding pass: this adapter inserts documents only. A follow-up job
// ("arxiv-embed", not yet wired) chunks + embeds each new document. F-30
// will define that handler; for the minimum proof-of-pattern we just confirm
// ingest-and-dedupe.
import { createHash } from "node:crypto";
import { getPool } from "../db.js";

interface ArxivEntry {
  id: string;          // full URL, e.g. http://arxiv.org/abs/2310.06825v1
  title: string;
  summary: string;     // abstract
  published: string;   // ISO 8601
  updated: string;
  authors: string[];
  primaryCategory: string | null;
}

const UA =
  "decision-doctor-workers/0.1 (+https://github.com/tyroneross/decision-doctor-cc)";

/**
 * Extract a single value from an Atom <entry> by tag name. Returns first match.
 * The arXiv feed is well-formed XML; a regex pull is acceptable here because
 * the schema is stable and we don't need to handle arbitrary namespaces.
 */
function pullTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  return m[1]?.trim() ?? null;
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

function pullAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s+[^>]*)?\\s+${attr}="([^"]+)"`, "i");
  const m = xml.match(re);
  return m?.[1] ?? null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // collapse arXiv's hard-wrapped abstracts (\n followed by spaces)
    .replace(/\s+/g, " ")
    .trim();
}

function parseEntries(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  // Split on <entry> ... </entry>
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1]!;
    const idUrl = pullTag(body, "id");
    const title = pullTag(body, "title");
    const summary = pullTag(body, "summary");
    const published = pullTag(body, "published");
    const updated = pullTag(body, "updated");
    if (!idUrl || !title || !summary || !published) continue;
    // Authors are nested <author><name>X</name></author>
    const authorBlocks = pullAllTags(body, "author");
    const authors = authorBlocks
      .map((b) => pullTag(b, "name"))
      .filter((n): n is string => !!n);
    const primary = pullAttr(body, "arxiv:primary_category", "term");
    entries.push({
      id: idUrl,
      title: decodeXml(title),
      summary: decodeXml(summary),
      published,
      updated: updated ?? published,
      authors,
      primaryCategory: primary,
    });
  }
  return entries;
}

/**
 * Extract the canonical arXiv ID (e.g. "2310.06825") from the entry's id URL.
 * The URL ends with .../abs/<id>vN where vN is the version suffix; we strip it.
 */
function extractArxivId(idUrl: string): string {
  const m = idUrl.match(/\/abs\/([^/]+?)(?:v\d+)?$/i);
  return m?.[1] ?? idUrl;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface FetchArxivOptions {
  query: string;
  scope: string;       // 'global' or user_id
  maxResults?: number;
}

export interface FetchArxivResult {
  ingested: number;
  duplicates: number;
  fetched: number;
  query: string;
  /** UUIDs of newly-inserted corpus_documents rows (empty array on full-dedupe runs). */
  ingestedIds: string[];
}

export async function fetchArxivQuery(
  opts: FetchArxivOptions,
): Promise<FetchArxivResult> {
  const maxResults = opts.maxResults ?? 25;
  const url =
    "https://export.arxiv.org/api/query?" +
    `search_query=${encodeURIComponent(opts.query)}` +
    `&max_results=${maxResults}` +
    "&sortBy=submittedDate&sortOrder=descending";

  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`arXiv API ${resp.status}: ${await resp.text()}`);
  }
  const xml = await resp.text();
  const entries = parseEntries(xml);

  if (entries.length === 0) {
    return { ingested: 0, duplicates: 0, fetched: 0, query: opts.query, ingestedIds: [] };
  }

  // Bulk insert with ON CONFLICT DO NOTHING. The UNIQUE constraint is
  // (source_type, source_id, scope) — re-runs are no-ops.
  const pool = getPool();
  const client = await pool.connect();
  let ingested = 0;
  const ingestedIds: string[] = [];
  try {
    await client.query("BEGIN");
    // Set the GUC so the scope_write policy passes when scope='global'.
    // RLS: scope = 'global' OR scope = current_setting('app.current_user_id', true)
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true)",
      [opts.scope],
    );

    for (const e of entries) {
      const arxivId = extractArxivId(e.id);
      const body = e.summary;
      const contentHash = sha256(body);
      const metadata = {
        authors: e.authors,
        primary_category: e.primaryCategory,
        updated: e.updated,
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
          "arxiv",
          arxivId,
          e.id,
          e.title,
          body,
          contentHash,
          e.published,
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
    duplicates: entries.length - ingested,
    fetched: entries.length,
    query: opts.query,
    ingestedIds,
  };
}
