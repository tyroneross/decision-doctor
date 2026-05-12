# Advanced Prompting Patterns for Reliable AI Workflows

## Executive Summary

Advanced prompting is not about adding fancy phrases to every request. It is about choosing the right control pattern for the job: examples for format mimicry, structured outputs for data, reasoning scaffolds for hard judgment, retrieval for grounded answers, tools for external actions, and eval prompts for quality control. The best pattern is usually the lightest one that makes the output more reliable.

***

## The Selection Rule

Start with the simplest prompt that can work:

1. Use a direct structured prompt when the task is single-step and easy to review.
2. Add examples when the desired output style or category boundary is ambiguous.
3. Add a schema when the output feeds code, a database, or another AI step.
4. Add reasoning scaffolding when the task requires multi-step judgment.
5. Add retrieval when the answer must be grounded in external documents.
6. Add tools when the model must inspect, calculate, fetch, or change something.
7. Add evaluation when the prompt will be reused or shipped in a product.

If a technique adds cost, latency, or complexity without changing the failure mode, do not use it.

For a quick selector before choosing a pattern, use the [Ross Labs Prompt Decision Aid](https://rosslabs.ai/toolkit/prompt-decision-aid).

## Chain-of-Thought

**Use for:** math, logic, code planning, architecture tradeoffs, diagnostics, and other tasks where intermediate reasoning changes the answer.

**Modern guidance:** do not ask the model to expose a long hidden scratchpad by default. Ask for the useful surface instead: assumptions, decision criteria, checks performed, concise rationale, or a short worked example.

Good prompt move:

```text
Solve this carefully. Use private reasoning if needed, then return:
1. Final answer
2. Key assumptions
3. Concise rationale
4. Checks or edge cases considered
```

Use visible step-by-step reasoning only when the human genuinely needs to audit the reasoning path. For production prompts, prefer structured intermediate fields over a long free-form chain.

## Chain-of-Density

**Use for:** summarizing long articles, research notes, transcripts, or strategy memos where the first summary is too generic.

Chain-of-Density is an iterative summarization pattern. The model writes a short summary, identifies missing important entities or facts, then rewrites the summary to include more specific information while keeping the same length.

A practical version:

```text
Summarize the source in 120 words.

Run 3 passes:
1. Draft a concise summary.
2. Identify 3-5 missing concrete entities, facts, numbers, names, or constraints.
3. Rewrite the summary at the same length, making it denser and more specific.

Return only the final summary plus a short "included details" list.
```

This is useful when the failure mode is vague summary prose. It is not useful when the source itself is thin or when the user needs exhaustive coverage.

## Self-Consistency

**Use for:** tasks where one reasoning path may be brittle and the answer can be checked by convergence.

Self-consistency means sampling several independent answers, then choosing the answer that survives comparison. It works best for math, classification, and judgment tasks with a clear answer or stable rubric.

Simple prompt version:

```text
Generate 3 independent solution paths. Compare them. If they disagree, identify the disagreement and choose the answer best supported by the evidence.

Return:
1. Final answer
2. Why the selected answer won
3. Any unresolved uncertainty
```

Production version: run multiple model calls and aggregate outside the prompt. That is more reliable than asking one model call to simulate independence.

## Tree-of-Thoughts

**Use for:** planning, strategy, design, diagnosis, or complex problem solving where multiple paths could work.

Tree-of-Thoughts explores branches instead of forcing one linear reasoning path. The model proposes options, scores them, expands the best candidates, and chooses a final path.

Good prompt move:

```text
Generate 3 possible approaches.
Score each on reliability, cost, speed, and reversibility.
Expand the top 2 into implementation steps.
Choose one recommendation and explain why it beats the alternative.
```

Use this when the cost of choosing the wrong path is high. Avoid it for routine drafting or simple extraction.

## ReAct

**Use for:** agent workflows where the model must reason, call tools, observe results, then continue.

ReAct stands for reasoning plus acting. The model alternates between deciding what it needs, calling a tool, reading the result, and updating its plan.

For product prompts, do not rely on prose alone. Define:

- The available tools.
- When each tool should be used.
- What the model must check after each tool result.
- When the model should stop.
- What final answer format is required.

Good ReAct prompts make tool use bounded. They prevent the model from browsing, searching, or calling functions just because it can.

## Reflexion

**Use for:** iterative agents, coding tasks, writing improvement, and workflows where a first attempt can be inspected and improved.

Reflexion asks the model to critique its own attempt and revise. It is useful when quality can be improved through review, but it can also create false confidence if the critique is vague.

Better than "improve this":

```text
Review the draft against these criteria:
1. Accuracy
2. Specificity
3. Missing constraints
4. Unsafe or unsupported claims

Then revise only the parts that fail a criterion.
Return a short change log.
```

For important workflows, use a separate verifier prompt or deterministic checks instead of letting the same prompt grade itself.

## Generated Knowledge

**Use for:** broad questions where the model needs relevant background before answering, but the background is not available as documents.

Generated-knowledge prompting asks the model to list relevant facts, definitions, or constraints before answering. It can help with general reasoning, but it also increases hallucination risk.

Use it only with uncertainty labels:

```text
Before answering, list the relevant background facts you are relying on.
Tag each as:
- PROVIDED: stated in the input
- COMMON: broadly known
- INFERRED: plausible but not proven here

Use only PROVIDED and COMMON facts in the final answer unless you clearly label an inference.
```

If factual accuracy matters, use retrieval instead.

## RAG And Grounded Prompting

**Use for:** answers that must be based on specific documents, policies, research, user history, or database rows.

The key instruction is not "be accurate." The key instruction is "use only the provided sources, cite the relevant source, and say when the answer is not found."

Good prompt move:

```text
Answer using only the provided sources.
For each claim, cite the source id.
If the sources disagree, name the disagreement.
If the answer is not present, say "not found in the provided sources."
```

RAG quality depends more on retrieval and context assembly than on prompt wording. A prompt cannot fix missing or noisy context.

## Structured Outputs

**Use for:** extraction, classification, scoring, routing, search filters, evals, and anything that feeds software.

A schema is stronger than a paragraph. Define required fields, allowed enum values, null behavior, and validation rules.

Prompt-only version:

```text
Return JSON with this shape:
{
  "category": "admin" | "research" | "capacity_growth" | "follow_up" | "referrals",
  "confidence": 0-1,
  "reason": "one sentence",
  "missing_information": ["..."]
}

If the category is unclear, choose the closest category and set confidence below 0.6.
```

Production version: enforce the schema at the API or tool boundary, then validate again in code.

## Prompt Chaining

**Use for:** workflows with separable stages.

Instead of one giant prompt, split the work:

1. Extract the facts.
2. Classify or score the facts.
3. Draft the output.
4. Verify the output.
5. Convert it to the final format.

Prompt chaining is easier to debug because each stage has one failure mode. It costs more calls, so use it for repeated or high-value workflows.

## Few-Shot Prompting

**Use for:** style, classification, rubric scoring, and formats that are hard to describe abstractly.

Examples should cover boundaries, not just easy cases. Three good examples usually beat ten redundant ones.

Good examples include:

- One clear positive case.
- One clear negative case.
- One borderline case with the reason it is borderline.
- One formatting example if the output shape matters.

Keep examples static when possible. Static examples cache well and make behavior easier to compare over time.

## Evaluation Prompts

**Use for:** prompts that will be reused, shipped, or trusted by users.

An eval prompt should score one dimension at a time. Do not ask one judge to grade accuracy, tone, safety, completeness, and usefulness in a single number.

Good evaluator shape:

```text
You are evaluating one criterion: factual grounding.

Criterion:
The answer must only make claims supported by the provided source text.

Score:
1 = unsupported claims or contradiction
2 = mostly supported, minor unsupported wording
3 = fully supported

Return:
{
  "score": 1 | 2 | 3,
  "reason": "short explanation",
  "unsupported_claims": ["..."]
}
```

For production, calibrate the evaluator against human-labeled examples and track failures over time.

## Healthcare Workflow Defaults

For healthcare-adjacent workflows, advanced prompting should increase control, not autonomy.

Use these defaults:

- Prefer structured outputs over open-ended prose for triage, scoring, extraction, and routing.
- Prefer retrieval over generated knowledge when clinical, payer, policy, or compliance facts matter.
- Prefer concise rationale over full visible chain-of-thought.
- Require practitioner review before patient communication, documentation, billing, or care changes.
- Remove PHI before sending content to external AI tools.
- Label assumptions and missing information clearly.

The product rule is simple: the more consequential the output, the more the workflow should rely on grounding, schemas, validation, and human review.

## Quick Pattern Map

- **Need a better summary:** Chain-of-Density.
- **Need a hard answer:** concise reasoning scaffold.
- **Need reliable categories:** few-shot plus schema.
- **Need a decision among paths:** Tree-of-Thoughts.
- **Need external facts:** RAG.
- **Need API or file actions:** ReAct with bounded tools.
- **Need iterative quality:** Reflexion plus criteria.
- **Need software-ready output:** structured outputs.
- **Need confidence before shipping:** eval prompts.

Advanced prompting is a reliability design choice. Use the technique that directly addresses the failure mode in front of you.
