import { describe, expect, it } from "vitest";
import { PATH_KICKOFFS } from "@/app/app/recommendations/new/path-kickoff";
import type { PainPathId } from "@/lib/engine/types";

const EXPECTED_PATHS: PainPathId[] = [
  "referrals",
  "research",
  "admin",
  "capacity_growth",
  "follow_up",
  "custom",
];

describe("recommendation path kickoff metadata", () => {
  it("covers every recommendation pain path", () => {
    expect(Object.keys(PATH_KICKOFFS).sort()).toEqual([...EXPECTED_PATHS].sort());
  });

  it("gives each selected path immediate value before intake", () => {
    for (const path of EXPECTED_PATHS) {
      const kickoff = PATH_KICKOFFS[path];

      expect(kickoff.label).toBeTruthy();
      expect(kickoff.headline).toBeTruthy();
      expect(kickoff.summary).toBeTruthy();
      expect(kickoff.firstAdvice.length).toBeGreaterThanOrEqual(3);
      expect(kickoff.artifacts.length).toBeGreaterThanOrEqual(3);
      expect(kickoff.infoNeeded.length).toBeGreaterThanOrEqual(3);
      expect(kickoff.seedChallenge).toBeTruthy();
      expect(kickoff.detailPlaceholder).toMatch(/^e\.g\./);
    }
  });

  it("surfaces at least one skill or plugin option per path", () => {
    for (const path of EXPECTED_PATHS) {
      const kinds = PATH_KICKOFFS[path].artifacts.map((artifact) => artifact.kind);
      expect(kinds.some((kind) => kind === "Skill" || kind === "Plugin")).toBe(
        true,
      );
    }
  });

  it("only the custom path requires additional detail before intake", () => {
    for (const path of EXPECTED_PATHS) {
      expect(Boolean(PATH_KICKOFFS[path].requiresDetail)).toBe(path === "custom");
    }
  });
});
