import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Inter 300–800, IBM Plex Mono 400/500. Loaded via next/font/google
// (no FOIT, no external network at runtime). CSS variables consumed
// by tailwind.config.ts fontFamily entries.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aida",
  description: "Let AI help you so you can help others.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#9a3412",
};

// Inline pre-hydration script — runs synchronously before first paint to
// apply the user's saved theme from localStorage. Falls back to F (default)
// when no preference is stored. Wrapped in try/catch so a hostile or
// disabled storage backend never breaks paint. See
// components/settings/ThemePicker.tsx for the write side.
const themeInitScript = `(function(){try{var t=localStorage.getItem("dd:theme");if(t==="A"||t==="B"||t==="F"){document.documentElement.setAttribute("data-theme",t);}}catch(_){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="F"
      className={`${inter.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-bg text-text">{children}</body>
    </html>
  );
}
