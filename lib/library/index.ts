// lib/library/index.ts — V2 L2: DB-backed library retrieval module.
//
// All functions run through runWithActor/withActor so RLS auto-applies:
//   - scope='global' rows visible to all actors (curated content).
//   - scope=user_id rows visible only to that user (saved/promoted artifacts).
// Guests call with synthetic UUID (00000000-...) matching /api/search pattern.
//
// Hardening:
//   - Item 9c: OR-quorum fallback — bare websearch_to_tsquery on >4 tokens
//     returns zero rows. We retry with to_tsquery + | operators.
//   - Item 12: pain_path / starting_level enum values match 0007_library.sql CHECK constraints.
//   - Item 9f: search_tsv already includes title+body in the migration (STORED GENERATED).

import "server-only";
import { sql } from "drizzle-orm";
import {
  libraryUseCases,
  libraryPrompts,
  librarySkills,
  libraryPlugins,
  librarySavedSearches,
  librarySavedResponses,
  type PainPath,
  type StartingLevel,
  type LibraryUseCase,
  type LibraryPrompt,
  type LibrarySkill,
  type LibraryPlugin,
  type LibrarySavedSearch,
  type LibrarySavedResponse,
  type NewLibraryUseCase,
} from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { and, desc, eq, or } from "drizzle-orm";
import { type BodyKind, normalizeBodyKind } from "@/lib/corpus/body-kind";
import { GUEST_TENANT_ID, GUEST_USER_ID } from "@/lib/guest-identity";

// ---- Public type exports ----------------------------------------------------

export type LibraryKind =
  | "use_case"
  | "prompt"
  | "skill"
  | "plugin"
  | "corpus"
  | "kb_article"
  | "saved_search"
  | "saved_response";

/** Captured filter state when a search was pinned. */
export interface SavedSearchPayload {
  query: string;
  kindFilter: string[];
  pathFilter: string[];
  onlyMine: boolean;
  name: string | null;
  createdAt: string;
}

/** Citation record matching components/qa/CitationList QACitation. */
export interface SavedResponseCitation {
  uuid: string;
  kind: "use_case" | "prompt" | "skill" | "plugin" | "corpus";
  title: string;
}

/** Captured /app/ask answer when a response was pinned. */
export interface SavedResponsePayload {
  question: string;
  answer: string;
  citations: SavedResponseCitation[];
  wasGrounded: boolean;
  createdAt: string;
}

export interface LibraryHit {
  kind: LibraryKind;
  id: string;
  title: string;
  snippet: string;
  score: number;
  source_path?: PainPath;
  library_id?: string;
  corpus_doc_id?: string;
  /**
   * KB-only: the article slug. Present only when kind === 'kb_article'.
   * UI uses this to link to /app/learn/<slug>.
   */
  slug?: string;
  /**
   * V2 trust-tier for corpus hits (kind === 'corpus'). Library kinds and KB
   * articles leave this undefined — they are user-curated and treated as full-text.
   * NULL on a corpus hit = pre-backfill row, treated as `full_text` for
   * back-compat. `blocked` / `degraded` rows are filtered before hydration.
   * `metadata_only` rows may appear as title-only discovery results with a badge.
   */
  body_kind?: BodyKind | null;
  /** Present only when kind === 'saved_search'. Re-apply payload. */
  saved_search?: SavedSearchPayload;
  /** Present only when kind === 'saved_response'. Renderable answer payload. */
  saved_response?: SavedResponsePayload;
}

export type { PainPath, StartingLevel };

// Re-export DB row types for callers that only need the retrieval module.
export type {
  LibraryUseCase,
  LibraryPrompt,
  LibrarySkill,
  LibraryPlugin,
  LibrarySavedSearch,
  LibrarySavedResponse,
};

// ---- Insert input types (minimal required fields) ---------------------------

export interface NewUseCase {
  scope: string; // 'global' or user_id
  painPath: PainPath;
  startingLevel: StartingLevel;
  title: string;
  body: string;
  rationale?: string;
  estimatedMinutesSavedPerWeek?: number;
  metadata?: Record<string, unknown>;
}

export interface SkillPayload {
  scope: string;
  painPath: PainPath;
  title: string;
  body: string;
  qualityDiagnostic?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PluginPayload {
  scope: string;
  painPath: PainPath;
  title: string;
  body: string;
  qualityDiagnostic?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ---- Internal types ---------------------------------------------------------

interface RawTsRow {
  id: string;
  title: string;
  body: string;
  pain_path: string;
  rank: number | string;
}

// ---- Helpers ----------------------------------------------------------------

/**
 * Build an OR-quorum tsquery from a natural-language string.
 * Strips non-word characters, drops tokens ≤2 chars, joins with ' | '.
 * Used as fallback when websearch_to_tsquery returns < MIN_HITS rows.
 */
function buildOrQuery(query: string): string {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\w]/g, ""))
    .filter((t) => t.length > 2);
  return tokens.join(" | ");
}

const QUORUM_MIN_HITS = 3; // threshold below which we trigger OR-quorum retry

/**
 * Merge two arrays of RawTsRow by id, keeping the highest rank per id.
 */
function mergeDedup(a: RawTsRow[], b: RawTsRow[]): RawTsRow[] {
  const map = new Map<string, RawTsRow>();
  for (const row of [...a, ...b]) {
    const existing = map.get(row.id);
    const rankNum = Number(row.rank);
    const existingRank = existing ? Number(existing.rank) : -Infinity;
    if (!existing || rankNum > existingRank) {
      map.set(row.id, row);
    }
  }
  return Array.from(map.values());
}

// ---- Retrieval functions ----------------------------------------------------

/**
 * Get use cases for a given pain path.
 * Guests see scope='global' only (RLS enforces via synthetic UUID).
 * Authed users see global + their own saved rows.
 */
export async function getUseCasesForPath(
  userId: string,
  tenantId: string,
  path: PainPath,
  opts: { includeUserSaved?: boolean } = {},
): Promise<LibraryUseCase[]> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      // RLS auto-applies: user sees global + their own scope rows.
      // If includeUserSaved=false (explicit), only global.
      if (opts.includeUserSaved === false) {
        return tx
          .select()
          .from(libraryUseCases)
          .where(
            sql`${libraryUseCases.painPath} = ${path} AND ${libraryUseCases.scope} = 'global'`,
          );
      }
      return tx
        .select()
        .from(libraryUseCases)
        .where(eq(libraryUseCases.painPath, path));
    }),
  );
}

/**
 * Get prompts for a given pain path.
 */
export async function getPromptsForPath(
  userId: string,
  tenantId: string,
  path: PainPath,
  opts: { includeUserSaved?: boolean } = {},
): Promise<LibraryPrompt[]> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      if (opts.includeUserSaved === false) {
        return tx
          .select()
          .from(libraryPrompts)
          .where(
            sql`${libraryPrompts.painPath} = ${path} AND ${libraryPrompts.scope} = 'global'`,
          );
      }
      return tx
        .select()
        .from(libraryPrompts)
        .where(eq(libraryPrompts.painPath, path));
    }),
  );
}

/**
 * Get a single use-case row by id. Returns null if not visible to the actor
 * (RLS filters scope='global' OR scope=user_id).
 *
 * Also returns the matching same-pain-path prompt (first hit) as scaffolding
 * for the example-output generator. Single Q -> small JOIN-like fan-out kept
 * simple as two sequential reads inside one withActor tx for RLS uniformity.
 */
export async function getUseCaseWithPrompt(
  userId: string,
  tenantId: string,
  id: string,
): Promise<{
  useCase: LibraryUseCase;
  prompt: LibraryPrompt | null;
} | null> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const useCaseRows = await tx
        .select()
        .from(libraryUseCases)
        .where(eq(libraryUseCases.id, id))
        .limit(1);
      const useCase = useCaseRows[0];
      if (!useCase) return null;

      const promptRows = await tx
        .select()
        .from(libraryPrompts)
        .where(eq(libraryPrompts.painPath, useCase.painPath))
        .limit(1);
      const prompt = promptRows[0] ?? null;

      return { useCase, prompt };
    }),
  );
}

/**
 * Write the cached example output for a use-case row, but only if it's still
 * NULL. Race-safe: two concurrent first-time generators both stream; the
 * second writer no-ops. Returns true if this call won the write.
 */
export async function setUseCaseExampleOutputIfNull(
  userId: string,
  tenantId: string,
  id: string,
  text: string,
): Promise<boolean> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const rows = await tx
        .update(libraryUseCases)
        .set({ exampleOutput: text })
        .where(
          sql`${libraryUseCases.id} = ${id} AND ${libraryUseCases.exampleOutput} IS NULL`,
        )
        .returning({ id: libraryUseCases.id });
      return rows.length > 0;
    }),
  );
}

/**
 * Get user's promoted skills. Authed-only — guests see nothing (RLS blocks
 * all non-global scope rows; global skills will be visible if they exist).
 */
export async function getUserSkills(
  userId: string,
  tenantId: string,
): Promise<LibrarySkill[]> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      return tx
        .select()
        .from(librarySkills)
        .where(eq(librarySkills.scope, userId));
    }),
  );
}

/**
 * Get user's promoted plugins. Authed-only — same pattern as getUserSkills.
 */
export async function getUserPlugins(
  userId: string,
  tenantId: string,
): Promise<LibraryPlugin[]> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      return tx
        .select()
        .from(libraryPlugins)
        .where(eq(libraryPlugins.scope, userId));
    }),
  );
}

/**
 * Save a user-scoped use case (copies a curated row into the user's library,
 * or inserts a net-new one from a recommendation).
 */
export async function saveUserUseCase(
  userId: string,
  tenantId: string,
  input: NewUseCase,
): Promise<LibraryUseCase> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const [row] = await tx
        .insert(libraryUseCases)
        .values({
          scope: input.scope,
          painPath: input.painPath,
          startingLevel: input.startingLevel,
          title: input.title,
          body: input.body,
          rationale: input.rationale ?? "",
          estimatedMinutesSavedPerWeek: input.estimatedMinutesSavedPerWeek,
          metadata: (input.metadata as typeof libraryUseCases.$inferInsert["metadata"]) ?? {},
        })
        .returning();
      return row!;
    }),
  );
}

/**
 * Promote a recommendation artifact to a library skill.
 * Inserts with source_recommendation_id for traceability.
 */
export async function promoteToSkill(
  userId: string,
  tenantId: string,
  recId: string,
  payload: SkillPayload,
): Promise<LibrarySkill> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const [row] = await tx
        .insert(librarySkills)
        .values({
          scope: payload.scope,
          painPath: payload.painPath,
          title: payload.title,
          body: payload.body,
          sourceRecommendationId: recId,
          qualityDiagnostic: (payload.qualityDiagnostic ?? {}) as typeof librarySkills.$inferInsert["qualityDiagnostic"],
          metadata: (payload.metadata ?? {}) as typeof librarySkills.$inferInsert["metadata"],
        })
        .returning();
      return row!;
    }),
  );
}

/**
 * Promote a recommendation artifact to a library plugin.
 */
export async function promoteToPlugin(
  userId: string,
  tenantId: string,
  recId: string,
  payload: PluginPayload,
): Promise<LibraryPlugin> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const [row] = await tx
        .insert(libraryPlugins)
        .values({
          scope: payload.scope,
          painPath: payload.painPath,
          title: payload.title,
          body: payload.body,
          sourceRecommendationId: recId,
          qualityDiagnostic: (payload.qualityDiagnostic ?? {}) as typeof libraryPlugins.$inferInsert["qualityDiagnostic"],
          metadata: (payload.metadata ?? {}) as typeof libraryPlugins.$inferInsert["metadata"],
        })
        .returning();
      return row!;
    }),
  );
}

// ---- OR-quorum tsvector search per table ------------------------------------

async function searchTable(
  tx: Parameters<Parameters<typeof withActor>[0]>[0],
  tableName: string,
  query: string,
  opts: { paths?: PainPath[]; onlyMine?: boolean; userId?: string },
): Promise<RawTsRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const pathFilter =
    opts.paths && opts.paths.length > 0
      ? sql`AND pain_path = ANY(ARRAY[${sql.join(opts.paths.map((p) => sql`${p}`), sql`, `)}]::text[])`
      : sql``;
  const scopeFilter = opts.onlyMine && opts.userId
    ? sql`AND scope = ${opts.userId}`
    : sql``;

  // --- Strict pass: websearch_to_tsquery (AND semantics) ---
  const strictResult = await tx.execute(sql`
    SELECT id, title, body, pain_path,
           ts_rank_cd(search_tsv, websearch_to_tsquery('english', ${trimmed}), 32) AS rank
      FROM ${sql.raw(tableName)}
     WHERE search_tsv @@ websearch_to_tsquery('english', ${trimmed})
       ${pathFilter}
       ${scopeFilter}
     ORDER BY rank DESC
     LIMIT 20
  `);
  const strictRows = strictResult.rows as unknown as RawTsRow[];

  if (strictRows.length >= QUORUM_MIN_HITS) {
    return strictRows;
  }

  // --- OR-quorum fallback: to_tsquery with | (OR semantics) ---
  // Item 9c: triggered when strict pass returns < QUORUM_MIN_HITS results.
  const orQuery = buildOrQuery(trimmed);
  if (!orQuery) return strictRows; // all tokens stripped, nothing to try

  const fallbackResult = await tx.execute(sql`
    SELECT id, title, body, pain_path,
           ts_rank_cd(search_tsv, to_tsquery('english', ${orQuery}), 32) AS rank
      FROM ${sql.raw(tableName)}
     WHERE search_tsv @@ to_tsquery('english', ${orQuery})
       ${pathFilter}
       ${scopeFilter}
     ORDER BY rank DESC
     LIMIT 20
  `);
  const fallbackRows = fallbackResult.rows as unknown as RawTsRow[];

  // Merge: deduplicate by id, keep highest rank.
  return mergeDedup(strictRows, fallbackRows);
}

// ---- Universal fan-out search -----------------------------------------------

export interface SearchLibraryOpts {
  kinds?: LibraryKind[];
  paths?: PainPath[];
  onlyMine?: boolean;
  includeCorpus?: boolean;
  // Internal use: caller supplies actor context.
  userId?: string;
  tenantId?: string;
}

/**
 * Universal library search with OR-quorum fallback (hardening item 9c).
 *
 * Fan-out behavior:
 *   onlyMine=true  → library_* tables, user-scoped rows only; no corpus.
 *   onlyMine=false → library_* tables (global + user-scoped) + corpus via /api/search.
 *
 * Results are unified, badged by kind, ranked by combined score. Capped at 50.
 *
 * IMPORTANT: corpus fan-out calls the internal corpus search function directly
 * (not via HTTP) to avoid circular dependency and localhost URL assumptions.
 * The corpus results are tagged kind='corpus' with corpus_doc_id set.
 */
export async function searchLibrary(
  query: string,
  opts: SearchLibraryOpts = {},
): Promise<LibraryHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const userId = opts.userId ?? GUEST_USER_ID;
  const tenantId = opts.tenantId ?? GUEST_TENANT_ID;

  const activeKinds =
    opts.kinds ??
    ([
      "use_case",
      "prompt",
      "skill",
      "plugin",
      "corpus",
      "kb_article",
    ] as LibraryKind[]);
  const includeCorpus = !opts.onlyMine && (opts.includeCorpus !== false) && activeKinds.includes("corpus");
  const includeKb = activeKinds.includes("kb_article");

  const hits: LibraryHit[] = [];

  await runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const tableSearchOpts = {
        paths: opts.paths,
        onlyMine: opts.onlyMine,
        userId,
      };

      const searches: Promise<void>[] = [];

      if (activeKinds.includes("use_case")) {
        searches.push(
          searchTable(tx, "library_use_cases", trimmed, tableSearchOpts).then(
            (rows) => {
              for (const r of rows) {
                hits.push({
                  kind: "use_case",
                  id: r.id,
                  title: r.title,
                  snippet: r.body.slice(0, 300).replace(/\s+/g, " "),
                  score: Number(r.rank),
                  source_path: r.pain_path as PainPath,
                  library_id: r.id,
                });
              }
            },
          ),
        );
      }

      if (activeKinds.includes("prompt")) {
        searches.push(
          searchTable(tx, "library_prompts", trimmed, tableSearchOpts).then(
            (rows) => {
              for (const r of rows) {
                hits.push({
                  kind: "prompt",
                  id: r.id,
                  title: r.title,
                  snippet: r.body.slice(0, 300).replace(/\s+/g, " "),
                  score: Number(r.rank),
                  source_path: r.pain_path as PainPath,
                  library_id: r.id,
                });
              }
            },
          ),
        );
      }

      if (activeKinds.includes("skill")) {
        searches.push(
          searchTable(tx, "library_skills", trimmed, tableSearchOpts).then(
            (rows) => {
              for (const r of rows) {
                hits.push({
                  kind: "skill",
                  id: r.id,
                  title: r.title,
                  snippet: r.body.slice(0, 300).replace(/\s+/g, " "),
                  score: Number(r.rank),
                  library_id: r.id,
                });
              }
            },
          ),
        );
      }

      if (activeKinds.includes("plugin")) {
        searches.push(
          searchTable(tx, "library_plugins", trimmed, tableSearchOpts).then(
            (rows) => {
              for (const r of rows) {
                hits.push({
                  kind: "plugin",
                  id: r.id,
                  title: r.title,
                  snippet: r.body.slice(0, 300).replace(/\s+/g, " "),
                  score: Number(r.rank),
                  library_id: r.id,
                });
              }
            },
          ),
        );
      }

      // Run all four table searches concurrently within the same transaction.
      await Promise.all(searches);
    }),
  );

  // --- KB fan-out (separate from the library transaction because kb_articles
  //     has a different shape — no pain_path column — and uses lib/kb's own
  //     RLS-scoped retrieval helper). KB rows have no body_kind filter; they
  //     are curated content. ---
  if (includeKb) {
    try {
      const { searchKbArticles } = await import("@/lib/kb");
      const kbHits = await searchKbArticles({ userId, tenantId }, trimmed);
      for (const kb of kbHits) {
        hits.push({
          kind: "kb_article",
          id: kb.id,
          title: kb.title,
          snippet: (kb.summary || "").slice(0, 300).replace(/\s+/g, " "),
          score: Number(kb.rank),
          library_id: kb.id,
          slug: kb.slug,
        });
      }
    } catch (err) {
      console.warn("[searchLibrary] KB fan-out failed:", err);
    }
  }

  // --- Saved responses fan-out (user-scoped, FTS via search_tsv) ---
  //     Saved responses are personal artifacts; RLS scopes them to user_id
  //     automatically. Guests have no rows so the query returns []. The
  //     LibraryHit carries the full payload for inline rendering.
  if (activeKinds.includes("saved_response")) {
    try {
      const responseHits = await searchSavedResponsesInternal(
        userId,
        tenantId,
        trimmed,
      );
      hits.push(...responseHits);
    } catch (err) {
      console.warn("[searchLibrary] saved_response fan-out failed:", err);
    }
  }

  // --- Saved searches fan-out (user-scoped, no FTS — small N, ILIKE) ---
  //     Saved searches are surfaced primarily via the pinned strip in the
  //     UI; we include them here for completeness when the kind filter
  //     explicitly opts in. ILIKE is fine because per-user counts are tiny.
  if (activeKinds.includes("saved_search")) {
    try {
      const searchHits = await searchSavedSearchesInternal(
        userId,
        tenantId,
        trimmed,
      );
      hits.push(...searchHits);
    } catch (err) {
      console.warn("[searchLibrary] saved_search fan-out failed:", err);
    }
  }

  // --- Corpus fan-out (outside the library RLS transaction) ---
  if (includeCorpus) {
    try {
      // Import corpus search inline to avoid circular dependency at module level.
      // The bm25Search + titleSearch corpus pipeline is the authoritative path.
      // We call the corpus search logic directly — not via HTTP — to keep this
      // importable in tests with mocked DB.
      const corpusHits = await fetchCorpusHits(query, userId, tenantId);
      hits.push(...corpusHits);
    } catch (err) {
      // Corpus search is best-effort; degrade gracefully.
      console.warn("[searchLibrary] corpus fan-out failed:", err);
    }
  }

  // Sort by score descending, cap at 50. Curated library rows get a modest
  // boost so role/use-case packs are not buried by broad corpus articles on
  // the Library surface.
  hits.sort((a, b) => librarySortScore(b) - librarySortScore(a));
  return hits.slice(0, 50);
}

function librarySortScore(hit: LibraryHit): number {
  if (hit.kind === "corpus") return hit.score;
  if (hit.kind === "kb_article") return hit.score + 0.15;
  return hit.score + 0.35;
}

/**
 * Fetch corpus results using the existing BM25 tsvector leg directly.
 * Avoids HTTP round-trip and localhost URL assumptions.
 * Returns LibraryHit[] with kind='corpus'.
 */
async function fetchCorpusHits(
  query: string,
  userId: string,
  tenantId: string,
): Promise<LibraryHit[]> {
  const { bm25Search } = await import("@/lib/ai-knowledge/search/bm25-leg");
  const { titleSearch } = await import("@/lib/ai-knowledge/search/title-leg");

  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      // Strict pass first. Title search keeps metadata-only articles discoverable
      // without treating their bodies as grounded answer material.
      let corpusRows = await bm25Search(tx, query, 20);
      const titleRows = await titleSearch(tx, query, 20);
      const seenTitle = new Set(corpusRows.map((r) => r.doc_id));
      for (const row of titleRows) {
        if (!seenTitle.has(row.doc_id)) {
          corpusRows.push(row);
          seenTitle.add(row.doc_id);
        }
      }
      corpusRows.sort((a, b) => b.rank - a.rank);

      // OR-quorum fallback if too few results.
      if (corpusRows.length < QUORUM_MIN_HITS) {
        const orQuery = buildOrQuery(query);
        if (orQuery) {
          try {
            const fallback = await tx.execute(sql`
              SELECT id AS doc_id,
                     ts_rank_cd(search_tsv, to_tsquery('english', ${orQuery}), 32) AS rank
                FROM corpus_documents
               WHERE search_tsv @@ to_tsquery('english', ${orQuery})
                 AND (
                   (metadata->'content_extract'->>'body_kind') IS NULL
                   OR (metadata->'content_extract'->>'body_kind') IN ('full_text','source_summary')
                 )
               ORDER BY rank DESC
               LIMIT 20
            `);
            const fallbackHits = (
              fallback.rows as Array<{ doc_id: string; rank: number | string }>
            ).map((r) => ({ doc_id: r.doc_id, rank: Number(r.rank) }));
            // Merge and deduplicate.
            const seen = new Set(corpusRows.map((r) => r.doc_id));
            for (const f of fallbackHits) {
              if (!seen.has(f.doc_id)) {
                corpusRows.push(f);
                seen.add(f.doc_id);
              }
            }
            corpusRows.sort((a, b) => b.rank - a.rank);
          } catch {
            // fallback failed — keep strict results only
          }
        }
      }

      if (corpusRows.length === 0) return [];

      // Hydrate title + snippet + body_kind from corpus_documents. C10:
      // body_kind comes from metadata->'content_extract' (not yet a column).
      // Defense in depth: skip hard-bad rows but keep metadata-only rows
      // discoverable as clearly badged corpus results.
      const ids = corpusRows.slice(0, 20).map((r) => r.doc_id);
      const docResult = await tx.execute(sql`
        SELECT id, title, body,
               (metadata->'content_extract'->>'body_kind') AS body_kind
          FROM corpus_documents
         WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
      `);
      const docMap = new Map<
        string,
        { title: string; body: string; body_kind: string | null }
      >();
      for (const r of docResult.rows as Array<{
        id: string;
        title: string;
        body: string;
        body_kind: string | null;
      }>) {
        if (r.body_kind === "blocked" || r.body_kind === "degraded") continue;
        docMap.set(r.id, r);
      }

      return corpusRows.flatMap((row) => {
        const doc = docMap.get(row.doc_id);
        if (!doc) return [];
        return [
          {
            kind: "corpus" as LibraryKind,
            id: row.doc_id,
            title: doc.title,
            snippet: doc.body.slice(0, 300).replace(/\s+/g, " "),
            score: row.rank,
            corpus_doc_id: row.doc_id,
            body_kind: normalizeBodyKind(doc.body_kind),
          },
        ];
      });
    }),
  );
}

// ---- Saved searches CRUD ----------------------------------------------------

export interface NewSavedSearch {
  query: string;
  kindFilter: string[];
  pathFilter: string[];
  onlyMine: boolean;
  name?: string | null;
}

/** List the current user's saved searches, newest first. */
export async function listSavedSearches(
  userId: string,
  tenantId: string,
): Promise<LibrarySavedSearch[]> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      return tx
        .select()
        .from(librarySavedSearches)
        .where(eq(librarySavedSearches.scope, userId))
        .orderBy(desc(librarySavedSearches.createdAt));
    }),
  );
}

/** Insert a new saved search row scoped to the current user. */
export async function createSavedSearch(
  userId: string,
  tenantId: string,
  input: NewSavedSearch,
): Promise<LibrarySavedSearch> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const [row] = await tx
        .insert(librarySavedSearches)
        .values({
          scope: userId,
          name: input.name ?? null,
          query: input.query,
          kindFilter: input.kindFilter as typeof librarySavedSearches.$inferInsert["kindFilter"],
          pathFilter: input.pathFilter as typeof librarySavedSearches.$inferInsert["pathFilter"],
          onlyMine: input.onlyMine,
        })
        .returning();
      return row!;
    }),
  );
}

/** Rename a saved search the current user owns. Returns null if not found. */
export async function renameSavedSearch(
  userId: string,
  tenantId: string,
  id: string,
  name: string | null,
): Promise<LibrarySavedSearch | null> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const rows = await tx
        .update(librarySavedSearches)
        .set({ name, updatedAt: new Date() })
        .where(
          and(
            eq(librarySavedSearches.id, id),
            eq(librarySavedSearches.scope, userId),
          ),
        )
        .returning();
      return rows[0] ?? null;
    }),
  );
}

/** Delete a saved search the current user owns. Returns true if a row was removed. */
export async function deleteSavedSearch(
  userId: string,
  tenantId: string,
  id: string,
): Promise<boolean> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const rows = await tx
        .delete(librarySavedSearches)
        .where(
          and(
            eq(librarySavedSearches.id, id),
            eq(librarySavedSearches.scope, userId),
          ),
        )
        .returning({ id: librarySavedSearches.id });
      return rows.length > 0;
    }),
  );
}

// ---- Saved responses CRUD ---------------------------------------------------

export interface NewSavedResponse {
  question: string;
  answer: string;
  citations: SavedResponseCitation[];
  wasGrounded?: boolean;
}

/** List the current user's saved responses, newest first. */
export async function listSavedResponses(
  userId: string,
  tenantId: string,
): Promise<LibrarySavedResponse[]> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      return tx
        .select()
        .from(librarySavedResponses)
        .where(eq(librarySavedResponses.scope, userId))
        .orderBy(desc(librarySavedResponses.createdAt));
    }),
  );
}

/** Insert a new saved response row scoped to the current user. */
export async function createSavedResponse(
  userId: string,
  tenantId: string,
  input: NewSavedResponse,
): Promise<LibrarySavedResponse> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const [row] = await tx
        .insert(librarySavedResponses)
        .values({
          scope: userId,
          question: input.question,
          answer: input.answer,
          citations:
            input.citations as typeof librarySavedResponses.$inferInsert["citations"],
          wasGrounded: input.wasGrounded ?? true,
        })
        .returning();
      return row!;
    }),
  );
}

/** Delete a saved response the current user owns. Returns true if a row was removed. */
export async function deleteSavedResponse(
  userId: string,
  tenantId: string,
  id: string,
): Promise<boolean> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const rows = await tx
        .delete(librarySavedResponses)
        .where(
          and(
            eq(librarySavedResponses.id, id),
            eq(librarySavedResponses.scope, userId),
          ),
        )
        .returning({ id: librarySavedResponses.id });
      return rows.length > 0;
    }),
  );
}

// ---- Internal helpers used by searchLibrary fan-out -------------------------

/**
 * FTS search across the current user's saved responses. Returns LibraryHit[]
 * with the full saved_response payload inlined for rendering.
 *
 * Mirrors searchTable() for library_use_cases etc., with strict
 * websearch_to_tsquery then OR-quorum fallback.
 */
async function searchSavedResponsesInternal(
  userId: string,
  tenantId: string,
  query: string,
): Promise<LibraryHit[]> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      // If query is empty (single-space sentinel), list newest-first instead
      // of running FTS — same UX as the library page's "no query, filters
      // active" path.
      const isEmpty = !query || query === " ";

      const rows = isEmpty
        ? (
            await tx
              .select()
              .from(librarySavedResponses)
              .where(eq(librarySavedResponses.scope, userId))
              .orderBy(desc(librarySavedResponses.createdAt))
              .limit(20)
          ).map((r) => ({
            id: r.id,
            question: r.question,
            answer: r.answer,
            citations: r.citations as unknown as SavedResponseCitation[],
            was_grounded: r.wasGrounded,
            created_at:
              r.createdAt instanceof Date
                ? r.createdAt.toISOString()
                : String(r.createdAt),
            rank: 0,
          }))
        : await searchSavedResponsesFts(tx, query);

      return rows.map((r) => ({
        kind: "saved_response" as const,
        id: r.id,
        title: r.question,
        snippet: (r.answer || "").slice(0, 300).replace(/\s+/g, " "),
        score: Number(r.rank),
        library_id: r.id,
        saved_response: {
          question: r.question,
          answer: r.answer,
          citations: Array.isArray(r.citations) ? r.citations : [],
          wasGrounded: r.was_grounded,
          createdAt: r.created_at,
        },
      }));
    }),
  );
}

/** FTS over library_saved_responses.search_tsv with OR-quorum fallback. */
async function searchSavedResponsesFts(
  tx: Parameters<Parameters<typeof withActor>[0]>[0],
  query: string,
): Promise<
  Array<{
    id: string;
    question: string;
    answer: string;
    citations: SavedResponseCitation[];
    was_grounded: boolean;
    created_at: string;
    rank: number;
  }>
> {
  // Strict pass.
  const strict = await tx.execute(sql`
    SELECT id, question, answer, citations, was_grounded,
           created_at::text AS created_at,
           ts_rank_cd(search_tsv, websearch_to_tsquery('english', ${query}), 32) AS rank
      FROM library_saved_responses
     WHERE search_tsv @@ websearch_to_tsquery('english', ${query})
     ORDER BY rank DESC
     LIMIT 20
  `);
  const strictRows = strict.rows as Array<{
    id: string;
    question: string;
    answer: string;
    citations: unknown;
    was_grounded: boolean;
    created_at: string;
    rank: number | string;
  }>;
  let hits = strictRows.map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    citations: Array.isArray(r.citations)
      ? (r.citations as SavedResponseCitation[])
      : [],
    was_grounded: r.was_grounded,
    created_at: r.created_at,
    rank: Number(r.rank),
  }));

  if (hits.length >= QUORUM_MIN_HITS) return hits;

  // OR-quorum fallback.
  const orQuery = buildOrQuery(query);
  if (!orQuery) return hits;
  const fallback = await tx.execute(sql`
    SELECT id, question, answer, citations, was_grounded,
           created_at::text AS created_at,
           ts_rank_cd(search_tsv, to_tsquery('english', ${orQuery}), 32) AS rank
      FROM library_saved_responses
     WHERE search_tsv @@ to_tsquery('english', ${orQuery})
     ORDER BY rank DESC
     LIMIT 20
  `);
  const fallbackRows = fallback.rows as Array<{
    id: string;
    question: string;
    answer: string;
    citations: unknown;
    was_grounded: boolean;
    created_at: string;
    rank: number | string;
  }>;
  // Dedup by id, keep highest rank.
  const map = new Map<string, (typeof hits)[number]>();
  for (const r of hits) map.set(r.id, r);
  for (const r of fallbackRows) {
    const next = {
      id: r.id,
      question: r.question,
      answer: r.answer,
      citations: Array.isArray(r.citations)
        ? (r.citations as SavedResponseCitation[])
        : [],
      was_grounded: r.was_grounded,
      created_at: r.created_at,
      rank: Number(r.rank),
    };
    const existing = map.get(r.id);
    if (!existing || next.rank > existing.rank) map.set(r.id, next);
  }
  return Array.from(map.values()).sort((a, b) => b.rank - a.rank);
}

/**
 * ILIKE search across the current user's saved searches. Small N, so ILIKE
 * over name + query is sufficient. Returns LibraryHit[] with saved_search
 * payload for re-apply.
 */
async function searchSavedSearchesInternal(
  userId: string,
  tenantId: string,
  query: string,
): Promise<LibraryHit[]> {
  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      const isEmpty = !query || query === " ";
      const pattern = `%${query.replace(/[%_]/g, "")}%`;
      const filter = isEmpty
        ? sql`scope = ${userId}`
        : sql`scope = ${userId} AND (
            coalesce(name, '') ILIKE ${pattern} OR query ILIKE ${pattern}
          )`;

      const result = await tx.execute(sql`
        SELECT id, name, query, kind_filter, path_filter, only_mine,
               created_at::text AS created_at
          FROM library_saved_searches
         WHERE ${filter}
         ORDER BY created_at DESC
         LIMIT 20
      `);

      const rows = result.rows as Array<{
        id: string;
        name: string | null;
        query: string;
        kind_filter: unknown;
        path_filter: unknown;
        only_mine: boolean;
        created_at: string;
      }>;

      return rows.map<LibraryHit>((r) => {
        const kindFilter = Array.isArray(r.kind_filter)
          ? (r.kind_filter as string[])
          : [];
        const pathFilter = Array.isArray(r.path_filter)
          ? (r.path_filter as string[])
          : [];
        const titleSource = r.name?.trim() || r.query || "(saved search)";
        const truncatedQuery = (r.query || "").slice(0, 300);
        return {
          kind: "saved_search" as const,
          id: r.id,
          title: titleSource,
          snippet: truncatedQuery,
          score: 0,
          library_id: r.id,
          saved_search: {
            query: r.query,
            kindFilter,
            pathFilter,
            onlyMine: r.only_mine,
            name: r.name,
            createdAt: r.created_at,
          },
        };
      });
    }),
  );
}
