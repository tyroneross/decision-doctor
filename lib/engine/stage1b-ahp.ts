// PRD §6.2 Stage 1B (F-10) — AHP elicitation (Analytic Hierarchy Process).
//
// User supplies pairwise comparisons of n criteria using Saaty's 1–9 scale.
// We compute the criterion weights via the principal eigenvector (power
// iteration — no `mathjs` dependency per the build-from-scratch constraint).
// Consistency Ratio (CR) flags contradictions per Saaty:
//
//     CI = (λ_max − n) / (n − 1)
//     CR = CI / RI[n]
//
// CR ≤ 0.10 → consistent enough. CR > 0.10 → flag inconsistency to the user
// and surface the most-inconsistent comparison pair for revision.
//
// Reference fixture (T-13): Saaty's textbook 4-criteria example.
// Numerical fallback: if power iteration fails to converge in <50 steps,
// fall through to a normalized-geometric-mean approximation (Saaty's "row
// geometric mean" — within ~2% of the true eigenvector for n ≤ 8).

import type { DecisionTemplate } from "@/lib/engine/types";

// Saaty's Random Index (RI) — used in CR computation. Indexed by n.
// Values per Saaty (1980/1991). RI for n<3 is 0 by convention.
// n: 1   2   3     4     5     6     7     8
//    0   0   0.58  0.90  1.12  1.24  1.32  1.41
const RI: readonly number[] = [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41];

export const AHP_MIN_CRITERIA = 3;
export const AHP_MAX_CRITERIA = 8;
export const AHP_CR_THRESHOLD = 0.1;

export interface AhpPairwiseInput {
  criterionIds: string[]; // length n; ids in stable order
  /**
   * Upper-triangular ratios. comparisons[i][j] means "criterion i is HOW MUCH
   * more important than criterion j" on Saaty's 1-9 scale. Only entries with
   * i < j are required; the lower triangle (j > i) is the reciprocal.
   * Diagonal is always 1.
   */
  comparisons: Record<string, number>; // key = `${i}:${j}` where i<j
}

export interface AhpResult {
  weights: Record<string, number>; // sums to 1 ± 1e-6
  lambdaMax: number;
  CI: number;
  CR: number;
  consistent: boolean;
  /** Most-inconsistent pair to flag in the UX when !consistent. */
  worstPair: { i: number; j: number; expectedRatio: number; observedRatio: number } | null;
  /** Pairwise matrix as built — handy for tracing in methodTrace. */
  matrix: number[][];
}

// ── Public API ────────────────────────────────────────────────────────────

export function runStage1bAhp(input: AhpPairwiseInput): AhpResult {
  const n = input.criterionIds.length;
  if (n < AHP_MIN_CRITERIA) {
    throw new Error(
      `AHP requires at least ${AHP_MIN_CRITERIA} criteria (got ${n}).`,
    );
  }
  if (n > AHP_MAX_CRITERIA) {
    throw new Error(
      `AHP limited to ${AHP_MAX_CRITERIA} criteria (got ${n}). Pairwise count C(n,2) explodes beyond this; coarsen the criterion set first.`,
    );
  }

  const matrix = buildMatrix(n, input.comparisons);
  const eig = powerIterationEigenvector(matrix);

  // Eigenvector → weights (already L1-normalized inside powerIteration).
  const weightVec = eig.vector;
  const weights: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    weights[input.criterionIds[i]!] = weightVec[i]!;
  }

  // CI = (λ_max − n) / (n − 1)
  const lambdaMax = eig.lambda;
  const CI = n > 1 ? (lambdaMax - n) / (n - 1) : 0;
  const riAt = RI[n] ?? 1.41; // safe default for any n ≤ 8
  const CR = riAt > 0 ? CI / riAt : 0;
  const consistent = CR <= AHP_CR_THRESHOLD;

  const worstPair = consistent ? null : findWorstPair(matrix, weightVec);

  return {
    weights,
    lambdaMax,
    CI,
    CR,
    consistent,
    worstPair,
    matrix,
  };
}

/**
 * Convenience wrapper for callers that already have a DecisionTemplate.
 * Re-orders the weights to match the template's criterion order and returns
 * the same shape as Stage 1 (so the orchestrator can drop it in as a swap).
 */
export function runStage1bAhpForTemplate(
  template: DecisionTemplate,
  comparisons: Record<string, number>,
): AhpResult {
  return runStage1bAhp({
    criterionIds: template.criteria.map((c) => c.id),
    comparisons,
  });
}

// ── Internal: matrix building ─────────────────────────────────────────────

function buildMatrix(n: number, comparisons: Record<string, number>): number[][] {
  const m: number[][] = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const raw = comparisons[`${i}:${j}`];
      // Saaty's 1–9 scale: values outside [1/9, 9] get clamped.
      const v =
        typeof raw === "number" && Number.isFinite(raw) && raw > 0
          ? Math.max(1 / 9, Math.min(9, raw))
          : 1; // missing comparison = "equal importance"
      m[i]![j] = v;
      m[j]![i] = 1 / v;
    }
  }
  return m;
}

// ── Internal: principal eigenvector via power iteration ───────────────────
//
// Converges in ~10 iterations for well-conditioned reciprocal matrices
// (Saaty matrices with CR < 0.5 are well-conditioned by construction). Fallback
// is row geometric mean — exact for perfectly consistent matrices, accurate
// within ~2% for typical user inputs.

interface EigResult {
  vector: number[]; // L1-normalized (sums to 1)
  lambda: number;
}

function powerIterationEigenvector(matrix: number[][]): EigResult {
  const n = matrix.length;
  // Start from the uniform vector — robust for n ≤ 8.
  let v = Array(n).fill(1 / n);
  let lambda = 0;
  const MAX_ITER = 50;
  const TOL = 1e-9;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const next = matVec(matrix, v);
    const sum = next.reduce((s, x) => s + x, 0);
    if (sum === 0) break; // pathological
    const normalized = next.map((x) => x / sum);
    // Rayleigh-quotient-ish estimate: λ ≈ <Av, v> / <v, v> with normalized v
    const lambdaNext = next.reduce((s, x) => s + x, 0); // since v sums to 1
    const delta = vecMaxDiff(normalized, v);
    v = normalized;
    lambda = lambdaNext;
    if (delta < TOL) break;
  }

  // Belt-and-suspenders fallback for any case power iteration didn't settle:
  // use row geometric means and renormalize. Picks the more stable result.
  const fallback = rowGeometricMeanEigenvector(matrix);
  // λ from the canonical relation: λ_max = sum_j (A v)_j  for the eigenvector v
  // (since v sums to 1).
  const lambdaFromVec = (vec: number[]): number =>
    matVec(matrix, vec).reduce((s, x) => s + x, 0);

  // Prefer power iteration if its vector closely satisfies A v = λ v; otherwise
  // fall through.
  const piConsistency = residualNorm(matrix, v, lambda);
  const fbLambda = lambdaFromVec(fallback);
  const fbConsistency = residualNorm(matrix, fallback, fbLambda);

  if (fbConsistency < piConsistency) {
    return { vector: fallback, lambda: fbLambda };
  }
  return { vector: v, lambda };
}

function rowGeometricMeanEigenvector(matrix: number[][]): number[] {
  const n = matrix.length;
  const gms: number[] = matrix.map((row) => {
    // geometric mean = (∏ row[j])^(1/n)
    let log = 0;
    for (let j = 0; j < n; j++) log += Math.log(row[j]!);
    return Math.exp(log / n);
  });
  const sum = gms.reduce((s, x) => s + x, 0);
  return gms.map((g) => g / sum);
}

function matVec(m: number[][], v: number[]): number[] {
  const n = m.length;
  const out: number[] = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += m[i]![j]! * v[j]!;
    out[i] = s;
  }
  return out;
}

function vecMaxDiff(a: number[], b: number[]): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i]! - b[i]!);
    if (d > max) max = d;
  }
  return max;
}

function residualNorm(m: number[][], v: number[], lambda: number): number {
  // ||Av - λv||_∞
  const av = matVec(m, v);
  let max = 0;
  for (let i = 0; i < v.length; i++) {
    const d = Math.abs(av[i]! - lambda * v[i]!);
    if (d > max) max = d;
  }
  return max;
}

// ── Worst-pair detection (for CR > 0.10 UX) ───────────────────────────────
//
// For each (i, j) with i < j, the *expected* ratio under the computed weights
// is w_i / w_j. The *observed* ratio is matrix[i][j]. The most-inconsistent
// pair is the one with the largest log-ratio deviation.

function findWorstPair(
  matrix: number[][],
  weights: number[],
): { i: number; j: number; expectedRatio: number; observedRatio: number } | null {
  const n = matrix.length;
  let worst: ReturnType<typeof findWorstPair> = null;
  let worstDev = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const expected = weights[i]! / weights[j]!;
      const observed = matrix[i]![j]!;
      const dev = Math.abs(Math.log(observed) - Math.log(expected));
      if (dev > worstDev) {
        worstDev = dev;
        worst = { i, j, expectedRatio: expected, observedRatio: observed };
      }
    }
  }
  return worst;
}
