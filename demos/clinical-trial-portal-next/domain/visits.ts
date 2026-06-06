// domain/visits.ts — regulated artifact: a recorded study visit for a subject.
import type { Queryable } from "../lib/db.ts";

export interface Visit {
  id: number; subject_id: number; visit_kind: string;
  recorded_by_actor_id: number; recorded_at: string; notes: string | null;
}

export async function listBySubject(q: Queryable, subject_id: number): Promise<Visit[]> {
  return q.query<Visit>("SELECT * FROM visits WHERE subject_id = $1 ORDER BY id ASC", [subject_id]);
}
export async function create(
  q: Queryable,
  input: { subject_id: number; visit_kind: string; recorded_by_actor_id: number; notes?: string | null },
): Promise<Visit> {
  const now = new Date().toISOString();
  const [row] = await q.query<Visit>(
    `INSERT INTO visits (subject_id, visit_kind, recorded_by_actor_id, recorded_at, notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [input.subject_id, input.visit_kind, input.recorded_by_actor_id, now, input.notes ?? null],
  );
  if (!row) throw new Error("visits.create: insert returned no row");
  return row;
}
