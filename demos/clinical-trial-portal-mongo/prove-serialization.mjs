// prove-serialization.mjs — measure, don't assert, the 4th mechanism.
//   node prove-serialization.mjs [N]   (default 16 concurrent ops)
//
// The Event Log atom's operational clause: "appends never fail for ordering or
// contention reasons — the underlying implementation must serialize them"
// (Invariant 3, total order). This render's mechanism is the replica-set
// transaction + unique event_log._id + withTransaction's optimistic retry.
// This script makes the claim measurable: fire N genuinely concurrent ops
// (each = atom write + audit append in one transaction), then check from the
// records alone that
//   (1) every op landed (N grant rows, N grant.issued events),
//   (2) event ids are gapless (total order, no holes from aborted attempts),
//   (3) the hash chain re-verifies end-to-end (no fork ever committed).
// Under load, several transactions WILL collide on the same tail and be
// re-run; none of that is visible to callers and none of it can fork the
// chain — which is exactly what the clause requires.
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { open } from "./portal.mjs";

const N = Number(process.argv[2] ?? 16);
const DIR = mkdtempSync(join(tmpdir(), "ctp-mongo-serialize-"));

const rs = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ dbPath: DIR }],
});

try {
  const p = await open(rs.getUri());
  await p.migrate();
  await p.seed();

  const ctx = { actor: null, session: null };
  const r = await p.login(ctx, { email: "anya@beacon.clinical", password: "demo-pi" });
  if (!r.ok) throw new Error("login failed");
  const before = await p.db.collection("event_log").countDocuments();
  const perm = await p.permissionByCode("view_audit");

  // N concurrent grant ops — all race on the same event_log tail.
  await Promise.all(
    Array.from({ length: N }, () =>
      p.grantPermission(ctx, { grantee_actor_id: ctx.actor._id, permission_id: perm._id, scope: "own" }),
    ),
  );

  const rows = await p.db.collection("event_log").find().sort({ _id: 1 }).toArray();
  const issued = rows.filter((e) => e.action === "grant.issued").length;
  const gapless = rows.every((e, i) => e._id === i + 1);
  const v = await p.verifyChain();
  await p.close();

  console.log(`  ops fired concurrently : ${N}`);
  console.log(`  grant.issued appended  : ${issued - 0} (expected ≥ ${N})`);
  console.log(`  events ${before} → ${rows.length}; ids gapless: ${gapless}`);
  console.log(`  chain verify           : ${v.ok ? `ok (${v.count} events)` : `FAILED at #${v.at}`}`);
  if (!v.ok || !gapless || rows.length !== before + N) {
    console.error("SERIALIZATION PROOF FAILED");
    process.exit(1);
  }
  console.log("  SERIALIZED — no fork, no gap, no caller-visible contention failure.");
} finally {
  await rs.stop({ doCleanup: false });
  rmSync(DIR, { recursive: true, force: true });
}
