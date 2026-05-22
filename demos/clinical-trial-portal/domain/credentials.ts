// domain/credentials.ts
//
// Atom: Credential
//
// Library spec (quoted from grace-commons/atoms/compliance/credential.md):
//   "Credential is the compliance atom that answers the question 'does this
//    presented material belong to this principal, for this credential type?'
//    It does this through credential records: durable bindings that associate
//    a principal [...] with credential material processed into a verifier [...]
//    The verifier, not the raw material, is what persists; raw credential
//    material is consumed on register and on verify and is never stored."
//
// Invariants:
//   - kind is 'password' for this demo (schema CHECK enforces it)
//   - secret_hash is the Argon2id PHC-format encoded string (never raw password)
//   - revoked_at marks a credential as no longer valid (absorbing terminal state)
//   - An actor has at most one active credential of a given kind at a time
//   - Credential creation and verification are the only operations; no update

import type { DB } from "../lib/db.ts";

export interface Credential {
  id: number;
  actor_id: number;
  kind: string;
  secret_hash: string;
  created_at: string;
  revoked_at: string | null;
}

/** Find a credential by id. Returns null if not found. */
export function getById(db: DB, id: number): Credential | null {
  return (
    db
      .prepare("SELECT * FROM credentials WHERE id = ?")
      .get<Credential>(id) ?? null
  );
}

/**
 * Find the active (non-revoked) credential for an actor of the given kind.
 * Returns null if no active credential exists.
 */
export function getActiveByActorId(
  db: DB,
  actor_id: number,
  kind = "password",
): Credential | null {
  return (
    db
      .prepare(
        `SELECT * FROM credentials
         WHERE actor_id = ? AND kind = ? AND revoked_at IS NULL
         LIMIT 1`,
      )
      .get<Credential>(actor_id, kind) ?? null
  );
}

/**
 * Create a new credential record for an actor.
 * `secret_hash` must already be the Argon2id PHC-encoded string; this function
 * does not perform hashing.
 * Called only from composition.acceptInvitation — never directly from routes.
 */
export function create(
  db: DB,
  actor_id: number,
  kind: string,
  secret_hash: string,
): Credential {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO credentials (actor_id, kind, secret_hash, created_at)
       VALUES (?, ?, ?, ?) RETURNING *`,
    )
    .get<Credential>(actor_id, kind, secret_hash, now);
  if (!row) throw new Error("credentials.create: insert returned no row");
  return row;
}

/**
 * Revoke an active credential.
 * After revocation, verifyPassword calls against this credential will always fail.
 */
export function revoke(db: DB, id: number): void {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE credentials SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
  ).run(now, id);
}
