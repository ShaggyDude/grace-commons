// Assignment atom — assign / recall / getForStep.
//
// recall() is intentionally idempotent on already-Recalled rows:
// returns 'not-active' without touching the row. This is the
// spec's trailing-decision contract — chain.ts never needs to
// special-case whether a cascade recall already fired.
// See BUILD_PLAN.md §4.5 and spec *Cascade-recall* subsection.

import type { Database } from "@db/sqlite";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Assignment = {
  assignment_id: number;
  task_ref: string;
  assignee_ref: string;
  assigned_at: string;
  state: "Active" | "Recalled";
  recalled_at: string | null;
};

// ---------------------------------------------------------------------------
// assign
// ---------------------------------------------------------------------------

/**
 * Creates an Active assignment linking a step to its approver.
 * Called by chain.ts inside initiate_chain's transaction.
 * Throws if a UNIQUE violation fires (duplicate assignment for the step).
 */
export function assign(
  db: Database,
  task_ref: string,
  assignee_ref: string,
): number {
  db.prepare(`
    INSERT INTO assignment (task_ref, assignee_ref, assigned_at, state)
    VALUES (?, ?, ?, 'Active')
  `).run(task_ref, assignee_ref, new Date().toISOString());

  return (db.prepare(
    "SELECT last_insert_rowid() AS id",
  ).get() as { id: number }).id;
}

// ---------------------------------------------------------------------------
// recall
// ---------------------------------------------------------------------------

/**
 * Transitions an Active assignment to Recalled.
 * Returns 'ok' on success, 'not-active' if already Recalled (idempotent).
 * chain.ts relies on this idempotency for cascade-recall of trailing steps.
 */
export function recall(
  db: Database,
  assignment_id: number,
): "ok" | "not-active" {
  const row = db.prepare(
    "SELECT state FROM assignment WHERE assignment_id = ?",
  ).get(assignment_id) as { state: string } | undefined;

  if (!row) return "not-active";
  if (row.state === "Recalled") return "not-active";

  db.prepare(`
    UPDATE assignment
    SET state = 'Recalled', recalled_at = ?
    WHERE assignment_id = ?
  `).run(new Date().toISOString(), assignment_id);

  return "ok";
}

// ---------------------------------------------------------------------------
// getForStep
// ---------------------------------------------------------------------------

/**
 * Returns the assignment_id for the given step_id, or undefined if none.
 * Used by chain.ts to resolve step_to_assignment before recalling.
 */
export function getForStep(
  db: Database,
  step_id: string,
): number | undefined {
  const row = db.prepare(
    "SELECT assignment_id FROM assignment WHERE task_ref = ?",
  ).get(step_id) as { assignment_id: number } | undefined;

  return row?.assignment_id;
}

// ---------------------------------------------------------------------------
// getActiveForActor
// ---------------------------------------------------------------------------

/**
 * Returns all Active assignments for a given actor.
 * Powers the in-tray query.
 */
export function getActiveForActor(
  db: Database,
  actor_ref: string,
): Assignment[] {
  return db.prepare(`
    SELECT * FROM assignment
    WHERE assignee_ref = ? AND state = 'Active'
  `).all(actor_ref) as Assignment[];
}
