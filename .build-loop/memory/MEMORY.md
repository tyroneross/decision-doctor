# Decision Doctor — build-loop project memory

Project-scoped learnings (decisions specific to this codebase). Global preferences live at `~/.build-loop/memory/`.

## Decisions

- [Clarifier flow → engine-typed protocol](decision_clarifier_engine_typed.md) — Migrating C6b from system-prompt-driven to lib/engine/clarifier.ts typed message protocol. Forecloses-future-capability rationale + acceptance criteria. 2026-05-11.
- [Ingestion V2 reliability architecture](decision_ingestion_v2_reliability_architecture.md) — First reliability slice stays inside existing Drizzle + `workers/src` + pg-boss architecture; uses `metadata.content_extract.body_kind`/hash contract before a later schema normalization. 2026-05-11.
- [Chat-flow FSM — 4-state derivation](decision_chat_flow_fsm_4state.md) — Chat-as-decision-front-door uses 4 MECE states (idle / conversational / survey / resolved) derived from the message log on every turn, not stored. Module at `lib/chat/flow-state.ts`. Fixes detector-every-message cost + persistence-gap structural class. 2026-05-13.

## Patterns

- [Ink-only re-skin](pattern_ink_only_reskin.md) — V2 Sunrise → terracotta-on-bone migration pattern.
- [HNSW ef_search verified](pattern_hnsw_ef_search_verified.md) — F-31 hybrid search vector-leg.

## Lessons

- [Railway node import tsx](lesson_railway_node_import_tsx.md) — Worker Node 22 start command for Railway.
