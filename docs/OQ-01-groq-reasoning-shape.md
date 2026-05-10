# OQ-01 — Groq `reasoning_format: "parsed"` response shape

**Status:** ✅ Resolved 2026-05-10. Live curl against `openai/gpt-oss-120b`.

## Verified response structure

```json
{
  "id": "chatcmpl-012a8b28-...",
  "object": "chat.completion",
  "created": 1778402396,
  "model": "openai/gpt-oss-120b",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Yes – adding four patients (a 12.5% increase) is a modest load...",
        "reasoning": "We need to answer yes or no, then one sentence rationale. Decision: adding 4 more patients..."
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "queue_time": 0.027,
    "prompt_tokens": 115,
    "prompt_time": 0.0044,
    "completion_tokens": 128,
    "completion_time": 0.2675,
    "total_tokens": 243,
    "total_time": 0.2719,
    "completion_tokens_details": { "reasoning_tokens": 86 }
  },
  "system_fingerprint": "fp_d61b396b98",
  "x_groq": { "id": "req_...", "seed": 549862562 },
  "service_tier": "on_demand"
}
```

## What this confirms (PRD §6.3, ADR-001)

- `choices[0].message.reasoning` is a **separate field** from `content` — UI renders it as the expandable "show the work" trace without parsing.
- `usage.completion_tokens_details.reasoning_tokens` is reported separately — for the Phase 2 rate-limiter (T-10) and audit-log token accounting (AT1).
- End-to-end latency for this 1-stage prompt: **~272 ms** (queue + prompt + completion).
- 5-stage pipeline budget per PRD T-03 = **<6s p95**. Even at 5× this single-call latency = 1.36s with no parallelism, well under budget.

## Implications for `lib/groq.ts`

`callStage()` already extracts `message.reasoning` and `message.content` separately — no schema changes needed.

```ts
const message = choice?.message as unknown as {
  content?: string | null;
  reasoning?: string | null;
};
return {
  answer: message?.content ?? "",
  reasoning: message?.reasoning ?? null,
  tokensIn: completion.usage?.prompt_tokens ?? 0,
  tokensOut: completion.usage?.completion_tokens ?? 0,
};
```

The `@ts-expect-error` for `reasoning_format` field (groq-sdk types may not include it yet) stays — Groq's API accepts it, type just hasn't been published. Verify in `pnpm add groq-sdk@latest` later if removable.

## Confidence formula (OQ-03 — partial resolution)

For Stage 5 ranking, confidence (0–100) per PRD §6.3 + OQ-03 default:

```
confidence = clamp((topsis_score_top1 - topsis_score_top2) / topsis_score_top1 * 100, 0, 100)
```

Deterministic, derives from method_trace, satisfies fact-checker requirement (no LLM-self-reported confidence).

## Source

Live curl 2026-05-10 from `decision-doctor-cc` host. Raw response saved to `.git ignore/oq-01-raw-response.json` (gitignored). T1 confirmed.
