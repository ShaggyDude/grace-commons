// One-time setup: download vendored assets into public/
// Run once with: deno task setup

import { ensureDir } from "jsr:@std/fs";

await ensureDir("public");
await ensureDir("data");

// Vendor HTMX
const htmxUrl = "https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js";
const htmxDest = "public/htmx.min.js";

try {
  await Deno.stat(htmxDest);
  console.log("✓ htmx.min.js already present");
} catch {
  console.log("Downloading htmx.min.js...");
  const res = await fetch(htmxUrl);
  if (!res.ok) throw new Error(`Failed to fetch htmx: ${res.status}`);
  const text = await res.text();
  await Deno.writeTextFile(htmxDest, text);
  console.log(`✓ htmx.min.js downloaded (${text.length} bytes)`);
}

console.log("\nSetup complete. Run: deno task dev");
