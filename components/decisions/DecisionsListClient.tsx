"use client";

// C8 — Decisions list D2: ink ledger hero + chip filters + ink rows.
//
// Hero ledger:
//   eyebrow "SINCE YOU STARTED" + huge "🕐 +N hrs/wk back" in text-ok
//   meta row "{count} decisions · {skillCount} skills · {streakDays}d streak"
//   on bg-paper card.
//
// Filter chips: All / Capacity / Pricing / Admin / Custom — neutral ink
//   Chip primitives, selected = ink fill.
//
// Decision rows: title + meta line + right-aligned green hours-saved pill
//   (green text only, no chip background).
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
  totalHoursPerWeek: number;
  decisions: number;
  skillsShipped: number;
  /** Plan calls for "streakDays" copy; existing ListSummary tracks weeks.
   *  We keep the existing field name and surface the unit ("wk") next to it
   *  so we don't have to rewire the server-side aggregation in C8. */
  streakWeeks: number;
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

  return (
    <section className="space-y-6">
      {/* HERO LEDGER — ink-only on bg-paper, hours-saved as the headline */}
      <article
        data-component="LedgerHero"
        className="rounded-2xl border border-line bg-paper p-6 sm:p-7"
      >
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-mute">
          SINCE YOU STARTED
        </p>
        <p className="mt-2 text-[32px] font-bold leading-tight tracking-tight text-ok sm:text-[36px]">
          🕐 +{formatHrs(summary.totalHoursPerWeek)} hrs/wk back
        </p>
        <p className="mt-2 text-[15px] text-mute">
          {summary.decisions} decision
          {summary.decisions === 1 ? "" : "s"} ·{" "}
          {summary.skillsShipped} skill
          {summary.skillsShipped === 1 ? "" : "s"} ·{" "}
          {summary.streakWeeks > 0
            ? `${summary.streakWeeks}wk streak`
            : "no streak yet"}
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
        // Single border around the whole list, dividers between rows
        // (Calm Precision / Gestalt Common Region).
        <ul
          className="overflow-hidden rounded-2xl border border-line bg-paper divide-y divide-line"
          aria-label="Decisions"
        >
          {filtered.map((row) => (
            <DecisionRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function DecisionRow({ row }: { row: DecisionRow }) {
  const cat = categoryFor(row.templateId);
  const title = row.title ?? row.recommendationOption ?? "Untitled decision";
  const reducerLabel =
    row.reducerCount > 0
      ? `${row.reducerCount} reducer${row.reducerCount === 1 ? "" : "s"}`
      : "Recorded";
  const confLabel = confidenceLabel(row.recommendationConfidence);

  return (
    <li>
      <Link
        href={`/app/history/${row.id}`}
        className="flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-line/30 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ink/20"
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-snug text-text">
            {title}
          </h3>
          <p className="mt-0.5 text-[12px] font-medium text-mute">
            {cat.label} ·{" "}
            {typeof row.recommendationConfidence === "number"
              ? `${row.recommendationConfidence}% (${confLabel})`
              : confLabel}{" "}
            · {reducerLabel} · {relativeDay(row.createdAt)}
          </p>
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
