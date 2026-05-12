"use client";

// C8 — Decisions list D2: ink ledger hero + chip filters + ink rows.
//
// Hero ledger:
//   eyebrow "SINCE YOU STARTED"
//   meta row "{count} decisions · {skillCount} skills"
//   on bg-paper card.
//
// Filter chips: All / Capacity / Pricing / Admin / Custom — neutral ink
//   Chip primitives, selected = ink fill.
//
// Decision rows: benefit-led headline + meta line + "Recommended tools:" chips
//   + right-aligned green hours-saved text.
//
// Empty state: ink-only card pointing to /app.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  categoryFor,
  formatHrs,
  relativeDay,
  type DecisionCategory,
} from "@/lib/decision-display";
import type { AiFeasibility } from "@/shared/schema";
import { Chip } from "@/components/ui/Chip";
import {
  splitTaskHeadline,
  deriveWorkflowHeadline,
  deriveUseCaseGroup,
  type UseCaseGroup,
} from "@/lib/recommendations/split-headline";

// Server-side projection of a decisions row.
export interface DecisionRow {
  id: string;
  title: string | null;
  templateId: string;
  status: string;
  createdAt: string; // ISO
  recommendationOption: string | null;
  recommendationConfidence: number | null;
  hoursSaved: number;
  reducerCount: number;
  topReducerFeasibility?: AiFeasibility | null;
}

export interface ListSummary {
  decisions: number;
  skillsShipped: number;
}

interface Props {
  rows: DecisionRow[];
  summary: ListSummary;
}

// FilterKey reduced to the 5 buckets the spec calls for. "custom" merges
// the legacy "skill" + "other" categories — anything not in the 3 named
// templates lands here.
type FilterKey = "all" | "capacity" | "pricing" | "admin" | "custom";

function rowCategory(templateId: string): FilterKey {
  const id = categoryFor(templateId).id as DecisionCategory;
  if (id === "capacity" || id === "pricing" || id === "admin") return id;
  return "custom";
}

function confidenceLabel(conf: number | null | undefined): string {
  if (typeof conf !== "number") return "values-dominant";
  if (conf >= 75) return "strong call";
  if (conf >= 55) return "leans this way";
  return "could flip";
}

export function DecisionsListClient({ rows, summary }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: rows.length,
      capacity: 0,
      pricing: 0,
      admin: 0,
      custom: 0,
    };
    for (const r of rows) {
      c[rowCategory(r.templateId)]++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => rowCategory(r.templateId) === filter);
  }, [rows, filter]);

  // Group filtered rows by use-case (derived from the stack of tools) so the
  // 27-row flat list collapses into a few scannable categories. Order is
  // by descending group size, with "Other workflows" pinned last.
  const groupedRows = useMemo(() => {
    const byGroup = new Map<string, { group: UseCaseGroup; rows: DecisionRow[] }>();
    for (const r of filtered) {
      const stack = splitTaskHeadline(r.recommendationOption ?? "").stack;
      const g = deriveUseCaseGroup(stack);
      const bucket = byGroup.get(g.id);
      if (bucket) bucket.rows.push(r);
      else byGroup.set(g.id, { group: g, rows: [r] });
    }
    const sorted = Array.from(byGroup.values()).sort((a, b) => {
      // Pin "other" last; otherwise sort by group size desc, then label asc.
      if (a.group.id === "other") return 1;
      if (b.group.id === "other") return -1;
      if (a.rows.length !== b.rows.length) return b.rows.length - a.rows.length;
      return a.group.label.localeCompare(b.group.label);
    });
    return sorted;
  }, [filtered]);

  return (
    <section className="space-y-6">
      {/* HERO LEDGER — ink-only on bg-paper, real counts only */}
      <article
        data-component="LedgerHero"
        className="rounded-2xl border border-line bg-paper p-6 sm:p-7"
      >
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-mute">
          SINCE YOU STARTED
        </p>
        <p className="mt-2 text-[15px] text-mute">
          {summary.decisions} decision
          {summary.decisions === 1 ? "" : "s"} ·{" "}
          {summary.skillsShipped} skill
          {summary.skillsShipped === 1 ? "" : "s"}
        </p>
      </article>

      {/* FILTER CHIPS — All / Capacity / Pricing / Admin / Custom. Neutral
          ink Chip primitives. Selected = ink fill. */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", `All · ${counts.all}`],
            ["capacity", `Capacity · ${counts.capacity}`],
            ["pricing", `Pricing · ${counts.pricing}`],
            ["admin", `Admin · ${counts.admin}`],
            ["custom", `Custom · ${counts.custom}`],
          ] as const
        ).map(([key, label]) => (
          <Chip
            key={key}
            tone={filter === key ? "selected" : "default"}
            pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </Chip>
        ))}
      </div>

      {/* ROWS or EMPTY STATE */}
      {filtered.length === 0 ? (
        <article className="rounded-2xl border border-line bg-paper p-8 text-center">
          <p className="text-[15px] text-text">
            No decisions {filter === "all" ? "yet" : "in this filter"}.
          </p>
          <p className="mt-2 text-[13.5px] text-mute">
            Ready when you are. Tell me what's eating your week.
          </p>
          <Link
            href="/app"
            className="mt-4 inline-flex h-9 items-center rounded-[10px] border border-ink bg-ink px-4 text-[14px] font-semibold text-paper transition-colors duration-150 hover:bg-ink/90 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          >
            Start a decision →
          </Link>
        </article>
      ) : (
        // Grouped by use-case. Each group is collapsible (open by default
        // when ≤ 3 rows; closed when larger to cut noise). Single border
        // per group; dividers between rows within (Gestalt Common Region).
        <div className="space-y-4" aria-label="Decisions, grouped by use case">
          {groupedRows.map(({ group, rows: groupRows }) => (
            <details
              key={group.id}
              open={groupRows.length <= 3}
              className="group overflow-hidden rounded-2xl border border-line bg-paper"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 list-none [&::-webkit-details-marker]:hidden hover:bg-line/20">
                <div className="flex items-center gap-2 min-w-0">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 shrink-0 text-mute transition-transform group-open:rotate-90"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <h3 className="truncate text-[14px] font-semibold text-ink">
                    {group.label}
                  </h3>
                  <span className="shrink-0 text-[12px] text-mute">
                    · {groupRows.length} option
                    {groupRows.length === 1 ? "" : "s"}
                  </span>
                </div>
              </summary>
              <ul className="border-t border-line divide-y divide-line">
                {groupRows.map((row) => (
                  <DecisionRow key={row.id} row={row} />
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function DecisionRow({ row }: { row: DecisionRow }) {
  const cat = categoryFor(row.templateId);
  const headline = deriveWorkflowHeadline({
    title: row.title,
    templateId: row.templateId,
    recommendationOption: row.recommendationOption,
  });
  const reducerLabel =
    row.reducerCount > 0
      ? `${row.reducerCount} reducer${row.reducerCount === 1 ? "" : "s"}`
      : "Recorded";
  const confLabel = confidenceLabel(row.recommendationConfidence);

  return (
    <li>
      <Link
        href={`/app/history/${row.id}`}
        className="flex items-start gap-4 px-5 py-4 transition-colors duration-150 hover:bg-line/30 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ink/20"
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-snug text-text">
            {headline}
          </h3>
          <p className="mt-0.5 text-[12px] font-medium text-mute">
            {cat.label} ·{" "}
            {typeof row.recommendationConfidence === "number"
              ? `${row.recommendationConfidence}% (${confLabel})`
              : confLabel}{" "}
            · {reducerLabel} · {relativeDay(row.createdAt)}
          </p>
          {/* Stack chips removed — the row title now IS the stack
              signature, and the group header carries the use case. The
              "Recommended tools:" strip was redundant. */}
        </div>
        {row.hoursSaved > 0 && (
          <span
            className="shrink-0 text-[14px] font-semibold text-ok tabular-nums"
            aria-label={`Saves ${formatHrs(row.hoursSaved)} hours per week`}
          >
            +{formatHrs(row.hoursSaved)}/wk
          </span>
        )}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-mute"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Link>
    </li>
  );
}
