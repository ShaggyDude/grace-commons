/**
 * scripts/prove-chain.ts — BUILD_PLAN §10 step 3: prove the hash chain before
 * anything is built on it. Migrates, appends events through `withTx` (so the
 * advisory lock + id-under-lock path runs), verifies the chain, then tampers a
 * row and confirms verifyChain flags the exact id.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec, withTx, query, db, type Ctx } from "../lib/db.ts";
import { appendEvent, verifyChain, listAll } from "../domain/event_log.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
await exec(readFileSync(join(HERE, "..", "migrations", "0001_init.sql"), "utf-8"));

const anon: Ctx = { actor: null, session: null };

// Three anonymous events (no actor/session FK rows needed) — enough to prove the
// chain mechanics: genesis with prev_hash='', then two more linked by prev_hash.
await withTx(anon, async (tx) =>
  void (await appendEvent(tx, { action: "study.registered", target_kind: "study", target_id: null, payload: { protocol_number: "BCN-OX-201" } })));
await withTx(anon, async (tx) =>
  void (await appendEvent(tx, { action: "login.failed", payload: { email: "x@y.z", reason: "bad_password" } })));
await withTx(anon, async (tx) =>
  void (await appendEvent(tx, { action: "subject.enrolled", target_kind: "subject", target_id: 1, payload: { study_id: 1, subject_code: "BCN-001" } })));

const clean = await verifyChain(db);
console.log("events        :", (await listAll(db)).map((r) => `${r.id}:${r.action}`).join(" "));
console.log("verifyChain   :", JSON.stringify(clean));

// Tamper event #2's payload directly (adversary with DB write access).
await query("UPDATE event_log SET payload_json = $1 WHERE id = 2", ['{"tampered":true}']);
const tampered = await verifyChain(db);
console.log("after tamper#2:", JSON.stringify(tampered));

const ok = clean.ok === true && clean.count === 3 && tampered.ok === false && (tampered as any).at === 2;
console.log(ok ? "\n✓ CHAIN PROVEN — clean verifies, tamper localized at #2." : "\n✗ CHAIN PROOF FAILED.");
process.exit(ok ? 0 : 1);
