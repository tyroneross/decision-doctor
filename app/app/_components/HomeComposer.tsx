"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PillSearchBar } from "@/components/ui/PillSearchBar";

/**
 * HomeComposer — client wrapper around PillSearchBar for the primary AI-
 * adoption search/ask path. Free text routes to /app/ask?q=<encoded>, where
 * the question is grounded through the hybrid /api/search retrieval pipeline.
 */
export function HomeComposer() {
  const router = useRouter();

  function handleSubmit(value: string) {
    router.push(`/app/ask?q=${encodeURIComponent(value)}`);
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
