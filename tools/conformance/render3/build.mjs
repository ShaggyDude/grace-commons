// tools/conformance/render3/build.mjs
//   node render3/build.mjs
//
// Builds render 3's Postgres store: migrate + seed, then drives the SAME ghost
// scenario through render 3's actions adapter. pglite persists to a DIRECTORY on
// the native tmp FS; the validator reads it with
//   node validate.mjs clinical-trial-portal-pg --manifest clinical-trial-portal --db <dir>

import { rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { open } from "./portal.mjs";
import { runScenario } from "../ghost/runner.mjs";
import createActions from "../ghost/adapters/clinical-trial-portal-pg.actions.mjs";
import { scenario } from "../ghost/scenarios/full-lifecycle.mjs";

const DIR = join(tmpdir(), "grace-commons-conformance", "clinical-trial-portal-pg");
mkdirSync(join(tmpdir(), "grace-commons-conformance"), { recursive: true });
if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });

// 1) migrate + seed (bootstrap seam — no audit events except genesis).
const p = open(DIR);
await p.migrate();
await p.seed();
await p.close();

// 2) drive the shared scenario through render 3's actions adapter.
const actions = createActions({ dbPath: DIR });
await runScenario(scenario, actions, {
  log: (n, step, result) => {
    const tail = result && Object.keys(result).length ? `  → ${JSON.stringify(result)}` : "";
    console.log(`  [${String(n).padStart(2)}] ${step.actor.padEnd(4)} ${step.action}${tail}`);
  },
});
await actions.close();

console.log(`\nbuilt ${DIR}`);
