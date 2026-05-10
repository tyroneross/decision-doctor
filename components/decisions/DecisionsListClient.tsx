"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  categoryFor,
  confidenceBand,
  feasibilityFor,
  formatHrs,
  relativeDay,
  type DecisionCategory,
} from "@/lib/decision-display";
import type { AiFeasibility } from "@/shared/schema";

// Server-side projection of a decisions row that we serialize down here.
// Mirrors the columns selected in app/app/decisions/page.tsx — JSON cols
// stay typed unknown so the client guards each access.
export interface DecisionRow {
  id: string;
  title: string | null;
  templateId: string;
  status: string;
  createdAt: string; // ISO
  recommendationOption: string | null;
  recommendationConfidence: number | null;
  hoursSaved: number; // computed server-side via totalHoursSaved()
  reducerCount: number;
  // F-08: the top-ranked reducer's feasibility tier (or null for legacy rows).
  topReducerFeasibility?: AiFeasibility | null;
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
}

type FilterKey = "all" | DecisionCategory | "this-week" | "this-month";

const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

export function DecisionsListClient({ rows, summary }: Props) {
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
    <section className="space-y-6">
      {/* HERO LEDGER — time-back is the lead, decisions count is supporting */}
      <article
        data-component="LedgerHero"
        className="grad-coral relative overflow-hidden rounded-3xl p-6 text-white shadow-ledger sm:p-7"
      >
        <div
          aria-hidden
          className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white opacity-15 blur-2xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white opacity-10 blur-2xl"
        />
        <div className="relative grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end md:gap-6">
          <div className="md:col-span-7">
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] opacity-80 sm:text-[12px]">
              Your decisions · since you started
            </p>
            <p className="mt-2 text-[40px] font-semibold leading-[1] tracking-tight sm:text-[48px]">
              🕐 {formatHrs(summary.totalHoursPerWeek)}/wk back
            </p>
            <p className="mt-2 max-w-md text-[14.5px] opacity-90 sm:text-[15px]">
              {summary.skillsShipped} starter skill{summary.skillsShipped === 1 ? "" : "s"}
              {" "}shipped · {summary.decisions} decision{summary.decisions === 1 ? "" : "s"} made.
              Most recent first below.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 md:col-span-5">
            <Stat label="Decisions" value={String(summary.decisions)} />
            <Stat label="Skills shipped" value={String(summary.skillsShipped)} />
            <Stat
              label="Streak"
              value={
                summary.streakWeeks > 0
                  ? `${summary.streakWeeks} wk${summary.streakWeeks === 1 ? "" : "s"} 🔥`
                  : "—"
              }
            />
          </div>
        </div>
      </article>

      {/* FILTER CHIPS — Miller-friendly: ≤6 category + 2 time chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          variant="primary"
        >
          All · {counts.all}
        </FilterChip>
        {([
          ["capacity", "Capacity"],
          ["pricing", "Pricing"],
          ["admin", "Admin hire"],
        ] as const).map(([key, label]) => {
          const cat = categoryFor(
            key === "admin" ? "admin-hire" : key,
          );
          return (
            <FilterChip
              key={key}
              active={filter === key}
              onClick={() => setFilter(key)}
              dotColor={cat.hex}
              fg={cat.fg}
              bg={cat.bg}
              count={counts[key]}
            >
              {label}
            </FilterChip>
          );
        })}
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-rule sm:inline-block" />
        <FilterChip
          active={filter === "this-week"}
          onClick={() => setFilter("this-week")}
          variant="ghost"
        >
          This week · {counts["this-week"]}
        </FilterChip>
        <FilterChip
          active={filter === "this-month"}
          onClick={() => setFilter("this-month")}
          variant="ghost"
        >
          This month · {counts["this-month"]}
        </FilterChip>
      </div>

      {/* CARDS */}
      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rule bg-white p-8 text-center text-[14px] text-ink-500">
          No decisions match this filter yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => (
            <DecisionRowCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/15 p-3.5 backdrop-blur">
      <p className="text-[10.5px] uppercase tracking-wider opacity-80 sm:text-[11px]">
        {label}
      </p>
      <p className="mt-0.5 text-[20px] font-semibold leading-tight sm:text-[24px]">
        {value}
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  variant = "category",
  dotColor,
  fg,
  bg,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "category" | "ghost";
  dotColor?: string;
  fg?: string;
  bg?: string;
  count?: number;
}) {
  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={
          "ease-soft inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 " +
          (active
            ? "grad-coral text-white shadow-coral-press"
            : "border border-rule bg-white text-ink-700 hover:border-coral hover:text-coral")
        }
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
        className={
          "ease-soft inline-flex h-9 items-center rounded-full px-3 text-[13.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 " +
          (active
            ? "bg-cream-2 font-semibold text-ink-900"
            : "text-ink-700 hover:bg-cream-2")
        }
        aria-pressed={active}
      >
        {children}
      </button>
    );
  }
  // category
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "ease-soft inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 " +
        (bg ?? "") +
        " " +
        (fg ?? "") +
        " " +
        (active ? "border-current shadow-sm" : "border-rule")
      }
      aria-pressed={active}
    >
      {dotColor && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      <span>
        {children}
        {typeof count === "number" && ` · ${count}`}
      </span>
    </button>
  );
}

function DecisionRowCard({ row }: { row: DecisionRow }) {
  const cat = categoryFor(row.templateId);
  const band = confidenceBand(row.recommendationConfidence ?? 0);
  const title = row.title ?? row.recommendationOption ?? "Untitled decision";
  const reducerLabel =
    row.reducerCount > 0
      ? `${row.reducerCount} workload reducer${row.reducerCount === 1 ? "" : "s"}`
      : "Decision recorded";

  return (
    <li>
      <Link
        href={`/app/decisions/${row.id}`}
        className="ease-soft lift relative block overflow-hidden rounded-2xl border border-rule bg-white p-5 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
      >
        {/* Left edge color stripe — Common Region cue per category */}
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1.5 ${cat.stripe}`}
        />
        <div className="grid grid-cols-1 gap-3 pl-3 md:grid-cols-12 md:items-center md:gap-4">
          <div className="md:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold uppercase tracking-wider ${cat.bg} ${cat.fg}`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${cat.stripe}`}
                />
                {cat.label}
              </span>
              <span className="text-[12px] text-ink-500">
                {relativeDay(row.createdAt)}
              </span>
              {row.recommendationConfidence !== null && (
                <span
                  className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ${band.bg} ${band.fg}`}
                >
                  {band.icon} {band.label} · {row.recommendationConfidence}%
                </span>
              )}
              {/* F-08: feasibility chip on the top reducer (visible at list level). */}
              {row.topReducerFeasibility ? (
                (() => {
                  const f = feasibilityFor(row.topReducerFeasibility);
                  return (
                    <span
                      className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold uppercase tracking-wider ${f.bg} ${f.fg}`}
                      aria-label={`Top reducer feasibility: ${f.label}`}
                    >
                      <span aria-hidden>{f.icon}</span>
                      {f.label}
                    </span>
                  );
                })()
              ) : null}
            </div>
            <h3 className="mt-2 text-[17px] font-semibold leading-snug sm:text-[18.5px]">
              {title}
            </h3>
            <p className="mt-1 text-[13px] text-ink-500 sm:text-[13.5px]">
              {reducerLabel}
            </p>
          </div>
          <div className="md:col-span-3">
            <p className="text-[10.5px] uppercase tracking-wider text-ink-500 sm:text-[11px]">
              Saves you
            </p>
            <p className="grad-coral-text text-[20px] font-semibold leading-tight sm:text-[22px]">
              🕐 {formatHrs(row.hoursSaved)}/wk
            </p>
          </div>
          <div className="hidden items-center justify-end md:col-span-2 md:flex">
            <span
              aria-hidden
              className="grad-coral inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-white shadow-sm"
            >
              Open
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
