// app/app/recommendations/new/page.tsx
//
// SSR shell for the pain intake → recommendation flow.
//
// Query params:
//   ?path=<PainPathId>    — pre-select a pain path (from pain card click)
//   ?challenge=<text>     — pre-fill challenge text (from home composer)
//
// Both params are optional. If both are null the page renders a picker inline.
// If path exists without challenge, the client renders a path-specific advice
// kickoff before adaptive intake so the card selection is not treated as blank.
//
// Auth: guests are allowed — the submit flow routes through the guest
// branch (POST /api/recommendations returns guestMode:true → client
// stashes in sessionStorage → redirects to /app/recommendations/guest-preview).

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isGuestRequest } from "@/lib/auth-guest";
import { getSessionActor } from "@/lib/auth-session";
import type { PainPathId } from "@/lib/engine/types";
import { PainCardGrid } from "@/components/pain-cards/PainCardGrid";
import { NewRecommendationClient } from "./NewRecommendationClient";

const VALID_PAIN_PATHS: Set<string> = new Set([
  "referrals",
  "research",
  "admin",
  "capacity_growth",
  "follow_up",
  "custom",
]);

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewRecommendationPage({ searchParams }: Props) {
  const params = await searchParams;
  const h = await headers();

  const session = await auth.api.getSession({ headers: h });
  const guest = !session?.user && (await isGuestRequest());

  // If completely unauthenticated (not even guest mode) → sign-in.
  if (!session?.user && !guest) redirect("/sign-in");

  // Resolve actor for authenticated users (null for guests).
  let actor = null;
  if (session?.user) {
    try {
      actor = await getSessionActor();
    } catch {
      // Silent degrade — client handles the guest path.
    }
  }

  // Parse query params.
  const rawPath = typeof params.path === "string" ? params.path : null;
  const path: PainPathId | null =
    rawPath && VALID_PAIN_PATHS.has(rawPath)
      ? (rawPath as PainPathId)
      : null;

  const challenge: string | null =
    typeof params.challenge === "string" && params.challenge.trim()
      ? decodeURIComponent(params.challenge.trim()).slice(0, 800)
      : null;

  // Edge case: no params at all — render the pain card grid inline so the
  // user can pick a path without bouncing back to /app. PainCardGrid clicks
  // navigate to /app/recommendations/new?path=<pathId>, returning here with
  // the path arg populated and routing into the intake flow below.
  if (!path && !challenge) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <header className="mb-6 space-y-1">
          <h1
            className="text-h1 sm:text-h1-lg"
            style={{ color: "var(--ink)" }}
          >
            Start a recommendation
          </h1>
          <p className="text-[14px]" style={{ color: "var(--mute)" }}>
            Pick the area that fits best, or describe your own challenge.
          </p>
        </header>

        <PainCardGrid />

        <div className="mt-8">
          <Link
            href="/app"
            className="inline-flex items-center text-[13px] font-medium"
            style={{ color: "var(--mute)" }}
          >
            ← Back to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <NewRecommendationClient
        initialPath={path}
        initialChallenge={challenge}
        actor={actor}
      />
    </main>
  );
}
