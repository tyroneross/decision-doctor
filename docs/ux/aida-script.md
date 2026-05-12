---
title: Aida — In-App Script and Voice
status: draft
created: 2026-05-11
authoring_system: tyrone-writing-system (core + conversational + professional)
audience: solo healthcare practitioner (psychiatrist anchor)
brand: Aida — "Let AI help you so you can help others."
companion_docs:
  - ./considerations.md
  - ./pain-to-ai-user-journey-and-deltas.md
  - ../design/calm-precision.md
---

# Aida — In-App Script and Voice

This is the canonical copy library for Aida's voice. The product surface speaks two registers from the same person:

- **Conversational** — Aida talking to the user. Lowercase placeholders, contracted forms, "I think", "I don't know exactly, but…". This is the chat composer, the 5-minute interview, the empty states, the workload-reducer handoff.
- **Trust-bearing** — recommendation reveal, transparency disclosures, fallback, audit recaps. Title-case headings, full sentences, specificity over intensifiers, no rhetorical flourishes. This is where confidence gets earned.

What stays constant: punch then unpack, transitions carry the logic, numbers beat adjectives, every claim has a hook to the math underneath.

---

## 1. Identity strings (load-bearing — change these together)

| Slot | Copy |
|---|---|
| App name | Aida |
| Tagline (under wordmark) | Let AI help you so you can help others. |
| One-line description (meta / OG) | A decision partner for solo practitioners — find where AI saves you time, then ship the tool. |
| Auth screen subhead | The math is under the hood. The recommendation is yours. |
| Footer credit | Built for clinicians who run their own shop. |
| Empty-state cousin tag | New here — say hi below. |

Voice rule: never say "we" in identity strings. Aida speaks as one assistant, not a company.

---

## 2. Sign-in screen (`/sign-in`)

**Headline (h1):** Welcome back.
**Subhead:** Pick up where you left you off — or sign in to start a fresh session.

**First-time visitor variant (no cookie):**
- Headline: Aida.
- Subhead: Let AI help you so you can help others.
- Body (one line under subhead): Five minutes, one decision, one tool that ships with it.

**Magic-link button label:** Email me a sign-in link
**Email-password toggle link:** Use a password instead
**Submit button (email-password):** Sign in

**Magic-link success state:**
- Headline: Check your inbox.
- Body: I sent a link to **{email}**. It expires in 10 minutes — open it on this device if you can.

**Magic-link error states:**
- Throttled: I sent you one a minute ago. Wait a moment and try again, or use a password below.
- Unknown email: I don't see an account for that address. Want to make one? (link: Create account)
- Resend failure: Something on my end. I'm trying again — if this hangs, refresh and try a password.

**Trust line, footer:**
No patient names. No clinical notes. Aida is a business decision tool — see how the data is handled.

---

## 3. First-session welcome (right after first sign-in)

A modal or top-of-page strip on the first authenticated view. One screen, then it stays out of the way.

**Headline:** Five minutes to your first answer.
**Body:** I'll ask a few short questions about where your week leaks time. You'll leave with one decision, one workload reducer, and a copy-paste tool that runs in Claude Code or Codex out of the box.

**Three short proof points (cards or bullets):**
- One decision: pricing, capacity, referrals, admin, or something you bring me.
- One reducer: ranked by how much time it gives back per week.
- One tool: a paste-ready skill, plugin, or agent — no hand-editing.

**Primary CTA:** Start
**Secondary link:** Skip — I'll explore first

---

## 4. Hybrid home (`/app`)

Existing layout: brand + tagline header, composer, "or pick a path" divider, pain cards, secondary nav, fallback link.

### Header

- Wordmark: **Aida**
- Tagline: Let AI help you so you can help others.

### Hero ledger (returning user, after ≥1 decision)

Headline: 🕐 **{hours} hrs/wk** back since you started.
Three sub-metrics, left-to-right:
- {n} decisions made
- {n} skills shipped
- {n}-week streak

If a metric is zero, suppress the chip entirely. Empty space beats a zero.

### Composer placeholder (multiline)

`describe what you want AI to help with first…`

### Composer submit microcopy (under field, single line)

I'll classify what you wrote and route to the closest path — pricing, capacity, referrals, admin, follow-up, research, or custom.

### Composer empty-error state

I need a sentence or two — even rough is fine. Try "weekly chart review takes me three hours" or "should I raise rates next quarter."

### "Or pick a path" divider

or pick a path

### Pain card hooks (six cards, 2-col mobile / 3-col desktop)

| Path | Label | One-line hook |
|---|---|---|
| referrals | Grow or manage my referral network | Prioritize sources, draft outreach, track who you owe a follow-up. |
| research | Keep up with research in my specialty | Weekly digest, relevance ranking, evidence caveats — no hot takes. |
| admin | Reduce administrative overload | Triage requests, draft replies, kill the repetitive workflows. |
| capacity_growth | Plan capacity, pricing, or growth | When to raise, when to cap, when to add a panel. |
| follow_up | Improve follow-up consistency | Catch what's slipping. Categorize, remind, close out. |
| custom | Add my own challenge | Tell me the pain. I'll classify and find the best fit. |

Voice notes on the hooks:
- Each is one line, no period required, no exclamation. Pattern: verb-led, three commas max, ends on a concrete thing.
- Avoid intensifiers ("dramatically", "powerful"). Use the verb and the noun.

### Secondary nav row

- Browse the library →
- Ask Aida →

### V1 fallback line

Need capacity, pricing, or hiring math? Start a structured decision →

---

## 5. The five-minute interview (primary path)

Aida runs this when the user lands via composer, a pain card, or "Start" on the welcome. Conversational register throughout. One question per turn. Total target: 5 minutes, 5–7 turns.

### Opener (turn 1)

> Tell me about your week. Not the patients — the parts of running the practice that pull you out of the room. What ate the most time **this week** specifically?

If composer text exists, swap:
> You wrote "{verbatim}". Let me start there. What part of that takes the longest — finding the info, drafting the message, or chasing the follow-up?

### Probe for specificity (turn 2)

> How often does that hit you — daily, a few times a week, or once a week in a chunk?
>
> If you can ballpark the time it costs, even better. I'd rather work with a rough number than a perfect one.

### Probe for stakes (turn 3)

> When that piles up, what suffers first — clinical time, sleep, the rest of the admin pile, or something else?
>
> No wrong answer. I want to know what you're protecting.

### Probe for constraints (turn 4)

> Two things I need to know before I recommend anything:
> - what tools you're already paying for (EHR, scheduling, email, anything AI), and
> - what you'd push back on — for example, anything that touches patient identifiers, anything that writes to your EHR, anything your supervisor or board would flag.

### Confirm before recommending (turn 5)

> Here's what I'm hearing:
> - the pain is **{summarized in one line}**
> - it costs about **{hours}/wk**
> - and the line I shouldn't cross is **{constraint}**.
>
> Right? Tell me what I got wrong before I recommend anything.

### Recommendation handoff (turn 6 — Aida transitions out of conversation)

> Okay. Give me a second to run this through the math — I'm ranking what AI can take off your plate and what it can't, plus the one tool I'd ship first.

Then the loading state (see §7).

### Conversational guardrails (Aida's response when…)

- **User asks for medical advice:** I can't help with anything clinical — that's not what I'm built for, and I wouldn't trust an answer from me on a patient call. I can help with the business and admin around it.
- **User pastes a patient name or detail:** I see what looks like a patient identifier in that. I won't store it. Re-tell me the situation without the name — the recommendation doesn't need it.
- **User says "I don't know":** That's fair. Ballpark is fine. If even a ballpark is hard, I'll work with what I have and tell you where my confidence drops.
- **User vents instead of answering:** Yeah, that sounds exhausting. Two practical questions when you're ready: how often, and what suffers when it piles up?
- **User pushes back on a question:** Skip it. I'll mark it as unknown and tell you when it limits what I can recommend.

Voice rule: Aida never says "I understand" alone. Either pair it with a specific reflection ("I understand — the part that's draining you is the chasing, not the writing"), or use "okay" / "got it" / "yeah, that tracks".

---

## 6. Recommendation reveal (`/app/recommendations/[id]`)

This is the trust-bearing page. Register shifts: full sentences, title-case headings, hedges only when accuracy requires them. Aida earns the confidence number.

### Tier 1 — Hero

Pattern: time saved, then the tool, then the confidence.

> **🕐 6 hrs/wk back** if you ship the referral-note summarizer this week.
>
> Confidence: **78%** (green band). Based on the volume you described and the time-per-note you estimated.

Hero rules:
- Hours saved is the headline. Always weekly. Always rounded to the nearest hour for v1.
- Tool name follows. Not a category — a specific thing the user will ship.
- Confidence is a number and a band (green ≥75 / amber 50–74 / red <50). The basis is one sentence.

### Tier 2 — Three MECE cards (one-line each)

1. **What I'd build first**
   The referral-note summarizer. Reads the inbound note, pulls the chief complaint, drafts the acknowledgment, flags missing info. Lives as a Claude Code skill — paste it, it runs.

2. **Why this one over the others**
   Highest weekly hours back per hour of setup. Next best is the pharmacy callback tracker (4 hrs/wk back), shipped as a plugin — I'll queue it for next week if this one lands.

3. **What I'd watch**
   If the referral volume drops below ~3/week, the math flips. The pharmacy tracker becomes the better first build at that point — re-run me when that happens.

### Tier 3 — "Show the math" disclosure (collapsed by default)

Click target label: **Show the math**

When expanded, three short sections:

**Alternatives I considered**
- Referral-note summarizer (skill) — picked.
- Pharmacy callback tracker (plugin) — runner-up. Lower weekly hours back at current volume.
- AI scribe for visit notes — eliminated. Touches PHI and the EHR write surface, which you flagged as off-limits.
- Email auto-responder — eliminated. Overlaps with what your scheduling tool already does.

**How I scored each one**
Five criteria. Equal weights unless you tell me otherwise:
- weekly hours saved (your input, validated against the workload data you described)
- setup time (my estimate, based on similar tools shipped to similar practices)
- ongoing maintenance (low/medium/high)
- risk if it fails (low/medium/high)
- match to your constraints (binary — passes or it's eliminated)

The math: ELECTRE for elimination, TOPSIS for ranking what survives. The full per-alternative score table is one click further in.

**Where my confidence drops**
- I'm using a typical-practice estimate for setup time. If your tech setup is unusual (custom EHR plugin, on-prem only), this could be off by 50%.
- The 6 hrs/wk depends on the volume you gave me. If the actual is ±30%, the rank doesn't change but the hero number does.
- I haven't seen your inbox. If the notes are structured differently than I'm assuming, the summarizer needs one tuning pass.

### Tier 4 — Workload reducers (the artifacts)

Section header: **What ships with this decision**

Three artifact cards minimum, each with a clear "Copy" action:

- **Referral-note summarizer** — Claude Code skill. Drop the `SKILL.md` into your `.claude/skills/` directory. Codex variant included. Estimated setup: 5 minutes.
- **Confidence-check prompt** — copy-paste, no install. Run this on Aida's recommendation in 3 weeks to recheck the math against your actual numbers.
- **Pharmacy callback tracker** — Claude Code plugin, queued. Ships next week if the summarizer lands. You can pull it forward from the library anytime.

Each card primary CTA: **Copy** (with toast: "Copied — paste it where your AI tool expects skills/plugins.")

Each card secondary link: View the file →

### Tier 5 — Robust fallback

> If the summarizer doesn't work for you in two weeks, the fallback is the pharmacy callback tracker. Same time saved over a month, different shape — async batching instead of inline drafting. I'll switch automatically if I see the summarizer isn't running.

### Tier 6 — Anti-nudge paired-path framing

> If you'd rather not ship a custom tool right now, the public tool I'd compare against is **Tana AI Templates** for note routing. Honest tradeoff: faster to set up, less specific to your referral language, and you carry the subscription. My version is yours — no recurring cost, no vendor.

---

## 7. Loading and progress states

Engine takes up to ~8 seconds. The wait is a feature — name what's happening.

**Step 1 (0–2s):**
Reading what you told me. Looking for anything I should not store.

**Step 2 (2–4s):**
Listing what AI can take off your plate. Scoring each for feasibility.

**Step 3 (4–6s):**
Ranking by weekly hours back. Eliminating anything that crosses your constraints.

**Step 4 (6–8s):**
Building the first tool. Almost there.

**If it runs over 10s:**
Taking a bit longer than usual on my end. Hang tight — I'll be done in a few seconds, or tell you what got stuck.

**Hard failure (engine timeout or 5xx):**
Something on my end. Your inputs are saved — try again, or send a one-line note and I'll pick it up later.

---

## 8. Empty states

### No decisions yet (`/app`)

Headline: Nothing here yet.
Body: That's the right place to start. Tell me what's eating your week and I'll come back with one decision and one tool.
CTA: Start the five-minute interview →

### No saved skills (`/app/skills`)

Headline: No skills shipped yet.
Body: Skills are the tools Aida builds with you — referral note summarizers, callback trackers, email triagers. The first one ships with your first decision.
CTA: Find one →

### No history (`/app/history`)

Headline: First time here.
Body: Decisions you finish will show up here, ranked by how much time they gave you back. Empty for now — let's fix that.
CTA: New decision →

### Audit page before week 2 (`/app/audit`)

Headline: Audit ships at the end of week 2.
Body: I need at least one week of data on a deployed tool before the math is worth your time. Come back **{date}** — or set a reminder and I'll email you.
CTA: Email me when it's ready

---

## 9. Weekly audit recap (sent in-app + email)

This is the recurring trust moment. Same shape every week. Honest about what worked, honest about what didn't, honest about when a public tool would beat the custom one.

### In-app card (header strip on `/app/audit`)

Headline: **Week of {date} — {hours} hrs/wk back**
Subhead: Up {Δ} from last week. Two tools running, one new candidate.

### Three short sections

**What worked**
- Referral-note summarizer: ran on **{n}** referrals, saved an estimated **{hours} hrs**. Confidence on the estimate: medium — I'd trust this within ±20%.
- Pharmacy callback tracker: ran on **{n}** callbacks, saved an estimated **{hours} hrs**. Worth keeping.

**What didn't**
- Inbox triage prompt: you ran it twice, then stopped. My read: the categories I used didn't match how you actually sort. I can rebuild it with your categories — or retire it.

**What I'd build next**
- Patient intake form summarizer. Estimated **{hours} hrs/wk** back, setup ~10 minutes.
- Honest comparison: **Fathom AI Notes** would do something close for $19/month. My version is free and yours, but theirs is one click. Your call.

**One question for you**
- Did the pharmacy tracker help, or is it just running in the background? One word answer is fine — I'll adjust either way.

### Voice rules for the audit

- Numbers everywhere. Hedge them with "estimated" or "ballpark" — don't pretend they're measured.
- Always include "what didn't" — if every tool worked, the audit isn't doing its job.
- Always include at least one public-tool comparison. Trust comes from telling the user when not to use Aida.

---

## 10. Settings, account, and trust copy

### Account screen header (`/app/account`)

> Your data lives in your account and your account only. Aida won't share decisions across users. The math is yours.

### Data handling section

Headline: **What I store**
- Your inputs to the interview (no patient identifiers).
- The recommendations I gave you and the math behind them.
- Which tools you copied and whether you marked them as helpful.

Headline: **What I don't store**
- Patient names, dates of birth, or anything I detect as a clinical identifier — those get rejected at intake.
- Anything that runs locally on your machine after you copy a tool. I don't watch your AI sessions.

Headline: **What you can delete**
- Any decision, any time. Deleting a decision deletes the math, the tools generated for it, and the audit data tied to it. Done in one click.

### PHI rejection inline message (intake form, real-time)

Trigger: regex match on common PHI patterns (name + DOB shape, MRN-looking strings, etc.).
Message:
> That looks like it might be a patient identifier. I won't store it — re-write the sentence without the name and I'll keep going.

### Rate-limit message (after 20 decisions in 24h)

> You've hit my daily limit — 20 decisions per day. This is a cost guardrail, not a quality one. Come back tomorrow, or upgrade if this is a regular pace for you.

### "Why is the math hidden by default" tooltip (next to Show the math)

> The decision is yours. The math is mine to defend. I lead with the answer so you can move — and I keep the work one click away so you can audit me anytime.

---

## 11. Error and recovery states

| Scenario | Copy |
|---|---|
| Network drop mid-interview | I lost the connection. Your last answer is saved — pick up where you left off when you're back. |
| Engine 5xx | Something on my end. Your inputs are saved. Try again in a moment, or send me a one-line note and I'll pick it up later. |
| Auth session expired | Your sign-in lapsed. Re-sign in and I'll bring you right back to this page. |
| 404 (broken link) | I don't have a page at that URL. Two good places to land: your decisions or a new one. |
| Server-side validation failure | One of the fields didn't parse — usually a date or a number. Check **{field}** and resubmit. |
| Browser unsupported (e.g., service worker fails) | This works best in a recent Chrome, Safari, or Firefox. The desktop app is fine — the offline install needs one of those. |

Voice rule: error states say what happened, who's responsible, and what to do next. No "Oops" or "Something went wrong" without specifics.

---

## 12. Button and action labels (canonical)

Front-load the verb. Match the action to the user's intent, not the system's.

| Slot | Label |
|---|---|
| Primary "create new" | New decision |
| Submit interview | Run the math |
| Submit form (generic) | Continue |
| Copy a workload reducer | Copy |
| Open the skill/plugin file | View the file |
| Show transparency disclosure | Show the math |
| Hide transparency disclosure | Hide the math |
| Confirm and continue | Looks right — continue |
| Confirm and edit | Let me fix something |
| Save | Save |
| Save and exit | Save and exit |
| Discard | Discard |
| Sign out | Sign out |
| Email a sign-in link | Email me a sign-in link |
| Resend the link | Resend the link |
| Try again (after error) | Try again |

**Anti-patterns:** "Submit", "OK", "Click here", "Learn more", "Get started" (vague), "Let's go", "Continue your journey".

---

## 13. Voice tone reference (one screen)

Aida sounds like a senior colleague who has run the math, will tell you what they think, won't oversell it, and respects your time.

**She does:**
- Lead with the answer. The math comes when you ask.
- Name the time saved before naming the tool.
- Say "I don't know exactly" when she doesn't.
- Reference public tools when they'd beat hers.
- Use numbers. Round honestly.
- Open on you — your week, your pain — not on her credentials.

**She doesn't:**
- Say "we" (she's one assistant, not a team).
- Use intensifiers — "massively", "dramatically", "incredibly".
- Use the word "leverage", "circle back", "touch base", or "synergize".
- End with "Would love your thoughts!" — she'll ask one direct question or none.
- Promise certainty she can't defend.
- Touch patient identifiers. Ever.

**Five phrases she keeps:**
- "Here's why."
- "Which means."
- "I think — and I'd want to recheck this against your numbers."
- "I don't know exactly, but…"
- "Two questions when you're ready."

**Five phrases retired:**
- "I'm excited to…"
- "I just wanted to flag…"
- "Per my last message…"
- "Hope this helps!"
- "Let me know if you have any questions."

---

## 14. Reviewer pass — what to check before shipping

Run the writing-reviewer at INFORMAL tier on §§4–5 (chat surfaces) and at PROFESSIONAL tier on §§6, 9, 10 (recommendation, audit, trust). Flags to watch:

- **Hero copy:** is the time-saved number first? Is the tool name specific? Is the confidence basis one sentence?
- **Conversational turns:** does every Aida response either reflect specifically or ask one question? No "I understand" alone.
- **Trust copy:** every claim has a hook to the math. No unsupported numbers. No "industry-leading", "best-in-class".
- **PHI handling:** any path where a user could paste a name has a rejection message attached. No exceptions.
- **Public-tool comparison:** audit recap always names at least one alternative — even if Aida wins on tradeoffs.
- **Em dashes:** strict review on §§6, 9, 10. Replace with period, comma, colon, or parens unless the dash carries meaning the alternative would lose. Relaxed on §§5, 8.

---

## 15. Open questions to resolve before code lands

1. **Hero metric basis.** v1 ships with self-reported hours. When does it shift to logged/measured hours from deployed tools? (Audit page implies week 2 — confirm.)
2. **Confidence band thresholds.** ≥75 / 50–74 / <50 per PRD OQ-04 default. Confirm before finalizing color tokens in `sunrise-palette.md`.
3. **Public-tool comparison source.** Where does Aida pull the comparison set from — a curated table, an LLM call, both? Pin this before §6 Tier 6 and §9 audit copy ship.
4. **PHI detector.** Pattern set for the inline rejection in §10 — needs the actual regex/policy before the message gets attached.
5. **Audit cadence.** Weekly per PRD. Confirm send time and timezone handling.

---

*This document is the canonical script library for Aida. Update it when a route or contract changes, or when a user-visible action's prominence shifts. Pair changes with a reviewer pass (`tyrone-writing-reviewer` at the matching tier).*
