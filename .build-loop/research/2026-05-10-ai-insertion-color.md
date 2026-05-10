# AI Insertion Workflow And Color Research

Date: 2026-05-10
Branch: branch-codex

## Decision

Refocus the first screen on framework-ranked AI implementation choices, not generic decision support.

The primary workflow should:

1. collect repeated tasks, time drains, and candidate AI insertion points;
2. score them through decision criteria;
3. rank the best first implementation;
4. emit starter prompt, skill, and plugin artifacts for the winning path.

## Product Findings

- The PRD already supports this direction through `workloadReducers[]`, which can include prompts, skills, plugins, MCP hooks, and playbooks.
- The current app under-emphasized the decision framework and over-emphasized a generic recommendation preview.
- The corrected hierarchy should make the framework the main product: values, vetoes, criteria, tradeoffs, ranking, and fallback.
- Capacity is the outcome metric. AI is the implementation lever. Decision science is the selection method.

## Color Direction

Use a light, fun, non-green palette:

- base: soft white with periwinkle and warm coral tint;
- primary action: coral to periwinkle gradient;
- selected states: light periwinkle with coral edge;
- evidence/artifacts: warm coral callouts;
- text: dark ink and neutral slate.

Rejected direction:

- green or teal as dominant color;
- dark recommendation card;
- oversized recommendation headline;
- decorative motion without state meaning.

## Calm Precision Constraints

- One L1: "Prioritize where AI should help."
- Button labels use verb plus object: "Rank work", "View artifacts", "Start scan".
- AI comfort belongs in collapsed settings.
- The recommendation panel stays compact and evidence-oriented.
- Starter artifacts render as real guide output, not inactive placeholder buttons.

## Validation Targets

- `/app` renders without text overlap at desktop and mobile widths.
- Guide submit returns `AI insertion priority framework`.
- Guide output includes prompt, skill, and plugin starter artifacts.
- IBR quickpass passes on the changed app route.
