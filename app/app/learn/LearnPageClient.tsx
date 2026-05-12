"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, BookOpen, ArrowRight } from "lucide-react";
import type { KbArticleSummary } from "@/lib/kb";

export interface LearnPageClientProps {
  initialArticles: KbArticleSummary[];
}

/**
 * Index of KB articles. Cards mirror the visual rhythm of /app/library:
 * single border around the related group, dividers between items, no
 * per-card background pills, content-heavy. Calm Precision compliant —
 * status (reading minutes) is text color only.
 */
export function LearnPageClient({ initialArticles }: LearnPageClientProps) {
  if (initialArticles.length === 0) {
    return (
      <div className="rounded-lg border border-line p-8 text-center">
        <BookOpen size={24} className="mx-auto mb-3 text-mute" aria-hidden />
        <p className="text-[14px] text-mute">
          No knowledge-base articles yet. Run{" "}
          <code className="text-ink font-mono">pnpm kb:seed</code> to load the
          starter set.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {initialArticles.map((a) => (
        <li key={a.id} className="px-4 py-4 hover:bg-line/20 transition-colors">
          <Link
            href={`/app/learn/${a.slug}`}
            className="flex flex-col gap-2"
            aria-label={`Read article: ${a.title}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink leading-snug">
                {a.title}
              </h2>
              {a.reading_minutes ? (
                <span className="shrink-0 inline-flex items-center gap-1 text-[12px] text-mute">
                  <Clock size={12} aria-hidden />
                  {a.reading_minutes} min
                </span>
              ) : null}
            </div>
            {a.summary && (
              <p className="text-[13px] text-text leading-relaxed line-clamp-3">
                {a.summary}
              </p>
            )}
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ink">
              Read article
              <ArrowRight size={12} aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
