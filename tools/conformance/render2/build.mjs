// tools/conformance/render2/build.mjs
//   node render2/build.mjs
//
// Builds render 2's store: migrate + seed, then drives the SAME render-agnostic
// ghost scenario (ghost/scenarios/full-lifecycle.mjs) through render 2's actions
// adapter. Pure Node end-to-end. Writes to the native tmp FS (SQLite can't host
// a live DB on the mounted repo FS); the validator defaults --db there.

import { rmSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { open } from "./portal.mjs";
import { runScenario } from "../ghost/runner.mjs";
import createActions from "../ghost/adapters/clinical-trial-portal-next.actions.mjs";
import { scenario } from "../ghost/scenarios/full-lifecycle.mjs";

const FIXDIR = join(tmpdir(), "grace-commons-conformance");
const OUT = join(FIXDIR, "clinical-trial-portal-next.db");

mkdirSync(FIXDIR, { recursive: true });
for (const f of [OUT, OUT + "-journal"]) if (existsSync(f)) rmSync(f);

// 1) migrate + seed (bootstrap seam — no ledger events except genesis).
const p = open(OUT);
p.migrate();
p.seed();
p.close();

// 2) drive the shared scenario via render 2's actions adapter.
const actions = createActions({ dbPath: OUT });
await runScenario(scenario, actions, {
  log: (n, step, result) => {
    const tail = result && Object.keys(result).length ? `  → ${JSON.stringify(result)}` : "";
    console.log(`  [${String(n).padStart(2)}] ${step.actor.padEnd(4)} ${step.action}${tail}`);
  },
});
actions.close();

console.log(`\nbuilt ${OUT}`);
