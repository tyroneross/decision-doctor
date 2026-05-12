// Token-aware chunker for the embedding pipeline.
//
// Targets 500–1024 tokens per chunk with ~100 token overlap (the standard
// retrieval-augmented-generation window for `text-embedding-3-small`).
// Cap is 1024 (was 1000) to leave headroom for the title prefix added by
// FIX-3 (see workers/src/adapters/arxiv-embed.ts). text-embedding-3-small
// accepts 8192 tokens, so this is a soft engineering cap, not a model limit.
// Encoding is `cl100k_base` — the tokenizer family used by
// text-embedding-3-* and gpt-3.5 / gpt-4 family models. (text-embedding-3
// actually uses o200k_base internally for the largest variants, but the
// token *count* under cl100k_base is a tight enough proxy for chunk-size
// budgeting and is what the OpenAI cookbook recommends for sizing.)
//
// Why tiktoken (WASM) vs gpt-tokenizer (pure JS): tiktoken matches OpenAI's
// official tokenizer byte-for-byte and is the package OpenAI documents.
// gpt-tokenizer is a JS port; we list it as a fallback in the build-loop
// dispatch but only ship tiktoken.

import { encoding_for_model, get_encoding, type Tiktoken } from "tiktoken";

export interface ChunkerOptions {
  /** Target chunk size in tokens. Default 750 (midpoint of 500–1000). */
  targetTokens?: number;
  /** Maximum tokens before forcing a split. Default 1024 (headroom for title prefix). */
  maxTokens?: number;
  /** Overlap between consecutive chunks. Default 100. */
  overlapTokens?: number;
}

export interface Chunk {
  index: number;
  text: string;
  tokenCount: number;
}

const DEFAULTS = {
  targetTokens: 750,
  maxTokens: 1024,
  overlapTokens: 100,
} satisfies Required<ChunkerOptions>;

let _enc: Tiktoken | null = null;
function getEncoder(): Tiktoken {
  if (_enc) return _enc;
  try {
    // The 3-small embedding model isn't in the tiktoken name table, so fall
    // back to cl100k_base which is the closest documented base encoding.
    _enc = encoding_for_model("text-embedding-ada-002");
  } catch {
    _enc = get_encoding("cl100k_base");
  }
  return _enc;
}

/**
 * Chunk `body` into overlapping windows of ~target tokens each.
 *
 * Algorithm: tokenize the whole body, then walk a sliding window of size
 * `targetTokens` with stride `targetTokens - overlapTokens`. Tail chunks
 * shorter than `targetTokens` are kept as-is unless the body is so short
 * a single chunk covers everything.
 *
 * Returns an array of `{index, text, tokenCount}`. Chunks are 0-indexed and
 * in document order. Each chunk's `text` is the decoded slice — round-trip
 * through tiktoken's `decode` to preserve byte fidelity, then converted to
 * UTF-8 string.
 */
export function chunkBody(
  body: string,
  opts: ChunkerOptions = {},
): Chunk[] {
  const cfg = { ...DEFAULTS, ...opts };
  if (cfg.overlapTokens >= cfg.targetTokens) {
    throw new Error(
      `chunker: overlap ${cfg.overlapTokens} must be < target ${cfg.targetTokens}`,
    );
  }
  if (cfg.targetTokens > cfg.maxTokens) {
    throw new Error(
      `chunker: target ${cfg.targetTokens} must be <= max ${cfg.maxTokens}`,
    );
  }

  if (body.length === 0) return [];

  const enc = getEncoder();
  const tokens = enc.encode(body);
  if (tokens.length === 0) return [];

  // Single-chunk fast path
  if (tokens.length <= cfg.maxTokens) {
    return [
      {
        index: 0,
        text: body,
        tokenCount: tokens.length,
      },
    ];
  }

  const stride = cfg.targetTokens - cfg.overlapTokens;
  const chunks: Chunk[] = [];
  const decoder = new TextDecoder("utf-8");

  let start = 0;
  let idx = 0;
  while (start < tokens.length) {
    const end = Math.min(start + cfg.targetTokens, tokens.length);
    const slice = tokens.slice(start, end);
    const bytes = enc.decode(slice);
    const text = decoder.decode(bytes);
    chunks.push({
      index: idx++,
      text,
      tokenCount: slice.length,
    });
    if (end >= tokens.length) break;
    start += stride;
  }

  return chunks;
}

/**
 * Free the tiktoken WASM encoder. Tests call this in afterAll to silence
 * WASM-leak warnings; production never needs to invoke it.
 */
export function disposeEncoder(): void {
  if (_enc) {
    _enc.free();
    _enc = null;
  }
}
