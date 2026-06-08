// build.mjs — build the Mongo ghost render's store.
//   node build.mjs [--out <dir>]
//
// Boots an EPHEMERAL one-node replica set via mongodb-memory-server (no root,
// no system install, never touches committed data; honors
// MONGOMS_SYSTEM_BINARY when a local mongod should be used instead of a
// download), persists its data directory to --out, then: migrate + seed
// (bootstrap seam — no audit events except genesis), and drives the SAME ghost
// scenario as every other render through this render's actions adapter.
// The persisted directory is what the validator reads:
//   node validate.mjs clinical-trial-portal-mongo --manifest clinical-trial-portal --db <dir>
//
// A replica set (not a standalone) because multi-document transactions require
// one — the same atomicity render 2 gets from BEGIN/COMMIT. The persisted dir
// is later readable by a plain standalone mongod (the validator adapter does
// exactly that), which sidesteps re-forming the replset config on a new port.
import { rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { open } from "./portal.mjs";
import { runScenario } from "../../tools/conformance/ghost/runner.mjs";
import createActions from "../../tools/conformance/ghost/adapters/clinical-trial-portal-mongo.actions.mjs";
import { scenario } from "../../tools/conformance/ghost/scenarios/full-lifecycle.mjs";

const argv = process.argv.slice(2);
const outFlag = argv.indexOf("--out");
const DIR = outFlag >= 0 ? argv[outFlag + 1]
  : join(tmpdir(), "grace-commons-conformance", "clinical-trial-portal-mongo");

if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const rs = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ dbPath: DIR }],
});
const uri = rs.getUri();

try {
  // 1) migrate + seed (bootstrap seam — the only seed event is the genesis).
  const p = await open(uri);
  await p.migrate();
  await p.seed();
  await p.close();

  // 2) drive the shared scenario through this render's actions adapter.
  const actions = createActions({ uri });
  await runScenario(scenario, actions, {
    log: (n, step, result) => {
      const tail = result && Object.keys(result).length ? `  → ${JSON.stringify(result)}` : "";
      console.log(`  [${String(n).padStart(2)}] ${step.actor.padEnd(4)} ${step.action}${tail}`);
    },
  });
  await actions.close();

  // 3) sanity gate: the stored chain must re-verify before we call it built.
  const check = await open(uri);
  const v = await check.verifyChain();
  const events = await check.db.collection("event_log").countDocuments();
  await check.close();
  if (!v.ok) throw new Error(`chain verify FAILED at event #${v.at}`);
  console.log(`\n  chain verified: ${v.count}/${events} events`);
} finally {
  // Clean shutdown; KEEP the data directory — it is the artifact.
  await rs.stop({ doCleanup: false });
}

console.log(`built ${DIR}`);
