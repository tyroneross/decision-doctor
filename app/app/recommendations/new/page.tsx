// app/app/recommendations/new/page.tsx
//
// SSR shell for the pain intake → recommendation flow.
//
// Query params:
//   ?path=<PainPathId>    — pre-select a pain path (from pain card click)
//   ?challenge=<text>     — pre-fill challenge text (from home composer)
//
// Both params are optional. If both are null the page renders a
// "back to home" nudge (no dead-end).
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

  // Edge case: no params at all — render a gentle nudge back to home.
  if (!path && !challenge) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1
          className="text-[24px] font-bold"
          style={{ color: "var(--ink)" }}
        >
          Start a recommendation
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: "var(--mute)" }}>
          Pick a pain path or describe your challenge to get a personalised AI
          task recommendation.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/app"
            className="inline-flex items-center rounded-[10px] px-4 py-[9px] text-[14px] font-semibold"
            style={{
              backgroundColor: "var(--ink)",
              color: "var(--paper)",
            }}
          >
            Back to home
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
