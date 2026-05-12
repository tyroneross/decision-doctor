/**
 * tests/library-saved-kinds.test.ts — type-union extension smoke.
 *
 * Verifies at compile time that the LibraryKind union now includes the two
 * new saved kinds. Runtime assertion is trivial; the value of this test is
 * to catch accidental removal of the union members in future refactors.
 */

import { describe, it, expect } from "vitest";
import type { LibraryKind, LibraryHit } from "@/lib/library";

describe("LibraryKind union", () => {
  it("accepts saved_search and saved_response", () => {
    const a: LibraryKind = "saved_search";
    const b: LibraryKind = "saved_response";
    expect(a).toBe("saved_search");
    expect(b).toBe("saved_response");
  });

  it("LibraryHit can carry a saved_response payload", () => {
    const hit: LibraryHit = {
      kind: "saved_response",
      id: "x",
      title: "Q?",
      snippet: "A",
      score: 0,
      saved_response: {
        question: "Q?",
        answer: "A",
        citations: [],
        wasGrounded: true,
        createdAt: new Date().toISOString(),
      },
    };
    expect(hit.saved_response?.question).toBe("Q?");
  });

  it("LibraryHit can carry a saved_search payload", () => {
    const hit: LibraryHit = {
      kind: "saved_search",
      id: "x",
      title: "label",
      snippet: "q",
      score: 0,
      saved_search: {
        query: "q",
        kindFilter: ["use_case"],
        pathFilter: ["all"],
        onlyMine: false,
        name: "label",
        createdAt: new Date().toISOString(),
      },
    };
    expect(hit.saved_search?.kindFilter).toEqual(["use_case"]);
  });
});
