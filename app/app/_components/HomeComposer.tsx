"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PillSearchBar } from "@/components/ui/PillSearchBar";
import { usePredictiveSuggestions } from "@/components/search/usePredictiveSuggestions";

/**
 * HomeComposer — primary AI-adoption search/ask entry point. Free text routes
 * to /app/ask?q=<encoded>, where the question is grounded through retrieval.
 */
export function HomeComposer() {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const { suggestions, loading } = usePredictiveSuggestions(value);

  function handleSubmit(value: string) {
    router.push(`/app/ask?q=${encodeURIComponent(value)}`);
  }

  return (
    <PillSearchBar
      value={value}
      onChange={setValue}
      multiline
      maxRows={6}
      onSubmit={handleSubmit}
      suggestions={suggestions}
      suggestionsLoading={loading}
      onSuggestionSelect={(suggestion) => handleSubmit(suggestion.title)}
      placeholder="search or ask about AI adoption…"
      autoFocus
      minLength={3}
      ariaLabel="search or ask about AI adoption"
    />
  );
}
