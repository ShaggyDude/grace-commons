// domain/studies.ts — regulated artifact (not an atom): the trial protocol.
import type { Queryable } from "../lib/db.ts";

export interface Study { id: number; protocol_number: string; title: string; created_at: string }

export async function getByProtocol(q: Queryable, protocol_number: string): Promise<Study | null> {
  const [row] = await q.query<Study>("SELECT * FROM studies WHERE protocol_number = $1", [protocol_number]);
  return row ?? null;
}
export async function getById(q: Queryable, id: number): Promise<Study | null> {
  const [row] = await q.query<Study>("SELECT * FROM studies WHERE id = $1", [id]);
  return row ?? null;
}
export async function listAll(q: Queryable): Promise<Study[]> {
  return q.query<Study>("SELECT * FROM studies ORDER BY id ASC");
}
export async function create(q: Queryable, protocol_number: string, title: string): Promise<Study> {
  const now = new Date().toISOString();
  const [row] = await q.query<Study>(
    "INSERT INTO studies (protocol_number, title, created_at) VALUES ($1,$2,$3) RETURNING *",
    [protocol_number, title, now],
  );
  if (!row) throw new Error("studies.create: insert returned no row");
  return row;
}
