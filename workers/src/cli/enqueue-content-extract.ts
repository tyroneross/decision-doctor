#!/usr/bin/env tsx
// Manually enqueue a content-extract job for one corpus_documents row.
// Used for smoke-testing the live Railway worker, and for the eventual
// backfill of pre-existing documents.
//
// Usage:
//   pnpm exec tsx src/cli/enqueue-content-extract.ts <documentId>
//   pnpm exec tsx src/cli/enqueue-content-extract.ts --backfill openai-news
//
// The job lands in pg-boss; whichever worker (local dev or Railway) is
// connected to the same Neon DB will pick it up.

import "dotenv/config";
import { Pool } from "pg";
import { getBoss, startQueue, stopQueue } from "../queue.js";

async function main(): Promise<void> {
  const a = process.argv[2];
  const a2 = process.argv[3];
  if (!a) {
    console.error(
      "usage: pnpm exec tsx src/cli/enqueue-content-extract.ts <documentId>\n" +
        "       pnpm exec tsx src/cli/enqueue-content-extract.ts --backfill <source_type>",
    );
    process.exit(2);
  }

  await startQueue();
  const boss = getBoss();

  if (a === "--backfill") {
    if (!a2) {
      console.error("--backfill requires a source_type (e.g. openai-news)");
      process.exit(2);
    }
    const cs =
      process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
    const pool = new Pool({ connectionString: cs });
    const { rows } = await pool.query<{ id: string; scope: string }>(
      "SELECT id, scope FROM corpus_documents WHERE source_type = $1 ORDER BY published_at DESC NULLS LAST",
      [a2],
    );
    await pool.end();
    let n = 0;
    for (const r of rows) {
      await boss.send("content-extract", {
        documentId: r.id,
        scope: r.scope,
      });
      n += 1;
    }
    console.log(
      JSON.stringify({
        event: "backfill-enqueued",
        queue: "content-extract",
        source_type: a2,
        count: n,
      }),
    );
  } else {
    const jobId = await boss.send("content-extract", {
      documentId: a,
      scope: "global",
    });
    console.log(
      JSON.stringify({
        event: "enqueued",
        queue: "content-extract",
        jobId,
        documentId: a,
      }),
    );
  }

  await stopQueue();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
