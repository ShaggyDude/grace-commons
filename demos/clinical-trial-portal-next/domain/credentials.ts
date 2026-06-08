// domain/credentials.ts — Atom: Credential
// Library spec (atoms/credential.md): binds secret material to a
// principal (actor); active until revoked. Password kind only for the demo.
import type { Queryable } from "../lib/db.ts";

export interface Credential {
  id: number; actor_id: number; kind: string; secret_hash: string;
  created_at: string; revoked_at: string | null;
}

export async function getActiveByActorId(q: Queryable, actor_id: number): Promise<Credential | null> {
  const [row] = await q.query<Credential>(
    "SELECT * FROM credentials WHERE actor_id = $1 AND revoked_at IS NULL ORDER BY id DESC LIMIT 1",
    [actor_id],
  );
  return row ?? null;
}
export async function create(q: Queryable, actor_id: number, kind: string, secret_hash: string): Promise<Credential> {
  const now = new Date().toISOString();
  const [row] = await q.query<Credential>(
    "INSERT INTO credentials (actor_id, kind, secret_hash, created_at) VALUES ($1,$2,$3,$4) RETURNING *",
    [actor_id, kind, secret_hash, now],
  );
  if (!row) throw new Error("credentials.create: insert returned no row");
  return row;
}
