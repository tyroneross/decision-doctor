// app/app/library/use-case/[id]/page.tsx — V2 L4: use-case detail surface.
//
// Server component. Loads the use-case row via RLS, renders:
//   - Hero (title + 1-line description from body)
//   - Streamed example output (via POST /api/library/use-cases/[id]/example)
//   - Chat refine pane (via POST /api/library/use-cases/[id]/refine)
//   - Footer: "Build me a full recommendation from my situation →" linking
//     to /app/recommendations/new?path=<painPath>&seed_use_case=<id> (the
//     existing 5-step intake, preserved as a secondary option).
//
// Guests: can view global-scope rows + stream the example output through the
// API (which currently requires actor — guests get a sign-in redirect on
// streaming). Server-rendered hero still works for guests.

import "server-only";
import * as React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isGuestRequest } from "@/lib/auth-guest";
import { getSessionActor } from "@/lib/auth-session";
import { GUEST_PLACEHOLDER_UUID } from "@/lib/guest-identity";
import { getUseCaseWithPrompt } from "@/lib/library";
import { UseCaseDetailClient } from "./UseCaseDetailClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ id: string }>;
};

export default async function UseCaseDetailPage({ params }: Props) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-[14px]" style={{ color: "var(--text)" }}>
          Use case not found.
        </p>
      </main>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const guest = !session?.user && (await isGuestRequest());
  if (!session?.user && !guest) redirect("/sign-in");

  const actor = session?.user ? await getSessionActor() : null;
  const userId = actor?.userId ?? GUEST_PLACEHOLDER_UUID;
  const tenantId = actor?.tenantId ?? GUEST_PLACEHOLDER_UUID;

  const loaded = await getUseCaseWithPrompt(userId, tenantId, id);
  if (!loaded) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-[14px]" style={{ color: "var(--text)" }}>
          Use case not found, or not visible to you.
        </p>
        <Link
          href="/app/library"
          className="mt-4 inline-block text-[13px] font-medium underline"
          style={{ color: "var(--ink)" }}
        >
          Back to library
        </Link>
      </main>
    );
  }

  const { useCase } = loaded;
  const isAuthed = !!session?.user;
  // 1-line description: first line of body (markdown allowed but stripped to plain).
  const description =
    useCase.body
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.length > 0) ?? "";

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {/* Hero */}
      <header className="mb-6">
        <Link
          href="/app/library"
          className="inline-block text-[12px] mb-3"
          style={{ color: "var(--mute)" }}
        >
          ← Library
        </Link>
        <h1
          className="text-h1 sm:text-h1-lg"
          style={{ color: "var(--ink)" }}
        >
          {useCase.title}
        </h1>
        {description && (
          <p
            className="mt-2 text-[15px] max-w-prose"
            style={{ color: "var(--text)" }}
          >
            {description}
          </p>
        )}
      </header>

      {/* Streamed example + chat refine (client) */}
      <UseCaseDetailClient
        useCaseId={useCase.id}
        cachedExample={useCase.exampleOutput}
        isAuthed={isAuthed}
      />

      {/* Footer — preserves the existing 5-step intake as a secondary option */}
      <footer className="mt-10 pt-6 border-t border-line">
        <Link
          href={`/app/recommendations/new?path=${useCase.painPath}&seed_use_case=${useCase.id}`}
          className="inline-flex items-center gap-1 text-[14px] font-medium"
          style={{ color: "var(--ink)" }}
        >
          Build me a full recommendation from my situation
          <span aria-hidden>→</span>
        </Link>
        <p
          className="mt-2 text-[12px] max-w-prose"
          style={{ color: "var(--mute)" }}
        >
          Walks you through 5 short questions and produces a personalised
          recommendation grounded in your situation.
        </p>
      </footer>
    </main>
  );
}
