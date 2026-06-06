// domain/grants.ts — Atom: Permissions (grants)
// Library spec (atoms/compliance/permissions.md): a grant binds a subject to a
// permission; active until revoked; revocation immediate and permanent. The
// `scope` ('all'|'own') is the demo's composition-emergent discriminator.
import type { Queryable } from "../lib/db.ts";

export interface Grant {
  id: number; grantor_actor_id: number; grantee_actor_id: number; permission_id: number;
  scope: "all" | "own"; issued_at: string; revoked_at: string | null; revoke_reason: string | null;
}

export async function getById(q: Queryable, id: number): Promise<Grant | null> {
  const [row] = await q.query<Grant>("SELECT * FROM grants WHERE id = $1", [id]);
  return row ?? null;
}
export async function listAll(q: Queryable): Promise<Grant[]> {
  return q.query<Grant>("SELECT * FROM grants ORDER BY id ASC");
}
/** First active grant the actor holds for ANY of `codes`; scope captured for downstream filtering. */
export async function findActiveFor(
  q: Queryable, actor_id: number, codes: string[],
): Promise<{ scope: "all" | "own" } | null> {
  if (codes.length === 0) return null;
  const [row] = await q.query<{ scope: "all" | "own" }>(
    `SELECT g.scope FROM grants g
       JOIN permissions p ON p.id = g.permission_id
      WHERE g.grantee_actor_id = $1 AND g.revoked_at IS NULL AND p.code = ANY($2)
      ORDER BY g.id ASC LIMIT 1`,
    [actor_id, codes],
  );
  return row ?? null;
}
export async function create(
  q: Queryable,
  input: { grantor_actor_id: number; grantee_actor_id: number; permission_id: number; scope?: "all" | "own" },
): Promise<Grant> {
  const now = new Date().toISOString();
  const [row] = await q.query<Grant>(
    `INSERT INTO grants (grantor_actor_id, grantee_actor_id, permission_id, scope, issued_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [input.grantor_actor_id, input.grantee_actor_id, input.permission_id, input.scope ?? "all", now],
  );
  if (!row) throw new Error("grants.create: insert returned no row");
  return row;
}
export async function revoke(q: Queryable, id: number, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await q.query(
    "UPDATE grants SET revoked_at = $1, revoke_reason = $2 WHERE id = $3 AND revoked_at IS NULL",
    [now, reason, id],
  );
}
