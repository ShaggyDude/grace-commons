// Grace Commons — Term projection adapter (the annotation.md manifest).
//
// WHY: canonical prose marks every named concept with a `[Term]` shortcut-reference
// link that resolves to a per-page card; the card teaches WHAT the Term is (kind,
// member/field/parameter-of, role) and — for the two identifier kinds (Field,
// Parameter) and any pinned Member — carries a single `Projects:` line giving the
// concept's ONE canonical lowering token in plain view. Casing leaves the prose:
// the sentence says [Recorded At], the card's `Projects:` line says recorded_at.
//
// A code generator needs every target's casing, not just the canonical token. Rather
// than hand-maintain a multi-target casing table per page (a drift-prone mirror — the
// exact failure annotation.md exists to remove), this adapter DERIVES the full
// manifest on demand from the card's canonical `Projects:` token, the same way
// tla-adapter.mjs derives a TLC-safe camelCase MODULE name from a kebab filename.
// Derive-don't-lag, applied to identifier casing.
//
// The manifest is a DERIVED build artifact (build-terms/, git-ignored). The canonical
// source is the spec page: its Terms cards + `Projects:` lines. Nothing here renders on
// GitHub Pages and nothing here needs to — the page already shows the canonical token.
//
// USAGE:
//   node term-adapter.mjs <spec.md> [outDir]   # one page -> <name>.terms.json
//   node term-adapter.mjs --all [outDir]        # every atom/composition with a Terms registry
// Default outDir: build-terms/  (git-ignored). Then a codegen reads, e.g.:
//   build-terms/duplicate-prevention.terms.json  ->  { "recorded-at": { kind, projects: {...} }, ... }

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";

// --- projection: derive every target casing from one canonical token ----------
// The canonical `Projects:` token is written in the concept's most natural plain
// form — snake_case for a Field (recorded_at), lowerCamel or snake for a Parameter,
// kebab for a pinned wire Member (duplicate-recent). We split it into words on any
// non-alphanumeric boundary and on camelCase humps, then re-case for each target.
export function splitWords(raw) {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase hump -> space
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function project(canonical) {
  const w = splitWords(canonical);
  const snake = w.join("_");
  const kebab = w.join("-");
  const camel = w[0] + w.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  const pascal = w.map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  const constant = w.join("_").toUpperCase();
  return { snake, kebab, camel, pascal, const: constant };
}

// --- parse a spec page's Terms registry --------------------------------------
// A card is an h4 heading (`#### Name`) inside the `## Terms` section, followed by
// its body until the next h4 / section. We read `Kind:`, the `<X> of:` relation,
// `Role:`, `Projects:` (canonical token), and the optional `Wire: pinned` flag.
const CARD = /^####\s+(.+?)\s*$/;
const SECTION = /^##\s+/;

function parseTerms(md, path) {
  const lines = md.split("\n");
  // locate the `## Terms` section
  let i = lines.findIndex((l) => /^##\s+Terms\b/.test(l));
  if (i < 0) return null;
  i += 1;
  const terms = {};
  let cur = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (SECTION.test(line) && !/^##\s+Terms\b/.test(line)) break; // left the section
    const h = line.match(CARD);
    if (h) {
      cur = h[1].trim();
      terms[cur] = { name: cur };
      continue;
    }
    if (!cur) continue;
    const kv = line.match(/^\s*(Kind|Role|Projects|Wire|Member of|Field of|Parameter of)\s*:\s*(.+?)\s*$/i);
    if (kv) {
      const key = kv[1].toLowerCase();
      const val = kv[2].trim();
      if (key === "kind") terms[cur].kind = val.toLowerCase();
      else if (key === "role") terms[cur].role = val;
      else if (key === "wire") terms[cur].wire = val.toLowerCase();
      else if (key === "projects") terms[cur].projects_token = val.replace(/`/g, "");
      else terms[cur].of = val; // "member of" / "field of" / "parameter of"
    }
  }
  return terms;
}

function adaptOne(mdPath, outDir) {
  const md = readFileSync(mdPath, "utf-8");
  const terms = parseTerms(md, mdPath);
  if (!terms) { return null; } // page carries no Terms registry — skip silently
  const manifest = {};
  for (const [name, t] of Object.entries(terms)) {
    const entry = { kind: t.kind || "unknown" };
    if (t.of) entry.of = t.of;
    if (t.role) entry.role = t.role;
    if (t.projects_token) {
      entry.canonical = t.projects_token;
      entry.projects = project(t.projects_token);
      if (t.wire === "pinned") { entry.wire = "pinned"; entry.projects.wire = t.projects_token; }
    }
    // registry key: the kebab projection of the Term name (stable, anchor-aligned)
    const key = splitWords(name).join("-");
    manifest[key] = entry;
  }
  mkdirSync(outDir, { recursive: true });
  const stem = basename(mdPath).replace(/\.md$/, "");
  const outPath = join(outDir, `${stem}.terms.json`);
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  ${basename(mdPath).padEnd(44)} -> ${stem}.terms.json   (${Object.keys(manifest).length} terms)`);
  return outPath;
}

// --- driver ------------------------------------------------------------------
const args = process.argv.slice(2);
const all = args.includes("--all");
const pos = args.filter((a) => !a.startsWith("--"));

let inputs, outDir;
if (all) {
  outDir = resolve(pos[0] || "build-terms");
  inputs = [];
  for (const d of ["atoms", "compositions"]) {
    if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith(".md")) inputs.push(join(d, f));
  }
} else {
  if (!pos[0]) {
    console.error("usage: node term-adapter.mjs <spec.md> [outDir]  |  --all [outDir]");
    process.exit(2);
  }
  inputs = [pos[0]];
  outDir = resolve(pos[1] || "build-terms");
}

console.log(`Term-adapting ${inputs.length} file(s) -> ${outDir}`);
let made = 0;
for (const f of inputs) { if (adaptOne(f, outDir)) made += 1; }
console.log(`\nDerived ${made} manifest(s). (Pages with no Terms registry are skipped.)`);
