// domain/grants.ts
//
// Atom: Permissions (grants)
//
// Library spec (quoted from grace-commons/atoms/compliance/permissions.md):
//   "A grant is the atom's unit of authorization: a binding of a subject to an
//    action scope that remains active until revoked. Evaluation is grant-lookup:
//    if any active grant exists for the queried (subject, scope) pair, the answer
//    is permitted; otherwise denied. No active grant, no permission — there is
//    no implicit permission and no notion of a default-allow posture within this
//    atom. [...] grants are immutable once recorded; revocation is terminal;
//    evaluation is a read-only query over the active grant set."
//
// Composition emergent state:
//   The `scope` column ('all' | 'own') is an extension beyond the base Permissions
//   atom to model CRA (all audit records) vs SC (own audit records only) access.
//   Documented here as the one composition-emergent piece per §3 of the plan.
//
// Invariants:
//   - A grant is active until its revoked_at is set (terminal)
//   - revoke_reason is required when revoking (composition layer enforces this)
//   - grantor_actor_id captures who issued the grant (attribution)
//   - scope is 'all' or 'own' (schema CHECK enforces it)

import type { DB } from "../lib/db.ts";

export interface Grant {
  id: number;
  grantor_actor_id: number;
  grantee_actor_id: number;
  permission_id: number;
  scope: "all" | "own";
  issued_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
}

/** A grant with the permission code joined in — useful for display. */
export interface GrantWithCode extends Grant {
  permission_code: string;
  permission_label: string;
}

/** Find a grant by id. Returns null if not found. */
export function getById(db: DB, id: number): Grant | null {
  return (
    db.prepare("SELECT * FROM grants WHERE id = ?").get<Grant>(id) ?? null
  );
}

/**
 * Find the first active grant for an actor that covers any of the given
 * permission codes. Returns null if no active matching grant exists.
 *
 * Used by requirePermission middleware (Appendix A.9).
 * The returned grant's `scope` is used for downstream filtering on the
 * audit surface (CRA sees all; SC sees own).
 */
export function findActiveFor(
  db: DB,
  actor_id: number,
  codes: string[],
): Grant | null {
  if (codes.length === 0) return null;
  const placeholders = codes.map(() => "?").join(",");
  return (
    db
      .prepare(
        `SELECT g.*
         FROM grants g
         JOIN permissions p ON p.id = g.permission_id
         WHERE g.grantee_actor_id = ?
           AND p.code IN (${placeholders})
           AND g.revoked_at IS NULL
         LIMIT 1`,
      )
      .get<Grant>(actor_id, ...codes) ?? null
  );
}

/** Return all active grants for an actor, with permission code included. */
export function listForActor(db: DB, actor_id: number): GrantWithCode[] {
  return db
    .prepare(
      `SELECT g.*, p.code AS permission_code, p.label AS permission_label
       FROM grants g
       JOIN permissions p ON p.id = g.permission_id
       WHERE g.grantee_actor_id = ?
       ORDER BY g.issued_at ASC`,
    )
    .all<GrantWithCode>(actor_id);
}

/** Return all grants (all actors), with permission code included, for the people view. */
export function listAll(db: DB): GrantWithCode[] {
  return db
    .prepare(
      `SELECT g.*, p.code AS permission_code, p.label AS permission_label
       FROM grants g
       JOIN permissions p ON p.id = g.permission_id
       ORDER BY g.grantee_actor_id ASC, g.issued_at ASC`,
    )
    .all<GrantWithCode>();
}

/**
 * Create a new grant record.
 * Called only from composition.grantPermission — never directly from routes.
 */
export function create(
  db: DB,
  input: {
    grantor_actor_id: number;
    grantee_actor_id: number;
    permission_id: number;
    scope: "all" | "own";
  },
): Grant {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO grants
         (grantor_actor_id, grantee_actor_id, permission_id, scope, issued_at)
       VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
    .get<Grant>(
      input.grantor_actor_id,
      input.grantee_actor_id,
      input.permission_id,
      input.scope,
      now,
    );
  if (!row) throw new Error("grants.create: insert returned no row");
  return row;
}

/**
 * Revoke a grant by id.
 * Called only from composition.revokeGrant — never directly from routes.
 */
export function revoke(db: DB, id: number, reason: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE grants SET revoked_at = ?, revoke_reason = ?
     WHERE id = ? AND revoked_at IS NULL`,
  ).run(now, reason, id);
}
