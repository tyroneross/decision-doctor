'use client';

import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

interface Artifact {
  promptText?: string;
  playbookSteps?: string[];
  skillName?: string;
  claudeCode?: string;
  codex?: string;
}

interface ScaffoldViewerProps {
  artifact?: Artifact | null;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
}

type TabKey = 'code' | 'codex' | 'prompt';

/**
 * ScaffoldViewer: Desktop drawer / mobile full-screen sheet for viewing
 * paste-ready Claude Code and Codex artifacts. Per F-09 spec.
 *
 * Layout: Tab bar (Code, Codex, Prompt) + code block with copy button.
 * Mobile: Full-screen sheet with sticky close button.
 * Desktop: Right-side drawer at 40% viewport width.
 */
export function ScaffoldViewer({
  artifact,
  title = 'Scaffold',
  isOpen,
  onClose,
}: ScaffoldViewerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('code');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Determine which content to show
  let content = '';
  let contentType = 'text';

  if (activeTab === 'code' && artifact?.claudeCode) {
    content = artifact.claudeCode;
    contentType = 'code';
  } else if (activeTab === 'codex' && artifact?.codex) {
    content = artifact.codex;
    contentType = 'code';
  } else if (activeTab === 'prompt' && artifact?.promptText) {
    content = artifact.promptText;
    contentType = 'text';
  }

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[v0] Copy to clipboard failed:', err);
    }
  };

  const tabs: Array<{ key: TabKey; label: string; available: boolean }> = [
    { key: 'code', label: 'Claude Code', available: !!artifact?.claudeCode },
    { key: 'codex', label: 'Codex', available: !!artifact?.codex },
    { key: 'prompt', label: 'Prompt', available: !!artifact?.promptText },
  ];

  const availableTabs = tabs.filter((t) => t.available);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity md:hidden"
        onClick={onClose}
        aria-hidden
      />

      {/* Mobile: Full-screen sheet */}
      <div className="fixed inset-0 z-50 flex flex-col md:hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rule bg-cream-2/80 px-4 py-3 backdrop-blur">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            className="ease-soft inline-flex items-center justify-center rounded-full p-2 text-ink-700 hover:bg-cream-2 active:scale-95"
            aria-label="Close scaffold viewer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab bar */}
        {availableTabs.length > 0 && (
          <div className="flex items-center gap-1 border-b border-rule bg-cream px-4 py-2">
            {availableTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`ease-soft px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.key
                    ? 'bg-coral text-white'
                    : 'text-ink-700 hover:bg-cream-2'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto bg-cream p-4">
          {content ? (
            <pre className="rounded-lg bg-ink-900 p-4 text-xs text-white overflow-auto font-mono">
              <code>{content}</code>
            </pre>
          ) : (
            <p className="text-sm text-ink-500">No content available for this tab.</p>
          )}
        </div>

        {/* Copy button */}
        {content && (
          <div className="border-t border-rule bg-cream-2/60 px-4 py-3 backdrop-blur">
            <button
              onClick={handleCopy}
              className="ease-soft w-full inline-flex items-center justify-center gap-2 rounded-lg grad-skill px-4 py-2.5 text-sm font-medium text-white hover:shadow-md active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy to clipboard
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Desktop: Right-side drawer */}
      <div className="hidden fixed right-0 top-0 bottom-0 z-50 w-2/5 md:flex flex-col bg-white shadow-2xl md:border-l md:border-rule">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rule px-6 py-4">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            className="ease-soft inline-flex items-center justify-center rounded-full p-2 text-ink-700 hover:bg-cream-2 active:scale-95"
            aria-label="Close scaffold viewer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab bar */}
        {availableTabs.length > 0 && (
          <div className="flex items-center gap-1 border-b border-rule bg-cream px-6 py-3">
            {availableTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`ease-soft px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.key
                    ? 'bg-coral text-white'
                    : 'text-ink-700 hover:bg-cream-2'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto bg-cream p-6">
          {content ? (
            <pre className="rounded-lg bg-ink-900 p-4 text-xs text-white overflow-auto font-mono">
              <code>{content}</code>
            </pre>
          ) : (
            <p className="text-sm text-ink-500">No content available for this tab.</p>
          )}
        </div>

        {/* Copy button */}
        {content && (
          <div className="border-t border-rule bg-cream-2/60 px-6 py-4 backdrop-blur">
            <button
              onClick={handleCopy}
              className="ease-soft w-full inline-flex items-center justify-center gap-2 rounded-lg grad-skill px-4 py-2.5 text-sm font-medium text-white hover:shadow-md active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy to clipboard
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
