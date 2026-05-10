# Decision Doctor — User Persona Panel

Four ICPs spanning **technical proficiency × AI proficiency × domain experience**. Each persona walks the live app end-to-end and reports as that persona would think out loud, including an interactive-integrity sweep (every button/link/icon: works / partial / dead).

## Why these four

Solo healthcare practitioner ICP per PRD §2 "Target user" — solo psychiatry private practice owner, expanding to LCSWs/LMFTs, solo primary care, nutritionists, PTs/OTs. The grid below covers the corners of the ICP space.

| Persona | Tech proficiency | AI proficiency | Domain years | Specialty |
|---|---|---|---|---|
| [Dr. Maya Reyes](maya-reyes.md) | LOW (iPad + email) | NONE (heard of ChatGPT, never used) | 15 | Solo psychiatrist |
| [Sam Okafor](sam-okafor.md) | MID (Notion, Stripe, basic web) | MID (uses ChatGPT for emails) | 3 | Independent LMFT |
| [Dr. Priya Shah](priya-shah.md) | HIGH (Squarespace, Zapier, tried Lovable) | HIGH (uses Claude daily) | 8 | Solo physical therapist |
| [Dr. Hank Larsson](hank-larsson.md) | VERY LOW (paper + Outlook + 2-finger typing) | NONE | 32 | Solo pediatrician |

## Cross-persona convergence (pre-fix baseline, 2026-05-10)

Average intuitiveness: **6.6/10**.

### What every persona named (or 3+ of 4)
1. **Sign-up buried as tab on `/sign-in`** — Maya, Sam, Hank all confused. Hank actually hit `/sign-up` 404. *Fixed in commit 1323308.*
2. **4 reducer chips (`type` `automationLevel` `coverage` `permission_tier=T1`)** — Sam, Priya, Hank all flagged as engineer-built smell. *Fixed in 1323308.*
3. **8-12s submit with no progress feedback** — Sam, Priya, Hank all said they'd think it crashed. *Fixed in 1323308 (rotating 5-stage progress copy).*
4. **Persona leakage in workload reducer prompts** — Hank (pediatrician) got prompts that said *"You are a solo therapist…"*. *Fixed in 6954e42 (Stage 5 system prompt forbids assumed specialty).*
5. **`X` and `$Y` literal placeholders in prompt artifacts** — Hank typed $18,000/month and got back `Pay $Y` in the prompt. *Fixed in 6954e42 (`stripPlaceholderSentences()`).*

### Engine integrity issues (added by ruthless critic)
6. **100% confidence label** read as bluffing. *Fixed in 6954e42 (cap at 95).*
7. **Robust alternative same as recommendation** when only 1-2 options survive. *Fixed in 6954e42 (sentinel + UI message).*
8. **Raw weights (`burnout impact (0.4)`) in rationale prose**. *Fixed in 6954e42 (system prompt + post-process scrub).*

### What every persona ALSO praised (do NOT break in future iterations)
- **"No PHI — none asked, none stored"** copy on the landing — earned trust for all four
- Three plain-English template names: Capacity / Pricing / Hire — right number, right names
- ≤7 fields per intake — felt manageable
- Honest confidence percentages (60-78%, never 100%) — earned trust
- "Robust alternative" pattern — Sam: "the part that earned my trust"
- Print → real OS dialog → real document layout (Hank verified printout looked like a real document)
- Share-link works publicly without auth (verified by 3 personas)

## Pre-fix scores

| Persona | Intuitiveness | Top complaint |
|---|---|---|
| Maya | 8/10 | Sign-up hidden under "Sign in" tabs almost made her close the tab |
| Sam | 6.5/10 | Four reducer chips read as "engineer-built smell" |
| Priya | 7/10 | T0..T5 tier scheme overengineered for end-user UI |
| Hank | 5/10 | Engine echoed "$18,000 per year" when he typed $18,000/month — would not act |

## Methodology — how the panel was run

Each persona was a separate `general-purpose` subagent with a tightly scoped roleplay brief (in conversation context; transcripts in this folder). The agent was given:
- Full backstory (age, specialty, tech stack, AI history, personality)
- Specific task: sign up → pick a template → fill intake → read recommendation → try every secondary action
- Tools: Bash + curl + IBR MCP tools for live page inspection
- Output format: think-out-loud as the persona, name elements by visible text not CSS class, end with 3-line verdict (would they use again, what they'd change first, intuitiveness 0-10)

The agents are stateless replays of the persona's perspective. They are NOT real users; they are LLM impersonations grounded in the brief. Treat as **directionally sharper than my own UX speculation, less reliable than recruited users**. Worth re-running after every commit that materially changes the surface.

## When to re-run the panel

- After every commit that changes a primary surface (`landing`, `/sign-in`, `/app/chat`, recommendation page)
- Before any Vercel production deploy
- When >3 commits land without a panel pass
- Whenever a feature lands that the personas never saw (e.g. the chat-first pivot in commit 543f293 — the panel hasn't tested chat yet)

## Pending: chat-first retest

**The four personas above tested the TEMPLATE-FORM flow (commits ≤6954e42). The chat-first pivot landed in commit `543f293` and has NOT been persona-tested yet.** Next persona pass should specifically focus on:

- Does the chat opening line ("Tell me about a decision you're trying to make. One sentence is enough — no patient names, just the situation.") feel approachable to Maya/Hank?
- Do the 3 quick-start chips give Sam/Priya the fast-path they want?
- When the router asks a clarifier ("Quick check — which best describes what you're doing?"), does Hank understand the 3 mode buckets?
- Does the conversational template extraction feel like progress or feel slower than the form?
- Is the recommendation handoff (chat says "Building your recommendation now…" → 800ms → redirect) clear?
- Does the placeholder card for modes 2/3/4 (the v1.1-coming message) feel honest or feel like a half-shipped product?

Re-test plan written at `.build-loop/personas/RETEST-PLAN-CHAT.md` (next iteration).
