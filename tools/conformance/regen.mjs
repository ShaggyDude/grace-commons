// tools/conformance/regen.mjs
//
// The regen-fix loop: generate → check → fix → retest, until the render clears a
// correctness threshold. The conformance validator is the FITNESS FUNCTION the
// loop selects against — a candidate fix is kept only if it provably raises the
// measured correctness(%) with no regression. "An author says 92%-good; the
// runner counts" — and here the loop climbs toward it on its own.
//
//   node regen.mjs [--target 100] [--max-iters 6]
//
// HONEST FRAMING — what is and isn't real here:
//   • The DRIVER (measure → propose → apply → re-measure → keep-iff-improved →
//     iterate) is the reusable contribution. It is render-agnostic and selects
//     purely on the validator's number.
//   • The PROPOSER is the LLM-pluggable seam. In production an agent reads the
//     reds + the render source and writes a real code patch. Here it is a small
//     rule table that maps a red to the render-state knob corresponding to that
//     exact code change (restore a skipped audit append; align the genesis hash
//     with appendEvent). It keys off the red's CONTENT, not knowledge of which
//     defect was injected.
//   • The "render" is the faithful fixture (no Deno in-sandbox). A "patch" is an
//     edit to the render-state that the fixture builder reads — a stand-in for
//     an agent editing render code and rebuilding. The live demo is never
//     touched.

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB = join(tmpdir(), "grace-commons-conformance", "regen.db");

// ── args ──
const argv = process.argv.slice(2);
const TARGET = argv.includes("--target") ? Number(argv[argv.indexOf("--target") + 1]) : 100;
const MAX_ITERS = argv.includes("--max-iters") ? Number(argv[argv.indexOf("--max-iters") + 1]) : 6;
// --prove-guard: feed the driver a deliberately REGRESSIVE proposer and confirm
// the fitness check rejects it (the loop won't accept a patch that doesn't raise
// the number). The regen analog of the validator's injected-defect proof.
const PROVE_GUARD = argv.includes("--prove-guard");

// ── render state = the patchable artifact (an agent's edits, made inspectable) ──
// Default start is deliberately defective: it skips a grant's audit append AND
// ships the faithful genesis-hash bug. Guard-demo starts one fix higher (95%).
const START = PROVE_GUARD
  ? { defects: [], cleanGenesis: false }
  : { defects: ["skip-grant-audit"], cleanGenesis: false };

function buildArgs(state) {
  const a = [];
  for (const d of state.defects) a.push("--defect", d);
  if (state.cleanGenesis) a.push("--clean-genesis");
  a.push("--out", DB);
  return a;
}

/** Build the render for `state`, run the validator, return the measured result. */
function measure(state) {
  execFileSync("node", [join(HERE, "fixtures", "build-clinical-trial-portal.mjs"), ...buildArgs(state)], { stdio: "ignore" });
  // The validator exits 1 when reds exist (by design) — execFileSync throws on
  // non-zero, but the JSON report is on stdout regardless. Capture either way.
  let out;
  try {
    out = execFileSync("node", [join(HERE, "validate.mjs"), "clinical-trial-portal", "--db", DB, "--json"], { encoding: "utf-8" });
  } catch (e) {
    out = e.stdout;
  }
  if (!out) throw new Error("validator produced no output");
  const j = JSON.parse(out);
  return {
    pct: j.correctness_pct,
    reds: j.checks.filter((c) => c.status === "fail").map((c) => ({ id: c.id, detail: c.detail })),
  };
}

// ── the proposer (LLM-pluggable seam) ──
// Each rule recognizes a red by its content and returns the render edit that
// addresses it. The driver applies and re-measures; the rule is trusted only if
// the number goes up.
const RULES = [
  {
    id: "restore-audit-append",
    match: (r) => r.id === "APA-1" && /no grant\.issued|issuance attestation/i.test(r.detail || ""),
    rationale: "APA-1: an operational grant has no issuance event → the render's grant path skipped its audit append. Restore the append.",
    apply: (s) => ({ ...s, defects: s.defects.filter((d) => d !== "skip-grant-audit") }),
  },
  {
    id: "align-genesis-hash",
    match: (r) => r.id === "C1-2b" && /event #1|diverges at event #1/i.test(r.detail || ""),
    rationale: "C1-2b: the genesis event's stored hash omits `id` while verifyChain includes it → align the seed's hash construction with appendEvent.",
    apply: (s) => ({ ...s, cleanGenesis: true }),
  },
];

// A deliberately BAD proposer (only used under --prove-guard): it "addresses"
// the hash red with an unrelated change that actually breaks a grant's audit
// append — a regression the fitness check must reject.
const BAD_RULES = [
  {
    id: "regressive-noise",
    match: (r) => r.id === "C1-2b",
    rationale: "[guard demo] a BAD proposer suggests an unrelated edit that breaks a grant's audit append instead of fixing the genesis hash.",
    apply: (s) => ({ ...s, defects: [...new Set([...s.defects, "skip-grant-audit"])] }),
  },
];

function propose(reds, state) {
  const rules = PROVE_GUARD ? BAD_RULES : RULES;
  for (const r of reds) {
    for (const rule of rules) {
      if (rule.match(r)) {
        const next = rule.apply(state);
        if (JSON.stringify(next) !== JSON.stringify(state)) {
          return { next, rationale: rule.rationale, addresses: r.id, rule: rule.id };
        }
      }
    }
  }
  return null;
}

// ── the loop ──
const fmt = (p) => (p === null ? "n/a" : `${p.toFixed(1)}%`);
const line = "─".repeat(72);
console.log(line);
console.log(`  regen-fix loop — target ${TARGET}%, max ${MAX_ITERS} iterations`);
console.log(line);

let state = START;
let res = measure(state);
console.log(`  iter 0 — start: ${fmt(res.pct)}   reds: [${res.reds.map((r) => r.id).join(", ") || "none"}]`);
console.log(`           render-state: ${JSON.stringify(state)}`);

let iter = 0;
let stoppedBecause = "max iterations reached";
while (iter < MAX_ITERS) {
  if (res.pct !== null && res.pct >= TARGET && res.reds.length === 0) { stoppedBecause = "threshold cleared"; break; }
  const prop = propose(res.reds, state);
  if (!prop) { stoppedBecause = "no further repair proposed (stuck)"; break; }

  const cand = measure(prop.next);
  iter++;
  console.log(line);
  console.log(`  iter ${iter} — addressing ${prop.addresses}`);
  console.log(`           ${prop.rationale}`);
  if (cand.pct !== null && (res.pct === null || cand.pct > res.pct)) {
    console.log(`           ${fmt(res.pct)} → ${fmt(cand.pct)}   KEPT (correctness improved)`);
    console.log(`           render-state: ${JSON.stringify(prop.next)}`);
    state = prop.next;
    res = cand;
  } else {
    console.log(`           ${fmt(res.pct)} → ${fmt(cand.pct)}   REJECTED (no improvement) — reverting`);
    stoppedBecause = `candidate fix for ${prop.addresses} did not improve the number`;
    break;
  }
}

console.log(line);
const cleared = res.pct !== null && res.pct >= TARGET && res.reds.length === 0;
console.log(`  DONE — ${fmt(res.pct)} after ${iter} fix(es).  ${stoppedBecause}.`);
console.log(`  remaining reds: [${res.reds.map((r) => r.id).join(", ") || "none"}]`);
console.log(line);
process.exit(cleared ? 0 : 1);
