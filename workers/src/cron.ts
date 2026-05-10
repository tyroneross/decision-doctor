// node-cron schedules.
//
// F-30 wires real ingest schedules. This file ships the WIRING so we can
// confirm the worker boots cleanly; the actual schedules are commented placeholders.
//
// Pattern:
//   import cron from "node-cron";
//   cron.schedule("0 * * * *", async () => {
//     const boss = getBoss();
//     await boss.send("arxiv-fetch", { query: "cat:cs.AI", scope: "global" });
//   });
//
// All schedules MUST be idempotent at the work-handler level (the handler
// uses ON CONFLICT DO NOTHING via the UNIQUE constraint on corpus_documents).
import cron from "node-cron";

let _registered = false;

export function registerSchedules(): void {
  if (_registered) return;
  _registered = true;

  // No active schedules yet — F-30 follow-up wires:
  //   cat:cs.AI         every 1h
  //   anthropic blog    every 6h
  //   openai blog       every 6h
  //   perplexity blog   every 6h
  //
  // Until then, ingest is manual via `pnpm enqueue:arxiv -- "cat:cs.AI"`.

  console.log("[cron] schedules registered (currently 0 active; F-30 wires them)");

  // Ensure cron is imported so build doesn't tree-shake it out. Trivial no-op.
  if (process.env.CRON_PROBE === "1") {
    cron.schedule("* * * * *", () => {
      console.log("[cron] probe tick");
    });
  }
}
