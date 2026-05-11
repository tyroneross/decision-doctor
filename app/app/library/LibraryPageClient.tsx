"use client";

// app/app/library/LibraryPageClient.tsx
//
// Client-side state shell for the library page.
// Manages: search query, kind filter, path filter, onlyMine toggle.
// On any change (with 300ms debounce on search) fetches /api/library/search.

import * as React from "react";
import { SearchBar } from "@/components/library/SearchBar";
import { UniversalSearchToggle } from "@/components/library/UniversalSearchToggle";
import { FilterChips } from "@/components/library/FilterChips";
import { UseCaseCard } from "@/components/library/UseCaseCard";
import { PromptCard } from "@/components/library/PromptCard";
import type { LibraryUseCase, LibraryPrompt, LibraryHit, PainPath } from "@/lib/library";
import { PAIN_PATHS } from "@/components/pain-cards/PainCardGrid";

// ---- Static chip option lists -----------------------------------------------

const KIND_OPTIONS = [
  { value: "all", label: "All" },
  { value: "use_case", label: "Use cases" },
  { value: "prompt", label: "Prompts" },
  { value: "skill", label: "Skills" },
  { value: "plugin", label: "Plugins" },
  { value: "corpus", label: "Corpus" },
];

const PATH_OPTIONS = [
  { value: "all", label: "All paths" },
  ...PAIN_PATHS.filter((p) => p.pathId !== "custom").map((p) => ({
    value: p.pathId,
    label: p.label.replace(/^(Grow or manage|Keep up with|Reduce|Plan|Improve)\s+/i, "").slice(0, 28),
  })),
  { value: "custom", label: "Custom" },
];

// ---- Result shape after a search API call -----------------------------------

interface SearchResponse {
  results: LibraryHit[];
  total: number;
  total_ms: number;
  onlyMine: boolean;
}

// ---- Props ------------------------------------------------------------------

export interface LibraryPageClientProps {
  initialUseCases: LibraryUseCase[];
  initialPrompts: LibraryPrompt[];
  isAuthed: boolean;
  isGuest: boolean | null;
}

// ---- Helpers ----------------------------------------------------------------

/** Convert the SSR-fetched rows into LibraryHit shape for unified rendering. */
function useCasesToHits(rows: LibraryUseCase[]): LibraryHit[] {
  return rows.map((r) => ({
    kind: "use_case" as const,
    id: r.id,
    title: r.title,
    snippet: r.body.slice(0, 300).replace(/\s+/g, " "),
    score: 0,
    source_path: r.painPath as PainPath,
    library_id: r.id,
  }));
}

function promptsToHits(rows: LibraryPrompt[]): LibraryHit[] {
  return rows.map((r) => ({
    kind: "prompt" as const,
    id: r.id,
    title: r.title,
    snippet: r.body.slice(0, 300).replace(/\s+/g, " "),
    score: 0,
    source_path: r.painPath as PainPath,
    library_id: r.id,
  }));
}

// ---- Component ----------------------------------------------------------------

export function LibraryPageClient({
  initialUseCases,
  initialPrompts,
  isAuthed,
  isGuest,
}: LibraryPageClientProps) {
  // State
  const [query, setQuery] = React.useState("");
  const [submittedQuery, setSubmittedQuery] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState<string[]>(["all"]);
  const [pathFilter, setPathFilter] = React.useState<string[]>(["all"]);
  const [onlyMine, setOnlyMine] = React.useState(false);
  const [results, setResults] = React.useState<LibraryHit[]>(() => [
    ...useCasesToHits(initialUseCases),
    ...promptsToHits(initialPrompts),
  ]);
  const [loading, setLoading] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build search URL from current state.
  function buildSearchUrl(q: string, kinds: string[], paths: string[], mine: boolean) {
    const params = new URLSearchParams();
    params.set("q", q || " ");
    if (!kinds.includes("all") && kinds.length > 0) {
      params.set("kinds", kinds.join(","));
    }
    if (!paths.includes("all") && paths.length > 0) {
      params.set("paths", paths.join(","));
    }
    params.set("onlyMine", String(mine));
    return `/api/library/search?${params.toString()}`;
  }

  // Fetch search results.
  async function fetchResults(q: string, kinds: string[], paths: string[], mine: boolean) {
    if (!q.trim() && kinds.includes("all") && paths.includes("all") && !mine) {
      // No active filters and no query — show SSR initial data.
      setResults([
        ...useCasesToHits(initialUseCases),
        ...promptsToHits(initialPrompts),
      ]);
      return;
    }
    // For empty query with filters: use a single-space to get all results (API requires q≥1).
    const url = buildSearchUrl(q, kinds, paths, mine);
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: SearchResponse = await res.json();
      setResults(data.results);
    } catch {
      // Degrade: keep current results.
    } finally {
      setLoading(false);
    }
  }

  // Submit handler from SearchBar (user pressed Enter or send button).
  function handleSubmit(value: string) {
    setSubmittedQuery(value);
    setQuery(value);
    void fetchResults(value, kindFilter, pathFilter, onlyMine);
  }

  // Debounced filter changes (kind, path, toggle).
  function scheduleRefetch(q: string, kinds: string[], paths: string[], mine: boolean) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchResults(q, kinds, paths, mine);
    }, 300);
  }

  function handleKindChange(next: string[]) {
    setKindFilter(next);
    scheduleRefetch(submittedQuery || query, next, pathFilter, onlyMine);
  }

  function handlePathChange(next: string[]) {
    setPathFilter(next);
    scheduleRefetch(submittedQuery || query, kindFilter, next, onlyMine);
  }

  function handleOnlyMineChange(next: boolean) {
    setOnlyMine(next);
    scheduleRefetch(submittedQuery || query, kindFilter, pathFilter, next);
  }

  // Save action.
  async function handleSave(id: string) {
    setSaveError(null);
    const item = results.find((r) => r.id === id);
    if (!item) return;
    try {
      const res = await fetch("/api/library/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          painPath: item.source_path ?? "custom",
          startingLevel: "prompt",
          title: item.title,
          body: item.snippet,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError((err as Record<string, string>).error ?? "Save failed");
      }
    } catch {
      setSaveError("Network error — save failed");
    }
  }

  // Render a single result hit.
  function renderHit(hit: LibraryHit) {
    if (hit.kind === "prompt") {
      return (
        <PromptCard
          key={hit.id}
          id={hit.id}
          title={hit.title}
          body={hit.snippet}
          painPath={hit.source_path}
          score={hit.score}
          isAuthed={isAuthed}
          onSave={isAuthed ? handleSave : undefined}
        />
      );
    }
    return (
      <UseCaseCard
        key={hit.id}
        id={hit.id}
        kind={hit.kind}
        title={hit.title}
        body={hit.snippet}
        painPath={hit.source_path}
        score={hit.score}
        sourceUrl={hit.corpus_doc_id ? undefined : undefined}
        isAuthed={isAuthed}
        onSave={isAuthed ? handleSave : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Search bar */}
      <SearchBar
        value={query}
        onChange={setQuery}
        onSubmit={handleSubmit}
        autoFocus={false}
      />

      {/* Only my content toggle */}
      <UniversalSearchToggle
        isAuthed={isAuthed}
        value={onlyMine}
        onChange={handleOnlyMineChange}
      />

      {/* Kind filter chips */}
      <FilterChips
        options={KIND_OPTIONS}
        selected={kindFilter}
        onChange={handleKindChange}
        ariaLabel="Filter by kind"
      />

      {/* Pain-path filter chips */}
      <FilterChips
        options={PATH_OPTIONS}
        selected={pathFilter}
        onChange={handlePathChange}
        ariaLabel="Filter by pain path"
      />

      {/* Save error */}
      {saveError && (
        <p className="text-[13px] text-mute border border-line rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      {/* Loading state */}
      {loading && (
        <p className="text-[13px] text-mute" aria-live="polite">
          Searching…
        </p>
      )}

      {/* Results grid */}
      {!loading && results.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-[14px] text-mute">
            No matches in your library or the corpus. Try broader terms, or browse by pain path below.
          </p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          role="list"
          aria-label="Library results"
        >
          {results.map((hit) => (
            <div key={hit.id} role="listitem">
              {renderHit(hit)}
            </div>
          ))}
        </div>
      )}

      {/* Guest nudge */}
      {isGuest && (
        <p className="text-[13px] text-mute text-center pt-4">
          <a href="/sign-in" className="text-ink font-medium hover:underline">
            Sign in
          </a>{" "}
          to save use cases and prompts to your personal library.
        </p>
      )}
    </div>
  );
}
