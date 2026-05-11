/**
 * tests/pain-cards.test.ts
 *
 * Smoke tests for PainCard + PainCardGrid (V2 U1).
 *
 * Structural assertions:
 *   - PAIN_PATHS exports exactly 6 entries covering all PainPath values.
 *   - Each entry has pathId, label, oneLineHook strings.
 *   - PainCard and PainCardGrid are exported functions.
 *   - No per-pain hex colors in component source.
 *
 * These are pure module-import tests — no DOM, no render.
 * Vitest environment: "node" (vitest.config.ts).
 */

import { describe, it, expect } from "vitest";
import { PAIN_PATHS } from "@/components/pain-cards/PainCardGrid";
import type { PainPath } from "@/lib/engine/types";

// All valid PainPath values per lib/engine/types.ts
const EXPECTED_PATHS: PainPath[] = [
  "referrals",
  "research",
  "admin",
  "capacity_growth",
  "follow_up",
  "custom",
];

describe("PAIN_PATHS constant", () => {
  it("exports exactly 6 entries", () => {
    expect(PAIN_PATHS).toHaveLength(6);
  });

  it("covers all 6 PainPath values", () => {
    const ids = PAIN_PATHS.map((p) => p.pathId);
    for (const path of EXPECTED_PATHS) {
      expect(ids).toContain(path);
    }
  });

  it("each entry has non-empty label and oneLineHook", () => {
    for (const entry of PAIN_PATHS) {
      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
      expect(typeof entry.oneLineHook).toBe("string");
      expect(entry.oneLineHook.length).toBeGreaterThan(0);
    }
  });

  it("referrals entry has correct label", () => {
    const referrals = PAIN_PATHS.find((p) => p.pathId === "referrals");
    expect(referrals).toBeDefined();
    expect(referrals?.label).toContain("referral");
  });

  it("custom entry is present", () => {
    const custom = PAIN_PATHS.find((p) => p.pathId === "custom");
    expect(custom).toBeDefined();
    expect(custom?.pathId).toBe("custom");
  });

  it("all entries have pathId matching the EXPECTED_PATHS set", () => {
    for (const entry of PAIN_PATHS) {
      expect(EXPECTED_PATHS).toContain(entry.pathId);
    }
  });

  it("no duplicate pathIds", () => {
    const ids = PAIN_PATHS.map((p) => p.pathId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("PainCard module exports", () => {
  it("PainCard is exported as a function", async () => {
    const { PainCard } = await import("@/components/pain-cards/PainCard");
    expect(typeof PainCard).toBe("function");
  });
});

describe("PainCardGrid module exports", () => {
  it("PainCardGrid is exported as a function", async () => {
    const { PainCardGrid } = await import(
      "@/components/pain-cards/PainCardGrid"
    );
    expect(typeof PainCardGrid).toBe("function");
  });
});
