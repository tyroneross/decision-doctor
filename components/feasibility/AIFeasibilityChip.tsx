'use client';

import { AIFeasibilityScore } from '@/lib/ai-feasibility';

interface AIFeasibilityChipProps {
  score: AIFeasibilityScore;
  compact?: boolean;
}

/**
 * AIFeasibilityChip: Visual indicator for the 4-tier AI feasibility ranking.
 * Shows tier, icon, and optional confidence percentage.
 *
 * Per Calm Precision: status colors only (no arbitrary backgrounds).
 * Per PRD F-08: skill > plugin > agent > human.
 */
export function AIFeasibilityChip({ score, compact = false }: AIFeasibilityChipProps) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    skill: { bg: 'bg-teal-100', text: 'text-teal-700' },
    plugin: { bg: 'bg-blue-100', text: 'text-blue-700' },
    agent: { bg: 'bg-purple-100', text: 'text-purple-700' },
    human: { bg: 'bg-gray-100', text: 'text-gray-700' },
  };

  const colors = colorMap[score.tier] || colorMap.human;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${colors.bg} ${colors.text}`}
        title={score.description}
      >
        <span aria-hidden>{score.icon}</span>
        <span>{score.label}</span>
      </span>
    );
  }

  return (
    <div className={`rounded-lg ${colors.bg} px-3 py-2.5 text-sm`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">
            {score.icon}
          </span>
          <div>
            <p className={`font-semibold ${colors.text}`}>{score.label}</p>
            <p className="mt-0.5 text-xs text-ink-600">{score.description}</p>
          </div>
        </div>
        {score.confidence > 0 && (
          <span className={`text-xs font-medium ${colors.text}`}>
            {score.confidence}%
          </span>
        )}
      </div>
    </div>
  );
}
