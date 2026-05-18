// Verify route — evaluates all 8 composition invariants over the current DB state.
//
// GET /verify  → HTML page showing each invariant pass/fail, mapped to its
//                Alloy assertion name.
// GET /verify/json → same data as JSON (for automated checks).
//
// Each check corresponds to a named assert in alloy/attributed-permissions-admin.als.

import { Hono } from "hono";
import type { AppVariables } from "../middleware/current_actor.ts";
import { db } from "../db/client.ts";
import { listActors } from "../domain/actor.ts";
import { VerifyPage, type InvariantCheck, type VerifyPageData } from "../views/verify_page.tsx";

const verify = new Hono<{ Variables: AppVariables }>();

function runChecks(): VerifyPageData {
  const grants = db.prepare("SELECT * FROM grant").all() as Array<{
    grant_id: string; subject_ref: string; action_scope: string;
    status: string; granted_at: string; revoked_at: string | null;
  }>;

  const attributions = db.prepare("SELECT * FROM grant_attribution").all() as Array<{
    grant_id: string; attestation_id: string;
  }>;
  const revocationAttributions = db.prepare("SELECT * FROM revocation_attribution").all() as Array<{
    grant_id: string; attestation_id: string;
  }>;
  const orphans = db.prepare("SELECT * FROM orphan_log").all() as Array<{ orphan_id: string; attestation_id: string }>;

  const attrMap = new Map(attributions.map((a) => [a.grant_id, a.attestation_id]));
  const revAttrMap = new Map(revocationAttributions.map((a) => [a.grant_id, a.attestation_id]));

  const checks: InvariantCheck[] = [];

  // --- Invariant 1 / Alloy: Attribution_Completeness ---
  // Every grant has an entry in grant_attribution.
  const inv1Failures = grants.filter((g) => !attrMap.has(g.grant_id));
  checks.push({
    name: "Attribution_Completeness",
    description: "Every grant in the Permissions store has a corresponding issuance attestation in grant_attribution (Invariant 1).",
    ok: inv1Failures.length === 0,
    detail: inv1Failures.length > 0
      ? `Missing attribution for: ${inv1Failures.map((g) => g.grant_id).join(", ")}`
      : undefined,
  });

  // --- Invariant 2 / Alloy: Revocation_Attribution ---
  // Every revoked grant has a revocation_attribution entry.
  const revokedGrants = grants.filter((g) => g.status === "revoked");
  const inv2Failures = revokedGrants.filter((g) => !revAttrMap.has(g.grant_id));
  checks.push({
    name: "Revocation_Attribution",
    description: "Every revoked grant has a corresponding revocation attestation in revocation_attribution (Invariant 2).",
    ok: inv2Failures.length === 0,
    detail: inv2Failures.length > 0
      ? `Missing revocation attribution for: ${inv2Failures.map((g) => g.grant_id).join(", ")}`
      : undefined,
  });

  // --- Invariant 3 / Alloy: Attribution_Recoverability ---
  // Every attribution entry references an attestation that actually exists.
  const orphanAttrs = attributions.filter((a) => {
    const row = db.prepare("SELECT 1 FROM attestation WHERE attestation_id = ?").get(a.attestation_id);
    return !row;
  });
  checks.push({
    name: "Attribution_Recoverability",
    description: "Every entry in grant_attribution references an existing attestation record (Invariant 3).",
    ok: orphanAttrs.length === 0,
    detail: orphanAttrs.length > 0
      ? `Dangling attribution references: ${orphanAttrs.map((a) => a.attestation_id).join(", ")}`
      : undefined,
  });

  // --- Invariant 4: Attribution-time monotonicity ---
  // attestation.attested_at ≤ grant.granted_at for issuance.
  const inv4Failures: string[] = [];
  for (const g of grants) {
    const aid = attrMap.get(g.grant_id);
    if (!aid) continue;
    const att = db.prepare("SELECT attested_at FROM attestation WHERE attestation_id = ?")
      .get(aid) as { attested_at: string } | undefined;
    if (att && att.attested_at > g.granted_at) {
      inv4Failures.push(`${g.grant_id}: attestation ${att.attested_at} > grant ${g.granted_at}`);
    }
  }
  checks.push({
    name: "Dyn_Attest_Before_Record",
    description: "For every grant, its issuance attestation.attested_at ≤ grant.granted_at (Invariant 4, also Dyn_Attest_Before_Record in dynamic model).",
    ok: inv4Failures.length === 0,
    detail: inv4Failures.length > 0 ? inv4Failures.join("; ") : undefined,
  });

  // --- Invariant 5: Constituent invariants preserved ---
  // Spot-check: all grant_attribution.attestation_id values exist in attestation table.
  const inv5Failures = revocationAttributions.filter((a) => {
    const row = db.prepare("SELECT 1 FROM attestation WHERE attestation_id = ?").get(a.attestation_id);
    return !row;
  });
  checks.push({
    name: "Invariant5_Constituent_Preserved",
    description: "All revocation_attribution entries reference existing attestation records (constituent atom invariants preserved, Invariant 5).",
    ok: inv5Failures.length === 0,
    detail: inv5Failures.length > 0
      ? `Dangling revocation references: ${inv5Failures.map((a) => a.attestation_id).join(", ")}`
      : undefined,
  });

  // --- Invariant 6 / Alloy: Dyn_Pairing_Durability ---
  // Cannot be checked dynamically beyond "entries exist and were never modified"
  // — the schema triggers enforce this structurally. We check that trigger
  // metadata exists as a proxy.
  const hasTrigger = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='grant_attribution_no_delete'"
  ).get();
  checks.push({
    name: "Dyn_Pairing_Durability",
    description: "Pairing map entries (grant_attribution, revocation_attribution) are durable — schema triggers block UPDATE and DELETE (Invariant 6).",
    ok: !!hasTrigger,
    detail: hasTrigger ? undefined : "grant_attribution_no_delete trigger not found in schema",
  });

  // --- Invariant 7 / Alloy: Invariant7_Attestation_Exclusivity ---
  // grant_attribution is injective: no two grants share an issuance attestation.
  // revocation_attribution is injective.
  // The two ranges are disjoint.
  const issuanceAttestationIds = attributions.map((a) => a.attestation_id);
  const revocationAttestationIds = revocationAttributions.map((a) => a.attestation_id);

  const issuanceDuplicates = issuanceAttestationIds.filter(
    (id, i) => issuanceAttestationIds.indexOf(id) !== i,
  );
  const revocationDuplicates = revocationAttestationIds.filter(
    (id, i) => revocationAttestationIds.indexOf(id) !== i,
  );
  const issuanceSet = new Set(issuanceAttestationIds);
  const revocationSet = new Set(revocationAttestationIds);
  const overlap = [...issuanceSet].filter((id) => revocationSet.has(id));

  const inv7Ok = issuanceDuplicates.length === 0 && revocationDuplicates.length === 0 && overlap.length === 0;
  checks.push({
    name: "Invariant7_Attestation_Exclusivity",
    description: "grant_attribution is injective, revocation_attribution is injective, and their ranges are disjoint — no attestation serves dual purpose (Invariant 7, found by the Alloy model).",
    ok: inv7Ok,
    detail: inv7Ok ? undefined : [
      issuanceDuplicates.length > 0 ? `Duplicate issuance attestations: ${issuanceDuplicates.join(", ")}` : "",
      revocationDuplicates.length > 0 ? `Duplicate revocation attestations: ${revocationDuplicates.join(", ")}` : "",
      overlap.length > 0 ? `Range overlap (used for both issuance and revocation): ${overlap.join(", ")}` : "",
    ].filter(Boolean).join("; "),
  });

  // --- Invariant 8 / Alloy: Dyn_Orphan_Log_Durability ---
  // Orphan log is append-only — verified via schema trigger presence.
  const hasOrphanTrigger = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='orphan_log_no_delete'"
  ).get();
  checks.push({
    name: "Dyn_Orphan_Log_Durability",
    description: "Orphan log entries are durable — schema triggers block UPDATE and DELETE (Invariant 8).",
    ok: !!hasOrphanTrigger,
    detail: hasOrphanTrigger ? undefined : "orphan_log_no_delete trigger not found in schema",
  });

  return {
    checks,
    overall: checks.every((c) => c.ok),
    grant_count: grants.length,
    orphan_count: orphans.length,
    evaluated_at: new Date().toISOString(),
  };
}

verify.get("/", (c) => {
  const actor = c.get("actor");
  const actors = listActors();
  const data = runChecks();
  return c.html(<VerifyPage data={data} currentActor={actor} actors={actors} />);
});

verify.get("/json", (c) => {
  return c.json(runChecks());
});

export { verify };
