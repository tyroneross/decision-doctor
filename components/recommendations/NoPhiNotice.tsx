// components/recommendations/NoPhiNotice.tsx
//
// Re-export shim — NoPhiNotice was promoted to components/ui/NoPhiNotice.tsx
// for shared use across Chat, history/new intake, and ask Q&A surfaces.
// This file keeps existing imports under components/recommendations/ working.

export { NoPhiNotice } from "@/components/ui/NoPhiNotice";
export type { NoPhiNoticeProps } from "@/components/ui/NoPhiNotice";
