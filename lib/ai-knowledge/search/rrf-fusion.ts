// F-6 — Reciprocal Rank Fusion for the hybrid search legs.
//
// Pure function. RRF score = sum over legs of weight_leg * 1 / (k + rank_in_leg).
// k=60 is the canonical Cormack et al. (2009) default; per-leg weights default
// to 1.0 (equivalent to classic RRF). Track A introduces per-leg weighting so
// the library leg can carry extra weight in Focused mode — the library is the
// curated adoption surface; without a boost, dense bm25+vector consensus on
// adoption-tagged corpus rows crowds library hits out of top-K.

export interface LegHit {
  doc_id: string;
  rank: number; // leg-specific rank value (NOT used by RRF; we use list position)
}

export interface FusedHit {
  doc_id: string;
  score: number;
  legs: string[]; // which legs contributed (for debugging)
}

export interface RrfOptions {
  /** Cormack RRF constant. Default 60. */
  k?: number;
  /** Per-leg multiplier. Missing legs default to 1.0. */
  weights?: Record<string, number>;
}

/**
 * Fuse N ranked lists into one. Each input list is assumed sorted best-first.
 * Position in the input list = rank used by RRF (1-indexed).
 *
 * Per-leg `weights` multiply that leg's reciprocal-rank contribution. A leg
 * with weight 2.0 effectively halves its k, doubling the score for the same
 * position. Use weights to surface a "trusted" leg (e.g. curated library) when
 * unweighted RRF would let dense agreement on another leg drown it out.
 */
export function rrfFuse(
  legs: Record<string, LegHit[]>,
  optsOrK: RrfOptions | number = {},
): FusedHit[] {
  const opts: RrfOptions = typeof optsOrK === "number" ? { k: optsOrK } : optsOrK;
  const k = opts.k ?? 60;
  const weights = opts.weights ?? {};

  const acc = new Map<string, { score: number; legs: string[] }>();
  for (const [legName, hits] of Object.entries(legs)) {
    const weight = weights[legName] ?? 1.0;
    hits.forEach((h, i) => {
      const cur = acc.get(h.doc_id) ?? { score: 0, legs: [] };
      cur.score += weight * (1 / (k + i + 1));
      if (!cur.legs.includes(legName)) cur.legs.push(legName);
      acc.set(h.doc_id, cur);
    });
  }
  return Array.from(acc.entries())
    .map(([doc_id, v]) => ({ doc_id, score: v.score, legs: v.legs }))
    .sort((a, b) => b.score - a.score);
}
