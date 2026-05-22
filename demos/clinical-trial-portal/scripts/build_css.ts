/**
 * Build CSS: Invoke Tailwind 4 CLI to generate static/styles.css
 * from styles/inkset.css.
 *
 * Usage: deno run -A scripts/build_css.ts
 *   or:  deno task css
 *
 * Prefer `deno task css` — it calls the Tailwind CLI directly via npm specifier,
 * which is the canonical pattern used across all Beacon demos.
 */

const cmd = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "npm:@tailwindcss/cli", "-i", "styles/inkset.css", "-o", "static/styles.css"],
  stdout: "inherit",
  stderr: "inherit",
});

const { code } = await cmd.output();
if (code !== 0) {
  console.error("CSS build failed (exit code", code + ")");
  Deno.exit(code);
}
console.log("✓ CSS build complete. Output: static/styles.css");
