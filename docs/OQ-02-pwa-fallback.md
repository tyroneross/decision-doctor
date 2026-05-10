# OQ-02 — `@ducanh2912/next-pwa` × Next.js 16 compatibility

**Status:** ❌ Incompatible. Falling back to hand-rolled service worker (PRD §20 sanctioned fallback).

## What we tried

1. Installed `@ducanh2912/next-pwa@10.2.0` per PRD §22.1.
2. Wrapped `next.config.ts` with `withPWA()` per PRD §22.4.
3. Ran `pnpm build` — hard fail.

## What broke

```
⨯ ERROR: This build is using Turbopack, with a `webpack` config and no `turbopack` config.
   This may be a mistake.

   As of Next.js 16 Turbopack is enabled by default and
   custom webpack configurations may need to be migrated to Turbopack.

   NOTE: your `webpack` config may have been added by a configuration plugin.
```

The `withPWAInit` wrapper injects a webpack-only configuration block (`config.webpack = ...`). Next 16 defaults to Turbopack and refuses to silently ignore the webpack config. `--webpack` flag would force webpack-only build but loses Turbopack's speed and emits a deprecation warning.

## Decision (per PRD §20 OQ-02 fallback)

> "fallback = hand-rolled service worker (~30 min XS)"

- ✅ Removed `@ducanh2912/next-pwa` dep and `withPWA(config)` wrapper.
- ✅ Added `turbopack: {}` to `next.config.ts` to silence the empty-config warning when SW is later wired.
- ⏳ Hand-rolled service worker = Phase 2 / F-07 (build-loop owns).

## Implementation plan for the hand-rolled SW (F-07)

1. `public/sw.js` (vanilla, no Workbox dep) — implements:
   - Pre-cache: app shell, decision-template JSON, manifest, icons
   - Runtime cache strategies:
     - `/app/decisions/new/*` → NetworkFirst (3s timeout, fallback to cache)
     - `/api/templates` → CacheFirst, max-age 24 h
     - All other GET → NetworkOnly
   - On `install`: pre-cache + `skipWaiting()`
   - On `activate`: cleanup old caches + `clients.claim()`
   - On `fetch`: route per strategy
   - Background sync API for queued submissions (T-07)
2. `app/(app)/layout.tsx` — registers SW client-side: `navigator.serviceWorker.register('/sw.js')`
3. `public/manifest.json` — PWA manifest (name, icons, start_url, display: standalone)
4. `app/(app)/decisions/new/[templateId]/page.tsx` — IndexedDB-backed form-state hydration
5. Test: T-07 manual install on real phone

Estimated: ~30–45 min (PRD §20).

## Source

Local build attempt 2026-05-10. Re-verify if Next 17 / `@ducanh2912/next-pwa` >= 11 ships Turbopack support.
