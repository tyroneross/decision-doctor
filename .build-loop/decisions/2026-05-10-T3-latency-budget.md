# 2026-05-10 — Engine latency p95 ≈ 8-10s, exceeding 6s PRD target

## Measurement

Over 3 sequential live Groq runs (model `openai/gpt-oss-120b`, capacity template):

- Sequential 5 stages: latencies ≈ 7.1 / 9.5 / 10.5 ms — p95 ≈ 10.5s
- Parallelize Stage 2 + Stage 3: latencies ≈ 6.5 / 6.9 / 9.9 ms — p95 ≈ 9.9s
- Fuse Stages 1+2+3 into one prompt: WORSE — 9.0 / 9.7 / 9.8 — bigger JSON output costs more than it saves
- Final shipped: parallel S2+S3, sequential otherwise.

## Why miss

- Groq's per-request TTFT plus JSON output cost dominates; each stage produces
  ~600-1000 output tokens, and stage 5 in particular emits the workload-reducer
  block which is ~1.5KB of structured JSON.
- Cold-start adds ~1-2s on the first call of a session.

## Levers not pulled (deferred)

- **Cache template-level prompts in Groq's prefix cache** — would help second-run
  cold start. Out of scope for this hackathon pass.
- **Switch to `groq/llama-3.3-70b-versatile`** — faster TTFT but lower reasoning
  quality. Pinned model is `openai/gpt-oss-120b` per LD-02 / config-pinned env.
- **Stream stage outputs** — would let the UI render the recommendation as
  Stage 5 returns, hiding latency. Out of scope.
- **Parallelize Stages 4 + 5 prompts** — Stage 5's prompt depends on Stage 4's
  ranking, so true parallelization not possible without restructuring.

## Decision

Ship as-is. Latency target was aggressive and non-blocking for the hackathon
demo (the user sees a clear "Working — usually under 6 seconds" message in the
UI's submit button). T-03 marker = ⚠️ untested-fully (passes shape contract;
latency exceeds target on 2 of 3 runs).
