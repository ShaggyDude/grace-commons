// tools/conformance/agree.mjs
//
// Multi-render AGREEMENT — the number the thesis rests on. A spec claim is
// "carried by the spec" only if it holds identically across two INDEPENDENT
// renders of the same spec surface. This runs the validator against two renders
// (same manifest, different adapters) and compares verdict-by-verdict:
//
//   agreed-pass  : both renders pass        → spec-carried meaning, confirmed
//   agreed-fail  : both renders fail        → a shared gap (spec or both renders)
//   DISAGREE     : verdicts differ          → render-specific behavior/defect;
//                                             the spec under-determines it, or one
//                                             render is buggy. The interesting ones.
//
//   cross-render correctness = (checks passing on BOTH) / denominator.
//
//   node agree.mjs <manifest> <renderA-id> <renderB-id> [--dbA p] [--dbB p]

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const die = (m) => { console.error(`agree: ${m}`); process.exit(2); };

const argv = process.argv.slice(2);
const pos = argv.filter((a) => !a.startsWith("--"));
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const [manifest, a, b] = pos;
if (!manifest || !a || !b) die("usage: agree.mjs <manifest> <renderA-id> <renderB-id> [--dbA p] [--dbB p]");

function measure(renderId, db) {
  const args = [join(HERE, "validate.mjs"), renderId, "--manifest", manifest, "--json"];
  if (db) args.push("--db", db);
  let out;
  try { out = execFileSync("node", args, { encoding: "utf-8" }); }
  catch (e) { out = e.stdout; }            // validator exits 1 on a red; JSON still on stdout
  if (!out) die(`no output from validator for '${renderId}'`);
  const j = JSON.parse(out);
  const status = {};
  for (const c of j.checks) status[c.id] = c.status;
  return { id: renderId, pct: j.correctness_pct, status, checks: j.checks };
}

const A = measure(a, opt("--dbA"));
const B = measure(b, opt("--dbB"));

// Compare over the denominator-eligible checks (those present in both reports).
const ids = A.checks.map((c) => c.id).filter((id) => id in B.status);
const agreedPass = [], agreedFail = [], disagree = [];
for (const id of ids) {
  const sa = A.status[id], sb = B.status[id];
  if (sa === "pass" && sb === "pass") agreedPass.push(id);
  else if (sa === "fail" && sb === "fail") agreedFail.push(id);
  else if (sa !== sb) disagree.push({ id, [a]: sa, [b]: sb });
}
const denom = ids.length;
const crossPct = denom ? Math.round((1000 * agreedPass.length) / denom) / 10 : null;

const line = "─".repeat(72);
console.log(line);
console.log(`  multi-render agreement — manifest: ${manifest}`);
console.log(`    render A  ${a.padEnd(28)} ${A.pct}%`);
console.log(`    render B  ${b.padEnd(28)} ${B.pct}%`);
console.log(line);
console.log(`  CROSS-RENDER CORRECTNESS: ${crossPct}%   (${agreedPass.length}/${denom} pass on BOTH)`);
console.log(`    agreed-pass ${agreedPass.length}   ·   agreed-fail ${agreedFail.length}   ·   DISAGREE ${disagree.length}`);
if (disagree.length) {
  console.log(line);
  console.log(`  disagreements (render-specific — the spec did not pin these down identically):`);
  for (const d of disagree) console.log(`    ${d.id.padEnd(8)}  ${a}=${d[a]}   ${b}=${d[b]}`);
}
console.log(line);
process.exit(disagree.length ? 1 : 0);
