// lib/audience/classify.ts — Audience-rule table for Track A + per-article
// LLM classifier for corpus_documents (0015 follow-up).
//
// Used by:
//   - scripts/backfill-content-audience.ts (initial + idempotent re-runs)
//   - tests/audience-classify.test.ts (lock the rules from drifting silently)
//
// Two audience values — schema enforces both:
//   - 'ai-adoption-solo'    : adoption-tagged content (the product mission)
//   - 'ai-research-general' : broader AI research surface
//
// A row may carry both tags (dual-use). The DB unique constraint
// (content_type, content_id, audience) means we insert two rows in that
// case, not one row with both audiences.
//
// Two classifier surfaces:
//
//   1. classifyAudience(input)         — pure-function, source-rule table.
//      Used for library_* / kb_article / plugin / skill (curated content)
//      AND as a fallback for corpus_document when the LLM call fails or
//      title/body are absent.
//
//   2. classifyArticleAudience(article) — async, calls Groq with
//      openai/gpt-oss-120b. Used for corpus_document rows once title +
//      body are available. Emits rationale + confidence per call.

// NOTE: the Groq client is loaded lazily inside classifyArticleAudience()
// to keep this module pure-import-safe. CLI callers (which run dotenv at
// process start) and tests (which never call the LLM) can import this file
// without triggering env validation in @/lib/env. The dynamic import resolves
// once per process and is cached by the module loader.

export type Audience = "ai-adoption-solo" | "ai-research-general";
export type AudienceContentType =
  | "corpus_document"
  | "library_use_case"
  | "library_prompt"
  | "library_skill"
  | "library_plugin"
  | "kb_article"
  | "plugin"
  | "skill";

// ─── Source-rule classifier (pure, deterministic) ──────────────────────────

export interface CorpusSignal {
  contentType: "corpus_document";
  /** corpus_documents.source_type value (e.g. 'arxiv', 'anthropic-news'). */
  sourceType: string;
}

export interface LibrarySignal {
  contentType:
    | "library_use_case"
    | "library_prompt"
    | "library_skill"
    | "library_plugin";
}

export interface KbSignal {
  contentType: "kb_article";
}

export interface PluginSkillSignal {
  contentType: "plugin" | "skill";
  sourceUrl: string | null;
}

export type ClassifyInput =
  | CorpusSignal
  | LibrarySignal
  | KbSignal
  | PluginSkillSignal;

export interface ClassifyResult {
  audiences: Audience[];
  reason: string;
  /** Confidence in the verdict, 0..1. Source-rule paths emit 1.0 for
   * curated content and 0.5 for corpus source-rule fallbacks. */
  confidence: number;
}

const ADOPTION_CORPUS_SOURCES = new Set<string>([
  "industry",
  "industry-news",
  "healthcare-news",
]);

const RESEARCH_CORPUS_SOURCES = new Set<string>([
  "arxiv",
  "arxiv-paper",
  "paper",
  "research",
]);

const DUAL_USE_CORPUS_SOURCES = new Set<string>([
  "anthropic",
  "anthropic-news",
  "openai",
  "openai-news",
]);

const ADOPTION_PLUGIN_URL_MARKERS = [
  "anthropics/knowledge-work-plugins",
  "github.com/anthropics/skills",
];

/**
 * Source-rule classifier. Pure function — no IO, no LLM. Re-runs return
 * the same answer for the same input.
 *
 * For corpus_document this is the FALLBACK path; the primary classifier
 * is classifyArticleAudience() which reads the article content. The
 * source-rule path is exercised when:
 *   - title / body are missing,
 *   - the LLM call throws,
 *   - or the backfill is explicitly run in --no-llm mode.
 */
export function classifyAudience(input: ClassifyInput): ClassifyResult {
  switch (input.contentType) {
    case "corpus_document": {
      const src = input.sourceType.toLowerCase();
      if (DUAL_USE_CORPUS_SOURCES.has(src)) {
        return {
          audiences: ["ai-adoption-solo", "ai-research-general"],
          reason: `corpus_document/${src} — vendor news, dual-use (source-rule)`,
          confidence: 0.7,
        };
      }
      if (ADOPTION_CORPUS_SOURCES.has(src)) {
        return {
          audiences: ["ai-adoption-solo"],
          reason: `corpus_document/${src} — adoption industry signal (source-rule)`,
          confidence: 0.6,
        };
      }
      if (RESEARCH_CORPUS_SOURCES.has(src)) {
        return {
          audiences: ["ai-research-general"],
          reason: `corpus_document/${src} — research surface (source-rule)`,
          confidence: 0.6,
        };
      }
      return {
        audiences: [],
        reason: `corpus_document/${src} — unknown source_type; flagged for human review`,
        confidence: 0,
      };
    }

    case "library_use_case":
    case "library_prompt":
    case "library_skill":
    case "library_plugin":
      return {
        audiences: ["ai-adoption-solo"],
        reason: `${input.contentType} — curated for solo healthcare`,
        confidence: 1.0,
      };

    case "kb_article":
      return {
        audiences: ["ai-adoption-solo"],
        reason: "kb_article — curated learning content",
        confidence: 1.0,
      };

    case "plugin":
    case "skill": {
      const url = (input.sourceUrl ?? "").toLowerCase();
      if (
        ADOPTION_PLUGIN_URL_MARKERS.some((m) => url.includes(m.toLowerCase()))
      ) {
        return {
          audiences: ["ai-adoption-solo"],
          reason: `${input.contentType} — anthropics curated knowledge-work surface`,
          confidence: 1.0,
        };
      }
      return {
        audiences: ["ai-adoption-solo"],
        reason: `${input.contentType} — default adoption surface (no upstream marker)`,
        confidence: 0.8,
      };
    }
  }
}

export function classifyHasResult(r: ClassifyResult): boolean {
  return r.audiences.length > 0;
}

// ─── Per-article LLM classifier (corpus_documents only) ────────────────────

export interface ArticleInput {
  /** corpus_documents.id — used only for trace logging by callers. */
  contentId: string;
  /** corpus_documents.source_type — passed as a hint, not a verdict. */
  sourceType: string;
  /** corpus_documents.title (≤200 chars typical). */
  title: string;
  /** corpus_documents.body — caller truncates to ≤1000 chars. */
  bodyExcerpt: string;
}

/** Returned by the LLM. Confidence is the model's own 0..1 self-rating;
 * the backfill flags <0.6 for human review but commits the verdict. */
export interface ArticleClassifyResult extends ClassifyResult {
  source: "llm" | "source-rule-fallback";
}

const ARTICLE_CLASSIFIER_SYSTEM_PROMPT = `You classify AI-related articles by audience.

The two audiences are NARROWLY defined. Do not stretch them.

ai-adoption-solo
  Reader: a solo or small-team knowledge worker (especially a healthcare
  clinician — psychiatrist, therapist, primary-care doctor) who wants to USE
  AI tools in their day-to-day practice. They are NOT an ML engineer, not a
  researcher, not a platform team, not an infrastructure operator. They will
  not train, fine-tune, deploy, or build models.
  Content that fits:
    - Prompts and prompt templates for a clinician's workflow
    - Use-case write-ups ("how I use AI for prior auth letters")
    - Vendor product announcements aimed at END USERS (e.g. ChatGPT for
      Healthcare, a Claude consumer feature)
    - Practice-management AI tools (intake summarization, note review,
      referral templates)
    - Vendor docs about how to USE a model (prompting guides, capability
      docs, what-the-product-does pages)
    - Clinical AI guidance, regulatory/compliance notes for solo practice
    - Healthcare-specific AI adoption news (an AI scribe launches, etc.)

ai-research-general
  Reader: an AI/ML practitioner, researcher, or engineer who builds, trains,
  evaluates, deploys, or studies AI systems.
  Content that fits:
    - Research papers and arxiv preprints
    - Model release announcements with technical details (architecture,
      training data, scaling laws, benchmarks)
    - Training methodology, fine-tuning, RLHF, distillation
    - Inference infrastructure: GPU optimization, vLLM, TRL, latency
      throughput, distributed serving, embedding optimization
    - Model architecture: MoE, hybrid heads, quantization, mamba/SSMs
    - Capability evaluations, benchmark results, leaderboards
    - Academic news and faculty announcements
    - AI policy and governance research

Dual-tag (both audiences) ONLY when the SAME article materially serves BOTH
readers. Not as a hedge. Typical genuine dual-tag examples:
  - A flagship model launch announcement that has a "what you can do with
    it" section AND technical specs
  - A vendor blog explaining a new feature with both use-case examples AND
    architecture detail aimed at developers

DO NOT dual-tag when the content is purely ML engineering even if a
practitioner could theoretically read it. "How to make inference faster" is
research; "How a doctor can use ChatGPT to summarize notes" is adoption.

Output STRICT JSON only, no prose, no markdown fences:

{
  "audiences": ["ai-adoption-solo"] | ["ai-research-general"] | ["ai-adoption-solo", "ai-research-general"],
  "confidence": 0.0-1.0,
  "rationale": "one sentence, <=160 chars, naming what makes it that audience"
}

Confidence calibration:
- 0.9-1.0: unambiguous from the title alone.
- 0.7-0.9: title + first paragraph makes it clear.
- 0.5-0.7: requires reading the body to decide.
- <0.5: genuinely ambiguous OR not clearly AI-related; pick the more
  plausible audience and lower confidence so a human can review.

Edge cases:
- ML training infrastructure (vLLM, TRL, DeepSeek deployment, Sagemaker
  Hyperpod, sparse embeddings, GPU memory) → ai-research-general ONLY.
  These are for engineers, not clinicians.
- Model architecture papers (Falcon-H1, MoE, quantization) →
  ai-research-general ONLY.
- Scaling laws and efficiency research → ai-research-general ONLY.
- A vendor product page about "Claude for Creative Work" or "Claude in
  Bedrock" → ai-adoption-solo (it tells a user what the product does).
- Codex docs for end users (how to USE Codex) → ai-adoption-solo.
- Codex training methodology or RLHF details → ai-research-general.

Do not refuse. If the article is not clearly AI-related at all, pick the
more plausible audience and lower confidence to <0.5.`;

interface LlmVerdict {
  audiences: Audience[];
  confidence: number;
  rationale: string;
}

function parseLlmVerdict(text: string): LlmVerdict | null {
  try {
    const trimmed = text.trim();
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const audiencesRaw = obj.audiences;
    if (!Array.isArray(audiencesRaw)) return null;
    const audiences: Audience[] = [];
    for (const a of audiencesRaw) {
      if (a === "ai-adoption-solo" || a === "ai-research-general") {
        audiences.push(a);
      }
    }
    if (audiences.length === 0) return null;
    const dedup = Array.from(new Set(audiences));
    const confidence = typeof obj.confidence === "number"
      ? Math.max(0, Math.min(1, obj.confidence))
      : 0.5;
    const rationale = typeof obj.rationale === "string"
      ? obj.rationale.slice(0, 240)
      : "(no rationale)";
    return { audiences: dedup, confidence, rationale };
  } catch {
    return null;
  }
}

/**
 * Classify a corpus_document by reading its title + body.
 *
 * Sends a compact prompt to Groq (openai/gpt-oss-120b). Retries up to 3
 * times with exponential backoff (1s, 3s, 9s + jitter) on 429 rate-limit
 * responses; gives up on non-retryable errors. On parse failure or final
 * give-up, falls back to source-rule classification.
 *
 * Pure async function — the only IO is the Groq call. Safe to call in
 * parallel (caller controls concurrency).
 */
export async function classifyArticleAudience(
  article: ArticleInput,
): Promise<ArticleClassifyResult> {
  const userPrompt = [
    `source_type: ${article.sourceType}`,
    `title: ${article.title}`,
    "",
    "body excerpt:",
    article.bodyExcerpt,
  ].join("\n");

  const { callStage } = await import("@/lib/groq-core");
  const maxAttempts = 3;
  const baseDelaysMs = [1000, 3000, 9000];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { answer } = await callStage({
        systemPrompt: ARTICLE_CLASSIFIER_SYSTEM_PROMPT,
        userPrompt,
        responseSchema: {},
        temperature: 0.1,
      });
      const verdict = parseLlmVerdict(answer);
      if (!verdict) {
        const fallback = classifyAudience({
          contentType: "corpus_document",
          sourceType: article.sourceType,
        });
        return {
          audiences: fallback.audiences,
          reason: `${fallback.reason} (LLM parse failure; fell back to source-rule)`,
          confidence: fallback.confidence,
          source: "source-rule-fallback",
        };
      }
      return {
        audiences: verdict.audiences,
        reason: verdict.rationale,
        confidence: verdict.confidence,
        source: "llm",
      };
    } catch (err) {
      lastError = err;
      const msg = (err as Error).message ?? String(err);
      const isRetryable = msg.includes("429") || msg.includes("rate limit") || msg.toLowerCase().includes("timeout");
      if (!isRetryable || attempt === maxAttempts - 1) break;
      // Exponential backoff with ±25% jitter.
      const base = baseDelaysMs[attempt] ?? 9000;
      const jitter = base * (0.75 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  const fallback = classifyAudience({
    contentType: "corpus_document",
    sourceType: article.sourceType,
  });
  return {
    audiences: fallback.audiences,
    reason: `${fallback.reason} (LLM gave up after retries: ${(lastError as Error)?.message?.slice(0, 100) ?? "unknown"}; source-rule fallback)`,
    confidence: fallback.confidence,
    source: "source-rule-fallback",
  };
}

// Exposed for tests that want to assert against the parser without a live LLM.
export const __test = { parseLlmVerdict, ARTICLE_CLASSIFIER_SYSTEM_PROMPT };
