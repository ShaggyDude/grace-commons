// attribution.test.ts — tests for the composition's attribution surface.
//
// Covers issue_grant, revoke_grant, and verify_grant_attribution against
// a fresh in-memory database.

import { assertEquals, assertNotEquals } from "@std/assert";

Deno.env.set("DB_PATH", ":memory:");

const { db } = await import("../src/db/client.ts");
const migrateModule = await import("../src/db/migrate.ts");
void migrateModule;

const { issue_grant, revoke_grant, verify_grant_attribution, permitted } =
  await import("../src/domain/composition.ts");

function seedActor(actor_ref: string, secret = "test_secret_32bytes_minimum!!!!") {
  db.prepare(`
    INSERT OR IGNORE INTO actor (actor_ref, display_name, credential_public, credential_secret, registered_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(actor_ref, actor_ref, `pub_${actor_ref}`, secret, new Date().toISOString());
}

// --- issue_grant happy path ---

Deno.test("issue_grant returns grant_id and attestation_id", () => {
  seedActor("grantor_a1", "grantor_a1_secret_32b_min!!!!!!!!");
  const r = issue_grant("alice@corp", "files:read", "grantor_a1", "grantor_a1_secret_32b_min!!!!!!!!");
  if ("err" in r) throw new Error(r.err);
  assertNotEquals(r.ok.grant_id, "");
  assertNotEquals(r.ok.attestation_id, "");
});

Deno.test("issue_grant: permitted returns permitted for subject after grant", () => {
  seedActor("grantor_a2", "grantor_a2_secret_32b_min!!!!!!!!");
  issue_grant("bob@corp", "files:write", "grantor_a2", "grantor_a2_secret_32b_min!!!!!!!!");
  assertEquals(permitted("bob@corp", "files:write"), "permitted");
});

Deno.test("issue_grant: unknown action_scope still issues (no scope whitelist in demo)", () => {
  seedActor("grantor_a3", "grantor_a3_secret_32b_min!!!!!!!!");
  const r = issue_grant("carol@corp", "custom:scope:xyz", "grantor_a3", "grantor_a3_secret_32b_min!!!!!!!!");
  assertEquals("ok" in r, true);
});

// --- issue_grant rejection cases ---

Deno.test("issue_grant: wrong credential returns credential-invalid", () => {
  seedActor("grantor_a4", "grantor_a4_secret_32b_min!!!!!!!!");
  const r = issue_grant("dave@corp", "files:read", "grantor_a4", "wrong_credential");
  if ("ok" in r) throw new Error("expected error");
  assertEquals(r.err, "credential-invalid");
});

Deno.test("issue_grant: unknown grantor returns grantor-not-found", () => {
  const r = issue_grant("eve@corp", "files:read", "nobody@nowhere", "any_secret");
  if ("ok" in r) throw new Error("expected error");
  assertEquals(r.err, "grantor-not-found");
});

Deno.test("issue_grant: duplicate active grant returns duplicate-active-grant", () => {
  seedActor("grantor_a5", "grantor_a5_secret_32b_min!!!!!!!!");
  issue_grant("frank@corp", "files:read", "grantor_a5", "grantor_a5_secret_32b_min!!!!!!!!");
  const r2 = issue_grant("frank@corp", "files:read", "grantor_a5", "grantor_a5_secret_32b_min!!!!!!!!");
  if ("ok" in r2) throw new Error("expected error");
  assertEquals(r2.err, "duplicate-active-grant");
});

// --- revoke_grant happy path ---

Deno.test("revoke_grant: permitted returns denied after revocation", () => {
  seedActor("grantor_a6", "grantor_a6_secret_32b_min!!!!!!!!");
  const issued = issue_grant("grace@corp", "reports:read", "grantor_a6", "grantor_a6_secret_32b_min!!!!!!!!");
  if ("err" in issued) throw new Error(issued.err);

  revoke_grant(issued.ok.grant_id, "grantor_a6", "grantor_a6_secret_32b_min!!!!!!!!");
  assertEquals(permitted("grace@corp", "reports:read"), "denied");
});

Deno.test("revoke_grant: returns attestation_id on success", () => {
  seedActor("grantor_a7", "grantor_a7_secret_32b_min!!!!!!!!");
  const issued = issue_grant("hank@corp", "admin:write", "grantor_a7", "grantor_a7_secret_32b_min!!!!!!!!");
  if ("err" in issued) throw new Error(issued.err);

  const r = revoke_grant(issued.ok.grant_id, "grantor_a7", "grantor_a7_secret_32b_min!!!!!!!!");
  if ("err" in r) throw new Error(r.err);
  assertNotEquals(r.ok.attestation_id, "");
  assertNotEquals(r.ok.attestation_id, issued.ok.attestation_id);
});

// --- revoke_grant rejection cases ---

Deno.test("revoke_grant: unknown grant returns not-known", () => {
  seedActor("grantor_a8", "grantor_a8_secret_32b_min!!!!!!!!");
  const r = revoke_grant("nonexistent-id", "grantor_a8", "grantor_a8_secret_32b_min!!!!!!!!");
  if ("ok" in r) throw new Error("expected error");
  assertEquals(r.err, "not-known");
});

Deno.test("revoke_grant: already-revoked grant returns not-active", () => {
  seedActor("grantor_a9", "grantor_a9_secret_32b_min!!!!!!!!");
  const issued = issue_grant("ivy@corp", "files:read", "grantor_a9", "grantor_a9_secret_32b_min!!!!!!!!");
  if ("err" in issued) throw new Error(issued.err);

  revoke_grant(issued.ok.grant_id, "grantor_a9", "grantor_a9_secret_32b_min!!!!!!!!");
  const r2 = revoke_grant(issued.ok.grant_id, "grantor_a9", "grantor_a9_secret_32b_min!!!!!!!!");
  if ("ok" in r2) throw new Error("expected error");
  assertEquals(r2.err, "not-active");
});

// --- verify_grant_attribution ---

Deno.test("verify_grant_attribution: active grant returns valid issuance attestation", () => {
  seedActor("grantor_a10", "grantor_a10_secret_32b_min!!!!!!!");
  const issued = issue_grant("jack@corp", "data:export", "grantor_a10", "grantor_a10_secret_32b_min!!!!!!!");
  if ("err" in issued) throw new Error(issued.err);

  const v = verify_grant_attribution(issued.ok.grant_id);
  assertEquals(v.ok, true);
  if (!v.ok) throw new Error();
  assertEquals(v.grant.status, "active");
  assertEquals(v.issuance_verify_result, "valid");
  assertEquals(v.revocation_attestation, null);
});

Deno.test("verify_grant_attribution: revoked grant returns both attestations as valid", () => {
  seedActor("grantor_a11", "grantor_a11_secret_32b_min!!!!!!!");
  const issued = issue_grant("kim@corp", "data:import", "grantor_a11", "grantor_a11_secret_32b_min!!!!!!!");
  if ("err" in issued) throw new Error(issued.err);

  revoke_grant(issued.ok.grant_id, "grantor_a11", "grantor_a11_secret_32b_min!!!!!!!");

  const v = verify_grant_attribution(issued.ok.grant_id);
  assertEquals(v.ok, true);
  if (!v.ok) throw new Error();
  assertEquals(v.grant.status, "revoked");
  assertEquals(v.issuance_verify_result, "valid");
  assertEquals(v.revocation_verify_result, "valid");
  assertNotEquals(v.revocation_attestation, null);
});
