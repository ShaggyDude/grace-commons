// domain/retention_policy.ts
//
// Atom: Retention Window
//
// Library spec (quoted from grace-commons/atoms/retention-window.md):
//   "Retention Window is the compliance atom that enforces the structural rule
//    that a record must be kept for a minimum period and then becomes eligible
//    for destruction. [...] Retention does NOT delete rows. Hard deletion would
//    break the hash chain and undermine tamper evidence. Part 11 permits
//    filtering for operational presentation but requires the record itself to
//    survive its retention window intact."
//
// Implementation:
//   A single-row configuration table (id = 1 enforced by schema CHECK).
//   enforce_on_read = 1 means the /audit route filters out events older than
//   `days`. The default is enforce_on_read = 1 to match production posture
//   (Part 11 filter active by default; "show all" is the explicit override).
//   For the demo's seeded events — all recent — the visible effect is zero,
//   so the walkthrough still sees the full chain; the difference shows up
//   only once events accumulate past the retention window.
//
// Invariants:
//   - Exactly one row exists (schema: PRIMARY KEY CHECK (id = 1))
//   - days defaults to 2555 (7 years per FDA 21 CFR Part 11)
//   - Retention does NOT delete rows — filtering is presentational only
//   - toggle is surfaced as a UI affordance on /audit (the pedagogical seam)

import type { DB } from "../lib/db.ts";

export interface RetentionPolicy {
  id: number;
  days: number;
  enforce_on_read: boolean;
}

/** Return the single retention policy row. Returns null if not yet seeded.
 *
 * SQLite stores BOOLEAN as INTEGER (0/1). We normalise to JS boolean here
 * so callers can use === true/false without worrying about the storage type.
 */
export function getPolicy(db: DB): RetentionPolicy | null {
  const raw = db
    .prepare("SELECT * FROM retention_policy WHERE id = 1")
    .get<{ id: number; days: number; enforce_on_read: number }>() ?? null;
  if (!raw) return null;
  return { id: raw.id, days: raw.days, enforce_on_read: raw.enforce_on_read !== 0 };
}

/**
 * Set the retention window in days.
 * Updates the single-row table; creates it if not yet seeded.
 */
export function setDays(db: DB, days: number): void {
  db.prepare(
    `INSERT INTO retention_policy (id, days)
     VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET days = excluded.days`,
  ).run(days);
}

/** Toggle the enforce_on_read flag. */
export function toggleEnforcement(db: DB): void {
  db.prepare(
    `UPDATE retention_policy SET enforce_on_read = NOT enforce_on_read WHERE id = 1`,
  ).run();
}

/**
 * Upsert the default policy row.
 * Called by seed.ts; safe to call multiple times (idempotent).
 */
export function ensureDefault(db: DB): void {
  db.prepare(
    `INSERT INTO retention_policy (id, days, enforce_on_read)
     VALUES (1, 2555, 1)
     ON CONFLICT(id) DO NOTHING`,
  ).run();
}
