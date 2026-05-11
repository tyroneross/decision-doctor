"use client";

// C12 — A/B/F theme picker.
//
// Three radio-style cards (F default, A Case File, B Conversation). Picking
// one writes to localStorage["dd:theme"] AND mutates
// <html>.dataset.theme so the page re-skins instantly without a reload.
//
// SSR-safe: the root layout (app/layout.tsx) renders <html data-theme="F">
// on the server, then a tiny inline <script> in <head> reads localStorage
// synchronously BEFORE first paint and applies the saved choice. This
// component is purely the write surface; the read happens earlier in the
// boot sequence.
//
// Per UI Guidelines v0.1: ink-only on bone. Visual preview comes from
// rendering three mini-cards that themselves carry the data-theme override
// inline (via dangerouslySetInnerHTML for the inline style? — no, simpler:
// each card uses inline style:vars to depict that theme's tokens without
// affecting the rest of the page).

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

export type ThemeKey = "F" | "A" | "B";

const THEMES: Array<{
  key: ThemeKey;
  name: string;
  description: string;
  // Inline preview vars — must mirror the [data-theme] blocks in globals.css.
  preview: {
    bg: string;
    paper: string;
    ink: string;
    text: string;
    mute: string;
    line: string;
  };
}> = [
  {
    key: "F",
    name: "Terracotta on bone (default)",
    description: "Warm, calm. The system's primary look.",
    preview: {
      bg: "#faf6f0",
      paper: "#ffffff",
      ink: "#9a3412",
      text: "#1f1410",
      mute: "#6b5d52",
      line: "#e8dfd4",
    },
  },
  {
    key: "A",
    name: "Case File",
    description: "Formal blue accent on warm white.",
    preview: {
      bg: "#fafaf8",
      paper: "#ffffff",
      ink: "#1e3a8a",
      text: "#0f172a",
      mute: "#64748b",
      line: "#e2e8f0",
    },
  },
  {
    key: "B",
    name: "Conversation",
    description: "Muted red on cool grey.",
    preview: {
      bg: "#f7f7f6",
      paper: "#ffffff",
      ink: "#b91c1c",
      text: "#1c1917",
      mute: "#78716c",
      line: "#e7e5e4",
    },
  },
];

const STORAGE_KEY = "dd:theme";

export function ThemePicker() {
  const [active, setActive] = useState<ThemeKey>("F");

  // On mount: read the current theme from <html>.dataset (set by the inline
  // boot script) so the radio reflects reality.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const current = document.documentElement.dataset.theme;
    if (current === "A" || current === "B" || current === "F") {
      setActive(current);
    }
  }, []);

  const select = (key: ThemeKey) => {
    setActive(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* storage disabled — fail silent, the in-memory choice still applies */
    }
    document.documentElement.setAttribute("data-theme", key);
  };

  return (
    <fieldset>
      <legend className="text-[11px] font-semibold uppercase tracking-[.14em] text-mute">
        Theme
      </legend>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {THEMES.map((t) => {
          const selected = active === t.key;
          return (
            <label
              key={t.key}
              className={
                "block cursor-pointer rounded-xl border transition-colors " +
                (selected
                  ? "border-ink shadow-card"
                  : "border-line hover:border-ink/60")
              }
            >
              <input
                type="radio"
                name="dd-theme"
                value={t.key}
                checked={selected}
                onChange={() => select(t.key)}
                className="sr-only"
                aria-label={`${t.name} theme`}
              />
              <Card flat flush className="p-4">
                {/* Preview swatch — paints with this theme's tokens inline
                    so the swatch always reflects the underlying values,
                    even before localStorage write. */}
                <div
                  className="mb-3 h-16 rounded-md border"
                  style={{
                    background: t.preview.bg,
                    borderColor: t.preview.line,
                  }}
                  aria-hidden
                >
                  <div className="flex h-full items-center gap-2 px-3">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: t.preview.ink }}
                    />
                    <span
                      className="text-[12px] font-semibold"
                      style={{ color: t.preview.text }}
                    >
                      Decision
                    </span>
                    <span
                      className="text-[11px]"
                      style={{ color: t.preview.mute }}
                    >
                      · sample
                    </span>
                  </div>
                </div>
                <p className="text-[13.5px] font-semibold leading-snug text-ink">
                  {t.name}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-mute">
                  {t.description}
                </p>
                {selected && (
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[.12em] text-ok">
                    ✓ Selected
                  </p>
                )}
              </Card>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-mute">
        Your choice is saved on this device. Themes don't change layout —
        just the accent color and surface tones.
      </p>
    </fieldset>
  );
}
