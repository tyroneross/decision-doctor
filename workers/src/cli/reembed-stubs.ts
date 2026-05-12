#!/usr/bin/env tsx
// Re-embed stub-body documents after the F-31 FIX-3 title-prepend landed.
//
// Why this exists:
//   FIX-3 changes chunk_text to include the doc title. New embeddings written
//   by the worker after the fix lands will automatically pick up the new
//   shape (cache-invalidating because sha256(chunkText) changes). Existing
//   stub-body docs (length(body) < 200) embed only their placeholder body,
//   which is useless for retrieval. This CLI scopes a re-embed pass to
//   those stub docs only — ~67 docs per the audit, projecting ~$0.10 of
//   OpenAI spend on text-embedding-3-small.
//
// Default is --dry-run: lists matching docs with their title + body length
// and prints an estimated cost. The --execute path requires the
// --i-know-the-cost confirm flag so an operator cannot accidentally
// enqueue thousands of jobs by typing the wrong command.
//
// Rate-limit posture: the CLI only enqueues `embed-document` jobs. The
// worker concurrency on that queue is the actual rate-limiter (configured
// in queue.ts). Batched OpenAI calls inside `embed.ts` cap at 100 chunks
// per request. No additional throttling needed at the CLI layer.
//
// Usage:
//   pnpm exec tsx src/cli/reembed-stubs.ts                         # dry-run
//   pnpm exec tsx src/cli/reembed-stubs.ts --max-body-length 300   # widen
//   pnpm exec tsx src/cli/reembed-stubs.ts --execute --i-know-the-cost
//   pnpm exec tsx src/cli/reembed-stubs.ts --queue arxiv-embed --execute --i-know-the-cost

import "dotenv/config";
import { Pool } from "pg";
import { getBoss } from "../queue.js";

type QueueName = "embed-document" | "arxiv-embed";

interface CliArgs {
  maxBodyLength: number;
  execute: boolean;
  costConfirmed: boolean;
  queue: QueueName;
}

// text-embedding-3-small list price (USD per 1M input tokens). Used only
// for the dry-run cost projection. Hard-coded — re-verify against the
// OpenAI pricing page if the projection feels off.
const PRICE_PER_M_TOKENS_USD = 0.02;
// Rough chunk-token estimate per stub doc: title (~10-20 tokens) + body
// (<200 chars ≈ <50 tokens). One chunk per doc since `chunkBody` short-circuits
// to a single chunk when total tokens <= maxTokens.
const EST_TOKENS_PER_STUB = 100;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    maxBodyLength: 200,
    execute: false,
    costConfirmed: false,
    queue: "embed-document",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max-body-length") {
      const v = argv[++i];
      if (!v || !/^\d+$/.test(v)) {
        console.error(`--max-body-length requires a positive integer, got: ${v ?? "(missing)"}`);
        process.exit(2);
      }
      args.maxBodyLength = Number(v);
    } else if (a === "--execute") {
      args.execute = true;
    } else if (a === "--i-know-the-cost") {
      args.costConfirmed = true;
    } else if (a === "--queue") {
      const v = argv[++i];
      if (v !== "embed-document" && v !== "arxiv-embed") {
        console.error(`--queue must be one of: embed-document, arxiv-embed (got: ${v ?? "(missing)"})`);
        process.exit(2);
      }
      args.queue = v;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: reembed-stubs.ts [--max-body-length N] [--execute] [--i-know-the-cost] [--queue ...]",
      );
      process.exit(0);
    } else if (a !== undefined) {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

interface StubRow {
  id: string;
  scope: string;
  source_type: string;
  title: string;
  body_length: number;
}

export async function findStubDocuments(
  pool: Pool,
  maxBodyLength: number,
): Promise<StubRow[]> {
  const { rows } = await pool.query<StubRow>(
    `SELECT id, scope, source_type, title, length(body) AS body_length
       FROM corpus_documents
      WHERE length(body) < $1
      ORDER BY source_type, fetched_at DESC NULLS LAST`,
    [maxBodyLength],
  );
  return rows.map((r) => ({ ...r, body_length: Number(r.body_length) }));
}

function projectedCostUsd(n: number): number {
  const tokens = n * EST_TOKENS_PER_STUB;
  const cost = (tokens / 1_000_000) * PRICE_PER_M_TOKENS_USD;
  return Math.round(cost * 10000) / 10000; // 4 dp
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const cs = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!cs) {
    console.error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set.");
    process.exit(2);
  }

  const pool = new Pool({ connectionString: cs });
  let stubs: StubRow[];
  try {
    stubs = await findStubDocuments(pool, args.maxBodyLength);
  } finally {
    await pool.end();
  }

  const bySource = new Map<string, number>();
  for (const r of stubs) {
    bySource.set(r.source_type, (bySource.get(r.source_type) ?? 0) + 1);
  }
  const cost = projectedCostUsd(stubs.length);

  if (!args.execute) {
    console.log(
      JSON.stringify({
        event: "reembed-stubs-dry-run",
        match_count: stubs.length,
        max_body_length: args.maxBodyLength,
        by_source: Object.fromEntries(bySource),
        projected_tokens: stubs.length * EST_TOKENS_PER_STUB,
        projected_cost_usd: cost,
        queue: args.queue,
        first_10: stubs.slice(0, 10).map((r) => ({
          id: r.id,
          source_type: r.source_type,
          body_length: r.body_length,
          title: r.title.slice(0, 100),
        })),
        next_step:
          "Review projection. To execute: rerun with --execute --i-know-the-cost",
      }),
    );
    return;
  }

  if (!args.costConfirmed) {
    console.error(
      JSON.stringify({
        event: "reembed-stubs-blocked",
        reason: "execute_requires_cost_confirm_flag",
        match_count: stubs.length,
        projected_cost_usd: cost,
        next_step: "rerun with --execute --i-know-the-cost",
      }),
    );
    process.exit(2);
  }

  if (stubs.length === 0) {
    console.log(
      JSON.stringify({
        event: "reembed-stubs-complete",
        enqueued: 0,
        queue: args.queue,
      }),
    );
    return;
  }

  const boss = getBoss();
  await boss.start();
  await boss.createQueue(args.queue);

  let enqueued = 0;
  try {
    for (const r of stubs) {
      await boss.send(args.queue, { documentId: r.id });
      enqueued += 1;
    }
    console.log(
      JSON.stringify({
        event: "reembed-stubs-complete",
        enqueued,
        match_count: stubs.length,
        queue: args.queue,
        projected_cost_usd: cost,
      }),
    );
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }
}

// Only run main() when executed directly (allows test-time import).
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("reembed-stubs.ts") === true;

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
