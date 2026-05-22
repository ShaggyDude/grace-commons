// domain/studies.ts
//
// Regulated artifact: Study
// SPEC: Not a Grace Commons atom — this is the regulated entity the audit trail
// attributes actions to. Studies are the top-level container for protocol activity.
//
// Invariants:
//   - protocol_number is UNIQUE (schema enforces it)
//   - created_at is set at creation and never updated
//   - Studies are never deleted (regulatory permanence)
//   - One study exists in the demo ('BCN-OX-201'), seeded at startup

import type { DB } from "../lib/db.ts";

export interface Study {
  id: number;
  protocol_number: string;
  title: string;
  created_at: string;
}

/** Find a study by id. Returns null if not found. */
export function getById(db: DB, id: number): Study | null {
  return (
    db.prepare("SELECT * FROM studies WHERE id = ?").get<Study>(id) ?? null
  );
}

/** Find a study by protocol number (e.g. 'BCN-OX-201'). Returns null if not found. */
export function getByProtocol(db: DB, protocol_number: string): Study | null {
  return (
    db
      .prepare("SELECT * FROM studies WHERE protocol_number = ?")
      .get<Study>(protocol_number) ?? null
  );
}

/** Return all studies, oldest first. */
export function listAll(db: DB): Study[] {
  return db
    .prepare("SELECT * FROM studies ORDER BY id ASC")
    .all<Study>();
}

/**
 * Create a new study record.
 * Called only from seed.ts in this demo; not exposed via any route.
 */
export function create(db: DB, protocol_number: string, title: string): Study {
  if (!protocol_number || !title) {
    throw new Error("studies.create: protocol_number and title required");
  }
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO studies (protocol_number, title, created_at)
       VALUES (?, ?, ?) RETURNING *`,
    )
    .get<Study>(protocol_number, title, now);
  if (!row) throw new Error("studies.create: insert returned no row");
  return row;
}
