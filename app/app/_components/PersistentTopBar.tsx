"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { PillSearchBar } from "@/components/ui/PillSearchBar";
import { usePredictiveSuggestions } from "@/components/search/usePredictiveSuggestions";

/**
 * PersistentTopBar — the workspace's single chat-entry surface.
 *
 * Renders a sticky PillSearchBar at the top of every `/app/*` page EXCEPT
 * `/app/chat` (where the bottom-of-thread composer is the convention).
 *
 * Submitting routes to `/app/chat?seed=<encoded text>`, which auto-submits
 * the seed once on mount (wired in `components/chat/Chat.tsx`).
 *
 * Predictive suggestions (corpus / use_case / prompt / skill / kb_article)
 * are lifted from the legacy `HomeComposer`; selecting a suggestion submits
 * its title as the seed.
 *
 * Mount: inside the workspace `<main>` column at the top of `app/app/layout.tsx`.
 * On `/app/chat` the component returns null so the chat composer (bottom-of-thread)
 * remains the only input on that surface.
 */
export function PersistentTopBar() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [value, setValue] = React.useState("");
  const { suggestions, loading } = usePredictiveSuggestions(value);

  // Hide on the chat surface — chat owns its own bottom composer.
  if (pathname.startsWith("/app/chat")) {
    return null;
  }

  function handleSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    router.push(`/app/chat?seed=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div
      className={
        // Stacks below the mobile brand header (z-30) on small screens; pins
        // to the very top on desktop where there's no mobile header.
        "no-print sticky top-12 lg:top-0 z-20 " +
        "bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85 " +
        "border-b border-line"
      }
    >
      <div className="max-w-2xl mx-auto px-5 py-3">
        <PillSearchBar
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          multiline
          maxRows={4}
          minLength={3}
          suggestions={suggestions}
          suggestionsLoading={loading}
          onSuggestionSelect={(suggestion) => handleSubmit(suggestion.title)}
          placeholder="Ask Aida…"
          ariaLabel="Ask Aida"
        />
      </div>
    </div>
  );
}
