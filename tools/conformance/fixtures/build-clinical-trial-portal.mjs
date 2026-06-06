// tools/conformance/fixtures/build-clinical-trial-portal.mjs
//   node fixtures/build-clinical-trial-portal.mjs
//
// Builds fixtures/clinical-trial-portal.db — a render-1-FAITHFUL SQLite store
// standing in for a live `deno task seed` + lifecycle walk. The demo runs on
// Deno (jsr: imports, Argon2id WASM) which is not present in this sandbox, and
// the checked-in dev.db carries only the stale seed event, so this script
// replays render 1's documented lifecycle (Demo2-plan §0 scenario) using:
//   • the render's ACTUAL schema (migrations/0001_init.sql, exec'd verbatim), and
//   • a byte-faithful port of the render's event/hash construction
//     (composition.ts event semantics + lib/canonical.ts + lib/hash.ts +
//      domain/event_log.ts appendEvent + scripts/seed.ts genesis event).
//
// Faithfulness is verified two ways:
//   1. the genesis study.registered hash reproduces seed.ts EXACTLY (incl. its
//      latent id-omission bug — see below), and
//   2. the operational chain (events 2..N) is a valid appendEvent chain.
// When Deno is available, point the validator at the real dev.db instead
// (`--db .../data/dev.db`); the validator code is identical either way.
//
// FAITHFULLY REPRODUCED RENDER BUG: scripts/seed.ts hashes the genesis
// `study.registered` row WITHOUT the `id` field, while appendEvent/verifyChain
// hash WITH `id`. The genesis row therefore fails verifyChain on a pristine DB
// (a false "tamper at event #1"). We reproduce this exactly so the conformance
// run reflects render 1 as it actually behaves. Do NOT "fix" it here — that
// would hide a real defect the validator exists to surface.

import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const SCHEMA = join(REPO, "demos/clinical-trial-portal/migrations/0001_init.sql");
// The fixture is a GENERATED artifact, not a committed binary. It is built onto
// the native tmp FS because SQLite cannot create/lock a live DB on the mounted
// repo FS (disk-I/O + readonly-rollback errors). The runner defaults `--db` to
// this same path, so `build` then `validate` need no path plumbing. When Deno
// is available, regenerate the real store and point the validator at it with
// `--db .../data/dev.db` instead.
const FIXDIR = join(tmpdir(), "grace-commons-conformance");

// CLI: [--defect <name> ...] [--out <path>]
//   The DEFAULT build is correct — a fully-verifying chain, mirroring render 1
//   as patched in the demo on 2026-06-06. Defects are opt-in and repeatable:
//   --defect genesis-hash      hash the genesis event WITHOUT `id` — render 1's
//                              original seed-hash bug (fixed in the demo
//                              2026-06-06; retained here as a reproducible
//                              injection, see DISCOVERIES.md). verifyChain then
//                              false-fails at event #1.
//   --defect skip-grant-audit  a render that writes an operational grant row but
//                              skips its audit append. The grant exists; its
//                              grant.issued event does not.
//   --defect tamper-payload    an adversary rewrites a committed event's payload
//                              after the fact, breaking the chain at that row.
const argv = process.argv.slice(2);
const DEFECTS = new Set();
for (let i = 0; i < argv.length; i++) if (argv[i] === "--defect") DEFECTS.add(argv[i + 1]);
const OUT = argv.includes("--out")
  ? argv[argv.indexOf("--out") + 1]
  : join(FIXDIR, "clinical-trial-portal.db");

// ── ported render primitives ────────────────────────────────────────────────
const canonicalize = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
  const k = Object.keys(v).sort();
  return "{" + k.map((x) => JSON.stringify(x) + ":" + canonicalize(v[x])).join(",") + "}";
};
const sha256hex = (s) => createHash("sha256").update(s).digest("hex");

mkdirSync(FIXDIR, { recursive: true });
if (existsSync(OUT)) rmSync(OUT);
if (existsSync(OUT + "-journal")) rmSync(OUT + "-journal");
const db = new DatabaseSync(OUT);
db.exec("PRAGMA foreign_keys = ON;");
db.exec(readFileSync(SCHEMA, "utf-8"));

// ── time base ────────────────────────────────────────────────────────────────
const BASE = Date.parse("2026-05-20T09:00:00.000Z");
const at = (mins) => new Date(BASE + mins * 60_000).toISOString();
const SEED_T = new Date(BASE - 6 * 86_400_000).toISOString();        // provisioning
const GENESIS_T = new Date(BASE - 8 * 365.25 * 86_400_000).toISOString(); // backdated
const EXPIRES = (mins) => new Date(BASE + mins * 60_000 + 7 * 86_400_000).toISOString();

// ── event-chain state (mirrors appendEvent reading prev row's this_hash) ─────
let prevHash = "";
let nextId = 1;
const insEvent = db.prepare(
  `INSERT INTO event_log (id, occurred_at, actor_id, session_id, action, target_kind, target_id, payload_json, prev_hash, this_hash)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

/** appendEvent-faithful: hashable INCLUDES id. */
function emit({ actor_id = null, session_id = null, action, target_kind = null, target_id = null, payload = {}, occurred_at }) {
  const id = nextId++;
  const payload_json = canonicalize(payload);
  const this_hash = sha256hex(
    canonicalize({ id, occurred_at, actor_id, session_id, action, target_kind, target_id, payload_json, prev_hash: prevHash }),
  );
  insEvent.run(id, occurred_at, actor_id, session_id, action, target_kind, target_id, payload_json, prevHash, this_hash);
  prevHash = this_hash;
  return id;
}

/** seed.ts-faithful genesis: hashable OMITS id (the reproduced render bug). */
function emitGenesis({ action, target_kind, target_id, payload, occurred_at }) {
  const id = nextId++;
  const payload_json = canonicalize(payload);
  const this_hash = sha256hex(
    canonicalize({ action, actor_id: null, occurred_at, payload_json, prev_hash: prevHash, session_id: null, target_id, target_kind }),
  );
  insEvent.run(id, occurred_at, null, null, action, target_kind, target_id, payload_json, prevHash, this_hash);
  prevHash = this_hash;
  return id;
}

// ── bootstrap provisioning (the documented seam: NO audit events) ────────────
db.prepare("INSERT INTO parties (id,email,display_name,created_at) VALUES (1,'anya@beacon.clinical','Dr. Anya Okonkwo',?)").run(SEED_T);
db.prepare("INSERT INTO parties (id,email,display_name,created_at) VALUES (2,'jordan@beacon.clinical','Jordan Lee',?)").run(SEED_T);
db.prepare("INSERT INTO actors (id,party_id,created_at) VALUES (1,1,?)").run(SEED_T); // PI
db.prepare("INSERT INTO actors (id,party_id,created_at) VALUES (2,2,?)").run(SEED_T); // CRA
db.prepare("INSERT INTO credentials (id,actor_id,kind,secret_hash,created_at) VALUES (1,1,'password','$argon2id$seed$pi',?)").run(SEED_T);
db.prepare("INSERT INTO credentials (id,actor_id,kind,secret_hash,created_at) VALUES (2,2,'password','$argon2id$seed$cra',?)").run(SEED_T);
const PERMS = [["invite_actor","Invite a coordinator"],["grant_permission","Manage grants on others"],["enroll_subject","Enroll a subject"],["record_visit","Record a study visit"],["view_audit","View the audit log"]];
PERMS.forEach((p, i) => db.prepare("INSERT INTO permissions (id,code,label) VALUES (?,?,?)").run(i + 1, p[0], p[1]));
db.prepare("INSERT INTO studies (id,protocol_number,title,created_at) VALUES (1,'BCN-OX-201','Beacon Oncology Phase II',?)").run(SEED_T);
db.prepare("INSERT INTO retention_policy (id,days,enforce_on_read) VALUES (1,2555,0)").run(); // §8.6: enforcement off in seed
// 6 bootstrap grants, all among seeded identities (grantee ∈ {PI,CRA}) → no events.
const insGrant = db.prepare("INSERT INTO grants (id,grantor_actor_id,grantee_actor_id,permission_id,scope,issued_at,revoked_at,revoke_reason) VALUES (?,?,?,?,?,?,?,?)");
insGrant.run(1, 1, 1, 1, "all", SEED_T, null, null); // PI: invite_actor
insGrant.run(2, 1, 1, 2, "all", SEED_T, null, null); // PI: grant_permission
insGrant.run(3, 1, 1, 3, "all", SEED_T, null, null); // PI: enroll_subject
insGrant.run(4, 1, 1, 4, "all", SEED_T, null, null); // PI: record_visit
insGrant.run(5, 1, 1, 5, "own", SEED_T, null, null); // PI: view_audit (own)
insGrant.run(6, 1, 2, 5, "all", SEED_T, null, null); // CRA: view_audit (all)

// ── genesis event ────────────────────────────────────────────────────────────
// Default: id-included hash (matches the demo's patched seed.ts) → chain verifies.
// --defect genesis-hash: id-less hash, reproducing the original (now-fixed) bug.
const genesisArgs = { action: "study.registered", target_kind: "study", target_id: "BCN-OX-201",
  payload: { note: "Protocol BCN-OX-201 registered in trial management system." }, occurred_at: GENESIS_T };
if (DEFECTS.has("genesis-hash")) emitGenesis(genesisArgs);
else emit(genesisArgs);

// ── operational lifecycle (appendEvent chain) ────────────────────────────────
// A wrong-password attempt (anonymous), then PI logs in.
emit({ action: "login.failed", payload: { email: "anya@beacon.clinical", reason: "bad_password" }, occurred_at: at(0) });

// PI session + login.succeeded
db.prepare("INSERT INTO sessions (id,actor_id,token,issued_at,expires_at,revoked_at) VALUES (1,1,'tok-pi',?,?,NULL)").run(at(1), EXPIRES(1));
emit({ actor_id: 1, session_id: 1, action: "login.succeeded", target_kind: "actor", target_id: 1, payload: {}, occurred_at: at(1) });

// PI invites Maya (party auto-created)
db.prepare("INSERT INTO parties (id,email,display_name,created_at) VALUES (3,'maya@beacon.clinical','Maya Chen',?)").run(at(2));
db.prepare("INSERT INTO invitations (id,party_id,intended_role,token,issued_by_actor_id,issued_at,expires_at,accepted_at,accepted_by_actor_id,revoked_at) VALUES (1,3,'study_coordinator','tok-inv',1,?,?,NULL,NULL,NULL)").run(at(2), EXPIRES(2));
emit({ actor_id: 1, session_id: 1, action: "invitation.issued", target_kind: "invitation", target_id: 1,
  payload: { display_name: "Maya Chen", email: "maya@beacon.clinical", intended_role: "study_coordinator", expires_at: EXPIRES(2) }, occurred_at: at(2) });

// Maya accepts → onboarding burst (actor 3 + credential 3 + session 2; all 4 events share actor=3,session=2)
db.prepare("INSERT INTO actors (id,party_id,created_at) VALUES (3,3,?)").run(at(3));
db.prepare("INSERT INTO credentials (id,actor_id,kind,secret_hash,created_at) VALUES (3,3,'password','$argon2id$maya',?)").run(at(3));
db.prepare("INSERT INTO sessions (id,actor_id,token,issued_at,expires_at,revoked_at) VALUES (2,3,'tok-maya',?,?,NULL)").run(at(3), EXPIRES(3));
db.prepare("UPDATE invitations SET accepted_at=?, accepted_by_actor_id=3 WHERE id=1").run(at(3));
emit({ actor_id: 3, session_id: 2, action: "invitation.accepted", target_kind: "invitation", target_id: 1, payload: { intended_role: "study_coordinator" }, occurred_at: at(3) });
emit({ actor_id: 3, session_id: 2, action: "actor.enrolled", target_kind: "actor", target_id: 3, payload: { party_id: 3, via_invitation_id: 1 }, occurred_at: at(3) });
emit({ actor_id: 3, session_id: 2, action: "credential.created", target_kind: "credential", target_id: null, payload: { kind: "password" }, occurred_at: at(3) });
emit({ actor_id: 3, session_id: 2, action: "session.opened", target_kind: "session", target_id: 2, payload: { actor_id: 3, via: "onboard" }, occurred_at: at(3) });

// PI grants Maya enroll_subject, record_visit, view_audit(own)  (operational grants, with events)
insGrant.run(7, 1, 3, 3, "all", at(4), null, null);
insGrant.run(8, 1, 3, 4, "all", at(4), null, null);
insGrant.run(9, 1, 3, 5, "own", at(4), null, null);
// DEFECT skip-grant-audit: the grant row above (g7) was inserted, but this
// render "forgot" to append its audit event. The grant exists with no
// attestation — exactly what APA-1 must catch.
if (!DEFECTS.has("skip-grant-audit")) {
  emit({ actor_id: 1, session_id: 1, action: "grant.issued", target_kind: "grant", target_id: 7, payload: { grantee_actor_id: 3, permission_id: 3, scope: "all" }, occurred_at: at(4) });
}
emit({ actor_id: 1, session_id: 1, action: "grant.issued", target_kind: "grant", target_id: 8, payload: { grantee_actor_id: 3, permission_id: 4, scope: "all" }, occurred_at: at(4) });
emit({ actor_id: 1, session_id: 1, action: "grant.issued", target_kind: "grant", target_id: 9, payload: { grantee_actor_id: 3, permission_id: 5, scope: "own" }, occurred_at: at(4) });

// Maya enrolls subject BCN-001 and records the screening visit
db.prepare("INSERT INTO subjects (id,study_id,subject_code,status,enrolled_by_actor_id,enrolled_at,notes) VALUES (1,1,'BCN-001','screening',3,?,NULL)").run(at(5));
emit({ actor_id: 3, session_id: 2, action: "subject.enrolled", target_kind: "subject", target_id: 1, payload: { study_id: 1, subject_code: "BCN-001" }, occurred_at: at(5) });
db.prepare("INSERT INTO visits (id,subject_id,visit_kind,recorded_by_actor_id,recorded_at,notes) VALUES (1,1,'screening',3,?,NULL)").run(at(6));
emit({ actor_id: 3, session_id: 2, action: "visit.recorded", target_kind: "visit", target_id: 1, payload: { subject_id: 1, visit_kind: "screening" }, occurred_at: at(6) });

// CRA logs in
db.prepare("INSERT INTO sessions (id,actor_id,token,issued_at,expires_at,revoked_at) VALUES (3,2,'tok-cra',?,?,NULL)").run(at(7), EXPIRES(7));
emit({ actor_id: 2, session_id: 3, action: "login.succeeded", target_kind: "actor", target_id: 2, payload: {}, occurred_at: at(7) });

// PI revokes Maya's view_audit grant, then logs out
db.prepare("UPDATE grants SET revoked_at=?, revoke_reason='role change' WHERE id=9").run(at(8));
emit({ actor_id: 1, session_id: 1, action: "grant.revoked", target_kind: "grant", target_id: 9, payload: { reason: "role change" }, occurred_at: at(8) });
db.prepare("UPDATE sessions SET revoked_at=? WHERE id=1").run(at(9));
emit({ actor_id: 1, session_id: 1, action: "session.revoked", target_kind: "session", target_id: 1, payload: {}, occurred_at: at(9) });

// DEFECT tamper-payload: an adversary with raw DB write access rewrites a
// committed event's payload AFTER the fact (no re-hash). verifyChain must
// localize the divergence at this row. Targets the visit.recorded event.
if (DEFECTS.has("tamper-payload")) {
  const target = db.prepare("SELECT id FROM event_log WHERE action='visit.recorded' ORDER BY id LIMIT 1").get();
  if (!target) throw new Error("tamper-payload: no visit.recorded event to tamper");
  db.prepare("UPDATE event_log SET payload_json = ? WHERE id = ?").run('{"subject_id":999,"visit_kind":"forged"}', target.id);
  console.log(`  injected tamper-payload at event #${target.id}`);
}

db.close();
console.log(`built ${OUT}`);
console.log(`events: ${nextId - 1}  ·  defects: ${DEFECTS.size ? [...DEFECTS].join(",") : "none (correct render)"}`);
