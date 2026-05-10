// E4 — Interaction-state matrix coverage tests.
//
// Each of the three resolver functions in lib/component-state.ts must
// produce every one of the six canonical states given the right input.
// Tests are pure (no React, no DOM) — they exercise the state machine the
// components route through.
//
// Why this style (no jsdom): vitest is configured environment: "node" with
// pool: "forks" for Neon WebSocket pools. Adding jsdom or @testing-library/
// react would double the test-runtime + complicate the pool config. The
// resolvers are pure functions; testing them at this layer gives every
// state branch deterministic coverage and the components themselves carry
// the JSDoc-documented branch tables that map state → JSX.

import { describe, expect, it } from "vitest";
import {
  resolveAhpPairwiseState,
  resolveCodeBlockState,
  resolveScaffoldViewerState,
  type ComponentState,
} from "@/lib/component-state";

// ─── ScaffoldViewer ─────────────────────────────────────────────────────

describe("E4 / ScaffoldViewer state matrix", () => {
  it("returns 'default' when drawer is closed (regardless of other props)", () => {
    expect(
      resolveScaffoldViewerState({ open: false, filesCount: 3 }),
    ).toBe("default");
    expect(
      resolveScaffoldViewerState({
        open: false,
        filesCount: 0,
        loading: true,
        error: "boom",
      }),
    ).toBe("default");
  });

  it("returns 'populated' when open, files present, no special flags", () => {
    expect(
      resolveScaffoldViewerState({ open: true, filesCount: 3 }),
    ).toBe("populated");
  });

  it("returns 'loading' when loading=true (overrides populated)", () => {
    expect(
      resolveScaffoldViewerState({
        open: true,
        filesCount: 3,
        loading: true,
      }),
    ).toBe("loading");
  });

  it("returns 'success' when copiedAll fires on populated drawer", () => {
    expect(
      resolveScaffoldViewerState({
        open: true,
        filesCount: 3,
        copiedAll: true,
      }),
    ).toBe("success");
  });

  it("returns 'error' when error is truthy (highest precedence)", () => {
    expect(
      resolveScaffoldViewerState({
        open: true,
        filesCount: 3,
        error: "Couldn't fetch",
      }),
    ).toBe("error");
    // Error beats loading, copiedAll, empty.
    expect(
      resolveScaffoldViewerState({
        open: true,
        filesCount: 0,
        loading: true,
        copiedAll: true,
        error: "boom",
      }),
    ).toBe("error");
  });

  it("returns 'empty' when filesCount is 0 OR empty=true", () => {
    expect(
      resolveScaffoldViewerState({ open: true, filesCount: 0 }),
    ).toBe("empty");
    expect(
      resolveScaffoldViewerState({
        open: true,
        filesCount: 3,
        empty: true,
      }),
    ).toBe("empty");
  });
});

// ─── CodeBlock ──────────────────────────────────────────────────────────

describe("E4 / CodeBlock state matrix", () => {
  it("returns 'populated' for non-empty code with no flags", () => {
    expect(resolveCodeBlockState({ code: "const x = 1;" })).toBe("populated");
  });

  it("returns 'loading' when loading=true", () => {
    expect(
      resolveCodeBlockState({ code: "x", loading: true }),
    ).toBe("loading");
  });

  it("returns 'success' when copied=true", () => {
    expect(resolveCodeBlockState({ code: "x", copied: true })).toBe("success");
  });

  it("returns 'error' when error is truthy (overrides everything)", () => {
    expect(
      resolveCodeBlockState({ code: "x", error: "Clipboard denied" }),
    ).toBe("error");
    expect(
      resolveCodeBlockState({
        code: "",
        loading: true,
        copied: true,
        error: "boom",
      }),
    ).toBe("error");
  });

  it("returns 'empty' when code is empty string", () => {
    expect(resolveCodeBlockState({ code: "" })).toBe("empty");
  });
});

// ─── AhpPairwise ────────────────────────────────────────────────────────

describe("E4 / AhpPairwise state matrix", () => {
  it("returns 'empty' when criteriaCount < 2", () => {
    expect(
      resolveAhpPairwiseState({
        criteriaCount: 1,
        answeredCount: 0,
        totalPairs: 0,
      }),
    ).toBe("empty");
  });

  it("returns 'default' when criteria present but 0 pairs answered", () => {
    expect(
      resolveAhpPairwiseState({
        criteriaCount: 3,
        answeredCount: 0,
        totalPairs: 3,
      }),
    ).toBe("default");
  });

  it("returns 'populated' for partial progress", () => {
    expect(
      resolveAhpPairwiseState({
        criteriaCount: 4,
        answeredCount: 3,
        totalPairs: 6,
      }),
    ).toBe("populated");
  });

  it("returns 'loading' when loading=true (overrides default/populated)", () => {
    expect(
      resolveAhpPairwiseState({
        criteriaCount: 3,
        answeredCount: 2,
        totalPairs: 3,
        loading: true,
      }),
    ).toBe("loading");
  });

  it("returns 'success' when all pairs answered AND consistent", () => {
    expect(
      resolveAhpPairwiseState({
        criteriaCount: 3,
        answeredCount: 3,
        totalPairs: 3,
        consistent: true,
      }),
    ).toBe("success");
  });

  it("returns 'populated' when all pairs answered but inconsistent", () => {
    expect(
      resolveAhpPairwiseState({
        criteriaCount: 3,
        answeredCount: 3,
        totalPairs: 3,
        consistent: false,
      }),
    ).toBe("populated");
  });

  it("returns 'error' when error is truthy (highest precedence)", () => {
    expect(
      resolveAhpPairwiseState({
        criteriaCount: 3,
        answeredCount: 3,
        totalPairs: 3,
        consistent: true,
        error: "boom",
      }),
    ).toBe("error");
  });
});

// ─── State enum sanity — every component covers all 6 ───────────────────

describe("E4 / coverage table — every component reaches every state", () => {
  const allStates: ComponentState[] = [
    "default",
    "populated",
    "loading",
    "success",
    "error",
    "empty",
  ];

  it("ScaffoldViewer reaches every state across the test inputs above", () => {
    // Build a synthetic input fixture covering each state.
    const map: Record<ComponentState, () => ComponentState> = {
      default: () => resolveScaffoldViewerState({ open: false, filesCount: 0 }),
      populated: () => resolveScaffoldViewerState({ open: true, filesCount: 2 }),
      loading: () =>
        resolveScaffoldViewerState({
          open: true,
          filesCount: 2,
          loading: true,
        }),
      success: () =>
        resolveScaffoldViewerState({
          open: true,
          filesCount: 2,
          copiedAll: true,
        }),
      error: () =>
        resolveScaffoldViewerState({
          open: true,
          filesCount: 2,
          error: "x",
        }),
      empty: () =>
        resolveScaffoldViewerState({ open: true, filesCount: 0 }),
    };
    for (const s of allStates) expect(map[s]()).toBe(s);
  });

  it("CodeBlock reaches every state except 'default' (always mounted with code)", () => {
    const map: Record<Exclude<ComponentState, "default">, () => ComponentState> = {
      populated: () => resolveCodeBlockState({ code: "x" }),
      loading: () => resolveCodeBlockState({ code: "x", loading: true }),
      success: () => resolveCodeBlockState({ code: "x", copied: true }),
      error: () => resolveCodeBlockState({ code: "x", error: "x" }),
      empty: () => resolveCodeBlockState({ code: "" }),
    };
    for (const s of Object.keys(map) as Array<keyof typeof map>) {
      expect(map[s]()).toBe(s);
    }
  });

  it("AhpPairwise reaches every state", () => {
    const map: Record<ComponentState, () => ComponentState> = {
      default: () =>
        resolveAhpPairwiseState({
          criteriaCount: 3,
          answeredCount: 0,
          totalPairs: 3,
        }),
      populated: () =>
        resolveAhpPairwiseState({
          criteriaCount: 3,
          answeredCount: 1,
          totalPairs: 3,
        }),
      loading: () =>
        resolveAhpPairwiseState({
          criteriaCount: 3,
          answeredCount: 1,
          totalPairs: 3,
          loading: true,
        }),
      success: () =>
        resolveAhpPairwiseState({
          criteriaCount: 3,
          answeredCount: 3,
          totalPairs: 3,
          consistent: true,
        }),
      error: () =>
        resolveAhpPairwiseState({
          criteriaCount: 3,
          answeredCount: 1,
          totalPairs: 3,
          error: "boom",
        }),
      empty: () =>
        resolveAhpPairwiseState({
          criteriaCount: 1,
          answeredCount: 0,
          totalPairs: 0,
        }),
    };
    for (const s of allStates) expect(map[s]()).toBe(s);
  });
});
