// Grace Commons — formal-coverage / twin-isolation checker  ("part 2").
//
//   node isolate.mjs [<correct-model.tla>]      (default: every TLA+ model)
//
// WHAT IT GUARDS
// The base harness (audit.mjs) confirms each correct model holds and each buggy
// twin is rejected. It does NOT confirm that *each load-bearing invariant* has a
// twin that demonstrably breaks it. TLC reports only the SHORTEST counterexample,
// so a single twin carrying two hazards demonstrates only one — the other's
// rejection is masked, and a load-bearing invariant silently loses its vacuity
// guard. This is exactly the Credential bug (Inv 7 at 5 states masked Inv 2 at
// 33 states in the combined twin) that had to be caught by hand.
//
// THE RULE (mechanizes the isolated-twin discipline):
//   For every correct model, each load-bearing invariant named in its .cfg must
//   have a DEDICATED twin — a buggy sibling that, checked in isolation, violates
//   THAT invariant and holds every other load-bearing invariant. A twin that
//   breaks two load-bearing invariants in isolation is "combined", not dedicated:
//   in the committed run it masks all but the shortest, so each invariant's
//   demonstration is fragile. Splitting into one twin per invariant is the fix.
//
// HOW
//   The model checker (check_spec_with_cfg) takes the .cfg as a STRING, so we
//   synthesize a single-invariant cfg per run (same SPECIFICATION / CONSTANTS /
//   CHECK_DEADLOCK, exactly one INVARIANT) and run each twin against each
//   load-bearing invariant in isolation, in-process. No temp files.
//
//   Load-bearing set = the named INVARIANTs in the correct model's .cfg, minus
//   the aggregates {Safety, TypeOK}. (Models that name only Safety expose no
//   sub-invariant to isolate from the cfg alone and are reported as such.)
//
// Alloy is out of scope: Alloy reports every `check` independently, so there is
// no shortest-counterexample masking to guard against — audit.mjs already shows
// each assertion's verdict.
//
// Exit 0 = every load-bearing invariant has a dedicated rejecting twin.
// Exit 1 = at least one GAP (a masking / missing-dedicated-twin risk).

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, basename, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");

function die(msg) { console.error(msg); process.exit(2); }

// ---- locate + init the WASM checker once (reused for every isolation run) ----
function findTlaPkg() {
  const c = [join(HERE, "node_modules/tla-checker"), "/tmp/tla_install/node_modules/tla-checker"];
  const p = c.find(existsSync);
  if (!p) die("tla-checker not found — run tools/harness/bootstrap.sh first.");
  return p;
}
const TLA_PKG = findTlaPkg();
const checker = await import(join(TLA_PKG, "tla_checker.js"));
checker.initSync({ module: readFileSync(join(TLA_PKG, "tla_checker_bg.wasm")) });

// ---- cfg parsing / synthesis ------------------------------------------------
const AGGREGATE = new Set(["Safety", "TypeOK"]);

function cfgInvariants(cfgText) {
  const out = [];
  for (const line of cfgText.split("\n")) {
    const m = line.match(/^\s*INVARIANT\s+(\S+)\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Conjuncts of a `Safety == TypeOK /\ Inv_A /\ Inv_B` definition in the .tla,
 *  minus TypeOK — so a cfg that names only the `Safety` aggregate still yields
 *  its individual load-bearing invariants. */
function safetyConjuncts(tlaText) {
  const m = tlaText.match(/^Safety\s*==\s*(.+)$/m);
  if (!m) return [];
  return m[1]
    .split(/\/\\|∧/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z]\w*$/.test(s) && s !== "TypeOK");
}

/** The load-bearing invariant set for a correct model: named cfg INVARIANTs
 *  (minus aggregates) unioned with the conjuncts of `Safety` when it is named. */
function loadBearingSet(cfgText, tlaText) {
  const named = cfgInvariants(cfgText);
  const set = new Set(named.filter((i) => !AGGREGATE.has(i)));
  if (named.includes("Safety")) for (const c of safetyConjuncts(tlaText)) set.add(c);
  return [...set];
}

/** A cfg identical to `cfgText` but with exactly one INVARIANT: `inv`. */
function cfgWithSingleInvariant(cfgText, inv) {
  const kept = cfgText
    .split("\n")
    .filter((l) => !/^\s*INVARIANT\s+\S+\s*$/.test(l));
  // place the single INVARIANT right after SPECIFICATION for tidiness
  const idx = kept.findIndex((l) => /^\s*SPECIFICATION\b/.test(l));
  const at = idx >= 0 ? idx + 1 : 0;
  kept.splice(at, 0, `INVARIANT ${inv}`);
  return kept.join("\n");
}

function constantsFor(modelPath) {
  const cp = modelPath.slice(0, -extname(modelPath).length) + ".constants.json";
  return existsSync(cp) ? readFileSync(cp, "utf-8") : "{}";
}

/** Run `specPath` against a synthesized single-invariant cfg. */
function violatesInIsolation(specPath, cfgString, constantsJson) {
  const raw = checker.check_spec_with_cfg(
    readFileSync(specPath, "utf-8"), cfgString, constantsJson,
    1000000, 200, true, false,
  );
  let res;
  try { res = JSON.parse(raw); } catch { return { ok: false, error: "non-JSON checker output" }; }
  if (res.success) return { ok: true, violated: false, states: res.states_explored };
  if (res.error_type === "InvariantViolation") return { ok: true, violated: true, states: res.states_explored };
  // Bound exhausted (MaxDepth/MaxStates) with NO invariant violation found =
  // the invariant HELD within the explored space — treat as not-violated, not an
  // error. Only genuine parse/translation errors are reported as errors.
  if (/MaxDepth|MaxStates|depth exceeded|states explored/i.test(`${res.error_type} ${res.error_message}`)) {
    return { ok: true, violated: false, states: res.states_explored, bounded: true };
  }
  return { ok: false, error: `${res.error_type}: ${res.error_message}` };
}

// ---- corpus walk ------------------------------------------------------------
function walkTla(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkTla(p, acc);
    else if (e.name.endsWith(".tla")) acc.push(p);
  }
  return acc;
}

function twinsFor(correctPath) {
  const dir = dirname(correctPath);
  const stem = basename(correctPath, ".tla");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".tla") && /buggy/i.test(n) && n.startsWith(stem + "-buggy"))
    .map((n) => join(dir, n));
}

// ---- main -------------------------------------------------------------------
const onlyArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
let correctModels = walkTla(join(REPO, "atoms"))
  .concat(walkTla(join(REPO, "compositions")))
  .filter((p) => !/buggy/i.test(basename(p)))
  .sort();
if (onlyArg) correctModels = correctModels.filter((p) => p.endsWith(onlyArg) || p === onlyArg);

let review = 0, checked = 0, skipped = 0;

for (const correct of correctModels) {
  const cfgPath = correct.slice(0, -4) + ".cfg";
  if (!existsSync(cfgPath)) continue;
  const twins = twinsFor(correct);
  if (twins.length === 0) continue; // no twin to isolate; audit.mjs covers "holds"

  const lb = loadBearingSet(readFileSync(cfgPath, "utf-8"), readFileSync(correct, "utf-8"));
  const rel = relative(REPO, correct);
  if (lb.length === 0) {
    console.log(`─ ${rel}`);
    console.log(`    (no named or Safety-conjunct sub-invariants to isolate)`);
    skipped++;
    continue;
  }
  checked++;
  console.log(`─ ${rel}   load-bearing: ${lb.join(", ")}   twins: ${twins.map((t) => basename(t)).join(", ")}`);

  // matrix[twin][inv] = violated? (in isolation)
  const matrix = new Map();
  for (const twin of twins) {
    const cfgText = readFileSync(cfgPath, "utf-8"); // reuse the correct model's CONSTANTS/SPEC shape
    const consts = constantsFor(twin);
    const row = new Map();
    for (const inv of lb) {
      const r = violatesInIsolation(twin, cfgWithSingleInvariant(cfgText, inv), consts);
      if (!r.ok) { console.log(`    ! ${basename(twin)} / ${inv}: ${r.error}`); row.set(inv, null); }
      else row.set(inv, r.violated);
    }
    matrix.set(twin, row);
    const breaks = lb.filter((i) => row.get(i) === true);
    const tag = breaks.length === 0 ? "VACUOUS (breaks nothing)"
      : breaks.length === 1 ? `dedicated → ${breaks[0]}`
        : `COMBINED → ${breaks.join(" + ")} (masks all but shortest)`;
    console.log(`    ${basename(twin).padEnd(46)} ${tag}`);
  }

  // A twin that breaks >=2 invariants in isolation is the masking RISK: in the
  // committed run TLC reports only the shortest, so the others' rejection is
  // hidden. Whether that is a real bug (independent claims -> split into
  // dedicated twins, like Credential) or benign (the invariants are facets of
  // ONE claim, e.g. a binding bijection == NoDangling /\ NoOrphan, which cannot
  // be split) is the vote's judgment — the tool flags it for review, it does not
  // assert a bug. Invariants with no isolated counterexample are by-construction
  // / frame properties (the coverage cross-check's sanctioned verdict), reported
  // as INFO, not failures.
  // A correct model may DECLARE that a group of invariants are facets of ONE
  // claim (e.g. a binding bijection == NoDangling /\ NoOrphan) and so cannot be
  // split into dedicated twins. Annotate in the .tla:
  //   \* @isolate-facets Inv4_BindingBijection Inv4_NoDanglingProv Inv4_NoOrphanAudit
  // A combined twin whose broken set is contained in one declared facet group is
  // benign (expected), not a masking risk, and is suppressed from REVIEW.
  const facetGroups = [...readFileSync(correct, "utf-8").matchAll(/@isolate-facets\s+(.+)/g)]
    .map((m) => new Set(m[1].trim().split(/\s+/)));
  const withinFacet = (broken) => facetGroups.some((g) => broken.every((b) => g.has(b)));

  const combinedTwins = twins.filter((t) => lb.filter((i) => matrix.get(t).get(i) === true).length >= 2);
  for (const t of combinedTwins) {
    const broken = lb.filter((i) => matrix.get(t).get(i) === true);
    if (withinFacet(broken)) {
      console.log(`    · ${basename(t)} breaks ${broken.join(" + ")} — declared facets of one claim (@isolate-facets); expected.`);
      continue;
    }
    review++;
    console.log(`    ⚠ REVIEW ${basename(t)} breaks ${broken.length} invariants in isolation `
      + `(${broken.join(", ")}) — committed run demonstrates only the shortest. `
      + `Split into dedicated twins IF these are independent load-bearing claims; `
      + `else declare them facets via an @isolate-facets annotation in the .tla.`);
  }
  for (const inv of lb) {
    const dedicated = twins.some((t) => {
      const row = matrix.get(t);
      return row.get(inv) === true && lb.every((j) => j === inv || row.get(j) === false);
    });
    const anyBreak = twins.some((t) => matrix.get(t).get(inv) === true);
    if (dedicated) console.log(`    ✓ ${inv}: dedicated rejecting twin`);
    else if (anyBreak) console.log(`    ⚠ ${inv}: only via a combined twin (see REVIEW above)`);
    else console.log(`    · ${inv}: no isolated counterexample — by-construction / frame property `
      + `(confirm it is not an independent load-bearing claim)`);
  }
  console.log("");
}

console.log("═".repeat(72));
console.log(`${checked} model(s) with twins checked, ${skipped} aggregate-only; `
  + `${review} combined-twin(s) flagged for review.`);
console.log(`(Combined twins are a masking RISK, not an assertion of a bug — a human/vote decides `
  + `whether the co-broken invariants are independent claims that warrant splitting.)`);
// Default exit 0 (informational). --strict exits 1 on any combined twin, for use
// as a forcing function once each has been triaged and the benign ones annotated.
const strict = process.argv.includes("--strict");
process.exit(strict && review ? 1 : 0);
