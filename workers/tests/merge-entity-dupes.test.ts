// F-31 FIX-4 — merge-entity-dupes integration tests.
//
// Pattern matches workers/tests/backfill-embeddings.test.ts: DB-skip when
// DATABASE_URL absent, real DB when present. Uses ephemeral fixture rows
// keyed by a unique source_type tag for isolation, cleaned up in afterAll.
//
// Tests:
//   1. Detects dupe groups under canonical_key.
//   2. Merges three groups (case-only dupe, spaced-name dupe, hyphen dupe).
//   3. Preserves mention_count when winner+loser share a doc (collision
//      merge into existing winner row).
//   4. Repoints relationships on BOTH source_entity_id and target_entity_id.
//   5. Unions aliases on the winner.
//   6. Drops self-loops created by the merge.
//   7. Idempotent: second run reports 0 dupe groups.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";

const DB_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const HAS_DB = !!DB_URL;

const {
  findDupeGroups,
  runMerge,
  checkSanity,
} = await import("../src/cli/merge-entity-dupes.js");

const describeIfDb = HAS_DB ? describe : describe.skip;

let pool: pg.Pool | null = null;
const FIXTURE_TAG = `merge-dupes-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const FIXTURE_SCOPE = `${FIXTURE_TAG}-scope`;
const cleanupDocIds: string[] = [];
// We track loser ids too so that even if the merge function fails partway,
// afterAll can clean them out.
const cleanupEntityIds: string[] = [];

interface SeedResult {
  // Group 1 — case-only (Claude vs claude): no doc-overlap, no rel-collision.
  g1WinnerId: string;
  g1LoserId: string;
  // Group 2 — punctuation dupe (GPT-5 / gpt5 / GPT 5): with doc-overlap and
  // a relationship that collides.
  g2WinnerId: string;
  g2LoserIds: string[];
  // Group 3 — alias-rich (Anthropic / Anthropic PBC / anthropic.com).
  g3WinnerId: string;
  g3LoserIds: string[];
  // Docs used in mention collisions.
  doc1Id: string;
  doc2Id: string;
}

async function seed(pool: pg.Pool): Promise<SeedResult> {
  // Ensure migration 0011 is in place (canonical_key column present). If
  // not, every test below will fail with a clear error — surface that
  // upfront so the operator knows to `pnpm db:push` first.
  const colCheck = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_entities' AND column_name = 'canonical_key'
     ) AS exists`,
  );
  if (!colCheck.rows[0]?.exists) {
    throw new Error(
      "ai_entities.canonical_key column missing. Apply drizzle/0011_entity_canonicalize.sql first (pnpm db:push).",
    );
  }

  // Seed two corpus_documents to use as mention anchors. We don't need real
  // content; use the FIXTURE_TAG as source_type to make cleanup trivial.
  const doc1Id = randomUUID();
  const doc2Id = randomUUID();
  await pool.query(
    `INSERT INTO corpus_documents
       (id, scope, source_type, source_id, source_url, title, body, content_hash)
     VALUES
       ($1, $2, $3, $4, 'https://example.invalid/d1', 'Doc 1', 'body 1', $5),
       ($6, $2, $3, $7, 'https://example.invalid/d2', 'Doc 2', 'body 2', $8)`,
    [
      doc1Id,
      FIXTURE_SCOPE,
      FIXTURE_TAG,
      `${FIXTURE_TAG}-doc1`,
      `hash-${FIXTURE_TAG}-1`,
      doc2Id,
      `${FIXTURE_TAG}-doc2`,
      `hash-${FIXTURE_TAG}-2`,
    ],
  );
  cleanupDocIds.push(doc1Id, doc2Id);

  // The pre-existing unique index `ai_entities_canonical_unique` on
  // (scope, entity_type, lower(canonical_name)) means we can't seed
  // case-only dupes (e.g. "Claude" + "claude") even though they SHOULD be
  // merged. The real audit's 225 dupe groups all have *different*
  // lower(canonical_name) but identical canonical_key (e.g. "Claude API"
  // vs "ClaudeAPI" — strip space, lower → "claudeapi"). Our seeds must
  // pick names that pass the lower-name index but collide on canonical_key.

  // ------------------------------------------------------------------
  // Group 1 — space-stripping dupe.
  //   "Claude API" vs "ClaudeAPI" → same canonical_key "claudeapi".
  // ------------------------------------------------------------------
  const g1WinnerId = randomUUID();
  const g1LoserId = randomUUID();
  await pool.query(
    `INSERT INTO ai_entities (id, scope, entity_type, canonical_name, aliases)
     VALUES ($1, $2, 'model', 'Claude API',  ARRAY['Claude-API-Original']),
            ($3, $2, 'model', 'ClaudeAPI',   ARRAY['claudeapi-loser-alias'])`,
    [g1WinnerId, FIXTURE_SCOPE, g1LoserId],
  );
  cleanupEntityIds.push(g1WinnerId, g1LoserId);

  // ------------------------------------------------------------------
  // Group 2 — punctuation/space dupes.
  //   "GPT-5", "GPT 5", "GPT.5" → all collapse to "gpt5" under
  //   canonical_key, but have distinct lower(name) so they pass the old
  //   unique index. (Can't include "gpt5" itself — lower("gpt5")
  //   collides with itself.)
  // ------------------------------------------------------------------
  const trio = [randomUUID(), randomUUID(), randomUUID()].sort();
  const [g2WinnerId, g2LoserA, g2LoserB] = trio as [string, string, string];
  await pool.query(
    `INSERT INTO ai_entities (id, scope, entity_type, canonical_name, aliases)
     VALUES ($1, $2, 'model', 'GPT-5', ARRAY['gpt-five']),
            ($3, $2, 'model', 'GPT 5', ARRAY['gpt5-alias']),
            ($4, $2, 'model', 'GPT.5', ARRAY['gpt5-other'])`,
    [g2WinnerId, FIXTURE_SCOPE, g2LoserA, g2LoserB],
  );
  cleanupEntityIds.push(g2WinnerId, g2LoserA, g2LoserB);

  // ------------------------------------------------------------------
  // Group 3 — alias-rich, organization scope.
  //   "Anthropic PBC", "Anthropic-PBC", "Anthropic.PBC" — all collapse to
  //   "anthropicpbc" under canonical_key.
  // ------------------------------------------------------------------
  const trio3 = [randomUUID(), randomUUID(), randomUUID()].sort();
  const [g3WinnerId, g3LoserA, g3LoserB] = trio3 as [string, string, string];
  await pool.query(
    `INSERT INTO ai_entities (id, scope, entity_type, canonical_name, aliases)
     VALUES ($1, $2, 'organization', 'Anthropic PBC',  ARRAY['anthropic-pbc-original']),
            ($3, $2, 'organization', 'Anthropic-PBC',  ARRAY['anth-loser-1']),
            ($4, $2, 'organization', 'Anthropic.PBC',  ARRAY['anth-loser-2'])`,
    [g3WinnerId, FIXTURE_SCOPE, g3LoserA, g3LoserB],
  );
  cleanupEntityIds.push(g3WinnerId, g3LoserA, g3LoserB);

  // ------------------------------------------------------------------
  // Mentions:
  //   Doc1 mentions g1WinnerId (mention_count=3) AND g1LoserId (mention_count=2)
  //     → collision: must merge into winner row, sum mention_counts.
  //   Doc1 mentions g2LoserA (mention_count=5) — repoint to g2WinnerId.
  //   Doc2 mentions g2LoserB (mention_count=4) — repoint to g2WinnerId.
  //   Doc2 mentions g3LoserA (mention_count=1) — repoint to g3WinnerId.
  // ------------------------------------------------------------------
  await pool.query(
    `INSERT INTO ai_document_entity_mentions (document_id, entity_id, confidence, mention_count, evidence_text)
     VALUES
       ($1, $2, 0.9, 3, 'evidence-w'),
       ($1, $3, 0.7, 2, 'evidence-l'),
       ($1, $4, 0.8, 5, 'evidence-g2a'),
       ($5, $6, 0.8, 4, 'evidence-g2b'),
       ($5, $7, 0.85, 1, 'evidence-g3a')`,
    [
      doc1Id,
      g1WinnerId,
      g1LoserId,
      g2LoserA,
      doc2Id,
      g2LoserB,
      g3LoserA,
    ],
  );

  // ------------------------------------------------------------------
  // Relationships:
  //   (g2LoserA, g3WinnerId, 'develops') — repoint source to g2WinnerId.
  //   (g3LoserB, g2WinnerId, 'integrates') — repoint source to g3WinnerId.
  //   (g1WinnerId, g1LoserId, 'cites') — same-group: post-merge becomes
  //     self-loop, must be dropped.
  //   (g3WinnerId, g3LoserA, 'partners_with') — same-group: post-merge
  //     becomes self-loop, must be dropped.
  // ------------------------------------------------------------------
  await pool.query(
    `INSERT INTO ai_relationships
       (scope, source_entity_id, target_entity_id, relationship_type, confidence, evidence_document_id, temporal_status)
     VALUES
       ($1, $2, $3, 'develops',      0.9, $4, 'active'),
       ($1, $5, $6, 'integrates',    0.8, $7, 'active'),
       ($1, $8, $9, 'cites',         0.9, $4, 'active'),
       ($1, $10, $11, 'partners_with', 0.9, $7, 'active')`,
    [
      FIXTURE_SCOPE,
      g2LoserA, g3WinnerId, doc1Id,
      g3LoserB, g2WinnerId, doc2Id,
      g1WinnerId, g1LoserId,
      g3WinnerId, g3LoserA,
    ],
  );

  return {
    g1WinnerId,
    g1LoserId,
    g2WinnerId,
    g2LoserIds: [g2LoserA, g2LoserB],
    g3WinnerId,
    g3LoserIds: [g3LoserA, g3LoserB],
    doc1Id,
    doc2Id,
  };
}

beforeAll(async () => {
  if (!HAS_DB) return;
  pool = new pg.Pool({ connectionString: DB_URL });
});

afterAll(async () => {
  if (!pool) return;
  // Delete in dependency order. Cascade on mentions + relationships from
  // ai_entities should remove them when entities go, but be explicit in
  // case some rows survived.
  try {
    if (cleanupEntityIds.length > 0) {
      await pool.query(
        `DELETE FROM ai_document_entity_mentions WHERE entity_id = ANY($1::uuid[])`,
        [cleanupEntityIds],
      );
      await pool.query(
        `DELETE FROM ai_relationships WHERE source_entity_id = ANY($1::uuid[]) OR target_entity_id = ANY($1::uuid[])`,
        [cleanupEntityIds],
      );
      await pool.query(
        `DELETE FROM ai_entities WHERE id = ANY($1::uuid[])`,
        [cleanupEntityIds],
      );
    }
    if (cleanupDocIds.length > 0) {
      await pool.query(
        `DELETE FROM corpus_documents WHERE id = ANY($1::uuid[])`,
        [cleanupDocIds],
      );
    }
    // Catch-all by source_type tag in case other entities were created in-test.
    await pool.query(
      `DELETE FROM corpus_documents WHERE source_type = $1`,
      [FIXTURE_TAG],
    );
    await pool.query(
      `DELETE FROM ai_entities WHERE scope = $1`,
      [FIXTURE_SCOPE],
    );
  } finally {
    await pool.end();
  }
});

describeIfDb("merge-entity-dupes", () => {
  it("detects dup groups under canonical_key", async () => {
    const seeded = await seed(pool!);
    const client = await pool!.connect();
    try {
      // Scope-filter to FIXTURE_SCOPE for test isolation — the prod-like
      // dev DB has ~225 real dupe groups that would slow the test and
      // pollute its assertions.
      const groups = await findDupeGroups(client, FIXTURE_SCOPE);
      const ours = groups;
      expect(ours).toHaveLength(3);

      // Validate winner stability — array_agg ORDER BY id::text means
      // ids[0] is the lex-smallest UUID. Our seed sorted the trios already
      // so g2WinnerId / g3WinnerId match.
      const g1 = ours.find((g) => g.canonical_key === "claudeapi");
      expect(g1).toBeDefined();
      expect(g1!.ids[0]).toBe(
        [seeded.g1WinnerId, seeded.g1LoserId].sort()[0],
      );

      const g2 = ours.find((g) => g.canonical_key === "gpt5");
      expect(g2).toBeDefined();
      expect(g2!.ids).toHaveLength(3);

      const g3 = ours.find((g) => g.canonical_key === "anthropicpbc");
      expect(g3).toBeDefined();
      expect(g3!.ids).toHaveLength(3);
    } finally {
      client.release();
    }
  });

  it("merges all dupe groups: repoints mentions, repoints relationships, unions aliases, drops self-loops", async () => {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      // Re-run the actual merge inside this transaction so the test is
      // self-contained — commit at the end so subsequent tests see a
      // merged state, OR rollback to keep tests independent. We choose
      // commit so the idempotency test below validates against the
      // already-merged state.
      const before = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ai_entities WHERE scope = $1`,
        [FIXTURE_SCOPE],
      );
      expect(Number(before.rows[0]?.n)).toBe(8);

      // Scope-filtered merge — leaves prod-like dev dupes untouched.
      const { stats, counts, groups } = await runMerge(client, FIXTURE_SCOPE);
      expect(stats.groups_total).toBe(3);
      expect(stats.losers_total).toBe(5); // 1+2+2 from our seed

      const ourGroups = groups;
      expect(ourGroups).toHaveLength(3);

      // Sanity check must pass on a healthy merge.
      const sanity = checkSanity(counts);
      expect(sanity.ok).toBe(true);

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    // Now query post-merge state via the pool (separate connection).
    const post = await pool!.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ai_entities WHERE scope = $1`,
      [FIXTURE_SCOPE],
    );
    // 8 entities seeded → 3 should remain (one winner per group).
    expect(Number(post.rows[0]?.n)).toBe(3);

    // Mentions: 5 seeded across our entities. After merge:
    //   Doc1 had (g1Winner: 3) + (g1Loser: 2) — collision merge → winner.mention_count = 5, loser-row deleted.
    //   Doc1 had (g2LoserA: 5) — repointed to g2Winner → 1 row.
    //   Doc2 had (g2LoserB: 4) — repointed to g2Winner → 1 row.
    //   Doc2 had (g3LoserA: 1) — repointed to g3Winner → 1 row.
    // Expected post: 4 mention rows for FIXTURE_SCOPE entities.
    const mentionRows = await pool!.query<{
      document_id: string;
      entity_id: string;
      mention_count: number;
    }>(
      `SELECT m.document_id, m.entity_id, m.mention_count
         FROM ai_document_entity_mentions m
         JOIN ai_entities e ON e.id = m.entity_id
        WHERE e.scope = $1
        ORDER BY m.document_id, m.entity_id`,
      [FIXTURE_SCOPE],
    );
    expect(mentionRows.rows).toHaveLength(4);

    // Winner of group 1 should have mention_count 5 on doc1 (3+2 merged).
    const seededLastFromFirstIt = await pool!.query<{ id: string }>(
      `SELECT id FROM ai_entities WHERE scope = $1 AND entity_type = 'model' AND canonical_key = 'claudeapi'`,
      [FIXTURE_SCOPE],
    );
    const claudeWinnerId = seededLastFromFirstIt.rows[0]?.id;
    expect(claudeWinnerId).toBeDefined();
    const claudeMention = mentionRows.rows.find(
      (r) => r.entity_id === claudeWinnerId,
    );
    expect(claudeMention).toBeDefined();
    expect(Number(claudeMention!.mention_count)).toBe(5);

    // Relationships: 4 seeded; 2 were "same-group" self-loops that should
    // be dropped, 2 should survive (repointed).
    const relRows = await pool!.query<{
      source_entity_id: string;
      target_entity_id: string;
      relationship_type: string;
    }>(
      `SELECT source_entity_id, target_entity_id, relationship_type
         FROM ai_relationships
        WHERE scope = $1
        ORDER BY relationship_type`,
      [FIXTURE_SCOPE],
    );
    expect(relRows.rows).toHaveLength(2);

    const types = relRows.rows.map((r) => r.relationship_type).sort();
    expect(types).toEqual(["develops", "integrates"]);

    // Aliases on the gpt5 winner should include union from losers.
    const gpt5Winner = await pool!.query<{
      canonical_name: string;
      aliases: string[];
    }>(
      `SELECT canonical_name, aliases
         FROM ai_entities
        WHERE scope = $1 AND entity_type = 'model' AND canonical_key = 'gpt5'`,
      [FIXTURE_SCOPE],
    );
    expect(gpt5Winner.rows).toHaveLength(1);
    const aliases = gpt5Winner.rows[0]?.aliases ?? [];
    // Union of: 'gpt-five' (winner) + 'gpt5-alias', 'gpt5-other' (losers)
    // + 'GPT 5' and 'GPT.5' (loser canonical_names added as aliases).
    expect(aliases).toEqual(
      expect.arrayContaining(["gpt-five", "gpt5-alias", "gpt5-other", "GPT 5", "GPT.5"]),
    );
  });

  it("is idempotent: second merge run reports zero dup groups in our fixture scope", async () => {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const groups = await findDupeGroups(client, FIXTURE_SCOPE);
      expect(groups).toHaveLength(0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
