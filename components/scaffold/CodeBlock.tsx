"use client";

// F-09 CodeBlock — syntax-highlighted preview with per-file copy.
//
// UI Guidelines v0.1 (ink-only). "Copied ✓" is an ink-on-paper chip with
// a small icon (no green pill — Calm Precision §"Signal-to-noise" still
// applies, just rendered without color). Lazy-loads react-syntax-highlighter
// so the initial bundle stays light; the highlighter ships only when a
// scaffold is actually opened.
//
// E4 — Interaction-state matrix (`resolveCodeBlockState()` in
// lib/component-state.ts is the test-covered resolver):
//
//   default   — n/a; CodeBlock is always mounted with a code prop.
//   populated — `code` non-empty, no loading/error/copied.
//   loading   — `loading=true` (highlighter chunk fetching, etc).
//   success   — transient after a successful copy (1.8s).
//   error     — `error` truthy (e.g. clipboard denied AND user expected
//               feedback). Friendly text + optional retry.
//   empty     — `code === ""` — renders a "No content" placeholder rather
//               than an empty <pre>.

import { useEffect, useState, lazy, Suspense } from "react";
import { resolveCodeBlockState } from "@/lib/component-state";

// Lazy load — keep client bundle small for the >90% of decisions where the
// scaffold viewer isn't opened.
const Highlighter = lazy(() =>
  import("react-syntax-highlighter/dist/cjs/light").then((mod) => ({
    default: mod.default,
  })),
);

interface Props {
  code: string;
  language: "markdown" | "json" | "yaml" | "bash" | "typescript";
  /** Showed above the preview as a small file-name pill (monospace). */
  filename?: string;
  /** E4: forces the loading variant. */
  loading?: boolean;
  /** E4: forces the error variant — pass a friendly message. */
  error?: string | null;
  /** E4: error retry callback. */
  onRetry?: () => void;
}

export function CodeBlock({
  code,
  language,
  filename,
  loading = false,
  error = null,
  onRetry,
}: Props) {
  const [copied, setCopied] = useState(false);

  // Reset copied state when code changes (e.g. user switches files).
  useEffect(() => {
    setCopied(false);
  }, [code]);

  const onCopy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        /* clipboard denied — silent fail; user can select+copy manually */
      });
  };

  // E4: resolve the rendered state. Tests in component-state.test.ts cover
  // every branch — see lib/component-state.ts.
  const viewState = resolveCodeBlockState({
    code,
    loading,
    error,
    copied,
  });

  return (
    <div className="rounded-xl border border-line bg-paper">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <span className="font-mono text-[12.5px] text-ink">
          {filename ?? language}
        </span>
        {(viewState === "populated" || viewState === "success") && (
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? "Copied to clipboard" : "Copy file contents"}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 ${
              copied
                ? "border-ink bg-paper text-ink"
                : "border-line bg-paper text-mute hover:border-ink hover:text-ink"
            }`}
          >
            {copied ? (
              <>
                <CheckIcon /> Copied
              </>
            ) : (
              <>📋 Copy</>
            )}
          </button>
        )}
      </header>
      <div className="overflow-auto bg-paper px-4 py-3">
        {viewState === "loading" && (
          <div
            className="space-y-2 py-2"
            role="status"
            aria-live="polite"
            aria-label="Loading code preview"
          >
            <span className="block h-3 w-3/4 rounded-full bg-line animate-pulse" />
            <span className="block h-3 w-full rounded-full bg-line animate-pulse" />
            <span className="block h-3 w-2/3 rounded-full bg-line animate-pulse" />
          </div>
        )}
        {viewState === "error" && (
          <div className="py-2" role="alert">
            <p className="text-[13px] font-semibold text-ink">
              Couldn't load this file.
            </p>
            <p className="mt-0.5 text-[12.5px] text-mute">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-ink bg-paper px-3 text-[12px] font-semibold text-ink transition-colors hover:bg-line/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {viewState === "empty" && (
          <p className="py-2 text-[12.5px] italic text-mute">
            No content for this file.
          </p>
        )}
        {(viewState === "populated" || viewState === "success") && (
          <Suspense
            fallback={
              <pre className="font-mono text-[12px] leading-relaxed text-ink">
                {code}
              </pre>
            }
          >
            <Highlighter
              language={language}
              customStyle={{
                background: "transparent",
                padding: 0,
                margin: 0,
                fontSize: "12px",
                lineHeight: 1.55,
                fontFamily: "ui-monospace, Menlo, monospace",
              }}
              useInlineStyles={false}
            >
              {code}
            </Highlighter>
          </Suspense>
        )}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
