"use client";

// lib/search-scope/context.tsx — Track A: client-side search-scope state.
//
// Source of truth precedence (locked by plan §A4):
//   1. Server (users.search_scope_default), hydrated once on mount via
//      GET /api/users/me/search-scope. Authed users only.
//   2. localStorage ('aida:search_scope') — fallback for guests AND
//      pre-server-hydration paint.
//   3. Hardcoded 'focused' default.
//
// On toggle for an authed user, we PATCH the server FIRST, then mirror to
// localStorage. On failure we revert and surface a console warning (the
// pill is silent; the operation is best-effort and the user can retry).
//
// Guests skip the server hop and only write to localStorage.

import * as React from "react";

export type SearchScope = "focused" | "broad";

const LS_KEY = "aida:search_scope";
const SERVER_ENDPOINT = "/api/users/me/search-scope";

interface SearchScopeState {
  scope: SearchScope;
  isAuthed: boolean;
  isLoaded: boolean;
}

interface SearchScopeContextValue extends SearchScopeState {
  setScope: (next: SearchScope) => Promise<void>;
}

const SearchScopeContext = React.createContext<SearchScopeContextValue | null>(
  null,
);

function readLocalStorageScope(): SearchScope | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "focused" || v === "broad") return v;
    return null;
  } catch {
    return null;
  }
}

function writeLocalStorageScope(scope: SearchScope): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, scope);
  } catch {
    // Quota / disabled storage — degrade silently.
  }
}

export interface SearchScopeProviderProps {
  isAuthed: boolean;
  children: React.ReactNode;
}

export function SearchScopeProvider({
  isAuthed,
  children,
}: SearchScopeProviderProps) {
  // Initial render: pull from localStorage when available so we don't
  // flash 'focused' for a Broad user. Server hydration happens in effect.
  const [state, setState] = React.useState<SearchScopeState>(() => ({
    scope: readLocalStorageScope() ?? "focused",
    isAuthed,
    isLoaded: false,
  }));

  // Authed users — hydrate from the server on mount.
  React.useEffect(() => {
    let cancelled = false;
    if (!isAuthed) {
      setState((prev) => ({ ...prev, isLoaded: true }));
      return;
    }
    void (async () => {
      try {
        const res = await fetch(SERVER_ENDPOINT, { method: "GET" });
        if (!res.ok) {
          if (!cancelled) setState((prev) => ({ ...prev, isLoaded: true }));
          return;
        }
        const data = (await res.json()) as { scope?: SearchScope };
        const serverScope =
          data.scope === "focused" || data.scope === "broad"
            ? data.scope
            : "focused";
        if (cancelled) return;
        setState({ scope: serverScope, isAuthed: true, isLoaded: true });
        writeLocalStorageScope(serverScope);
      } catch {
        if (!cancelled) setState((prev) => ({ ...prev, isLoaded: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthed]);

  const setScope = React.useCallback(
    async (next: SearchScope) => {
      // Optimistic local update so the UI feels instant. Revert on server
      // failure for authed users.
      const previous = state.scope;
      setState((prev) => ({ ...prev, scope: next }));
      writeLocalStorageScope(next);
      if (!isAuthed) return;
      try {
        const res = await fetch(SERVER_ENDPOINT, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: next }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch (err) {
        console.warn("[search-scope] PATCH failed, reverting:", err);
        setState((prev) => ({ ...prev, scope: previous }));
        writeLocalStorageScope(previous);
      }
    },
    [isAuthed, state.scope],
  );

  const value = React.useMemo<SearchScopeContextValue>(
    () => ({ ...state, setScope }),
    [state, setScope],
  );

  return (
    <SearchScopeContext.Provider value={value}>
      {children}
    </SearchScopeContext.Provider>
  );
}

export function useSearchScope(): SearchScopeContextValue {
  const ctx = React.useContext(SearchScopeContext);
  if (!ctx) {
    // Soft fallback so a forgotten provider doesn't crash a page.
    // Consumers can still read the scope (it stays 'focused') but
    // setScope is a no-op.
    return {
      scope: "focused",
      isAuthed: false,
      isLoaded: true,
      setScope: async () => {},
    };
  }
  return ctx;
}
