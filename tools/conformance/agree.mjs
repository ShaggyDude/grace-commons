// tools/conformance/agree.mjs
//
// Multi-render AGREEMENT — the number the thesis rests on. A spec claim is
// "carried by the spec" only if it holds identically across INDEPENDENT renders
// of the same surface. Runs the validator against N renders (same manifest,
// different adapters) and compares verdict-by-verdict:
//
//   agreed-pass : every render passes      → spec-carried meaning, confirmed
//   agreed-fail : every render fails        → a shared gap (spec or all renders)
//   DISAGREE    : verdicts differ           → render-specific; the spec under-
//                                             determines it, or a render is buggy
//
//   cross-render correctness = (checks passing on EVERY render) / denominator.
//
//   node agree.mjs <manifest> <render...>      where render = id  OR  id=dbpath

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const die = (m) => { console.error(`agree: ${m}`); process.exit(2); };

const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [manifest, ...renderSpecs] = argv;
if (!manifest || renderSpecs.length < 2) die("usage: agree.mjs <manifest> <renderA> <renderB> [renderC ...]   (render = id or id=dbpath)");

function measure(spec) {
  const [id, db] = spec.split("=");
  const args = [join(HERE, "validate.mjs"), id, "--manifest", manifest, "--json"];
  if (db) args.push("--db", db);
  let out;
  try { out = execFileSync("node", args, { encoding: "utf-8" }); }
  catch (e) { out = e.stdout; }                 // validator exits 1 on a red; JSON still on stdout
  if (!out) die(`no validator output for '${id}'`);
  const j = JSON.parse(out);
  const status = {};
  for (const c of j.checks) status[c.id] = c.status;
  return { id, pct: j.correctness_pct, status, ids: j.checks.map((c) => c.id) };
}

const renders = renderSpecs.map(measure);

// Compare over checks present in every render's report.
const ids = renders[0].ids.filter((id) => renders.every((r) => id in r.status));
const agreedPass = [], agreedFail = [], disagree = [];
for (const id of ids) {
  const verdicts = renders.map((r) => r.status[id]);
  if (verdicts.every((v) => v === "pass")) agreedPass.push(id);
  else if (verdicts.every((v) => v === "fail")) agreedFail.push(id);
  else disagree.push({ id, verdicts });
}
const denom = ids.length;
const crossPct = denom ? Math.round((1000 * agreedPass.length) / denom) / 10 : null;

const line = "─".repeat(72);
console.log(line);
console.log(`  multi-render agreement — manifest: ${manifest}   (${renders.length} renders)`);
for (const r of renders) console.log(`    ${r.id.padEnd(30)} ${r.pct}%`);
console.log(line);
console.log(`  CROSS-RENDER CORRECTNESS: ${crossPct}%   (${agreedPass.length}/${denom} pass on EVERY render)`);
console.log(`    agreed-pass ${agreedPass.length}   ·   agreed-fail ${agreedFail.length}   ·   DISAGREE ${disagree.length}`);
if (disagree.length) {
  console.log(line);
  console.log(`  disagreements (render-specific — the spec did not pin these down identically):`);
  for (const d of disagree) {
    const detail = renders.map((r, i) => `${r.id}=${d.verdicts[i]}`).join("   ");
    console.log(`    ${d.id.padEnd(8)}  ${detail}`);
  }
}
console.log(line);
process.exit(disagree.length ? 1 : 0);
