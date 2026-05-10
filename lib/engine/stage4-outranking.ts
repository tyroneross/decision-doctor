// PRD §6.2 Stage 4 — Outranking (ELECTRE-style pairwise dominance).
// Deterministic. For each pair (a, b), compute a concordance score (% weighted
// criteria where a >= b) and a discordance score (max criterion gap where b > a).
// If a strictly dominates b — concordance ≥ 0.7 AND discordance ≤ 0.2 — flag b
// for elimination at this stage.
//
// Output: dominant set (candidates not strictly dominated) plus per-candidate
// outranking traces for the methodTrace UI.

import type { Candidate } from "@/lib/engine/types";

export interface Stage4Output {
  dominant: Candidate[];
  eliminated: Array<{
    candidateId: string;
    dominatedById: string;
    concordance: number;
    discordance: number;
    reason: string;
  }>;
  pairwise: Array<{
    aId: string;
    bId: string;
    concordance: number;
    discordance: number;
  }>;
}

const CONCORDANCE_THRESHOLD = 0.7;
const DISCORDANCE_THRESHOLD = 0.2;

export function runStage4Outranking(
  candidates: Candidate[],
  weights: Record<string, number>,
): Stage4Output {
  const pairwise: Stage4Output["pairwise"] = [];
  const dominatedBy = new Map<string, { id: string; concordance: number; discordance: number }>();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const a = candidates[i]!;
      const b = candidates[j]!;
      const { concordance, discordance } = pairScore(a, b, weights);
      pairwise.push({ aId: a.id, bId: b.id, concordance, discordance });
      // a strictly dominates b
      if (
        concordance >= CONCORDANCE_THRESHOLD &&
        discordance <= DISCORDANCE_THRESHOLD
      ) {
        const cur = dominatedBy.get(b.id);
        if (!cur || cur.concordance < concordance) {
          dominatedBy.set(b.id, {
            id: a.id,
            concordance,
            discordance,
          });
        }
      }
    }
  }

  const dominant = candidates.filter((c) => !dominatedBy.has(c.id));
  const eliminated: Stage4Output["eliminated"] = [];
  for (const [bid, dom] of dominatedBy.entries()) {
    const cand = candidates.find((c) => c.id === bid)!;
    const dominator = candidates.find((c) => c.id === dom.id)!;
    eliminated.push({
      candidateId: bid,
      dominatedById: dom.id,
      concordance: dom.concordance,
      discordance: dom.discordance,
      reason: `Outranked by "${dominator.label}" — better on ${Math.round(dom.concordance * 100)}% of weighted criteria with no large gaps.`,
    });
  }

  // Edge case: if outranking eliminated everything (rare — circular preferences)
  // fall back to all candidates so Stage 5 still has options.
  if (dominant.length === 0) {
    return {
      dominant: candidates,
      eliminated: [],
      pairwise,
    };
  }

  return { dominant, eliminated, pairwise };
}

function pairScore(
  a: Candidate,
  b: Candidate,
  weights: Record<string, number>,
): { concordance: number; discordance: number } {
  let concord = 0;
  let totalWeight = 0;
  let maxGap = 0;
  for (const [critId, w] of Object.entries(weights)) {
    const aScore = a.scores[critId] ?? 0;
    const bScore = b.scores[critId] ?? 0;
    totalWeight += w;
    if (aScore >= bScore) concord += w;
    if (bScore > aScore) {
      const gap = bScore - aScore;
      if (gap > maxGap) maxGap = gap;
    }
  }
  return {
    concordance: totalWeight > 0 ? concord / totalWeight : 0,
    discordance: maxGap, // already in [0, 1] since scores are in [0, 1]
  };
}
