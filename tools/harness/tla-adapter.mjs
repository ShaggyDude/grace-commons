// Grace Commons — TLA+ module-name adapter.
//
// WHY: canonical model files use kebab-case names (undo-history.tla, with
// `---- MODULE undo-history ----`) to stay consistent with their .md / .als
// siblings. The repo's WASM checker (tla-checker) tolerates hyphenated module
// names; STANDARD TLC does not — a TLA+ module name must be a valid identifier
// (no hyphens) and match its filename. Rather than hand-maintain camelCase
// duplicates (a drift-prone mirror), this adapter DERIVES a TLC-compatible copy
// from the canonical file on demand. Canonical naming stays clean; standard TLC,
// Apalache, TLAPS, the Toolbox all stay reachable. The TLC name is a derived
// artifact — derive-don't-lag, the same rule applied to filenames.
//
// USAGE:
//   node tla-adapter.mjs <model.tla> [outDir]   # one file (+ its .cfg / .constants.json)
//   node tla-adapter.mjs --all [outDir]         # every .tla under atoms/ + compositions/
// Default outDir: build-tlc/  (git-ignored). Then, e.g.:
//   java -jar tla2tools.jar build-tlc/undoHistory.tla

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";

// kebab / snake / spaced -> lowerCamelCase; a valid TLA+ identifier is returned
// unchanged (idempotent), so already-camelCase files pass through untouched.
export function toModuleName(raw) {
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(raw)) return raw;       // already TLC-safe
  const parts = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts[0].toLowerCase() +
         parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join("");
}

function adaptOne(tlaPath, outDir) {
  const src = readFileSync(tlaPath, "utf-8");
  const m = src.match(/MODULE\s+([\w-]+)/);                  // first = the declaration
  if (!m) { console.error(`  skip (no MODULE header): ${tlaPath}`); return null; }
  const rawName = m[1];
  const safe = toModuleName(rawName);
  const out = src.replace(/MODULE\s+[\w-]+/, `MODULE ${safe}`); // rewrite only the declaration
  mkdirSync(outDir, { recursive: true });
  const outTla = join(outDir, `${safe}.tla`);
  writeFileSync(outTla, out);
  // carry sibling config(s), renamed so TLC finds <Module>.cfg next to <Module>.tla
  const base = tlaPath.replace(/\.tla$/, "");
  for (const ext of [".cfg", ".constants.json"]) {
    if (existsSync(base + ext)) writeFileSync(join(outDir, safe + ext), readFileSync(base + ext));
  }
  console.log(`  ${basename(tlaPath).padEnd(40)} -> ${safe}.tla` +
              (safe !== rawName ? "   (renamed)" : "   (already TLC-safe)"));
  return outTla;
}

// NOTE: rewrites the MODULE declaration only. The repo's models EXTEND standard
// modules (Naturals, FiniteSets, …), not hyphenated repo modules, so no
// inter-module reference rewriting is needed today; revisit if that changes.

const args = process.argv.slice(2);
const all = args.includes("--all");
const pos = args.filter((a) => !a.startsWith("--"));

let inputs, outDir;
if (all) {
  outDir = resolve(pos[0] || "build-tlc");
  inputs = [];
  for (const d of ["atoms", "compositions"]) {
    if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith(".tla")) inputs.push(join(d, f));
  }
} else {
  if (!pos[0]) {
    console.error("usage: node tla-adapter.mjs <model.tla> [outDir]  |  --all [outDir]");
    process.exit(2);
  }
  inputs = [pos[0]];
  outDir = resolve(pos[1] || "build-tlc");
}

console.log(`TLC-adapting ${inputs.length} file(s) -> ${outDir}`);
const made = [];
for (const f of inputs) { const o = adaptOne(f, outDir); if (o) made.push(o); }
console.log(`\nRun under standard TLC, e.g.:\n  java -jar tla2tools.jar ${made[0] || "<Module>.tla"}`);
