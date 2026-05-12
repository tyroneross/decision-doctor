"use client";

// AssetDetailDrawer — right-side drawer showing a plugin or skill detail.
// Tabs: Files (default), Edit (user-scoped only), Learn more (SSE).
//
// Calm Precision discipline:
//   - Single border on the drawer card, no inner borders between header/tabs/body
//     other than the divider between tabs and body.
//   - Action buttons muted until they have a valid target (e.g. Save is muted
//     until the user edits a field; Hide button shows Unhide when applicable).
//   - Status via text color only — no colored badges.

import * as React from "react";

type Kind = "plugin" | "skill";

interface Props {
  kind: Kind;
  id: string;
  onClose: () => void;
  onMutated: () => Promise<void> | void;
}

interface FileRow {
  id: string;
  path: string;
  content: string;
  contentType: string;
  sizeBytes: number;
}

interface DetailShape {
  id: string;
  title: string;
  description: string;
  version: string;
  scope: string;
  slug: string;
  isMine: boolean;
  isDismissed: boolean;
  forkedFromId: string | null;
  upstreamVersion: string | null;
  metadata: { audience?: string[] } | null;
  files: FileRow[];
  // Plugin-only:
  skillIds?: string[];
  // Skill-only:
  pluginIds?: string[];
}

type Tab = "files" | "edit" | "explain";

export function AssetDetailDrawer({ kind, id, onClose, onMutated }: Props) {
  const [detail, setDetail] = React.useState<DetailShape | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("files");
  const [activeFile, setActiveFile] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/${kind}s/${id}`);
      if (!r.ok) throw new Error(`Failed to load ${kind} (${r.status})`);
      const j = (await r.json()) as { plugin?: DetailShape; skill?: DetailShape };
      const d = j.plugin ?? j.skill ?? null;
      setDetail(d);
      if (d && d.files.length > 0) setActiveFile(d.files[0]!.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [kind, id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // ESC to close
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function doFork() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/${kind}s/${id}/fork`, { method: "POST" });
      if (!r.ok) throw new Error(`Fork failed (${r.status})`);
      await onMutated();
      // Reload detail to reflect the new state — but the forked copy has a new
      // ID. Switch to that detail view.
      const j = (await r.json()) as { id: string };
      // The simplest move is to close the drawer; user can open the fork from
      // the refreshed list. This keeps the interaction predictable.
      void j;
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doDismiss() {
    if (!detail || busy) return;
    setBusy(true);
    try {
      const method = detail.isDismissed ? "DELETE" : "POST";
      const r = await fetch(`/api/${kind}s/${id}/dismiss`, { method });
      if (!r.ok) throw new Error(`Dismiss action failed (${r.status})`);
      await onMutated();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!detail || busy) return;
    if (!detail.isMine) return;
    if (
      !confirm(
        `Delete your copy of "${detail.title}"? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(`/api/${kind}s/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Delete failed (${r.status})`);
      await onMutated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function doDownload() {
    if (!detail || busy) return;
    // Browser-managed: window-level navigation triggers Content-Disposition.
    window.location.href = `/api/${kind}s/${id}/download`;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${kind} detail`}
      className="fixed inset-0 z-50 flex"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-text/30" aria-hidden />
      {/* Drawer */}
      <div className="relative ml-auto h-full w-full max-w-2xl bg-paper border-l border-line shadow-card flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line">
          {!detail && !error && (
            <p className="text-[14px] text-mute">Loading…</p>
          )}
          {error && (
            <p className="text-[14px] text-text">
              <span className="font-semibold">Couldn&apos;t load:</span> {error}
            </p>
          )}
          {detail && (
            <>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="text-[18px] font-bold text-text">
                  {detail.title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="text-mute hover:text-text text-[18px] leading-none"
                  style={{ minHeight: 24, minWidth: 24 }}
                >
                  ×
                </button>
              </div>
              <p className="text-[13px] text-mute">
                {detail.scope === "global" ? "Global" : "Mine"} ·{" "}
                {kind === "plugin" ? "Plugin" : "Skill"} · v{detail.version}
                {detail.forkedFromId &&
                  ` · Forked (upstream v${detail.upstreamVersion ?? "?"})`}
              </p>
              {detail.description && (
                <p className="text-[14px] text-text mt-2 max-w-prose">
                  {detail.description}
                </p>
              )}
              {/* Action row */}
              <div className="flex flex-wrap gap-2 mt-3">
                <ActionButton
                  onClick={doFork}
                  disabled={busy}
                  primary={!detail.isMine}
                >
                  Fork into my library
                </ActionButton>
                <ActionButton onClick={doDownload} disabled={busy}>
                  Download .zip
                </ActionButton>
                <ActionButton onClick={doDismiss} disabled={busy} subdued>
                  {detail.isDismissed ? "Unhide" : "Hide"}
                </ActionButton>
                {detail.isMine && (
                  <ActionButton onClick={doDelete} disabled={busy} danger>
                    Delete
                  </ActionButton>
                )}
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        {detail && (
          <div className="px-5 pt-3 flex gap-4 border-b border-line">
            <TabButton active={tab === "files"} onClick={() => setTab("files")}>
              Files ({detail.files.length})
            </TabButton>
            {detail.isMine && (
              <TabButton active={tab === "edit"} onClick={() => setTab("edit")}>
                Edit
              </TabButton>
            )}
            <TabButton active={tab === "explain"} onClick={() => setTab("explain")}>
              Learn more
            </TabButton>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {detail && tab === "files" && (
            <FilesView
              files={detail.files}
              activePath={activeFile}
              onSelect={setActiveFile}
            />
          )}
          {detail && tab === "edit" && detail.isMine && (
            <EditView
              kind={kind}
              id={id}
              initial={{
                title: detail.title,
                description: detail.description,
                version: detail.version,
              }}
              onSaved={async () => {
                await onMutated();
                await load();
              }}
            />
          )}
          {detail && tab === "explain" && (
            <ExplainView kind={kind} id={id} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Sub-views -------------------------------------------------------------

function FilesView({
  files,
  activePath,
  onSelect,
}: {
  files: FileRow[];
  activePath: string | null;
  onSelect: (p: string) => void;
}) {
  const active = files.find((f) => f.path === activePath) ?? files[0];
  return (
    <div className="grid grid-cols-[200px_1fr] h-full">
      <nav className="border-r border-line overflow-y-auto" aria-label="Files">
        {files.length === 0 && (
          <p className="px-3 py-3 text-[13px] text-mute">No files.</p>
        )}
        {files.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f.path)}
            className={`w-full text-left px-3 py-2 text-[12px] truncate ${
              active?.path === f.path
                ? "bg-bg text-text font-medium"
                : "text-mute hover:text-text"
            }`}
            title={f.path}
          >
            {f.path}
          </button>
        ))}
      </nav>
      <div className="overflow-y-auto">
        {active ? (
          <pre className="px-4 py-3 text-[12px] whitespace-pre-wrap font-mono text-text">
            {active.content}
          </pre>
        ) : (
          <p className="px-4 py-3 text-[13px] text-mute">Select a file.</p>
        )}
      </div>
    </div>
  );
}

function EditView({
  kind,
  id,
  initial,
  onSaved,
}: {
  kind: Kind;
  id: string;
  initial: { title: string; description: string; version: string };
  onSaved: () => Promise<void> | void;
}) {
  const [title, setTitle] = React.useState(initial.title);
  const [description, setDescription] = React.useState(initial.description);
  const [version, setVersion] = React.useState(initial.version);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const dirty =
    title !== initial.title ||
    description !== initial.description ||
    version !== initial.version;

  async function onSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/${kind}s/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, version }),
      });
      if (!r.ok) throw new Error(`Save failed (${r.status})`);
      setSavedAt(Date.now());
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 py-4 space-y-3">
      <Field label="Title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-text focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </Field>
      <Field label="Description">
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-text focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </Field>
      <Field label="Version">
        <input
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-text focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </Field>
      <div className="flex items-center gap-3 pt-2">
        <ActionButton onClick={onSave} disabled={!dirty || saving} primary>
          {saving ? "Saving…" : "Save"}
        </ActionButton>
        {savedAt && !dirty && (
          <span className="text-[12px] text-mute">Saved.</span>
        )}
        {error && <span className="text-[12px] text-text">{error}</span>}
      </div>
    </div>
  );
}

function ExplainView({ kind, id }: { kind: Kind; id: string }) {
  const [question, setQuestion] = React.useState("");
  const [output, setOutput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function ask() {
    if (streaming) return;
    setStreaming(true);
    setError(null);
    setOutput("");
    try {
      const r = await fetch(`/api/assets/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, question: question || undefined }),
      });
      if (!r.ok || !r.body) {
        throw new Error(`Stream failed (${r.status})`);
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE frames are separated by \n\n; each starts with "data: ".
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!frame.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(frame.slice(6)) as
              | { type: "token"; text: string }
              | { type: "done" }
              | { type: "error"; message: string };
            if (evt.type === "token") {
              setOutput((p) => p + evt.text);
            } else if (evt.type === "error") {
              setError(evt.message);
            }
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="px-5 py-4 space-y-3">
      <p className="text-[13px] text-mute">
        Ask the AI to walk through this asset, or leave the field empty for a
        practitioner-friendly overview.
      </p>
      <textarea
        rows={2}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Optional: e.g. How would I apply this to weekly referral follow-ups?"
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-text focus:outline-none focus:ring-1 focus:ring-ink"
      />
      <ActionButton onClick={ask} disabled={streaming} primary>
        {streaming ? "Thinking…" : "Learn more"}
      </ActionButton>
      {error && <p className="text-[13px] text-text">Error: {error}</p>}
      {output && (
        <div className="mt-3 rounded-md border border-line bg-bg px-4 py-3 text-[14px] text-text whitespace-pre-wrap">
          {output}
        </div>
      )}
    </div>
  );
}

// ---- Tiny primitives -------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-mute mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pb-2 -mb-px text-[13px] font-medium transition-colors ${
        active
          ? "text-text border-b-2 border-ink"
          : "text-mute hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  children,
  disabled,
  primary,
  subdued,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
  subdued?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  // Muted-until-actionable: primary is muted when disabled.
  const base =
    "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors border";
  let cls: string;
  if (disabled) {
    cls = "bg-paper text-mute border-line cursor-not-allowed";
  } else if (primary) {
    cls = "bg-ink text-paper border-ink hover:opacity-90";
  } else if (danger) {
    cls = "bg-paper text-text border-line hover:border-text";
  } else if (subdued) {
    cls = "bg-paper text-mute border-line hover:text-text";
  } else {
    cls = "bg-paper text-text border-line hover:border-ink";
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${cls}`}
      style={{ minHeight: 32 }}
    >
      {children}
    </button>
  );
}
