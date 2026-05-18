// Permissions atom — grant / revoke / permitted.
// Scoped to the chain store; knows nothing about chains.
// See BUILD_PLAN.md §5 and spec §Permissions.

import { db, tx } from "../db/client.ts";

export type Scope = "chains:initiate" | "chains:withdraw" | "chains:read";

export type PermissionResult = "permitted" | "denied";

const stmtPermitted = db.prepare(`
  SELECT COUNT(*) AS n
  FROM   permission_grant
  WHERE  actor_ref  = ?
    AND  scope      = ?
    AND  revoked_at IS NULL
`);

/**
 * Returns 'permitted' if actor_ref holds an active grant for scope,
 * 'denied' otherwise.
 *
 * This is the entire Permissions atom's `permitted` surface for this
 * composition — a single-row query, no chain knowledge.
 */
export function permitted(actor_ref: string, scope: Scope): PermissionResult {
  const row = stmtPermitted.get(actor_ref, scope) as { n: number };
  return row.n > 0 ? "permitted" : "denied";
}

const stmtGrant = db.prepare(`
  INSERT INTO permission_grant (actor_ref, scope, granted_at, granted_by)
  VALUES (?, ?, ?, ?)
`);

const stmtLastId = db.prepare("SELECT last_insert_rowid() AS id");

/**
 * Creates an active permission grant. Throws if a unique-constraint
 * violation occurs (duplicate active grant for the same actor + scope).
 */
export function grant(
  actor_ref: string,
  scope: Scope,
  granted_by: string,
): number {
  return tx(() => {
    stmtGrant.run(actor_ref, scope, new Date().toISOString(), granted_by);
    return (stmtLastId.get() as { id: number }).id;
  });
}

const stmtRevoke = db.prepare(`
  UPDATE permission_grant
  SET    revoked_at = ?,
         revoked_by = ?
  WHERE  grant_id   = ?
    AND  revoked_at IS NULL
`);

/**
 * Revokes the grant with the given ID. No-op if already revoked.
 */
export function revoke(grant_id: number, revoked_by: string): void {
  tx(() => {
    stmtRevoke.run(new Date().toISOString(), revoked_by, grant_id);
  });
}
