// C2 — smoke test for the plugin seeder.
//
// Asserts that after running scripts/seed-plugins.ts, the global rows the brief
// requires are present. We do NOT re-run the seeder inside the test — it ran in
// the build pipeline against the live Neon DB. The test reads expected counts
// against the OWNER pool (bypasses RLS) so we measure what's actually persisted.
//
// Brief: 2 plugins / 11 skills / 6 plugin_skills / ≥40 asset_files.

import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  plugins,
  skills,
  pluginSkills,
  assetFiles,
} from "@/lib/db/schema";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  max: 2,
});
const db = drizzle(pool);

afterAll(async () => {
  await pool.end();
});

describe("C2 — seed-plugins smoke", () => {
  it("≥2 global plugins are present", async () => {
    const rows = await db
      .select({ slug: plugins.slug })
      .from(plugins)
      .where(eq(plugins.scope, "global"));
    const expected = ["prompt-builder", "pyramid-principle"];
    for (const want of expected) {
      expect(rows.some((r) => r.slug === want)).toBe(true);
    }
  });

  it("≥11 global skills are present (5 standalone + 6 nested)", async () => {
    const standaloneSlugs = [
      "agent-builder",
      "analyze-earnings",
      "extract-data",
      "flowchart",
      "research",
    ];
    const nestedSlugs = [
      "prompt-builder--prompt-builder",
      "pyramid-principle--pyramid-audit",
      "pyramid-principle--pyramid-long-form",
      "pyramid-principle--pyramid-presentation",
      "pyramid-principle--pyramid-principle-core",
      "pyramid-principle--pyramid-short-form",
    ];
    const rows = await db
      .select({ slug: skills.slug })
      .from(skills)
      .where(eq(skills.scope, "global"));
    for (const want of [...standaloneSlugs, ...nestedSlugs]) {
      expect(rows.some((r) => r.slug === want)).toBe(true);
    }
  });

  it("plugin_skills join has at least 6 rows linking the seeded plugins", async () => {
    // Count rows on plugin_skills where the plugin slug is one of the seeded plugins.
    const result = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM plugin_skills ps
      JOIN plugins p ON p.id = ps.plugin_id
      WHERE p.scope = 'global'
        AND p.slug IN ('prompt-builder', 'pyramid-principle')
    `);
    const { rows } = result as unknown as { rows: { count: number }[] };
    expect(rows[0]!.count).toBeGreaterThanOrEqual(6);
  });

  it("≥40 asset_files exist across the seeded plugins+skills", async () => {
    const result = await db.execute<{ count: number }>(sql`
      WITH global_plugin_ids AS (
        SELECT id FROM plugins WHERE scope = 'global'
      ),
      global_skill_ids AS (
        SELECT id FROM skills WHERE scope = 'global'
      )
      SELECT COUNT(*)::int AS count
      FROM asset_files af
      WHERE af.plugin_id IN (SELECT id FROM global_plugin_ids)
         OR af.skill_id  IN (SELECT id FROM global_skill_ids)
    `);
    const { rows } = result as unknown as { rows: { count: number }[] };
    expect(rows[0]!.count).toBeGreaterThanOrEqual(40);
  });

  it("audience metadata is set on each seeded plugin/skill", async () => {
    const pluginRows = await db
      .select({ slug: plugins.slug, metadata: plugins.metadata })
      .from(plugins)
      .where(eq(plugins.scope, "global"));
    for (const r of pluginRows) {
      if (!["prompt-builder", "pyramid-principle"].includes(r.slug)) continue;
      const audience = (r.metadata as { audience?: string[] } | null)?.audience;
      expect(Array.isArray(audience)).toBe(true);
      expect(audience!.length).toBeGreaterThan(0);
    }
    const skillRows = await db
      .select({ slug: skills.slug, metadata: skills.metadata })
      .from(skills)
      .where(eq(skills.scope, "global"));
    const wantSkillAudience = [
      "analyze-earnings",
      "extract-data",
      "flowchart",
      "research",
      "agent-builder",
    ];
    for (const r of skillRows) {
      if (!wantSkillAudience.includes(r.slug)) continue;
      const audience = (r.metadata as { audience?: string[] } | null)?.audience;
      expect(Array.isArray(audience)).toBe(true);
      expect(audience!.length).toBeGreaterThan(0);
    }
  });
});
