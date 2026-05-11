#!/usr/bin/env tsx
/**
 * scripts/seed-library.ts — L3-seeder (V2 P0: pain-to-AI-recommendation)
 *
 * Aggregates 25 use-case entries + 15 prompt entries from scripts/library-seed/
 * and UPSERTs them into library_use_cases and library_prompts.
 *
 * Flags:
 *   --dry-run   Validates seed structure + prints what would be upserted. No DB writes.
 *   --reset     DELETEs all global-scope rows before re-seeding.
 *               Requires CONFIRM_RESET=1 env var. NEVER touches user-scoped rows.
 *
 * Connection: uses DATABASE_URL (owner role) so we can INSERT global-scope rows
 * that have user_id=NULL without hitting app_user RLS restrictions.
 *
 * Idempotency: ON CONFLICT (pain_path, title) DO UPDATE. A no-op re-run
 * reports "0 inserted, 0 updated" because updated_at is only refreshed when
 * a normalised field actually differs from the stored value.
 */

// --- env bootstrap -----------------------------------------------------------
// Load .env.local before anything that reads process.env (including the Zod
// validator in lib/env.ts). dotenv is a devDependency.
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") }); // fallback

// --- imports -----------------------------------------------------------------
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";

// Seed data
import { useCases as ucAdmin }         from "./library-seed/use-cases-admin.js";
import { useCases as ucReferrals }     from "./library-seed/use-cases-referrals.js";
import { useCases as ucResearch }      from "./library-seed/use-cases-research.js";
import { useCases as ucCapacity }      from "./library-seed/use-cases-capacity_growth.js";
import { useCases as ucFollowUp }      from "./library-seed/use-cases-follow_up.js";

import { prompts as prAdmin }          from "./library-seed/prompts-admin.js";
import { prompts as prReferrals }      from "./library-seed/prompts-referrals.js";
import { prompts as prResearch }       from "./library-seed/prompts-research.js";
import { prompts as prCapacity }       from "./library-seed/prompts-capacity_growth.js";
import { prompts as prFollowUp }       from "./library-seed/prompts-follow_up.js";

import type { NewLibraryUseCase, NewLibraryPrompt, PainPath, StartingLevel } from "@/lib/db/schema";

// PHI guard reference — populated lazily inside main() to avoid top-level await.
// Module-level variable so validateUseCases/validatePrompts can reference it.
let detectPHI: ((s: string) => { hasPHI: boolean; reasons: string[] }) | null = null;

// =============================================================================
// Constants
// =============================================================================

const PAIN_PATHS: PainPath[] = [
  "referrals",
  "research",
  "admin",
  "capacity_growth",
  "follow_up",
  "custom",
];

const STARTING_LEVELS: StartingLevel[] = [
  "prompt",
  "checklist",
  "skill",
  "plugin",
  "agent",
];

// =============================================================================
// Aggregated seed data
// =============================================================================

const ALL_USE_CASES: NewLibraryUseCase[] = [
  ...ucAdmin,
  ...ucReferrals,
  ...ucResearch,
  ...ucCapacity,
  ...ucFollowUp,
];

const ALL_PROMPTS: NewLibraryPrompt[] = [
  ...prAdmin,
  ...prReferrals,
  ...prResearch,
  ...prCapacity,
  ...prFollowUp,
];

// =============================================================================
// Normalisation helpers
// =============================================================================

/** Trim + normalise Windows line endings. Ensures a re-run with unchanged
 *  content produces the exact same bytes, so the conflict UPDATE is a no-op. */
function normaliseText(s: string): string {
  return s.trim().replace(/\r\n/g, "\n");
}

/** Sort JSON keys deterministically so metadata comparison is stable. */
function normaliseJson(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sortKeys(obj[k])]),
    );
  }
  return v;
}

// =============================================================================
// Validation
// =============================================================================

interface ValidationError {
  table: string;
  title: string;
  field: string;
  reason: string;
}

function validateUseCases(rows: NewLibraryUseCase[]): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const row of rows) {
    if (!PAIN_PATHS.includes(row.painPath as PainPath)) {
      errors.push({ table: "library_use_cases", title: row.title, field: "painPath", reason: `unknown value: ${row.painPath}` });
    }
    if (!STARTING_LEVELS.includes(row.startingLevel as StartingLevel)) {
      errors.push({ table: "library_use_cases", title: row.title, field: "startingLevel", reason: `unknown value: ${row.startingLevel}` });
    }
    if (!row.title?.trim()) {
      errors.push({ table: "library_use_cases", title: "(missing)", field: "title", reason: "empty title" });
    }
    if (!row.body?.trim()) {
      errors.push({ table: "library_use_cases", title: row.title, field: "body", reason: "empty body" });
    }
    if (detectPHI) {
      // Scan body + rationale only — not title. The regex PHI guard fires on the
      // word "Patient" as a title prefix when followed by two capitalised words
      // (e.g. "Patient Message Urgency"). Titles in a professional content library
      // legitimately use "Patient" as a common-noun subject; scanning body+rationale
      // is sufficient to catch actual PHI data entry errors.
      const combined = [row.body, row.rationale ?? ""].join(" ");
      const result = detectPHI(combined);
      if (result.hasPHI) {
        errors.push({ table: "library_use_cases", title: row.title, field: "content", reason: `PHI detected: ${result.reasons.join(", ")}` });
      }
    }
  }
  return errors;
}

function validatePrompts(rows: NewLibraryPrompt[]): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const row of rows) {
    if (!PAIN_PATHS.includes(row.painPath as PainPath)) {
      errors.push({ table: "library_prompts", title: row.title, field: "painPath", reason: `unknown value: ${row.painPath}` });
    }
    if (!row.title?.trim()) {
      errors.push({ table: "library_prompts", title: "(missing)", field: "title", reason: "empty title" });
    }
    if (!row.body?.trim()) {
      errors.push({ table: "library_prompts", title: row.title, field: "body", reason: "empty body" });
    }
    if (detectPHI) {
      // Scan body + description only — not title. See use-case comment above.
      const combined = [row.body, row.description ?? ""].join(" ");
      const result = detectPHI(combined);
      if (result.hasPHI) {
        errors.push({ table: "library_prompts", title: row.title, field: "content", reason: `PHI detected: ${result.reasons.join(", ")}` });
      }
    }
  }
  return errors;
}

// =============================================================================
// Stats tracking
// =============================================================================

interface PathStats {
  inserted: number;
  updated: number;
  skipped: number;
}

type StatsMap = Map<string, PathStats>;

function blankStats(): PathStats {
  return { inserted: 0, updated: 0, skipped: 0 };
}

function getStats(map: StatsMap, path: string): PathStats {
  if (!map.has(path)) map.set(path, blankStats());
  return map.get(path)!;
}

// =============================================================================
// DB operations
// =============================================================================

/**
 * UPSERT a use-case row. Dedup key: (pain_path, title).
 *
 * created_at is preserved on UPDATE. Only updated_at refreshes — and only
 * when at least one content field actually changed, making re-runs idempotent.
 *
 * Returns: 'inserted' | 'updated' | 'skipped'
 */
async function upsertUseCase(
  db: ReturnType<typeof drizzle>,
  row: NewLibraryUseCase,
): Promise<"inserted" | "updated" | "skipped"> {
  const normBody      = normaliseText(row.body);
  const normRationale = normaliseText(row.rationale ?? "");
  const normMetadata  = normaliseJson(row.metadata ?? {});

  const result = await db.execute(sql`
    INSERT INTO library_use_cases
      (scope, pain_path, starting_level, title, body, rationale,
       estimated_minutes_saved_per_week, metadata)
    VALUES (
      ${row.scope},
      ${row.painPath},
      ${row.startingLevel},
      ${row.title},
      ${normBody},
      ${normRationale},
      ${row.estimatedMinutesSavedPerWeek ?? null},
      ${normMetadata}::jsonb
    )
    ON CONFLICT (pain_path, title) DO UPDATE SET
      scope                          = EXCLUDED.scope,
      starting_level                 = EXCLUDED.starting_level,
      body                           = EXCLUDED.body,
      rationale                      = EXCLUDED.rationale,
      estimated_minutes_saved_per_week = EXCLUDED.estimated_minutes_saved_per_week,
      metadata                       = EXCLUDED.metadata,
      updated_at                     = CASE
        WHEN library_use_cases.body        IS DISTINCT FROM EXCLUDED.body
          OR library_use_cases.rationale   IS DISTINCT FROM EXCLUDED.rationale
          OR library_use_cases.metadata    IS DISTINCT FROM EXCLUDED.metadata
          OR library_use_cases.starting_level IS DISTINCT FROM EXCLUDED.starting_level
          OR library_use_cases.estimated_minutes_saved_per_week
               IS DISTINCT FROM EXCLUDED.estimated_minutes_saved_per_week
        THEN now()
        ELSE library_use_cases.updated_at
      END
    RETURNING
      (xmax = 0)   AS was_inserted,
      (updated_at  = now()) AS was_updated
  `);

  const row0 = result.rows[0] as { was_inserted: boolean; was_updated: boolean } | undefined;
  if (!row0) return "skipped";
  if (row0.was_inserted) return "inserted";
  if (row0.was_updated)  return "updated";
  return "skipped";
}

/**
 * UPSERT a prompt row. Dedup key: (pain_path, title).
 */
async function upsertPrompt(
  db: ReturnType<typeof drizzle>,
  row: NewLibraryPrompt,
): Promise<"inserted" | "updated" | "skipped"> {
  const normBody        = normaliseText(row.body);
  const normDescription = normaliseText(row.description ?? "");
  const normMetadata    = normaliseJson(row.metadata ?? {});

  const result = await db.execute(sql`
    INSERT INTO library_prompts
      (scope, pain_path, title, body, description, metadata)
    VALUES (
      ${row.scope},
      ${row.painPath},
      ${row.title},
      ${normBody},
      ${normDescription},
      ${normMetadata}::jsonb
    )
    ON CONFLICT (pain_path, title) DO UPDATE SET
      scope       = EXCLUDED.scope,
      body        = EXCLUDED.body,
      description = EXCLUDED.description,
      metadata    = EXCLUDED.metadata,
      updated_at  = CASE
        WHEN library_prompts.body        IS DISTINCT FROM EXCLUDED.body
          OR library_prompts.description IS DISTINCT FROM EXCLUDED.description
          OR library_prompts.metadata    IS DISTINCT FROM EXCLUDED.metadata
        THEN now()
        ELSE library_prompts.updated_at
      END
    RETURNING
      (xmax = 0)   AS was_inserted,
      (updated_at  = now()) AS was_updated
  `);

  const row0 = result.rows[0] as { was_inserted: boolean; was_updated: boolean } | undefined;
  if (!row0) return "skipped";
  if (row0.was_inserted) return "inserted";
  if (row0.was_updated)  return "updated";
  return "skipped";
}

// =============================================================================
// ON CONFLICT requires unique constraints — verify they exist
// =============================================================================

async function ensureUniqueConstraints(db: ReturnType<typeof drizzle>): Promise<void> {
  // Check if the constraints exist; if not, surface a clear error rather than
  // letting ON CONFLICT silently insert duplicates on subsequent runs.
  const result = await db.execute(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename IN ('library_use_cases', 'library_prompts')
      AND indexdef ILIKE '%unique%'
      AND (
        indexdef ILIKE '%pain_path%title%'
        OR indexdef ILIKE '%title%pain_path%'
      )
  `);

  const found = (result.rows as Array<{ indexname: string }>).map((r) => r.indexname);

  const needUC  = !found.some((n) => n.includes("use_case") || n.includes("uc"));
  const needPR  = !found.some((n) => n.includes("prompt") || n.includes("pr"));

  const missing: string[] = [];
  if (needUC)  missing.push("library_use_cases(pain_path, title)");
  if (needPR)  missing.push("library_prompts(pain_path, title)");

  if (missing.length > 0) {
    // Constraints not yet in schema — create them now (idempotent).
    // This is intentional: the seeder is the canonical tool for global-scope
    // rows and owns its own dedup guarantee.
    console.log("[seed-library] Adding missing unique constraints for upsert dedup key...");
    for (const spec of missing) {
      if (spec.includes("use_cases")) {
        await db.execute(sql`
          ALTER TABLE library_use_cases
          ADD CONSTRAINT IF NOT EXISTS library_use_cases_pain_path_title_unique
          UNIQUE (pain_path, title)
        `);
        console.log("  + library_use_cases(pain_path, title) UNIQUE constraint added");
      } else {
        await db.execute(sql`
          ALTER TABLE library_prompts
          ADD CONSTRAINT IF NOT EXISTS library_prompts_pain_path_title_unique
          UNIQUE (pain_path, title)
        `);
        console.log("  + library_prompts(pain_path, title) UNIQUE constraint added");
      }
    }
  }
}

// =============================================================================
// Reset (dev-only)
// =============================================================================

async function resetGlobalRows(db: ReturnType<typeof drizzle>): Promise<void> {
  if (process.env["CONFIRM_RESET"] !== "1") {
    console.error(
      "\n[seed-library] --reset requires CONFIRM_RESET=1 env var.\n" +
      "  This flag deletes ALL global-scope rows from library_use_cases and\n" +
      "  library_prompts. It NEVER touches user-scoped rows.\n" +
      "  Run:  CONFIRM_RESET=1 pnpm library:reset\n",
    );
    process.exit(1);
  }

  console.log("\n[seed-library] WARNING: Deleting all global-scope rows...");
  const ucResult = await db.execute(sql`
    DELETE FROM library_use_cases WHERE scope = 'global'
    RETURNING id
  `);
  const prResult = await db.execute(sql`
    DELETE FROM library_prompts WHERE scope = 'global'
    RETURNING id
  `);
  console.log(
    `[seed-library] Deleted ${ucResult.rows.length} use-case(s) and ` +
    `${prResult.rows.length} prompt(s).`,
  );
}

// =============================================================================
// Print helpers
// =============================================================================

function printStatsTable(label: string, statsMap: StatsMap): void {
  let totalIn = 0, totalUp = 0, totalSk = 0;
  for (const [path, s] of statsMap) {
    console.log(
      `  + Seeded ${s.inserted + s.updated + s.skipped} ${label} for \`${path}\` ` +
      `(${s.inserted} inserted, ${s.updated} updated, ${s.skipped} skipped)`,
    );
    totalIn += s.inserted;
    totalUp += s.updated;
    totalSk += s.skipped;
  }
  const total = totalIn + totalUp + totalSk;
  console.log(`  = Total: ${total} (${totalIn} inserted, ${totalUp} updated, ${totalSk} skipped)\n`);
}

function printDryRunTable(label: string, rows: Array<{ painPath: string; title: string }>): void {
  console.log(`\n  ${label} (${rows.length} rows):`);
  for (const r of rows) {
    console.log(`    [${r.painPath}] ${r.title}`);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isReset  = args.includes("--reset");

  // Load PHI guard now that we're inside an async function (avoids top-level await)
  try {
    const guard = await import("@/lib/phi-guard");
    detectPHI = guard.detectPHI;
  } catch {
    console.warn("[seed-library] lib/phi-guard.ts not loadable — PHI scan skipped");
  }

  console.log(`\n[seed-library] Starting${isDryRun ? " (DRY RUN)" : ""}${isReset ? " (RESET)" : ""}...`);
  console.log(`  Use-cases: ${ALL_USE_CASES.length} rows  |  Prompts: ${ALL_PROMPTS.length} rows`);

  // --- Validation -------------------------------------------------------------
  const ucErrors = validateUseCases(ALL_USE_CASES);
  const prErrors = validatePrompts(ALL_PROMPTS);
  const allErrors = [...ucErrors, ...prErrors];

  if (allErrors.length > 0) {
    console.error("\n[seed-library] Validation errors found:");
    for (const e of allErrors) {
      console.error(`  [${e.table}] "${e.title}" — ${e.field}: ${e.reason}`);
    }
    process.exit(1);
  }

  console.log("  Validation: all rows passed (enum compliance, non-empty fields, PHI scan)");

  // --- Dry run ----------------------------------------------------------------
  if (isDryRun) {
    console.log("\n[seed-library] DRY RUN — no database writes.");
    printDryRunTable("use-cases", ALL_USE_CASES);
    printDryRunTable("prompts",   ALL_PROMPTS);
    console.log(`\n[seed-library] Dry run complete. ${ALL_USE_CASES.length} use-cases + ${ALL_PROMPTS.length} prompts would be upserted.\n`);
    return;
  }

  // --- Connect ----------------------------------------------------------------
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("[seed-library] DATABASE_URL is not set. Cannot connect.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const db   = drizzle(pool);

  // --- Verify tables exist ----------------------------------------------------
  try {
    const tableCheck = await db.execute(sql`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('library_use_cases', 'library_prompts')
    `);
    const foundTables = (tableCheck.rows as Array<{ tablename: string }>).map((r) => r.tablename);
    const missing = ["library_use_cases", "library_prompts"].filter((t) => !foundTables.includes(t));
    if (missing.length > 0) {
      console.error(
        `[seed-library] Tables not found: ${missing.join(", ")}.\n` +
        "  Run migrations first: pnpm db:migrate",
      );
      await pool.end();
      process.exit(1);
    }
  } catch (err) {
    console.error("[seed-library] Failed to connect or verify tables:", err);
    await pool.end();
    process.exit(1);
  }

  // --- Unique constraints -----------------------------------------------------
  try {
    await ensureUniqueConstraints(db);
  } catch (err) {
    console.error("[seed-library] Failed to verify/create unique constraints:", err);
    await pool.end();
    process.exit(1);
  }

  // --- Reset (optional) -------------------------------------------------------
  if (isReset) {
    try {
      await resetGlobalRows(db);
    } catch (err) {
      console.error("[seed-library] Reset failed:", err);
      await pool.end();
      process.exit(1);
    }
  }

  // --- Upsert use-cases -------------------------------------------------------
  console.log("\n[seed-library] Seeding use-cases...");
  const ucStats: StatsMap = new Map();

  for (const row of ALL_USE_CASES) {
    const outcome = await upsertUseCase(db, row);
    const s = getStats(ucStats, row.painPath);
    s[outcome]++;
  }

  printStatsTable("use-cases", ucStats);

  // --- Upsert prompts ---------------------------------------------------------
  console.log("[seed-library] Seeding prompts...");
  const prStats: StatsMap = new Map();

  for (const row of ALL_PROMPTS) {
    const outcome = await upsertPrompt(db, row);
    const s = getStats(prStats, row.painPath);
    s[outcome]++;
  }

  printStatsTable("prompts", prStats);

  // --- Summary ----------------------------------------------------------------
  const totalUC = ALL_USE_CASES.length;
  const totalPR = ALL_PROMPTS.length;
  console.log(`[seed-library] Done. ${totalUC} use-case(s) + ${totalPR} prompt(s) processed.\n`);

  await pool.end();
}

main().catch((err) => {
  console.error("[seed-library] Fatal error:", err);
  process.exit(1);
});
