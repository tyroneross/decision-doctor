// CLI: enqueue an arxiv-fetch job and exit. Used for local testing.
//
// Usage:
//   pnpm enqueue:arxiv -- "cat:cs.AI" 25
//
// First arg = arXiv search_query string. Second arg = max results (default 25).
import { config as loadEnv } from "dotenv";
import { startQueue, stopQueue } from "../queue.js";

loadEnv();

async function main(): Promise<void> {
  const [, , query = "cat:cs.AI", maxStr = "25"] = process.argv;
  const maxResults = Number(maxStr);
  if (!Number.isFinite(maxResults) || maxResults < 1) {
    console.error("max_results must be a positive integer");
    process.exit(2);
  }
  const boss = await startQueue();
  await boss.createQueue("arxiv-fetch"); // idempotent — handler also creates
  const jobId = await boss.send("arxiv-fetch", {
    query,
    scope: "global",
    maxResults,
  });
  console.log(`[enqueue] queued arxiv-fetch ${jobId} — query="${query}" max=${maxResults}`);
  // Keep the process alive long enough for the handler to drain. pg-boss
  // polls every ~2s; 30s is comfortable for max=25 with one HTTP fetch + N inserts.
  setTimeout(async () => {
    await stopQueue();
    process.exit(0);
  }, 30_000);
}

main().catch((e) => {
  console.error("[enqueue] fatal:", e);
  process.exit(1);
});
