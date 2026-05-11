// Shared rerank types. Kept in their own file so both bge-client and
// gpt4o-fallback can import without creating a cycle.

export interface RerankDoc {
  id: string;
  text: string;
}

export interface RerankInput {
  query: string;
  docs: RerankDoc[];
}

export type DegradedReason =
  | "bge_disabled"
  | "bge_timeout"
  | "bge_unavailable"
  | "fallback_failed"
  | null;

export interface RerankResult {
  doc_ids: string[]; // ordered best-first
  degraded: boolean;
  degraded_reason: DegradedReason;
  rerank_ms: number;
  source: "bge" | "gpt4o-mini" | "passthrough";
}

export type RerankFn = (input: RerankInput) => Promise<RerankResult>;
