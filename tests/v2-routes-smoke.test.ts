/**
 * tests/v2-routes-smoke.test.ts
 *
 * V2 route-surface smoke tests (U5 acceptance criteria).
 *
 * Three assertion categories:
 *   1. Route files exist and export a default component / handler.
 *   2. Theme-token discipline: zero per-pain Tailwind color classes across V2 components.
 *   3. Citation helper import: Chat.tsx and AnswerStream.tsx both import renderWithCitations.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ── helpers ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");

function abs(rel: string) {
  return path.join(ROOT, rel);
}

function fileExists(rel: string): boolean {
  return fs.existsSync(abs(rel));
}

function fileContains(rel: string, pattern: RegExp | string): boolean {
  const content = fs.readFileSync(abs(rel), "utf-8");
  return typeof pattern === "string"
    ? content.includes(pattern)
    : pattern.test(content);
}

/**
 * Recursively collect all .tsx / .ts files under a directory (relative paths).
 */
function collectFiles(dir: string, extensions = [".tsx", ".ts"]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, extensions));
    } else if (extensions.some((e) => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

// ── 1. Route file existence + default export ───────────────────────────────

const V2_ROUTES: { label: string; file: string }[] = [
  // Pages
  { label: "/app home",                          file: "app/app/page.tsx" },
  { label: "/app/recommendations/new",           file: "app/app/recommendations/new/page.tsx" },
  { label: "/app/recommendations/[id]",          file: "app/app/recommendations/[id]/page.tsx" },
  { label: "/app/recommendations/guest-preview", file: "app/app/recommendations/guest-preview/page.tsx" },
  { label: "/app/library",                       file: "app/app/library/page.tsx" },
  { label: "/app/skills",                        file: "app/app/skills/page.tsx" },
  { label: "/app/ask",                           file: "app/app/ask/page.tsx" },
  { label: "/app/history (renamed from decisions)", file: "app/app/history/page.tsx" },
  // API routes
  { label: "/api/recommendations",              file: "app/api/recommendations/route.ts" },
  { label: "/api/ai-adoption-qa",               file: "app/api/ai-adoption-qa/route.ts" },
  // Library API routes (7)
  { label: "/api/library/use-cases",            file: "app/api/library/use-cases/route.ts" },
  { label: "/api/library/prompts",              file: "app/api/library/prompts/route.ts" },
  { label: "/api/library/skills",               file: "app/api/library/skills/route.ts" },
  { label: "/api/library/plugins",              file: "app/api/library/plugins/route.ts" },
  { label: "/api/library/search",               file: "app/api/library/search/route.ts" },
  { label: "/api/library/save",                 file: "app/api/library/save/route.ts" },
  { label: "/api/library/promote",              file: "app/api/library/promote/route.ts" },
];

describe("V2 route files exist", () => {
  for (const { label, file } of V2_ROUTES) {
    it(`${label} — file exists at ${file}`, () => {
      expect(fileExists(file), `Missing: ${file}`).toBe(true);
    });
  }
});

// Page files use default exports; API route files use named HTTP method exports.
const API_ROUTE_PATTERN = /^app\/api\//;

describe("V2 route files export a handler", () => {
  for (const { label, file } of V2_ROUTES) {
    it(`${label} — has export`, () => {
      if (!fileExists(file)) {
        // Already fails in previous suite; skip duplicate noise.
        return;
      }
      const content = fs.readFileSync(abs(file), "utf-8");
      const isApiRoute = API_ROUTE_PATTERN.test(file);
      if (isApiRoute) {
        // API routes export named HTTP method handlers (GET, POST, etc.).
        const hasHandler = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/.test(content);
        expect(hasHandler, `No HTTP method export in ${file}`).toBe(true);
      } else {
        const hasDefault =
          /export\s+default\s/.test(content) ||
          /exports\.default\s*=/.test(content);
        expect(hasDefault, `No default export in ${file}`).toBe(true);
      }
    });
  }
});

// ── 2. History route files exist (rename assertions) ──────────────────────

const HISTORY_ROUTES = [
  "app/app/history/page.tsx",
  "app/app/history/new/page.tsx",
  "app/app/history/new/[templateId]/page.tsx",
  "app/app/history/[id]/page.tsx",
  "app/app/history/guest-preview/page.tsx",
];

const DELETED_DECISIONS_ROUTES = [
  "app/app/decisions/page.tsx",
  "app/app/decisions/new/page.tsx",
  "app/app/decisions/guest-preview/page.tsx",
];

describe("/app/decisions → /app/history rename", () => {
  for (const file of HISTORY_ROUTES) {
    it(`history file exists: ${file}`, () => {
      expect(fileExists(file), `Missing history file: ${file}`).toBe(true);
    });
  }

  for (const file of DELETED_DECISIONS_ROUTES) {
    it(`old decisions file removed: ${file}`, () => {
      expect(fileExists(file), `Old decisions file still present: ${file}`).toBe(false);
    });
  }

  it("next.config.ts has permanent redirect for /app/decisions", () => {
    expect(
      fileContains("next.config.ts", "/app/decisions/:path*"),
      "Missing redirect source in next.config.ts"
    ).toBe(true);
    expect(
      fileContains("next.config.ts", "/app/history/:path*"),
      "Missing redirect destination in next.config.ts"
    ).toBe(true);
    expect(
      fileContains("next.config.ts", "permanent: true"),
      "Redirect must be permanent"
    ).toBe(true);
  });
});

// ── 3. Theme-token discipline — zero per-pain color classes ───────────────

const PER_PAIN_PATTERN =
  /text-(red|green|blue|amber|orange|purple)-\d+|bg-(red|green|blue|amber|orange|purple)-\d+/;

const V2_COMPONENT_DIRS = [
  "components/pain-cards",
  "components/library",
  "components/recommendations",
  "components/promotion",
  "components/qa",
];

describe("Theme-token discipline — zero per-pain Tailwind colors in V2 components", () => {
  for (const dir of V2_COMPONENT_DIRS) {
    const absDir = abs(dir);
    if (!fs.existsSync(absDir)) continue;

    const files = collectFiles(absDir, [".tsx", ".ts"]);
    for (const file of files) {
      const rel = path.relative(ROOT, file);
      it(`no per-pain color classes in ${rel}`, () => {
        const content = fs.readFileSync(file, "utf-8");
        // Strip comments before checking to avoid false positives.
        const stripped = content
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "");
        expect(
          PER_PAIN_PATTERN.test(stripped),
          `Per-pain color found in ${rel}`
        ).toBe(false);
      });
    }
  }
});

// ── 4. Citation helper import ─────────────────────────────────────────────

describe("Citation helper renderWithCitations is imported where expected", () => {
  it("components/chat/CitationChip.tsx exports renderWithCitations", () => {
    expect(
      fileContains("components/chat/CitationChip.tsx", "renderWithCitations"),
      "renderWithCitations not found in CitationChip.tsx"
    ).toBe(true);
  });

  it("components/qa/AnswerStream.tsx imports renderWithCitations", () => {
    expect(
      fileContains("components/qa/AnswerStream.tsx", "renderWithCitations"),
      "renderWithCitations not imported in AnswerStream.tsx"
    ).toBe(true);
  });
});

// ── 5. NoPhiNotice promotion ───────────────────────────────────────────────

describe("NoPhiNotice promotion to components/ui/", () => {
  it("components/ui/NoPhiNotice.tsx exists", () => {
    expect(fileExists("components/ui/NoPhiNotice.tsx")).toBe(true);
  });

  it("components/recommendations/NoPhiNotice.tsx re-exports from ui/", () => {
    expect(
      fileContains(
        "components/recommendations/NoPhiNotice.tsx",
        "components/ui/NoPhiNotice"
      )
    ).toBe(true);
  });

  it("components/chat/Chat.tsx imports NoPhiNotice", () => {
    expect(
      fileContains("components/chat/Chat.tsx", "NoPhiNotice")
    ).toBe(true);
  });

  it("app/app/history/new/page.tsx includes NoPhiNotice", () => {
    expect(
      fileContains("app/app/history/new/page.tsx", "NoPhiNotice")
    ).toBe(true);
  });
});
