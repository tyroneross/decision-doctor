# UI Content Design Reference

A research-grounded guide for constructing effective sentences, words, and content structures in web and mobile interfaces. Optimized for comprehension speed and minimal cognitive load.

**Source basis:** Speech Act Theory (Austin/Searle), Systemic Functional Linguistics (Halliday), Cohesion in English (Halliday/Hasan), Rhetorical Structure Theory (Mann/Thompson), Linguistics of Punctuation (Nunberg), Register Variation (Biber), LIWC (Pennebaker), syntactic stylometry research.

---

## How to use this doc

Apply the decision stack top-down for any UI element. Each layer answers a specific question; skipping layers is what produces unclear copy. The element-type matrix tells you the structural defaults; the principles tell you when to deviate.

---

## Six universal principles

### 1. One nucleus per unit (RST)
Every UI element has a single core message. Satellites — context, justification, elaboration — earn their place only if the nucleus alone is unclear. Headlines, CTAs, and errors are nucleus-only by default.

### 2. Match grammatical mood to speech act (Austin/Searle)
Directives use imperatives ("Save changes"). Assertives use declaratives ("Your file is saved"). Expressives stay short ("Welcome back"). "You can save your changes" is structurally an assertive when the user needs a directive — that mismatch creates friction.

### 3. Front-load the theme (Halliday textual metafunction)
The first two or three words of any element carry disproportionate weight in scanning. What's thematic should be what's diagnostic. "Pay $42.90 now" beats "Now you can pay $42.90."

### 4. Minimize cohesive load (Halliday/Hasan)
Pronouns and references work in flowing prose but break in scannable UI where elements are encountered out of order. Repeat the noun. Avoid "this" and "it" across element boundaries.

### 5. Match register to context (Biber)
Settings, onboarding, marketing surfaces, system messages, and error states are different registers. The same word ("Continue") reads urgent in checkout, neutral in a wizard, and formal in admin. Pick register first, then phrase.

### 6. Punctuation as structural signal, not decoration (Nunberg)
Each mark encodes a specific relation: periods chunk, colons elaborate, semicolons coordinate equal-weight clauses. In UI, the period is the cleanest cue. Cut semicolons entirely. They carry load that prose absorbs but UI cannot.

---

## Decision stack

Apply per element, in order. Most copy fails at layers 1–3.

| Layer | Question | Research basis |
|---|---|---|
| 1. Intent | What act is this performing? | Speech act theory |
| 2. Structure | What's the nucleus? Are satellites needed? | RST |
| 3. Cohesion | How does this link to surrounding elements? | Halliday/Hasan |
| 4. Sentence form | Subject-verb proximity, subordination depth | Syntactic stylometry |
| 5. Word choice | Concrete vs abstract, pronouns, function-word density | LIWC |
| 6. Punctuation | Which mark signals the right relation? | Nunberg |
| 7. Fit | Does it work in available space and scan pattern? | UX constraints |

---

## Element-type matrix

Defaults for the most common UI elements. Deviate only when the principles call for it.

| Element | Speech act | Structure | Length target | Grammatical form |
|---|---|---|---|---|
| Page headline | Assertive | Nucleus only | ≤ 8 words | Declarative |
| Section subhead | Assertive | Nucleus | ≤ 12 words | Declarative or noun phrase |
| Body paragraph | Assertive + elaboration | Pyramid: point → support | 1–3 sentences | Mixed |
| Primary CTA | Directive | Nucleus | 1–3 words | Imperative verb |
| Secondary CTA | Directive | Nucleus | 1–3 words | Imperative verb |
| Error message | Assertive + directive | What happened → what to do | 1–2 sentences | Declarative + imperative |
| Success message | Expressive | Nucleus | ≤ 8 words | Declarative |
| Empty state | Assertive + directive | What's here → what to do | 1 sentence each | Declarative + imperative |
| Input label | Nominal | Noun phrase | 1–3 words | Noun phrase |
| Helper text | Assertive | Constraint or example | ≤ 12 words | Declarative |
| Tooltip | Assertive (elaborative) | Satellite only | ≤ 20 words | Declarative |
| Notification | Varies | Nucleus first | ≤ 50 char title, ≤ 120 char body | Matches act |
| Confirmation dialog | Directive (with stakes) | Consequence → action | 1 sentence + buttons | Declarative + imperative |
| Onboarding step | Assertive + directive | Value → action | 1–2 sentences | Declarative + imperative |

---

## Spatial and cognitive constraints

### Mobile (~375 px viewport)
- Body copy: 35–50 characters per line
- Minimum body size: 16–18 px
- Button labels: under 20 characters to prevent wrapping
- iOS lock-screen notification titles truncate around 50 characters
- One thought per line for primary CTAs

### Web
- Body copy: 50–75 characters per line is the readability sweet spot (Bringhurst)
- Scan pattern: F-pattern on content pages, Z-pattern on landing pages
- Front-load value into the first two or three words of headlines and bullets

### Working memory
- Cap discrete items at four per group (Cowan, not Miller's 7±2)
- Numbered lists when sequence or count carries meaning
- Bullets when items are interchangeable
- Group related items; whitespace separates groups more reliably than headers

---

## Cohesion rules for UI

Halliday/Hasan's five cohesive devices behave differently in UI than in prose. Adapted defaults:

| Device | Use in UI |
|---|---|
| Reference (pronouns) | Avoid across elements. Repeat the noun. |
| Substitution ("one," "do so") | Avoid. Be explicit. |
| Ellipsis | Acceptable in labels and bullets; never in errors or CTAs. |
| Conjunction | Use sparingly. Period > "and." Colon > "because." |
| Lexical reiteration | Preferred. Same noun for same concept across screens. |

---

## Punctuation in UI (Nunberg-grounded)

| Mark | Signal | Use in UI |
|---|---|---|
| Period | Chunk boundary | Default. Use it. |
| Colon | Elaboration follows | Labels with values: "Status: Active" |
| Semicolon | Equal-weight clauses | Cut entirely. |
| Em dash | Aside or interruption | Cut from microcopy. Acceptable in long-form content. |
| Comma | Coordination, listing | Use for lists; avoid in CTAs and headlines. |
| Question mark | Interrogative | Confirmation dialogs only. |
| Exclamation | Expressive emphasis | Success states only, sparingly. |

---

## Always

1. Lead with the nucleus
2. Repeat nouns across UI boundaries instead of using pronouns
3. Match grammatical mood to intent
4. Use periods to chunk; cut semicolons
5. Prefer specific nouns to abstract ones ("3 unread messages" beats "new activity")
6. Front-load diagnostic words in the first two or three positions
7. Cap groups at four items
8. Pick register before phrasing

## Never

1. Bury the action in subordination ("To complete the process, you may want to click...")
2. Use cohesive references across non-adjacent elements ("this" pointing offscreen)
3. Mix registers within an element
4. Pad CTAs with politeness ("Please continue" → "Continue")
5. Use ornamental punctuation in UI copy
6. Use "you can" when the user needs a directive
7. Lead with context before the point in errors or alerts
8. Use abstract category words when a concrete count or noun is available

---

## Worked examples

**Error message — before and after**

Before: "Something went wrong. Please try again later or contact support if the problem persists."
- Speech act: vague (assertive without specifics)
- Nucleus: missing
- Cohesion: "the problem" is a weak reference

After: "Payment failed. Check your card details or try a different card."
- Speech act: assertive + directive, in that order
- Nucleus: "Payment failed"
- Concrete next action

**CTA — before and after**

Before: "Click here to save your changes"
- Buries the verb; "Click here" is meta-instruction
- 5 words

After: "Save changes"
- Imperative verb leads
- 2 words

**Empty state — before and after**

Before: "It looks like you don't have any projects yet. Why not create one?"
- Pronoun "one" with no clear referent in scannable view
- Hedged directive

After: "No projects yet. Create your first project."
- Two nuclei, each its own sentence
- Concrete directive

---

## Operationalizing this

Two paths to push this further:

1. **Content design system.** Tie each component in Figma or Storybook to its speech act, structure, and length budget. Writing decisions get made at design time, not in review.
2. **Linter.** The element-type matrix is structured enough to enforce programmatically. Combine regex (length, punctuation, banned phrases) with a small LLM check (mood match, nucleus presence) per component type.

---

## Reference: research anchors

| Framework | Source | Application |
|---|---|---|
| Speech act theory | Austin (1962), Searle (1969) | Match grammatical mood to user intent |
| Systemic Functional Linguistics | Halliday (1985) | Theme position, interpersonal stance |
| Cohesion in English | Halliday & Hasan (1976) | Inter-element linking |
| Rhetorical Structure Theory | Mann & Thompson (1988) | Nucleus-satellite element design |
| Linguistics of Punctuation | Nunberg (1990) | Punctuation as structural signal |
| Register variation | Biber (1988) | Context-appropriate phrasing |
| LIWC | Pennebaker | Concrete vs abstract word choice |
| Working memory | Cowan (2001) | Group-size limits |
