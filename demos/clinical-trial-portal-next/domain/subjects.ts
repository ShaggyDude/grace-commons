// domain/subjects.ts — regulated artifact: a trial subject (synthetic code only).
import type { Queryable } from "../lib/db.ts";

export interface Subject {
  id: number; study_id: number; subject_code: string; status: string;
  enrolled_by_actor_id: number; enrolled_at: string; notes: string | null;
}

export async function getById(q: Queryable, id: number): Promise<Subject | null> {
  const [row] = await q.query<Subject>("SELECT * FROM subjects WHERE id = $1", [id]);
  return row ?? null;
}
export async function listByStudy(q: Queryable, study_id: number): Promise<Subject[]> {
  return q.query<Subject>("SELECT * FROM subjects WHERE study_id = $1 ORDER BY id ASC", [study_id]);
}
export async function listAll(q: Queryable): Promise<Subject[]> {
  return q.query<Subject>("SELECT * FROM subjects ORDER BY id ASC");
}
/** Next sequential code for a prefix, e.g. "BCN" → "BCN-001", "BCN-002". */
export async function nextSubjectCode(q: Queryable, prefix: string): Promise<string> {
  const [row] = await q.query<{ c: string | number }>(
    "SELECT COUNT(*) AS c FROM subjects WHERE subject_code LIKE $1",
    [`${prefix}-%`],
  );
  const n = Number(row?.c ?? 0) + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}
export async function create(
  q: Queryable,
  input: { study_id: number; subject_code: string; enrolled_by_actor_id: number; notes?: string | null },
): Promise<Subject> {
  const now = new Date().toISOString();
  const [row] = await q.query<Subject>(
    `INSERT INTO subjects (study_id, subject_code, status, enrolled_by_actor_id, enrolled_at, notes)
     VALUES ($1,$2,'screening',$3,$4,$5) RETURNING *`,
    [input.study_id, input.subject_code, input.enrolled_by_actor_id, now, input.notes ?? null],
  );
  if (!row) throw new Error("subjects.create: insert returned no row");
  return row;
}
