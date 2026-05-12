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
  type PainPath,
  type StartingLevel,
  type LibraryUseCase,
  type LibraryPrompt,
  type LibrarySkill,
  type LibraryPlugin,
  type NewLibraryUseCase,
} from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { eq, or } from "drizzle-orm";

// ---- Public type exports ----------------------------------------------------

export type LibraryKind = "use_case" | "prompt" | "skill" | "plugin" | "corpus";

export interface LibraryHit {
  kind: LibraryKind;
  id: string;
  title: string;
  snippet: string;
  score: number;
  source_path?: PainPath;
  library_id?: string;
  corpus_doc_id?: string;
}

export type { PainPath, StartingLevel };

// Re-export DB row types for callers that only need the retrieval module.
export type { LibraryUseCase, LibraryPrompt, LibrarySkill, LibraryPlugin };

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

  const userId = opts.userId ?? "00000000-0000-0000-0000-000000000000";
  const tenantId = opts.tenantId ?? "00000000-0000-0000-0000-000000000000";

  const activeKinds = opts.kinds ?? (["use_case", "prompt", "skill", "plugin", "corpus"] as LibraryKind[]);
  const includeCorpus = !opts.onlyMine && (opts.includeCorpus !== false) && activeKinds.includes("corpus");

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

  // --- Corpus fan-out (outside the library RLS transaction) ---
  if (includeCorpus) {
    try {
      // Import corpus search inline to avoid circular dependency at module level.
      // The bm25Search + /api/search corpus pipeline is the authoritative path.
      // We call the corpus search logic directly — not via HTTP — to keep this
      // importable in tests with mocked DB.
      const corpusHits = await fetchCorpusHits(query, userId, tenantId);
      hits.push(...corpusHits);
    } catch (err) {
      // Corpus search is best-effort; degrade gracefully.
      console.warn("[searchLibrary] corpus fan-out failed:", err);
    }
  }

  // Sort by score descending, cap at 50.
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 50);
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

  return runWithActor({ userId, tenantId }, async () =>
    withActor(async (tx) => {
      // Strict pass first.
      let corpusRows = await bm25Search(tx, query, 20);

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

      // Hydrate title + snippet from corpus_documents.
      const ids = corpusRows.slice(0, 20).map((r) => r.doc_id);
      const docResult = await tx.execute(sql`
        SELECT id, title, body
          FROM corpus_documents
         WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
      `);
      const docMap = new Map<string, { title: string; body: string }>();
      for (const r of docResult.rows as Array<{
        id: string;
        title: string;
        body: string;
      }>) {
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
          },
        ];
      });
    }),
  );
}
