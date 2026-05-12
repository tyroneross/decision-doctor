// app/app/recommendations/[id]/page.tsx
//
// SSR detail page for a persisted AiTaskRecommendation.
// Auth-gated. Fetches the recommendation via direct DB call (runWithActor)
// or falls back to a graceful 404 if E3's route/table hasn't shipped yet.
//
// Mounts <RecommendationView> from components/recommendations/ (distinct from
// the V1 RecommendationView in components/recommendation/ which renders Decision rows).

import { notFound } from "next/navigation";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSessionActor } from "@/lib/auth-session";
import type { AiTaskRecommendation } from "@/lib/engine/types";
import { RecommendationView } from "@/components/recommendations/RecommendationView";

type Props = { params: Promise<{ id: string }> };

export default async function RecommendationDetailPage({ params }: Props) {
  const { id } = await params;
  const h = await headers();

  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) redirect("/sign-in");

  const actor = await getSessionActor();
  if (!actor) redirect("/sign-in");

  // Fetch the recommendation — gracefully degrade if E3 table not yet deployed.
  let recommendation: AiTaskRecommendation | null = null;
  let fetchError: string | null = null;

  try {
    // Try the API route first (E3). Falls back to inline 404 on 404/503.
    const host = h.get("host");
    const forwardedProto = h.get("x-forwarded-proto") ?? "https";
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ??
      (host ? `${forwardedProto}://${host}` : "http://localhost:3000");
    const apiUrl = `${origin}/api/recommendations/${id}`;
    const res = await fetch(apiUrl, {
      headers: {
        // Forward session cookie. In SSR, headers() carries the incoming cookies.
        cookie: h.get("cookie") ?? "",
      },
      cache: "no-store",
    });

    if (res.status === 404) {
      notFound();
    } else if (res.status === 401 || res.status === 403) {
      redirect("/sign-in");
    } else if (!res.ok) {
      fetchError = `Engine route returned ${res.status}. E3 may still be in flight.`;
    } else {
      const data = await res.json() as { recommendation: AiTaskRecommendation };
      recommendation = data.recommendation;
    }
  } catch {
    fetchError = "The recommendation engine route isn't deployed yet.";
  }

  // Engine not deployed or error state — render graceful placeholder.
  if (fetchError || !recommendation) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <nav
          className="mb-6 flex items-center gap-1.5 text-[13px]"
          aria-label="breadcrumb"
          style={{ color: "var(--mute)" }}
        >
          <Link
            href="/app"
            className="hover:underline"
            style={{ color: "var(--ink)" }}
          >
            Home
          </Link>
          <span aria-hidden>·</span>
          <span>Recommendation</span>
        </nav>
        <h1
          className="text-[22px] font-semibold"
          style={{ color: "var(--ink)" }}
        >
          Recommendation not available
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: "var(--mute)" }}>
          {fetchError ?? "This recommendation could not be loaded."}
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--mute)" }}>
          TODO: Iteration E3 — /api/recommendations/[id] route not yet deployed.
          Once E3 ships, this page will fetch and render the full recommendation.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/app/recommendations/new"
            className="inline-flex items-center rounded-[10px] px-4 py-[9px] text-[14px] font-semibold"
            style={{
              backgroundColor: "var(--ink)",
              color: "var(--paper)",
            }}
          >
            New recommendation
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center rounded-[10px] border px-4 py-[9px] text-[14px] font-semibold"
            style={{
              borderColor: "var(--ink)",
              color: "var(--ink)",
            }}
          >
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <nav
        className="mb-6 flex items-center gap-1.5 text-[13px]"
        aria-label="breadcrumb"
        style={{ color: "var(--mute)" }}
      >
        <Link
          href="/app"
          className="hover:underline"
          style={{ color: "var(--ink)" }}
        >
          Home
        </Link>
        <span aria-hidden>·</span>
        <span>Recommendation</span>
      </nav>

      <RecommendationView
        recommendation={recommendation}
        mode="authed"
        recommendationId={id}
      />
    </main>
  );
}
