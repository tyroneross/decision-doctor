// tests/audience-classify.test.ts — Lock the deterministic classifier rules
// from lib/audience/classify.ts so the backfill stays predictable across
// re-runs. Pure-function tests; no DB, no network.

import { describe, it, expect } from "vitest";
import {
  classifyAudience,
  classifyHasResult,
  __test,
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

describe("classifyAudience — confidence", () => {
  it("emits 1.0 confidence for curated library content", () => {
    const r = classifyAudience({ contentType: "library_use_case" });
    expect(r.confidence).toBe(1.0);
  });

  it("emits 1.0 confidence for curated kb_article", () => {
    const r = classifyAudience({ contentType: "kb_article" });
    expect(r.confidence).toBe(1.0);
  });

  it("emits 0 confidence when source_type is unknown (flagged for review)", () => {
    const r = classifyAudience({
      contentType: "corpus_document",
      sourceType: "unmapped",
    });
    expect(r.confidence).toBe(0);
    expect(r.audiences).toEqual([]);
  });

  it("emits intermediate confidence (≤0.7) for source-rule corpus matches", () => {
    const r = classifyAudience({
      contentType: "corpus_document",
      sourceType: "anthropic-news",
    });
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(0.7);
  });
});

describe("parseLlmVerdict — LLM output parser", () => {
  const { parseLlmVerdict } = __test;

  it("parses a valid single-audience verdict", () => {
    const v = parseLlmVerdict(
      JSON.stringify({
        audiences: ["ai-research-general"],
        confidence: 0.85,
        rationale: "Scaling laws paper; pure research methodology.",
      }),
    );
    expect(v).not.toBeNull();
    expect(v!.audiences).toEqual(["ai-research-general"]);
    expect(v!.confidence).toBe(0.85);
    expect(v!.rationale).toMatch(/scaling laws/i);
  });

  it("parses a valid dual-use verdict", () => {
    const v = parseLlmVerdict(
      JSON.stringify({
        audiences: ["ai-adoption-solo", "ai-research-general"],
        confidence: 0.7,
        rationale: "Vendor release with both user guide and benchmark.",
      }),
    );
    expect(v).not.toBeNull();
    expect(v!.audiences.sort()).toEqual([
      "ai-adoption-solo",
      "ai-research-general",
    ]);
  });

  it("dedupes repeated audiences", () => {
    const v = parseLlmVerdict(
      JSON.stringify({
        audiences: ["ai-adoption-solo", "ai-adoption-solo"],
        confidence: 0.8,
        rationale: "x",
      }),
    );
    expect(v).not.toBeNull();
    expect(v!.audiences).toEqual(["ai-adoption-solo"]);
  });

  it("rejects empty audiences array", () => {
    const v = parseLlmVerdict(
      JSON.stringify({
        audiences: [],
        confidence: 0.8,
        rationale: "x",
      }),
    );
    expect(v).toBeNull();
  });

  it("rejects unknown audience strings", () => {
    const v = parseLlmVerdict(
      JSON.stringify({
        audiences: ["ai-adoption-solo", "made-up-audience"],
        confidence: 0.7,
        rationale: "x",
      }),
    );
    // The unknown one is filtered out; the known one survives.
    expect(v).not.toBeNull();
    expect(v!.audiences).toEqual(["ai-adoption-solo"]);
  });

  it("clamps confidence above 1.0 to 1.0", () => {
    const v = parseLlmVerdict(
      JSON.stringify({
        audiences: ["ai-research-general"],
        confidence: 1.5,
        rationale: "x",
      }),
    );
    expect(v).not.toBeNull();
    expect(v!.confidence).toBe(1.0);
  });

  it("clamps confidence below 0 to 0", () => {
    const v = parseLlmVerdict(
      JSON.stringify({
        audiences: ["ai-research-general"],
        confidence: -0.5,
        rationale: "x",
      }),
    );
    expect(v).not.toBeNull();
    expect(v!.confidence).toBe(0);
  });

  it("defaults confidence to 0.5 when missing or non-numeric", () => {
    const v = parseLlmVerdict(
      JSON.stringify({
        audiences: ["ai-research-general"],
        rationale: "x",
      }),
    );
    expect(v).not.toBeNull();
    expect(v!.confidence).toBe(0.5);
  });

  it("truncates rationale strings over 240 chars", () => {
    const longRationale = "a".repeat(500);
    const v = parseLlmVerdict(
      JSON.stringify({
        audiences: ["ai-adoption-solo"],
        confidence: 0.9,
        rationale: longRationale,
      }),
    );
    expect(v).not.toBeNull();
    expect(v!.rationale.length).toBe(240);
  });

  it("rejects malformed JSON", () => {
    expect(parseLlmVerdict("not json at all")).toBeNull();
    expect(parseLlmVerdict("{")).toBeNull();
    expect(parseLlmVerdict("")).toBeNull();
  });

  it("rejects non-object roots", () => {
    expect(parseLlmVerdict('"a string"')).toBeNull();
    expect(parseLlmVerdict("123")).toBeNull();
    expect(parseLlmVerdict("null")).toBeNull();
  });

  it("rejects when audiences is missing or not an array", () => {
    expect(
      parseLlmVerdict(
        JSON.stringify({ confidence: 0.8, rationale: "x" }),
      ),
    ).toBeNull();
    expect(
      parseLlmVerdict(
        JSON.stringify({
          audiences: "ai-adoption-solo",
          confidence: 0.8,
          rationale: "x",
        }),
      ),
    ).toBeNull();
  });
});
