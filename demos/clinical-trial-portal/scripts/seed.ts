// scripts/seed.ts
//
// Idempotent seed: PI (Anya), CRA (Jordan), 5 permissions, study BCN-OX-201,
// retention policy default.
//
// Bypasses the composition layer intentionally — this is the "Bootstrap Identity"
// seam. Seeding provisions the initial records directly via domain helpers.
// The audit trail will show no events for seeded records; that is expected and
// documented in README.md (the first real event is the PI's first login).
//
// Safe to run multiple times: all inserts are guarded by getByEmail / getByCode
// existence checks before inserting.

import { openDb } from "../lib/db.ts";
import { hashPassword } from "../lib/password.ts";
import * as parties from "../domain/parties.ts";
import * as actors from "../domain/actors.ts";
import * as credentials from "../domain/credentials.ts";
import * as grants from "../domain/grants.ts";
import * as permissions from "../domain/permissions.ts";
import * as studies from "../domain/studies.ts";
import * as retentionPolicy from "../domain/retention_policy.ts";

const DB_PATH = "./data/dev.db";

// Ensure directory exists
await Deno.mkdir("./data", { recursive: true }).catch(() => {});

const db = openDb(DB_PATH);

// ---------------------------------------------------------------------------
// 1. Permissions catalog
// ---------------------------------------------------------------------------

console.log("Seeding permissions…");

const PERM_DEFS = [
  { code: "invite_actor", label: "Invite actors" },
  { code: "grant_permission", label: "Grant permissions" },
  { code: "enroll_subject", label: "Enroll subjects" },
  { code: "record_visit", label: "Record visits" },
  { code: "view_audit", label: "View audit trail" },
] as const;

const permMap: Record<string, number> = {};
for (const def of PERM_DEFS) {
  const existing = permissions.getByCode(db, def.code);
  if (existing) {
    permMap[def.code] = existing.id;
    console.log(`  ✓ '${def.code}' (id=${existing.id})`);
  } else {
    const p = permissions.create(db, def.code, def.label);
    permMap[def.code] = p.id;
    console.log(`  + '${def.code}' created (id=${p.id})`);
  }
}

// ---------------------------------------------------------------------------
// 2. Study
// ---------------------------------------------------------------------------

console.log("\nSeeding study…");
let study = studies.getByProtocol(db, "BCN-OX-201");
if (study) {
  console.log(`  ✓ BCN-OX-201 (id=${study.id})`);
} else {
  study = studies.create(db, "BCN-OX-201", "Beacon Oncology Phase II Trial");
  console.log(`  + BCN-OX-201 created (id=${study.id})`);
}

// ---------------------------------------------------------------------------
// 3. Retention policy
// ---------------------------------------------------------------------------

retentionPolicy.ensureDefault(db);
console.log("\n  ✓ retention policy at default (2555 days, enforcement OFF)");

// ---------------------------------------------------------------------------
// 4. Principal Investigator — Dr. Anya Okonkwo
// ---------------------------------------------------------------------------

console.log("\nSeeding PI: anya@beacon.clinical");

let anya_party = parties.getByEmail(db, "anya@beacon.clinical");
if (!anya_party) {
  anya_party = parties.create(db, "anya@beacon.clinical", "Dr. Anya Okonkwo");
  console.log(`  + party created (id=${anya_party.id})`);
} else {
  console.log(`  ✓ party exists (id=${anya_party.id})`);
}

let anya_actor = actors.getByPartyId(db, anya_party.id);
if (!anya_actor) {
  anya_actor = actors.create(db, anya_party.id);
  console.log(`  + actor created (id=${anya_actor.id})`);
} else {
  console.log(`  ✓ actor exists (id=${anya_actor.id})`);
}

const anya_cred = credentials.getActiveByActorId(db, anya_actor.id, "password");
if (!anya_cred) {
  const hash = await hashPassword("demo-pi");
  credentials.create(db, anya_actor.id, "password", hash);
  console.log("  + credential hashed and stored");
} else {
  console.log("  ✓ credential exists");
}

// PI grants (bootstrap: self-grant — the grantor_actor_id = PI's own id)
const PI_GRANTS: Array<{ code: keyof typeof permMap; scope: "all" | "own" }> = [
  { code: "invite_actor", scope: "all" },
  { code: "grant_permission", scope: "all" },
  { code: "enroll_subject", scope: "all" },
  { code: "record_visit", scope: "all" },
  { code: "view_audit", scope: "all" },
];
for (const g of PI_GRANTS) {
  const permId = permMap[g.code];
  if (!permId) { console.warn(`  ! permission '${g.code}' not found — skipping`); continue; }
  const existing = grants.findActiveFor(db, anya_actor.id, [g.code]);
  if (!existing) {
    grants.create(db, {
      grantor_actor_id: anya_actor.id,
      grantee_actor_id: anya_actor.id,
      permission_id: permId,
      scope: g.scope,
    });
    console.log(`  + grant '${g.code}' (scope=${g.scope})`);
  } else {
    console.log(`  ✓ grant '${g.code}' already active`);
  }
}

// ---------------------------------------------------------------------------
// 5. Clinical Research Associate — Jordan Lee
//    view_audit granted by PI (proper attribution after PI exists)
// ---------------------------------------------------------------------------

console.log("\nSeeding CRA: jordan@beacon.clinical");

let jordan_party = parties.getByEmail(db, "jordan@beacon.clinical");
if (!jordan_party) {
  jordan_party = parties.create(db, "jordan@beacon.clinical", "Jordan Lee");
  console.log(`  + party created (id=${jordan_party.id})`);
} else {
  console.log(`  ✓ party exists (id=${jordan_party.id})`);
}

let jordan_actor = actors.getByPartyId(db, jordan_party.id);
if (!jordan_actor) {
  jordan_actor = actors.create(db, jordan_party.id);
  console.log(`  + actor created (id=${jordan_actor.id})`);
} else {
  console.log(`  ✓ actor exists (id=${jordan_actor.id})`);
}

const jordan_cred = credentials.getActiveByActorId(db, jordan_actor.id, "password");
if (!jordan_cred) {
  const hash = await hashPassword("demo-cra");
  credentials.create(db, jordan_actor.id, "password", hash);
  console.log("  + credential hashed and stored");
} else {
  console.log("  ✓ credential exists");
}

// Jordan's audit grant — issued by PI
const jordan_audit_grant = grants.findActiveFor(db, jordan_actor.id, ["view_audit"]);
if (!jordan_audit_grant) {
  grants.create(db, {
    grantor_actor_id: anya_actor.id,
    grantee_actor_id: jordan_actor.id,
    permission_id: permMap["view_audit"],
    scope: "all",
  });
  console.log("  + grant 'view_audit' (scope=all) from PI");
} else {
  console.log("  ✓ grant 'view_audit' already active");
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

db.close();

console.log(`
✓ Seed complete.

  Accounts:
    PI  — anya@beacon.clinical   / demo-pi
          permissions: invite_actor, grant_permission, enroll_subject, record_visit, view_audit

    CRA — jordan@beacon.clinical / demo-cra
          permissions: view_audit (scope=all)

  Study:  BCN-OX-201 "Beacon Oncology Phase II Trial"
  URL:    http://127.0.0.1:8000
`);
