// domain/subjects.ts
//
// Regulated artifact: Subject
// SPEC: Not a Grace Commons atom — this is the regulated entity representing a
// trial participant. Subject codes are synthetic (e.g. 'BCN-014'); no PII is
// stored (Decision #7 in the plan).
//
// Invariants:
//   - subject_code is UNIQUE (schema enforces it); format is protocol-defined
//   - status progresses: 'screening' → 'enrolled' → 'withdrawn' | 'completed'
//   - enrolled_by_actor_id and enrolled_at capture attribution (Part 11 requirement)
//   - Subjects are never deleted (regulatory permanence)
//   - No PII fields: no name, no date of birth, only the synthetic subject code

import type { DB } from "../lib/db.ts";

export interface Subject {
  id: number;
  study_id: number;
  subject_code: string;
  status: "screening" | "enrolled" | "withdrawn" | "completed";
  enrolled_by_actor_id: number;
  enrolled_at: string;
  notes: string | null;
}

/** Find a subject by id. Returns null if not found. */
export function getById(db: DB, id: number): Subject | null {
  return (
    db.prepare("SELECT * FROM subjects WHERE id = ?").get<Subject>(id) ?? null
  );
}

/** Find a subject by its code (e.g. 'BCN-014'). Returns null if not found. */
export function getByCode(db: DB, subject_code: string): Subject | null {
  return (
    db
      .prepare("SELECT * FROM subjects WHERE subject_code = ?")
      .get<Subject>(subject_code) ?? null
  );
}

/** Return all subjects for a given study, oldest first. */
export function listByStudy(db: DB, study_id: number): Subject[] {
  return db
    .prepare(
      "SELECT * FROM subjects WHERE study_id = ? ORDER BY id ASC",
    )
    .all<Subject>(study_id);
}

/**
 * Return the next sequential subject code for the given study prefix.
 * Scans existing subject_codes for the highest numeric suffix and increments.
 * Example: existing ['BCN-001', 'BCN-013'] → 'BCN-014'
 */
export function nextSubjectCode(db: DB, prefix: string): string {
  const rows = db
    .prepare(
      "SELECT subject_code FROM subjects WHERE subject_code LIKE ? ORDER BY subject_code DESC",
    )
    .all<{ subject_code: string }>(`${prefix}-%`);

  let max = 0;
  for (const { subject_code } of rows) {
    const suffix = subject_code.slice(prefix.length + 1);
    const n = parseInt(suffix, 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Create a new subject record with status 'screening'.
 * Called only from composition.enrollSubject — never directly from routes.
 */
export function create(
  db: DB,
  input: {
    study_id: number;
    subject_code: string;
    enrolled_by_actor_id: number;
    notes?: string | null;
  },
): Subject {
  if (!input.subject_code) {
    throw new Error("subjects.create: subject_code required");
  }
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO subjects
         (study_id, subject_code, status, enrolled_by_actor_id, enrolled_at, notes)
       VALUES (?, ?, 'screening', ?, ?, ?) RETURNING *`,
    )
    .get<Subject>(
      input.study_id,
      input.subject_code,
      input.enrolled_by_actor_id,
      now,
      input.notes ?? null,
    );
  if (!row) throw new Error("subjects.create: insert returned no row");
  return row;
}

/**
 * Update a subject's status.
 * Called only from composition functions — never directly from routes.
 */
export function updateStatus(
  db: DB,
  id: number,
  status: "screening" | "enrolled" | "withdrawn" | "completed",
): void {
  db.prepare("UPDATE subjects SET status = ? WHERE id = ?").run(status, id);
}
