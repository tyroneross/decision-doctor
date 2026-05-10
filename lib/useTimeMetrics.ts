/**
 * Time-metrics hooks for reactive computation of time-back across decisions.
 * Memoizes sums to avoid recalculation on every render.
 */

import { useMemo } from 'react';
import { totalHoursSaved } from '@/lib/decision-display';

interface ReducerLike {
  estTimeSavingHrsPerWeek?: number;
}

interface DecisionRow {
  workloadReducers?: unknown;
  hoursSaved?: number;
}

/**
 * Hook: compute total time saved across an array of decisions.
 * Safe against null/undefined reducers at the DB boundary.
 */
export function useTotalTimeBack(decisions: DecisionRow[] | null | undefined): number {
  return useMemo(() => {
    if (!Array.isArray(decisions)) return 0;
    return decisions.reduce<number>((sum, d) => {
      return sum + totalHoursSaved(d.workloadReducers);
    }, 0);
  }, [decisions]);
}

/**
 * Hook: derive a time-back metric suitable for display in a hero chip.
 * Returns { hours, display } where display is "X hrs/wk", "30 min/wk", or "—".
 */
export function useTimeBackDisplay(hours: number): { hours: number; display: string } {
  return useMemo(() => {
    const display =
      hours <= 0
        ? '—'
        : hours < 1
          ? `${Math.round(hours * 60)} min`
          : Math.abs(hours - Math.round(hours)) < 0.05
            ? `${Math.round(hours)} hr${Math.round(hours) === 1 ? '' : 's'}`
            : `${hours.toFixed(1)} hrs`;

    return { hours, display };
  }, [hours]);
}
