// Session atom — session store.
//
// Implements the Session atom surface used by the Login route and the
// currentActorMiddleware (Session-Gated Authorization, C14).
//
// Operations (spec §Session):
//   issue_session(principal_ref) → session_id (bearer token)
//   validate_session(token) → { principal_ref, expires_at } | 'expired' | 'revoked' | 'not-known'
//   revoke_session(token) → void
//
// Session tokens are ULIDs — random enough for a demo. Production deployments
// would use crypto.getRandomValues() for the token material.
//
// Expiry is checked lazily on validate: if expires_at < now, the session is
// treated as expired (the DB record is marked expired on first detection).

import { ulid } from "@std/ulid";
import { db } from "../db/client.ts";

const SESSION_HOURS = 8;
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// issue_session
// ---------------------------------------------------------------------------

/**
 * Issues a new session for principal_ref.
 * Returns the session token (session_id) to be set as a cookie.
 */
export function issue_session(principal_ref: string): string {
  const session_id = ulid();
  const now = new Date();
  const expires_at = new Date(now.getTime() + SESSION_MS).toISOString();

  db.prepare(`
    INSERT INTO session (session_id, principal_ref, issued_at, expires_at, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(session_id, principal_ref, now.toISOString(), expires_at);

  return session_id;
}

// ---------------------------------------------------------------------------
// validate_session
// ---------------------------------------------------------------------------

export type ValidSession = { principal_ref: string; expires_at: string };

/**
 * Validates a session token.
 *
 * Returns:
 *   ValidSession        — session is active and not expired; principal_ref is safe to use
 *   'expired'           — session existed but expires_at has passed
 *   'revoked'           — session was explicitly revoked
 *   'not-known'         — token not in the store
 *
 * Mirrors Session.validate → valid(principal_ref, expires_at) | invalid(reason).
 */
export function validate_session(
  token: string,
): ValidSession | "expired" | "revoked" | "not-known" {
  const row = db.prepare(`
    SELECT principal_ref, expires_at, status
    FROM session
    WHERE session_id = ?
  `).get(token) as
    | { principal_ref: string; expires_at: string; status: string }
    | undefined;

  if (!row) return "not-known";
  if (row.status === "revoked") return "revoked";

  // Lazy expiry check
  if (new Date(row.expires_at) <= new Date()) {
    if (row.status === "active") {
      db.prepare(
        "UPDATE session SET status = 'expired' WHERE session_id = ?",
      ).run(token);
    }
    return "expired";
  }

  return { principal_ref: row.principal_ref, expires_at: row.expires_at };
}

// ---------------------------------------------------------------------------
// revoke_session
// ---------------------------------------------------------------------------

/**
 * Revokes an active session (logout).
 * No-op if the token is unknown, already revoked, or already expired.
 */
export function revoke_session(token: string): void {
  db.prepare(`
    UPDATE session
    SET status = 'revoked', revoked_at = ?
    WHERE session_id = ? AND status = 'active'
  `).run(new Date().toISOString(), token);
}
