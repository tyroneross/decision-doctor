import { createHash } from "node:crypto";

export const EXTRACTOR_VERSION = "2026-05-11.ingestion-v2.1";

export type BodyKind =
  | "full_text"
  | "source_summary"
  | "metadata_only"
  | "blocked"
  | "degraded";

export type ExtractionMethod =
  | "noop_abstract"
  | "static_cheerio"
  | "cdp_rendered"
  | "og_description_fallback"
  | "source_summary"
  | "error"
  | "auto";

export interface QualityAssessment {
  bodyKind: BodyKind;
  qualityScore: number;
  degraded: boolean;
  degradedReasons: string[];
  bodyChars: number;
  wordCount: number;
  policyProfile: string;
  policySource: "crawl_config" | "inferred";
  minFullTextWords: number;
  minSummaryWords: number;
}

export interface SourceQualityPolicy {
  minFullTextWords: number;
  minSummaryWords: number;
  profile: string;
  policySource: "crawl_config" | "inferred";
  requireRealArticleMarkers?: RegExp[];
  forbiddenMarkers?: RegExp[];
}

const DEFAULT_POLICY: SourceQualityPolicy = {
  minFullTextWords: 220,
  minSummaryWords: 12,
  profile: "default_article",
  policySource: "inferred",
};

const CHALLENGE_PATTERNS: RegExp[] = [
  /verification successful\.?\s+waiting for/i,
  /just a moment/i,
  /cf_chl/i,
  /cloudflare/i,
  /enable javascript and cookies/i,
  /access denied/i,
  /checking your browser/i,
  /ray id/i,
  /ddos protection/i,
];

const LOADING_PATTERNS: RegExp[] = [
  /^loading[.\s]*$/i,
  /loading\s+loading\s+loading/i,
  /skeleton|shimmer|placeholder/i,
];

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function normalizeBodyText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function wordCount(text: string): number {
  const normalized = normalizeBodyText(text);
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

export function hasChallengeShell(text: string): boolean {
  return CHALLENGE_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasLoadingShell(text: string): boolean {
  return LOADING_PATTERNS.some((pattern) => pattern.test(text));
}

function valueAsString(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

function valueAsNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x) && x > 0) return x;
  if (typeof x === "string" && x.trim()) {
    const parsed = Number(x);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function arrayOfStrings(x: unknown): string[] {
  if (typeof x === "string" && x.trim()) return [x.trim()];
  return Array.isArray(x)
    ? x.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function crawlConfigObject(
  crawlConfig: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return crawlConfig && typeof crawlConfig === "object" ? crawlConfig : {};
}

function qualityPolicyObject(
  crawlConfig: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const cfg = crawlConfigObject(crawlConfig);
  const raw = cfg.quality_policy ?? cfg.qualityPolicy;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

function inferredPolicy(args: {
  sourceType: string;
  sourceUrl?: string | null;
  crawlConfig?: Record<string, unknown> | null;
}): SourceQualityPolicy {
  const cfg = crawlConfigObject(args.crawlConfig);
  const contentType = valueAsString(cfg.content_type)?.toLowerCase() ?? "";
  const category = valueAsString(cfg.category)?.toLowerCase() ?? "";
  const source = args.sourceType.toLowerCase();
  const url = (args.sourceUrl ?? "").toLowerCase();

  if (source === "arxiv" || contentType === "paper" || url.includes("arxiv.org")) {
    return {
      minFullTextWords: 35,
      minSummaryWords: 12,
      profile: "paper_abstract",
      policySource: "inferred",
    };
  }

  if (contentType === "docs" || category === "docs") {
    return {
      minFullTextWords: 120,
      minSummaryWords: 12,
      profile: "docs",
      policySource: "inferred",
    };
  }

  if (category === "spec" || source.includes("spec")) {
    return {
      minFullTextWords: 80,
      minSummaryWords: 12,
      profile: "spec",
      policySource: "inferred",
    };
  }

  if (
    contentType === "research" ||
    category === "research" ||
    category === "academia" ||
    source.includes("research")
  ) {
    return {
      minFullTextWords: 260,
      minSummaryWords: 18,
      profile: "research_article",
      policySource: "inferred",
    };
  }

  if (
    contentType === "article" ||
    contentType === "blog" ||
    category === "blog" ||
    category === "lab_announcement" ||
    category === "enterprise"
  ) {
    return {
      minFullTextWords: 200,
      minSummaryWords: 12,
      profile: "article",
      policySource: "inferred",
    };
  }

  return { ...DEFAULT_POLICY };
}

export function sourcePolicy(args: {
  sourceType: string;
  sourceUrl?: string | null;
  crawlConfig?: Record<string, unknown> | null;
}): SourceQualityPolicy {
  const inferred = inferredPolicy(args);
  const qp = qualityPolicyObject(args.crawlConfig);
  if (!qp) return inferred;

  const requiredMarkers = arrayOfStrings(qp.required_markers ?? qp.requiredMarkers)
    .map(safeRegex)
    .filter((x): x is RegExp => Boolean(x));
  const forbiddenMarkers = arrayOfStrings(qp.forbidden_markers ?? qp.forbiddenMarkers)
    .map(safeRegex)
    .filter((x): x is RegExp => Boolean(x));

  return {
    minFullTextWords:
      valueAsNumber(qp.min_full_text_words) ??
      valueAsNumber(qp.minFullTextWords) ??
      valueAsNumber(qp.min_body_words) ??
      valueAsNumber(qp.minBodyWords) ??
      inferred.minFullTextWords,
    minSummaryWords:
      valueAsNumber(qp.min_summary_words) ??
      valueAsNumber(qp.minSummaryWords) ??
      inferred.minSummaryWords,
    profile: valueAsString(qp.profile) ?? inferred.profile,
    policySource: "crawl_config",
    requireRealArticleMarkers:
      requiredMarkers.length > 0
        ? requiredMarkers
        : inferred.requireRealArticleMarkers,
    forbiddenMarkers:
      forbiddenMarkers.length > 0 ? forbiddenMarkers : inferred.forbiddenMarkers,
  };
}

function assessment(args: {
  bodyKind: BodyKind;
  qualityScore: number;
  degraded: boolean;
  degradedReasons: string[];
  bodyChars: number;
  wordCount: number;
  policy: SourceQualityPolicy;
}): QualityAssessment {
  return {
    bodyKind: args.bodyKind,
    qualityScore: args.qualityScore,
    degraded: args.degraded,
    degradedReasons: args.degradedReasons,
    bodyChars: args.bodyChars,
    wordCount: args.wordCount,
    policyProfile: args.policy.profile,
    policySource: args.policy.policySource,
    minFullTextWords: args.policy.minFullTextWords,
    minSummaryWords: args.policy.minSummaryWords,
  };
}

export function assessBodyQuality(args: {
  sourceType: string;
  sourceUrl?: string | null;
  crawlConfig?: Record<string, unknown> | null;
  method: ExtractionMethod | string;
  body: string;
}): QualityAssessment {
  const body = normalizeBodyText(args.body);
  const policy = sourcePolicy(args);
  const words = wordCount(body);
  const reasons: string[] = [];

  if (!body) {
    return assessment({
      bodyKind: "metadata_only",
      qualityScore: 0,
      degraded: true,
      degradedReasons: ["empty_body"],
      bodyChars: 0,
      wordCount: 0,
      policy,
    });
  }

  if (hasChallengeShell(body)) reasons.push("challenge_shell");
  if (hasLoadingShell(body)) reasons.push("loading_shell");
  if (policy.forbiddenMarkers?.some((pattern) => pattern.test(body))) {
    reasons.push("forbidden_marker");
  }
  if (words < policy.minSummaryWords) reasons.push("too_short_for_summary");
  if (words < policy.minFullTextWords) reasons.push("too_short_for_full_text");

  const missingMarker =
    policy.requireRealArticleMarkers?.some((pattern) => pattern.test(body)) === false;
  if (missingMarker) reasons.push("missing_source_article_markers");

  if (reasons.includes("challenge_shell") || reasons.includes("forbidden_marker")) {
    return assessment({
      bodyKind: "blocked",
      qualityScore: 0,
      degraded: true,
      degradedReasons: reasons,
      bodyChars: body.length,
      wordCount: words,
      policy,
    });
  }

  if (reasons.includes("loading_shell")) {
    return assessment({
      bodyKind: "degraded",
      qualityScore: 0.1,
      degraded: true,
      degradedReasons: reasons,
      bodyChars: body.length,
      wordCount: words,
      policy,
    });
  }

  if (
    words >= policy.minFullTextWords &&
    !reasons.includes("missing_source_article_markers")
  ) {
    const lengthScore = Math.min(1, words / Math.max(policy.minFullTextWords * 2, 1));
    return assessment({
      bodyKind: "full_text",
      qualityScore: Math.max(0.75, Math.round(lengthScore * 100) / 100),
      degraded: false,
      degradedReasons: [],
      bodyChars: body.length,
      wordCount: words,
      policy,
    });
  }

  if (words >= policy.minSummaryWords) {
    return assessment({
      bodyKind: "source_summary",
      qualityScore: 0.35,
      degraded: false,
      degradedReasons: reasons.filter((r) => r !== "too_short_for_full_text"),
      bodyChars: body.length,
      wordCount: words,
      policy,
    });
  }

  return assessment({
    bodyKind: "metadata_only",
    qualityScore: 0.15,
    degraded: true,
    degradedReasons: reasons,
    bodyChars: body.length,
    wordCount: words,
    policy,
  });
}

export function bodyKindAllowsFullEnrichment(kind: BodyKind | string | undefined): boolean {
  return kind === "full_text";
}

export function contentExtractMetadata(
  metadata: Record<string, unknown> | null | undefined,
): {
  body_kind?: BodyKind;
  output_hash?: string;
  extractor_version?: string;
  degraded?: boolean;
  fetched_at?: string;
  method?: string;
} | null {
  const raw = metadata?.content_extract;
  if (!raw || typeof raw !== "object") return null;
  return raw as {
    body_kind?: BodyKind;
    output_hash?: string;
    extractor_version?: string;
    degraded?: boolean;
    fetched_at?: string;
    method?: string;
  };
}

export function documentBodyKind(
  metadata: Record<string, unknown> | null | undefined,
): BodyKind | undefined {
  return contentExtractMetadata(metadata)?.body_kind;
}

export function isFullTextDocument(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return bodyKindAllowsFullEnrichment(documentBodyKind(metadata));
}
