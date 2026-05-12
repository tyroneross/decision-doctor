"use client";

// app/app/recommendations/guest-preview/page.tsx
//
// Guest one-shot recommendation preview.
// Mirrors the V1 pattern in app/app/decisions/guest-preview/page.tsx exactly.
//
// The /new flow sets sessionStorage["dd:guest:lastRecommendation"] and
// redirects here. This page reads it back and renders the same
// RecommendationView a persisted detail page would, plus a sign-in CTA.
//
// No auth required. If nothing is in sessionStorage → redirect to /new.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AiTaskRecommendation } from "@/lib/engine/types";
import { RecommendationView } from "@/components/recommendations/RecommendationView";

type GuestPayload = {
  recommendation: AiTaskRecommendation;
  painPath: string;
};

export default function GuestRecommendationPreviewPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<GuestPayload | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(
        "dd:guest:lastRecommendation"
      );
      if (!raw) {
        setNotFound(true);
        return;
      }
      setPayload(JSON.parse(raw) as GuestPayload);
    } catch {
      setNotFound(true);
    }
  }, []);

  if (notFound) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1
          className="text-h1 sm:text-h1-lg"
          style={{ color: "var(--ink)" }}
        >
          No preview to show
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: "var(--mute)" }}>
          Guest recommendations are kept in this browser tab only. The last
          preview isn&rsquo;t here. Start a new one, or sign in to save your
          work.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/app/recommendations/new"
            className="inline-flex items-center rounded-[10px] px-4 py-2 text-[14px] font-semibold"
            style={{
              backgroundColor: "var(--ink)",
              color: "var(--paper)",
            }}
          >
            Start a recommendation
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center rounded-[10px] border px-4 py-2 text-[14px] font-semibold"
            style={{
              borderColor: "var(--ink)",
              color: "var(--ink)",
            }}
          >
            Sign in to save
          </Link>
        </div>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12">
        <p className="text-[14px]" style={{ color: "var(--mute)" }}>
          Loading preview...
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      {/* Guest banner */}
      <div
        className="mb-6 flex items-center justify-between gap-3 rounded-[10px] border px-4 py-3"
        style={{
          borderColor: "var(--line)",
          backgroundColor: "var(--paper)",
        }}
      >
        <p className="text-[13px]" style={{ color: "var(--mute)" }}>
          <span className="font-semibold" style={{ color: "var(--ink)" }}>
            Guest preview
          </span>{" "}
          &mdash; this result isn&rsquo;t saved. Sign in to save this
          recommendation, track progress, and promote it to a skill or plugin.
        </p>
        <Link
          href="/sign-in"
          className="shrink-0 text-[13px] font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--ink)" }}
        >
          Sign in to save &rarr;
        </Link>
      </div>

      <RecommendationView
        recommendation={payload.recommendation}
        mode="guest"
        recommendationId="guest"
      />

      {/* Footer actions */}
      <div
        className="mt-8 flex gap-3 border-t pt-6"
        style={{ borderColor: "var(--line)" }}
      >
        <button
          type="button"
          onClick={() => router.push("/app/recommendations/new")}
          className="inline-flex items-center rounded-[10px] border px-4 py-2 text-[14px] font-semibold"
          style={{
            borderColor: "var(--ink)",
            color: "var(--ink)",
            backgroundColor: "var(--paper)",
          }}
        >
          New recommendation
        </button>
      </div>
    </main>
  );
}
