# Persona — Dr. Henry "Hank" Larsson

## Profile

- 62M, solo pediatrician, 32 years in practice
- Rural Wisconsin, took over his father's clinic, ~40 kids/week (Medicaid, BCBS, Tricare)
- Some notes still on paper. EHR: athenaPractice.
- **Types slowly with two fingers.** Outlook on Windows desktop. iPhone for pictures + texts.
- Forgot his WhatsApp password.
- **AI proficiency: NONE.** Knows AI exists; never used it.
- **Tech proficiency: VERY LOW.** Plain-spoken, mildly grumpy, suspicious of "tech terms."

## Source of brief
Nurse practitioner said: "considering hiring a second clinician versus capping new patients versus retiring in 18 months instead of 36."

## Pre-fix template-flow run (intuitiveness 5/10)
- Loved: PHI-safety line ("my malpractice carrier would care"), real print dialog, plain template names
- **KILL-SHOT:** typed `$18,000` (monthly), engine echoed `"Minimum income floor of $18,000 per year."` — *would not act.* (*Fixed in 6954e42 — engine system prompt requires unit-correct echoback; range slider in capacity for uncertainty.*)
- Other: persona-leak ("solo therapist" sent to a pediatrician), "Stage 4" undefined, "T1" pill meaningless, 10-second silent wait

## Open chat-flow questions
- Will he type at all, or freeze on the empty textarea?
- His decision is multi-part (hire / cap / retire timeline) — does the router pick `structured_enumerable` or `values_dominant`? Both are plausible.
- Does the 3-chip mode clarifier feel patronizing or like progress?
- Does he understand the difference between "Choosing between specific options" and "Weighing a values question"?
