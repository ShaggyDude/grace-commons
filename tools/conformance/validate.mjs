// tools/conformance/validate.mjs
//
// The conformance runner — the level-1 feedback loop made into an artifact.
// Takes a running render's records + its spec-derived manifest and returns a
// measured correctness(%): the fraction of the spec's record-clearable,
// in-render-scope claims the render provably honors.
//
//   node validate.mjs <render-id> [--db <path>] [--json] [--quiet]
//
// It is the behavioural sibling of the repo's other two checkers:
//   tools/linter/lint.py    guards the spec PROSE   (cross-references)
//   tools/harness/check.mjs  guards the spec PROOFS  (TLA+ / Alloy models)
//   THIS                     guards the spec BEHAVIOUR (a render's records)
// Same house style: dependency-light (Node built-ins only — node:sqlite,
// node:crypto), exit-coded, high-precision, README'd.
//
// Pieces (see tools/conformance/README.md, Day 5):
//   manifests/<render>.manifest.json  — the structured oracle (Day 1)
//   evaluators.mjs                    — render-AGNOSTIC check logic, keyed by
//                                       check id, written against the adapter
//                                       contract in spec vocabulary
//   adapters/<render>.adapter.mjs     — the ONLY per-render code: a thin,
//                                       trusted, records-alone query layer that
//                                       maps spec concepts onto this render's
//                                       store. Adding render 2 = writing one of
//                                       these.
//
// The number is COMPUTED (lib/score.mjs), not asserted. pending and errored
// checks are excluded from the denominator so a half-built run reports the
// honest fraction of what it measured. externally-clearable and
// out-of-render-scope checks are reported separately, never scored.
//
// Exit codes (house convention, cf. check.mjs):
//   0  clean — no denominator check failed and no evaluator errored
//   1  at least one denominator check FAILED or an evaluator errored (a red)
//   2  usage / load error

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));

const GLYPH = { pass: "PASS", fail: "FAIL", pending: "pend", error: "ERR " };
const pct = (tally) =>
  tally.correctness_pct === null ? "n/a" : `${tally.correctness_pct.toFixed(1)}%`;

function die(msg) {
  console.error(`validate: ${msg}`);
  process.exit(2);
}

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = { db: null, json: false, quiet: false, manifest: null };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--db") flags.db = argv[++i];
  else if (a === "--manifest") flags.manifest = argv[++i];
  else if (a === "--json") flags.json = true;
  else if (a === "--quiet") flags.quiet = true;
  else if (a.startsWith("--")) die(`unknown flag: ${a}`);
  else positional.push(a);
}
const renderId = positional[0];
if (!renderId) {
  die("usage: node validate.mjs <render-id> [--db <path>] [--json] [--quiet]");
}

// ---- locate manifest + adapter ---------------------------------------------
// The manifest is the SPEC SURFACE (shared by every render of that surface); the
// adapter is the render. --manifest lets a second render reuse the first's
// manifest, so the same checks are evaluated against both (multi-render agreement).
const manifestName = flags.manifest ?? renderId;
const manifestPath = join(HERE, "manifests", `${manifestName}.manifest.json`);
if (!existsSync(manifestPath)) die(`no manifest at manifests/${manifestName}.manifest.json`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
} catch (e) {
  die(`manifest is not valid JSON: ${e.message}`);
}

const adapterPath = join(HERE, "adapters", `${renderId}.adapter.mjs`);
if (!existsSync(adapterPath)) die(`no adapter at adapters/${renderId}.adapter.mjs`);

// Resolve the render store path: --db > $CONFORMANCE_DB > generated fixture.
// The fixture is built by fixtures/build-<render>.mjs onto the native tmp FS
// (SQLite can't host a live DB on the mounted repo FS), so the default points
// there. Point --db at a live `deno task seed` store when Deno is available.
const dbPath =
  flags.db ??
  process.env.CONFORMANCE_DB ??
  join(tmpdir(), "grace-commons-conformance", `${renderId}.db`);
const dbAbs = isAbsolute(dbPath) ? dbPath : resolve(process.cwd(), dbPath);

// ---- load the moving parts -------------------------------------------------
const { default: createAdapter } = await import(pathToFileURL(adapterPath).href);
const { EVALUATORS } = await import(pathToFileURL(join(HERE, "evaluators.mjs")).href);
const { score } = await import(pathToFileURL(join(HERE, "lib", "score.mjs")).href);

if (typeof createAdapter !== "function") {
  die(`adapter ${renderId}.adapter.mjs must default-export createAdapter({dbPath})`);
}

// ---- run every denominator-eligible check ----------------------------------
const checks = manifest.checks;
const denomEligible = checks.filter(
  (c) => c.kind === "record-clearable" && c.render_scope === "in-scope",
);

let adapter = null;
const results = {};
if (existsSync(dbAbs)) {
  try {
    adapter = createAdapter({ dbPath: dbAbs });
  } catch (e) {
    die(`adapter failed to open store '${dbAbs}': ${e.message}`);
  }
}

for (const c of denomEligible) {
  const evaluator = EVALUATORS[c.id];
  if (typeof evaluator !== "function") {
    results[c.id] = { status: "pending", detail: "no evaluator registered" };
    continue;
  }
  if (!adapter) {
    results[c.id] = { status: "pending", detail: `render store not found at ${dbPath}` };
    continue;
  }
  try {
    const r = evaluator(adapter, c);
    results[c.id] = r && r.status ? r : { status: "error", detail: "evaluator returned no status" };
  } catch (e) {
    results[c.id] = { status: "error", detail: e.message };
  }
}

if (adapter && typeof adapter.close === "function") adapter.close();

const tally = score(checks, results);

// ---- report ----------------------------------------------------------------
if (flags.json) {
  console.log(JSON.stringify(buildJson(manifest, tally, results, dbPath), null, 2));
} else {
  printReport(manifest, tally, results, dbPath);
}

// Exit 1 on any real red (a fail or an evaluator error); else 0.
const red = tally.counts.fail > 0 || tally.counts.error > 0;
process.exit(red ? 1 : 0);

// ============================================================================
function printReport(manifest, tally, results, dbPath) {
  const q = flags.quiet;
  const line = "─".repeat(72);
  console.log(line);
  console.log(`  conformance: ${manifest.render.id}`);
  console.log(`  store:       ${dbPath}${existsSimple(dbPath) ? "" : "  (NOT FOUND — checks pending)"}`);
  console.log(line);

  // Per-check table (denominator-eligible only).
  if (!q) {
    for (const { check, result } of tally.rows) {
      const id = check.id.padEnd(7);
      const sev = check.severity.padEnd(8);
      const g = GLYPH[result.status] ?? result.status;
      console.log(`  ${g}  ${id} ${sev} ${check.claim}`);
      if ((result.status === "fail" || result.status === "error") && result.detail) {
        console.log(`        └─ ${result.detail}`);
        if (Array.isArray(result.offending) && result.offending.length) {
          const sample = result.offending.slice(0, 5);
          console.log(`           offending: ${JSON.stringify(sample)}${result.offending.length > 5 ? ` …(+${result.offending.length - 5})` : ""}`);
        }
      }
    }
    console.log(line);
  }

  // Headline.
  const basis =
    tally.denominator === 0
      ? `0 of ${tally.in_scope_total} in-scope checks evaluated`
      : `${tally.numerator}/${tally.denominator} passed`;
  console.log(`  CORRECTNESS: ${pct(tally)}   (${basis})`);
  console.log(
    `  in-scope record-clearable: ${tally.in_scope_total}` +
      `  ·  pass ${tally.counts.pass}` +
      `  ·  fail ${tally.counts.fail}` +
      `  ·  pending ${tally.counts.pending}` +
      `  ·  error ${tally.counts.error}`,
  );
  console.log(
    `  critical-fail gate: ${tally.critical_fail_count === 0 ? "clean (0 critical fails)" : `${tally.critical_fail_count} CRITICAL FAIL(S)`}`,
  );

  // Separate buckets — reported, never scored.
  if (!q) {
    console.log(line);
    console.log(`  reported separately (NOT in the percentage):`);
    console.log(`    externally-clearable        ${tally.separate.externally_clearable.length}  (need evidence outside the records)`);
    for (const c of tally.separate.externally_clearable) console.log(`        ·  ${c.id.padEnd(10)} ${c.claim}`);
    console.log(`    record-clearable, out of render scope   ${tally.separate.out_of_render_scope.length}  (render omits this substrate by design)`);
    for (const c of tally.separate.out_of_render_scope) console.log(`        ·  ${c.id.padEnd(10)} ${c.claim}`);
  }
  console.log(line);
}

function existsSimple(p) {
  try { return existsSync(isAbsolute(p) ? p : resolve(process.cwd(), p)); } catch { return false; }
}

function buildJson(manifest, tally, results, dbPath) {
  return {
    render: manifest.render.id,
    store: dbPath,
    correctness_pct: tally.correctness_pct,
    numerator: tally.numerator,
    denominator: tally.denominator,
    in_scope_total: tally.in_scope_total,
    counts: tally.counts,
    critical_fail_count: tally.critical_fail_count,
    checks: tally.rows.map(({ check, result }) => ({
      id: check.id,
      composition: check.composition,
      severity: check.severity,
      status: result.status,
      detail: result.detail ?? null,
      offending: result.offending ?? null,
    })),
    reported_separately: {
      externally_clearable: tally.separate.externally_clearable.map((c) => c.id),
      out_of_render_scope: tally.separate.out_of_render_scope.map((c) => c.id),
    },
  };
}
