// invariants.test.ts — one test per composition invariant (Invariants 1–8).
//
// Each test is labelled with its corresponding Alloy assertion name from
// alloy/attributed-permissions-admin.als. The Alloy model verifies these
// properties hold for all reachable states within its scope; these tests
// verify they hold over the runtime implementation.
//
// All tests use an in-memory DB (DB_PATH=:memory:) and are fully isolated.

import { assertEquals, assertNotEquals } from "@std/assert";

Deno.env.set("DB_PATH", ":memory:");

// Import after env is set so client.ts picks up :memory:
const { db } = await import("../src/db/client.ts");
const migrateModule = await import("../src/db/migrate.ts");
void migrateModule;

const { issue_grant, revoke_grant, verify_grant_attribution, permitted } =
  await import("../src/domain/composition.ts");

// Seed a minimal actor for testing
function seedActor(actor_ref: string, secret: string = "test_secret_32bytes_minimum!!!!") {
  db.prepare(`
    INSERT OR IGNORE INTO actor (actor_ref, display_name, credential_public, credential_secret, registered_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(actor_ref, actor_ref, `pub_${actor_ref}`, secret, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Invariant 1 — Attribution completeness
// Alloy: Attribution_Completeness
// "For every grant_id in the Permissions store, grant_attribution[grant_id]
//  is populated with a corresponding attestation_id."
// ---------------------------------------------------------------------------

Deno.test("Invariant 1 — Attribution_Completeness: issue_grant always creates grant_attribution entry", () => {
  seedActor("grantor_inv1", "grantor_inv1_secret_32b_min!!!!!!");
  const result = issue_grant("subject_1", "scope:read", "grantor_inv1", "grantor_inv1_secret_32b_min!!!!!!");
  if ("err" in result) throw new Error(result.err);

  const row = db.prepare("SELECT attestation_id FROM grant_attribution WHERE grant_id = ?")
    .get(result.ok.grant_id);
  assertNotEquals(row, undefined, "grant_attribution entry must exist after issue_grant");
});

Deno.test("Invariant 1 — Attribution_Completeness: grant_attribution.attestation_id matches returned attestation_id", () => {
  seedActor("grantor_inv1b", "grantor_inv1b_secret_32b_min!!!!!");
  const result = issue_grant("subject_1b", "scope:write", "grantor_inv1b", "grantor_inv1b_secret_32b_min!!!!!");
  if ("err" in result) throw new Error(result.err);

  const row = db.prepare("SELECT attestation_id FROM grant_attribution WHERE grant_id = ?")
    .get(result.ok.grant_id) as { attestation_id: string };
  assertEquals(row.attestation_id, result.ok.attestation_id, "grant_attribution must reference the returned attestation");
});

// ---------------------------------------------------------------------------
// Invariant 2 — Revocation attribution
// Alloy: Revocation_Attribution
// "For every grant in Revoked state, revocation_attribution[grant_id] is populated."
// ---------------------------------------------------------------------------

Deno.test("Invariant 2 — Revocation_Attribution: revoke_grant always creates revocation_attribution entry", () => {
  seedActor("grantor_inv2", "grantor_inv2_secret_32b_min!!!!!!");
  const issued = issue_grant("subject_2", "scope:admin", "grantor_inv2", "grantor_inv2_secret_32b_min!!!!!!");
  if ("err" in issued) throw new Error(issued.err);

  const revoked = revoke_grant(issued.ok.grant_id, "grantor_inv2", "grantor_inv2_secret_32b_min!!!!!!");
  if ("err" in revoked) throw new Error(revoked.err);

  const row = db.prepare("SELECT attestation_id FROM revocation_attribution WHERE grant_id = ?")
    .get(issued.ok.grant_id);
  assertNotEquals(row, undefined, "revocation_attribution entry must exist after revoke_grant");
});

// ---------------------------------------------------------------------------
// Invariant 3 — Attribution recoverability
// Alloy: Attribution_Recoverability
// "Given any grant_id, verify_grant_attribution returns the full attribution chain."
// ---------------------------------------------------------------------------

Deno.test("Invariant 3 — Attribution_Recoverability: verify_grant_attribution returns issuance attestation", () => {
  seedActor("grantor_inv3", "grantor_inv3_secret_32b_min!!!!!!");
  const issued = issue_grant("subject_3", "scope:read", "grantor_inv3", "grantor_inv3_secret_32b_min!!!!!!");
  if ("err" in issued) throw new Error(issued.err);

  const v = verify_grant_attribution(issued.ok.grant_id);
  assertEquals(v.ok, true);
  if (!v.ok) throw new Error("expected ok");
  assertNotEquals(v.issuance_attestation, undefined);
  assertEquals(v.issuance_verify_result, "valid");
});

Deno.test("Invariant 3 — Attribution_Recoverability: revoked grant returns both attestations", () => {
  seedActor("grantor_inv3b", "grantor_inv3b_secret_32b_min!!!!");
  const issued = issue_grant("subject_3b", "scope:read", "grantor_inv3b", "grantor_inv3b_secret_32b_min!!!!");
  if ("err" in issued) throw new Error(issued.err);

  revoke_grant(issued.ok.grant_id, "grantor_inv3b", "grantor_inv3b_secret_32b_min!!!!");

  const v = verify_grant_attribution(issued.ok.grant_id);
  assertEquals(v.ok, true);
  if (!v.ok) throw new Error("expected ok");
  assertNotEquals(v.revocation_attestation, null, "revocation attestation must be present");
  assertEquals(v.revocation_verify_result, "valid");
});

Deno.test("Invariant 3 — Attribution_Recoverability: unknown grant returns not-known", () => {
  const v = verify_grant_attribution("nonexistent-grant-id");
  assertEquals(v.ok, false);
  if (v.ok) throw new Error("expected not ok");
  assertEquals(v.reason, "not-known");
});

// ---------------------------------------------------------------------------
// Invariant 4 — Attribution-time monotonicity
// Alloy: Dyn_Attest_Before_Record
// "attestation.attested_at ≤ grant.granted_at"
// ---------------------------------------------------------------------------

Deno.test("Invariant 4 — Dyn_Attest_Before_Record: attestation precedes grant in time", () => {
  seedActor("grantor_inv4", "grantor_inv4_secret_32b_min!!!!!!");
  const before = new Date();
  const issued = issue_grant("subject_4", "scope:read", "grantor_inv4", "grantor_inv4_secret_32b_min!!!!!!");
  if ("err" in issued) throw new Error(issued.err);

  const grant = db.prepare("SELECT granted_at FROM grant WHERE grant_id = ?")
    .get(issued.ok.grant_id) as { granted_at: string };
  const att = db.prepare("SELECT attested_at FROM attestation WHERE attestation_id = ?")
    .get(issued.ok.attestation_id) as { attested_at: string };

  // attestation was recorded before or at the same millisecond as the grant
  assertEquals(
    att.attested_at <= grant.granted_at,
    true,
    `attestation.attested_at (${att.attested_at}) must be ≤ grant.granted_at (${grant.granted_at})`,
  );
  void before;
});

// ---------------------------------------------------------------------------
// Invariant 5 — Constituent invariants preserved
// Alloy: (constituent atom checks, not a separate assertion in the model)
// "All invariants of the Permissions atom and Actor Identity atom hold."
// We spot-check the most critical constituent invariants.
// ---------------------------------------------------------------------------

Deno.test("Invariant 5 — constituent: attestations are durable (no delete)", () => {
  seedActor("grantor_inv5", "grantor_inv5_secret_32b_min!!!!!!");
  const issued = issue_grant("subject_5", "scope:read", "grantor_inv5", "grantor_inv5_secret_32b_min!!!!!!");
  if ("err" in issued) throw new Error(issued.err);

  let threw = false;
  try {
    db.prepare("DELETE FROM attestation WHERE attestation_id = ?").run(issued.ok.attestation_id);
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "DELETE on attestation must be rejected by trigger");
});

Deno.test("Invariant 5 — constituent: grant terminal absorption (revoked cannot become active)", () => {
  seedActor("grantor_inv5b", "grantor_inv5b_secret_32b_min!!!!");
  const issued = issue_grant("subject_5b", "scope:read", "grantor_inv5b", "grantor_inv5b_secret_32b_min!!!!");
  if ("err" in issued) throw new Error(issued.err);

  revoke_grant(issued.ok.grant_id, "grantor_inv5b", "grantor_inv5b_secret_32b_min!!!!");

  let threw = false;
  try {
    db.prepare("UPDATE grant SET status = 'active', revoked_at = NULL WHERE grant_id = ?")
      .run(issued.ok.grant_id);
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "Re-activating a revoked grant must be rejected by trigger");
});

// ---------------------------------------------------------------------------
// Invariant 6 — Pairing-map durability
// Alloy: Dyn_Pairing_Durability
// "grant_attribution and revocation_attribution entries are never modified or deleted."
// ---------------------------------------------------------------------------

Deno.test("Invariant 6 — Dyn_Pairing_Durability: grant_attribution entries cannot be deleted", () => {
  seedActor("grantor_inv6", "grantor_inv6_secret_32b_min!!!!!!");
  const issued = issue_grant("subject_6", "scope:read", "grantor_inv6", "grantor_inv6_secret_32b_min!!!!!!");
  if ("err" in issued) throw new Error(issued.err);

  let threw = false;
  try {
    db.prepare("DELETE FROM grant_attribution WHERE grant_id = ?").run(issued.ok.grant_id);
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "DELETE on grant_attribution must be rejected by trigger");
});

Deno.test("Invariant 6 — Dyn_Pairing_Durability: grant_attribution entries cannot be updated", () => {
  seedActor("grantor_inv6b", "grantor_inv6b_secret_32b_min!!!!");
  const issued = issue_grant("subject_6b", "scope:read", "grantor_inv6b", "grantor_inv6b_secret_32b_min!!!!");
  if ("err" in issued) throw new Error(issued.err);

  let threw = false;
  try {
    db.prepare("UPDATE grant_attribution SET attestation_id = 'tampered' WHERE grant_id = ?")
      .run(issued.ok.grant_id);
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "UPDATE on grant_attribution must be rejected by trigger");
});

// ---------------------------------------------------------------------------
// Invariant 7 — Attestation exclusivity
// Alloy: Invariant7_Attestation_Exclusivity
// "grant_attribution is injective, revocation_attribution is injective,
//  and their ranges are disjoint."
//
// This invariant was discovered by the Alloy model (see CORNERS.md).
// The model found counterexamples for Issuance_Revocation_Attestations_Differ,
// Grant_Attribution_Injective, and Issuance_Revocation_Pools_Disjoint before
// Invariant7_Attestation_Exclusivity was added as a fact.
// ---------------------------------------------------------------------------

Deno.test("Invariant 7 — Grant_Attribution_Injective: two different grants get different issuance attestations", () => {
  seedActor("grantor_inv7", "grantor_inv7_secret_32b_min!!!!!!");
  const r1 = issue_grant("subject_7a", "scope:read", "grantor_inv7", "grantor_inv7_secret_32b_min!!!!!!");
  const r2 = issue_grant("subject_7b", "scope:read", "grantor_inv7", "grantor_inv7_secret_32b_min!!!!!!");
  if ("err" in r1) throw new Error(r1.err);
  if ("err" in r2) throw new Error(r2.err);
  assertNotEquals(r1.ok.attestation_id, r2.ok.attestation_id, "Each grant must have a unique issuance attestation");
});

Deno.test("Invariant 7 — Issuance_Revocation_Pools_Disjoint: issuance and revocation attestations are different", () => {
  seedActor("grantor_inv7b", "grantor_inv7b_secret_32b_min!!!!");
  const issued = issue_grant("subject_7c", "scope:write", "grantor_inv7b", "grantor_inv7b_secret_32b_min!!!!");
  if ("err" in issued) throw new Error(issued.err);

  const revoked = revoke_grant(issued.ok.grant_id, "grantor_inv7b", "grantor_inv7b_secret_32b_min!!!!");
  if ("err" in revoked) throw new Error(revoked.err);

  assertNotEquals(
    issued.ok.attestation_id,
    revoked.ok.attestation_id,
    "Issuance and revocation attestations must be different atoms (Invariant 7)",
  );
});

Deno.test("Invariant 7 — Issuance_Revocation_Attestations_Differ: schema UNIQUE constraint enforces disjointness", () => {
  // Direct attempt to reuse an issuance attestation as a revocation attestation
  // must fail (the UNIQUE constraint on each table's attestation_id column, plus
  // the application-layer check in composition.ts, prevents this).
  seedActor("grantor_inv7c", "grantor_inv7c_secret_32b_min!!!!");
  const issued = issue_grant("subject_7d", "scope:admin", "grantor_inv7c", "grantor_inv7c_secret_32b_min!!!!");
  if ("err" in issued) throw new Error(issued.err);

  const { grant_id, attestation_id } = issued.ok;
  // Revoke the grant via composition (normal path)
  const revoked = revoke_grant(grant_id, "grantor_inv7c", "grantor_inv7c_secret_32b_min!!!!");
  if ("err" in revoked) throw new Error(revoked.err);

  // Attempt to insert the issuance attestation_id into revocation_attribution again
  let threw = false;
  try {
    db.prepare("INSERT INTO revocation_attribution (grant_id, attestation_id) VALUES (?, ?)")
      .run(grant_id, attestation_id); // same attestation_id as issuance — must fail
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "Reusing the issuance attestation as revocation must be rejected (UNIQUE on attestation_id)");
});

// ---------------------------------------------------------------------------
// Invariant 8 — Orphan log durability
// Alloy: Dyn_Orphan_Log_Durability
// "Orphan log entries are never modified or deleted."
// ---------------------------------------------------------------------------

Deno.test("Invariant 8 — Dyn_Orphan_Log_Durability: orphan log entries cannot be deleted", async () => {
  const { ulid } = await import("@std/ulid");
  seedActor("grantor_inv8", "grantor_inv8_secret_32b_min!!!!!!");

  // Write a direct orphan entry (simulating a pairing-write failure)
  const orphanAttId = ulid();
  db.prepare("INSERT INTO attestation (attestation_id, actor_ref, action_ref, attested_at) VALUES (?, ?, ?, ?)")
    .run(orphanAttId, "grantor_inv8", "test:orphan", new Date().toISOString());
  db.prepare("INSERT INTO orphan_log (orphan_id, attestation_id, proposal_ref, requested_at, underlying_reason) VALUES (?, ?, ?, ?, ?)")
    .run(ulid(), orphanAttId, "scope:read@subject_8", new Date().toISOString(), "pairing-write-failure");

  let threw = false;
  try {
    db.prepare("DELETE FROM orphan_log WHERE attestation_id = ?").run(orphanAttId);
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "DELETE on orphan_log must be rejected by trigger");
});

Deno.test("Invariant 8 — Dyn_Orphan_Log_Durability: orphan log entries cannot be updated", async () => {
  const { ulid } = await import("@std/ulid");
  seedActor("grantor_inv8b", "grantor_inv8b_secret_32b_min!!!!");

  const orphanAttId = ulid();
  const orphanId = ulid();
  db.prepare("INSERT INTO attestation (attestation_id, actor_ref, action_ref, attested_at) VALUES (?, ?, ?, ?)")
    .run(orphanAttId, "grantor_inv8b", "test:orphan2", new Date().toISOString());
  db.prepare("INSERT INTO orphan_log (orphan_id, attestation_id, proposal_ref, requested_at, underlying_reason) VALUES (?, ?, ?, ?, ?)")
    .run(orphanId, orphanAttId, "scope:write@subject_8b", new Date().toISOString(), "grant-storage-failure");

  let threw = false;
  try {
    db.prepare("UPDATE orphan_log SET underlying_reason = 'invalid-request' WHERE orphan_id = ?").run(orphanId);
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "UPDATE on orphan_log must be rejected by trigger");
});
