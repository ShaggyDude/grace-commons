// Attributed Permissions Admin — composition surface.
//
// This module is the only public interface for grant management. Routes and
// tests should call these functions; they must not write to grant,
// attestation, grant_attribution, or revocation_attribution directly.
//
// Operations:
//   issue_grant(subject_ref, action_scope, grantor_ref, grantor_credential)
//   revoke_grant(grant_id, revoker_ref, revoker_credential)
//   verify_grant_attribution(grant_id)
//   permitted(subject_ref, action_scope)         ← passthrough to Permissions atom
//
// The attest-before-record ordering is enforced structurally: attest() is
// always called first, then record_grant/record_revocation, then the
// pairing-map write. If any step after attest() fails, the attestation is
// logged as an orphan (recoverable anomaly).
//
// See attributed-permissions-admin.md §Operations for the full step-by-step.

import { ulid } from "@std/ulid";
import { db, tx } from "../db/client.ts";
import { attest, verify, getAttestation } from "./attestation.ts";
import { record_grant, record_revocation, check, getGrant, type Grant } from "./grant.ts";
import { record_orphan, type OrphanReason } from "./orphan_log.ts";
import type { Attestation } from "./attestation.ts";

// ---------------------------------------------------------------------------
// issue_grant
// ---------------------------------------------------------------------------

export type IssueGrantResult =
  | { ok: { grant_id: string; attestation_id: string } }
  | { err: string };

/**
 * Issues a new permission grant.
 *
 * Steps (spec §issue_grant):
 *   1. Validate inputs — reject empty refs.
 *   2. Check for existing active grant — reject if duplicate.
 *   3. Verify grantor credential against Actor Identity atom — reject if invalid.
 *   4. Attest: call Actor Identity attest(grantor_ref, action_ref, credential).
 *   5. Write grant to Permissions atom (record_grant).
 *   6. Write pairing entry to grant_attribution.
 *   Steps 4–6 run inside a single transaction. If step 5 or 6 fails after
 *   step 4 has committed the attestation, the attestation is orphaned.
 *
 * Returns { ok: { grant_id, attestation_id } } or { err: reason }.
 */
export function issue_grant(
  subject_ref: string,
  action_scope: string,
  grantor_ref: string,
  grantor_credential: string,
): IssueGrantResult {
  // Step 1: validate
  if (!subject_ref.trim()) return { err: "invalid-request:subject_ref-empty" };
  if (!action_scope.trim()) return { err: "invalid-request:action_scope-empty" };
  if (!grantor_ref.trim()) return { err: "invalid-request:grantor_ref-empty" };

  // Step 2: check for existing active grant
  const existing = db.prepare(
    "SELECT 1 FROM grant WHERE subject_ref = ? AND action_scope = ? AND status = 'active'",
  ).get(subject_ref, action_scope);
  if (existing) return { err: "duplicate-active-grant" };

  // Step 3 & 4: credential check + attest (inside tx so rollback is possible)
  const grant_id = ulid();
  const action_ref = `issue_grant:${action_scope}@${subject_ref}`;
  const proposal_ref = `${action_scope}@${subject_ref}`;

  let attestation_id: string;
  try {
    const result = tx(() => {
      // Step 3+4: attest throws on bad credential or unknown actor
      const aid = attest(grantor_ref, action_ref, grantor_credential);

      // Step 5: record grant
      try {
        record_grant(grant_id, subject_ref, action_scope);
      } catch (err) {
        // Grant write failed after attest succeeded → will be orphaned below
        throw { _orphan: true, attestation_id: aid, reason: "grant-storage-failure" as OrphanReason, original: err };
      }

      // Step 6: write pairing map
      try {
        db.prepare(
          "INSERT INTO grant_attribution (grant_id, attestation_id) VALUES (?, ?)",
        ).run(grant_id, aid);
      } catch (err) {
        throw { _orphan: true, attestation_id: aid, reason: "pairing-write-failure" as OrphanReason, original: err };
      }

      return aid;
    });
    attestation_id = result;
  } catch (err: unknown) {
    const e = err as { _orphan?: boolean; attestation_id?: string; reason?: OrphanReason; original?: unknown; message?: string };
    if (e._orphan && e.attestation_id && e.reason) {
      record_orphan(e.attestation_id, proposal_ref, e.reason);
      return { err: `${e.reason}` };
    }
    // Credential or actor error — no orphan (attest failed before writing)
    const msg = e.message ?? "unknown-error";
    if (msg.startsWith("actor-not-found")) return { err: "grantor-not-found" };
    if (msg.startsWith("credential-invalid")) return { err: "credential-invalid" };
    return { err: msg };
  }

  return { ok: { grant_id, attestation_id } };
}

// ---------------------------------------------------------------------------
// revoke_grant
// ---------------------------------------------------------------------------

export type RevokeGrantResult =
  | { ok: { attestation_id: string } }
  | { err: string };

/**
 * Revokes an existing active grant.
 *
 * Steps (spec §revoke_grant):
 *   1. Look up grant — reject if not-known.
 *   2. Check grant is active — reject if not-active.
 *   3. Attest: call Actor Identity attest(revoker_ref, action_ref, credential).
 *   4. Record revocation in Permissions atom.
 *   5. Write pairing entry to revocation_attribution.
 *   Steps 3–5 run inside a single transaction.
 *
 * Returns { ok: { attestation_id } } or { err: reason }.
 */
export function revoke_grant(
  grant_id: string,
  revoker_ref: string,
  revoker_credential: string,
): RevokeGrantResult {
  if (!grant_id.trim()) return { err: "invalid-request:grant_id-empty" };
  if (!revoker_ref.trim()) return { err: "invalid-request:revoker_ref-empty" };

  const grant = getGrant(grant_id);
  if (!grant) return { err: "not-known" };
  if (grant.status !== "active") return { err: "not-active" };

  const action_ref = `revoke_grant:${grant.action_scope}@${grant.subject_ref}`;
  const proposal_ref = `revoke:${grant.action_scope}@${grant.subject_ref}`;

  let attestation_id: string;
  try {
    const result = tx(() => {
      const aid = attest(revoker_ref, action_ref, revoker_credential);

      try {
        record_revocation(grant_id);
      } catch (err) {
        throw { _orphan: true, attestation_id: aid, reason: "revocation-storage-failure" as OrphanReason, original: err };
      }

      try {
        db.prepare(
          "INSERT INTO revocation_attribution (grant_id, attestation_id) VALUES (?, ?)",
        ).run(grant_id, aid);
      } catch (err) {
        throw { _orphan: true, attestation_id: aid, reason: "pairing-write-failure" as OrphanReason, original: err };
      }

      return aid;
    });
    attestation_id = result;
  } catch (err: unknown) {
    const e = err as { _orphan?: boolean; attestation_id?: string; reason?: OrphanReason; message?: string };
    if (e._orphan && e.attestation_id && e.reason) {
      record_orphan(e.attestation_id, proposal_ref, e.reason);
      return { err: `${e.reason}` };
    }
    const msg = e.message ?? "unknown-error";
    if (msg.startsWith("actor-not-found")) return { err: "revoker-not-found" };
    if (msg.startsWith("credential-invalid")) return { err: "credential-invalid" };
    return { err: msg };
  }

  return { ok: { attestation_id } };
}

// ---------------------------------------------------------------------------
// verify_grant_attribution
// ---------------------------------------------------------------------------

export type VerifyResult =
  | {
      ok: true;
      grant: Grant;
      issuance_attestation: Attestation;
      issuance_verify_result: "valid" | "invalid" | "not-found";
      revocation_attestation: Attestation | null;
      revocation_verify_result: "valid" | "invalid" | "not-found" | null;
    }
  | { ok: false; reason: "not-known" | "attribution-inconsistency"; grant_id: string };

/**
 * Retrieves a grant and verifies its full attribution chain.
 *
 * Returns the grant record, its issuance attestation with verify result,
 * and — if the grant is revoked — its revocation attestation with verify result.
 *
 * Returns 'not-known' if the grant_id is not in the store.
 * Returns 'attribution-inconsistency' if the grant_attribution entry is missing
 * (indicates a pairing-write failure that was not caught by the orphan log).
 */
export function verify_grant_attribution(grant_id: string): VerifyResult {
  const grant = getGrant(grant_id);
  if (!grant) return { ok: false, reason: "not-known", grant_id };

  const issuanceRow = db.prepare(
    "SELECT attestation_id FROM grant_attribution WHERE grant_id = ?",
  ).get(grant_id) as { attestation_id: string } | undefined;

  if (!issuanceRow) {
    return { ok: false, reason: "attribution-inconsistency", grant_id };
  }

  const issuance_attestation = getAttestation(issuanceRow.attestation_id);
  if (!issuance_attestation) {
    return { ok: false, reason: "attribution-inconsistency", grant_id };
  }

  // Re-verify the issuance attestation against the current actor credential
  const actor = db.prepare(
    "SELECT credential_secret FROM actor WHERE actor_ref = ?",
  ).get(issuance_attestation.actor_ref) as { credential_secret: string } | undefined;

  const issuance_verify_result = actor
    ? verify(issuance_attestation.attestation_id, issuance_attestation.actor_ref, actor.credential_secret)
    : "invalid";

  // Revocation attribution (if revoked)
  let revocation_attestation: Attestation | null = null;
  let revocation_verify_result: "valid" | "invalid" | "not-found" | null = null;

  if (grant.status === "revoked") {
    const revRow = db.prepare(
      "SELECT attestation_id FROM revocation_attribution WHERE grant_id = ?",
    ).get(grant_id) as { attestation_id: string } | undefined;

    if (revRow) {
      revocation_attestation = getAttestation(revRow.attestation_id) ?? null;
      if (revocation_attestation) {
        const revActor = db.prepare(
          "SELECT credential_secret FROM actor WHERE actor_ref = ?",
        ).get(revocation_attestation.actor_ref) as { credential_secret: string } | undefined;
        revocation_verify_result = revActor
          ? verify(revocation_attestation.attestation_id, revocation_attestation.actor_ref, revActor.credential_secret)
          : "invalid";
      }
    }
  }

  return {
    ok: true,
    grant,
    issuance_attestation,
    issuance_verify_result,
    revocation_attestation,
    revocation_verify_result,
  };
}

// ---------------------------------------------------------------------------
// permitted — passthrough to Permissions atom
// ---------------------------------------------------------------------------

/**
 * Checks whether subject_ref currently has an active grant for action_scope.
 * Direct passthrough to the Permissions atom; does not consult attribution maps.
 */
export function permitted(
  subject_ref: string,
  action_scope: string,
): "permitted" | "denied" {
  return check(subject_ref, action_scope);
}
