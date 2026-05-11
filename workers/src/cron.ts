// node-cron schedules.
//
// Wires the F-30 ingest schedules. Each tick enqueues a pg-boss job; the job
// handler is the unit of concurrency control, not cron itself. We use
// pg-boss's singletonKey to coalesce overlapping fires (matches the
// "concurrency=1 on RLS-scoped writes" pattern from ADR-011 and the
// SET LOCAL discipline used by the Perplexity adapter; addresses the
// cron-overlap class of bug DEBT-11 in the Atomize debt audit).
//
// Every schedule logs a structured {event:'cron-tick'} line per fire and
// updates a module-local last-fire map exposed via /cron-status.
import cron from "node-cron";
import { getBoss } from "./queue.js";

let _registered = false;

/**
 * Last-fire timestamp per schedule. Read by /cron-status. We keep this map
 * module-local rather than persisting to Postgres — restart is rare and
 * losing this state across deploys is acceptable (the schedules themselves
 * are durable; ops just need a "is the worker firing?" signal).
 */
const lastFire: Map<string, string> = new Map();

export interface CronStatusEntry {
  schedule: string;
  cron: string;
  last_fire: string | null;
}

export function getCronStatus(): CronStatusEntry[] {
  return REGISTRY.map((r) => ({
    schedule: r.name,
    cron: r.cron,
    last_fire: lastFire.get(r.name) ?? null,
  }));
}

interface ScheduleDef {
  name: string;
  cron: string;
  fire: () => Promise<void>;
}

/**
 * The registry holds every defined schedule. Inactive entries (commented in
 * the dispatch as "adapter not yet built") are recorded with a no-op `fire`
 * so /cron-status still lists them as known-but-pending.
 */
const REGISTRY: ScheduleDef[] = [
  {
    name: "arxiv-cs-ai-hourly",
    cron: "0 * * * *", // every hour at :00
    fire: async () => {
      const boss = getBoss();
      // singletonKey coalesces overlapping fires — only one queued at a time.
      await boss.send(
        "arxiv-fetch",
        { query: "cat:cs.AI", scope: "global", maxResults: 25 },
        { singletonKey: "arxiv-cs-ai-hourly" },
      );
    },
  },
  {
    name: "anthropic-news-6h",
    cron: "0 */6 * * *", // 00:00, 06:00, 12:00, 18:00 UTC
    fire: async () => {
      const boss = getBoss();
      await boss.send(
        "anthropic-news-fetch",
        { scope: "global", maxArticles: 20 },
        { singletonKey: "anthropic-news-6h" },
      );
    },
  },
  {
    name: "openai-news-rss-6h",
    cron: "10 */6 * * *", // 00:10, 06:10, 12:10, 18:10 UTC (offset to avoid pile-up with Anthropic)
    fire: async () => {
      const boss = getBoss();
      await boss.send(
        "rss-fetch",
        {
          url: "https://openai.com/news/rss.xml",
          sourceType: "openai-news",
          scope: "global",
          maxItems: 50,
        },
        { singletonKey: "openai-news-rss-6h" },
      );
    },
  },
  {
    name: "perplexity-hub-24h",
    cron: "20 3 * * *",
    fire: async () => {
      // TODO(F-31): wire when the Perplexity hub adapter lands.
      // Perplexity Hub may need scraping (need to verify feed availability).
    },
  },
];

export function registerSchedules(): void {
  if (_registered) return;
  _registered = true;

  for (const def of REGISTRY) {
    cron.schedule(def.cron, async () => {
      const firedAt = new Date().toISOString();
      lastFire.set(def.name, firedAt);
      console.log(
        JSON.stringify({
          event: "cron-tick",
          schedule: def.name,
          fired_at: firedAt,
        }),
      );
      try {
        await def.fire();
      } catch (e) {
        console.error(
          `[cron] schedule=${def.name} fire failed:`,
          (e as Error).message ?? e,
        );
      }
    });
  }

  console.log(
    `[cron] schedules registered: ${REGISTRY.map((r) => r.name).join(", ")}`,
  );

  // Diagnostic probe — set CRON_PROBE=1 to verify cron wiring without
  // waiting an hour for the first hourly fire.
  if (process.env.CRON_PROBE === "1") {
    cron.schedule("* * * * *", () => {
      console.log("[cron] probe tick");
    });
  }
}
