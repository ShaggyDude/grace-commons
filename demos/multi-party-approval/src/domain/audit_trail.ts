// Audit Trail — record_action + verify_record.
//
// Hash chain design (BUILD_PLAN.md §4.6):
//   attestation = HMAC-SHA256(key=actor.credential_secret,
//                             data=canonical_json(core_payload))
//   row_hash    = SHA-256(prev_row_hash || canonical_json({...core_payload, attestation}))
//
// Where core_payload = {seq, action_ref, actor_ref, chain_id, step_id,
//                       recorded_at, data_json, retention_policy, retention_until}
//
// Functions accept an optional `database` parameter so tests can inject
// a fresh DB without going through the shared module-level connection.

import { createHash, createHmac } from "node:crypto";
import type { Database } from "@db/sqlite";
import { db as sharedDb } from "../db/client.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionRef =
  | "chain_initiated"
  | "chain_withdrawn"
  | "step_approved"
  | "step_rejected"
  | "step_withdrawn"
  | "chain_resolved"
  | "chain_initiation_failed"
  | "cascade_completed";

export type RetentionPolicy =
  | "sox_7_year"
  | "fda_part_11_predicate_rule"
  | "ich_e6_tmf";

export type RecordActionParams = {
  action_ref: ActionRef;
  actor_ref: string;
  credential_secret: string;
  chain_id?: string | null;
  step_id?: string | null;
  data: Record<string, unknown>;
  retention_policy: RetentionPolicy;
};

export type VerifyResult =
  | "verified"
  | `failed-verification(${string})`;

// ---------------------------------------------------------------------------
// Internal — pure crypto helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON serialisation for canonical payloads.
 * Uses explicit key ordering to ensure hash stability across
 * environments — never relies on insertion order.
 */
function canonical(obj: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    ordered[k] = obj[k];
  }
  return JSON.stringify(ordered);
}

export function computeAttestation(
  secret: string,
  corePayload: Record<string, unknown>,
): string {
  return createHmac("sha256", secret)
    .update(canonical(corePayload))
    .digest("hex");
}

export function computeRowHash(
  prevRowHash: string,
  fullPayload: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(prevRowHash + canonical(fullPayload))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Internal — retention horizon
// ---------------------------------------------------------------------------

function retentionUntil(policy: RetentionPolicy): string {
  const d = new Date();
  switch (policy) {
    case "sox_7_year":
      d.setFullYear(d.getFullYear() + 7);
      break;
    case "fda_part_11_predicate_rule":
      d.setFullYear(d.getFullYear() + 6);
      break;
    case "ich_e6_tmf":
      d.setFullYear(d.getFullYear() + 15);
      break;
  }
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// record_action
// ---------------------------------------------------------------------------

/**
 * Appends one event to the audit log.
 *
 * Must be called inside an open transaction (the caller's BEGIN IMMEDIATE).
 * record_action does NOT open its own transaction — it participates in the
 * caller's so that an outer ROLLBACK removes the audit row with the
 * constituent write. See BUILD_PLAN.md §5.
 */
export function record_action(
  params: RecordActionParams,
  database: Database = sharedDb,
): void {
  const recorded_at = new Date().toISOString();
  const data_json = JSON.stringify(params.data);
  const retention_until_val = retentionUntil(params.retention_policy);

  // Determine next seq and prev_row_hash in one read
  const tail = database.prepare(`
    SELECT COALESCE(MAX(seq), 0) AS max_seq,
           COALESCE(
             (SELECT row_hash FROM audit_event ORDER BY seq DESC LIMIT 1),
             ''
           ) AS prev_hash
    FROM audit_event
  `).get() as { max_seq: number; prev_hash: string };

  const seq = tail.max_seq + 1;
  const prev_row_hash = tail.prev_hash;

  const corePayload: Record<string, unknown> = {
    action_ref: params.action_ref,
    actor_ref: params.actor_ref,
    chain_id: params.chain_id ?? null,
    data_json,
    recorded_at,
    retention_policy: params.retention_policy,
    retention_until: retention_until_val,
    seq,
    step_id: params.step_id ?? null,
  };

  const attestation = computeAttestation(params.credential_secret, corePayload);

  const row_hash = computeRowHash(prev_row_hash, {
    ...corePayload,
    attestation,
  });

  database.prepare(`
    INSERT INTO audit_event
      (seq, action_ref, actor_ref, chain_id, step_id, recorded_at,
       data_json, retention_policy, retention_until, attestation,
       prev_row_hash, row_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    seq,
    params.action_ref,
    params.actor_ref,
    params.chain_id ?? null,
    params.step_id ?? null,
    recorded_at,
    data_json,
    params.retention_policy,
    retention_until_val,
    attestation,
    prev_row_hash,
    row_hash,
  );
}

// ---------------------------------------------------------------------------
// verify_record
// ---------------------------------------------------------------------------

/**
 * Walks the hash chain from seq=1 to the seq of the given event_id,
 * recomputing attestation and row_hash for every row.
 *
 * Returns 'verified' if the full chain is intact, or
 * 'failed-verification(<reason>)' naming the first discrepancy found.
 */
export function verify_record(
  event_id: number,
  database: Database = sharedDb,
): VerifyResult {
  // Resolve the target seq
  const target = database.prepare(
    "SELECT seq FROM audit_event WHERE event_id = ?",
  ).get(event_id) as { seq: number } | undefined;

  if (!target) {
    return "failed-verification(event not found)";
  }

  // Load the chain from seq=1 to target seq, joined with actor for secret
  const rows = database.prepare(`
    SELECT e.event_id,
           e.seq,
           e.action_ref,
           e.actor_ref,
           e.chain_id,
           e.step_id,
           e.recorded_at,
           e.data_json,
           e.retention_policy,
           e.retention_until,
           e.attestation,
           e.prev_row_hash,
           e.row_hash,
           a.credential_secret
    FROM   audit_event e
    JOIN   actor a ON a.actor_ref = e.actor_ref
    WHERE  e.seq <= ?
    ORDER  BY e.seq ASC
  `).all(target.seq) as Array<{
    event_id: number;
    seq: number;
    action_ref: string;
    actor_ref: string;
    chain_id: string | null;
    step_id: string | null;
    recorded_at: string;
    data_json: string;
    retention_policy: string;
    retention_until: string;
    attestation: string;
    prev_row_hash: string;
    row_hash: string;
    credential_secret: string;
  }>;

  let expectedPrevHash = "";

  for (const row of rows) {
    // Verify prev_row_hash linkage
    if (row.prev_row_hash !== expectedPrevHash) {
      return `failed-verification(seq ${row.seq}: prev_row_hash mismatch)`;
    }

    const corePayload: Record<string, unknown> = {
      action_ref: row.action_ref,
      actor_ref: row.actor_ref,
      chain_id: row.chain_id,
      data_json: row.data_json,
      recorded_at: row.recorded_at,
      retention_policy: row.retention_policy,
      retention_until: row.retention_until,
      seq: row.seq,
      step_id: row.step_id,
    };

    // Verify attestation
    const expectedAttestation = computeAttestation(
      row.credential_secret,
      corePayload,
    );
    if (row.attestation !== expectedAttestation) {
      return `failed-verification(seq ${row.seq}: attestation mismatch)`;
    }

    // Verify row_hash
    const expectedRowHash = computeRowHash(expectedPrevHash, {
      ...corePayload,
      attestation: row.attestation,
    });
    if (row.row_hash !== expectedRowHash) {
      return `failed-verification(seq ${row.seq}: row_hash mismatch)`;
    }

    expectedPrevHash = row.row_hash;
  }

  return "verified";
}
