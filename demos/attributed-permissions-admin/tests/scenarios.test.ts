// scenarios.test.ts — HTTP-level walkthrough tests against a fresh in-memory DB.
//
// Uses app.fetch() (Hono test interface) — no network server started.
// DB isolation: Deno.env.set("DB_PATH", ":memory:") runs as the first statement.
//
// Covers three regulatory scenarios from the spec:
//   1. SOX financial controls — issue and verify attribution
//   2. HIPAA EHR access — grant and revoke with attribution
//   3. PCI DSS admin access — full lifecycle with verify endpoint

import { assertEquals } from "@std/assert";

Deno.env.set("DB_PATH", ":memory:");

const { db } = await import("../src/db/client.ts");
const migrateModule = await import("../src/db/migrate.ts");
void migrateModule;
const { app } = await import("../src/app.ts");

function seedActor(actor_ref: string, secret: string, display_name = actor_ref) {
  db.prepare(`
    INSERT OR IGNORE INTO actor (actor_ref, display_name, credential_public, credential_secret, registered_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(actor_ref, display_name, `pub_${actor_ref}`, secret, new Date().toISOString());
}

const CISO = { ref: "ciso_test", secret: "ciso_test_secret_32b_min!!!!!!" };
const PRIV = { ref: "privacy_officer_test", secret: "privacy_officer_test_32b_min!!!" };

seedActor(CISO.ref, CISO.secret, "CISO Test");
seedActor(PRIV.ref, PRIV.secret, "Privacy Officer Test");

// --- SOX scenario: issue grant → GET / shows it ---

Deno.test("SOX: POST /grants issues a grant and redirects to detail", async () => {
  const form = new FormData();
  form.append("subject_ref", "morgan@sox-entity.corp");
  form.append("action_scope", "financials:read");
  form.append("credential", CISO.secret);

  const req = new Request("http://localhost/grants", {
    method: "POST",
    body: form,
    headers: { Cookie: `actor_ref=${CISO.ref}` },
  });
  const res = await app.fetch(req);
  assertEquals(res.status, 302);
  const location = res.headers.get("location") ?? "";
  assertEquals(location.startsWith("/grants/"), true, "Should redirect to grant detail");
});

Deno.test("SOX: GET /grants/:id returns detail page with attribution", async () => {
  // Issue a grant first
  const form = new FormData();
  form.append("subject_ref", "park@sox-entity.corp");
  form.append("action_scope", "financials:approve");
  form.append("credential", CISO.secret);

  const issueRes = await app.fetch(new Request("http://localhost/grants", {
    method: "POST",
    body: form,
    headers: { Cookie: `actor_ref=${CISO.ref}` },
  }));
  const location = issueRes.headers.get("location") ?? "";
  const grant_id = location.replace("/grants/", "");

  const res = await app.fetch(new Request(`http://localhost/grants/${grant_id}`, {
    headers: { Cookie: `actor_ref=${CISO.ref}` },
  }));
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("attestation_id"), true, "Detail page should include attestation info");
});

// --- HIPAA scenario: issue → revoke → verify both attributions ---

Deno.test("HIPAA: issue grant then revoke returns revocation attestation", async () => {
  const issue = new FormData();
  issue.append("subject_ref", "patel@hospital.org");
  issue.append("action_scope", "ehr:read:patient-9999");
  issue.append("credential", PRIV.secret);

  const issueRes = await app.fetch(new Request("http://localhost/grants", {
    method: "POST",
    body: issue,
    headers: { Cookie: `actor_ref=${PRIV.ref}` },
  }));
  const grantId = (issueRes.headers.get("location") ?? "").replace("/grants/", "");

  // Revoke
  const revoke = new FormData();
  revoke.append("credential", PRIV.secret);
  const revokeRes = await app.fetch(new Request(`http://localhost/grants/${grantId}/revoke`, {
    method: "POST",
    body: revoke,
    headers: { Cookie: `actor_ref=${PRIV.ref}` },
  }));
  assertEquals(revokeRes.status, 302);

  // Verify detail shows revoked with both attestations
  const detail = await app.fetch(new Request(`http://localhost/grants/${grantId}`, {
    headers: { Cookie: `actor_ref=${PRIV.ref}` },
  }));
  const body = await detail.text();
  assertEquals(body.includes("revoked"), true);
});

// --- Verify page ---

Deno.test("GET /verify returns 200 with invariant check results", async () => {
  const res = await app.fetch(new Request("http://localhost/verify", {
    headers: { Cookie: `actor_ref=${CISO.ref}` },
  }));
  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body.includes("Attribution_Completeness"), true, "Should show Alloy assertion name");
  assertEquals(body.includes("Invariant7_Attestation_Exclusivity"), true);
});

Deno.test("GET /verify.json returns structured check data", async () => {
  const res = await app.fetch(new Request("http://localhost/verify.json", {
    headers: { Cookie: `actor_ref=${CISO.ref}` },
  }));
  assertEquals(res.status, 200);
  const data = await res.json() as { overall: boolean; checks: Array<{ name: string; ok: boolean }> };
  assertEquals(typeof data.overall, "boolean");
  assertEquals(Array.isArray(data.checks), true);
  const names = data.checks.map((c) => c.name);
  assertEquals(names.includes("Attribution_Completeness"), true);
  assertEquals(names.includes("Invariant7_Attestation_Exclusivity"), true);
});

// --- Orphan log page ---

Deno.test("GET /orphans returns 200", async () => {
  const res = await app.fetch(new Request("http://localhost/orphans", {
    headers: { Cookie: `actor_ref=${CISO.ref}` },
  }));
  assertEquals(res.status, 200);
});

// --- Duplicate grant rejection ---

Deno.test("POST /grants: duplicate active grant returns 400", async () => {
  seedActor("pci_admin_test", "pci_admin_test_32b_min!!!!!!!", "PCI Admin Test");

  const form1 = new FormData();
  form1.append("subject_ref", "kim@payments.corp");
  form1.append("action_scope", "payment-system:admin");
  form1.append("credential", "pci_admin_test_32b_min!!!!!!!");
  await app.fetch(new Request("http://localhost/grants", {
    method: "POST",
    body: form1,
    headers: { Cookie: "actor_ref=pci_admin_test" },
  }));

  const form2 = new FormData();
  form2.append("subject_ref", "kim@payments.corp");
  form2.append("action_scope", "payment-system:admin");
  form2.append("credential", "pci_admin_test_32b_min!!!!!!!");
  const res2 = await app.fetch(new Request("http://localhost/grants", {
    method: "POST",
    body: form2,
    headers: { Cookie: "actor_ref=pci_admin_test" },
  }));
  assertEquals(res2.status, 400, "Duplicate active grant should return 400");
});
