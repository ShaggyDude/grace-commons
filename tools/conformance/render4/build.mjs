// tools/conformance/render4/build.mjs
//
// Render-4 build entry — migrate/seed the append-only JSONL store, then drive the
// shared ghost scenario through the render-4 actions adapter. Mirrors the other
// renders' build path: store lives under os.tmpdir() (the repo FS rejects some
// writes; a JSONL file is happy in tmp). After this runs, validate.mjs can be
// pointed at the store path printed below.
//
//   node render4/build.mjs
//   node validate.mjs clinical-trial-portal-r4 --manifest clinical-trial-portal --db <path> --json

import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

import { freshPortal } from "./portal.mjs";
import { runScenario } from "../ghost/runner.mjs";
import scenario from "../ghost/scenarios/full-lifecycle.mjs";
import createActions from "../ghost/adapters/clinical-trial-portal-r4.actions.mjs";

const dir = join(tmpdir(), "grace-commons-conformance");
mkdirSync(dir, { recursive: true });
const dbPath = join(dir, "clinical-trial-portal-r4.jsonl");

// 1. migrate + seed — fresh store, bootstrap seam (PI/CRA, bootstrap grants,
//    genesis study.registered event, retention policy).
const seedPortal = freshPortal(dbPath);
seedPortal.seed();

// 2. drive the shared scenario via the actions adapter (re-opens the same store
//    from its JSONL log, so the run continues the seeded ledger).
const actions = createActions({ dbPath });
const bindings = await runScenario(scenario, actions, {
  log: (n, step, result) => {
    const r = result && Object.keys(result).length ? ` -> ${JSON.stringify(result)}` : "";
    console.log(`  [${String(n).padStart(2)}] ${step.actor.padEnd(5)} ${step.action}${r}`);
  },
});
actions.close();

console.log("");
console.log(`render4 store written: ${dbPath}`);
console.log(`bindings: ${JSON.stringify(bindings)}`);
