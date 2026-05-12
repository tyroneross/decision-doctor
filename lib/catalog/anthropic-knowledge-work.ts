// lib/catalog/anthropic-knowledge-work.ts
//
// Server-side fetcher for the anthropics/knowledge-work-plugins upstream
// catalog. Pulls .claude-plugin/marketplace.json, transforms each entry into
// the local UpstreamPlugin shape, and caches the result to .dd-cache/ for 24h.
//
// Failure modes (never throws into render paths):
//   - Network failure with fresh cache       → return cache, log Sentry warning.
//   - Network failure without fresh cache    → return stale cache if present.
//   - Network failure and no cache at all    → return empty array.
//   - Schema parse failure                   → treat as fetch failure.
//
// Per project memory: cache lives under `.dd-cache/`, NOT `.claude/`.

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as Sentry from "@sentry/nextjs";
import type {
  UpstreamPlugin,
  UpstreamPluginMatch,
  UpstreamMarketplaceJson,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UPSTREAM_URL =
  "https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/.claude-plugin/marketplace.json";

const UPSTREAM_REPO_TREE_BASE =
  "https://github.com/anthropics/knowledge-work-plugins/tree/main/";

const UPSTREAM_MARKETPLACE_REF = "anthropics/knowledge-work-plugins";

// 24h TTL.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const CACHE_DIR = path.resolve(process.cwd(), ".dd-cache");
const CACHE_FILE = path.join(CACHE_DIR, "catalog.json");

// Fetch deadline — keep the request short so it never wedges the build.
const FETCH_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// In-memory cache (per-process). The disk cache is the cross-process layer;
// this avoids hammering disk on every recommendation render in the same process.
// ---------------------------------------------------------------------------

interface MemCacheEntry {
  data: UpstreamPlugin[];
  fetchedAtMs: number;
}

let memCache: MemCacheEntry | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowMs(): number {
  return Date.now();
}

function isFresh(fetchedAtMs: number): boolean {
  return nowMs() - fetchedAtMs < CACHE_TTL_MS;
}

function safeWarn(msg: string, extra?: Record<string, unknown>): void {
  // Sentry capture; also console.warn so local dev sees the failure.
  try {
    Sentry.captureMessage(msg, {
      level: "warning",
      extra: { source: "catalog-fetcher", ...extra },
    });
  } catch {
    // Sentry init may be absent in CLI / test contexts.
  }
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.warn(`[catalog] ${msg}`, extra ?? {});
  }
}

/**
 * Transform one upstream plugin entry into the local UpstreamPlugin shape.
 * Pure, no I/O — safe to call repeatedly.
 */
function transformEntry(
  entry: UpstreamMarketplaceJson["plugins"][number],
  fetchedAtIso: string,
): UpstreamPlugin {
  const sourcePath = entry.source.replace(/^\.\//, "");
  const tags = sourcePath
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const installCommand = `/plugin install ${entry.name}@${UPSTREAM_MARKETPLACE_REF}`;
  const repoUrl = `${UPSTREAM_REPO_TREE_BASE}${sourcePath}`;
  return {
    slug: entry.name.toLowerCase(),
    name: entry.name,
    description: entry.description ?? "",
    repoUrl,
    installCommand,
    author: entry.author?.name,
    tags,
    lastFetched: fetchedAtIso,
  };
}

function isValidMarketplaceJson(value: unknown): value is UpstreamMarketplaceJson {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string") return false;
  if (typeof v.owner !== "object" || v.owner === null) return false;
  if (!Array.isArray(v.plugins)) return false;
  // Each plugin minimally needs name + source + description.
  for (const p of v.plugins) {
    if (typeof p !== "object" || p === null) return false;
    const pr = p as Record<string, unknown>;
    if (typeof pr.name !== "string" || pr.name.length === 0) return false;
    if (typeof pr.source !== "string" || pr.source.length === 0) return false;
    if (typeof pr.description !== "string") return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Disk cache I/O
// ---------------------------------------------------------------------------

interface DiskCacheShape {
  fetchedAtMs: number;
  data: UpstreamPlugin[];
}

async function readDiskCache(): Promise<DiskCacheShape | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).fetchedAtMs !== "number" ||
      !Array.isArray((parsed as Record<string, unknown>).data)
    ) {
      return null;
    }
    return parsed as DiskCacheShape;
  } catch {
    return null;
  }
}

async function writeDiskCache(entry: DiskCacheShape): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(entry, null, 2), "utf-8");
  } catch (err) {
    safeWarn("Failed to write catalog cache", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Network fetch
// ---------------------------------------------------------------------------

async function fetchUpstream(): Promise<UpstreamPlugin[] | null> {
  const fetchedAtIso = new Date().toISOString();
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(UPSTREAM_URL, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      // Disable Next.js fetch caching — we manage our own.
      cache: "no-store",
    });
    if (!res.ok) {
      safeWarn(`Upstream returned HTTP ${res.status}`, { url: UPSTREAM_URL });
      return null;
    }
    const json = (await res.json()) as unknown;
    if (!isValidMarketplaceJson(json)) {
      safeWarn("Upstream marketplace.json failed schema validation");
      return null;
    }
    return json.plugins.map((p) => transformEntry(p, fetchedAtIso));
  } catch (err) {
    safeWarn("Upstream fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LoadCatalogOptions {
  /** Bypass cache, force a network fetch. Falls back to cache on fetch failure. */
  forceRefresh?: boolean;
}

/**
 * Load the upstream plugin catalog. Always returns an array (never throws).
 * Empty array means we have nothing fresh and no stale cache to serve from.
 */
export async function loadCatalog(
  opts: LoadCatalogOptions = {},
): Promise<UpstreamPlugin[]> {
  // 1. In-memory cache (fastest path).
  if (!opts.forceRefresh && memCache && isFresh(memCache.fetchedAtMs)) {
    return memCache.data;
  }

  // 2. Disk cache (fresh).
  if (!opts.forceRefresh) {
    const disk = await readDiskCache();
    if (disk && isFresh(disk.fetchedAtMs)) {
      memCache = { data: disk.data, fetchedAtMs: disk.fetchedAtMs };
      return disk.data;
    }
  }

  // 3. Network fetch.
  const fresh = await fetchUpstream();
  if (fresh) {
    const fetchedAtMs = nowMs();
    memCache = { data: fresh, fetchedAtMs };
    await writeDiskCache({ fetchedAtMs, data: fresh });
    return fresh;
  }

  // 4. Stale disk cache (network failed, but we have something old).
  const stale = await readDiskCache();
  if (stale) {
    safeWarn("Serving stale catalog cache after fetch failure", {
      ageMs: nowMs() - stale.fetchedAtMs,
    });
    memCache = { data: stale.data, fetchedAtMs: stale.fetchedAtMs };
    return stale.data;
  }

  // 5. Nothing.
  return [];
}

// ---------------------------------------------------------------------------
// Matcher (engine-side)
// ---------------------------------------------------------------------------

/**
 * Keyword overlap heuristic. We deliberately stay simple at v1; the spec is
 * explicit that score-threshold and keyword-weight calibration is out of
 * scope until we have telemetry to drive it.
 *
 * Returns the top match if at least 2 shared keywords (case-insensitive,
 * single-word tokens). Returns null otherwise — the UI will then surface the
 * generic "Browse plugin catalog →" CTA instead of a specific upstream link.
 *
 * Inputs from the step:
 *   - title (high-signal, weighted x2)
 *   - jobRole, integrations, currentTool (medium)
 *   - tags from valueClass + aiRung (low)
 */
export interface MatchableStep {
  title: string;
  jobRole?: string;
  integrations?: readonly string[];
  currentTool?: string | null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3); // drop "a", "of", "to" etc.
}

const STOP_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "use",
  "data",
  "task",
  "step",
  "tool",
  "tools",
  "across",
  "into",
  "ai",
  "llm",
  "plugin",
  "skill",
]);

function meaningfulTokens(text: string): Set<string> {
  return new Set(tokenize(text).filter((t) => !STOP_TOKENS.has(t)));
}

/**
 * Find a matching upstream plugin for a workflow step. Used by the engine
 * artifact-builder when `step.aiRung === "plugin"`. Catches all errors so
 * the recommendation pipeline never falls over on catalog issues.
 */
export async function findUpstreamPluginMatch(
  step: MatchableStep,
): Promise<UpstreamPluginMatch | null> {
  try {
    const catalog = await loadCatalog();
    if (catalog.length === 0) return null;

    const stepWeighted: string[] = [];
    // Title gets double weight by appending twice.
    stepWeighted.push(step.title, step.title);
    if (step.jobRole) stepWeighted.push(step.jobRole);
    if (step.currentTool) stepWeighted.push(step.currentTool);
    if (step.integrations) stepWeighted.push(...step.integrations);
    const stepTokens = meaningfulTokens(stepWeighted.join(" "));
    if (stepTokens.size === 0) return null;

    let best: { plugin: UpstreamPlugin; overlap: number } | null = null;
    for (const plugin of catalog) {
      const pluginTokens = meaningfulTokens(
        [plugin.name, plugin.description, ...plugin.tags].join(" "),
      );
      let overlap = 0;
      for (const t of stepTokens) {
        if (pluginTokens.has(t)) overlap++;
      }
      if (overlap >= 2 && (best == null || overlap > best.overlap)) {
        best = { plugin, overlap };
      }
    }

    if (!best) return null;
    return {
      name: best.plugin.name,
      repoUrl: best.plugin.repoUrl,
      installCommand: best.plugin.installCommand,
    };
  } catch (err) {
    safeWarn("findUpstreamPluginMatch threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test hook — clears in-memory cache. Used by unit tests.
// ---------------------------------------------------------------------------

/** Test-only: reset the in-memory cache. Do NOT call from production code. */
export function __resetMemCacheForTests(): void {
  memCache = null;
}
