// domain/sessions.ts
//
// Atom: Session
//
// Library spec (quoted from grace-commons/atoms/session.md):
//   "Session is the compliance atom that answers the question 'is this session
//    token currently valid, and for which principal?' [...] Each session record
//    has a status that traverses a simple state machine: Active is the only
//    non-terminal state; Expired and Revoked are the two terminal states. The
//    expires_at timestamp is set on issue [...] and is never mutated thereafter.
//    A session that needs a longer lifetime is re-issued — a new record with a
//    new token — not extended in place."
//
// Invariants:
//   - token is opaque random, stored in HttpOnly cookie
//   - token is UNIQUE (schema enforces it)
//   - revoked_at is terminal; once set, no further validation succeeds
//   - expires_at is immutable; session extension always issues a new record
//   - Both revoked_at and expires_at are checked before any request is authorized

import type { DB } from "../lib/db.ts";

export interface Session {
  id: number;
  actor_id: number;
  token: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

/** Find a session by id. Returns null if not found. */
export function getById(db: DB, id: number): Session | null {
  return (
    db.prepare("SELECT * FROM sessions WHERE id = ?").get<Session>(id) ?? null
  );
}

/**
 * Find an active (non-revoked, non-expired) session by token.
 * Returns null if the token is unknown, revoked, or expired.
 * This is the hot path called on every authenticated request.
 */
export function getActive(db: DB, token: string): Session | null {
  return (
    db
      .prepare(
        `SELECT * FROM sessions
         WHERE token = ?
           AND revoked_at IS NULL
           AND datetime(expires_at) > datetime('now')`,
      )
      .get<Session>(token) ?? null
  );
}

/**
 * Create a new session record.
 * `token` must be a cryptographically random opaque string (from randomToken()).
 * Called only from composition functions — never directly from routes.
 */
export function create(
  db: DB,
  actor_id: number,
  token: string,
  expires_at: string,
): Session {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO sessions (actor_id, token, issued_at, expires_at)
       VALUES (?, ?, ?, ?) RETURNING *`,
    )
    .get<Session>(actor_id, token, now, expires_at);
  if (!row) throw new Error("sessions.create: insert returned no row");
  return row;
}

/**
 * Revoke a session by id. No-op if already revoked.
 * Called from composition.logout() and composition.revokeSession().
 */
export function revoke(db: DB, id: number): void {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
  ).run(now, id);
}

/**
 * Revoke a session by token. Used in the logout route where id is not at hand.
 */
export function revokeByToken(db: DB, token: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE sessions SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL",
  ).run(now, token);
}
