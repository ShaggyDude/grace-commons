// domain/sessions.ts — Atom: Session
// Library spec (atoms/compliance/session.md): a session is an opaque DB-backed
// token with issue/expiry/revoke; the sessions table is the source of truth.
import type { Queryable } from "../lib/db.ts";

export interface Session {
  id: number; actor_id: number; token: string;
  issued_at: string; expires_at: string; revoked_at: string | null;
}

export async function getById(q: Queryable, id: number): Promise<Session | null> {
  const [row] = await q.query<Session>("SELECT * FROM sessions WHERE id = $1", [id]);
  return row ?? null;
}
/** Active = not revoked and not expired (expires_at compared as ISO text). */
export async function getActive(q: Queryable, token: string): Promise<Session | null> {
  const now = new Date().toISOString();
  const [row] = await q.query<Session>(
    "SELECT * FROM sessions WHERE token = $1 AND revoked_at IS NULL AND expires_at > $2",
    [token, now],
  );
  return row ?? null;
}
export async function create(q: Queryable, actor_id: number, token: string, expires_at: string): Promise<Session> {
  const now = new Date().toISOString();
  const [row] = await q.query<Session>(
    "INSERT INTO sessions (actor_id, token, issued_at, expires_at) VALUES ($1,$2,$3,$4) RETURNING *",
    [actor_id, token, now, expires_at],
  );
  if (!row) throw new Error("sessions.create: insert returned no row");
  return row;
}
export async function revoke(q: Queryable, id: number): Promise<void> {
  const now = new Date().toISOString();
  await q.query("UPDATE sessions SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL", [now, id]);
}
