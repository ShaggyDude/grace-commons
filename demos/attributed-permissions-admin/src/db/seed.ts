// Seed script — idempotent, safe to re-run.
//
// Inserts demo actors and a set of grants covering all visible states:
//   - Active grants with attribution (SOX, HIPAA, PCI DSS scenarios)
//   - Revoked grants with revocation attribution
//   - One orphan log entry (simulates a pairing-write failure)
//
// Usage: deno task seed

import { db, tx } from "./client.ts";
import { issue_grant, revoke_grant } from "../domain/composition.ts";

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// Actors
// credential_secret is a stand-in HMAC key for the demo; not a real secret.
// ---------------------------------------------------------------------------

const actors = [
  // System actor — used for programmatic grants in automated pipelines
  {
    actor_ref: "system@apa-demo",
    display_name: "System (Demo)",
    credential_public: "pub_system_apa",
    credential_secret: "sec_system_apa_hmac_key_32bytes!",
  },
  // SOX financial controls scenario
  {
    actor_ref: "ciso_reyes",
    display_name: "Reyes (CISO)",
    credential_public: "pub_ciso_reyes",
    credential_secret: "sec_ciso_reyes_hmac_key_32bytes!",
  },
  {
    actor_ref: "controller_morgan",
    display_name: "Morgan (Controller)",
    credential_public: "pub_controller_morgan",
    credential_secret: "sec_controller_morgan_hmac32b!!",
  },
  {
    actor_ref: "cfo_park",
    display_name: "Park (CFO)",
    credential_public: "pub_cfo_park",
    credential_secret: "sec_cfo_park_hmac_key_32bytes!!!",
  },
  // HIPAA EHR scenario
  {
    actor_ref: "privacy_officer_wu",
    display_name: "Wu (Privacy Officer)",
    credential_public: "pub_privacy_officer_wu",
    credential_secret: "sec_privacy_officer_wu_hmac32b!",
  },
  {
    actor_ref: "attending_patel",
    display_name: "Patel (Attending)",
    credential_public: "pub_attending_patel",
    credential_secret: "sec_attending_patel_hmac32by!!",
  },
  // PCI DSS scenario
  {
    actor_ref: "security_admin_kim",
    display_name: "Kim (Security Admin)",
    credential_public: "pub_security_admin_kim",
    credential_secret: "sec_security_admin_kim_hmac32b!",
  },
];

// ---------------------------------------------------------------------------
// Insert actors (idempotent)
// ---------------------------------------------------------------------------

const existingActors = (
  db.prepare("SELECT COUNT(*) as n FROM actor").get() as { n: number }
).n;

if (existingActors === 0) {
  tx(() => {
    const stmt = db.prepare(`
      INSERT INTO actor (actor_ref, display_name, credential_public, credential_secret, registered_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const a of actors) {
      stmt.run(a.actor_ref, a.display_name, a.credential_public, a.credential_secret, now);
    }
  });
  console.log(`  Actors: ${actors.length}`);
} else {
  console.log(`  Actors: (already seeded — ${existingActors}, skipping)`);
}

// ---------------------------------------------------------------------------
// Insert grants (idempotent — skip if any grants exist)
// ---------------------------------------------------------------------------

const existingGrants = (
  db.prepare("SELECT COUNT(*) as n FROM grant").get() as { n: number }
).n;

if (existingGrants > 0) {
  console.log(`  Grants: (already seeded — ${existingGrants}, skipping)`);
} else {
  // --- SOX scenario: active grants for financial reporting access ---
  const sox1 = issue_grant(
    "morgan@entity.corp", "financials:read",
    "ciso_reyes", "sec_ciso_reyes_hmac_key_32bytes!",
  );
  if ("err" in sox1) throw new Error(`Seed: ${sox1.err}`);

  const sox2 = issue_grant(
    "park@entity.corp", "financials:approve",
    "ciso_reyes", "sec_ciso_reyes_hmac_key_32bytes!",
  );
  if ("err" in sox2) throw new Error(`Seed: ${sox2.err}`);

  // Revoke one — demonstrates revocation attribution
  const revokeResult = revoke_grant(
    sox1.ok.grant_id,
    "ciso_reyes", "sec_ciso_reyes_hmac_key_32bytes!",
  );
  if ("err" in revokeResult) throw new Error(`Seed revoke: ${revokeResult.err}`);

  // --- HIPAA scenario: attending physician access to EHR record ---
  const hipaa1 = issue_grant(
    "patel@hospital.org", "ehr:read:patient-4821",
    "privacy_officer_wu", "sec_privacy_officer_wu_hmac32b!",
  );
  if ("err" in hipaa1) throw new Error(`Seed: ${hipaa1.err}`);

  const hipaa2 = issue_grant(
    "patel@hospital.org", "ehr:write:patient-4821",
    "privacy_officer_wu", "sec_privacy_officer_wu_hmac32b!",
  );
  if ("err" in hipaa2) throw new Error(`Seed: ${hipaa2.err}`);

  // --- PCI DSS scenario: payment system admin access ---
  const pci1 = issue_grant(
    "kim@payments.corp", "payment-system:admin",
    "ciso_reyes", "sec_ciso_reyes_hmac_key_32bytes!",
  );
  if ("err" in pci1) throw new Error(`Seed: ${pci1.err}`);

  // --- Orphan log entry: simulate a pairing-write failure ---
  // Insert directly — the composition surface cannot produce orphans in the
  // happy path; this seeds a visible orphan for demo and verify-page purposes.
  const { ulid } = await import("@std/ulid");
  tx(() => {
    // Record a dangling attestation (not referenced by any grant)
    const orphanAttestationId = ulid();
    db.prepare(`
      INSERT INTO attestation (attestation_id, actor_ref, action_ref, attested_at)
      VALUES (?, ?, ?, ?)
    `).run(orphanAttestationId, "ciso_reyes", "grant:orphaned-proposal", now);

    db.prepare(`
      INSERT INTO orphan_log (orphan_id, attestation_id, proposal_ref, requested_at, underlying_reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      ulid(),
      orphanAttestationId,
      "financials:write@morgan@entity.corp",
      now,
      "pairing-write-failure",
    );
  });

  const grantCount = (db.prepare("SELECT COUNT(*) as n FROM grant").get() as { n: number }).n;
  const attrCount = (db.prepare("SELECT COUNT(*) as n FROM grant_attribution").get() as { n: number }).n;
  const orphanCount = (db.prepare("SELECT COUNT(*) as n FROM orphan_log").get() as { n: number }).n;
  console.log(`  Grants:              ${grantCount}`);
  console.log(`  Grant attributions:  ${attrCount}`);
  console.log(`  Orphan log entries:  ${orphanCount}`);
}

console.log("✓ Seed complete");
