/**
 * lib/theme.ts — Theme helpers for Decision Doctor.
 *
 * Read side: getInitialTheme() is called synchronously inside the inline
 * <script> in app/layout.tsx BEFORE React hydrates — that script is a
 * minified inline copy, not an import. This module is the canonical
 * source of truth for the read + write logic so tests cover it once.
 *
 * Write side: setTheme() is called by ThemePicker on each radio change.
 * No "Save" button — the selection is the action.
 *
 * Persistence: localStorage key "dd:theme". SSR-safe: guards on
 * typeof window/localStorage ensure this module can be imported in
 * Server Components (though only Client Components actually call these
 * fns at runtime).
 */

export type ThemeKey = "F" | "A" | "B";

export const THEME_STORAGE_KEY = "dd:theme" as const;

/** The list of valid theme keys — used for validation throughout. */
export const VALID_THEMES: readonly ThemeKey[] = ["F", "A", "B"];

/**
 * isThemeKey — type guard.
 * Returns true when `v` is a valid ThemeKey value.
 */
export function isThemeKey(v: unknown): v is ThemeKey {
  return v === "F" || v === "A" || v === "B";
}

/**
 * getInitialTheme — reads the user's saved theme preference.
 *
 * Priority:
 *  1. `document.documentElement.dataset.theme` — set by the inline boot
 *     script before React mounts; always reflects the current applied theme.
 *  2. localStorage["dd:theme"] — fallback when called in environments where
 *     the inline script has not run (unit tests, server rendering, etc.).
 *  3. "F" — the hard default.
 *
 * Safe to call in SSR (returns "F" immediately when window is absent).
 */
export function getInitialTheme(): ThemeKey {
  if (typeof document === "undefined") return "F";

  // Prefer the data attribute already applied to <html> by the boot script.
  const fromAttr = document.documentElement.getAttribute("data-theme");
  if (isThemeKey(fromAttr)) return fromAttr;

  // Fallback: read from localStorage directly.
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeKey(stored)) return stored;
  } catch {
    // localStorage unavailable (private-browsing restrictions, etc.) — ignore.
  }

  return "F";
}

/**
 * setTheme — applies a theme immediately and persists the choice.
 *
 * 1. Mutates `document.documentElement` attribute so CSS vars update
 *    instantly without a page reload.
 * 2. Writes to localStorage so the next cold-start restores the preference.
 *
 * Both steps are wrapped so a single failure (e.g. localStorage blocked)
 * never prevents the other from applying.
 *
 * Safe to call only in client-side contexts (no window guard needed because
 * the caller — ThemePicker — is a Client Component).
 */
export function setTheme(key: ThemeKey): void {
  document.documentElement.setAttribute("data-theme", key);

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, key);
  } catch {
    // Storage write failed — the in-session DOM mutation still applies.
  }
}
