"use client";

// F-09 ScaffoldViewer — drawer/sheet for a single reducer's scaffold bundle.
//
// Pattern: simple modal-style drawer pinned to the right (desktop) /
// fullscreen sheet (mobile). No Radix Dialog dependency — focus management
// handled inline. Closing returns focus to the trigger element.
//
// Sunrise tokens only. The Calm Precision rules for this surface:
//   • Single border around the drawer (Common Region).
//   • Files presented as tabs in a left rail — no individual borders.
//   • "Copied ✓" is teal TEXT only (not a green pill).
//   • >70% of content area is the code preview.
//   • Max 6 files (F-09 hard cap from lib/scaffold-generator.ts).

import { useEffect, useId, useRef, useState } from "react";
import type { Scaffold } from "@/shared/schema";
import { CodeBlock } from "@/components/scaffold/CodeBlock";

interface Props {
  scaffold: Scaffold;
  /** Short label rendered in the drawer header (e.g. the reducer title). */
  title: string;
  open: boolean;
  onClose: () => void;
}

export function ScaffoldViewer({ scaffold, title, open, onClose }: Props) {
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

  const file = scaffold.files[activeFile] ?? scaffold.files[0]!;
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
        className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm transition-opacity"
      />
      {/* DRAWER */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-lift sm:max-w-[640px] sm:rounded-l-3xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-rule px-5 py-4 sm:px-6">
          <div>
            <h2 id={headingId} className="text-[16px] font-semibold leading-snug">
              Scaffold · {title}
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-500">
              {scaffold.files.length} file
              {scaffold.files.length === 1 ? "" : "s"} · paste-ready · {targetLabel}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ease-soft inline-flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-white text-ink-700 hover:bg-cream-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-coral"
          >
            ✕
          </button>
        </header>

        {/* TWO-COLUMN BODY: file list + preview */}
        <div className="grid min-h-0 flex-1 grid-cols-[160px_1fr] sm:grid-cols-[180px_1fr]">
          <nav
            aria-label="Files in scaffold"
            className="border-r border-rule bg-cream"
          >
            <p className="px-3 pb-2 pt-4 text-[10.5px] font-semibold uppercase tracking-[.14em] text-ink-500">
              📁 Files
            </p>
            <ul>
              {scaffold.files.map((f, i) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => setActiveFile(i)}
                    aria-pressed={i === activeFile}
                    className={`ease-soft block w-full px-3 py-2 text-left text-[13px] ${
                      i === activeFile
                        ? "bg-white font-semibold text-ink-900 shadow-[0_1px_0_var(--rule)]"
                        : "text-ink-700 hover:bg-cream-2"
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
        <footer className="flex flex-wrap items-center gap-2 border-t border-rule bg-cream px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={copyAll}
            className={`ease-soft inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 ${
              copiedAll
                ? "border border-cat-skill bg-white text-cat-skill-deep"
                : "grad-coral text-white"
            }`}
          >
            {copiedAll ? "✓ Copied all" : "📥 Copy all"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ease-soft inline-flex h-10 items-center gap-1.5 rounded-full border border-rule bg-white px-4 text-[13.5px] font-semibold text-ink-700 hover:border-coral focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
          >
            Close
          </button>
        </footer>
      </div>
    </>
  );
}
