#!/usr/bin/env tsx
// Backfill missing embeddings for corpus_documents rows.
//
// Per the F-31 recall-fixes audit, ~47.7% of corpus_documents rows have no
// corpus_embeddings row at all — the vector leg is dark for ~half corpus.
// This CLI finds those gap rows and enqueues an embed-document job per row.
//
// Send-only pg-boss pattern (matches enqueue-content-extract.ts): the CLI
// starts pg-boss, sends jobs, then stops. The Railway worker drains the
// queue; this CLI does not register handlers.
//
// Default target queue is `embed-document`. The legacy alias `arxiv-embed`
// is accepted via --queue for back-compat with operational runbooks.
//
// Usage:
//   pnpm exec tsx src/cli/backfill-embeddings.ts                    # enqueue all gap docs
//   pnpm exec tsx src/cli/backfill-embeddings.ts --limit 100        # cap fan-out
//   pnpm exec tsx src/cli/backfill-embeddings.ts --dry-run          # report only, no enqueue
//   pnpm exec tsx src/cli/backfill-embeddings.ts --queue arxiv-embed
//
// The gap query joins corpus_documents LEFT JOIN corpus_embeddings and
// filters rows with no embedding chunks. Newest documents first
// (created_at DESC) so the drain helps recent traffic first.

import "dotenv/config";
import { Pool } from "pg";
import { getBoss } from "../queue.js";

type QueueName = "embed-document" | "arxiv-embed";

interface CliArgs {
  limit: number | null;
  dryRun: boolean;
  queue: QueueName;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    limit: null,
    dryRun: false,
    queue: "embed-document",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") {
      const v = argv[++i];
      if (!v || !/^\d+$/.test(v)) {
        console.error(`--limit requires a positive integer, got: ${v ?? "(missing)"}`);
        process.exit(2);
      }
      args.limit = Number(v);
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--queue") {
      const v = argv[++i];
      if (v !== "embed-document" && v !== "arxiv-embed") {
        console.error(`--queue must be one of: embed-document, arxiv-embed (got: ${v ?? "(missing)"})`);
        process.exit(2);
      }
      args.queue = v;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: backfill-embeddings.ts [--limit N] [--dry-run] [--queue embed-document|arxiv-embed]",
      );
      process.exit(0);
    } else if (a !== undefined) {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

interface GapRow {
  id: string;
  scope: string;
  source_type: string;
  title: string;
}

export async function findGapDocuments(
  pool: Pool,
  limit: number | null,
): Promise<GapRow[]> {
  // LEFT JOIN + IS NULL is the standard "anti-join" shape Postgres optimizes
  // well. corpus_embeddings.document_id has a btree FK index from the
  // CASCADE constraint, so the lookup is index-driven. Order by fetched_at
  // DESC — corpus_documents has an index on (source_type, fetched_at DESC)
  // and fetched_at is the canonical "when did we learn about this row".
  const limitClause = limit !== null ? `LIMIT ${Number(limit)}` : "";
  const { rows } = await pool.query<GapRow>(
    `SELECT cd.id, cd.scope, cd.source_type, cd.title
       FROM corpus_documents cd
       LEFT JOIN corpus_embeddings ce ON ce.document_id = cd.id
       WHERE ce.document_id IS NULL
       ORDER BY cd.fetched_at DESC NULLS LAST
       ${limitClause}`,
  );
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const cs = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!cs) {
    console.error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set.");
    process.exit(2);
  }

  const pool = new Pool({ connectionString: cs });
  let gap: GapRow[];
  try {
    gap = await findGapDocuments(pool, args.limit);
  } finally {
    await pool.end();
  }

  if (gap.length === 0) {
    console.log(
      JSON.stringify({
        event: "backfill-embeddings-complete",
        gap_count: 0,
        enqueued: 0,
        queue: args.queue,
        dry_run: args.dryRun,
      }),
    );
    return;
  }

  if (args.dryRun) {
    // Per-source histogram so the operator can see WHERE the gap is.
    const bySource = new Map<string, number>();
    for (const r of gap) {
      bySource.set(r.source_type, (bySource.get(r.source_type) ?? 0) + 1);
    }
    console.log(
      JSON.stringify({
        event: "backfill-embeddings-dry-run",
        gap_count: gap.length,
        by_source: Object.fromEntries(bySource),
        queue: args.queue,
        first_5: gap.slice(0, 5).map((r) => ({ id: r.id, title: r.title.slice(0, 80) })),
      }),
    );
    return;
  }

  const boss = getBoss();
  await boss.start();
  // Both queues exist in queue.ts; createQueue is idempotent.
  await boss.createQueue(args.queue);

  let enqueued = 0;
  try {
    for (const r of gap) {
      await boss.send(args.queue, { documentId: r.id });
      enqueued += 1;
    }
    console.log(
      JSON.stringify({
        event: "backfill-embeddings-complete",
        gap_count: gap.length,
        enqueued,
        queue: args.queue,
        dry_run: false,
      }),
    );
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }
}

// Only run main() when executed directly (allows test-time import).
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("backfill-embeddings.ts") === true;

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
