'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';

interface Choice {
  id: string;
  label: string;
  description?: string;
}

interface AhpPairwiseProps {
  choices: Choice[];
  onComplete: (weights: Record<string, number>) => void;
  title?: string;
  description?: string;
}

const SCALE: Array<{ value: number; label: string; description: string }> = [
  { value: 1, label: 'Equal', description: 'Same importance' },
  { value: 3, label: 'Moderate', description: 'Slightly more important' },
  { value: 5, label: 'Strong', description: 'Clearly more important' },
  { value: 7, label: 'Very strong', description: 'Much more important' },
  { value: 9, label: 'Extreme', description: 'Overwhelmingly important' },
];

/**
 * AhpPairwise: Mobile-friendly Analytic Hierarchy Process (AHP) interface.
 * User compares choices pairwise and weights emerge automatically.
 *
 * Per Calm Precision: progressive disclosure, ≤5 choices, clear comparisons.
 * Returns normalized weights (sum = 1.0).
 */
export function AhpPairwise({
  choices,
  onComplete,
  title = 'Set your priorities',
  description = 'Compare each pair and we&apos;ll calculate weights.',
}: AhpPairwiseProps) {
  // Generate all pairs: (A,B), (A,C), (B,C), etc.
  const pairs = useMemo(() => {
    const result: Array<[number, number]> = [];
    for (let i = 0; i < choices.length; i++) {
      for (let j = i + 1; j < choices.length; j++) {
        result.push([i, j]);
      }
    }
    return result;
  }, [choices]);

  // Comparison matrix: comparison[i][j] = score (1–9 or 1/9 for inverse)
  const [comparisons, setComparisons] = useState<Record<string, number>>({});

  // Progress: how many pairs have been compared
  const completed = Object.keys(comparisons).length;
  const total = pairs.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  // Current pair index
  const [pairIndex, setPairIndex] = useState(0);

  const currentPair = pairs[pairIndex];
  const [choiceA, choiceB] = currentPair
    ? [choices[currentPair[0]], choices[currentPair[1]]]
    : [undefined, undefined];

  const pairKey = currentPair
    ? `${currentPair[0]}-${currentPair[1]}`
    : '';
  const currentScore = pairKey ? comparisons[pairKey] : undefined;

  // Handle scale selection
  const handleScore = (value: number) => {
    if (!pairKey) return;

    const newComparisons = { ...comparisons, [pairKey]: value };
    setComparisons(newComparisons);

    // Auto-advance to next pair
    if (pairIndex < pairs.length - 1) {
      setPairIndex(pairIndex + 1);
    }
  };

  // Compute normalized weights from comparison matrix
  const weights = useMemo(() => {
    if (choices.length === 0 || completed === 0) {
      // Default: equal weight
      const eq = 1 / choices.length;
      return Object.fromEntries(choices.map((c) => [c.id, eq]));
    }

    // Build symmetric matrix
    const matrix: number[][] = Array(choices.length)
      .fill(null)
      .map(() => Array(choices.length).fill(1));

    for (const [pairKeyStr, score] of Object.entries(comparisons)) {
      const [iStr, jStr] = pairKeyStr.split('-');
      const i = parseInt(iStr, 10);
      const j = parseInt(jStr, 10);
      if (!Number.isNaN(i) && !Number.isNaN(j)) {
        matrix[i][j] = score;
        matrix[j][i] = 1 / score;
      }
    }

    // Sum each column
    const colSums = Array(choices.length).fill(0);
    for (let i = 0; i < choices.length; i++) {
      for (let j = 0; j < choices.length; j++) {
        colSums[j] += matrix[i][j];
      }
    }

    // Normalize
    const normalized: number[][] = Array(choices.length)
      .fill(null)
      .map(() => Array(choices.length).fill(0));
    for (let i = 0; i < choices.length; i++) {
      for (let j = 0; j < choices.length; j++) {
        normalized[i][j] = colSums[j] > 0 ? matrix[i][j] / colSums[j] : 0;
      }
    }

    // Average each row → priority vector
    const priorities = normalized.map((row) => row.reduce((a, b) => a + b) / choices.length);

    // Normalize to sum = 1
    const sum = priorities.reduce((a, b) => a + b, 0);
    const final = priorities.map((p) => (sum > 0 ? p / sum : 1 / choices.length));

    return Object.fromEntries(choices.map((c, i) => [c.id, final[i]]));
  }, [choices, comparisons, completed]);

  // Reset
  const handleReset = () => {
    setComparisons({});
    setPairIndex(0);
  };

  // Finish
  const handleFinish = () => {
    onComplete(weights);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-600">{description}</p>}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-ink-600">
          <span>Progress</span>
          <span>{completed} of {total} comparisons</span>
        </div>
        <div className="h-2 rounded-full bg-cream-2">
          <div
            className="ease-soft h-2 rounded-full grad-coral transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Comparison interface */}
      {choiceA && choiceB ? (
        <div className="space-y-4 rounded-lg border border-rule bg-cream-2/40 p-4">
          <p className="text-center text-sm font-medium text-ink-700">
            Which is more important?
          </p>

          {/* Choice labels */}
          <div className="grid gap-2">
            <div className="rounded-lg bg-white p-3 text-center">
              <p className="font-semibold text-ink-900">{choiceA.label}</p>
              {choiceA.description && (
                <p className="mt-1 text-xs text-ink-600">{choiceA.description}</p>
              )}
            </div>
            <div className="text-center text-sm text-ink-500">vs</div>
            <div className="rounded-lg bg-white p-3 text-center">
              <p className="font-semibold text-ink-900">{choiceB.label}</p>
              {choiceB.description && (
                <p className="mt-1 text-xs text-ink-600">{choiceB.description}</p>
              )}
            </div>
          </div>

          {/* Scale buttons */}
          <div className="space-y-2">
            <button
              onClick={() => handleScore(1 / 9)}
              className={`ease-soft w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentScore === 1 / 9
                  ? 'bg-coral text-white'
                  : 'bg-white text-ink-700 hover:bg-cream-2'
              }`}
            >
              {choiceB.label} much stronger
            </button>

            {SCALE.slice().reverse().map((s) => (
              <button
                key={s.value}
                onClick={() => handleScore(s.value)}
                className={`ease-soft w-full px-3 py-2 rounded-lg text-left transition-colors ${
                  currentScore === s.value
                    ? 'bg-coral text-white'
                    : 'bg-white text-ink-700 hover:bg-cream-2'
                }`}
              >
                <span className="font-medium">{choiceA.label}</span>
                <span className="text-xs opacity-75 ml-1">({s.label})</span>
              </button>
            ))}

            <button
              onClick={() => handleScore(1 / 9)}
              className={`ease-soft w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentScore === 1 / 9
                  ? 'bg-coral text-white'
                  : 'bg-white text-ink-700 hover:bg-cream-2'
              }`}
            >
              {choiceB.label} much stronger
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-cream-2 p-4 text-center text-sm text-ink-600">
          Loading comparison interface...
        </div>
      )}

      {/* Weights preview (when > 50% complete) */}
      {completed >= total * 0.5 && (
        <div className="space-y-3 rounded-lg border border-rule bg-cream p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-600">
            Current weights
          </p>
          <div className="space-y-2">
            {choices.map((c) => (
              <div key={c.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-900">{c.label}</span>
                  <span className="text-sm font-semibold text-coral">
                    {((weights[c.id] ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-cream-2">
                  <div
                    className="ease-soft h-1.5 rounded-full bg-coral transition-all"
                    style={{ width: `${(weights[c.id] ?? 0) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {completed > 0 && (
          <button
            onClick={handleReset}
            className="ease-soft inline-flex items-center justify-center gap-1.5 rounded-lg border border-rule px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-cream-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        )}
        {completed === total && (
          <button
            onClick={handleFinish}
            className="ease-soft flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg grad-skill px-4 py-2.5 text-sm font-medium text-white hover:shadow-md"
          >
            <span>Done</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
