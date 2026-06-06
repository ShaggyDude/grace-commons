// tools/conformance/render5/seed.mjs
//
// The bootstrap seam. A regulated system has to come up with SOME identities
// and grants already in place — the provisioning seam the evaluators document
// (bootstrapActorIds, the "bootstrap grant(s) excluded" branch in APA-1). Those
// seed identities and seed grants are created WITHOUT audit events, on purpose:
//
//   * seed staff (PI, CRA) have NO actor.enrolled event  → they are the
//     bootstrap actors C16/APA expect to find.
//   * seed grants (PI's four operational caps + view_audit, CRA's view_audit)
//     have NO grant.issued event → the "provisioning seam" APA-1 excludes.
//
// The ONE event the bootstrap writes is the genesis audit row: anonymous (no
// actor, no token), verb=trial.bootstrapped, which IS the first link in the
// hash chain. It is hashed by the same appendEvent path as every later row.

import { migrate } from "./db.mjs";
import { appendEvent } from "./lib/audit.mjs";
import { hashSecret } from "./lib/crypto.mjs";
import { now } from "./lib/clock.mjs";

const PROTOCOL = "BCN-OX-201";

const SEED_STAFF = [
  { display_name: "Dr. Anya Okonkwo", email: "anya@beacon.clinical", password: "demo-pi", role: "principal_investigator" },
  { display_name: "Jordan Lee", email: "jordan@beacon.clinical", password: "demo-cra", role: "clinical_research_associate" },
];

// The five permission codes, and which the seed staff bootstrap with.
//   PI:  invite_actor, grant_permission, enroll_subject, record_visit (reach=all)
//        + view_audit (reach=own)
//   CRA: view_audit (reach=all)
const SEED_GRANTS = {
  "anya@beacon.clinical": [
    { capability: "invite_actor", reach: "all" },
    { capability: "grant_permission", reach: "all" },
    { capability: "enroll_subject", reach: "all" },
    { capability: "record_visit", reach: "all" },
    { capability: "view_audit", reach: "own" },
  ],
  "jordan@beacon.clinical": [
    { capability: "view_audit", reach: "all" },
  ],
};

export async function seed(db) {
  await migrate(db);

  // Idempotent: skip if already seeded.
  const existing = await db.query(`SELECT COUNT(*)::int AS n FROM staff`);
  if (existing.rows[0].n > 0) return { protocol: PROTOCOL };

  // Retention rule + audit cursor singletons.
  await db.query(
    `INSERT INTO retention_rule (id, horizon_days, filter_on_read)
       VALUES (1, 2555, TRUE)
     ON CONFLICT (id) DO NOTHING`,
  );
  await db.query(
    `INSERT INTO audit_cursor (id, next_seq, last_hash)
       VALUES (1, 1, '')
     ON CONFLICT (id) DO NOTHING`,
  );

  // Genesis audit row — anonymous, in the chain. First link; parent_hash = ''.
  await appendEvent(db, {
    happened_at: now(),
    actor_staff: null,
    token_id: null,
    verb: "trial.bootstrapped",
    subject_kind: "study",
    subject_ref: null,
    detail: { protocol: PROTOCOL, note: "bootstrap seam" },
  });

  const staffByEmail = new Map();

  for (const s of SEED_STAFF) {
    const ts = now();
    const party = await db.query(
      `INSERT INTO party (display_name, email, enrolled_at) VALUES ($1,$2,$3) RETURNING party_id`,
      [s.display_name, s.email, ts],
    );
    const party_id = Number(party.rows[0].party_id);

    const staff = await db.query(
      `INSERT INTO staff (party_id, role, registered_at) VALUES ($1,$2,$3) RETURNING staff_id`,
      [party_id, s.role, ts],
    );
    const staff_id = Number(staff.rows[0].staff_id);
    staffByEmail.set(s.email, staff_id);

    const { algo, salt, digest } = hashSecret(s.password);
    await db.query(
      `INSERT INTO secret (staff_id, algo, salt, digest, minted_at) VALUES ($1,$2,$3,$4,$5)`,
      [staff_id, algo, salt, digest, ts],
    );
  }

  // Seed (bootstrap) grants — NO grant.issued events. granted_by_staff is NULL:
  // they were provisioned, not issued by an operational grantor.
  for (const [email, grants] of Object.entries(SEED_GRANTS)) {
    const staff_id = staffByEmail.get(email);
    for (const g of grants) {
      await db.query(
        `INSERT INTO authority (holder_staff, capability, reach, granted_by_staff, granted_at)
           VALUES ($1,$2,$3,NULL,$4)`,
        [staff_id, g.capability, g.reach, now()],
      );
    }
  }

  return { protocol: PROTOCOL };
}
