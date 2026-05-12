"use client";

// F-09 ScaffoldViewer — drawer/sheet for a single reducer's scaffold bundle.
//
// Pattern: simple modal-style drawer pinned to the right (desktop) /
// fullscreen sheet (mobile). No Radix Dialog dependency — focus management
// handled inline. Closing returns focus to the trigger element.
//
// UI Guidelines v0.1 (ink-only). Calm Precision rules for this surface:
//   • Single border around the drawer (Common Region).
//   • Files presented as tabs in a left rail — no individual borders.
//   • "Copied ✓" is ink text on paper (no green pill).
//   • >70% of content area is the code preview.
//   • Max 6 files (F-09 hard cap from lib/scaffold-generator.ts).
//
// E4 — Interaction-state matrix (`resolveScaffoldViewerState()` in
// lib/component-state.ts is the test-covered resolver):
//
//   default   — drawer closed (`open=false`).
//   populated — `scaffold.files.length > 0` AND no loading/error/explicit empty.
//   loading   — `loading=true` (e.g. template fetch in flight).
//   success   — populated + after a "Copy all" succeeded (transient).
//   error     — `error` truthy (string message rendered in error variant).
//   empty     — `scaffold.files.length === 0` OR `empty=true` (template
//               not yet authored for `category`).

import { useEffect, useId, useRef, useState } from "react";
import type { Scaffold } from "@/shared/schema";
import { CodeBlock } from "@/components/scaffold/CodeBlock";
import { resolveScaffoldViewerState } from "@/lib/component-state";

interface Props {
  scaffold: Scaffold;
  /** Short label rendered in the drawer header (e.g. the reducer title). */
  title: string;
  open: boolean;
  onClose: () => void;
  /** E4: forces the loading variant — covers async template fetch UX. */
  loading?: boolean;
  /** E4: forces the error variant — pass a user-friendly message. */
  error?: string | null;
  /**
   * E4: explicit empty-state hint. Overrides files-length detection. Use
   * when scaffold is non-null but the template is not yet authored for
   * this drain category — pass the human-readable category for messaging.
   */
  empty?: boolean;
  /** E2: drain category surfaced in the empty-state message. */
  category?: string;
  /** E4: error retry callback. Shown next to the error message when set. */
  onRetry?: () => void;
}

export function ScaffoldViewer({
  scaffold,
  title,
  open,
  onClose,
  loading = false,
  error = null,
  empty = false,
  category,
  onRetry,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const [activeFile, setActiveFile] = useState(0);
  const [copiedAll, setCopiedAll] = useState(false);

  // Reset active file when the scaffold changes.
  useEffect(() => {
    setActiveFile(0);
  }, [scaffold]);

  // Focus the close button when opened (a11y).
  useEffect(() => {
    if (open) {
      closeBtnRef.current?.focus();
    }
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // E4: single source of truth for the rendered state.
  const viewState = resolveScaffoldViewerState({
    open,
    loading,
    error,
    empty,
    filesCount: scaffold.files.length,
    copiedAll,
  });

  // Files-array safety: empty/error/loading variants never index into files[].
  const file =
    scaffold.files.length > 0
      ? scaffold.files[activeFile] ?? scaffold.files[0]!
      : null;
  const targetLabel = scaffold.targets.includes("claude-code-skill") || scaffold.targets.includes("claude-code-plugin")
    ? "Claude Code + Codex"
    : "Codex";

  const copyAll = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    const joined = scaffold.files
      .map((f) => `### ${f.path}\n\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
      .join("\n\n");
    navigator.clipboard
      .writeText(joined)
      .then(() => {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 1800);
      })
      .catch(() => {
        /* silent */
      });
  };

  return (
    <>
      {/* BACKDROP */}
      <button
        type="button"
        aria-label="Close scaffold viewer"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm transition-opacity"
      />
      {/* DRAWER */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-paper shadow-card sm:max-w-[640px] sm:rounded-l-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 id={headingId} className="text-[16px] font-semibold leading-snug text-ink">
              Scaffold · {title}
            </h2>
            <p className="mt-0.5 text-[12px] text-mute">
              {viewState === "populated" || viewState === "success" ? (
                <>
                  {scaffold.files.length} file
                  {scaffold.files.length === 1 ? "" : "s"} · paste-ready · {targetLabel}
                </>
              ) : viewState === "loading" ? (
                "Preparing files…"
              ) : viewState === "error" ? (
                "Something went wrong"
              ) : (
                /* empty */ "No files yet"
              )}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper text-mute transition-colors hover:bg-line/40 hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          >
            ✕
          </button>
        </header>

        {/* BODY — branches on viewState */}
        {viewState === "loading" && (
          <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8"
            role="status"
            aria-live="polite"
            aria-label="Loading scaffold"
          >
            <span className="block h-3 w-48 rounded-full bg-line animate-pulse" />
            <span className="block h-3 w-64 rounded-full bg-line animate-pulse" />
            <span className="block h-3 w-32 rounded-full bg-line animate-pulse" />
            <p className="mt-2 text-[12.5px] text-mute">Generating files…</p>
          </div>
        )}

        {viewState === "error" && (
          <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
            role="alert"
          >
            <p className="text-[15px] font-semibold text-ink">
              Couldn't load this scaffold.
            </p>
            <p className="max-w-sm text-[13px] text-mute">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-ink bg-paper px-4 text-[13.5px] font-semibold text-ink transition-colors hover:bg-line/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {viewState === "empty" && (
          <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
            role="status"
          >
            <p className="text-[15px] font-semibold text-ink">
              Template not yet available
              {category ? ` for ${category}` : ""}.
            </p>
            <p className="max-w-sm text-[13px] text-mute">
              We don't have a paste-ready scaffold for this drain category
              yet. The skill description and steps are still in the
              recommendation above. Copy that to get started.
            </p>
          </div>
        )}

        {(viewState === "populated" || viewState === "success") && file && (
          <>
            {/* TWO-COLUMN BODY: file list + preview */}
            <div className="grid min-h-0 flex-1 grid-cols-[160px_1fr] sm:grid-cols-[180px_1fr]">
              <nav
                aria-label="Files in scaffold"
                className="border-r border-line bg-paper"
              >
                <p className="px-3 pb-2 pt-4 text-[10.5px] font-semibold uppercase tracking-[.14em] text-mute">
                  📁 Files
                </p>
                <ul>
                  {scaffold.files.map((f, i) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => setActiveFile(i)}
                        aria-pressed={i === activeFile}
                        className={`block w-full px-3 py-2 text-left text-[13px] transition-colors ${
                          i === activeFile
                            ? "bg-line/40 font-semibold text-ink"
                            : "text-mute hover:bg-line/40 hover:text-ink"
                        }`}
                      >
                        <span className="mr-1.5 opacity-60" aria-hidden>
                          📄
                        </span>
                        {f.path}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="min-h-0 overflow-auto p-4 sm:p-5">
                <CodeBlock
                  code={file.content}
                  language={file.language}
                  filename={file.path}
                />
              </div>
            </div>

            {/* FOOTER — primary actions */}
            <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-paper px-5 py-3 sm:px-6">
              <button
                type="button"
                onClick={copyAll}
                className={`inline-flex h-10 items-center gap-1.5 rounded-[10px] border px-4 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 ${
                  copiedAll
                    ? "border-ink bg-paper text-ink"
                    : "border-ink bg-ink text-paper shadow-card hover:bg-ink/90"
                }`}
              >
                {copiedAll ? "✓ Copied all" : "📥 Copy all"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-ink bg-paper px-4 text-[13.5px] font-semibold text-ink transition-colors hover:bg-line/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
              >
                Close
              </button>
            </footer>
          </>
        )}
      </div>
    </>
  );
}
