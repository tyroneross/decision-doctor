// tests/audience-classify.test.ts — Lock the deterministic classifier rules
// from lib/audience/classify.ts so the backfill stays predictable across
// re-runs. Pure-function tests; no DB, no network.

import { describe, it, expect } from "vitest";
import {
  classifyAudience,
  classifyHasResult,
  type Audience,
} from "@/lib/audience/classify";

function expectAudiences(result: { audiences: Audience[] }, expected: Audience[]) {
  expect([...result.audiences].sort()).toEqual([...expected].sort());
}

describe("classifyAudience — corpus_document", () => {
  it("tags arxiv as research-only", () => {
    const r = classifyAudience({
      contentType: "corpus_document",
      sourceType: "arxiv",
    });
    expectAudiences(r, ["ai-research-general"]);
  });

  it("treats vendor news (anthropic) as dual-use", () => {
    const r = classifyAudience({
      contentType: "corpus_document",
      sourceType: "anthropic-news",
    });
    expectAudiences(r, ["ai-adoption-solo", "ai-research-general"]);
  });

  it("treats vendor news (openai) as dual-use", () => {
    const r = classifyAudience({
      contentType: "corpus_document",
      sourceType: "openai-news",
    });
    expectAudiences(r, ["ai-adoption-solo", "ai-research-general"]);
  });

  it("tags industry news as adoption-only", () => {
    const r = classifyAudience({
      contentType: "corpus_document",
      sourceType: "industry",
    });
    expectAudiences(r, ["ai-adoption-solo"]);
  });

  it("normalizes source_type case", () => {
    const r = classifyAudience({
      contentType: "corpus_document",
      sourceType: "ArXiv",
    });
    expectAudiences(r, ["ai-research-general"]);
  });

  it("flags unknown source_type for human review (no tag)", () => {
    const r = classifyAudience({
      contentType: "corpus_document",
      sourceType: "unmapped-source",
    });
    expect(r.audiences).toEqual([]);
    expect(classifyHasResult(r)).toBe(false);
    expect(r.reason).toMatch(/flagged for human review/);
  });
});

describe("classifyAudience — library content", () => {
  it.each([
    "library_use_case",
    "library_prompt",
    "library_skill",
    "library_plugin",
  ] as const)("tags %s as adoption-only", (contentType) => {
    const r = classifyAudience({ contentType });
    expectAudiences(r, ["ai-adoption-solo"]);
  });
});

describe("classifyAudience — kb_article", () => {
  it("tags kb_article as adoption-only", () => {
    const r = classifyAudience({ contentType: "kb_article" });
    expectAudiences(r, ["ai-adoption-solo"]);
  });
});

describe("classifyAudience — plugin / skill", () => {
  it("tags anthropics/knowledge-work-plugins as adoption", () => {
    const r = classifyAudience({
      contentType: "plugin",
      sourceUrl: "https://github.com/anthropics/knowledge-work-plugins/foo",
    });
    expectAudiences(r, ["ai-adoption-solo"]);
  });

  it("tags unmarked plugins as adoption by default", () => {
    const r = classifyAudience({
      contentType: "plugin",
      sourceUrl: "https://example.com/some/plugin",
    });
    expectAudiences(r, ["ai-adoption-solo"]);
    expect(r.reason).toMatch(/default adoption surface/);
  });

  it("handles null source_url for plugins", () => {
    const r = classifyAudience({
      contentType: "plugin",
      sourceUrl: null,
    });
    expectAudiences(r, ["ai-adoption-solo"]);
  });

  it("tags anthropics/skills url as adoption", () => {
    const r = classifyAudience({
      contentType: "skill",
      sourceUrl: "https://github.com/anthropics/skills/code-review",
    });
    expectAudiences(r, ["ai-adoption-solo"]);
  });
});

describe("classifyAudience — determinism", () => {
  it("returns identical results for repeated calls on the same input", () => {
    const a = classifyAudience({
      contentType: "corpus_document",
      sourceType: "anthropic-news",
    });
    const b = classifyAudience({
      contentType: "corpus_document",
      sourceType: "anthropic-news",
    });
    expect(a).toEqual(b);
  });
});
