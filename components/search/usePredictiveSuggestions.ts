"use client";

import * as React from "react";
import type { BodyKind } from "@/lib/corpus/body-kind";

export interface SearchSuggestion {
  id: string;
  title: string;
  kind: string;
  source: string | null;
  sourceUrl: string | null;
  bodyKind: BodyKind | null;
}

interface SuggestResponse {
  suggestions?: SearchSuggestion[];
}

export function usePredictiveSuggestions(value: string, minLength = 2) {
  const [suggestions, setSuggestions] = React.useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const q = value.trim();
    if (q.length < minLength) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, {
        signal: ctrl.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`${res.status}`);
          return (await res.json()) as SuggestResponse;
        })
        .then((data) => setSuggestions(data.suggestions ?? []))
        .catch((err: unknown) => {
          if ((err as { name?: string }).name === "AbortError") return;
          setSuggestions([]);
        })
        .finally(() => setLoading(false));
    }, 180);

    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [value, minLength]);

  return { suggestions, loading };
}
