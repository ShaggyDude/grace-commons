// domain/invitations.ts
//
// Atom: Invitation
//
// Library spec (quoted from grace-commons/atoms/compliance/invitation.md):
//   "Invitation is the compliance atom that answers the question 'what is the
//    state of this invitation, and who accepted it if it was accepted?' It does
//    this through invitation records: durable, single-resolution lifecycle
//    artifacts that exist from the moment an invitation is issued through its
//    terminal resolution. Each invitation is identified by an invitation_token —
//    an opaque, cryptographically random, system-generated value that functions
//    as both the record's identity and the bearer credential the invitee presents
//    to accept or decline."
//
// State machine: Pending → Accepted | Expired | Revoked
//   (Declined is in the library spec but not needed for this demo's scope)
//
// Invariants:
//   - token is UNIQUE (schema enforces it)
//   - Single-resolution: once accepted or revoked, no further action is accepted
//   - accepted_by_actor_id is set atomically when accepted (in composition.ts)
//   - expires_at is immutable after creation
//   - Invitations are never deleted; the record is the audit chain precursor

import type { DB } from "../lib/db.ts";

export interface Invitation {
  id: number;
  party_id: number;
  intended_role: string;
  token: string;
  issued_by_actor_id: number;
  issued_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_actor_id: number | null;
  revoked_at: string | null;
}

/** Find an invitation by id. Returns null if not found. */
export function getById(db: DB, id: number): Invitation | null {
  return (
    db
      .prepare("SELECT * FROM invitations WHERE id = ?")
      .get<Invitation>(id) ?? null
  );
}

/**
 * Find an invitation by its bearer token.
 * Returns null if the token is unknown.
 * Callers must check accepted_at / revoked_at / expires_at themselves.
 */
export function getByToken(db: DB, token: string): Invitation | null {
  return (
    db
      .prepare("SELECT * FROM invitations WHERE token = ?")
      .get<Invitation>(token) ?? null
  );
}

/**
 * Return all pending (unaccepted, unrevoked, unexpired) invitations.
 * Used in the PI's /people view.
 */
export function listPending(db: DB): Invitation[] {
  return db
    .prepare(
      `SELECT * FROM invitations
       WHERE accepted_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > datetime('now')
       ORDER BY issued_at DESC`,
    )
    .all<Invitation>();
}

/** Return all invitations regardless of state (for audit purposes). */
export function listAll(db: DB): Invitation[] {
  return db
    .prepare("SELECT * FROM invitations ORDER BY issued_at DESC")
    .all<Invitation>();
}

/**
 * Create a new invitation record.
 * Called only from composition.issueInvitation — never directly from routes.
 */
export function create(
  db: DB,
  input: {
    party_id: number;
    intended_role: string;
    token: string;
    issued_by_actor_id: number;
    expires_at: string;
  },
): Invitation {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO invitations
         (party_id, intended_role, token, issued_by_actor_id, issued_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get<Invitation>(
      input.party_id,
      input.intended_role,
      input.token,
      input.issued_by_actor_id,
      now,
      input.expires_at,
    );
  if (!row) throw new Error("invitations.create: insert returned no row");
  return row;
}

/**
 * Mark an invitation as accepted, recording the actor who accepted it.
 * Throws if the invitation is not in the Pending state.
 * Called only from composition.acceptInvitation — never directly from routes.
 */
export function markAccepted(db: DB, id: number, actor_id: number): void {
  const now = new Date().toISOString();
  const changes = db
    .prepare(
      `UPDATE invitations
       SET accepted_at = ?, accepted_by_actor_id = ?
       WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
    )
    .run(now, actor_id, id);
  if (changes === 0) {
    throw new Error(
      `invitations.markAccepted: invitation #${id} not found or already resolved`,
    );
  }
}

/**
 * Revoke an invitation, preventing acceptance.
 * Throws if the invitation is already resolved.
 * Called only from composition.revokeInvitation — never directly from routes.
 */
export function revoke(db: DB, id: number): void {
  const now = new Date().toISOString();
  const changes = db
    .prepare(
      `UPDATE invitations
       SET revoked_at = ?
       WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
    )
    .run(now, id);
  if (changes === 0) {
    throw new Error(
      `invitations.revoke: invitation #${id} not found or already resolved`,
    );
  }
}
