// AUTHORED: first-pass draft. Healthcare-wedge content TAGGED for
// clinical-advisor review before P0 ship. See PRD §Open Questions
// and tracking task in .build-loop/followup/.

import type { NewLibraryUseCase } from "@/lib/db/schema";

export const useCases: NewLibraryUseCase[] = [
  {
    scope: "global",
    painPath: "research",
    startingLevel: "prompt",
    title: "Summarize a journal abstract into plain-language takeaways",
    body: `**Problem:** Practitioners want to stay current but rarely have time to read full papers. Abstracts are fast to find but slow to process under time pressure.

**AI capability:** Takes a pasted journal abstract and returns 3-5 plain-language takeaways including what was studied, main finding, and one practical implication — without overreaching into clinical guidance.

**Data needed:** The abstract text (copy-paste from PubMed or journal site). No patient data.

**Guardrails:** AI summarizes; it does not provide clinical guidance. The practitioner interprets relevance to their practice. Not a substitute for full paper review on clinical questions.

**Try this week:** Paste the abstracts of the last five papers you bookmarked and run them through the prompt.`,
    rationale:
      "Abstract summaries reduce the barrier to staying current by eliminating the re-read step. Practitioners already have the abstracts; they just need help extracting the signal.",
    estimatedMinutesSavedPerWeek: 60,
    metadata: {
      tags: ["research", "summarization", "literature", "productivity"],
      firstMetric: "Number of papers reviewed per week",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "research",
    startingLevel: "checklist",
    title: "Set up a weekly specialty literature review checklist",
    body: `**Problem:** Research reading is reactive — practitioners read papers when they happen to see them rather than on a regular schedule, leading to gaps.

**AI capability:** Generates a weekly literature review checklist tailored to a specialty: which sources to check, how many abstracts to review, and when to triage versus read in depth.

**Data needed:** Your specialty and 2-3 sub-specialty topics of interest, preferred sources (e.g. PubMed, specialty society journals), time available per week (e.g. 30 minutes).

**Guardrails:** Checklist is a workflow planning tool. No clinical decisions are AI-assisted. Practitioner uses professional judgment on all findings.

**Try this week:** Ask AI to generate a weekly research checklist for your specialty. Follow it once and note what needs adjustment.`,
    rationale:
      "A structured weekly checklist converts research from reactive to routine. The first version only needs to be good enough to run once; iteration follows.",
    estimatedMinutesSavedPerWeek: 20,
    metadata: {
      tags: ["research", "checklist", "routine", "literature"],
      firstMetric: "Weeks per quarter with at least one structured research review session",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "research",
    startingLevel: "prompt",
    title: "Generate a relevance filter for a list of paper titles",
    body: `**Problem:** PubMed or RSS alerts return dozens of titles per week. Deciding which ones to read takes time and is often skipped, causing the backlog to grow.

**AI capability:** Takes a list of paper titles (and optionally abstracts) and returns a tiered list: "read now", "skim abstract", and "skip for this specialty" — based on the practitioner's stated specialty and interests.

**Data needed:** A pasted list of paper titles (and optionally abstracts). Your specialty and 2-3 focus topics. No patient data.

**Guardrails:** Relevance judgments are suggestions only. The practitioner makes final reading decisions. No clinical prioritization implied.

**Try this week:** Paste this week's PubMed alert results and ask AI to tier them by relevance to your specialty.`,
    rationale:
      "Triage before reading reduces the overhead of staying current from a daily chore to a weekly 10-minute task. This is classification work AI handles well.",
    estimatedMinutesSavedPerWeek: 45,
    metadata: {
      tags: ["research", "triage", "filtering", "reading-list"],
      firstMetric: "Minutes per week spent triaging research alerts",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
  {
    scope: "global",
    painPath: "research",
    startingLevel: "prompt",
    title: "Extract practice-change implications from a clinical guideline update",
    body: `**Problem:** Specialty society guidelines are updated regularly but the changes are buried in long documents. Practitioners often miss practice-relevant updates.

**AI capability:** Reads a pasted guideline section or update summary and returns a short list of "what changed" and "what this might mean for practice" — clearly labeled as a summary, not clinical advice.

**Data needed:** The pasted guideline text or update summary (publicly available, no PHI). Your specialty and current practice context (e.g. solo pediatric practice).

**Guardrails:** Summary is for orientation only. Clinician must read the source document and use professional judgment before changing practice. Output is explicitly not clinical guidance.

**Try this week:** Paste the summary section of the most recent guideline update relevant to your specialty.`,
    rationale:
      "Guideline updates require the same skill as paper summaries but have higher stakes. AI speeds up the orientation step without replacing the clinician's judgment call.",
    estimatedMinutesSavedPerWeek: 30,
    metadata: {
      tags: ["research", "guidelines", "practice-change", "summarization"],
      firstMetric: "Number of guideline updates reviewed within 30 days of release",
      dataReadiness: "high",
      riskLevel: "medium",
    },
  },
  {
    scope: "global",
    painPath: "research",
    startingLevel: "prompt",
    title: "Draft a one-paragraph clinical topic overview for a team meeting",
    body: `**Problem:** Solo practitioners who supervise staff or trainees frequently need to prepare brief topic overviews but lack time to write them from scratch.

**AI capability:** Drafts a one-paragraph, plain-language overview of a clinical topic based on a topic name and focus area. Output is clearly labeled as a starting draft, not a clinical reference.

**Data needed:** Topic name and focus (e.g. "updated screening recommendations for condition X in adult primary care"). No patient data.

**Guardrails:** Draft is a communication aid, not a clinical reference. Clinician reviews and edits before sharing with staff or trainees. Accuracy check required before use.

**Try this week:** Prepare an overview paragraph for the next topic on your team meeting agenda.`,
    rationale:
      "Topic overview drafts are repetitive writing work that AI handles well. The clinician's review step is short, and the time saved on the first draft is meaningful across a busy schedule.",
    estimatedMinutesSavedPerWeek: 35,
    metadata: {
      tags: ["research", "education", "writing", "team-communication"],
      firstMetric: "Hours per month spent preparing internal educational content",
      dataReadiness: "high",
      riskLevel: "low",
    },
  },
];
