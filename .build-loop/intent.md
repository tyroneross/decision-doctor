# Decision Doctor Branch C Intent

North star: help solo healthcare practitioners make high-stakes business decisions quickly with visible, trustworthy reasoning.

Update intent: build Branch C from the clean GitHub `main` branch into a mobile-first Next.js PWA prototype that satisfies the PRD's P0 flow.

Primary user/workflow: a solo practice owner chooses a decision template, answers a short PHI-safe intake, receives one recommendation with alternatives, confidence, method trace, and workload reducers, then saves or shares it.

User-value rules:
- Trust: show the math behind the recommendation and do not fake decision outputs.
- Speed: keep intake short and the common flow phone-friendly.
- Safety: reject PHI-shaped input and keep secrets out of Git.
- Scalability: preserve multi-tenant-ready schema and per-stage engine boundaries.

Non-goals:
- No PHI acceptance in v1.
- No team/org switcher.
- No P1 voice, HIPAA posture, or connector automation.
- No external app dependency for core build flow beyond declared stack services.

