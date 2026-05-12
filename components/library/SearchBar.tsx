"use client";

// components/library/SearchBar.tsx — thin wrapper around PillSearchBar
// for the library page. Uses multiline maxRows=4 per U3 spec.

import * as React from "react";
import { PillSearchBar } from "@/components/ui/PillSearchBar";
import { usePredictiveSuggestions } from "@/components/search/usePredictiveSuggestions";

export interface SearchBarProps {
  value?: string;
  onChange?: (next: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * Library search bar — PillSearchBar with multiline maxRows=4 and a
 * library-specific placeholder. Library queries are short, so 4 rows
 * is sufficient (vs chat's 8).
 */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  disabled,
  autoFocus,
}: SearchBarProps) {
  const { suggestions, loading } = usePredictiveSuggestions(value ?? "");

  return (
    <PillSearchBar
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      suggestions={suggestions}
      suggestionsLoading={loading}
      onSuggestionSelect={(suggestion) => onSubmit(suggestion.title)}
      placeholder="search the library + corpus…"
      multiline
      maxRows={4}
      disabled={disabled}
      autoFocus={autoFocus}
      ariaLabel="search the library"
    />
  );
}
