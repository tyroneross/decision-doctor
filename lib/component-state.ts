// Interaction-state matrix resolvers — E4 from UI coverage audit.
//
// UX spec §4 requires every interactive component to document and implement
// the canonical six states:
//
//   default   — component is idle and ready to receive input. No data.
//   populated — component has data and is in its primary "in use" mode.
//   loading   — async work in flight; render skeleton / spinner.
//   success   — transient post-action confirmation (e.g. "Copied ✓").
//   error     — operation failed; surface a friendly error variant.
//   empty     — no data available AND not loading / not in error.
//
// These resolvers are pure (no React imports). The components import them
// and switch on the returned ComponentState to render the right branch. The
// tests in tests/component-state.test.ts exercise every state per component
// so that adding a new state to one component without updating its tests
// breaks the build.
//
// E4 critic check: each of ScaffoldViewer, CodeBlock, AhpPairwise must
// route through one of these resolvers and have explicit branches.

export type ComponentState =
  | "default"
  | "populated"
  | "loading"
  | "success"
  | "error"
  | "empty";

// ─── ScaffoldViewer ─────────────────────────────────────────────────────

export interface ScaffoldViewerInput {
  /** Whether the drawer is open (controlled by parent). */
  open: boolean;
  /** Async load in progress. */
  loading?: boolean;
  /** Truthy = error variant. */
  error?: string | null;
  /** Explicit empty hint from the parent (e.g. template not yet authored). */
  empty?: boolean;
  /** Number of files in the scaffold. */
  filesCount: number;
  /** Transient "Copied ✓" confirmation just fired. */
  copiedAll?: boolean;
}

/**
 * State precedence for ScaffoldViewer (highest first):
 *   error → loading → empty → success → populated → default
 *
 * `default` here means "drawer is closed". The drawer is unmounted at the
 * caller, so the resolver returning "default" is mostly defensive — the
 * caller has already returned null. Treat it as the no-render sentinel.
 */
export function resolveScaffoldViewerState(
  input: ScaffoldViewerInput,
): ComponentState {
  if (!input.open) return "default";
  if (input.error) return "error";
  if (input.loading) return "loading";
  if (input.empty || input.filesCount === 0) return "empty";
  if (input.copiedAll) return "success";
  return "populated";
}

// ─── CodeBlock ──────────────────────────────────────────────────────────

export interface CodeBlockInput {
  /** Source code to render. Empty string = empty state. */
  code: string;
  /** Async load (e.g. fetching highlighter chunk). */
  loading?: boolean;
  /** Truthy = error variant (e.g. clipboard denied + copy attempt). */
  error?: string | null;
  /** Transient "Copied ✓" confirmation just fired. */
  copied?: boolean;
}

/**
 * State precedence for CodeBlock:
 *   error → loading → empty → success → populated
 *
 * No "default" — CodeBlock is always mounted with a code prop. Empty code
 * surfaces an empty-state pill rather than rendering an empty <pre>.
 */
export function resolveCodeBlockState(input: CodeBlockInput): ComponentState {
  if (input.error) return "error";
  if (input.loading) return "loading";
  if (!input.code || input.code.length === 0) return "empty";
  if (input.copied) return "success";
  return "populated";
}

// ─── AhpPairwise ────────────────────────────────────────────────────────

export interface AhpPairwiseInput {
  /** Number of criteria in the comparison set. */
  criteriaCount: number;
  /** Number of pairs the user has already answered. */
  answeredCount: number;
  /** Total pairs to answer = criteriaCount choose 2. */
  totalPairs: number;
  /** Async work (rare — e.g. computing eigenvector weights server-side). */
  loading?: boolean;
  /** Truthy = error variant. */
  error?: string | null;
  /** All pairs answered AND CR ≤ 0.10. */
  consistent?: boolean;
}

/**
 * State precedence for AhpPairwise:
 *   error → loading → empty (< 2 criteria) → default (0 answered) →
 *   success (all answered + consistent) → populated.
 *
 * `empty` fires when there are < 2 criteria — pairwise comparison needs at
 * least two items. Caller should hide the component in that case, but the
 * resolver returning "empty" lets the component render a friendly hint
 * rather than crashing on an empty pairs array.
 */
export function resolveAhpPairwiseState(
  input: AhpPairwiseInput,
): ComponentState {
  if (input.error) return "error";
  if (input.loading) return "loading";
  if (input.criteriaCount < 2 || input.totalPairs === 0) return "empty";
  if (input.answeredCount === 0) return "default";
  if (input.answeredCount >= input.totalPairs && input.consistent) {
    return "success";
  }
  return "populated";
}
