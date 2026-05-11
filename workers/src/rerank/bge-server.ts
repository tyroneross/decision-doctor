// BGE cross-encoder reranker.
//
// Model: Xenova/bge-reranker-base (override via BGE_MODEL env var).
//   Default chosen because BAAI/bge-reranker-v2-m3 has no transformers.js-
//   compatible ONNX export. See .build-loop/memory/decision_bge_model_v1_vs_v2m3.md
//   for the full rationale and the future-swap path.
// Output: raw logits (NOT [0,1]). Sort descending for top-K. If downstream
//   wants probability semantics, apply sigmoid: 1 / (1 + exp(-logit)).
// Memory: ~500 MB resident after model load (q8 quantized). Worker concurrency=1.
//
// API shape (mirrors a typical /rerank HTTP endpoint):
//   POST { query: string, documents: [{id, text}], topK?: number }
//   -> { results: [{id, score}] }   // length = min(topK, documents.length)
//
// Tokenizer pattern is the cross-encoder pair form via the `text_pair`
// option:
//   tokenizer([q,q,...], { text_pair: [d0,d1,...], ... })
// IMPORTANT: the bare positional form `tokenizer(textsA, textsB, opts)` looks
// right but transformers.js (4.2.0) silently ignores the second positional
// argument — every row gets tokenized as `<s> query </s>` with no doc
// content, and the model returns the same score for every doc (verified by
// in-tree probe 2026-05-11). Use the option form.
// NOT `pipeline('text-classification', ...)` — that tokenizes texts
// separately and emits nonsense scores for a cross-encoder.

import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
} from "@huggingface/transformers";

const MODEL_ID = process.env.BGE_MODEL ?? "Xenova/bge-reranker-base";

// Lazy + cached. Multiple concurrent /rerank calls share one in-flight load.
let _tokenizer: any | null = null;
let _model: any | null = null;
let _loading: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (_model && _tokenizer) return;
  if (_loading) return _loading;
  _loading = (async () => {
    const t0 = Date.now();
    _tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
    _model = await AutoModelForSequenceClassification.from_pretrained(
      MODEL_ID,
      // q8 keeps the resident set under ~500 MB. Cast to any because the
      // typings in @huggingface/transformers don't surface dtype on
      // from_pretrained's options as of 4.2.0.
      { dtype: "q8" } as any,
    );
    console.log(
      `[rerank] BGE model loaded (${MODEL_ID}) in ${Date.now() - t0}ms`,
    );
  })();
  return _loading;
}

export function bgeStatus(): { loaded: boolean; model: string } {
  return { loaded: !!_model && !!_tokenizer, model: MODEL_ID };
}

export interface RerankDoc {
  id: string;
  text: string;
}

export interface RerankRequest {
  query: string;
  documents: RerankDoc[];
  topK?: number;
}

export interface RerankResult {
  id: string;
  score: number; // raw logit; sort descending
}

export interface RerankResponse {
  results: RerankResult[];
  model: string;
  cold_start_ms?: number; // present on the first call after process boot
}

/**
 * Score every document against the query and return the top-K, sorted by
 * descending relevance.
 *
 * Throws on tokenizer/model load failure (typically network or disk). Empty
 * documents array short-circuits to an empty result without loading the model.
 */
export async function rerank(req: RerankRequest): Promise<RerankResponse> {
  if (!req || typeof req.query !== "string") {
    throw new Error("rerank: `query` is required and must be a string");
  }
  if (!Array.isArray(req.documents)) {
    throw new Error("rerank: `documents` must be an array");
  }

  const topK = Math.max(1, req.topK ?? 5);
  if (req.documents.length === 0) {
    return { results: [], model: MODEL_ID };
  }

  const coldStart = !(_model && _tokenizer);
  const t0 = coldStart ? Date.now() : 0;
  await ensureLoaded();

  // Cross-encoder pair form: query repeated N times in the first arg,
  // docs passed as `text_pair` in the option bag. max_length=512 follows
  // the model's training; longer docs are truncated.
  const inputs = await _tokenizer!(
    Array(req.documents.length).fill(req.query),
    {
      text_pair: req.documents.map((d) => d.text ?? ""),
      padding: true,
      truncation: true,
      max_length: 512,
    },
  );
  const out = await _model!(inputs);

  // out.logits is a Tensor with shape [batch, 1]. tolist() returns nested arrays.
  const raw = out.logits.tolist() as number[][];
  const scored: RerankResult[] = req.documents.map((d, i) => ({
    id: d.id,
    score: raw[i]?.[0] ?? Number.NEGATIVE_INFINITY,
  }));
  scored.sort((a, b) => b.score - a.score);

  const response: RerankResponse = {
    results: scored.slice(0, topK),
    model: MODEL_ID,
  };
  if (coldStart) {
    response.cold_start_ms = Date.now() - t0;
  }
  return response;
}
