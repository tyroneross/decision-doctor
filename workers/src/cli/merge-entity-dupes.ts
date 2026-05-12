#!/usr/bin/env tsx
// Merge duplicate ai_entities rows under the canonical_key generated column.
//
// Per the F-31 recall-fixes audit (docs/handover/
// independent-retrieval-audit-2026-05-11.md), the existing unique index on
// (scope, entity_type, lower(canonical_name)) is too lax — "Claude" /
// "Claude API" / "claude.ai" / "claude-api" all hit different unique buckets
// but represent the same entity. Audit found 233 dup groups / 285 excess
// rows.
//
// 0011_entity_canonicalize.sql added a STORED generated column
// `canonical_key` = lower(regexp_replace(canonical_name, '[\s.-]', '', 'g'))
// and a non-unique index. This CLI uses that column to merge duplicates,
// pointing all mentions + relationships at the winner row and deleting
// losers. 0012_entity_canonical_key_unique.sql then adds the unique
// constraint as the future safety net (must run merge first; see 0012's
// header comment).
//
// Idempotency:
//   - First run: merges N dupe groups.
//   - Second run: 0 dupe groups remain, no-op, exits 0.
//
// Safety:
//   - Default mode is --dry-run. Writes require BOTH --execute AND
//     --i-know-the-risk (double-flag gate).
//   - Wraps the merge in a single transaction. Before/after row counts on
//     ai_document_entity_mentions and ai_relationships are compared; if
//     either total drops more than MAX_DROP_PCT (default 1%), the
//     transaction is rolled back and the CLI exits non-zero. This catches
//     a bug where the merge loses mentions/relationships unexpectedly.
//
// Collision handling:
//   ai_document_entity_mentions has UNIQUE (document_id, entity_id). If
//   doc D mentions BOTH winner W and loser L, naive UPDATE entity_id=W
//   WHERE entity_id=L would violate the constraint. We instead detect the
//   overlap and merge mention_count + confidence into the winner row, then
//   delete the loser-mention row.
//
//   ai_relationships has UNIQUE (scope, source_entity_id, target_entity_id,
//   relationship_type). Same pattern: relationship (L, X, develops) and
//   (W, X, develops) would collide; we delete the loser-relationship row.
//   Relationships where loser is on both sides become self-loops after
//   merge and are dropped (the table CHECK source_entity_id <> target_entity_id
//   would reject them anyway).
//
// Usage:
//   pnpm exec tsx src/cli/merge-entity-dupes.ts                          # dry-run
//   pnpm exec tsx src/cli/merge-entity-dupes.ts --dry-run                # explicit
//   pnpm exec tsx src/cli/merge-entity-dupes.ts --execute --i-know-the-risk

import "dotenv/config";
import { Pool, type PoolClient } from "pg";

const MAX_DROP_PCT = 0.01; // 1%

interface CliArgs {
  dryRun: boolean;
  execute: boolean;
  iKnowTheRisk: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    execute: false,
    iKnowTheRisk: false,
  };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--execute") args.execute = true;
    else if (a === "--i-know-the-risk") args.iKnowTheRisk = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: merge-entity-dupes.ts [--dry-run] [--execute --i-know-the-risk]",
      );
      console.log(
        "Default is --dry-run. Writes require BOTH --execute and --i-know-the-risk.",
      );
      process.exit(0);
    } else if (a !== undefined && a.length > 0) {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  // Default to dry-run if neither flag set.
  if (!args.execute) args.dryRun = true;
  return args;
}

export interface DupeGroupRow {
  scope: string;
  entity_type: string;
  canonical_key: string;
  ids: string[]; // ordered ascending; ids[0] is the winner
  names: string[];
}

export interface MergeStats {
  groups_total: number;
  losers_total: number;
  mentions_repointed: number;
  mentions_merged_into_existing: number;
  relationships_repointed: number;
  relationships_merged_into_existing: number;
  relationships_dropped_self_loop: number;
  aliases_added_to_winners: number;
  losers_deleted: number;
}

export interface SanityCounts {
  mentions_before: number;
  mentions_after: number;
  relationships_before: number;
  relationships_after: number;
}

/** Find groups of ai_entities rows sharing the same (scope, entity_type,
 *  canonical_key) where count > 1. ids are ordered ascending so ids[0] is
 *  the deterministic winner (smallest UUID by string sort).
 *
 *  `scopeFilter` (optional): restrict GROUP BY to a single scope. Used by
 *  the merge-entity-dupes test for isolation; the CLI always passes null. */
export async function findDupeGroups(
  client: PoolClient,
  scopeFilter: string | null = null,
): Promise<DupeGroupRow[]> {
  const params: unknown[] = [];
  let where = `canonical_key IS NOT NULL AND canonical_key <> ''`;
  if (scopeFilter !== null) {
    params.push(scopeFilter);
    where += ` AND scope = $${params.length}`;
  }
  const { rows } = await client.query<DupeGroupRow>(
    `SELECT scope,
            entity_type,
            canonical_key,
            array_agg(id::text ORDER BY id::text) AS ids,
            array_agg(canonical_name ORDER BY id::text) AS names
       FROM ai_entities
      WHERE ${where}
      GROUP BY scope, entity_type, canonical_key
     HAVING count(*) > 1
      ORDER BY count(*) DESC, canonical_key`,
    params,
  );
  return rows;
}

async function countTotals(client: PoolClient): Promise<SanityCounts> {
  const m = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ai_document_entity_mentions`,
  );
  const r = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ai_relationships`,
  );
  return {
    mentions_before: Number(m.rows[0]?.n ?? 0),
    mentions_after: -1,
    relationships_before: Number(r.rows[0]?.n ?? 0),
    relationships_after: -1,
  };
}

async function recountAfter(
  client: PoolClient,
  pre: SanityCounts,
): Promise<SanityCounts> {
  const m = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ai_document_entity_mentions`,
  );
  const r = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ai_relationships`,
  );
  return {
    mentions_before: pre.mentions_before,
    mentions_after: Number(m.rows[0]?.n ?? 0),
    relationships_before: pre.relationships_before,
    relationships_after: Number(r.rows[0]?.n ?? 0),
  };
}

/** Merge mentions from `losers` into `winner`. Handles (document_id, entity_id)
 *  unique-constraint collisions by aggregating mention_count + max(confidence)
 *  into the existing winner row, then deleting the loser-mention row. */
async function mergeMentions(
  client: PoolClient,
  winner: string,
  losers: string[],
  stats: MergeStats,
): Promise<void> {
  // 1. Find overlapping (document_id) rows — docs that mention BOTH winner
  //    and at least one loser. Merge those first (aggregate, then delete
  //    loser rows for that doc).
  const overlap = await client.query<{ document_id: string }>(
    `SELECT m_loser.document_id
       FROM ai_document_entity_mentions m_loser
       JOIN ai_document_entity_mentions m_winner
         ON m_winner.document_id = m_loser.document_id
        AND m_winner.entity_id = $1
      WHERE m_loser.entity_id = ANY($2::uuid[])`,
    [winner, losers],
  );
  if (overlap.rows.length > 0) {
    const docIds = overlap.rows.map((r) => r.document_id);
    // Sum loser mention_counts into winner; take max confidence.
    await client.query(
      `UPDATE ai_document_entity_mentions w
          SET mention_count = w.mention_count + COALESCE(loser_agg.sum_mc, 0),
              confidence    = GREATEST(w.confidence, COALESCE(loser_agg.max_conf, w.confidence))
         FROM (
           SELECT document_id, sum(mention_count) AS sum_mc, max(confidence) AS max_conf
             FROM ai_document_entity_mentions
            WHERE entity_id = ANY($1::uuid[])
              AND document_id = ANY($2::uuid[])
            GROUP BY document_id
         ) loser_agg
        WHERE w.entity_id = $3
          AND w.document_id = loser_agg.document_id`,
      [losers, docIds, winner],
    );
    const del = await client.query(
      `DELETE FROM ai_document_entity_mentions
        WHERE entity_id = ANY($1::uuid[])
          AND document_id = ANY($2::uuid[])`,
      [losers, docIds],
    );
    stats.mentions_merged_into_existing += del.rowCount ?? 0;
  }

  // 2. Remaining loser-mentions (docs where winner doesn't have a row yet) —
  //    safe to repoint via UPDATE.
  const upd = await client.query(
    `UPDATE ai_document_entity_mentions
        SET entity_id = $1
      WHERE entity_id = ANY($2::uuid[])`,
    [winner, losers],
  );
  stats.mentions_repointed += upd.rowCount ?? 0;
}

/** Merge relationships from `losers` into `winner`. Both endpoints
 *  (source_entity_id and target_entity_id) can reference a loser. After
 *  merge, drop relationships that became self-loops (winner→winner). */
async function mergeRelationships(
  client: PoolClient,
  winner: string,
  losers: string[],
  stats: MergeStats,
): Promise<void> {
  // For each loser-relationship row, compute the post-merge endpoints
  // (replace loser ids with winner) and detect collisions against existing
  // winner-relationship rows under the unique key
  // (scope, source_entity_id, target_entity_id, relationship_type).
  // Handled per-loser below so each step uses simple parameter bindings.

  for (const loser of losers) {
    // 1a. Self-loop rule first: any row where BOTH endpoints are this loser
    //     would become winner→winner after merge. Drop them.
    const selfLoopBoth = await client.query(
      `DELETE FROM ai_relationships
        WHERE source_entity_id = $1::uuid
          AND target_entity_id = $1::uuid`,
      [loser],
    );
    stats.relationships_dropped_self_loop += selfLoopBoth.rowCount ?? 0;

    // 1b. Rows where source is loser and target is winner (or vice versa)
    //     become winner→winner self-loops after merge. Drop.
    const selfLoopMixed = await client.query(
      `DELETE FROM ai_relationships
        WHERE (source_entity_id = $1::uuid AND target_entity_id = $2::uuid)
           OR (source_entity_id = $2::uuid AND target_entity_id = $1::uuid)`,
      [loser, winner],
    );
    stats.relationships_dropped_self_loop += selfLoopMixed.rowCount ?? 0;

    // 1c. Detect collisions: loser-rows that, after repointing, would
    //     match an existing winner-row on (scope, src, tgt, type).
    const colSrc = await client.query<{ id: string }>(
      `SELECT r.id
         FROM ai_relationships r
        WHERE r.source_entity_id = $1::uuid
          AND EXISTS (
            SELECT 1 FROM ai_relationships w
             WHERE w.scope = r.scope
               AND w.source_entity_id = $2::uuid
               AND w.target_entity_id = r.target_entity_id
               AND w.relationship_type = r.relationship_type
          )`,
      [loser, winner],
    );
    if (colSrc.rows.length > 0) {
      const ids = colSrc.rows.map((r) => r.id);
      const del = await client.query(
        `DELETE FROM ai_relationships WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      stats.relationships_merged_into_existing += del.rowCount ?? 0;
    }

    const colTgt = await client.query<{ id: string }>(
      `SELECT r.id
         FROM ai_relationships r
        WHERE r.target_entity_id = $1::uuid
          AND EXISTS (
            SELECT 1 FROM ai_relationships w
             WHERE w.scope = r.scope
               AND w.target_entity_id = $2::uuid
               AND w.source_entity_id = r.source_entity_id
               AND w.relationship_type = r.relationship_type
          )`,
      [loser, winner],
    );
    if (colTgt.rows.length > 0) {
      const ids = colTgt.rows.map((r) => r.id);
      const del = await client.query(
        `DELETE FROM ai_relationships WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      stats.relationships_merged_into_existing += del.rowCount ?? 0;
    }

    // 1d. Remaining loser-rows are safe to repoint.
    const updSrc = await client.query(
      `UPDATE ai_relationships SET source_entity_id = $1::uuid WHERE source_entity_id = $2::uuid`,
      [winner, loser],
    );
    stats.relationships_repointed += updSrc.rowCount ?? 0;

    const updTgt = await client.query(
      `UPDATE ai_relationships SET target_entity_id = $1::uuid WHERE target_entity_id = $2::uuid`,
      [winner, loser],
    );
    stats.relationships_repointed += updTgt.rowCount ?? 0;
  }
}

/** Merge the alias arrays from losers into the winner. */
async function mergeAliases(
  client: PoolClient,
  winner: string,
  losers: string[],
  loserNames: string[],
  stats: MergeStats,
): Promise<void> {
  // Union: winner.aliases + losers.aliases + losers.canonical_name.
  const loserAliasRes = await client.query<{ aliases: string[] | null }>(
    `SELECT aliases FROM ai_entities WHERE id = ANY($1::uuid[])`,
    [losers],
  );
  const allAliases = new Set<string>();
  for (const r of loserAliasRes.rows) {
    for (const a of r.aliases ?? []) allAliases.add(a);
  }
  for (const n of loserNames) allAliases.add(n);

  if (allAliases.size === 0) return;
  const incoming = Array.from(allAliases);
  // Postgres array union (de-dup) — combine and dedup with a CTE.
  const res = await client.query(
    `UPDATE ai_entities e
        SET aliases = ARRAY(
          SELECT DISTINCT unnest(e.aliases || $2::text[])
        )
      WHERE e.id = $1::uuid`,
    [winner, incoming],
  );
  stats.aliases_added_to_winners += res.rowCount ?? 0;
}

/** Run the merge for ONE group. Mutates `stats` in place. */
async function mergeOneGroup(
  client: PoolClient,
  group: DupeGroupRow,
  stats: MergeStats,
): Promise<void> {
  const [winner, ...losers] = group.ids;
  if (!winner || losers.length === 0) return;
  const winnerName = group.names[0] ?? "";
  const loserNames = group.names.slice(1);
  void winnerName;

  await mergeMentions(client, winner, losers, stats);
  await mergeRelationships(client, winner, losers, stats);
  await mergeAliases(client, winner, losers, loserNames, stats);

  // Bump winner's mention_count by the sum of loser mention_counts before deletion.
  // (The denormalized counter on ai_entities is informational; corpus_documents
  //  doesn't depend on it for retrieval. Still, keep it consistent.)
  await client.query(
    `UPDATE ai_entities w
        SET mention_count = w.mention_count + COALESCE(loser_sum.s, 0),
            last_seen_at  = GREATEST(w.last_seen_at, COALESCE(loser_sum.ls, w.last_seen_at))
       FROM (
         SELECT sum(mention_count) AS s, max(last_seen_at) AS ls
           FROM ai_entities WHERE id = ANY($1::uuid[])
       ) loser_sum
      WHERE w.id = $2::uuid`,
    [losers, winner],
  );

  // Finally, delete loser rows. CASCADE on ai_document_entity_mentions and
  // ai_relationships is fine here because by now we've repointed everything
  // that needed keeping; the only rows left referencing losers are the
  // self-loop / collision rows we deliberately deleted above. The cascade
  // is the belt to our suspenders.
  const del = await client.query(
    `DELETE FROM ai_entities WHERE id = ANY($1::uuid[])`,
    [losers],
  );
  stats.losers_deleted += del.rowCount ?? 0;
}

/** Run the full merge inside the provided client/transaction. Returns
 *  stats + before/after sanity counts.
 *
 *  `scopeFilter` (optional): restrict the merge to a single scope. Used by
 *  the merge-entity-dupes test for isolation; the CLI always passes null
 *  to merge across all scopes. */
export async function runMerge(
  client: PoolClient,
  scopeFilter: string | null = null,
): Promise<{ stats: MergeStats; counts: SanityCounts; groups: DupeGroupRow[] }> {
  const pre = await countTotals(client);
  const groups = await findDupeGroups(client, scopeFilter);

  const stats: MergeStats = {
    groups_total: groups.length,
    losers_total: 0,
    mentions_repointed: 0,
    mentions_merged_into_existing: 0,
    relationships_repointed: 0,
    relationships_merged_into_existing: 0,
    relationships_dropped_self_loop: 0,
    aliases_added_to_winners: 0,
    losers_deleted: 0,
  };

  for (const g of groups) {
    stats.losers_total += Math.max(0, g.ids.length - 1);
    await mergeOneGroup(client, g, stats);
  }

  const counts = await recountAfter(client, pre);
  return { stats, counts, groups };
}

/** Validate that mentions/relationships didn't drop by more than MAX_DROP_PCT. */
export function checkSanity(counts: SanityCounts): {
  ok: boolean;
  reason?: string;
} {
  const mentionDrop =
    counts.mentions_before > 0
      ? (counts.mentions_before - counts.mentions_after) / counts.mentions_before
      : 0;
  const relDrop =
    counts.relationships_before > 0
      ? (counts.relationships_before - counts.relationships_after) /
        counts.relationships_before
      : 0;
  if (mentionDrop > MAX_DROP_PCT) {
    return {
      ok: false,
      reason: `mention drop ${(mentionDrop * 100).toFixed(2)}% > ${(MAX_DROP_PCT * 100).toFixed(2)}% cap (before=${counts.mentions_before}, after=${counts.mentions_after})`,
    };
  }
  if (relDrop > MAX_DROP_PCT) {
    return {
      ok: false,
      reason: `relationship drop ${(relDrop * 100).toFixed(2)}% > ${(MAX_DROP_PCT * 100).toFixed(2)}% cap (before=${counts.relationships_before}, after=${counts.relationships_after})`,
    };
  }
  return { ok: true };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const cs = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!cs) {
    console.error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set.");
    process.exit(2);
  }

  // Safety: --execute requires --i-know-the-risk.
  if (args.execute && !args.iKnowTheRisk) {
    console.error(
      "--execute requires --i-know-the-risk. This will mutate ai_entities, ai_document_entity_mentions, and ai_relationships in a single transaction.",
    );
    process.exit(2);
  }

  const willExecute = args.execute && args.iKnowTheRisk;
  const mode = willExecute ? "execute" : "dry-run";

  const pool = new Pool({ connectionString: cs });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { stats, counts, groups } = await runMerge(client);

    // Emit the dry-run / pre-commit summary BEFORE deciding to commit/rollback.
    const summary = {
      event: "merge-entity-dupes-summary",
      mode,
      dup_groups: stats.groups_total,
      losers_total: stats.losers_total,
      mentions_repointed: stats.mentions_repointed,
      mentions_merged_into_existing: stats.mentions_merged_into_existing,
      relationships_repointed: stats.relationships_repointed,
      relationships_merged_into_existing: stats.relationships_merged_into_existing,
      relationships_dropped_self_loop: stats.relationships_dropped_self_loop,
      losers_deleted: stats.losers_deleted,
      mentions_before: counts.mentions_before,
      mentions_after: counts.mentions_after,
      relationships_before: counts.relationships_before,
      relationships_after: counts.relationships_after,
    };
    console.log(JSON.stringify(summary));

    // Top-10 groups by loser-count for operator visibility.
    if (groups.length > 0) {
      console.log(
        JSON.stringify({
          event: "merge-entity-dupes-top-groups",
          top_10: groups.slice(0, 10).map((g) => ({
            scope: g.scope,
            entity_type: g.entity_type,
            canonical_key: g.canonical_key,
            names: g.names,
          })),
        }),
      );
    }

    const sanity = checkSanity(counts);
    if (!sanity.ok) {
      console.error(
        `[merge-entity-dupes] sanity check FAILED: ${sanity.reason}. Rolling back.`,
      );
      await client.query("ROLLBACK");
      process.exit(3);
    }

    if (willExecute) {
      await client.query("COMMIT");
      console.log(
        JSON.stringify({ event: "merge-entity-dupes-committed", mode: "execute" }),
      );
    } else {
      await client.query("ROLLBACK");
      console.log(
        JSON.stringify({ event: "merge-entity-dupes-rolled-back", mode: "dry-run" }),
      );
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

// Only run main() when executed directly (allows test-time import).
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("merge-entity-dupes.ts") === true;

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
