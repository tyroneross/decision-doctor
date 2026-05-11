// Clarifier types — re-export from the engine's source of truth.
//
// Historically this file defined the discriminated union inline. After the
// 2026-05-11 engine-typed protocol migration, the canonical definitions
// live in lib/engine/clarifier.ts so non-chat surfaces (voice, native,
// scheduled jobs) can import them without depending on this component
// module.
//
// Keep this file as a stable re-export so existing imports under
// components/chat/widgets/ continue to resolve without a sweep.

export type {
  ClarifierKind,
  ClarifierBase,
  ClarifierSlider,
  ClarifierStepper,
  ClarifierRange,
  ClarifierChips,
  ClarifierWidget,
  ClarifierMeta,
  ClarifierSubmission,
} from "@/lib/engine/clarifier";
