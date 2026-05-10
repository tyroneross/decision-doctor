"use client";

// F-09 CodeBlock — syntax-highlighted preview with per-file copy.
//
// Sunrise tokens only. "Copied ✓" is teal TEXT (no green pill — Calm
// Precision §"Signal-to-noise"). Lazy-loads react-syntax-highlighter so the
// initial bundle stays light; the highlighter ships only when a scaffold is
// actually opened.

import { useEffect, useState, lazy, Suspense } from "react";

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
}

export function CodeBlock({ code, language, filename }: Props) {
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

  return (
    <div className="rounded-2xl border border-rule bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2">
        <span className="font-mono text-[12.5px] text-ink-700">
          {filename ?? language}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "Copied to clipboard" : "Copy file contents"}
          className={`ease-soft inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 ${
            copied
              ? "border-cat-skill text-cat-skill-deep"
              : "border-rule bg-white text-ink-700 hover:border-cat-skill hover:text-cat-skill-deep"
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
      </header>
      <div className="overflow-auto bg-cream-2 px-4 py-3">
        <Suspense
          fallback={
            <pre className="font-mono text-[12px] leading-relaxed text-ink-900">
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
