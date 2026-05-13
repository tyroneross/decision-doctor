"use client";

// app/app/library/LibraryPageClient.tsx
//
// Client-side state shell for the library page.
//
// Manages: search query, kind filter, path filter, onlyMine toggle, saved
// searches strip, saved response cards.
//
// On any change (with 300ms debounce on search) fetches /api/library/search.
//
// 2026-05 upgrade:
//   - FilterChips rows → FilterDropdown (multi-select dropdowns).
//   - Saved searches pinned strip + Save-this-search action.
//   - saved_response renderer (collapsible SavedResponseCard).
//   - saved_search renderer (apply-this-search card when the kind filter
//     explicitly opts in via the Type dropdown).
//   - Default mixed search excludes saved_search (the strip is the discovery
//     surface). saved_response IS included in mixed results by default —
//     personal answers are content, not navigation.

import * as React from "react";
import Link from "next/link";
import { GraduationCap, ArrowRight, Search as SearchIcon } from "lucide-react";
import { SearchBar } from "@/components/library/SearchBar";
import { UniversalSearchToggle } from "@/components/library/UniversalSearchToggle";
import { FilterDropdown } from "@/components/library/FilterDropdown";
import { SaveSearchButton } from "@/components/library/SaveSearchButton";
import { SavedSearchesStrip } from "@/components/library/SavedSearchesStrip";
import { SavedResponseCard } from "@/components/library/SavedResponseCard";
import { UseCaseCard } from "@/components/library/UseCaseCard";
import { PromptCard } from "@/components/library/PromptCard";
import { SearchScopeToggle } from "@/components/SearchScopeToggle";
import {
  SearchScopeProvider,
  useSearchScope,
} from "@/lib/search-scope/context";
import type {
  LibraryUseCase,
  LibraryPrompt,
  LibraryHit,
  LibrarySavedSearch,
  PainPath,
} from "@/lib/library";
import { PAIN_PATHS } from "@/components/pain-cards/PainCardGrid";

// ---- Static option lists ----------------------------------------------------

const KIND_OPTIONS = [
  { value: "all", label: "All" },
  { value: "use_case", label: "Use cases" },
  { value: "prompt", label: "Prompts" },
  { value: "skill", label: "Skills" },
  { value: "plugin", label: "Plugins" },
  { value: "kb_article", label: "Learn" },
  { value: "corpus", label: "Corpus" },
  { value: "saved_response", label: "Saved responses" },
  { value: "saved_search", label: "Saved searches" },
];

const PATH_OPTIONS = [
  { value: "all", label: "All paths" },
  ...PAIN_PATHS.filter((p) => p.pathId !== "custom").map((p) => ({
    value: p.pathId,
    label: p.label.replace(/^(Grow or manage|Keep up with|Reduce|Plan|Improve)\s+/i, ""),
  })),
  { value: "custom", label: "Custom" },
];

// Kind values that are excluded from default (no-explicit-filter) mixed search.
// saved_search is navigational — the pinned strip is its discovery surface;
// including it in mixed results would duplicate that affordance and confuse
// ranking (rank=0 vs FTS-ranked content).
const DEFAULT_EXCLUDED_FROM_MIXED = new Set(["saved_search"]);

const ALL_NON_EXCLUDED_KINDS = KIND_OPTIONS
  .filter((o) => o.value !== "all" && !DEFAULT_EXCLUDED_FROM_MIXED.has(o.value))
  .map((o) => o.value);

// ---- Result shape -----------------------------------------------------------

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

function libraryUseCasesToHits(rows: LibraryUseCase[]): LibraryHit[] {
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

// ---- Component --------------------------------------------------------------

export function LibraryPageClient(props: LibraryPageClientProps) {
  // Outer wrapper provides SearchScope context so the inner body can use the
  // toggle + read the active audience scope when building search URLs.
  return (
    <SearchScopeProvider isAuthed={props.isAuthed}>
      <LibraryPageClientBody {...props} />
    </SearchScopeProvider>
  );
}

function LibraryPageClientBody({
  initialUseCases,
  initialPrompts,
  isAuthed,
  isGuest,
}: LibraryPageClientProps) {
  const { scope: audienceScope } = useSearchScope();
  // Search state.
  const [query, setQuery] = React.useState("");
  const [submittedQuery, setSubmittedQuery] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState<string[]>(["all"]);
  const [pathFilter, setPathFilter] = React.useState<string[]>(["all"]);
  const [onlyMine, setOnlyMine] = React.useState(false);
  const [results, setResults] = React.useState<LibraryHit[]>(() => [
    ...libraryUseCasesToHits(initialUseCases),
    ...promptsToHits(initialPrompts),
  ]);
  const [loading, setLoading] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Saved searches strip state.
  const [savedSearches, setSavedSearches] = React.useState<LibrarySavedSearch[]>(
    [],
  );

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Saved searches: load on mount + after each save ----------------------

  const reloadSavedSearches = React.useCallback(async () => {
    if (!isAuthed) {
      setSavedSearches([]);
      return;
    }
    try {
      const res = await fetch("/api/library/saved-searches");
      if (!res.ok) return;
      const data = (await res.json()) as { saved_searches: LibrarySavedSearch[] };
      setSavedSearches(data.saved_searches ?? []);
    } catch {
      // Degrade — empty strip.
    }
  }, [isAuthed]);

  React.useEffect(() => {
    void reloadSavedSearches();
  }, [reloadSavedSearches]);

  // ---- Search URL builder ---------------------------------------------------

  function buildSearchUrl(
    q: string,
    kinds: string[],
    paths: string[],
    mine: boolean,
    scope: "focused" | "broad",
  ): string {
    const params = new URLSearchParams();
    params.set("q", q || " ");
    // Resolve "all" sentinel → explicit kind list MINUS the navigation kinds
    // (saved_search) that don't belong in default mixed results.
    if (!kinds.includes("all") && kinds.length > 0) {
      params.set("kinds", kinds.join(","));
    } else {
      params.set("kinds", ALL_NON_EXCLUDED_KINDS.join(","));
    }
    if (!paths.includes("all") && paths.length > 0) {
      params.set("paths", paths.join(","));
    }
    params.set("onlyMine", String(mine));
    params.set("audienceScope", scope);
    return `/api/library/search?${params.toString()}`;
  }

  // ---- Fetch results --------------------------------------------------------

  async function fetchResults(
    q: string,
    kinds: string[],
    paths: string[],
    mine: boolean,
    scope: "focused" | "broad",
  ) {
    if (
      !q.trim() &&
      kinds.includes("all") &&
      paths.includes("all") &&
      !mine
    ) {
      // No active filters AND no query — SSR initial data.
      setResults([
        ...libraryUseCasesToHits(initialUseCases),
        ...promptsToHits(initialPrompts),
      ]);
      return;
    }
    const url = buildSearchUrl(q, kinds, paths, mine, scope);
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: SearchResponse = await res.json();
      setResults(data.results);
    } catch {
      // Degrade silently.
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(value: string) {
    setSubmittedQuery(value);
    setQuery(value);
    void fetchResults(value, kindFilter, pathFilter, onlyMine, audienceScope);
  }

  // Refetch whenever the audience scope flips while a query is active.
  // Initial SSR data still wins when no filters are set.
  React.useEffect(() => {
    if (!submittedQuery && kindFilter.includes("all") && pathFilter.includes("all") && !onlyMine) {
      return;
    }
    void fetchResults(submittedQuery, kindFilter, pathFilter, onlyMine, audienceScope);
    // Intentionally omit fetchResults from deps — it captures the latest closure values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceScope]);

  function scheduleRefetch(
    q: string,
    kinds: string[],
    paths: string[],
    mine: boolean,
  ) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const scopeAtSchedule = audienceScope;
    debounceRef.current = setTimeout(() => {
      void fetchResults(q, kinds, paths, mine, scopeAtSchedule);
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

  // ---- Saved search: apply, rename, delete ---------------------------------

  function handleApplySavedSearch(item: LibrarySavedSearch) {
    const kindFilterParsed = Array.isArray(item.kindFilter)
      ? (item.kindFilter as string[])
      : [];
    const pathFilterParsed = Array.isArray(item.pathFilter)
      ? (item.pathFilter as string[])
      : [];
    const nextKinds =
      kindFilterParsed.length === 0 ? ["all"] : kindFilterParsed;
    const nextPaths =
      pathFilterParsed.length === 0 ? ["all"] : pathFilterParsed;
    setKindFilter(nextKinds);
    setPathFilter(nextPaths);
    setOnlyMine(item.onlyMine);
    setQuery(item.query);
    setSubmittedQuery(item.query);
    void fetchResults(item.query, nextKinds, nextPaths, item.onlyMine, audienceScope);
  }

  async function handleRenameSavedSearch(id: string, name: string | null) {
    try {
      const res = await fetch(`/api/library/saved-searches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { saved_search: LibrarySavedSearch };
      setSavedSearches((prev) =>
        prev.map((s) => (s.id === id ? data.saved_search : s)),
      );
    } catch {
      // No-op — UI stays put.
    }
  }

  async function handleDeleteSavedSearch(id: string) {
    try {
      const res = await fetch(`/api/library/saved-searches/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setSavedSearches((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // No-op.
    }
  }

  // ---- Saved response: delete inline ---------------------------------------

  async function handleDeleteSavedResponse(id: string) {
    try {
      const res = await fetch(`/api/library/saved-responses/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      // Remove from results in place.
      setResults((prev) => prev.filter((r) => !(r.kind === "saved_response" && r.id === id)));
    } catch {
      // No-op.
    }
  }

  // ---- Save action (existing use-case save) --------------------------------

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
      setSaveError("Network error. Save failed.");
    }
  }

  // ---- Render a single result hit ------------------------------------------

  function renderHit(hit: LibraryHit) {
    if (hit.kind === "saved_response" && hit.saved_response) {
      return (
        <SavedResponseCard
          key={hit.id}
          id={hit.id}
          payload={hit.saved_response}
          onDelete={isAuthed ? handleDeleteSavedResponse : undefined}
        />
      );
    }
    if (hit.kind === "saved_search" && hit.saved_search) {
      // Apply-this-search card. Only surfaced when the Type filter explicitly
      // includes saved_search (otherwise the pinned strip is the surface).
      return (
        <button
          key={hit.id}
          type="button"
          onClick={() =>
            handleApplySavedSearch({
              id: hit.id,
              scope: "",
              name: hit.saved_search!.name,
              query: hit.saved_search!.query,
              kindFilter: hit.saved_search!.kindFilter,
              pathFilter: hit.saved_search!.pathFilter,
              onlyMine: hit.saved_search!.onlyMine,
              metadata: {},
              createdAt: new Date(hit.saved_search!.createdAt),
              updatedAt: new Date(hit.saved_search!.createdAt),
            } as LibrarySavedSearch)
          }
          className="bg-paper border border-line rounded-xl p-4 flex flex-col gap-2 text-left hover:border-ink transition-[border-color] duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          aria-label={`Apply saved search: ${hit.title}`}
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-mute">
            <SearchIcon size={12} aria-hidden />
            <span className="font-semibold">Saved search</span>
          </div>
          <h3 className="text-h3 text-ink">{hit.title}</h3>
          {hit.snippet && (
            <p className="text-[13px] text-text leading-relaxed line-clamp-2">
              {hit.snippet}
            </p>
          )}
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ink">
            Apply search
            <ArrowRight size={12} aria-hidden />
          </span>
        </button>
      );
    }
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
    if (hit.kind === "kb_article") {
      const slug = hit.slug ?? "";
      return (
        <article
          key={hit.id}
          className="bg-paper border border-line rounded-xl p-4 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-mute">
            <GraduationCap size={12} aria-hidden />
            <span className="font-semibold">Learn</span>
          </div>
          <h3 className="text-h3 text-ink">{hit.title}</h3>
          {hit.snippet && (
            <p className="text-[13px] text-text leading-relaxed line-clamp-3">
              {hit.snippet}
            </p>
          )}
          {slug && (
            <Link
              href={`/app/learn/${slug}`}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-ink"
            >
              Read article
              <ArrowRight size={12} aria-hidden />
            </Link>
          )}
        </article>
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
        bodyKind={hit.body_kind}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Saved searches strip — above the search bar so it's the first
          discovery surface for returning users. Only renders when the user
          has at least one saved entry. */}
      {isAuthed && (
        <SavedSearchesStrip
          items={savedSearches}
          onApply={handleApplySavedSearch}
          onRename={handleRenameSavedSearch}
          onDelete={handleDeleteSavedSearch}
        />
      )}

      {/* Search bar */}
      <SearchBar
        value={query}
        onChange={setQuery}
        onSubmit={handleSubmit}
        autoFocus={false}
      />

      {/* Toggle + Save action — same row so all search-context controls share visual weight. */}
      <div className="flex flex-wrap items-center gap-4">
        <UniversalSearchToggle
          isAuthed={isAuthed}
          value={onlyMine}
          onChange={handleOnlyMineChange}
        />
        <SearchScopeToggle compact />
        <div className="flex-1" />
        <SaveSearchButton
          query={submittedQuery || query}
          kindFilter={kindFilter}
          pathFilter={pathFilter}
          onlyMine={onlyMine}
          isAuthed={isAuthed}
          onSaved={reloadSavedSearches}
        />
      </div>

      {/* Filter dropdowns — replace the previous two FilterChips rows. */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterDropdown
          label="Type"
          options={KIND_OPTIONS}
          selected={kindFilter}
          onChange={handleKindChange}
        />
        <FilterDropdown
          label="Path"
          options={PATH_OPTIONS}
          selected={pathFilter}
          onChange={handlePathChange}
        />
      </div>

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
        <div className="py-12 text-center flex flex-col items-center gap-3">
          <p className="text-[14px] text-mute">
            No matches in your library or the corpus. Try broader terms, or
            use the path filters above.
          </p>
          <EmptyScopeFlipPrompt />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          role="list"
          aria-label="Library results"
        >
          {results.map((hit) => (
            <div key={`${hit.kind}-${hit.id}`} role="listitem">
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

/**
 * Inline empty-state flip prompt — only renders when the current scope is
 * Focused; clicking flips to Broad and the Library page's audienceScope
 * effect re-fetches with the new scope.
 */
function EmptyScopeFlipPrompt() {
  const { scope, setScope } = useSearchScope();
  if (scope !== "focused") return null;
  return (
    <button
      type="button"
      onClick={() => void setScope("broad")}
      className="text-[13px] text-ink font-medium underline underline-offset-2"
    >
      Nothing matched in adoption-tagged sources. Try Broad?
    </button>
  );
}
