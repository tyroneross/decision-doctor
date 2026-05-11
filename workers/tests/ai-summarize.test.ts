// ai-summarize unit tests — clamps malformed LLM output without crashing.
// The Groq call itself is unit-tested via the exported callGroqSummary path
// (mocked); the DB-touching handleAiSummarize stays integration-test territory.

import { describe, it, expect } from "vitest";

// Re-import the clamp helper via a tiny harness — it's not exported, but we
// can exercise it through callGroqSummary by stubbing OpenAI. To keep this
// simple and fast, we mock the OpenAI client at module level.

import { vi } from "vitest";

const createMock = vi.fn();

vi.mock("../src/llm/groq-client.js", () => ({
  getGroqClient: () => ({
    chat: { completions: { create: createMock } },
  }),
}));

import { callGroqSummary } from "../src/adapters/ai-summarize.js";

describe("callGroqSummary", () => {
  it("returns a well-shaped summary when Groq returns valid JSON", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              tl_dr: "A short summary.",
              novel_capability: "Tool use",
              risks: ["a", "b"],
              automation_candidates: ["x"],
              who_should_care_level: 2,
              est_skill_level: "low",
            }),
          },
        },
      ],
    });
    const out = await callGroqSummary("Title", "Body content");
    expect(out.tl_dr).toBe("A short summary.");
    expect(out.novel_capability).toBe("Tool use");
    expect(out.risks).toEqual(["a", "b"]);
    expect(out.who_should_care_level).toBe(2);
    expect(out.est_skill_level).toBe("low");
  });

  it("clamps malformed output (missing fields, wrong types) to defaults", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        { message: { content: JSON.stringify({ tl_dr: 123, risks: "nope" }) } },
      ],
    });
    const out = await callGroqSummary("Title", "Body");
    expect(out.tl_dr).toBe("");
    expect(out.risks).toEqual([]);
    expect(out.who_should_care_level).toBe(2); // default
    expect(out.est_skill_level).toBe("mid"); // default
  });

  it("truncates tl_dr to 280 chars and caps array sizes at 3", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              tl_dr: "x".repeat(500),
              risks: ["1", "2", "3", "4", "5"],
              automation_candidates: ["a", "b", "c", "d"],
              who_should_care_level: 3,
              est_skill_level: "high",
            }),
          },
        },
      ],
    });
    const out = await callGroqSummary("T", "B");
    expect(out.tl_dr).toHaveLength(280);
    expect(out.risks).toHaveLength(3);
    expect(out.automation_candidates).toHaveLength(3);
  });

  it("throws when Groq returns non-JSON", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "not json at all" } }],
    });
    await expect(callGroqSummary("T", "B")).rejects.toThrow(/invalid JSON/);
  });
});
