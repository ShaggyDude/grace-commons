// domain/retention_policy.ts — Atom: Retention Window (single-row config)
// Library spec (atoms/compliance/retention-window.md): retention bounds how long
// records are presented; it never deletes — Part 11 forbids that.
import type { Queryable } from "../lib/db.ts";

export interface RetentionPolicy { id: number; days: number; enforce_on_read: boolean }

export async function get(q: Queryable): Promise<RetentionPolicy | null> {
  const [row] = await q.query<RetentionPolicy>("SELECT * FROM retention_policy WHERE id = 1");
  return row ?? null;
}
export async function ensure(q: Queryable, days = 2555, enforce_on_read = false): Promise<void> {
  await q.query(
    `INSERT INTO retention_policy (id, days, enforce_on_read) VALUES (1, $1, $2)
       ON CONFLICT (id) DO NOTHING`,
    [days, enforce_on_read],
  );
}
