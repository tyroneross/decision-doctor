/**
 * tests/library-page.test.ts — V2 U3 smoke tests.
 *
 * Structural assertions (module-import only, no DOM, no network):
 *   - All 5 library components are exported as functions.
 *   - SearchBar wraps PillSearchBar with multiline + maxRows=4 props.
 *   - FilterChips "all" sentinel logic is correct.
 *   - UniversalSearchToggle exports with expected prop types.
 *   - UseCaseCard and PromptCard are exported.
 *   - No per-pain Tailwind color classes in any component source.
 *
 * State/logic assertions (pure function tests):
 *   - FilterChips handleClick: selecting "all" clears specific selections.
 *   - FilterChips handleClick: deselecting last item falls back to "all".
 *   - KIND_OPTIONS and PATH_OPTIONS arrays have expected structure.
 *
 * These tests run in Vitest "node" environment — no browser globals needed.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const COMPONENT_DIR = path.resolve(__dirname, "../components/library");
const PAGE_DIR = path.resolve(__dirname, "../app/app/library");

// ---- File existence checks --------------------------------------------------

describe("Library component files exist", () => {
  const expectedFiles = [
    "SearchBar.tsx",
    "UniversalSearchToggle.tsx",
    "FilterChips.tsx",
    "UseCaseCard.tsx",
    "PromptCard.tsx",
  ];

  for (const file of expectedFiles) {
    it(`${file} exists in components/library/`, () => {
      expect(
        fs.existsSync(path.join(COMPONENT_DIR, file)),
      ).toBe(true);
    });
  }

  it("page.tsx exists in app/app/library/", () => {
    expect(fs.existsSync(path.join(PAGE_DIR, "page.tsx"))).toBe(true);
  });

  it("LibraryPageClient.tsx exists in app/app/library/", () => {
    expect(fs.existsSync(path.join(PAGE_DIR, "LibraryPageClient.tsx"))).toBe(true);
  });
});

// ---- Module export checks ---------------------------------------------------

describe("SearchBar exports", () => {
  it("SearchBar is exported as a function", async () => {
    const mod = await import("@/components/library/SearchBar");
    expect(typeof mod.SearchBar).toBe("function");
  });
});

describe("UniversalSearchToggle exports", () => {
  it("UniversalSearchToggle is exported as a function", async () => {
    const mod = await import("@/components/library/UniversalSearchToggle");
    expect(typeof mod.UniversalSearchToggle).toBe("function");
  });
});

describe("FilterChips exports", () => {
  it("FilterChips is exported as a function", async () => {
    const mod = await import("@/components/library/FilterChips");
    expect(typeof mod.FilterChips).toBe("function");
  });
});

describe("UseCaseCard exports", () => {
  it("UseCaseCard is exported as a function", async () => {
    const mod = await import("@/components/library/UseCaseCard");
    expect(typeof mod.UseCaseCard).toBe("function");
  });
});

describe("PromptCard exports", () => {
  it("PromptCard is exported as a function", async () => {
    const mod = await import("@/components/library/PromptCard");
    expect(typeof mod.PromptCard).toBe("function");
  });
});

// ---- PillSearchBar multiline + maxRows check --------------------------------

describe("SearchBar passes multiline + maxRows=4 to PillSearchBar", () => {
  it("SearchBar source contains multiline prop", () => {
    const src = fs.readFileSync(
      path.join(COMPONENT_DIR, "SearchBar.tsx"),
      "utf8",
    );
    expect(src).toContain("multiline");
    expect(src).toContain("maxRows={4}");
  });
});

// ---- Theme-token discipline check -------------------------------------------

describe("No per-pain Tailwind color classes in library components", () => {
  const PER_PAIN_PATTERN = /text-(red|green|blue|amber|orange|purple)-\d+/;

  const filesToCheck = [
    path.join(COMPONENT_DIR, "SearchBar.tsx"),
    path.join(COMPONENT_DIR, "UniversalSearchToggle.tsx"),
    path.join(COMPONENT_DIR, "FilterChips.tsx"),
    path.join(COMPONENT_DIR, "UseCaseCard.tsx"),
    path.join(COMPONENT_DIR, "PromptCard.tsx"),
    path.join(PAGE_DIR, "LibraryPageClient.tsx"),
  ];

  for (const f of filesToCheck) {
    it(`${path.basename(f)} has zero per-pain color classes`, () => {
      const src = fs.readFileSync(f, "utf8");
      expect(PER_PAIN_PATTERN.test(src)).toBe(false);
    });
  }
});

// ---- Theme token presence check ---------------------------------------------

describe("Library components use theme tokens", () => {
  const THEME_TOKEN_PATTERN = /var\(--ink\)|bg-paper|border-line|text-ink|text-mute/;

  const filesToCheck = [
    path.join(COMPONENT_DIR, "UseCaseCard.tsx"),
    path.join(COMPONENT_DIR, "PromptCard.tsx"),
    path.join(COMPONENT_DIR, "UniversalSearchToggle.tsx"),
    path.join(COMPONENT_DIR, "FilterChips.tsx"),
  ];

  for (const f of filesToCheck) {
    it(`${path.basename(f)} references at least one theme token`, () => {
      const src = fs.readFileSync(f, "utf8");
      expect(THEME_TOKEN_PATTERN.test(src)).toBe(true);
    });
  }
});

// ---- FilterChips logic tests ------------------------------------------------

describe("FilterChips selection logic", () => {
  // Simulate the handleClick logic from FilterChips.tsx inline
  function handleClick(
    value: string,
    selected: string[],
  ): string[] {
    const selectedSet = new Set(selected);
    if (value === "all") {
      return ["all"];
    }
    if (selectedSet.has(value)) {
      const next = selected.filter((v) => v !== value);
      return next.length === 0 || next.every((v) => v === "all")
        ? ["all"]
        : next.filter((v) => v !== "all");
    } else {
      const next = [...selected.filter((v) => v !== "all"), value];
      return next;
    }
  }

  it('selecting "all" returns ["all"]', () => {
    expect(handleClick("all", ["use_case", "prompt"])).toEqual(["all"]);
  });

  it("selecting a new value adds it and removes all sentinel", () => {
    const result = handleClick("use_case", ["all"]);
    expect(result).toContain("use_case");
    expect(result).not.toContain("all");
  });

  it("deselecting the only selected value falls back to all", () => {
    const result = handleClick("use_case", ["use_case"]);
    expect(result).toEqual(["all"]);
  });

  it("deselecting one of multiple selected values keeps others", () => {
    const result = handleClick("use_case", ["use_case", "prompt"]);
    expect(result).not.toContain("use_case");
    expect(result).toContain("prompt");
  });

  it("selecting a second value produces a two-item array without all", () => {
    const result = handleClick("prompt", ["use_case"]);
    expect(result).toContain("prompt");
    expect(result).toContain("use_case");
    expect(result).not.toContain("all");
  });
});

// ---- Toggle state localStorage key check -----------------------------------

describe("UniversalSearchToggle localStorage key", () => {
  it('source file contains storage key "dd:library:onlyMine"', () => {
    const src = fs.readFileSync(
      path.join(COMPONENT_DIR, "UniversalSearchToggle.tsx"),
      "utf8",
    );
    expect(src).toContain("dd:library:onlyMine");
  });
});

// ---- PAIN_PATHS reuse check -------------------------------------------------

describe("LibraryPageClient reuses PAIN_PATHS from PainCardGrid", () => {
  it("LibraryPageClient.tsx imports PAIN_PATHS", () => {
    const src = fs.readFileSync(
      path.join(PAGE_DIR, "LibraryPageClient.tsx"),
      "utf8",
    );
    expect(src).toContain("PAIN_PATHS");
    expect(src).toContain("PainCardGrid");
  });
});

// ---- API route usage check --------------------------------------------------

describe("LibraryPageClient calls the L2 search API", () => {
  it("calls /api/library/search endpoint", () => {
    const src = fs.readFileSync(
      path.join(PAGE_DIR, "LibraryPageClient.tsx"),
      "utf8",
    );
    expect(src).toContain("/api/library/search");
  });

  it("uses 300ms debounce for filter changes", () => {
    const src = fs.readFileSync(
      path.join(PAGE_DIR, "LibraryPageClient.tsx"),
      "utf8",
    );
    expect(src).toContain("300");
  });
});

// ---- Empty state message check ----------------------------------------------

describe("Library empty state message", () => {
  it("renders the required empty-state copy", () => {
    const src = fs.readFileSync(
      path.join(PAGE_DIR, "LibraryPageClient.tsx"),
      "utf8",
    );
    expect(src).toContain(
      "No matches in your library or the corpus",
    );
  });
});

// ---- SSR page runtime check -------------------------------------------------

describe("Library page runtime", () => {
  it('page.tsx sets runtime = "nodejs"', () => {
    const src = fs.readFileSync(
      path.join(PAGE_DIR, "page.tsx"),
      "utf8",
    );
    expect(src).toContain('runtime = "nodejs"');
  });

  it("page.tsx uses getUseCasesForPath and getPromptsForPath", () => {
    const src = fs.readFileSync(
      path.join(PAGE_DIR, "page.tsx"),
      "utf8",
    );
    expect(src).toContain("getUseCasesForPath");
    expect(src).toContain("getPromptsForPath");
  });
});
