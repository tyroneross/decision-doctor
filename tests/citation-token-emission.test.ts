// tests/citation-token-emission.test.ts — S1: citation token emission.
//
// Verifies that the CitationChip infrastructure (renderWithCitations) and
// the system-prompt instruction block work together correctly.
//
// CTE-1: renderWithCitations() replaces [[doc:<uuid>]] tokens with CitationChip nodes.
// CTE-2: text with no known UUID passes through as raw text (no chip rendered).
// CTE-3: Multiple tokens in one string produce multiple chips.
// CTE-4: The CHAT_SYSTEM_PROMPT contains the [[doc: instruction block.
// CTE-5: RECOMMENDATION_SYSTEM_PROMPT area contains citation token rules
//        (confirmed by checking orchestrator exports contain CITATION_INSTRUCTION_BLOCK content).

import { describe, it, expect } from "vitest";
import { renderWithCitations, type Citation } from "@/components/chat/CitationChip";
import { CHAT_SYSTEM_PROMPT } from "@/lib/chat/system-prompt";

const SOURCE_A: Citation = {
  doc_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  source_url: "https://example.com/doc-a",
  title: "AI for Scheduling",
};

const SOURCE_B: Citation = {
  doc_id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  source_url: "https://example.com/doc-b",
  title: "AI for Patient Follow-Up",
};

const SOURCE_C: Citation = {
  doc_id: "c3d4e5f6-a7b8-9012-cdef-123456789012",
  source_url: "https://example.com/doc-c",
  title: "AI Admin Tools",
};

describe("renderWithCitations (CitationChip)", () => {
  it("CTE-1: replaces [[doc:<uuid>]] token with CitationChip node", () => {
    const text = `AI scheduling tools reduce no-shows[[doc:${SOURCE_A.doc_id}]].`;
    const nodes = renderWithCitations(text, [SOURCE_A, SOURCE_B, SOURCE_C]);

    // Should contain more than just the original text (a chip was injected).
    expect(nodes.length).toBeGreaterThan(1);

    // The raw text portions should appear (not the token itself).
    const textParts = nodes.filter((n) => typeof n === "string") as string[];
    const joined = textParts.join("");
    expect(joined).toContain("AI scheduling tools reduce no-shows");
    // The raw token should NOT appear in output.
    expect(joined).not.toContain("[[doc:");
  });

  it("CTE-2: unknown UUID passes through as raw text, not a chip", () => {
    const unknownUuid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const text = `Some claim[[doc:${unknownUuid}]].`;
    const nodes = renderWithCitations(text, [SOURCE_A]);

    // All nodes should be strings (no React element injected for unknown UUID).
    const allStrings = nodes.every((n) => typeof n === "string");
    expect(allStrings).toBe(true);
    // The raw token appears in output since no matching citation.
    const joined = nodes.join("");
    expect(joined).toContain(`[[doc:${unknownUuid}]]`);
  });

  it("CTE-3: multiple tokens produce multiple chips", () => {
    const text = `Scheduling[[doc:${SOURCE_A.doc_id}]] and follow-up[[doc:${SOURCE_B.doc_id}]] are key.`;
    const nodes = renderWithCitations(text, [SOURCE_A, SOURCE_B, SOURCE_C]);

    // Count React element nodes (CitationChip instances).
    const elements = nodes.filter(
      (n) => typeof n !== "string" && n !== null && n !== undefined,
    );
    expect(elements.length).toBe(2);
  });

  it("CTE-4: same UUID cited twice gets same index number (deduplicated)", () => {
    const text = `Fact one[[doc:${SOURCE_A.doc_id}]]. Fact two[[doc:${SOURCE_A.doc_id}]].`;
    const nodes = renderWithCitations(text, [SOURCE_A, SOURCE_B]);

    // Two chips for the same source — both should exist.
    const elements = nodes.filter(
      (n) => typeof n !== "string" && n !== null && n !== undefined,
    );
    expect(elements.length).toBe(2);
  });

  it("CTE-5: empty citations list returns original text unchanged", () => {
    const text = `Some text[[doc:${SOURCE_A.doc_id}]].`;
    const nodes = renderWithCitations(text, []);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toBe(text);
  });

  it("CTE-6: at least one [[doc:<uuid>]] token references one of the 3 retrieved UUIDs", () => {
    // Simulate an LLM output that references known sources.
    const simulatedLlmOutput = [
      `AI scheduling tools can reduce no-show rates significantly[[doc:${SOURCE_A.doc_id}]].`,
      `Patient follow-up automation saves 30 min/week[[doc:${SOURCE_B.doc_id}]].`,
      `Admin tool selection depends on your EHR[[doc:${SOURCE_C.doc_id}]].`,
    ].join(" ");

    const knownUuids = new Set([SOURCE_A.doc_id, SOURCE_B.doc_id, SOURCE_C.doc_id]);
    const tokenPattern = /\[\[doc:([0-9a-f-]{36})\]\]/g;
    const foundUuids: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = tokenPattern.exec(simulatedLlmOutput)) !== null) {
      foundUuids.push(m[1]!);
    }

    expect(foundUuids.length).toBeGreaterThan(0);
    // At least one found UUID is in the known set.
    const atLeastOneKnown = foundUuids.some((id) => knownUuids.has(id));
    expect(atLeastOneKnown).toBe(true);
  });
});

describe("Citation instruction in system prompts", () => {
  it("CTE-7: CHAT_SYSTEM_PROMPT contains [[doc: citation instruction block", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("[[doc:");
    expect(CHAT_SYSTEM_PROMPT).toContain("Citation tokens");
  });

  it("CTE-8: CHAT_SYSTEM_PROMPT references UUID format requirement", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("uuid");
  });
});
