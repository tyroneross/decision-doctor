# Decision Doctor

**Live:** https://decision-doctor-xi.vercel.app

A transparent decision engine for solo healthcare practitioners. Decision Doctor does two things in one workflow: it ships paste-ready AI tools that remove the admin work eating a practitioner's week, and it runs a transparent decision-science pipeline for the harder business questions AI alone cannot answer.

Built for the MLT20 AI Buildathon, anchored on a real user (a solo psychiatrist) who needs the business side of her practice to stop competing with the clinical side.

## What it does

Two paths share the same engine.

**Path 1: Find where AI saves you time.** A five-minute conversation surfaces the highest-cost items in a practitioner's week (pre-authorizations, pharmacy callbacks, referral coordination, patient emails, billing), scores each one as `skill`, `plugin`, `agent`, or `human`, and ships the top one as a paste-ready scaffold. Each scaffold works in both Claude Code and OpenAI Codex without hand-editing: a valid `SKILL.md` with frontmatter plus a matching `AGENTS.md` block for skills, a valid `plugin.json` with directory layout for plugins. Each following week, the practitioner receives a workflow audit covering how their active tools performed, what to retire, and what to add. When a public tool would beat what we build, the audit says so.

**Path 2: Help me decide given my constraints.** For business questions AI cannot solve directly (raise prices, cap intakes, expand referrals, hire admin support), the engine runs a five-stage MCDA pipeline. The output names every alternative considered, explains why each was eliminated, gives a confidence band, and surfaces a robust fallback if the user's assumptions shift. The math is real (ELECTRE outranking plus TOPSIS ranking plus sensitivity analysis), but it sits behind a "Show the math" disclosure. The hero metric is always time saved. The math is one click away when the user wants it.

The goal is a decision in 10 minutes that previously took hours of intermittent worry, with an AI tool shipping alongside it.

## Why this matters

Solo practitioners are the segment with the most to gain from AI and the least bandwidth to adopt it. They have no in-house operations function, no consulting budget, and no time to learn agent frameworks between patients. Existing AI tools fail them in two predictable ways: chatbot interfaces give confident answers without provenance (disqualifying in a healthcare-adjacent context), and developer tools require a level of technical fluency most practitioners do not have time to acquire.

Three forces converge to make this the right moment to ship:

1. **Frontier models cleared the reliability threshold.** The bottleneck on real-world value is no longer raw capability, it is the scaffold around the model (skills, plugins, retrieval, memory, agents). Decision Doctor is one of those scaffolds, purpose-built for solo small-business owners.
2. **Compounding starts with the first deployed tool.** AI benefits do not show up as a single moment of insight, they accumulate as workflows automate and compose. A practitioner who ships their first tool in week 1 is six months ahead of one who waits to figure it out.
3. **Adoption follows attention.** Enterprises can spin up AI teams to find use cases. Small business owners cannot. The wedge is to meet them in the work they are already doing (pricing, capacity, admin, referrals, notes) and incorporate AI exactly where their attention already lives.

## How it works

A Next.js 16 mobile-first PWA in front of a five-stage MCDA engine, a Groq inference layer with parsed reasoning, and a Postgres database with row-level security on every user-owned table.

**Engine.** Five discrete stages, each a bounded function that can be audited independently:

- Stage 1: Values elicitation
- Stage 2: Constraints intake
- Stage 3: Weight assignment
- Stage 4: ELECTRE outranking
- Stage 5: TOPSIS ranking with sensitivity analysis

Every recommendation carries a `methodTrace` (visible by default, expandable), a confidence band, three or more `workloadReducers` (the paste-ready artifacts), and an AI feasibility score on each reducer.

**Stack.**

- **Frontend:** Next.js 16, mobile-first PWA, designed at 375px viewport.
- **Inference:** Groq with `reasoning_format: parsed`, ~270ms response, separated reasoning trace.
- **Database:** Neon Postgres with Drizzle ORM. Row-level security is forced on every user-owned table, with a `WITH CHECK` clause on every policy. Multi-tenant-ready schema from day 1 (every user-owned table includes `tenant_id`).
- **Auth:** Better Auth, with both magic link and email/password shipped.
- **Trust posture:** No PHI in v1. Zod rejects any free-form field that could plausibly contain patient identifiers at intake.
- **Rate limits:** 20 decisions per user per day, backed by Upstash.

**Security model.** The system threat-models against OWASP LLM Top 10 plus OWASP Agentic Top 10. Full security report at [`docs/operations/security-best-practices.md`](./docs/operations/security-best-practices.md).

## Where to go next

- **Spec (source of truth):** [`docs/PRD.md`](./docs/PRD.md)
- **Build status:** [`docs/handover/STATUS.md`](./docs/handover/STATUS.md)
- **Decision-science research:** [`Decisio Science Research/`](./Decisio%20Science%20Research/)
- **Worker deployment notes:** [`docs/operations/workers-deploy.md`](./docs/operations/workers-deploy.md)

## Working directory note

`main` is the `decision-doctor-cc` experiment (Claude Code variant 1). Sibling experiments live on their own branches: `cc2` (Claude Code variant 2) and `codex` (Codex variant). The best of the three is promoted.
