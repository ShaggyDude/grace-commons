// tools/conformance/render5/build.mjs
//
// Build the render-5 store: migrate + seed, then drive the shared, render-
// agnostic full-lifecycle scenario through render 5's actions adapter. Writes
// the pglite store DIRECTORY under os.tmpdir()/grace-commons-conformance so the
// validator can re-open it in a separate process.
//
//   node render5/build.mjs
//   node validate.mjs clinical-trial-portal-nextjs \
//     --manifest clinical-trial-portal --db <tmp>/clinical-trial-portal-nextjs --json

import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runScenario } from "../ghost/runner.mjs";
import scenario from "../ghost/scenarios/full-lifecycle.mjs";
import createActions from "../ghost/adapters/clinical-trial-portal-nextjs.actions.mjs";

const RENDER_ID = "clinical-trial-portal-nextjs";
const dbPath = join(tmpdir(), "grace-commons-conformance", RENDER_ID);

async function main() {
  // Fresh store each build (PGlite persists a data dir; wipe it so the run is
  // deterministic and the audit seq starts at the genesis row).
  try { rmSync(dbPath, { recursive: true, force: true }); } catch {}

  console.log(`render 5 (Next.js + Postgres/pglite) — building store at:`);
  console.log(`  ${dbPath}`);
  console.log(`os.tmpdir() = ${tmpdir()}`);

  const actions = await createActions({ dbPath });

  let step = 0;
  await runScenario(scenario, actions, {
    log: (i, s, result) => {
      step = i;
      const r = result && Object.keys(result).length ? ` -> ${JSON.stringify(result)}` : "";
      console.log(`  [${String(i).padStart(2, "0")}] ${s.actor} ${s.action}${r}`);
    },
  });

  await actions.close();
  console.log(`scenario complete: ${step} steps. store persisted.`);
}

main().catch((e) => {
  console.error("build failed:", e);
  process.exit(1);
});
