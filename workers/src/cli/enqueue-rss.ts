#!/usr/bin/env tsx
// Manually enqueue an rss-fetch or anthropic-news-fetch job.
// Used for smoke-testing the live Railway worker without waiting for cron.
//
// Usage:
//   pnpm enqueue:rss openai
//   pnpm enqueue:rss anthropic
//
// The job lands in pg-boss; whichever worker (local dev or Railway) is
// connected to the same Neon DB will pick it up.

import "dotenv/config";
import { getBoss, startQueue, stopQueue } from "../queue.js";

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: pnpm enqueue:rss <openai|anthropic>");
    process.exit(2);
  }

  await startQueue();
  const boss = getBoss();

  let jobId: string | null = null;
  if (target === "openai") {
    jobId = await boss.send("rss-fetch", {
      url: "https://openai.com/news/rss.xml",
      sourceType: "openai-news",
      scope: "global",
      maxItems: 10,
    });
    console.log(
      JSON.stringify({
        event: "enqueued",
        queue: "rss-fetch",
        target: "openai",
        jobId,
      }),
    );
  } else if (target === "anthropic") {
    jobId = await boss.send("anthropic-news-fetch", {
      scope: "global",
      maxArticles: 5,
    });
    console.log(
      JSON.stringify({
        event: "enqueued",
        queue: "anthropic-news-fetch",
        target: "anthropic",
        jobId,
      }),
    );
  } else {
    console.error(`unknown target "${target}"; use openai | anthropic`);
    await stopQueue();
    process.exit(2);
  }

  // Give pg-boss a moment to flush the INSERT before disconnecting.
  await new Promise((r) => setTimeout(r, 500));
  await stopQueue();
}

main().catch((err) => {
  console.error("[enqueue-rss] failed:", err);
  process.exit(1);
});
