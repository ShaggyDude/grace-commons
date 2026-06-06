// app/layout.tsx — root layout (BUILD_PLAN §3 / §7.8).
//
// Renders <html>/<body> and pulls in render 1's COMPILED Inks.css verbatim from
// /beacon.css (served from public/) so the second render is pixel-identical "by
// construction" — the components below only change JSX host (hono/jsx → React),
// never the classes. (Re-wiring Tailwind v4's PostCSS into the Next build was
// deliberately skipped in favour of reusing the proven compiled stylesheet;
// logged in CORNERS.md. The Tailwind source still lives in styles/.)
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "Beacon Clinical Research",
    template: "%s — Beacon Clinical Research",
  },
  description:
    "Grace Commons Demo 2 — second render (Next.js App Router + PostgreSQL + RSC). " +
    "Same compositions, action codes, and hash-chain contract as the first render.",
  icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
  manifest: "/manifest.json",
};

export const viewport: Viewport = { themeColor: "#1e3a8a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen inks-gray-0">
        {/* React 19 hoists this stylesheet link into <head> and dedupes it. */}
        <link rel="stylesheet" href="/beacon.css" precedence="default" />
        {children}
      </body>
    </html>
  );
}
