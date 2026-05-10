import type { NextConfig } from "next";

// PRD §22.4 — security headers (PWA wrapper deferred per OQ-02 fallback).
//
// `@ducanh2912/next-pwa` injects a webpack config; Next 16 defaults to Turbopack
// which rejects mixed webpack/Turbopack config (verified 2026-05-10 — see
// docs/OQ-02-pwa-fallback.md). We hand-roll a service worker in Phase 2 (F-07)
// instead, which works with Turbopack natively. PRD §3 marks F-07 as nice-to-have.
const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow async server actions in Node runtime where AsyncLocalStorage works
    serverActions: { bodySizeLimit: "1mb" },
  },
  // Empty turbopack config silences the warning when build-loop later wires hand-rolled SW.
  turbopack: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: https:; " +
              "connect-src 'self' https://api.groq.com https://api.resend.com; " +
              "frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
};

export default config;
