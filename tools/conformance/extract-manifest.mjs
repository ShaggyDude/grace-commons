// tools/conformance/extract-manifest.mjs
//
// Derive the conformance oracle FROM THE SPEC PROSE. Parses a composition's
// `## Generation acceptance` section into its checkable claims — a linter-class
// parse, dependency-light (Node built-ins only), high-precision (lint.py
// discipline: a tight pattern over loose recall).
//
//   node extract-manifest.mjs <spec.md> [--code C16]      # emit checks as JSON
//   node extract-manifest.mjs --reconcile <render>         # diff vs the manifest
//
// WHAT THE PROSE CAN AND CANNOT GIVE YOU
//   Mechanical (this file): `claim` (the verbatim bold lead), `kind`
//     (record-clearable | externally-clearable, inferred from the GA section's
//     own subsection headers + language), and `ga_ref` (position in the section).
//     These are spec-intrinsic — the spec decides them, not the manifest author.
//   Hand-authored remainder (the render overlay in the manifest): `render_scope`,
//     `severity`, `scope_note`, `adapter_capability`. These depend on what a
//     given render implements and CANNOT be read off the spec. They are the
//     small, explicit, auditable part that stays a judgment call.
//
// So this tool proves the part a skeptic attacks — "did you cherry-pick or
// misquote the checks?" — is mechanical, and isolates the honest remainder.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

// ── the parse ────────────────────────────────────────────────────────────────

/** Slice the `## Generation acceptance` section out of a spec (up to the next h2). */
export function sliceGA(text) {
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Generation\s+acceptance\s*$/i.test(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) { end = i; break; }   // next h2 ends the section
  }
  return lines.slice(start, end).join("\n");
}

// A list item: "N. ..." or "- ..." / "* ..." at the line start.
const LIST_ITEM = /^\s*(?:(\d+)\.|[-*])\s+(.*)$/;
// The claim is the first **bold** run in the item (handles nested *italics*).
const BOLD_LEAD = /\*\*(.+?)\*\*/;
// A kind-signaling header is a bold-only line or an h3 (NOT a list item).
const HEADER = /^\s*(?:#{3,}\s+(.*)|\*\*(.+?)\*\*\s*)$/;

/** Infer kind from a header's text. Returns 'record-clearable' | 'externally-clearable' | null. */
function kindFromHeader(h) {
  const s = h.toLowerCase();
  if (/externally[-\s]clearable/.test(s)) return "externally-clearable";
  if (/record[-\s](clearable|verifiable)|traversal[-\s]clearable/.test(s)) return "record-clearable";
  // "state-verifiable" tiers describe checks not yet records-backed; left to
  // per-item language so we don't over-claim.
  return null;
}

/** Per-item language cues that force externally-clearable regardless of section. */
function itemForcesExternal(text) {
  return /requires?\s+code\s+inspection|code\s+inspection\s+(?:or\s+a\s+formal\s+model\s+)?confirms|cannot\s+be\s+cleared\s+from\s+(?:the\s+)?records\s+alone|require\s+external\s+evidence|external\s+(?:policy|evidence)/i
    .test(text);
}

/**
 * Parse a GA section into checks. Returns
 *   [{ seq, claim, kind, kind_source, ga_ref }]
 */
export function extractGA(text, code = "") {
  const ga = sliceGA(text);
  if (ga === null) return null;
  const lines = ga.split("\n");
  let currentKind = "record-clearable"; // GA sections are record-clearable by default
  const checks = [];
  let seq = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const li = line.match(LIST_ITEM);
    if (li) {
      // Gather the item's text (this line; bold lead is always on the first line).
      const itemText = li[2];
      const boldM = itemText.match(BOLD_LEAD);
      const claim = boldM ? boldM[1].trim() : firstSentence(itemText);
      let kind = currentKind;
      let kindSource = "section";
      if (itemForcesExternal(itemText)) { kind = "externally-clearable"; kindSource = "item-language"; }
      seq++;
      checks.push({
        seq,
        claim,
        kind,
        kind_source: kindSource,
        ga_ref: code ? `${code} GA check ${seq}` : `GA check ${seq}`,
      });
      continue;
    }
    // Not a list item — is it a kind-signaling header?
    const hm = line.match(HEADER);
    if (hm) {
      const k = kindFromHeader(hm[1] ?? hm[2] ?? "");
      if (k) currentKind = k;
    }
  }
  return checks;
}

function firstSentence(s) {
  const m = s.match(/^(.+?[.?!])(\s|$)/);
  return (m ? m[1] : s).trim();
}

// ── reconcile ────────────────────────────────────────────────────────────────

function loadSurface(render) {
  const p = join(HERE, "manifests", `${render}.surface.json`);
  if (!existsSync(p)) die(`no surface map at manifests/${render}.surface.json`);
  return JSON.parse(readFileSync(p, "utf-8"));
}
function loadManifest(render) {
  const p = join(HERE, "manifests", `${render}.manifest.json`);
  if (!existsSync(p)) die(`no manifest at manifests/${render}.manifest.json`);
  return JSON.parse(readFileSync(p, "utf-8"));
}

// strip markdown emphasis (bold/italic/backtick) so claim comparison ignores cosmetics.
const norm = (s) => s.replace(/[*`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function reconcile(render) {
  const surface = loadSurface(render);
  const manifest = loadManifest(render);
  const findings = [];

  for (const { code, spec } of surface.compositions) {
    const specPath = join(REPO, spec);
    if (!existsSync(specPath)) { findings.push(`${spec}: [missing-spec] file not found`); continue; }
    const text = readFileSync(specPath, "utf-8");
    const extracted = extractGA(text, code);
    if (extracted === null) { findings.push(`${spec}: [no-ga] no '## Generation acceptance' section`); continue; }
    const gaRaw = norm(sliceGA(text));

    const manifestChecks = manifest.checks.filter((c) => c.id.startsWith(code + "-"));

    // (a) completeness spec -> manifest: every extracted claim appears as a
    //     manifest claim (1-to-many splits allowed).
    for (const ex of extracted) {
      const hits = manifestChecks.filter((c) => norm(c.claim) === norm(ex.claim));
      if (hits.length === 0) {
        findings.push(`${spec}: [missing-from-manifest] ${ex.ga_ref}: "${ex.claim}" has no manifest entry`);
      }
    }

    // (b) traceability manifest -> spec: every manifest claim is verbatim in the
    //     GA prose (catches misquotes / invented checks).
    for (const c of manifestChecks) {
      if (!gaRaw.includes(norm(c.claim))) {
        findings.push(`${spec}: [claim-drift] manifest ${c.id} claim not found verbatim in GA prose: "${c.claim}"`);
      }
    }

    // (c) kind discipline: a manifest entry may override the spec-default kind
    //     (e.g. a check becomes records-clearable once Audit Trail is composed
    //     in) — but ONLY with an explicit `kind_override` reason. A divergence
    //     WITHOUT one is a hard finding; a documented one is reported as info.
    for (const c of manifestChecks) {
      const ex = extracted.find((e) => norm(e.claim) === norm(c.claim));
      if (ex && ex.kind !== c.kind) {
        if (c.kind_override) {
          findings.push(`${spec}: [kind-override-ok] ${c.id}: spec '${ex.kind}' → manifest '${c.kind}' (documented: ${c.kind_override})`);
        } else {
          findings.push(`${spec}: [kind-undocumented] ${c.id}: manifest '${c.kind}' diverges from spec-default '${ex.kind}' with no kind_override reason — document or fix`);
        }
      }
    }
  }
  return findings;
}

// ── cli ──────────────────────────────────────────────────────────────────────

function die(m) { console.error(`extract-manifest: ${m}`); process.exit(2); }

// Only run the CLI when executed directly — importing this module (e.g. from
// the unit tests) must not trigger argv dispatch.
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
const argv = process.argv.slice(2);
if (isMain && argv[0] === "--reconcile") {
  const render = argv[1];
  if (!render) die("usage: extract-manifest.mjs --reconcile <render>");
  const findings = reconcile(render);
  const hard = findings.filter((f) => /\[(missing-from-manifest|claim-drift|missing-spec|no-ga|kind-undocumented)\]/.test(f));
  const advisory = findings.filter((f) => /\[kind-override-ok\]/.test(f));
  for (const f of [...hard, ...advisory]) console.log(f);
  console.error(`\n— reconcile ${render}: ${hard.length} drift finding(s), ${advisory.length} advisory.`);
  process.exit(hard.length ? 1 : 0);
} else if (isMain) {
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) die("usage: extract-manifest.mjs <spec.md> [--code C16]  |  --reconcile <render>");
  const code = argv.includes("--code") ? argv[argv.indexOf("--code") + 1] : "";
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) die(`no such file: ${file}`);
  const checks = extractGA(readFileSync(path, "utf-8"), code);
  if (checks === null) die(`no '## Generation acceptance' section in ${file}`);
  console.log(JSON.stringify(checks, null, 2));
}
