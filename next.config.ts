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
  async redirects() {
    // U5: /app/decisions/* → /app/history/* (permanent — 308).
    // Both the list page and all sub-paths are covered by the wildcard.
    return [
      {
        source: "/app/decisions/:path*",
        destination: "/app/history/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    // Dev needs 'unsafe-eval' for React Refresh; production stays strict.
    const isDev = process.env.NODE_ENV !== "production";
    const enableVercelToolbar =
      process.env.VERCEL === "1" &&
      process.env.VERCEL_PREVIEW_FEEDBACK_ENABLED !== "0";
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : `script-src 'self' 'unsafe-inline'${enableVercelToolbar ? " https://vercel.live" : ""}`;
    const styleSrc = `style-src 'self' 'unsafe-inline'${enableVercelToolbar ? " https://vercel.live" : ""}`;
    const connectSrc = `connect-src 'self' https://api.groq.com https://api.resend.com${enableVercelToolbar ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`;
    const imgSrc = `img-src 'self' data: https:${enableVercelToolbar ? " blob:" : ""}`;
    const frameSrc = enableVercelToolbar
      ? "frame-src https://vercel.live"
      : "";
    const fontSrc = enableVercelToolbar
      ? "font-src 'self' https://vercel.live https://assets.vercel.com"
      : "";
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
              scriptSrc + "; " +
              styleSrc + "; " +
              imgSrc + "; " +
              connectSrc + "; " +
              (frameSrc ? frameSrc + "; " : "") +
              (fontSrc ? fontSrc + "; " : "") +
              "frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
};

export default config;
