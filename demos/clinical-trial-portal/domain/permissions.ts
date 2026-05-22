// domain/permissions.ts
//
// Atom: Permissions (permission registry)
//
// Library spec (quoted from grace-commons/atoms/compliance/permissions.md):
//   "Permissions is the compliance atom that answers the question 'is this
//    actor allowed to do this thing right now?' It does so through grants:
//    explicit records that bind a subject (the actor requesting access) to an
//    action scope (the set of operations the grant covers). A grant is active
//    until revoked; revocation is immediate and permanent. [...] There is no
//    implicit permission: absence of a grant is always denial."
//
// Invariants:
//   - code is UNIQUE (schema enforces it)
//   - permission rows are seeded at startup (seed.ts); never created at runtime
//   - No permissions are deleted; the registry is append-only in practice

import type { DB } from "../lib/db.ts";

export interface Permission {
  id: number;
  code: string;
  label: string;
}

/** Find a permission by id. Returns null if not found. */
export function getById(db: DB, id: number): Permission | null {
  return (
    db
      .prepare("SELECT * FROM permissions WHERE id = ?")
      .get<Permission>(id) ?? null
  );
}

/** Find a permission by its code string (e.g. 'invite_actor'). Returns null if not found. */
export function getByCode(db: DB, code: string): Permission | null {
  return (
    db
      .prepare("SELECT * FROM permissions WHERE code = ?")
      .get<Permission>(code) ?? null
  );
}

/** Return all permissions, ordered by id. */
export function listAll(db: DB): Permission[] {
  return db
    .prepare("SELECT * FROM permissions ORDER BY id ASC")
    .all<Permission>();
}

/**
 * Insert a permission record.
 * Used by seed.ts; not called at runtime.
 */
export function create(db: DB, code: string, label: string): Permission {
  if (!code || !label) {
    throw new Error("permissions.create: code and label required");
  }
  const row = db
    .prepare(
      "INSERT INTO permissions (code, label) VALUES (?, ?) RETURNING *",
    )
    .get<Permission>(code, label);
  if (!row) throw new Error("permissions.create: insert returned no row");
  return row;
}
