/**
 * scripts/seed.ts — idempotent seed (PI Anya, CRA Jordan, 5 permissions, study
 * BCN-OX-201, retention policy, and one backdated genesis audit event).
 *
 * Bootstrap rows are written DIRECTLY (the documented "Bootstrap Identity" seam):
 * the audit trail shows no events for seeded identities/grants — that is expected
 * (the first real event is the PI's first login). The ONLY seed event is the
 * backdated study.registered genesis, appended through the same appendEvent path
 * as every other event so its hash can never diverge (the render-1 bug, fixed).
 *
 * Actor roster matches render 1 byte-for-byte (Demo2-plan §3 / the render-1 seed).
 */
import { db, withTx, type Ctx } from "../lib/db.ts";
import { hashPassword } from "../lib/password.ts";
import { appendEvent, listAll } from "../domain/event_log.ts";
import * as parties from "../domain/parties.ts";
import * as actors from "../domain/actors.ts";
import * as credentials from "../domain/credentials.ts";
import * as permissions from "../domain/permissions.ts";
import * as grants from "../domain/grants.ts";
import * as studies from "../domain/studies.ts";
import * as retention from "../domain/retention_policy.ts";

const PERMS: [string, string][] = [
  ["invite_actor", "Invite a coordinator"],
  ["grant_permission", "Manage grants on others"],
  ["enroll_subject", "Enroll a subject into the protocol"],
  ["record_visit", "Record a study visit"],
  ["view_audit", "View the audit log"],
];

console.log("Seeding permissions…");
for (const [code, label] of PERMS) {
  if (!(await permissions.getByCode(db, code))) { await permissions.create(db, code, label); console.log(`  + ${code}`); }
}

console.log("Seeding study + retention…");
const study = (await studies.getByProtocol(db, "BCN-OX-201"))
  ?? (await studies.create(db, "BCN-OX-201", "Beacon Oncology Phase II Trial"));
await retention.ensure(db, 2555, false); // enforcement OFF in seed so the full chain is visible

/** Bootstrap an account directly (no audit events — the seam). */
async function bootstrapAccount(email: string, name: string, password: string, grantSpecs: [string, "all" | "own"][]) {
  if (await parties.getByEmail(db, email)) { console.log(`  ✓ ${email} already seeded`); return; }
  const party = await parties.create(db, email, name);
  const actor = await actors.create(db, party.id);
  await credentials.create(db, actor.id, "password", await hashPassword(password));
  for (const [code, scope] of grantSpecs) {
    const perm = (await permissions.getByCode(db, code))!;
    await grants.create(db, { grantor_actor_id: actor.id, grantee_actor_id: actor.id, permission_id: perm.id, scope });
  }
  console.log(`  + ${email} (${name})`);
  return actor;
}

console.log("Seeding PI + CRA…");
await bootstrapAccount("anya@beacon.clinical", "Dr. Anya Okonkwo", "demo-pi", [
  ["invite_actor", "all"], ["grant_permission", "all"], ["enroll_subject", "all"], ["record_visit", "all"], ["view_audit", "all"],
]);
// CRA's view_audit grant is issued by the PI in render 1; grantor is the PI actor.
const piActor = await actors.getByPartyId(db, (await parties.getByEmail(db, "anya@beacon.clinical"))!.id);
if (!(await parties.getByEmail(db, "jordan@beacon.clinical"))) {
  const party = await parties.create(db, "jordan@beacon.clinical", "Jordan Lee");
  const actor = await actors.create(db, party.id);
  await credentials.create(db, actor.id, "password", await hashPassword("demo-cra"));
  const va = (await permissions.getByCode(db, "view_audit"))!;
  await grants.create(db, { grantor_actor_id: piActor!.id, grantee_actor_id: actor.id, permission_id: va.id, scope: "all" });
  console.log("  + jordan@beacon.clinical (Jordan Lee)");
} else {
  console.log("  ✓ jordan@beacon.clinical already seeded");
}

console.log("Seeding backdated genesis audit event…");
if ((await listAll(db)).length === 0) {
  const backdated = new Date(Date.now() - 8 * 365.25 * 86_400_000).toISOString();
  const anon: Ctx = { actor: null, session: null };
  await withTx(anon, async (tx) => {
    await appendEvent(tx, {
      action: "study.registered", target_kind: "study", target_id: study.id,
      payload: { protocol_number: "BCN-OX-201", note: "Protocol BCN-OX-201 registered in trial management system." },
      occurred_at: backdated,
    });
  });
  console.log(`  + study.registered backdated to ${backdated.slice(0, 10)}`);
} else {
  console.log("  ✓ event_log already has rows — skipping genesis");
}

console.log(`
✓ Seed complete.
  PI  — anya@beacon.clinical   / demo-pi
  CRA — jordan@beacon.clinical / demo-cra
  Study: BCN-OX-201`);
process.exit(0);
