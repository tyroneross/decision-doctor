"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PillSearchBar } from "@/components/ui/PillSearchBar";

/**
 * HomeComposer — client wrapper around PillSearchBar for the V2 hybrid
 * first screen. Submit routes free text to /app/recommendations/new?challenge=<encoded>
 * (chat-first path). Route wired in U2; until then, 404 is expected and graceful.
 */
export function HomeComposer() {
  const router = useRouter();

  function handleSubmit(value: string) {
    router.push(
      `/app/recommendations/new?challenge=${encodeURIComponent(value)}`
    );
  }

  return (
    <PillSearchBar
      multiline
      maxRows={6}
      onSubmit={handleSubmit}
      placeholder="describe what you want AI to help with first…"
      autoFocus
      minLength={3}
      ariaLabel="describe your AI challenge"
    />
  );
}
