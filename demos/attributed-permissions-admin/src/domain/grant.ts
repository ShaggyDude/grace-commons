// Permissions atom — grant store.
//
// Implements the two direct operations on the grant table:
//   record_grant(grant_id, subject_ref, action_scope) → void
//   record_revocation(grant_id) → void
//   check(subject_ref, action_scope) → 'permitted' | 'denied'
//
// These are called only from composition.ts, never directly from routes.
// Routes always go through the composition surface (issue_grant / revoke_grant).

import { db } from "../db/client.ts";

export type Grant = {
  grant_id: string;
  subject_ref: string;
  action_scope: string;
  status: "active" | "revoked";
  granted_at: string;
  revoked_at: string | null;
};

/**
 * Records a new active grant.
 * Called inside a transaction in composition.ts after attest() succeeds.
 * Throws if a duplicate active grant for (subject_ref, action_scope) exists
 * (unique index enforced by schema).
 */
export function record_grant(
  grant_id: string,
  subject_ref: string,
  action_scope: string,
): void {
  db.prepare(`
    INSERT INTO grant (grant_id, subject_ref, action_scope, status, granted_at)
    VALUES (?, ?, ?, 'active', ?)
  `).run(grant_id, subject_ref, action_scope, new Date().toISOString());
}

/**
 * Marks a grant as revoked.
 * Throws if grant_id is not found or already revoked (schema trigger enforces
 * terminal absorption: revoked → active is forbidden).
 */
export function record_revocation(grant_id: string): void {
  const now = new Date().toISOString();
  const changes = db.prepare(`
    UPDATE grant SET status = 'revoked', revoked_at = ? WHERE grant_id = ? AND status = 'active'
  `).run(now, grant_id);

  if (changes === 0) {
    // Either not found or already revoked
    const exists = db.prepare("SELECT 1 FROM grant WHERE grant_id = ?").get(grant_id);
    if (!exists) throw new Error(`not-known:${grant_id}`);
    throw new Error(`not-active:${grant_id}`);
  }
}

/**
 * Checks whether subject_ref has an active grant for action_scope.
 * Passthrough to the Permissions atom; does not go through the composition surface.
 */
export function check(
  subject_ref: string,
  action_scope: string,
): "permitted" | "denied" {
  const row = db.prepare(`
    SELECT 1 FROM grant WHERE subject_ref = ? AND action_scope = ? AND status = 'active'
  `).get(subject_ref, action_scope);
  return row ? "permitted" : "denied";
}

/** Returns a grant by id, or undefined. */
export function getGrant(grant_id: string): Grant | undefined {
  return db.prepare("SELECT * FROM grant WHERE grant_id = ?")
    .get(grant_id) as Grant | undefined;
}

/** Returns all grants, newest first. */
export function listGrants(): Grant[] {
  return db.prepare(
    "SELECT * FROM grant ORDER BY granted_at DESC",
  ).all() as Grant[];
}
