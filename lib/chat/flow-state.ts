// lib/chat/flow-state.ts
//
// Single source of truth for chat-as-decision-front-door flow state.
// Replaces the implicit if-else conditionals scattered across the route
// + client with one named FSM derived from the message log.
//
// Four MECE states (see .build-loop/memory/decision_chat_flow_fsm_4state.md
// for the decision rationale + expansion triggers):
//
//   idle           Thread is ready for a new intent. Detector eligible.
//   conversational LLM-driven intake loop in flight (clarifier widget pending).
//   survey         Multi-field survey card rendered; conversation paused.
//   resolved       Engine produced output; save-as-skill affordance live.
//
// The state is DERIVED from the message log on every turn, never stored as
// a primary field. This means the server and client compute the same state
// from the same data, so there's no FSM-out-of-sync class of bug.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FlowState = "idle" | "conversational" | "survey" | "resolved";

export interface FlowStateContext {
  state: FlowState;
  /** Short human-readable reason for the state classification — for
   *  telemetry, debugging, and tests. Never user-facing. */
  reason: string;
  /** When state === "conversational", the index of the message carrying
   *  the unresolved clarifier widget. */
  pendingClarifierMessageIndex?: number;
  /** When state === "survey", the index of the message carrying the
   *  unresolved survey card. */
  pendingSurveyMessageIndex?: number;
  /** When state === "resolved", the index of the message carrying the
   *  save-skill affordance. */
  pendingSaveMessageIndex?: number;
}

/**
 * Minimal shape of a chat message the derivation function needs.
 *
 * Intentionally loose — typed as `unknown` for the affordance payloads
 * because this module is shared between server + client and we don't
 * want to import the full UI ChatMessage type both places. The boolean
 * `*Resolved` flags are the load-bearing signal.
 */
export interface MessageForFlow {
  role: "user" | "assistant";
  clarifier?: unknown;
  clarifierResolved?: boolean;
  survey?: unknown;
  surveyResolved?: boolean;
  savedFromSurvey?: unknown;
  saveSkillResolved?: boolean;
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Derive the current FlowState from the chat message log.
 *
 * Walks backward through the thread. The most recent UNRESOLVED affordance
 * on an assistant message pins the state. Resolved-and-buried affordances
 * are history; they don't gate the next system action.
 *
 * Priority order within a single message (when multiple affordances are
 * attached to the same assistant turn): survey > resolved-save > clarifier.
 *
 *   - survey wins because the user has explicitly engaged the survey path
 *     and conversation pauses on the card.
 *   - resolved-save wins next because an engine output is the latest event;
 *     a pending save offer must surface before any other affordance.
 *   - clarifier is the conversational baseline.
 *
 * Fresh threads with no assistant message yet are "idle".
 */
export function deriveFlowState(
  messages: readonly MessageForFlow[],
): FlowStateContext {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;

    if (m.survey && !m.surveyResolved) {
      return {
        state: "survey",
        reason: `unresolved survey at message[${i}]`,
        pendingSurveyMessageIndex: i,
      };
    }
    if (m.savedFromSurvey && !m.saveSkillResolved) {
      return {
        state: "resolved",
        reason: `engine output with save-skill affordance at message[${i}]`,
        pendingSaveMessageIndex: i,
      };
    }
    if (m.clarifier && !m.clarifierResolved) {
      return {
        state: "conversational",
        reason: `unresolved clarifier widget at message[${i}]`,
        pendingClarifierMessageIndex: i,
      };
    }
    // This assistant message has nothing in flight. If every later message
    // is a user turn (i.e., we replied, the user typed, no new affordance
    // came back), the thread is logically idle from the FSM's perspective —
    // ready for the next system action.
    const everySubsequentIsUser = messages
      .slice(i + 1)
      .every((later) => later.role === "user");
    if (everySubsequentIsUser) {
      return {
        state: "idle",
        reason: `assistant reply at [${i}] has no in-flight affordance`,
      };
    }
  }
  return { state: "idle", reason: "no assistant messages yet" };
}

// ---------------------------------------------------------------------------
// State-driven capability helpers
// ---------------------------------------------------------------------------
//
// These answer the "what is this state authorized to do?" question in one
// place. Callers (route + client) read these instead of duplicating
// boolean-chain conditionals.

/**
 * Should we run the decision-intent detector on the latest user message?
 *
 * Only fire when the thread is idle. Once a flow is in progress, we
 * already know what the user is doing — re-classifying the next message
 * is wasteful (200ms + Groq cost per turn). Catches the cost issue
 * surfaced in the chat-detector validation pass.
 */
export function shouldFireDetector(state: FlowState): boolean {
  return state === "idle";
}

/**
 * Is the user allowed to submit free-text into the input bar?
 *
 * Every state except `survey` accepts free text. In `survey`, the card
 * is the only way forward — the user must submit or cancel before
 * conversational input resumes.
 */
export function canSubmitFreeText(state: FlowState): boolean {
  return state !== "survey";
}

/**
 * Should the save-as-skill chip be rendered on the message that emitted
 * the engine result?
 */
export function isSaveSkillEligible(state: FlowState): boolean {
  return state === "resolved";
}

// ---------------------------------------------------------------------------
// Allowed transitions
// ---------------------------------------------------------------------------
//
// Encoded as a map for runtime guards + tests. NOT enforced at the
// derivation site — the FSM is reconstructive (computed from message log),
// so transitions emerge from the data. The map is a CONTRACT for what
// the route + client may produce.

const TRANSITIONS: Readonly<Record<FlowState, ReadonlyArray<FlowState>>> = {
  // First user message that classifies as a decision → conversational
  // (intake loop) OR survey (if a previous accepted offer steered there).
  idle: ["conversational", "survey"],
  // Conversation continues, user accepts the survey offer, or engine
  // outputs land. Loop-back to conversational on follow-up turns is
  // staying-in-state (covered by self-edge below).
  conversational: ["survey", "resolved", "idle"],
  // Survey submits → resolved. Survey cancel/unmappable → conversational
  // (intake takes over with the formatted answers already in history).
  survey: ["resolved", "conversational"],
  // Engine output shown. User saves or dismisses → idle. User asks a
  // follow-up that's another decision question → conversational.
  resolved: ["idle", "conversational"],
};

/**
 * Is `from → to` a transition the FSM permits?
 *
 * Self-edges (staying in the same state across a turn) are always valid:
 * a clarifier loop with multiple turns stays in `conversational`.
 */
export function isValidTransition(from: FlowState, to: FlowState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

/**
 * Returns the set of states reachable from `from` in one transition.
 * Useful for telemetry + tests.
 */
export function reachableFrom(from: FlowState): ReadonlyArray<FlowState> {
  return [from, ...TRANSITIONS[from]];
}
