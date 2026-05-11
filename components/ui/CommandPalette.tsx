"use client";

// F-10 — Command Palette for hybrid search.
//
// ⌘K / Ctrl+K opens. Esc closes. 300ms debounce on input. Scope toggle
// (global · my-sources · both). Per-result "Use as context" injects the
// result into the chat thread via /app/chat?context=<doc_id>.
//
// Mounted from app/app/layout.tsx so it's available everywhere under
// /app/*. Renders into a portal so it sits above the existing shell.

import * as React from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";

type Scope = "global" | "my" | "both";

interface SearchResult {
  doc_id: string;
  title: string;
  source_url: string;
  snippet: string;
  score: number;
  legs: string[];
}

interface SearchResponse {
  results: SearchResult[];
  total_ms: number;
  degraded: boolean;
  source: string;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [scope, setScope] = React.useState<Scope>("both");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const debouncedQ = useDebounced(q.trim(), 300);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => setMounted(true), []);

  // Hotkey: ⌘K / Ctrl+K
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced search. Abort in-flight on new keystroke.
  React.useEffect(() => {
    if (!debouncedQ) {
      setResults([]);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      q: debouncedQ,
      scope,
      limit: "10",
    });
    fetch(`/api/search?${params.toString()}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as SearchResponse;
      })
      .then((j) => setResults(j.results))
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setError("Search failed.");
        setResults([]);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [debouncedQ, scope]);

  const useAsContext = (docId: string) => {
    setOpen(false);
    router.push(`/app/chat?context=${encodeURIComponent(docId)}`);
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 backdrop-blur-sm pt-[10vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Search corpus"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-2xl bg-paper border border-line rounded-[12px] shadow-card overflow-hidden">
        <div className="border-b border-line p-3">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search corpus, papers, knowledge graph…"
            className="w-full bg-transparent text-[15px] text-ink placeholder:text-mute focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex items-center gap-1.5 mt-2">
            {(["both", "global", "my"] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors " +
                  (scope === s
                    ? "bg-ink text-paper border-ink"
                    : "bg-paper text-ink/70 border-line hover:border-ink/40")
                }
                aria-pressed={scope === s}
              >
                {s === "both" ? "All" : s === "global" ? "Corpus" : "My sources"}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-mute">⌘K to toggle</span>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="p-3 text-[13px] text-mute">Searching…</div>
          )}
          {!loading && error && (
            <div className="p-3 text-[13px] text-bad">{error}</div>
          )}
          {!loading && !error && debouncedQ && results.length === 0 && (
            <div className="p-3 text-[13px] text-mute">No matches.</div>
          )}
          {!loading && results.length > 0 && (
            <ul className="divide-y divide-line">
              {results.map((r) => (
                <li
                  key={r.doc_id}
                  className="p-3 flex items-start gap-3 hover:bg-line/30"
                >
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-0"
                  >
                    <div className="text-[14px] font-semibold text-ink truncate">
                      {r.title}
                    </div>
                    <div className="text-[12px] text-mute mt-0.5 line-clamp-2">
                      {r.snippet}
                    </div>
                    <div className="text-[11px] text-mute mt-1 flex gap-1.5">
                      {r.legs.map((leg) => (
                        <span
                          key={leg}
                          className="inline-flex items-center rounded-full bg-line/50 px-1.5 py-px"
                        >
                          {leg}
                        </span>
                      ))}
                    </div>
                  </a>
                  <Button
                    variant="secondary"
                    onClick={() => useAsContext(r.doc_id)}
                    className="shrink-0 !py-1.5 !text-[12px]"
                  >
                    Use as context
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
