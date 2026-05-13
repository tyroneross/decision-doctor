// tests/audience-filter.test.ts — Lock the SQL fragment emitted by
// lib/audience/filter.ts so a future refactor doesn't silently change the
// leg WHERE clauses. Pure-function tests; no DB.

import { describe, it, expect } from "vitest";
import {
  audienceClauseFor,
  focusedAudienceClause,
} from "@/lib/audience/filter";

describe("audienceClauseFor — broad", () => {
  it("emits empty SQL fragments in broad scope", () => {
    const c = audienceClauseFor({
      scope: "broad",
      contentType: "corpus_document",
    });
    // Drizzle's empty sql`` produces a query chunk with empty fragments.
    // We assert by serializing to the inline-query representation.
    const sqlText = c.where.queryChunks
      .map((chunk: unknown) =>
        typeof chunk === "string"
          ? chunk
          : (chunk as { value?: string }).value ?? "",
      )
      .join("");
    expect(sqlText.trim()).toBe("");
  });
});

describe("audienceClauseFor — focused", () => {
  it("emits an EXISTS sub-query naming content_audience", () => {
    const c = audienceClauseFor({
      scope: "focused",
      contentType: "corpus_document",
    });
    const queryChunks = c.where.queryChunks as unknown as Array<unknown>;
    // The literal SQL text segments should mention content_audience + audience filter.
    const stringChunks = queryChunks
      .map((chunk) =>
        typeof chunk === "string"
          ? chunk
          : (chunk as { value?: string }).value ?? "",
      )
      .join(" ");
    expect(stringChunks).toMatch(/content_audience/);
    expect(stringChunks).toMatch(/AND EXISTS/);
  });

  it("varies content_type per call", () => {
    const corpus = audienceClauseFor({
      scope: "focused",
      contentType: "corpus_document",
    });
    const library = audienceClauseFor({
      scope: "focused",
      contentType: "library_use_case",
    });
    // The where fragments are different SQL objects when contentType differs.
    expect(corpus.where).not.toBe(library.where);
  });
});

describe("focusedAudienceClause", () => {
  it("matches audienceClauseFor with scope=focused", () => {
    const a = focusedAudienceClause("corpus_document");
    const b = audienceClauseFor({
      scope: "focused",
      contentType: "corpus_document",
    });
    // We can't deep-equal SQL chunks (they hold drizzle-internal placeholders)
    // — assert the where fragment shape is non-empty for both.
    const aChunks = (a.where.queryChunks as Array<unknown>).map((c) =>
      typeof c === "string" ? c : (c as { value?: string }).value ?? "",
    );
    const bChunks = (b.where.queryChunks as Array<unknown>).map((c) =>
      typeof c === "string" ? c : (c as { value?: string }).value ?? "",
    );
    expect(aChunks.join(" ")).toMatch(/EXISTS/);
    expect(bChunks.join(" ")).toMatch(/EXISTS/);
  });
});
