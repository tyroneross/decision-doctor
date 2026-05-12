# Prompting Best Practices for Healthcare AI Workflows

## Executive Summary

Good prompts do not try to make the model clever. They make the task, context, constraints, output format, and review standard explicit. For healthcare-adjacent admin work, the safest baseline is to remove PHI, give narrow context, ask for structured output, and require uncertainty labels plus practitioner review.

***

## The Core Mental Model

A prompt is a brief, not a spell.

The model needs to know:

- **Role:** what kind of assistant it should act as.
- **Task:** the one job it should complete.
- **Context:** the relevant background, not the whole file cabinet.
- **Inputs:** the exact material it should use.
- **Constraints:** what it must avoid, especially PHI, clinical advice, unsupported claims, and invented facts.
- **Output:** the shape, length, sections, tone, and format you want back.
- **Review standard:** how the user should check the answer before using it.

If any of those pieces are missing, the model fills the gap with its own assumptions.

## A Simple Prompt Frame

Use this structure when building a prompt from scratch:

```text
You are a [role] for a solo healthcare practice.

Your job is to [one task].

Context:
- [Relevant background]
- [Audience or workflow]

Inputs:
- [Paste or describe the source material]

Constraints:
- Do not include patient names, dates of birth, MRNs, addresses, or other identifiers.
- Do not provide clinical diagnosis, treatment advice, legal advice, or compliance guarantees.
- If information is missing, say what is missing instead of guessing.

Return:
1. [Section 1]
2. [Section 2]
3. [Section 3]

Before finalizing, check whether the output uses only the provided information and flag any assumptions.
```

This is enough for most drafting, summarizing, triage, and planning tasks.

## Pick The Right Pattern

Different jobs need different prompt shapes:

- **Direct structured prompt:** best for drafting, summarizing, rewriting, and creating checklists.
- **Few-shot classification:** best when the model must sort inputs into categories. Give 2-5 examples that cover edge cases.
- **Schema-guided extraction:** best when the output needs to become data. Define the fields first and reject anything that does not fit.
- **Skeleton-first:** best for memos, plans, PRDs, and strategy docs. Ask for the outline before the full content.
- **Verification-first:** best for decisions, forecasts, and ambiguous questions. Ask the model to separate facts, assumptions, and inferences.
- **Functional chaining:** best for multi-step work. Split the workflow into small prompts where each step has one job.

For a broader selector, use the [Ross Labs Prompt Decision Aid](https://rosslabs.ai/toolkit/prompt-decision-aid).

## Best Practices

1. **Start narrow.** One task per prompt is easier to inspect, debug, and reuse.
2. **Separate instructions from source material.** Put the task first, then clearly label the input text.
3. **Use less context, better selected.** A focused excerpt beats a long dump when the model only needs a few facts.
4. **Define the output shape.** Lists, sections, JSON, tables, and word limits reduce cleanup time.
5. **Ask for uncertainty.** Use "flag assumptions" and "say what is missing" instead of forcing false confidence.
6. **Avoid hidden reasoning requests.** Ask for a concise rationale, checks performed, or evidence used rather than long chain-of-thought.
7. **Preserve human ownership.** The model drafts, sorts, summarizes, or extracts. The practitioner decides.
8. **Test repeated prompts.** If a prompt is used weekly, keep examples of good and bad outputs and revise against those cases.

## Healthcare Safety Defaults

For this product, a prompt should default to these rules:

- Remove patient-identifying information before pasting anything into an AI tool.
- Use placeholders for patient-specific or clinically specific facts.
- Frame outputs as drafts, summaries, triage aids, or orientation notes.
- Require practitioner review before sending, documenting, billing, or changing care.
- Ask the model to flag missing information rather than inventing it.
- Avoid asking the model to make clinical, legal, payer, or compliance decisions.

The practical test is simple: if a wrong answer could directly affect care, payment, legal exposure, or patient communication, the prompt should either narrow the task or add a stronger review step.

## When A Prompt Should Become Something Else

A prompt is the right first step when the task is low-risk, single-step, and easy to review.

Promote it when the workflow becomes repeated:

- **Prompt library row:** use when the same prompt should be discoverable and reusable.
- **Checklist or playbook:** use when the output depends on human steps outside the AI tool.
- **Skill:** use when the workflow needs durable instructions, examples, templates, or local files.
- **Plugin or app feature:** use when the workflow needs authentication, data access, permissions, persistence, or automation.

The goal is not to make every workflow agentic. The goal is to use the simplest reliable surface that gives the user a better outcome.

## Example: Good Prompt For A Practice Admin Task

```text
You are an admin writing assistant for a solo healthcare practice.

Your job is to turn rough staff-meeting notes into a clean action-item list.

Input:
[Paste notes here after removing patient names, dates of birth, MRNs, addresses, and other identifiers.]

Constraints:
- Do not include patient-identifying information.
- Do not invent owners, deadlines, or decisions.
- If the notes are ambiguous, mark the item as "Needs clarification."

Return:
1. Meeting summary in 2 sentences.
2. Action items as bullets formatted: Task - Owner - Due date or "Needs date".
3. Open questions.
4. Decisions made.

Before finalizing, check whether every action item is grounded in the notes.
```

## Common Failure Modes

- **Too much context:** the model gets a document dump when it only needs a section.
- **Mixed jobs:** the prompt asks for summary, decision, rewrite, extraction, and compliance review at once.
- **No output contract:** the answer is correct but hard to use.
- **No safety boundary:** the model drifts from drafting support into clinical or compliance claims.
- **No examples:** category labels are defined abstractly, so edge cases are inconsistent.
- **No verification step:** assumptions and missing facts are hidden inside fluent prose.

The better pattern is to make the work inspectable: clear input, clear task, clear output, clear review.
