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
  title: "Decision Doctor",
  description: "Transparent decisions for solo healthcare practitioners.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#9a3412",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="F"
      className={`${inter.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen bg-bg text-text">{children}</body>
    </html>
  );
}
