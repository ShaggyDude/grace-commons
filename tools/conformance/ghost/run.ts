// tools/conformance/ghost/run.ts
//
// Ghost-flow entry point (Deno). Loads the render-agnostic engine + a scenario +
// a render's actions adapter, and runs the journey against a real store.
//
//   cd demos/clinical-trial-portal
//   DB_PATH=./data/real.db deno task migrate
//   DB_PATH=./data/real.db deno task seed
//   DB_PATH=./data/real.db deno run -A --config ./deno.json \
//       ../../tools/conformance/ghost/run.ts
//   node ../../tools/conformance/validate.mjs clinical-trial-portal --db ./data/real.db
//
// (--config points Deno at the demo's import map, since this entry lives outside
// the demo. Run against a freshly migrated + seeded store — the scenario is linear.)

import { runScenario } from "./runner.mjs";
import createActions from "./adapters/clinical-trial-portal.actions.ts";
import { scenario } from "./scenarios/full-lifecycle.mjs";

const DB_PATH = Deno.env.get("DB_PATH");
if (!DB_PATH) {
  console.error("set DB_PATH (e.g. DB_PATH=./data/real.db) — same convention as migrate/seed");
  Deno.exit(2);
}

const adapter = createActions({ dbPath: DB_PATH });
console.log(`ghost: full-lifecycle → ${DB_PATH}`);

try {
  await runScenario(scenario, adapter, {
    log: (n, step, result) => {
      const tail = result && Object.keys(result).length ? `  → ${JSON.stringify(result)}` : "";
      console.log(`  [${String(n).padStart(2)}] ${step.actor.padEnd(4)} ${step.action}${tail}`);
    },
  });
  console.log("\nghost flow complete — store populated. Measure it:");
  console.log(`  node ../../tools/conformance/validate.mjs clinical-trial-portal --db ${DB_PATH}`);
} finally {
  adapter.close();
}
