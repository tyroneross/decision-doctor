// app/app/library/page.tsx — V2 U3: /app/library
//
// SSR: fetches initial curated use_cases + prompts via L2's retrieval module.
// Auth-resolves: guests see global-scope content; authed users see global + their saved rows.
//
// Client-side state: kind filter, path filter, search query, onlyMine toggle.
// On any change, fetches /api/library/search with a 300ms debounce.

import "server-only";
import * as React from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isGuestRequest } from "@/lib/auth-guest";
import { getSessionActor } from "@/lib/auth-session";
import { GUEST_PLACEHOLDER_UUID } from "@/lib/guest-identity";
import { getUseCasesForPath, getPromptsForPath } from "@/lib/library";
import type { LibraryUseCase, LibraryPrompt, PainPath } from "@/lib/library";
import { LibraryPageClient } from "./LibraryPageClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_PATHS: PainPath[] = [
  "referrals",
  "research",
  "admin",
  "capacity_growth",
  "follow_up",
  "custom",
];

// SSR fetches top use_cases + prompts for initial render.
// Client-side refetch takes over on filter/search changes.
export default async function LibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const guest = !session?.user && (await isGuestRequest());
  const isAuthed = !!session?.user;

  const actor = isAuthed ? await getSessionActor() : null;
  const userId = actor?.userId ?? GUEST_PLACEHOLDER_UUID;
  const tenantId = actor?.tenantId ?? GUEST_PLACEHOLDER_UUID;

  // SSR: fetch global use_cases + prompts across all paths.
  // Best-effort — failure silently falls back to empty initial state.
  let initialUseCases: LibraryUseCase[] = [];
  let initialPrompts: LibraryPrompt[] = [];

  try {
    const [ucResults, promptResults] = await Promise.all([
      Promise.all(
        ALL_PATHS.map((p) =>
          getUseCasesForPath(userId, tenantId, p, {
            includeUserSaved: isAuthed,
          }),
        ),
      ),
      Promise.all(
        ALL_PATHS.map((p) =>
          getPromptsForPath(userId, tenantId, p, {
            includeUserSaved: isAuthed,
          }),
        ),
      ),
    ]);
    initialUseCases = ucResults.flat().slice(0, 20);
    initialPrompts = promptResults.flat().slice(0, 10);
  } catch {
    // Degrade to empty — client-side search still functional.
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-ink leading-tight mb-1">
          Library
        </h1>
        <p className="text-[14px] text-mute">
          Curated AI use cases and prompts for solo healthcare practitioners
        </p>
      </div>

      <LibraryPageClient
        initialUseCases={initialUseCases}
        initialPrompts={initialPrompts}
        isAuthed={isAuthed}
        isGuest={guest}
      />
    </div>
  );
}
