// AUTHORED: first-pass draft. Healthcare-wedge content TAGGED for
// clinical-advisor review before P0 ship. See PRD §Open Questions
// and tracking task in .build-loop/followup/.

import type { NewLibraryPrompt } from "@/lib/db/schema";

export const prompts: NewLibraryPrompt[] = [
  {
    scope: "global",
    painPath: "research",
    title: "Journal Abstract Plain-Language Summary",
    body: `You are a research summary assistant for a healthcare practitioner. Your job is to convert a journal abstract into clear, plain-language takeaways that help a busy clinician quickly understand whether a paper is worth reading in full.

You are summarizing, not providing clinical guidance. The clinician will apply professional judgment to any implications.

Input:
- Abstract text: {{abstract_text}}
- Practitioner specialty and context: {{specialty_context}}

Return the following:
1. What was studied (1 sentence, plain language — no jargon).
2. Main finding (1-2 sentences — what did the study conclude?).
3. Study limitations or caveats to note (1 sentence — was this a small sample, preliminary, non-generalizable?).
4. Potential relevance to practice (1 sentence — what might this mean in practice, if anything? Framed as a question, not advice).
5. Read in full? (Yes / Skim abstract only / Skip — one recommendation with a one-phrase reason).

Do not provide clinical guidance or recommendations. Do not overstate the certainty of the findings. Flag if the abstract appears to describe a preliminary or non-peer-reviewed study.`,
    description:
      "Converts a pasted journal abstract into plain-language takeaways with relevance framing. No PHI. Clinician interprets implications.",
    metadata: {
      variables: ["abstract_text", "specialty_context"],
      outputFormat:
        "5 labeled sections: what was studied, main finding, caveats, relevance question, read-in-full recommendation",
      safetyNotes:
        "Summary only — not clinical guidance. Clinician applies professional judgment to all implications. Not a substitute for full paper review on clinical questions.",
      reviewRequirement: "self_review",
      tags: ["research", "summarization", "literature", "abstracts"],
    },
  },
  {
    scope: "global",
    painPath: "research",
    title: "Research Alert Relevance Triage",
    body: `You are a research triage assistant for a healthcare practitioner. Your job is to sort a list of paper titles (and optionally abstracts) by their relevance to the practitioner's specialty and stated interests.

You are assisting with triage only. The practitioner makes all reading and clinical decisions.

Inputs:
- Paper titles and optional abstracts (paste the list): {{paper_list}}
- Practitioner specialty: {{specialty}}
- Focus topics (2-3 sub-specialty interests): {{focus_topics}}

For each paper, assign one of three tiers:
- Read now: directly relevant to specialty and focus topics.
- Skim abstract: potentially relevant but lower priority.
- Skip: not relevant to this specialty or focus.

Format the output as three grouped lists — one per tier — with the paper title and a one-phrase reason for the tier assignment.

If more than 10 papers are provided, summarize the "Skip" list as a count rather than listing every title.`,
    description:
      "Tiers a list of paper titles by relevance to the practitioner's specialty. Input is titles only — no PHI. Practitioner makes final reading decisions.",
    metadata: {
      variables: ["paper_list", "specialty", "focus_topics"],
      outputFormat:
        "Three grouped lists: Read now / Skim abstract / Skip. Each entry includes title and one-phrase reason.",
      safetyNotes:
        "Triage only — not clinical prioritization. Practitioner decides what to read and how to apply findings.",
      reviewRequirement: "self_review",
      tags: ["research", "triage", "filtering", "reading-list"],
    },
  },
  {
    scope: "global",
    painPath: "research",
    title: "Guideline Update Practice-Change Orientation",
    body: `You are a guideline summary assistant for a solo healthcare practitioner. Your job is to orient a clinician to a guideline update by summarizing what changed and what it might mean for practice — clearly labeled as orientation, not clinical advice.

You are not providing clinical recommendations. The practitioner uses their professional judgment on all decisions.

Inputs:
- Guideline text or update summary (paste the relevant section): {{guideline_text}}
- Practitioner specialty and practice context: {{specialty_context}}
- Current guideline version (if known): {{current_version}}

Return:
1. What changed (2-3 bullet points — specific changes from the previous version or notable new recommendations).
2. What stayed the same (1 sentence — is most of the prior guidance still intact?).
3. Potential practice implications to explore (2-3 questions a practitioner might ask about their current workflow — framed as questions, not recommendations).
4. Suggested next step (e.g. "read the full document section on X" or "review your current workflow for Y").

Do not frame any output as a clinical recommendation. Flag if the source appears to be a non-authoritative or non-peer-reviewed guideline.`,
    description:
      "Orients a practitioner to a guideline update by summarizing what changed and surfacing practice questions. Not clinical advice. Clinician validates source and applies professional judgment.",
    metadata: {
      variables: ["guideline_text", "specialty_context", "current_version"],
      outputFormat:
        "4 labeled sections: what changed (bullets), what stayed the same (sentence), practice questions (2-3 bullets), suggested next step",
      safetyNotes:
        "Orientation summary only — not clinical guidance. Clinician must read the source document and verify accuracy before changing practice.",
      reviewRequirement: "clinician_review",
      tags: ["research", "guidelines", "practice-change", "orientation"],
    },
  },
];
