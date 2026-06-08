// domain/actors.ts — Atom: Actor Identity
// Library spec (atoms/actor-identity.md): an Actor is a credentialed
// identity bound to a Party; opaque system id; never deleted.
import type { Queryable } from "../lib/db.ts";

export interface Actor { id: number; party_id: number; created_at: string }

export async function getById(q: Queryable, id: number): Promise<Actor | null> {
  const [row] = await q.query<Actor>("SELECT * FROM actors WHERE id = $1", [id]);
  return row ?? null;
}
export async function getByPartyId(q: Queryable, party_id: number): Promise<Actor | null> {
  const [row] = await q.query<Actor>("SELECT * FROM actors WHERE party_id = $1", [party_id]);
  return row ?? null;
}
export async function listAll(q: Queryable): Promise<Actor[]> {
  return q.query<Actor>("SELECT * FROM actors ORDER BY id ASC");
}
export async function create(q: Queryable, party_id: number): Promise<Actor> {
  const now = new Date().toISOString();
  const [row] = await q.query<Actor>(
    "INSERT INTO actors (party_id, created_at) VALUES ($1,$2) RETURNING *",
    [party_id, now],
  );
  if (!row) throw new Error("actors.create: insert returned no row");
  return row;
}
