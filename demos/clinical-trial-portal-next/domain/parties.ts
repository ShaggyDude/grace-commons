// domain/parties.ts — Atom: Party Identity
// Library spec (atoms/compliance/party-identity.md): a Party is a durable
// identity (email + display name); email is unique; rows are never deleted.
// Ported from render 1 (async + Postgres).
import type { Queryable } from "../lib/db.ts";

export interface Party { id: number; email: string; display_name: string; created_at: string }

export async function getByEmail(q: Queryable, email: string): Promise<Party | null> {
  const [row] = await q.query<Party>("SELECT * FROM parties WHERE email = $1", [email]);
  return row ?? null;
}
export async function getById(q: Queryable, id: number): Promise<Party | null> {
  const [row] = await q.query<Party>("SELECT * FROM parties WHERE id = $1", [id]);
  return row ?? null;
}
export async function listAll(q: Queryable): Promise<Party[]> {
  return q.query<Party>("SELECT * FROM parties ORDER BY id ASC");
}
export async function create(q: Queryable, email: string, display_name: string): Promise<Party> {
  if (!email || !display_name) throw new Error("parties.create: email and display_name required");
  const now = new Date().toISOString();
  const [row] = await q.query<Party>(
    "INSERT INTO parties (email, display_name, created_at) VALUES ($1,$2,$3) RETURNING *",
    [email, display_name, now],
  );
  if (!row) throw new Error("parties.create: insert returned no row");
  return row;
}
