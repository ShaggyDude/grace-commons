// domain/visits.ts
//
// Regulated artifact: Visit
// SPEC: Not a Grace Commons atom — this is the regulated record of a subject's
// study visit. Visit records are the primary clinical data this portal tracks.
//
// Visit kinds are protocol-defined; this demo uses:
//   'screening', 'week_4', 'week_12', 'week_24', 'end_of_study'
//
// Invariants:
//   - recorded_by_actor_id and recorded_at capture attribution (Part 11)
//   - Visits are never deleted (regulatory permanence)
//   - visit_kind is free-form text (schema allows extension without migration)
//   - notes are optional but encouraged

import type { DB } from "../lib/db.ts";

export interface Visit {
  id: number;
  subject_id: number;
  visit_kind: string;
  recorded_by_actor_id: number;
  recorded_at: string;
  notes: string | null;
}

/** Find a visit by id. Returns null if not found. */
export function getById(db: DB, id: number): Visit | null {
  return (
    db.prepare("SELECT * FROM visits WHERE id = ?").get<Visit>(id) ?? null
  );
}

/** Return all visits for a given subject, oldest first. */
export function listBySubject(db: DB, subject_id: number): Visit[] {
  return db
    .prepare(
      "SELECT * FROM visits WHERE subject_id = ? ORDER BY recorded_at ASC",
    )
    .all<Visit>(subject_id);
}

/**
 * Create a new visit record.
 * Called only from composition.recordVisit — never directly from routes.
 */
export function create(
  db: DB,
  input: {
    subject_id: number;
    visit_kind: string;
    recorded_by_actor_id: number;
    notes?: string | null;
  },
): Visit {
  if (!input.visit_kind) {
    throw new Error("visits.create: visit_kind required");
  }
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO visits (subject_id, visit_kind, recorded_by_actor_id, recorded_at, notes)
       VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
    .get<Visit>(
      input.subject_id,
      input.visit_kind,
      input.recorded_by_actor_id,
      now,
      input.notes ?? null,
    );
  if (!row) throw new Error("visits.create: insert returned no row");
  return row;
}
