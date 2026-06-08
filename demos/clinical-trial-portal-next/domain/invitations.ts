// domain/invitations.ts — Atom: Invitation
// Library spec (atoms/invitation.md): a single-resolution lifecycle
// artifact (Pending → Accepted | Expired | Revoked); the token is identity +
// bearer credential; never deleted.
import type { Queryable } from "../lib/db.ts";

export interface Invitation {
  id: number; party_id: number; intended_role: string; token: string;
  issued_by_actor_id: number; issued_at: string; expires_at: string;
  accepted_at: string | null; accepted_by_actor_id: number | null; revoked_at: string | null;
}

export async function getById(q: Queryable, id: number): Promise<Invitation | null> {
  const [row] = await q.query<Invitation>("SELECT * FROM invitations WHERE id = $1", [id]);
  return row ?? null;
}
export async function getByToken(q: Queryable, token: string): Promise<Invitation | null> {
  const [row] = await q.query<Invitation>("SELECT * FROM invitations WHERE token = $1", [token]);
  return row ?? null;
}
export async function listPending(q: Queryable): Promise<Invitation[]> {
  const now = new Date().toISOString();
  return q.query<Invitation>(
    `SELECT * FROM invitations
      WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > $1
      ORDER BY issued_at DESC`,
    [now],
  );
}
export async function listAll(q: Queryable): Promise<Invitation[]> {
  return q.query<Invitation>("SELECT * FROM invitations ORDER BY issued_at DESC");
}
export async function create(
  q: Queryable,
  input: { party_id: number; intended_role: string; token: string; issued_by_actor_id: number; expires_at: string },
): Promise<Invitation> {
  const now = new Date().toISOString();
  const [row] = await q.query<Invitation>(
    `INSERT INTO invitations (party_id, intended_role, token, issued_by_actor_id, issued_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [input.party_id, input.intended_role, input.token, input.issued_by_actor_id, now, input.expires_at],
  );
  if (!row) throw new Error("invitations.create: insert returned no row");
  return row;
}
export async function markAccepted(q: Queryable, id: number, actor_id: number): Promise<void> {
  const now = new Date().toISOString();
  const rows = await q.query(
    `UPDATE invitations SET accepted_at = $1, accepted_by_actor_id = $2
       WHERE id = $3 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,
    [now, actor_id, id],
  );
  if (rows.length === 0) throw new Error(`invitations.markAccepted: #${id} not found or already resolved`);
}
export async function revoke(q: Queryable, id: number): Promise<void> {
  const now = new Date().toISOString();
  const rows = await q.query(
    `UPDATE invitations SET revoked_at = $1
       WHERE id = $2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,
    [now, id],
  );
  if (rows.length === 0) throw new Error(`invitations.revoke: #${id} not found or already resolved`);
}
