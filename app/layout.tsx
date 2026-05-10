import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decision Doctor",
  description:
    "Transparent decision engine for solo healthcare practitioners. Make a high-stakes business call in under 20 minutes — with the math made visible.",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
