import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

// PRD §22.4 — PWA wrapper + security headers + runtime caching for templates / intake pages
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        // Intake pages — show cached version while revalidating
        urlPattern: /\/app\/decisions\/new\/.*$/,
        handler: "NetworkFirst",
        options: { cacheName: "intake-pages" },
      },
      {
        // Decision template definitions — cache for a day
        urlPattern: /\/api\/templates$/,
        handler: "CacheFirst",
        options: {
          cacheName: "decision-templates",
          expiration: { maxAgeSeconds: 60 * 60 * 24 },
        },
      },
    ],
  },
});

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow async server actions to run in the Node runtime where AsyncLocalStorage works
    serverActions: { bodySizeLimit: "1mb" },
  },
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

export default withPWA(config);
