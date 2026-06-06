/**
 * scripts/verify.ts — CLI chain verifier (BUILD_PLAN §2 / render 1's `deno task
 * verify`). Lists the audit log and recomputes the full hash chain, for monitors
 * who do not want to trust the web UI.
 */
import { db } from "../lib/db.ts";
import { verifyChain, listAll } from "../domain/event_log.ts";

const events = await listAll(db);
console.log(`event_log: ${events.length} event(s)`);
for (const e of events) {
  console.log(`  #${e.id}  ${e.action.padEnd(20)} ${e.target_kind ?? "—"}:${e.target_id ?? "—"}  actor=${e.actor_id ?? "anon"}`);
}
const r = await verifyChain(db);
console.log(
  r.ok
    ? `\n✓ Verified ${r.count} event(s) through the hash chain.`
    : `\n✗ Tamper detected at event #${r.at}.  expected ${r.expected.slice(0, 12)}…  found ${r.found.slice(0, 12)}…`,
);
process.exit(r.ok ? 0 : 1);
