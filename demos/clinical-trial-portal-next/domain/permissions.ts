// domain/permissions.ts — Atom: Permissions (registry of permission codes)
// Library spec (atoms/permissions.md): code is unique; rows seeded at
// startup, never created at runtime; absence of a grant is denial.
import type { Queryable } from "../lib/db.ts";

export interface Permission { id: number; code: string; label: string }

export async function getByCode(q: Queryable, code: string): Promise<Permission | null> {
  const [row] = await q.query<Permission>("SELECT * FROM permissions WHERE code = $1", [code]);
  return row ?? null;
}
export async function getById(q: Queryable, id: number): Promise<Permission | null> {
  const [row] = await q.query<Permission>("SELECT * FROM permissions WHERE id = $1", [id]);
  return row ?? null;
}
export async function listAll(q: Queryable): Promise<Permission[]> {
  return q.query<Permission>("SELECT * FROM permissions ORDER BY id ASC");
}
export async function create(q: Queryable, code: string, label: string): Promise<Permission> {
  if (!code || !label) throw new Error("permissions.create: code and label required");
  const [row] = await q.query<Permission>(
    "INSERT INTO permissions (code, label) VALUES ($1,$2) RETURNING *",
    [code, label],
  );
  if (!row) throw new Error("permissions.create: insert returned no row");
  return row;
}
