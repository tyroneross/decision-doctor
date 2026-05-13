// PRD §10 Service Profile + LD-02 — Groq client wrapper (Next.js server boundary).
//
// This file enforces server-only via the `server-only` import. The actual
// client + callStage implementation lives in lib/groq-core.ts so that
// CLI scripts and Node workers can import the same code without tripping
// the client-bundle guard.

import "server-only";

export { groq, GROQ_MODEL, callStage } from "@/lib/groq-core";
