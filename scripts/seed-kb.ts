#!/usr/bin/env tsx
/**
 * scripts/seed-kb.ts — KB seeder for /app/learn.
 *
 * Reads curated KB markdown files from disk and UPSERTs each one as a
 * global-scope kb_articles row.
 *
 * Flags:
 *   --dry-run   Validate seed structure + print what would be upserted. No DB writes.
 *
 * Connection: uses DATABASE_URL (owner role) so we can INSERT global-scope rows.
 *
 * Idempotency: ON CONFLICT (scope, slug) DO UPDATE. A no-op re-run reports
 * "0 inserted, 0 updated" because updated_at is only refreshed when a normalised
 * field actually differs from the stored value.
 */

// --- env bootstrap -----------------------------------------------------------
import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") }); // fallback

// --- imports -----------------------------------------------------------------
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";

// =============================================================================
// Article spec
// =============================================================================

interface KbSeedArticle {
  scope: "global";
  slug: string;
  title: string;
  summaryFromExecutiveSummary: true; // marker: summary derived from first paragraph of body Executive Summary
  bodyPath: string;                  // relative to repo root
  displayOrder: number;
  metadata?: Record<string, unknown>;
}

const ARTICLES: KbSeedArticle[] = [
  {
    scope: "global",
    slug: "ai-plugin-architecture",
    title:
      "AI Plugin Architecture: Skills, Scripts, Hooks, MCP Servers & Scaffolding",
    summaryFromExecutiveSummary: true,
    bodyPath:
      "docs/AI Plugin Architecture  Skills, Scripts, Hooks, MCP Servers & Scaffolding.md",
    displayOrder: 10,
    metadata: { topic: "plugin-architecture", source: "in-repo" },
  },
  {
    scope: "global",
    slug: "prompting-best-practices",
    title: "Prompting Best Practices for Healthcare AI Workflows",
    summaryFromExecutiveSummary: true,
    bodyPath: "docs/Prompting Best Practices for Healthcare AI Workflows.md",
    displayOrder: 20,
    metadata: {
      topic: "prompting",
      source: "in-repo",
      relatedUrl: "https://rosslabs.ai/toolkit/prompt-decision-aid",
    },
  },
  {
    scope: "global",
    slug: "advanced-prompting-patterns",
    title: "Advanced Prompting Patterns for Reliable AI Workflows",
    summaryFromExecutiveSummary: true,
    bodyPath: "docs/Advanced Prompting Patterns for Reliable AI Workflows.md",
    displayOrder: 30,
    metadata: {
      topic: "advanced-prompting",
      source: "vault-research-and-in-repo",
      relatedUrl: "https://rosslabs.ai/toolkit/prompt-decision-aid",
    },
  },
];

// =============================================================================
// Helpers
// =============================================================================

function normaliseText(s: string): string {
  return s.trim().replace(/\r\n/g, "\n");
}

/**
 * Estimate reading minutes from line count.
 * Approximation: ~30 source-doc lines per minute (mix of prose + code/lists).
 * 578-line doc → 20 min. Same heuristic the dispatch brief named.
 */
function readingMinutesFromBody(body: string): number {
  const lineCount = body.split("\n").length;
  return Math.max(1, Math.ceil(lineCount / 30));
}

/**
 * Extract the first paragraph of the "Executive Summary" H2 section.
 * Falls back to the first non-empty paragraph after the H1 if not found.
 * Truncates to ~280 chars at a word boundary.
 */
function deriveSummary(body: string, maxChars = 280): string {
  const lines = body.split("\n");
  let inExec = false;
  const para: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+executive summary/i.test(line)) {
      inExec = true;
      continue;
    }
    if (inExec) {
      // Stop at the next heading.
      if (/^#{1,6}\s/.test(line)) break;
      if (line === "") {
        if (para.length > 0) break; // first paragraph captured
        continue;
      }
      para.push(line);
    }
  }

  // Fallback — first paragraph anywhere after the H1.
  if (para.length === 0) {
    let foundH1 = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (/^#\s/.test(line)) {
        foundH1 = true;
        continue;
      }
      if (foundH1) {
        if (/^#{1,6}\s/.test(line)) continue; // skip subsequent headings
        if (line === "") {
          if (para.length > 0) break;
          continue;
        }
        para.push(line);
      }
    }
  }

  const text = para.join(" ").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  // Truncate at a word boundary.
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > maxChars - 40 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

interface LoadedArticle {
  scope: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  readingMinutes: number;
  displayOrder: number;
  metadata: Record<string, unknown>;
}

function loadArticles(): LoadedArticle[] {
  return ARTICLES.map((spec) => {
    const abs = path.resolve(process.cwd(), spec.bodyPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`[seed-kb] Body file not found: ${abs}`);
    }
    const raw = fs.readFileSync(abs, "utf8");
    const body = normaliseText(raw);
    const summary = deriveSummary(body);
    return {
      scope: spec.scope,
      slug: spec.slug,
      title: spec.title,
      summary,
      body,
      readingMinutes: readingMinutesFromBody(body),
      displayOrder: spec.displayOrder,
      metadata: spec.metadata ?? {},
    };
  });
}

// =============================================================================
// DB operations
// =============================================================================

async function upsertArticle(
  db: ReturnType<typeof drizzle>,
  row: LoadedArticle,
): Promise<"inserted" | "updated" | "skipped"> {
  const result = await db.execute(sql`
    INSERT INTO kb_articles
      (scope, slug, title, summary, body, reading_minutes, display_order, metadata)
    VALUES (
      ${row.scope},
      ${row.slug},
      ${row.title},
      ${row.summary},
      ${row.body},
      ${row.readingMinutes},
      ${row.displayOrder},
      ${JSON.stringify(row.metadata)}::jsonb
    )
    ON CONFLICT (scope, slug) DO UPDATE SET
      title           = EXCLUDED.title,
      summary         = EXCLUDED.summary,
      body            = EXCLUDED.body,
      reading_minutes = EXCLUDED.reading_minutes,
      display_order   = EXCLUDED.display_order,
      metadata        = EXCLUDED.metadata,
      updated_at      = CASE
        WHEN kb_articles.title         IS DISTINCT FROM EXCLUDED.title
          OR kb_articles.summary       IS DISTINCT FROM EXCLUDED.summary
          OR kb_articles.body          IS DISTINCT FROM EXCLUDED.body
          OR kb_articles.reading_minutes IS DISTINCT FROM EXCLUDED.reading_minutes
          OR kb_articles.display_order IS DISTINCT FROM EXCLUDED.display_order
          OR kb_articles.metadata      IS DISTINCT FROM EXCLUDED.metadata
        THEN now()
        ELSE kb_articles.updated_at
      END
    RETURNING
      (xmax = 0)            AS was_inserted,
      (updated_at = now())  AS was_updated
  `);

  const r0 = result.rows[0] as { was_inserted: boolean; was_updated: boolean } | undefined;
  if (!r0) return "skipped";
  if (r0.was_inserted) return "inserted";
  if (r0.was_updated) return "updated";
  return "skipped";
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  console.log(`\n[seed-kb] Starting${isDryRun ? " (DRY RUN)" : ""}...`);

  let articles: LoadedArticle[];
  try {
    articles = loadArticles();
  } catch (err) {
    console.error("[seed-kb] Load error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log(`  Articles: ${articles.length}`);
  for (const a of articles) {
    console.log(
      `   - [${a.scope}] ${a.slug}: "${a.title}" (${a.body.length} body chars, ~${a.readingMinutes} min)`,
    );
    console.log(`     summary: ${a.summary.slice(0, 120)}${a.summary.length > 120 ? "…" : ""}`);
  }

  if (isDryRun) {
    console.log(`\n[seed-kb] DRY RUN — no database writes. ${articles.length} article(s) would be upserted.\n`);
    return;
  }

  // --- Connect ---------------------------------------------------------------
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("[seed-kb] DATABASE_URL is not set. Cannot connect.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const db = drizzle(pool);

  // --- Verify table exists ---------------------------------------------------
  try {
    const tableCheck = await db.execute(sql`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'kb_articles'
    `);
    if ((tableCheck.rows as Array<{ tablename: string }>).length === 0) {
      console.error("[seed-kb] Table kb_articles does not exist. Run migrations first: pnpm db:push");
      await pool.end();
      process.exit(1);
    }
  } catch (err) {
    console.error("[seed-kb] DB connect/verify failed:", err);
    await pool.end();
    process.exit(1);
  }

  // --- Upsert ----------------------------------------------------------------
  let inserted = 0,
    updated = 0,
    skipped = 0;
  for (const a of articles) {
    const out = await upsertArticle(db, a);
    if (out === "inserted") inserted++;
    else if (out === "updated") updated++;
    else skipped++;
    console.log(`   ${out === "inserted" ? "+" : out === "updated" ? "~" : "="} ${a.slug}: ${out}`);
  }

  console.log(`\n[seed-kb] Done. ${inserted} inserted, ${updated} updated, ${skipped} skipped.\n`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-kb] Fatal error:", err);
  process.exit(1);
});
