"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Pill } from "@/components/ui/Pill";
import { formatHrs } from "@/lib/decision-display";

/**
 * SkillPanel — UI Guidelines v0.1 F3 right rail (desktop only, 360px).
 *
 * Reads `?skill=<decisionId>:<index>` from the current URL and renders the
 * matching skill summary from the server-passed `skills` list.
 *
 * Behavior:
 *   - No query param OR no matching skill → empty state ("Select a skill
 *     to view details").
 *   - Match → eyebrow ("AI SKILL"), title, description, hours-saved Pill
 *     (`ok` tone — the one place color carries meaning here), WHAT IT DOES
 *     step list (derived from description when no structured steps are
 *     available), WORKS WITH tag chips (placeholder until reducer schema
 *     grows), trust strip, footer with "See prompt" + "Install →".
 *   - `?panel=collapsed` collapses the panel to a 28px rail with an icon
 *     to re-expand. localStorage persistence is deferred (SSR mismatch
 *     risk on first paint; revisit when the theme work in C12 lands a
 *     stable client-only hydration pattern).
 *
 * Per UI Guidelines: ink-only (text-ink, text-mute, border-line, bg-paper).
 * Single Pill in `ok` tone for the hours-saved chip. No gradients, no
 * coral shadow.
 */

export interface SkillSummary {
  /** Decision ID. Together with `index` forms the URL key `decisionId:index`. */
  decisionId: string;
  /** Human title of the parent decision (for context in the panel). */
  decisionTitle: string;
  /** 0-based index into the decision's workloadReducers array. */
  index: number;
  title: string;
  description: string;
  estTimeSavingHrsPerWeek: number;
}

interface Props {
  skills: SkillSummary[];
}

export function SkillPanel({ skills }: Props) {
  const params = useSearchParams();
  const skillParam = params.get("skill");
  const panelMode = params.get("panel");
  const collapsed = panelMode === "collapsed";

  const active = React.useMemo(() => {
    if (!skillParam) return null;
    const [decisionId, idxRaw] = skillParam.split(":");
    if (!decisionId || idxRaw === undefined) return null;
    const idx = Number(idxRaw);
    if (!Number.isInteger(idx) || idx < 0) return null;
    return (
      skills.find((s) => s.decisionId === decisionId && s.index === idx) ?? null
    );
  }, [skillParam, skills]);

  if (collapsed) {
    return (
      <CollapsedRail />
    );
  }

  if (!active) {
    return (
      <aside
        aria-label="Skill detail"
        className="hidden lg:flex sticky top-0 h-screen w-[360px] shrink-0 flex-col border-l border-line bg-paper px-6 py-8"
      >
        <div className="flex flex-1 items-center justify-center">
          <p className="text-center text-[13px] leading-relaxed text-mute">
            Select a skill from a decision
            <br />
            to view its details here.
          </p>
        </div>
        <CollapseLink />
      </aside>
    );
  }

  // Derive a "what it does" step list from the reducer description by
  // splitting on sentence boundaries. Defensive: if we end up with fewer
  // than 2 sentences, fall back to a single-step list with the whole
  // description so the section still renders.
  const steps = stepsFromDescription(active.description);
  const worksWith = inferWorksWith(active.description);

  return (
    <aside
      aria-label={`Skill detail: ${active.title}`}
      className="hidden lg:flex sticky top-0 h-screen w-[360px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line bg-paper px-6 py-8"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-mute">
          AI Skill
        </p>
        <h2 className="mt-1 text-[20px] font-semibold leading-tight text-ink">
          {active.title}
        </h2>
        <p className="mt-1 text-[12px] text-mute">
          from {active.decisionTitle}
        </p>
      </div>

      {active.estTimeSavingHrsPerWeek > 0 && (
        <div>
          <Pill tone="ok">
            ↻ {formatHrs(active.estTimeSavingHrsPerWeek)}/wk back
          </Pill>
        </div>
      )}

      <p className="text-[13.5px] leading-relaxed text-ink">
        {active.description}
      </p>

      {steps.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-mute">
            What it does
          </p>
          <ol className="mt-2 space-y-1.5">
            {steps.map((step, i) => (
              <li
                key={i}
                className="flex gap-2 text-[13px] leading-relaxed text-ink"
              >
                <span className="shrink-0 font-semibold text-mute">
                  {i + 1}.
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {worksWith.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-mute">
            Works with
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {worksWith.map((tag) => (
              <li key={tag}>
                <Pill tone="mute">{tag}</Pill>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t border-line pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-mute">
          Trust
        </p>
        <ul className="mt-2 space-y-1 text-[12.5px] text-ink">
          <li>✓ Tested on real workloads</li>
          <li>✓ Local PHI · no third-party calls</li>
          <li>✓ Editable. Adapt to your team.</li>
        </ul>
      </section>

      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-4">
        <button
          type="button"
          className="text-[12.5px] font-semibold text-mute underline-offset-2 hover:text-ink hover:underline"
        >
          See prompt
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-[10px] border border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper shadow-card transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
        >
          Install →
        </button>
      </footer>

      <CollapseLink />
    </aside>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stepsFromDescription(desc: string): string[] {
  if (!desc) return [];
  // Naive sentence-split — good enough for the panel. Trims, filters out
  // empties, caps at 6 to avoid overwhelming the rail.
  const parts = desc
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 2) return parts;
  return parts.slice(0, 6);
}

function inferWorksWith(desc: string): string[] {
  // Heuristic: scan for common tool/platform names. This is a placeholder
  // until the reducer schema grows a structured `worksWith[]` field. Order
  // matches first-mention; case-insensitive; deduped.
  const KNOWN = [
    "Claude",
    "GPT",
    "ChatGPT",
    "Anthropic",
    "OpenAI",
    "Notion",
    "Slack",
    "Gmail",
    "Outlook",
    "Excel",
    "Sheets",
    "Word",
    "Docs",
    "Figma",
    "Linear",
    "Jira",
    "GitHub",
    "Zapier",
    "n8n",
    "Airtable",
  ];
  const lower = desc.toLowerCase();
  const seen = new Set<string>();
  for (const k of KNOWN) {
    if (lower.includes(k.toLowerCase())) seen.add(k);
  }
  return [...seen].slice(0, 6);
}

function CollapseLink() {
  return (
    <p className="mt-2 text-center text-[11.5px] text-mute">
      <a
        href="?panel=collapsed"
        className="underline-offset-2 hover:text-ink hover:underline"
      >
        Collapse panel →
      </a>
    </p>
  );
}

function CollapsedRail() {
  return (
    <aside
      aria-label="Skill panel (collapsed)"
      className="hidden lg:flex sticky top-0 h-screen w-7 shrink-0 flex-col items-center justify-start border-l border-line bg-paper py-6"
    >
      <a
        href="?panel="
        aria-label="Expand skill panel"
        title="Expand skill panel"
        className="inline-flex h-8 w-7 items-center justify-center text-mute hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </a>
    </aside>
  );
}
