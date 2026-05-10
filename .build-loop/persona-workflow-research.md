# Decision Guide Persona Simulation

Research question: how should Decision Doctor guide users with different levels
of AI maturity from a messy practice decision question into the simplest
structured intake path?

Sources used:

- `Reference files/decision-doctor-prd.md` - PRD constraints, P0 workflow, no-PHI
  rule, three v1 decision templates.
- `components/decision-data.ts` - current template fields and field labels.
- `lib/engine/templates/*.ts` - strict schema fields and decision criteria.
- `.build-loop/ibr-quickpass.json` - IBR coverage gap for `/app`.

## Simulated Users

### Persona 1: Low AI maturity

Question: "I am exhausted and my waitlist keeps growing. Should I keep accepting
new intakes?"

Expected support:

- Use plain language.
- Choose one path without requiring prompt-writing skill.
- Ask for counts and categories only.
- Send to capacity intake.

Workflow result:

- Template: `capacity`
- First fields: visits each week, waitlist length, burnout risk
- Copy posture: "Start with the closest template, answer only the short business
  questions, and avoid patient details."

### Persona 2: Moderate AI maturity

Question: "Should I raise my fee or keep prices stable while I still take
insurance?"

Expected support:

- Frame the decision as a tradeoff.
- Keep the user out of open-ended chat.
- Send to pricing intake.

Workflow result:

- Template: `pricing`
- First fields: current fee, income gap, price sensitivity
- Copy posture: "Use the template to turn your question into a small tradeoff."

### Persona 3: High AI maturity

Question: "I spend 12 hours a week on calls and billing. Should I hire admin
help or automate first?"

Expected support:

- Acknowledge model-style review.
- Point to method trace and eliminated alternatives.
- Send to admin-hire intake.

Workflow result:

- Template: `admin-hire`
- First fields: admin hours, missed calls, monthly budget
- Copy posture: "Treat the template as a lightweight decision model."

## Design Decision

The initial agent should be deterministic and local. It classifies the question,
adapts the guidance to AI maturity, rejects PHI-shaped input, and routes to the
structured intake. This avoids shared DB writes and avoids making Groq calls
before the user explicitly submits a decision.

## Audit Notes

- The guide must not create a general chatbot surface.
- The guide must not accept patient names, contact details, dates of birth,
  record numbers, or clinical notes.
- The guide should return simple next questions, not long reasoning.
- The guide is an intake router; the existing decision engine remains the source
  of the actual recommendation.
