// app/app/learn/page.tsx — KB index for /app/learn.
//
// SSR-fetches all KB articles visible to the actor and renders them as cards.
// Auth-resolves: guests see global-scope KB articles only.

import "server-only";
import * as React from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isGuestRequest } from "@/lib/auth-guest";
import { getSessionActor } from "@/lib/auth-session";
import { GUEST_PLACEHOLDER_UUID } from "@/lib/guest-identity";
import { listKbArticles, type KbArticleSummary } from "@/lib/kb";
import { LearnPageClient } from "./LearnPageClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const guest = !session?.user && (await isGuestRequest());
  const isAuthed = !!session?.user;
  if (!isAuthed && !guest) {
    // Same gating posture as /app/library — guest OR session required.
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-mute">Sign in to view the knowledge base.</p>
      </div>
    );
  }

  const actor = isAuthed ? await getSessionActor() : null;
  const userId = actor?.userId ?? GUEST_PLACEHOLDER_UUID;
  const tenantId = actor?.tenantId ?? GUEST_PLACEHOLDER_UUID;

  let articles: KbArticleSummary[] = [];
  try {
    articles = await listKbArticles({ userId, tenantId });
  } catch (err) {
    console.warn("[/app/learn] list failed:", err);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-h1 sm:text-h1-lg text-ink mb-1">
          Learn
        </h1>
        <p className="text-[14px] text-mute">
          Concepts to understand before browsing the library: skills,
          commands, hooks, MCP, scaffolding, and more.
        </p>
      </div>
      <LearnPageClient initialArticles={articles} />
    </div>
  );
}
