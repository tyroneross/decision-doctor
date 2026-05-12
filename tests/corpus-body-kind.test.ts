// tests/corpus-body-kind.test.ts — Unit tests for the V2 body_kind helpers.
//
// Covers:
//   - normalizeBodyKind() back-compat (NULL → full_text)
//   - isTrustedBodyKind / isPartialTrustBodyKind / isBlockedBodyKind branches
//   - bodyKindBadgeLabel() UI strings

import { describe, it, expect } from "vitest";
import {
  normalizeBodyKind,
  isTrustedBodyKind,
  isPartialTrustBodyKind,
  isBlockedBodyKind,
  bodyKindBadgeLabel,
} from "@/lib/corpus/body-kind";

describe("normalizeBodyKind", () => {
  it("passes through known values unchanged", () => {
    expect(normalizeBodyKind("full_text")).toBe("full_text");
    expect(normalizeBodyKind("source_summary")).toBe("source_summary");
    expect(normalizeBodyKind("metadata_only")).toBe("metadata_only");
    expect(normalizeBodyKind("blocked")).toBe("blocked");
    expect(normalizeBodyKind("degraded")).toBe("degraded");
  });

  it("maps NULL / undefined / unknown to full_text (back-compat)", () => {
    expect(normalizeBodyKind(null)).toBe("full_text");
    expect(normalizeBodyKind(undefined)).toBe("full_text");
    expect(normalizeBodyKind("")).toBe("full_text");
    expect(normalizeBodyKind("nonsense")).toBe("full_text");
    expect(normalizeBodyKind(0)).toBe("full_text");
  });
});

describe("isTrustedBodyKind", () => {
  it("returns true for full_text and source_summary", () => {
    expect(isTrustedBodyKind("full_text")).toBe(true);
    expect(isTrustedBodyKind("source_summary")).toBe(true);
  });

  it("returns false for blocked / degraded / metadata_only", () => {
    expect(isTrustedBodyKind("blocked")).toBe(false);
    expect(isTrustedBodyKind("degraded")).toBe(false);
    expect(isTrustedBodyKind("metadata_only")).toBe(false);
  });

  it("returns true for NULL (back-compat, treated as full_text)", () => {
    expect(isTrustedBodyKind(null)).toBe(true);
    expect(isTrustedBodyKind(undefined)).toBe(true);
  });
});

describe("isPartialTrustBodyKind", () => {
  it("returns true only for source_summary", () => {
    expect(isPartialTrustBodyKind("source_summary")).toBe(true);
    expect(isPartialTrustBodyKind("full_text")).toBe(false);
    expect(isPartialTrustBodyKind("blocked")).toBe(false);
    expect(isPartialTrustBodyKind(null)).toBe(false);
  });
});

describe("isBlockedBodyKind", () => {
  it("returns true for blocked / degraded / metadata_only", () => {
    expect(isBlockedBodyKind("blocked")).toBe(true);
    expect(isBlockedBodyKind("degraded")).toBe(true);
    expect(isBlockedBodyKind("metadata_only")).toBe(true);
  });

  it("returns false for full_text / source_summary", () => {
    expect(isBlockedBodyKind("full_text")).toBe(false);
    expect(isBlockedBodyKind("source_summary")).toBe(false);
  });

  it("returns false for NULL / undefined / unknown (back-compat)", () => {
    expect(isBlockedBodyKind(null)).toBe(false);
    expect(isBlockedBodyKind(undefined)).toBe(false);
    expect(isBlockedBodyKind("")).toBe(false);
    expect(isBlockedBodyKind("nonsense")).toBe(false);
  });
});

describe("bodyKindBadgeLabel", () => {
  it("returns null for full_text and back-compat NULL", () => {
    expect(bodyKindBadgeLabel("full_text")).toBeNull();
    expect(bodyKindBadgeLabel(null)).toBeNull();
    expect(bodyKindBadgeLabel(undefined)).toBeNull();
  });

  it("returns 'Source summary only' for source_summary", () => {
    expect(bodyKindBadgeLabel("source_summary")).toBe("Source summary only");
  });

  it("returns distinct labels for degraded / metadata_only / blocked", () => {
    expect(bodyKindBadgeLabel("metadata_only")).toBe("Metadata only");
    expect(bodyKindBadgeLabel("degraded")).toBe("Degraded source");
    expect(bodyKindBadgeLabel("blocked")).toBe("Blocked source");
  });
});
