/**
 * AI Feasibility scoring & ranking for workload reducers.
 * Per PRD F-08: 4-tier system (skill / plugin / agent / human).
 * 
 * Each workload reducer gets a feasibility tier based on:
 * - Type indicator (prompt, playbook, skill, etc.)
 * - Complexity signals in title/description
 * - Existing artifact readiness
 */

export type AIFeasibilityTier = 'skill' | 'plugin' | 'agent' | 'human';

export interface AIFeasibilityScore {
  tier: AIFeasibilityTier;
  label: string;
  description: string;
  icon: string;
  bgColor: string;
  textColor: string;
  /** 0–100 confidence that this tier is correct */
  confidence: number;
}

interface ReducerLike {
  type?: 'prompt' | 'playbook' | 'skill';
  title?: string;
  description?: string;
  artifact?: {
    promptText?: string;
    playbookSteps?: string[];
    skillName?: string;
  };
}

const FEASIBILITY_TIERS: Record<AIFeasibilityTier, Omit<AIFeasibilityScore, 'confidence'>> = {
  skill: {
    tier: 'skill',
    label: 'Skill ready',
    description: 'Ready to ship as a reusable Claude skill',
    icon: '⚡',
    bgColor: 'bg-teal-100',
    textColor: 'text-teal-700',
  },
  plugin: {
    tier: 'plugin',
    label: 'Plugin ready',
    description: 'Can be deployed as a plugin or integration',
    icon: '🔌',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
  },
  agent: {
    tier: 'agent',
    label: 'Agentic ready',
    description: 'Best suited for agentic workflow with tools',
    icon: '🤖',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
  },
  human: {
    tier: 'human',
    label: 'Human-led',
    description: 'Requires human oversight and judgment',
    icon: '👤',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
  },
};

/**
 * Score a workload reducer for AI feasibility.
 * Returns a tier ranking from highest (skill) to lowest (human).
 */
export function scoreAIFeasibility(reducer: unknown): AIFeasibilityScore {
  if (!reducer || typeof reducer !== 'object') {
    return { ...FEASIBILITY_TIERS.human, confidence: 50 };
  }

  const r = reducer as ReducerLike;
  const titleLower = (r.title ?? '').toLowerCase();
  const descLower = (r.description ?? '').toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  // Heuristics for tier assignment (can be refined with domain knowledge)
  const hasArtifact = !!(r.artifact?.promptText || r.artifact?.skillName);
  const hasPlaybook = !!(r.artifact?.playbookSteps?.length);
  const isComplexWorkflow = combined.includes('workflow') || 
                           combined.includes('multi-step') ||
                           combined.includes('decision');
  const requiresJudgment = combined.includes('judgment') ||
                          combined.includes('review') ||
                          combined.includes('approve');

  let confidence = 60;

  // Skill: has artifact, is prompt-based, not complex
  if (r.type === 'skill' || (hasArtifact && !isComplexWorkflow && !requiresJudgment)) {
    confidence = hasArtifact ? 85 : 70;
    return { ...FEASIBILITY_TIERS.skill, confidence };
  }

  // Plugin: is playbook-like, moderate complexity
  if (r.type === 'playbook' || hasPlaybook) {
    confidence = 75;
    return { ...FEASIBILITY_TIERS.plugin, confidence };
  }

  // Agent: workflow, multi-step, tool-based
  if (isComplexWorkflow || combined.includes('tool')) {
    confidence = 70;
    return { ...FEASIBILITY_TIERS.agent, confidence };
  }

  // Human: requires judgment, review, approval
  if (requiresJudgment) {
    confidence = 80;
    return { ...FEASIBILITY_TIERS.human, confidence };
  }

  // Default fallback based on type
  if (r.type === 'prompt') {
    return { ...FEASIBILITY_TIERS.skill, confidence: 65 };
  }

  return { ...FEASIBILITY_TIERS.plugin, confidence: 60 };
}

/**
 * Rank an array of reducers by AI feasibility (skill first, human last).
 */
export function rankByFeasibility(
  reducers: unknown[] | null | undefined,
): Array<{ reducer: ReducerLike; score: AIFeasibilityScore; index: number }> {
  if (!Array.isArray(reducers)) return [];

  const ranked = reducers
    .map((reducer, index) => ({
      reducer: (reducer as ReducerLike) || {},
      score: scoreAIFeasibility(reducer),
      index,
    }))
    .sort((a, b) => {
      const tierOrder: Record<AIFeasibilityTier, number> = {
        skill: 0,
        plugin: 1,
        agent: 2,
        human: 3,
      };
      const tierDiff = tierOrder[a.score.tier] - tierOrder[b.score.tier];
      if (tierDiff !== 0) return tierDiff;
      // Secondary sort: by confidence descending
      return b.score.confidence - a.score.confidence;
    });

  return ranked;
}
