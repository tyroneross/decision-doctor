// Unit tests for the tiktoken-backed chunker.
//
// Verifies:
//   - Empty body returns no chunks.
//   - Body under maxTokens returns exactly one chunk covering the whole body.
//   - Long body splits into multiple chunks, each ≤ maxTokens, with overlap.
//   - Overlap is honored — adjacent chunks share `overlapTokens` tokens.
//   - Chunk indices are 0-based and monotonically increasing.

import { afterAll, describe, expect, it } from "vitest";
import { chunkBody, disposeEncoder } from "../src/embed-chunker.js";

afterAll(() => {
  disposeEncoder();
});

describe("chunkBody", () => {
  it("returns empty array for empty body", () => {
    expect(chunkBody("")).toEqual([]);
  });

  it("returns a single chunk for short body", () => {
    const body = "Hello world. This is a short body.";
    const chunks = chunkBody(body);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.index).toBe(0);
    expect(chunks[0]!.text).toBe(body);
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
    expect(chunks[0]!.tokenCount).toBeLessThanOrEqual(1000);
  });

  it("splits a 5000-char body into multiple chunks under the cap", () => {
    // Build a body big enough that one chunk can't hold it. 5000 chars of
    // varied English averages ~1100-1300 tokens — comfortably over the 1000
    // ceiling.
    const sentence =
      "The transparent decision engine writes audit trails for every action. ";
    const body = sentence.repeat(150); // ~10,500 chars, ~2000 tokens
    const chunks = chunkBody(body, {
      targetTokens: 750,
      maxTokens: 1000,
      overlapTokens: 100,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(1000);
      expect(c.tokenCount).toBeGreaterThan(0);
      expect(c.text.length).toBeGreaterThan(0);
    }

    // Indices are 0..N-1 in order.
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.index).toBe(i);
    }
  });

  it("honors overlap between consecutive chunks", () => {
    // Use distinct sentinel sentences so we can detect overlap textually.
    const parts: string[] = [];
    for (let i = 0; i < 200; i++) {
      parts.push(`Sentinel sentence number ${i} carries unique markers.`);
    }
    const body = parts.join(" ");
    const chunks = chunkBody(body, {
      targetTokens: 200,
      maxTokens: 400,
      overlapTokens: 50,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // The tail of chunk N should appear in the head of chunk N+1.
    for (let i = 0; i < chunks.length - 1; i++) {
      const aTail = chunks[i]!.text.slice(-80);
      const bHead = chunks[i + 1]!.text.slice(0, 200);
      // Find at least one short shared substring (10+ chars).
      let foundOverlap = false;
      for (let s = 0; s + 20 <= aTail.length; s += 5) {
        const probe = aTail.slice(s, s + 20);
        if (bHead.includes(probe)) {
          foundOverlap = true;
          break;
        }
      }
      expect(foundOverlap).toBe(true);
    }
  });

  it("rejects invalid overlap configuration", () => {
    expect(() =>
      chunkBody("hello", { targetTokens: 100, overlapTokens: 100 }),
    ).toThrow(/overlap/);
    expect(() =>
      chunkBody("hello", { targetTokens: 1200, maxTokens: 1000 }),
    ).toThrow(/target/);
  });
});
