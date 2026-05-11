// kg-extract unit tests — exercises Groq parse + normalize logic.
// Canonicalization (pg_trgm-driven) is integration-tested via the live worker
// against Neon; this file mocks the LLM and asserts the in-memory normalizers.

import { describe, it, expect, vi } from "vitest";

const createMock = vi.fn();

vi.mock("../src/llm/groq-client.js", () => ({
  getGroqClient: () => ({
    chat: { completions: { create: createMock } },
  }),
}));

import { callGroqExtract } from "../src/adapters/kg-extract.js";

describe("callGroqExtract", () => {
  it("returns well-shaped entities and relationships when JSON is valid", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              entities: [
                {
                  entity_type: "organization",
                  canonical_name: "Anthropic",
                  aliases: ["ANTHROP\\PBC"],
                  confidence: 0.95,
                },
                {
                  entity_type: "model",
                  canonical_name: "Claude Sonnet 4.5",
                  aliases: ["claude-sonnet-4-5"],
                  confidence: 0.9,
                },
              ],
              relationships: [
                {
                  source_canonical_name: "Anthropic",
                  target_canonical_name: "Claude Sonnet 4.5",
                  relationship_type: "develops",
                  temporal_status: "active",
                  confidence: 0.99,
                },
              ],
            }),
          },
        },
      ],
    });

    const g = await callGroqExtract("Title", "Body");
    expect(g.entities).toHaveLength(2);
    expect(g.entities[0]!.canonical_name).toBe("Anthropic");
    expect(g.relationships).toHaveLength(1);
    expect(g.relationships[0]!.relationship_type).toBe("develops");
    expect(g.relationships[0]!.temporal_status).toBe("active");
  });

  it("rejects entities with bad entity_type values", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              entities: [
                { entity_type: "organization", canonical_name: "OpenAI", aliases: [], confidence: 0.9 },
                { entity_type: "BLARG", canonical_name: "Junk", aliases: [], confidence: 0.5 },
                { entity_type: "model", canonical_name: "", aliases: [], confidence: 0.5 },
              ],
              relationships: [],
            }),
          },
        },
      ],
    });
    const g = await callGroqExtract("T", "B");
    expect(g.entities).toHaveLength(1);
    expect(g.entities[0]!.canonical_name).toBe("OpenAI");
  });

  it("drops invalid relationships (self-loop, unknown temporal_status)", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              entities: [
                { entity_type: "organization", canonical_name: "X", aliases: [], confidence: 0.9 },
                { entity_type: "organization", canonical_name: "Y", aliases: [], confidence: 0.9 },
              ],
              relationships: [
                { source_canonical_name: "X", target_canonical_name: "X", relationship_type: "depends_on", confidence: 0.5 },
                { source_canonical_name: "X", target_canonical_name: "Y", relationship_type: "develops", temporal_status: "wat", confidence: 0.8 },
              ],
            }),
          },
        },
      ],
    });
    const g = await callGroqExtract("T", "B");
    expect(g.relationships).toHaveLength(1);
    expect(g.relationships[0]!.temporal_status).toBeUndefined(); // 'wat' rejected
  });

  it("throws when Groq returns non-JSON", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "lalala not json" } }],
    });
    await expect(callGroqExtract("T", "B")).rejects.toThrow(/invalid JSON/);
  });
});
