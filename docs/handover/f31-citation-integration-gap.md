# F-11 — citation chip integration gap

**Date:** 2026-05-11
**Status:** ⚠️ Untested — component shipped in isolation.

## What shipped (F-11)

- `components/chat/CitationChip.tsx` — pure UI chip component.
- `renderWithCitations(text, citations)` — pure helper that swaps `[[doc:<uuid>]]` tokens for numbered chips, deduping ids and assigning 1-indexed numbers in order of appearance.

Component is fully wired and renderable. `renderWithCitations` is a pure function suitable for unit-testing without React (called as `renderWithCitations(text, citations)` returning `React.ReactNode[]`).

## What did NOT ship

`components/chat/Chat.tsx` was NOT edited because the engine does not emit citation tokens yet. Grepped for `[[doc:` / `citation` / `source_url` in `components/chat/` and `lib/chat/` on 2026-05-11 — zero hits. Wiring the chip into Chat.tsx requires:

1. **Engine prompt change** — system prompt for the synthesis stage must instruct the LLM to emit `[[doc:<uuid>]]` after factual claims drawn from corpus context.
2. **Chat.tsx call-site** — replace the current message renderer's plain-text body with `renderWithCitations(content, citations)` and inject the citation list returned from the API.
3. **API contract change** — `/api/chat` POST response must include a `citations: Citation[]` field alongside the message content.
4. **Engine route plumbing** — `lib/engine/*` must thread the corpus-document context through to the response payload so the API can return the citations array.

## Suggested follow-up shape (≤3 LoC at the call-site)

```tsx
// inside Chat.tsx message renderer:
import { renderWithCitations } from "./CitationChip";
// ...
<div className="whitespace-pre-wrap">
  {renderWithCitations(message.content, message.citations ?? [])}
</div>
```

## Why this is acceptable for F-31 ship

The dispatch brief allows shipping the chip in isolation if the engine doesn't yet emit tokens. The component is unit-renderable today; the follow-up is a 4-point thread (prompt + chat route + engine + Chat.tsx). All four are local to this repo — no Railway or DB change required.
