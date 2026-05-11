"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PillSearchBar } from "@/components/ui/PillSearchBar";

/**
 * F1HomeSearch — Client wrapper around <PillSearchBar> that routes to
 * /app/chat?seed=<encoded> on submit.
 *
 * C6a will wire seed-handling into Chat.tsx; until then the param is
 * read but unused (Chat opens empty).
 */
export function F1HomeSearch() {
  const router = useRouter();

  function handle(value: string) {
    router.push(`/app/chat?seed=${encodeURIComponent(value)}`);
  }

  return (
    <PillSearchBar
      onSubmit={handle}
      placeholder="describe a decision you're stuck on…"
      autoFocus
      minLength={3}
      ariaLabel="describe a decision"
    />
  );
}
