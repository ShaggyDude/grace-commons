// Approval Step atom — submit / approve / reject / withdraw / read.
//
// Every function takes `db` explicitly so chain.ts can call them inside
// its own BEGIN IMMEDIATE transaction without a nested transaction.
// Nothing in this module knows about chains.
//
// SQL CHECKs and triggers (schema.sql §4.4) enforce the structural
// invariants; this module enforces the behavioural invariants that
// CHECKs cannot express (existence, state guards, actor identity).

import type { Database } from "@db/sqlite";
import { ulid } from "@std/ulid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepState = "Pending" | "Approved" | "Rejected" | "Withdrawn";

export type ApprovalStep = {
  step_id: string;
  chain_id: string;
  position: number;
  subject_ref: string;
  approver_ref: string;
  submitter_ref: string;
  scope: string;
  submitted_at: string;
  reason: string | null;
  state: StepState;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
};

export type RejectionToken =
  | "invalid-request"
  | "not-known"
  | "not-pending"
  | "unauthorized"
  | "storage-failure";

export type Result<T> = { ok: T } | { err: RejectionToken };

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

export function read(db: Database, step_id: string): ApprovalStep | undefined {
  return db.prepare(
    "SELECT * FROM approval_step WHERE step_id = ?",
  ).get(step_id) as ApprovalStep | undefined;
}

// ---------------------------------------------------------------------------
// submit
// ---------------------------------------------------------------------------

export type SubmitParams = {
  chain_id: string;
  position: number;
  subject_ref: string;
  approver_ref: string;
  submitter_ref: string;
  scope: string;
  reason?: string | null;
};

/**
 * Creates a new Pending approval step.
 * Called by chain.ts inside initiate_chain's transaction.
 */
export function submit(
  db: Database,
  params: SubmitParams,
): Result<{ step_id: string }> {
  const { chain_id, position, subject_ref, approver_ref, submitter_ref, scope, reason } = params;

  if (!subject_ref.trim() || !approver_ref.trim() || !submitter_ref.trim() || !scope.trim()) {
    return { err: "invalid-request" };
  }

  const step_id = ulid();
  const submitted_at = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO approval_step
        (step_id, chain_id, position, subject_ref, approver_ref,
         submitter_ref, scope, submitted_at, reason, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
    `).run(step_id, chain_id, position, subject_ref, approver_ref,
           submitter_ref, scope, submitted_at, reason ?? null);
  } catch {
    return { err: "storage-failure" };
  }

  return { ok: { step_id } };
}

// ---------------------------------------------------------------------------
// approve
// ---------------------------------------------------------------------------

/**
 * Transitions a Pending step to Approved.
 * Invariant 4: decided_by must equal approver_ref.
 */
export function approve(
  db: Database,
  step_id: string,
  decided_by: string,
  reason?: string | null,
): Result<"approved"> {
  const step = read(db, step_id);
  if (!step) return { err: "not-known" };
  if (step.state !== "Pending") return { err: "not-pending" };
  if (step.approver_ref !== decided_by) return { err: "unauthorized" };

  try {
    db.prepare(`
      UPDATE approval_step
      SET state = 'Approved', decided_by = ?, decided_at = ?, decision_reason = ?
      WHERE step_id = ?
    `).run(decided_by, new Date().toISOString(), reason ?? null, step_id);
  } catch {
    return { err: "storage-failure" };
  }

  return { ok: "approved" };
}

// ---------------------------------------------------------------------------
// reject
// ---------------------------------------------------------------------------

/**
 * Transitions a Pending step to Rejected.
 * Invariant 4: decided_by must equal approver_ref.
 * Invariant 6: reason is required.
 */
export function reject(
  db: Database,
  step_id: string,
  decided_by: string,
  reason: string,
): Result<"rejected_outcome"> {
  if (!reason.trim()) return { err: "invalid-request" };

  const step = read(db, step_id);
  if (!step) return { err: "not-known" };
  if (step.state !== "Pending") return { err: "not-pending" };
  if (step.approver_ref !== decided_by) return { err: "unauthorized" };

  try {
    db.prepare(`
      UPDATE approval_step
      SET state = 'Rejected', decided_by = ?, decided_at = ?, decision_reason = ?
      WHERE step_id = ?
    `).run(decided_by, new Date().toISOString(), reason, step_id);
  } catch {
    return { err: "storage-failure" };
  }

  return { ok: "rejected_outcome" };
}

// ---------------------------------------------------------------------------
// withdraw (step-level)
// ---------------------------------------------------------------------------

/**
 * Transitions a Pending step to Withdrawn.
 * Invariant 5: withdrawn_by must equal submitter_ref (the chain initiator).
 * reason is required.
 */
export function withdraw(
  db: Database,
  step_id: string,
  withdrawn_by: string,
  reason: string,
): Result<"withdrawn"> {
  if (!reason.trim()) return { err: "invalid-request" };

  const step = read(db, step_id);
  if (!step) return { err: "not-known" };
  if (step.state !== "Pending") return { err: "not-pending" };
  if (step.submitter_ref !== withdrawn_by) return { err: "unauthorized" };

  try {
    db.prepare(`
      UPDATE approval_step
      SET state = 'Withdrawn', decided_by = ?, decided_at = ?, decision_reason = ?
      WHERE step_id = ?
    `).run(withdrawn_by, new Date().toISOString(), reason, step_id);
  } catch {
    return { err: "storage-failure" };
  }

  return { ok: "withdrawn" };
}
