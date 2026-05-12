"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PillSearchBar } from "@/components/ui/PillSearchBar";

/**
 * HomeComposer — client wrapper around PillSearchBar for the primary pain-to-
 * recommendation path. Informational Q&A remains available via /app/ask; the
 * home composer now starts Aida's adaptive recommendation intake.
 */
export function HomeComposer() {
  const router = useRouter();

  function handleSubmit(value: string) {
    router.push(`/app/recommendations/new?challenge=${encodeURIComponent(value)}`);
  }

  return (
    <PillSearchBar
      multiline
      maxRows={6}
      onSubmit={handleSubmit}
      placeholder="search or ask about AI adoption…"
      autoFocus
      minLength={3}
      ariaLabel="search or ask about AI adoption"
    />
  );
}
