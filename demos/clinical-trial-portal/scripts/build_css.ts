/**
 * Build CSS: Invoke Tailwind 4 CLI to generate static/styles.css
 * from styles/inkset.css.
 *
 * Usage: deno run -A scripts/build_css.ts
 */

import { execSync } from "node:child_process";

try {
  const cmd = `npx tailwindcss --input styles/tailwind.css --output static/styles.css`;
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
  console.log("✓ CSS build complete. Output: static/styles.css");
} catch (err) {
  console.error("CSS build failed:", err);
  // Fallback: create a minimal CSS so the server can still start
  console.log("Creating fallback minimal CSS...");
  await Deno.mkdir("./static", { recursive: true });
  const fallbackCss = `/* Beacon Clinical Research — Tailwind CSS (fallback) */
:root { color-scheme: light dark; }
body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; }
`;
  await Deno.writeTextFile("./static/styles.css", fallbackCss);
  console.log("✓ Fallback CSS ready.");
}
