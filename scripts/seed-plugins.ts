// scripts/seed-plugins.ts — C2: Seed the Plugin & Skill Library from 7 external sources.
//
// Behavior:
//   - Each source path becomes a plugin OR a skill at scope='global'.
//   - Plugins with nested skills (under <root>/skills/<name>/) become parent
//     plugin rows + one skill row per nested skill + plugin_skills join rows.
//   - Recursive file walker collects an allowlisted set of file paths under
//     each plugin/skill root and writes them to asset_files (one row per file).
//   - Idempotent: upsert by (scope, slug); only rewrite asset_files rows whose
//     sha256 differs (or insert if missing).
//
// Run via:  pnpm run plugins:seed
//
// File-inclusion allowlist (per the build brief):
//   SKILL.md, README.md, CLAUDE.md, plugin.json, metadata.json
//   + .md / .json / .ts / .py under
//     skills/, commands/, agents/, references/, examples/, variants/
// Skip:
//   .git/, node_modules/, .next/, dist/, .DS_Store, files > 1 MB.

import "dotenv/config";
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  plugins,
  skills,
  pluginSkills,
  assetFiles,
} from "@/lib/db/schema";

config({ path: ".env.local" });
if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket as unknown as typeof neonConfig.webSocketConstructor;
}

// ---- Sources ---------------------------------------------------------------

interface SourceSpec {
  kind: "plugin" | "skill";
  slug: string;
  root: string;
  title: string;
  description: string;
  version: string;
  sourceUrl?: string;
  audience: string[];
}

const SOURCES: SourceSpec[] = [
  {
    kind: "plugin",
    slug: "prompt-builder",
    root: "/Users/tyroneross/dev/git-folder/prompt-builder",
    title: "Prompt Builder",
    description:
      "Classify, diagnose, rewrite, and score prompts by model tier and deployment.",
    version: "0.1.2",
    sourceUrl: "https://github.com/tyroneross/prompt-builder",
    audience: ["general", "developer"],
  },
  {
    kind: "plugin",
    slug: "pyramid-principle",
    root: "/Users/tyroneross/dev/git-folder/pyramid-principle",
    title: "Pyramid Principle",
    description:
      "Barbara Minto's Pyramid Principle for short-form, long-form, presentations, and audits.",
    version: "0.1.2",
    sourceUrl: "https://github.com/tyroneross/pyramid-principle",
    audience: ["general", "communication"],
  },
  {
    kind: "skill",
    slug: "agent-builder",
    root: "/Users/tyroneross/dev/git-folder/RossLabs-AI-Toolkit/skills/agent-builder",
    title: "Agent Builder",
    description:
      "Design, evaluate, and improve agentic harnesses for developer tools, assistants, workflow runtimes, copilots, and AI-powered products.",
    version: "0.1.0",
    audience: ["general", "developer"],
  },
  {
    kind: "skill",
    slug: "analyze-earnings",
    root: "/Users/tyroneross/dev/git-folder/stratagem/plugin/skills/analyze-earnings",
    title: "Analyze Earnings",
    description: "Extract and reason about quarterly earnings releases.",
    version: "0.1.0",
    audience: ["finance"],
  },
  {
    kind: "skill",
    slug: "extract-data",
    root: "/Users/tyroneross/dev/git-folder/stratagem/plugin/skills/extract-data",
    title: "Extract Data",
    description: "Pull structured data out of unstructured documents.",
    version: "0.1.0",
    audience: ["general"],
  },
  {
    kind: "skill",
    slug: "flowchart",
    root: "/Users/tyroneross/dev/git-folder/stratagem/plugin/skills/flowchart",
    title: "Flowchart",
    description: "Render decision and process flowcharts.",
    version: "0.1.0",
    audience: ["general", "communication"],
  },
  {
    kind: "skill",
    slug: "research",
    root: "/Users/tyroneross/dev/git-folder/stratagem/plugin/skills/research",
    title: "Research",
    description: "Run structured research workflows with citation tracking.",
    version: "0.1.0",
    audience: ["general", "healthcare"],
  },
];

// ---- Walker ----------------------------------------------------------------

const ROOT_LEVEL_FILES = new Set([
  "SKILL.md",
  "README.md",
  "CLAUDE.md",
  "plugin.json",
  "metadata.json",
]);
const SUBDIR_ALLOWLIST = new Set([
  "skills",
  "commands",
  "agents",
  "references",
  "examples",
  "variants",
]);
const SUBDIR_EXTS = new Set([".md", ".json", ".ts", ".py"]);
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  ".turbo",
  "build",
  "out",
  ".venv",
  "venv",
  "__pycache__",
]);
const MAX_BYTES = 1024 * 1024; // 1 MB

interface CollectedFile {
  relPath: string;
  absPath: string;
  size: number;
  sha256: string;
  contentType: string;
  content: string;
}

function classifyContentType(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".md") return "text/markdown";
  if (ext === ".json") return "application/json";
  if (ext === ".ts") return "application/typescript";
  if (ext === ".py") return "text/x-python";
  return "text/plain";
}

function listFilesUnderSubdir(
  root: string,
  subdir: string,
  out: CollectedFile[],
  filter: (relUnderSubdir: string) => boolean,
) {
  const subAbs = path.join(root, subdir);
  if (!fs.existsSync(subAbs) || !fs.statSync(subAbs).isDirectory()) return;
  walk(subAbs, subdir);

  function walk(dir: string, relDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".DS_Store") continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), path.join(relDir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.join(relDir, entry.name);
      if (!filter(rel)) continue;
      const abs = path.join(dir, entry.name);
      const stat = fs.statSync(abs);
      if (stat.size > MAX_BYTES) continue;
      const buf = fs.readFileSync(abs);
      out.push({
        relPath: rel,
        absPath: abs,
        size: stat.size,
        sha256: crypto.createHash("sha256").update(buf).digest("hex"),
        contentType: classifyContentType(entry.name),
        content: buf.toString("utf8"),
      });
    }
  }
}

function collectAssetFiles(root: string): CollectedFile[] {
  const out: CollectedFile[] = [];
  // 1) Root-level allowlist
  for (const name of ROOT_LEVEL_FILES) {
    const abs = path.join(root, name);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > MAX_BYTES) continue;
    const buf = fs.readFileSync(abs);
    out.push({
      relPath: name,
      absPath: abs,
      size: stat.size,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      contentType: classifyContentType(name),
      content: buf.toString("utf8"),
    });
  }
  // 2) Whitelisted subdirs — by extension
  for (const sub of SUBDIR_ALLOWLIST) {
    listFilesUnderSubdir(root, sub, out, (rel) =>
      SUBDIR_EXTS.has(path.extname(rel).toLowerCase()),
    );
  }
  return out;
}

/**
 * For a plugin source: find nested skill directories under <root>/skills/<name>/
 * that have at least a SKILL.md, README.md, or plugin.json. Each becomes its own
 * skill row with files restricted to that subtree.
 */
function discoverNestedSkills(
  pluginRoot: string,
): Array<{ name: string; root: string; files: CollectedFile[] }> {
  const skillsDir = path.join(pluginRoot, "skills");
  if (!fs.existsSync(skillsDir)) return [];
  if (!fs.statSync(skillsDir).isDirectory()) return [];
  const out: Array<{ name: string; root: string; files: CollectedFile[] }> = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const skillRoot = path.join(skillsDir, entry.name);
    const hasManifest = ["SKILL.md", "README.md", "plugin.json", "CLAUDE.md"].some(
      (m) => fs.existsSync(path.join(skillRoot, m)),
    );
    if (!hasManifest) continue;
    const files = collectAssetFiles(skillRoot);
    if (files.length === 0) continue;
    out.push({ name: entry.name, root: skillRoot, files });
  }
  return out;
}

// ---- Upsert helpers --------------------------------------------------------

type Db = ReturnType<typeof drizzle>;

async function upsertPlugin(
  db: Db,
  spec: { slug: string; title: string; description: string; version: string; sourceUrl?: string; audience: string[] },
): Promise<string> {
  const existing = await db
    .select({ id: plugins.id })
    .from(plugins)
    .where(and(eq(plugins.scope, "global"), eq(plugins.slug, spec.slug)));
  if (existing.length > 0) {
    await db
      .update(plugins)
      .set({
        title: spec.title,
        description: spec.description,
        version: spec.version,
        sourceUrl: spec.sourceUrl ?? null,
        metadata: sql`jsonb_set(coalesce(metadata, '{}'::jsonb), '{audience}', ${JSON.stringify(spec.audience)}::jsonb, true)`,
        updatedAt: new Date(),
      })
      .where(eq(plugins.id, existing[0]!.id));
    return existing[0]!.id;
  }
  const [row] = await db
    .insert(plugins)
    .values({
      scope: "global",
      slug: spec.slug,
      title: spec.title,
      description: spec.description,
      version: spec.version,
      sourceUrl: spec.sourceUrl ?? null,
      metadata: { audience: spec.audience },
    })
    .returning({ id: plugins.id });
  return row!.id;
}

async function upsertSkill(
  db: Db,
  spec: { slug: string; title: string; description: string; version: string; sourceUrl?: string; audience: string[] },
): Promise<string> {
  const existing = await db
    .select({ id: skills.id })
    .from(skills)
    .where(and(eq(skills.scope, "global"), eq(skills.slug, spec.slug)));
  if (existing.length > 0) {
    await db
      .update(skills)
      .set({
        title: spec.title,
        description: spec.description,
        version: spec.version,
        sourceUrl: spec.sourceUrl ?? null,
        metadata: sql`jsonb_set(coalesce(metadata, '{}'::jsonb), '{audience}', ${JSON.stringify(spec.audience)}::jsonb, true)`,
        updatedAt: new Date(),
      })
      .where(eq(skills.id, existing[0]!.id));
    return existing[0]!.id;
  }
  const [row] = await db
    .insert(skills)
    .values({
      scope: "global",
      slug: spec.slug,
      title: spec.title,
      description: spec.description,
      version: spec.version,
      sourceUrl: spec.sourceUrl ?? null,
      metadata: { audience: spec.audience },
    })
    .returning({ id: skills.id });
  return row!.id;
}

async function syncAssetFiles(
  db: Db,
  target: { pluginId?: string; skillId?: string },
  files: CollectedFile[],
): Promise<{ inserted: number; updated: number; deleted: number }> {
  // Pull existing
  const cond = target.pluginId
    ? eq(assetFiles.pluginId, target.pluginId)
    : eq(assetFiles.skillId, target.skillId!);
  const existing = await db
    .select({
      id: assetFiles.id,
      path: assetFiles.path,
      sha256: assetFiles.sha256,
    })
    .from(assetFiles)
    .where(cond);
  const byPath = new Map(existing.map((r) => [r.path, r]));
  let inserted = 0;
  let updated = 0;
  for (const file of files) {
    const prev = byPath.get(file.relPath);
    if (!prev) {
      await db.insert(assetFiles).values({
        pluginId: target.pluginId ?? null,
        skillId: target.skillId ?? null,
        path: file.relPath,
        content: file.content,
        contentType: file.contentType,
        sha256: file.sha256,
        sizeBytes: file.size,
      });
      inserted++;
    } else if (prev.sha256 !== file.sha256) {
      await db
        .update(assetFiles)
        .set({
          content: file.content,
          contentType: file.contentType,
          sha256: file.sha256,
          sizeBytes: file.size,
          updatedAt: new Date(),
        })
        .where(eq(assetFiles.id, prev.id));
      updated++;
    }
    byPath.delete(file.relPath);
  }
  // Remaining entries in byPath are gone from source — delete them.
  let deleted = 0;
  if (byPath.size > 0) {
    const idsToDelete = Array.from(byPath.values()).map((r) => r.id);
    await db.delete(assetFiles).where(inArray(assetFiles.id, idsToDelete));
    deleted = idsToDelete.length;
  }
  return { inserted, updated, deleted };
}

// ---- Main ------------------------------------------------------------------

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL required.");
  }
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  let pluginCount = 0;
  let skillCount = 0;
  let joinCount = 0;
  let fileCount = 0;

  try {
    for (const src of SOURCES) {
      if (!fs.existsSync(src.root)) {
        console.warn(`⚠ Source missing: ${src.root} — skipping ${src.slug}`);
        continue;
      }

      if (src.kind === "plugin") {
        const pluginId = await upsertPlugin(db, src);
        const pluginFiles = collectAssetFiles(src.root);
        const stats = await syncAssetFiles(db, { pluginId }, pluginFiles);
        fileCount += pluginFiles.length;
        pluginCount++;
        console.log(
          `✓ plugin ${src.slug} (${pluginFiles.length} files, +${stats.inserted}/~${stats.updated}/-${stats.deleted})`,
        );

        // Nested skills under <root>/skills/
        const nested = discoverNestedSkills(src.root);
        let position = 0;
        for (const ns of nested) {
          const childSlug = `${src.slug}--${ns.name}`;
          const childSpec = {
            slug: childSlug,
            title: ns.name,
            description: `Skill from the ${src.title} plugin.`,
            version: src.version,
            sourceUrl: src.sourceUrl,
            audience: src.audience,
          };
          const skillId = await upsertSkill(db, childSpec);
          const stats2 = await syncAssetFiles(db, { skillId }, ns.files);
          fileCount += ns.files.length;
          skillCount++;
          console.log(
            `  ↳ skill ${childSlug} (${ns.files.length} files, +${stats2.inserted}/~${stats2.updated}/-${stats2.deleted})`,
          );

          // Upsert plugin_skills join
          const existingJoin = await db
            .select({ p: pluginSkills.pluginId, s: pluginSkills.skillId })
            .from(pluginSkills)
            .where(
              and(
                eq(pluginSkills.pluginId, pluginId),
                eq(pluginSkills.skillId, skillId),
              ),
            );
          if (existingJoin.length === 0) {
            await db
              .insert(pluginSkills)
              .values({ pluginId, skillId, position });
          } else {
            await db
              .update(pluginSkills)
              .set({ position })
              .where(
                and(
                  eq(pluginSkills.pluginId, pluginId),
                  eq(pluginSkills.skillId, skillId),
                ),
              );
          }
          joinCount++;
          position++;
        }
      } else {
        // Standalone skill
        const skillId = await upsertSkill(db, src);
        const skillFiles = collectAssetFiles(src.root);
        const stats = await syncAssetFiles(db, { skillId }, skillFiles);
        fileCount += skillFiles.length;
        skillCount++;
        console.log(
          `✓ skill ${src.slug} (${skillFiles.length} files, +${stats.inserted}/~${stats.updated}/-${stats.deleted})`,
        );
      }
    }
  } finally {
    await pool.end();
  }

  console.log(
    `\nDone. plugins=${pluginCount} skills=${skillCount} plugin_skills=${joinCount} asset_files_processed=${fileCount}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
