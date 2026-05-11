/**
 * tests/theme-picker.test.ts
 *
 * Tests for lib/theme.ts — the canonical theme helper module.
 *
 * Vitest environment is "node" (not jsdom), so we mock document and
 * window.localStorage with minimal stubs before importing the module.
 * We re-import (or re-require) the module after each mock setup to pick
 * up fresh state, or we call the exported fns directly with mocked globals.
 *
 * Coverage targets:
 *   - isThemeKey: valid + invalid inputs
 *   - getInitialTheme: data-theme attr priority, localStorage fallback, default
 *   - getInitialTheme: SSR path (document === undefined)
 *   - setTheme: sets data-theme attribute on documentElement
 *   - setTheme: writes to localStorage
 *   - setTheme: survives localStorage write failure (quota exceeded etc.)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Minimal DOM stubs (Node environment, no jsdom) ---

let storedTheme: string | null = null;
let domTheme: string | null = "F";
let localStorageThrows = false;

const mockLocalStorage = {
  getItem: (key: string) => {
    if (localStorageThrows) throw new Error("storage disabled");
    return key === "dd:theme" ? storedTheme : null;
  },
  setItem: (key: string, value: string) => {
    if (localStorageThrows) throw new Error("quota exceeded");
    if (key === "dd:theme") storedTheme = value;
  },
};

const mockDocumentElement = {
  getAttribute: (_attr: string) => domTheme,
  setAttribute: (_attr: string, value: string) => {
    domTheme = value;
  },
};

// Patch globals before importing the module.
// We use vi.stubGlobal so vitest cleans up between files.
vi.stubGlobal("window", { localStorage: mockLocalStorage });
vi.stubGlobal("document", { documentElement: mockDocumentElement });

// Now import — the module will see the stubbed globals.
import {
  isThemeKey,
  getInitialTheme,
  setTheme,
  THEME_STORAGE_KEY,
  VALID_THEMES,
} from "@/lib/theme";

// -------------------------------------------------------

describe("isThemeKey", () => {
  it("accepts valid keys", () => {
    expect(isThemeKey("F")).toBe(true);
    expect(isThemeKey("A")).toBe(true);
    expect(isThemeKey("B")).toBe(true);
  });

  it("rejects invalid inputs", () => {
    expect(isThemeKey("C")).toBe(false);
    expect(isThemeKey("")).toBe(false);
    expect(isThemeKey(null)).toBe(false);
    expect(isThemeKey(undefined)).toBe(false);
    expect(isThemeKey(1)).toBe(false);
    expect(isThemeKey("f")).toBe(false); // case-sensitive
  });
});

describe("VALID_THEMES", () => {
  it("contains exactly F, A, B", () => {
    expect([...VALID_THEMES].sort()).toEqual(["A", "B", "F"]);
  });
});

describe("THEME_STORAGE_KEY", () => {
  it("is the expected localStorage key", () => {
    expect(THEME_STORAGE_KEY).toBe("dd:theme");
  });
});

describe("getInitialTheme", () => {
  beforeEach(() => {
    storedTheme = null;
    domTheme = null;
    localStorageThrows = false;
  });

  it("returns the data-theme attribute when it is a valid key", () => {
    domTheme = "A";
    expect(getInitialTheme()).toBe("A");
  });

  it("falls back to localStorage when data-theme is absent", () => {
    domTheme = null;
    storedTheme = "B";
    expect(getInitialTheme()).toBe("B");
  });

  it("falls back to F when both data-theme and localStorage are absent", () => {
    domTheme = null;
    storedTheme = null;
    expect(getInitialTheme()).toBe("F");
  });

  it("falls back to F when data-theme is an invalid value", () => {
    domTheme = "X";
    storedTheme = null;
    expect(getInitialTheme()).toBe("F");
  });

  it("falls back to F when localStorage throws", () => {
    domTheme = null;
    localStorageThrows = true;
    expect(getInitialTheme()).toBe("F");
  });

  it("prefers data-theme over localStorage when both are set", () => {
    domTheme = "F";
    storedTheme = "B";
    expect(getInitialTheme()).toBe("F");
  });
});

describe("setTheme", () => {
  beforeEach(() => {
    storedTheme = null;
    domTheme = "F";
    localStorageThrows = false;
  });

  it("sets the data-theme attribute on documentElement", () => {
    setTheme("A");
    expect(domTheme).toBe("A");
  });

  it("writes the key to localStorage", () => {
    setTheme("B");
    expect(storedTheme).toBe("B");
  });

  it("updates documentElement even when localStorage throws", () => {
    localStorageThrows = true;
    // Should not throw — fail-silent on storage write.
    expect(() => setTheme("A")).not.toThrow();
    // DOM mutation still applied.
    expect(domTheme).toBe("A");
  });

  it("round-trips: setTheme then getInitialTheme returns the same key", () => {
    setTheme("B");
    // After setTheme, domTheme === "B". getInitialTheme reads that first.
    expect(getInitialTheme()).toBe("B");
  });
});
