"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  categoryFor,
  confidenceBand,
  formatHrs,
  relativeDay,
  type DecisionCategory,
} from "@/lib/decision-display";

export interface DecisionRow {
  id: string;
  title: string | null;
  templateId: string;
  status: string;
  createdAt: string;
  recommendationOption: string | null;
  recommendationConfidence: number | null;
  hoursSaved: number;
  reducerCount: number;
}

export interface ListSummary {
  totalHoursPerWeek: number;
  decisions: number;
  skillsShipped: number;
  streakWeeks: number;
}

interface Props {
  rows: DecisionRow[];
  summary: ListSummary;
  isGuest?: boolean;
}

type FilterKey = "all" | DecisionCategory | "this-week" | "this-month";

const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

export function DecisionsListClient({ rows, summary, isGuest }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: rows.length,
      capacity: 0,
      pricing: 0,
      admin: 0,
      skill: 0,
      other: 0,
      "this-week": 0,
      "this-month": 0,
    };
    const now = Date.now();
    for (const r of rows) {
      const cat = categoryFor(r.templateId).id;
      c[cat]++;
      const age = now - new Date(r.createdAt).getTime();
      if (age <= DAYS_7) c["this-week"]++;
      if (age <= DAYS_30) c["this-month"]++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "this-week" || filter === "this-month") {
      const limit = filter === "this-week" ? DAYS_7 : DAYS_30;
      const now = Date.now();
      return rows.filter((r) => now - new Date(r.createdAt).getTime() <= limit);
    }
    return rows.filter((r) => categoryFor(r.templateId).id === filter);
  }, [rows, filter]);

  return (
    <section className="space-y-5">
      {/* GUEST MODE BANNER */}
      {isGuest && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
          <span className="font-medium">Preview Mode</span> — Viewing demo data.{" "}
          <a href="/sign-in" className="font-semibold underline hover:no-underline">
            Sign in
          </a>{" "}
          to use your own decisions.
        </div>
      )}

      {/* COMPACT HERO — focused on key metric */}
      <article className="grad-coral relative overflow-hidden rounded-2xl p-5 text-white">
        <div
          aria-hidden
          className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/20 blur-2xl"
        />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
              Time saved weekly
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {formatHrs(summary.totalHoursPerWeek)}/wk
            </p>
          </div>
          <div className="flex gap-2">
            <StatPill label="Decisions" value={summary.decisions} />
            <StatPill label="Skills" value={summary.skillsShipped} />
            {summary.streakWeeks > 0 && (
              <StatPill label="Streak" value={`${summary.streakWeeks}w`} icon="fire" />
            )}
          </div>
        </div>
      </article>

      {/* FILTER BAR — horizontal scroll on mobile */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-2 pb-2">
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            variant="primary"
          >
            All {counts.all}
          </FilterChip>
          {([
            ["capacity", "Capacity"],
            ["pricing", "Pricing"],
            ["admin", "Admin"],
          ] as const).map(([key, label]) => {
            const cat = categoryFor(key === "admin" ? "admin-hire" : key);
            return (
              <FilterChip
                key={key}
                active={filter === key}
                onClick={() => setFilter(key)}
                dotColor={cat.hex}
              >
                {label} {counts[key]}
              </FilterChip>
            );
          })}
          <span aria-hidden className="mx-1 h-4 w-px bg-ink-200" />
          <FilterChip
            active={filter === "this-week"}
            onClick={() => setFilter("this-week")}
            variant="ghost"
          >
            Week {counts["this-week"]}
          </FilterChip>
          <FilterChip
            active={filter === "this-month"}
            onClick={() => setFilter("this-month")}
            variant="ghost"
          >
            Month {counts["this-month"]}
          </FilterChip>
        </div>
      </div>

      {/* DECISION LIST */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule bg-cream-2/50 py-12 text-center">
          <p className="text-sm text-ink-500">No decisions match this filter.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => (
            <DecisionCard key={row.id} row={row} isGuest={isGuest} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function StatPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: "fire";
}) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">
      <span className="text-lg font-bold leading-none">
        {value}
        {icon === "fire" && " 🔥"}
      </span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide opacity-80">
        {label}
      </span>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  variant = "category",
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "category" | "ghost";
  dotColor?: string;
}) {
  const base =
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-coral";

  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} ${
          active
            ? "grad-coral text-white shadow-sm"
            : "border border-rule bg-white text-ink-700 hover:border-coral hover:text-coral"
        }`}
        aria-pressed={active}
      >
        {children}
      </button>
    );
  }

  if (variant === "ghost") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} ${
          active ? "bg-cream-2 text-ink-900" : "text-ink-500 hover:bg-cream-2 hover:text-ink-700"
        }`}
        aria-pressed={active}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} border ${
        active
          ? "border-ink-300 bg-white text-ink-900 shadow-sm"
          : "border-rule bg-white text-ink-600 hover:border-ink-300"
      }`}
      aria-pressed={active}
    >
      {dotColor && (
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {children}
    </button>
  );
}

function DecisionCard({ row, isGuest }: { row: DecisionRow; isGuest?: boolean }) {
  const cat = categoryFor(row.templateId);
  const band = confidenceBand(row.recommendationConfidence ?? 0);
  const title = row.title ?? row.recommendationOption ?? "Untitled";
  const hoursSaved = row.hoursSaved > 0 ? formatHrs(row.hoursSaved) : null;

  const href = isGuest ? "#" : `/app/decisions/${row.id}`;

  return (
    <li>
      <Link
        href={href}
        onClick={isGuest ? (e) => e.preventDefault() : undefined}
        className="group relative block rounded-xl border border-rule bg-white p-4 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-coral"
      >
        {/* Category stripe */}
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1 rounded-l-xl ${cat.stripe}`}
        />

        <div className="flex items-start gap-3 pl-2">
          {/* Main content */}
          <div className="min-w-0 flex-1">
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${cat.bg} ${cat.fg}`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${cat.stripe}`}
                />
                {cat.label}
              </span>
              <span className="text-[11px] text-ink-400">{relativeDay(row.createdAt)}</span>
              {row.recommendationConfidence !== null && row.recommendationConfidence > 0 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${band.bg} ${band.fg}`}
                >
                  {band.icon} {row.recommendationConfidence}%
                </span>
              )}
            </div>

            {/* Title — truncated to 2 lines */}
            <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug text-ink-900">
              {title}
            </h3>

            {/* Reducers count */}
            {row.reducerCount > 0 && (
              <p className="mt-1 text-xs text-ink-500">
                {row.reducerCount} workload reducer{row.reducerCount === 1 ? "" : "s"}
              </p>
            )}
          </div>

          {/* Time saved badge */}
          <div className="flex flex-col items-end gap-1 pt-0.5">
            {hoursSaved ? (
              <>
                <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                  Saves
                </span>
                <span className="grad-coral-text text-lg font-bold leading-none">
                  {hoursSaved}/wk
                </span>
              </>
            ) : (
              <span className="rounded-md bg-cream-2 px-2 py-1 text-[11px] font-medium text-ink-500">
                Pending
              </span>
            )}
          </div>

          {/* Arrow indicator */}
          <svg
            viewBox="0 0 24 24"
            className="mt-3 h-5 w-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-coral"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </Link>
    </li>
  );
}
