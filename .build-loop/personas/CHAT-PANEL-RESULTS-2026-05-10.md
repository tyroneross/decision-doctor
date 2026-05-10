# Chat-First Persona Panel Results — 2026-05-10

Four personas tested commit `543f293` (chat-first) of Decision Doctor.

## Scorecard

| Persona | Pre-fix (form) | Chat-first | Δ | One-line verdict |
|---|---|---|---|---|
| Maya | 8/10 | **4/10** | −4 | "Lovely opening, broken middle, no payoff." |
| Sam | 6.5/10 | **6.0/10** | −0.5 | "Disambiguation regression, leaked router rationale, dead skill artifact." |
| Priya | 7/10 | **6.5/10** | −0.5 | "Don't ship publicly. Internal beta only — admin-hire misclassification is a credibility-killer." |
| Hank | 5/10 | **4/10** | −1 | "If you're not done, don't ship the door." |

**Net: chat regressed from average 6.6 → 5.1.** Every persona scored lower than they did on the form.

## P0 ship-blocker bugs (every persona hit at least one)

### 1. Quick-start chip → placeholder card (Maya, Hank, Priya)
The "Pricing" / "Hire" / "Capacity" chips on first turn are supposed to fast-path into the matching template. Instead they classify as `generic_structured` or `generative_design` and end at the v1.1 placeholder. **Root cause**: router heuristic returns confidence 0.65 for template match without numeric anchor → falls below 0.7 gate → LLM overrides because system prompt says "bias toward generative_design when no options named".

### 2. Recommendation page 404 for placeholder decisions (Hank)
Hank's chat completed and redirected to `/app/decisions/<id>` → **404**. The placeholder DecisionOutput likely fails `DecisionOutputSchema` validation because alternatives need ≥2 entries with specific shapes.

### 3. Router rationale + missing-info concatenation produces sentence fragments (Maya, Hank, Sam)
Visible to all three: assistant message ends with `". To do this well, <fragment>."` because the orchestrator concatenates a complete sentence with a noun-phrase missingInfo[0]. Maya almost closed the tab.

### 4. Internal taxonomy leaks into user-facing copy (Hank, Priya, Maya)
Words showing up that should never reach a user:
- `"structured enumeration"` (Maya — in router rationale)
- `"structured_enumerable pattern"` (Sam — first assistant message)
- `"generic_structured"`, `"design brief"`, `"values map"`, `"v1.1"`, `"3 templates"` (Hank — recommendation prose)

### 5. LLM router classifies nonsense confidently (Priya)
`"xyzzy"` → `generative_design` at confidence 0.85. The clarifier never kicks in. **Fix**: LLM router prompt must require humility — return ≤0.6 when input has no recognizable structure.

## P1 — degraded UX (won't kill, but compounds)

### 6. Compound clarifier questions (Hank)
LLM-generated clarifier asks two things in one turn ("current net monthly profit AND months of cash reserves"). **Fix**: system prompt requires ONE question per turn.

### 7. Chip label "Capacity" reads as HVAC (Hank)
"Capacity" is internal phrasing. **Fix**: relabel "Workload / Capacity" or "Patient load".

### 8. No chips on binary clarifier turns (Maya)
The chat asks "keeping revenue steady or limiting new patients?" but doesn't render chips. Maya had to type both back. **Fix**: detect binary "or" questions and emit chips.

### 9. Recommendation drops a stated axis (Sam)
Sam asked "4th day OR raise rates" — recommendation only addressed rates, never mentioned the 4th day. **Fix**: when the user names two axes, the engine should keep both as candidate paths.

### 10. Workload reducer with `skillName: "RevenueProjectionSkill"` and no executable artifact (Sam)
Same dead-end as last round. **Fix**: stage5 sanitizer drops reducers whose artifact has no executable field.

### 11. Conversation doesn't show in `/app/chat` reload (Priya)
No "recent decisions" rail. Priya had to know the UUID to resume. **Fix**: add list of recent in-progress chats on `/app/chat`.

## What still works (do NOT break)
- The empty-textarea + 3-chip opening: every persona praised approachability
- "No patient names" microcopy under the input
- Adversarial input handling: SQL/XSS/long-paste all properly rejected (Priya verified — no 5xx, no XSS reflection, CSP intact)
- Unit-correct echoback on monthly $ (Hank credit: "real fix from the old $18k/year disaster")
- Server-side state correctly persists transcript to DB (Priya verified `/api/decisions/:id` returns full transcript)
- Better Auth + share-token + RLS — all intact

## Action plan (in priority order)

1. **Lock template-match → mode** in `lib/engine/router.ts`. Never let the LLM override `mode` when `templateMatch !== null`.
2. **Fix LLM router prompt** to refuse confident classification of gibberish; return ≤0.6 with empty rationale rather than invent.
3. **Rewrite first-classification copy** in `chat-orchestrator.ts` so the rationale + missingInfo concatenation is grammatically sound (or use ONE complete sentence, not concat).
4. **Strip all internal taxonomy** (`structured_enumerable`, `generic_structured`, `v1.1`, `the 3 templates`) from any user-facing string.
5. **Fix recommendation page** to handle placeholder decisions without 404 — render a "Saved for later" card with the conversation transcript visible, not the engine output shape.
6. **Generic clarifier system prompt** — ONE question per turn (no compound).
7. **Filter reducers** with no executable artifact at the engine boundary (sanitize in stage5-ranking).
8. **Rename "Capacity" chip** → "Workload" or "Patient load".
9. **Detect binary "X or Y" questions** in clarifiers and emit chips.
10. **Add "recent chats" rail** to `/app/chat` (Priya — defer if scope-bound).

Round-2 targets: re-test with Maya + Hank (the two who scored lowest) after fixes 1-7 land. Goal: get back to ≥6/10 average before adding more features.
