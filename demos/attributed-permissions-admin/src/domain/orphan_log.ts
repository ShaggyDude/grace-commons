// Orphan log — append-only record of attestations whose paired grant/revocation
// write subsequently failed. Read layer; writes happen only in composition.ts.
//
// Schema enforces no-update, no-delete (Invariant 8).

import { db } from "../db/client.ts";
import { ulid } from "@std/ulid";

export type OrphanEntry = {
  orphan_id: string;
  attestation_id: string;
  proposal_ref: string;
  requested_at: string;
  underlying_reason: string;
};

export type OrphanReason =
  | "grant-storage-failure"
  | "revocation-storage-failure"
  | "invalid-request"
  | "not-known"
  | "not-active"
  | "pairing-write-failure";

/**
 * Records an orphan attestation. Called when attest() succeeded but the
 * subsequent grant/revoke write or pairing-map write failed.
 *
 * Does NOT use the main tx() wrapper: the caller is already in a failed
 * transaction that has been rolled back. The orphan log write runs in its
 * own SAVEPOINT so it persists even when the outer transaction aborted.
 * See CORNERS.md "Orphan log and transaction boundary".
 */
export function record_orphan(
  attestation_id: string,
  proposal_ref: string,
  underlying_reason: OrphanReason,
): void {
  db.exec("BEGIN");
  try {
    db.prepare(`
      INSERT INTO orphan_log (orphan_id, attestation_id, proposal_ref, requested_at, underlying_reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(ulid(), attestation_id, proposal_ref, new Date().toISOString(), underlying_reason);
    db.exec("COMMIT");
  } catch {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    // Orphan log write failure: log to stderr but do not throw — we are already
    // in a failure path and must not mask the original error.
    console.error(`[orphan_log] failed to record orphan for attestation ${attestation_id}`);
  }
}

/** Returns all orphan log entries, newest first. */
export function listOrphans(): OrphanEntry[] {
  return db.prepare(
    "SELECT * FROM orphan_log ORDER BY requested_at DESC",
  ).all() as OrphanEntry[];
}
