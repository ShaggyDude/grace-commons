// Chain composition — the spec's Multi-Party Approval wired together.
//
// Owns: initiate_chain, withdraw_chain, approve_step, reject_step,
//       withdraw_step, read_chain.
//
// Transaction discipline: every mutating action opens one BEGIN IMMEDIATE
// via tx(). Permission checks run outside the transaction (no read needed).
// record_action() participates in the caller's transaction — no nested txns.
//
// The trailing flag and cascade sequencing are the critical correctness
// invariants. See BUILD_PLAN.md §7 and the pre-build analysis in chat.
//
// NOTE: audit_pending flag never fires in this implementation (single-txn
// discipline). The column exists per spec; see CORNERS.md.
// NOTE: retention_policy is accepted at initiate_chain but not stored on
// the chain row; step-level audit events use AUDIT_TRAIL_RETENTION_POLICY.
// See CORNERS.md.

import { db, tx } from "../db/client.ts";
import { getActor } from "./actor.ts";
import { permitted } from "./permissions.ts";
import * as Step from "./approval_step.ts";
import * as Assign from "./assignment.ts";
import { evaluate, type QuorumKind, type QuorumVector } from "./quorum.ts";
import { record_action, type RetentionPolicy } from "./audit_trail.ts";
import { ulid } from "@std/ulid";
import {
  APPLICATION_ACTOR_REF,
  APPROVER_SET_MINIMUM,
  APPROVER_SET_UNIQUENESS,
  AUDIT_TRAIL_RETENTION_POLICY,
  QUORUM_RULE_ALLOWED,
} from "../config.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChainError =
  | "permission-denied"
  | "not-known"
  | "not-pending"
  | "unauthorized"
  | "invalid-request"
  | "recording-failure";

export type ChainResult<T> = { ok: T } | { err: ChainError };

type ChainRow = {
  chain_id: string;
  subject_ref: string;
  scope: string;
  initiator_ref: string;
  quorum_kind: QuorumKind;
  quorum_m: number | null;
  initiated_at: string;
  state: string;
  chain_terminal_at: string | null;
  terminal_reason: string | null;
  audit_pending: number;
};

export type StepView = {
  step_id: string;
  chain_id: string;
  position: number;
  subject_ref: string;
  approver_ref: string;
  approver_display_name: string;
  submitter_ref: string;
  scope: string;
  submitted_at: string;
  reason: string | null;
  state: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  assignment: {
    assignment_id: number;
    assignee_ref: string;
    state: string;
    recalled_at: string | null;
  } | null;
};

export type ChainView = {
  chain_id: string;
  subject_ref: string;
  scope: string;
  initiator_ref: string;
  initiator_display_name: string;
  quorum_kind: string;
  quorum_m: number | null;
  initiated_at: string;
  state: string;
  chain_terminal_at: string | null;
  terminal_reason: string | null;
  audit_pending: boolean;
  steps: StepView[];
};

// ---------------------------------------------------------------------------
// DB helpers — all run inside an open transaction
// ---------------------------------------------------------------------------

function getChainRow(chain_id: string): ChainRow | undefined {
  return db.prepare("SELECT * FROM chain WHERE chain_id = ?")
    .get(chain_id) as ChainRow | undefined;
}

function getVector(chain_id: string): QuorumVector {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN state='Approved'  THEN 1 ELSE 0 END) AS a,
      SUM(CASE WHEN state='Rejected'  THEN 1 ELSE 0 END) AS r,
      SUM(CASE WHEN state='Withdrawn' THEN 1 ELSE 0 END) AS w,
      SUM(CASE WHEN state='Pending'   THEN 1 ELSE 0 END) AS p
    FROM approval_step WHERE chain_id = ?
  `).get(chain_id) as { a: number; r: number; w: number; p: number };
  return row;
}

function getPendingSteps(chain_id: string): Array<{ step_id: string; submitter_ref: string }> {
  return db.prepare(`
    SELECT step_id, submitter_ref FROM approval_step
    WHERE chain_id = ? AND state = 'Pending'
    ORDER BY position
  `).all(chain_id) as Array<{ step_id: string; submitter_ref: string }>;
}

function getActiveAssignmentIds(chain_id: string): number[] {
  const rows = db.prepare(`
    SELECT a.assignment_id FROM assignment a
    JOIN approval_step s ON s.step_id = a.task_ref
    WHERE s.chain_id = ? AND a.state = 'Active'
  `).all(chain_id) as Array<{ assignment_id: number }>;
  return rows.map((r) => r.assignment_id);
}

// ---------------------------------------------------------------------------
// handleTerminalTransition — shared by approve/reject/withdraw step handlers
//
// Sequencing (critical — do not reorder):
//   1. Collect pending steps + active assignment IDs (before any writes)
//   2. If Withdrawn: cascade-withdraw each pending step + emit step_withdrawn
//   3. Recall all active assignments (idempotent — safe even if step 2 fired)
//   4. Update chain state
//   5. Emit chain_resolved (always carries recalled_step_ids, even if empty)
// ---------------------------------------------------------------------------

function handleTerminalTransition(
  chain_id: string,
  chain: ChainRow,
  newState: "Approved" | "Rejected" | "Withdrawn",
  retentionPolicy: RetentionPolicy,
): void {
  const appActor = getActor(APPLICATION_ACTOR_REF)!;
  const now = new Date().toISOString();

  // Step 1: collect BEFORE writing
  const pendingSteps = getPendingSteps(chain_id);
  const activeAssignmentIds = getActiveAssignmentIds(chain_id);

  const terminalReason = newState === "Approved"
    ? "quorum reached"
    : newState === "Rejected"
    ? "quorum unreachable: rejection(s) present"
    : "quorum unreachable: withdrawal(s) only; no rejections";

  // Step 2: cascade-withdraw pending steps only when chain goes Withdrawn
  // (Approved and Rejected leave trailing pending steps as-is per spec)
  if (newState === "Withdrawn") {
    const cascadeReason = "chain withdrawn by cascade: quorum no longer reachable";
    for (const { step_id, submitter_ref } of pendingSteps) {
      // withdraw() enforces submitter_ref === withdrawn_by via SQL CHECK
      Step.withdraw(db, step_id, submitter_ref, cascadeReason);
      const initiatorActor = getActor(submitter_ref)!;
      record_action({
        action_ref: "step_withdrawn",
        actor_ref: submitter_ref,
        credential_secret: initiatorActor.credential_secret,
        chain_id,
        step_id,
        data: { reason: cascadeReason, trailing: false },
        retention_policy: retentionPolicy,
      }, db);
    }
  }

  // Step 3: recall all active assignments (idempotent)
  for (const assignment_id of activeAssignmentIds) {
    Assign.recall(db, assignment_id);
  }

  // Step 4: update chain state
  db.prepare(`
    UPDATE chain
    SET state = ?, chain_terminal_at = ?, terminal_reason = ?
    WHERE chain_id = ?
  `).run(newState, now, terminalReason, chain_id);

  // Step 5: chain_resolved — recalled_step_ids always present (spec requirement)
  const recalledStepIds = pendingSteps.map((s) => s.step_id);
  record_action({
    action_ref: "chain_resolved",
    actor_ref: APPLICATION_ACTOR_REF,
    credential_secret: appActor.credential_secret,
    chain_id,
    data: {
      state: newState,
      reason: terminalReason,
      recalled_step_ids: recalledStepIds,
      cascade_partial: false, // single-txn discipline; see CORNERS.md
    },
    retention_policy: retentionPolicy,
  }, db);
}

// ---------------------------------------------------------------------------
// 7.1  initiate_chain
// ---------------------------------------------------------------------------

export type InitiateParams = {
  actor_ref: string;
  subject_ref: string;
  scope: string;
  approver_set: string[];
  quorum_kind: QuorumKind;
  quorum_m?: number | null;
  reason?: string | null;
  retention_policy?: RetentionPolicy;
};

export function initiate_chain(
  params: InitiateParams,
): ChainResult<{ chain_id: string }> {
  const {
    actor_ref,
    subject_ref,
    scope,
    approver_set,
    quorum_kind,
    quorum_m = null,
    reason = null,
    retention_policy = AUDIT_TRAIL_RETENTION_POLICY,
  } = params;

  // Permission check — outside transaction
  if (permitted(actor_ref, "chains:initiate") === "denied") {
    return { err: "permission-denied" };
  }

  // Structural validation — outside transaction
  if (!subject_ref.trim() || !scope.trim()) return { err: "invalid-request" };
  if (approver_set.length < APPROVER_SET_MINIMUM) return { err: "invalid-request" };
  if (!QUORUM_RULE_ALLOWED.includes(quorum_kind)) return { err: "invalid-request" };
  if (quorum_kind === "M-of-N") {
    if (quorum_m == null || quorum_m < 1 || quorum_m > approver_set.length) {
      return { err: "invalid-request" };
    }
  }
  if (APPROVER_SET_UNIQUENESS) {
    const unique = new Set(approver_set);
    if (unique.size !== approver_set.length) return { err: "invalid-request" };
  }

  const initiatorActor = getActor(actor_ref);
  if (!initiatorActor) return { err: "invalid-request" };

  try {
    return tx(() => {
      const chain_id = ulid();
      const now = new Date().toISOString();

      // Insert chain
      db.prepare(`
        INSERT INTO chain
          (chain_id, subject_ref, scope, initiator_ref, quorum_kind,
           quorum_m, initiated_at, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')
      `).run(chain_id, subject_ref, scope, actor_ref, quorum_kind, quorum_m ?? null, now);

      // Insert steps + assignments
      const stepIds: string[] = [];
      for (let i = 0; i < approver_set.length; i++) {
        const result = Step.submit(db, {
          chain_id,
          position: i,
          subject_ref,
          approver_ref: approver_set[i],
          submitter_ref: actor_ref,
          scope,
          reason,
        });
        if ("err" in result) throw new Error(result.err);
        const { step_id } = result.ok;
        stepIds.push(step_id);
        Assign.assign(db, step_id, approver_set[i]);
      }

      // Audit
      record_action({
        action_ref: "chain_initiated",
        actor_ref,
        credential_secret: initiatorActor.credential_secret,
        chain_id,
        data: { subject_ref, scope, approver_set, quorum_kind, quorum_m, reason },
        retention_policy,
      }, db);

      return { ok: { chain_id } };
    });
  } catch {
    return { err: "recording-failure" };
  }
}

// ---------------------------------------------------------------------------
// 7.2  withdraw_chain
// ---------------------------------------------------------------------------

export function withdraw_chain(
  actor_ref: string,
  chain_id: string,
  reason: string,
): ChainResult<{ state: "Withdrawn" }> {
  if (!reason.trim()) return { err: "invalid-request" };

  // Permission check — outside transaction
  if (permitted(actor_ref, "chains:withdraw") === "denied") {
    return { err: "permission-denied" };
  }

  const actorRow = getActor(actor_ref);
  if (!actorRow) return { err: "invalid-request" };

  try {
    return tx(() => {
      const chain = getChainRow(chain_id);
      if (!chain) return { err: "not-known" };
      if (chain.state !== "Pending") return { err: "not-pending" };
      if (chain.initiator_ref !== actor_ref) return { err: "unauthorized" };

      const now = new Date().toISOString();

      // Cascade-withdraw each pending step + recall its assignment + audit
      const pendingSteps = getPendingSteps(chain_id);
      for (const { step_id } of pendingSteps) {
        Step.withdraw(db, step_id, actor_ref, reason);
        const assignmentId = Assign.getForStep(db, step_id);
        if (assignmentId != null) Assign.recall(db, assignmentId);
        record_action({
          action_ref: "step_withdrawn",
          actor_ref,
          credential_secret: actorRow.credential_secret,
          chain_id,
          step_id,
          data: { reason, trailing: false },
          retention_policy: AUDIT_TRAIL_RETENTION_POLICY,
        }, db);
      }

      // Update chain
      db.prepare(`
        UPDATE chain
        SET state = 'Withdrawn', chain_terminal_at = ?, terminal_reason = ?
        WHERE chain_id = ?
      `).run(now, reason, chain_id);

      // Audit chain withdrawal
      record_action({
        action_ref: "chain_withdrawn",
        actor_ref,
        credential_secret: actorRow.credential_secret,
        chain_id,
        data: { reason },
        retention_policy: AUDIT_TRAIL_RETENTION_POLICY,
      }, db);

      return { ok: { state: "Withdrawn" } };
    });
  } catch {
    return { err: "recording-failure" };
  }
}

// ---------------------------------------------------------------------------
// 7.3 / 7.4 / 7.5  shared step-decision handler
// ---------------------------------------------------------------------------

type StepDecisionOutcome = {
  step_state: string;
  chain_state: string;
  trailing: boolean;
};

function stepDecision(
  actor_ref: string,
  chain_id: string,
  step_id: string,
  decisionFn: (step_id: string, decided_by: string) => Step.Result<string>,
  auditActionRef: "step_approved" | "step_rejected" | "step_withdrawn",
  reason: string | null,
): ChainResult<StepDecisionOutcome> {
  const actorRow = getActor(actor_ref);
  if (!actorRow) return { err: "invalid-request" };

  try {
    return tx(() => {
      // Resolve step + chain
      const step = Step.read(db, step_id);
      if (!step || step.chain_id !== chain_id) return { err: "not-known" };

      const chain = getChainRow(chain_id)!;
      const trailing = chain.state !== "Pending";

      // Apply the step-level decision
      const result = decisionFn(step_id, actor_ref);
      if ("err" in result) {
        // Map atom errors to chain errors
        return { err: result.err as ChainError };
      }

      // Recall this step's assignment (idempotent)
      const assignmentId = Assign.getForStep(db, step_id);
      if (assignmentId != null) Assign.recall(db, assignmentId);

      // Audit the step decision
      record_action({
        action_ref: auditActionRef,
        actor_ref,
        credential_secret: actorRow.credential_secret,
        chain_id,
        step_id,
        data: { reason, trailing },
        retention_policy: AUDIT_TRAIL_RETENTION_POLICY,
      }, db);

      // Chain re-evaluation — skipped entirely if trailing
      if (!trailing) {
        const vector = getVector(chain_id);
        const newState = evaluate(chain.quorum_kind, chain.quorum_m, vector);
        if (newState !== "Pending") {
          handleTerminalTransition(
            chain_id,
            chain,
            newState as "Approved" | "Rejected" | "Withdrawn",
            AUDIT_TRAIL_RETENTION_POLICY,
          );
        }
      }

      // Read back final states
      const updatedStep = Step.read(db, step_id)!;
      const updatedChain = getChainRow(chain_id)!;

      return {
        ok: {
          step_state: updatedStep.state,
          chain_state: updatedChain.state,
          trailing,
        },
      };
    });
  } catch {
    return { err: "recording-failure" };
  }
}

// ---------------------------------------------------------------------------
// 7.3  approve_step
// ---------------------------------------------------------------------------

export function approve_step(
  actor_ref: string,
  chain_id: string,
  step_id: string,
  reason?: string | null,
): ChainResult<StepDecisionOutcome> {
  return stepDecision(
    actor_ref,
    chain_id,
    step_id,
    (sid, by) => Step.approve(db, sid, by, reason),
    "step_approved",
    reason ?? null,
  );
}

// ---------------------------------------------------------------------------
// 7.4  reject_step
// ---------------------------------------------------------------------------

export function reject_step(
  actor_ref: string,
  chain_id: string,
  step_id: string,
  reason: string,
): ChainResult<StepDecisionOutcome> {
  if (!reason.trim()) return { err: "invalid-request" };
  return stepDecision(
    actor_ref,
    chain_id,
    step_id,
    (sid, by) => Step.reject(db, sid, by, reason),
    "step_rejected",
    reason,
  );
}

// ---------------------------------------------------------------------------
// 7.5  withdraw_step
// ---------------------------------------------------------------------------

export function withdraw_step(
  actor_ref: string,
  chain_id: string,
  step_id: string,
  reason: string,
): ChainResult<StepDecisionOutcome> {
  if (!reason.trim()) return { err: "invalid-request" };
  return stepDecision(
    actor_ref,
    chain_id,
    step_id,
    (sid, by) => Step.withdraw(db, sid, by, reason),
    "step_withdrawn",
    reason,
  );
}

// ---------------------------------------------------------------------------
// 7.6  read_chain
// ---------------------------------------------------------------------------

export type ReadChainQuery = Partial<{
  chain_id: string;
  subject_ref: string;
  scope: string;
  initiator_ref: string;
  state: string;
  "initiated_at[after]": string;
  "initiated_at[before]": string;
  "chain_terminal_at[after]": string;
  "chain_terminal_at[before]": string;
}>;

const ALLOWED_QUERY_KEYS = new Set([
  "chain_id", "subject_ref", "scope", "initiator_ref", "state",
  "initiated_at[after]", "initiated_at[before]",
  "chain_terminal_at[after]", "chain_terminal_at[before]",
]);

export function read_chain(
  actor_ref: string,
  query: ReadChainQuery = {},
): ChainResult<ChainView[]> {
  if (permitted(actor_ref, "chains:read") === "denied") {
    return { err: "permission-denied" };
  }

  for (const key of Object.keys(query)) {
    if (!ALLOWED_QUERY_KEYS.has(key)) return { err: "invalid-request" };
  }

  // Build dynamic WHERE clause
  const conditions: string[] = [];
  const bindings: string[] = [];

  if (query.chain_id)      { conditions.push("c.chain_id = ?");      bindings.push(query.chain_id); }
  if (query.subject_ref)   { conditions.push("c.subject_ref = ?");   bindings.push(query.subject_ref); }
  if (query.scope)         { conditions.push("c.scope = ?");         bindings.push(query.scope); }
  if (query.initiator_ref) { conditions.push("c.initiator_ref = ?"); bindings.push(query.initiator_ref); }
  if (query.state)         { conditions.push("c.state = ?");         bindings.push(query.state); }
  if (query["initiated_at[after]"])         { conditions.push("c.initiated_at >= ?");         bindings.push(query["initiated_at[after]"]); }
  if (query["initiated_at[before]"])        { conditions.push("c.initiated_at <= ?");         bindings.push(query["initiated_at[before]"]); }
  if (query["chain_terminal_at[after]"])    { conditions.push("c.chain_terminal_at >= ?");    bindings.push(query["chain_terminal_at[after]"]); }
  if (query["chain_terminal_at[before]"])   { conditions.push("c.chain_terminal_at <= ?");    bindings.push(query["chain_terminal_at[before]"]); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const chains = db.prepare(`
    SELECT c.*, a.display_name AS initiator_display_name
    FROM chain c
    JOIN actor a ON a.actor_ref = c.initiator_ref
    ${where}
    ORDER BY c.initiated_at DESC
  `).all(...bindings) as Array<ChainRow & { initiator_display_name: string }>;

  const views: ChainView[] = chains.map((chain) => {
    const rawSteps = db.prepare(`
      SELECT s.*, a.display_name AS approver_display_name
      FROM approval_step s
      JOIN actor a ON a.actor_ref = s.approver_ref
      WHERE s.chain_id = ?
      ORDER BY s.position
    `).all(chain.chain_id) as Array<
      Step.ApprovalStep & { approver_display_name: string }
    >;

    const steps: StepView[] = rawSteps.map((s) => {
      const assignment = db.prepare(
        "SELECT assignment_id, assignee_ref, state, recalled_at FROM assignment WHERE task_ref = ?",
      ).get(s.step_id) as {
        assignment_id: number;
        assignee_ref: string;
        state: string;
        recalled_at: string | null;
      } | undefined;

      return {
        step_id: s.step_id,
        chain_id: s.chain_id,
        position: s.position,
        subject_ref: s.subject_ref,
        approver_ref: s.approver_ref,
        approver_display_name: s.approver_display_name,
        submitter_ref: s.submitter_ref,
        scope: s.scope,
        submitted_at: s.submitted_at,
        reason: s.reason,
        state: s.state,
        decided_by: s.decided_by,
        decided_at: s.decided_at,
        decision_reason: s.decision_reason,
        assignment: assignment ?? null,
      };
    });

    return {
      chain_id: chain.chain_id,
      subject_ref: chain.subject_ref,
      scope: chain.scope,
      initiator_ref: chain.initiator_ref,
      initiator_display_name: chain.initiator_display_name,
      quorum_kind: chain.quorum_kind,
      quorum_m: chain.quorum_m,
      initiated_at: chain.initiated_at,
      state: chain.state,
      chain_terminal_at: chain.chain_terminal_at,
      terminal_reason: chain.terminal_reason,
      audit_pending: chain.audit_pending === 1,
      steps,
    };
  });

  return { ok: views };
}
