"use client";

// Guest-mode recommendation preview.
//
// Guests can submit an intake form and run the engine, but nothing
// persists to the DB (see /api/decisions guest branch). The IntakeForm
// stashes the full engine output in sessionStorage and redirects here;
// this page reads it back and renders the same RecommendationView a
// persisted detail page would, plus a "Sign in to save this" CTA.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RecommendationView } from "@/components/recommendation/RecommendationView";

type GuestPayload = {
  templateId: string;
  fields: Record<string, unknown>;
  notes?: string | null;
  output: {
    recommendation: unknown;
    alternatives: unknown;
    robustAlternative?: unknown;
    methodTrace?: unknown;
    workloadReducers?: unknown;
    destinations?: unknown;
  };
  decidedAt: string;
};

// Shape of the `row` prop RecommendationView expects. We synthesize this
// from the guest output so we don't need a parallel render path.
function synthesizeRow(p: GuestPayload) {
  return {
    id: "guest",
    title:
      typeof (p.output.recommendation as { option?: string } | undefined)?.option ===
      "string"
        ? (p.output.recommendation as { option: string }).option
        : "(guest decision preview)",
    templateId: p.templateId,
    status: "complete" as const,
    createdAt: new Date(p.decidedAt),
    intake: p.fields,
    recommendation: p.output.recommendation,
    alternatives: p.output.alternatives,
    robustAlternative: p.output.robustAlternative ?? null,
    methodTrace: p.output.methodTrace ?? null,
    workloadReducers: p.output.workloadReducers ?? null,
    destinations: p.output.destinations ?? null,
  };
}

export default function GuestPreviewPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<GuestPayload | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("dd:guest:lastDecision");
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
        <h1 className="text-[22px] font-semibold text-ink">
          No preview to show
        </h1>
        <p className="mt-2 text-[14px] text-mute">
          Guest decisions are kept in this browser tab only. The last preview
          isn&rsquo;t here &mdash; start a new one or sign in to save your work.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/app"
            className="inline-flex items-center rounded-[10px] bg-ink px-4 py-2 text-[14px] font-semibold text-paper hover:bg-ink/90"
          >
            Start a decision
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center rounded-[10px] border border-line bg-paper px-4 py-2 text-[14px] font-semibold text-ink hover:border-ink"
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
        <p className="text-[14px] text-mute">Loading preview…</p>
      </main>
    );
  }

  // Synthesize a Decision-shaped row from the payload so we can reuse the
  // existing RecommendationView component without a parallel render path.
  // The type assertion is intentional — Decision's DB shape has fields we
  // don't have (createdAt as Date, etc.) but RecommendationView only reads
  // the recommendation / alternatives / methodTrace / workloadReducers
  // surface, all of which are present.
  const row = synthesizeRow(payload) as Parameters<
    typeof RecommendationView
  >[0]["row"];

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3 rounded-[10px] border border-line bg-paper px-4 py-3">
        <p className="text-[13px] text-text">
          <span className="font-semibold text-ink">Guest preview</span>{" "}
          <span className="text-mute">
            &mdash; this result isn&rsquo;t saved.
          </span>
        </p>
        <Link
          href="/sign-in"
          className="text-[13px] font-semibold text-ink underline-offset-2 hover:underline"
        >
          Sign in to save &rarr;
        </Link>
      </div>

      <RecommendationView row={row} />

      <div className="mt-8 flex gap-3 border-t border-line pt-6">
        <button
          type="button"
          onClick={() => router.push("/app")}
          className="inline-flex items-center rounded-[10px] border border-line bg-paper px-4 py-2 text-[14px] font-semibold text-ink hover:border-ink"
        >
          New decision
        </button>
      </div>
    </main>
  );
}
