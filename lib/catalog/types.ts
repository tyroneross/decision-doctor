// lib/catalog/types.ts
//
// Types for the upstream plugin catalog (anthropics/knowledge-work-plugins).
// Shared between the server-side fetcher (anthropic-knowledge-work.ts), the
// engine's lynchpin-matcher (lib/engine/workflow/artifacts.ts), and the
// /app/library/catalog page.

/**
 * A single plugin entry transformed from the upstream marketplace.json
 * into a shape decision-doctor can render and match against.
 */
export interface UpstreamPlugin {
  /** Stable slug — same as upstream `name`, lowercased. */
  slug: string;
  /** Display name from upstream `name`. */
  name: string;
  /** Description from upstream. May be empty string if missing. */
  description: string;
  /** Direct GitHub tree URL for the plugin source. */
  repoUrl: string;
  /** Paste-ready Claude Code install command. */
  installCommand: string;
  /** Optional author — present for partner-built entries. */
  author?: string;
  /**
   * Derived tags from the upstream `source` path components. For example,
   * `./partner-built/slack` yields `["partner-built", "slack"]`.
   */
  tags: string[];
  /** ISO 8601 timestamp of the last successful fetch (or stale-cache read). */
  lastFetched: string;
}

/**
 * Subset of UpstreamPlugin returned by the engine-side matcher.
 * Avoids leaking `tags` / `slug` into recommendation payloads that ship
 * to clients — the lynchpin card only needs name/url/install.
 */
export interface UpstreamPluginMatch {
  name: string;
  repoUrl: string;
  installCommand: string;
}

/**
 * Raw shape of upstream `.claude-plugin/marketplace.json`.
 * Verified against
 * https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/.claude-plugin/marketplace.json
 * on 2026-05-12.
 */
export interface UpstreamMarketplaceJson {
  name: string;
  owner: { name: string };
  plugins: Array<{
    name: string;
    source: string;
    description: string;
    author?: { name: string };
  }>;
}
