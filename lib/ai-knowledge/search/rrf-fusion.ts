// F-6 — Reciprocal Rank Fusion for the 3-leg hybrid search.
//
// Pure function. RRF score = sum over legs of 1 / (k + rank_in_leg).
// k=60 is the canonical Cormack et al. (2009) default; revisit if F-12
// recall@10 misses target. See pattern_rrf_k_tuning.md.

export interface LegHit {
  doc_id: string;
  rank: number; // leg-specific rank value (NOT used by RRF; we use list position)
}

export interface FusedHit {
  doc_id: string;
  score: number;
  legs: string[]; // which legs contributed (for debugging)
}

/**
 * Fuse N ranked lists into one. Each input list is assumed sorted best-first.
 * Position in the input list = rank used by RRF (1-indexed).
 */
export function rrfFuse(
  legs: Record<string, LegHit[]>,
  k = 60,
): FusedHit[] {
  const acc = new Map<string, { score: number; legs: string[] }>();
  for (const [legName, hits] of Object.entries(legs)) {
    hits.forEach((h, i) => {
      const cur = acc.get(h.doc_id) ?? { score: 0, legs: [] };
      cur.score += 1 / (k + i + 1);
      cur.legs.push(legName);
      acc.set(h.doc_id, cur);
    });
  }
  return Array.from(acc.entries())
    .map(([doc_id, v]) => ({ doc_id, score: v.score, legs: v.legs }))
    .sort((a, b) => b.score - a.score);
}
