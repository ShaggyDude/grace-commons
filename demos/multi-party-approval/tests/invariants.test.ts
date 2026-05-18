// invariants.test.ts — One test per application-level invariant (BUILD_PLAN.md §12).
//
// Data strategy
// ─────────────
// All tests share a single fresh in-memory Database (testDb) built at
// module load time.  It is populated using atom-level domain functions
// (approval_step.ts, assignment.ts, audit_trail.ts) and direct SQL so that
// the test file is fully self-contained and does not depend on the seeded
// demo DB or the chain.ts / permissions.ts singletons (which are hardwired
// to the shared client.ts db handle).
//
// Invariants 7 and 8 (SQL trigger enforcement) use additional per-test
// in-memory DBs because they need to attempt mutations that would break the
// shared DB's state.
//
// Invariant 6 — the behavioral trailing-decision flow (chain.ts emits an
// audit row with trailing=true) — is verified here at the quorum level:
// we show that evaluate() still returns the terminal state even after a
// trailing decision changes the step vector.  The full end-to-end HTTP
// walkthrough (chain.ts → audit row → trailing=true) is in scenarios.test.ts.
//
// Five test chains
// ────────────────
//   ch-aon-ok   all-of-N(n=2)  Approved   — s1✓ s2✓
//   ch-mon-ok   M-of-N(2/3)    Approved   — m1✓ m2✓ m3○(trailing-Pending)
//   ch-rej      all-of-N(n=2)  Rejected   — r1✗ r2○(trailing-Pending)
//   ch-wd       all-of-N(n=2)  Withdrawn  — w1⊘ w2⊘  (initiator cascade)
//   ch-pend     all-of-N(n=2)  Pending    — p1○ p2○

import { assertEquals } from "@std/assert";
import { Database } from "@db/sqlite";
import { dirname, fromFileUrl, join } from "jsr:@std/path";
import * as Step from "../src/domain/approval_step.ts";
import * as Assign from "../src/domain/assignment.ts";
import {
  record_action,
  type ActionRef,
} from "../src/domain/audit_trail.ts";
import { evaluate } from "../src/domain/quorum.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEMA_PATH = join(
  dirname(fromFileUrl(import.meta.url)),
  "../src/db/schema.sql",
);

const INIT = { actor_ref: "t_init", credential_secret: "sec_t_init_hmac_key_32bytes!!!!!" };
const SYS  = { actor_ref: "t_sys",  credential_secret: "sec_t_sys_hmac_key_32bytes!!!!!!!!" };
const A1   = { actor_ref: "t_a1",   credential_secret: "sec_t_a1_hmac_key_32bytes!!!!!!!!!" };
const A2   = { actor_ref: "t_a2",   credential_secret: "sec_t_a2_hmac_key_32bytes!!!!!!!!!" };
const A3   = { actor_ref: "t_a3",   credential_secret: "sec_t_a3_hmac_key_32bytes!!!!!!!!!" };

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------

/** Create a fresh in-memory DB with the full schema + all test actors. */
function makeDb(): Database {
  const idb = new Database(":memory:");
  idb.exec(Deno.readTextFileSync(SCHEMA_PATH));

  const ins = idb.prepare(`
    INSERT INTO actor
      (actor_ref, kind, display_name, credential_public, credential_secret, registered_at)
    VALUES (?, ?, ?, ?, ?, '2025-01-01T00:00:00.000Z')
  `);
  ins.run(INIT.actor_ref, "human",       "Initiator", "pub_init", INIT.credential_secret);
  ins.run(SYS.actor_ref,  "application", "System",    "pub_sys",  SYS.credential_secret);
  ins.run(A1.actor_ref,   "human",       "Approver1", "pub_a1",   A1.credential_secret);
  ins.run(A2.actor_ref,   "human",       "Approver2", "pub_a2",   A2.credential_secret);
  ins.run(A3.actor_ref,   "human",       "Approver3", "pub_a3",   A3.credential_secret);

  return idb;
}

/**
 * INSERT a chain row directly.  Terminal chains must have chain_terminal_at
 * set (schema CHECK enforces (state='Pending') = (chain_terminal_at IS NULL)).
 */
function insertChain(
  idb: Database,
  id: string,
  kind: string,
  m: number | null,
  state: string,
): void {
  const terminal = state !== "Pending";
  idb.prepare(`
    INSERT INTO chain
      (chain_id, subject_ref, scope, initiator_ref, quorum_kind, quorum_m,
       initiated_at, state, chain_terminal_at, terminal_reason)
    VALUES (?, 'subj', 'scope', ?, ?, ?,
            '2025-01-01T00:00:00.000Z', ?, ?, ?)
  `).run(
    id,
    INIT.actor_ref,
    kind,
    m,
    state,
    terminal ? "2025-01-01T01:00:00.000Z" : null,
    terminal ? "test terminal reason" : null,
  );
}

/**
 * Submit one step and create its Active assignment.
 * Returns { step_id, assignment_id }.
 */
function addStep(
  idb: Database,
  chainId: string,
  pos: number,
  approver: typeof A1,
): { step_id: string; assignment_id: number } {
  const res = Step.submit(idb, {
    chain_id: chainId,
    position: pos,
    subject_ref: "subj",
    approver_ref: approver.actor_ref,
    submitter_ref: INIT.actor_ref,
    scope: "scope",
  });
  if ("err" in res) throw new Error(`Step.submit failed: ${res.err}`);
  const { step_id } = res.ok;
  const assignment_id = Assign.assign(idb, step_id, approver.actor_ref);
  return { step_id, assignment_id };
}

/** Append one audit event to the DB (outside any transaction — fine for test setup). */
function emit(
  idb: Database,
  actor: { actor_ref: string; credential_secret: string },
  actionRef: ActionRef,
  chainId: string,
  stepId: string | null = null,
  data: Record<string, unknown> = {},
): void {
  record_action(
    {
      action_ref: actionRef,
      actor_ref: actor.actor_ref,
      credential_secret: actor.credential_secret,
      chain_id: chainId,
      step_id: stepId,
      data,
      retention_policy: "sox_7_year",
    },
    idb,
  );
}

// ---------------------------------------------------------------------------
// Build the shared test DB (module-level — runs once before all tests)
// ---------------------------------------------------------------------------

const testDb = makeDb();

// ── ch-aon-ok: all-of-N(2), Approved ────────────────────────────────────────
insertChain(testDb, "ch-aon-ok", "all-of-N", null, "Approved");
const { step_id: s1, assignment_id: as1 } = addStep(testDb, "ch-aon-ok", 0, A1);
const { step_id: s2, assignment_id: as2 } = addStep(testDb, "ch-aon-ok", 1, A2);
Step.approve(testDb, s1, A1.actor_ref);
Step.approve(testDb, s2, A2.actor_ref);
Assign.recall(testDb, as1);
Assign.recall(testDb, as2);
emit(testDb, INIT, "chain_initiated", "ch-aon-ok");
emit(testDb, A1,   "step_approved",   "ch-aon-ok", s1, { trailing: false });
emit(testDb, A2,   "step_approved",   "ch-aon-ok", s2, { trailing: false });
emit(testDb, SYS,  "chain_resolved",  "ch-aon-ok", null,
  { state: "Approved", recalled_step_ids: [], cascade_partial: false });

// ── ch-mon-ok: M-of-N(2/3), Approved; m3 is trailing-Pending ────────────────
insertChain(testDb, "ch-mon-ok", "M-of-N", 2, "Approved");
const { step_id: m1, assignment_id: ma1 } = addStep(testDb, "ch-mon-ok", 0, A1);
const { step_id: m2, assignment_id: ma2 } = addStep(testDb, "ch-mon-ok", 1, A2);
const { step_id: m3, assignment_id: ma3 } = addStep(testDb, "ch-mon-ok", 2, A3);
Step.approve(testDb, m1, A1.actor_ref);
Step.approve(testDb, m2, A2.actor_ref);
// m3 stays Pending (trailing); its assignment is recalled at chain resolution
Assign.recall(testDb, ma1);
Assign.recall(testDb, ma2);
Assign.recall(testDb, ma3);
emit(testDb, INIT, "chain_initiated", "ch-mon-ok");
emit(testDb, A1,   "step_approved",   "ch-mon-ok", m1, { trailing: false });
emit(testDb, A2,   "step_approved",   "ch-mon-ok", m2, { trailing: false });
emit(testDb, SYS,  "chain_resolved",  "ch-mon-ok", null,
  { state: "Approved", recalled_step_ids: [m3], cascade_partial: false });

// ── ch-rej: all-of-N(2), Rejected; r1 rejects, r2 stays Pending ─────────────
// For all-of-N: a rejection terminates the chain; remaining Pending steps are
// NOT cascade-withdrawn (only Withdrawn chains cascade).  Their assignments
// are recalled at chain resolution.
insertChain(testDb, "ch-rej", "all-of-N", null, "Rejected");
const { step_id: r1, assignment_id: ra1 } = addStep(testDb, "ch-rej", 0, A1);
const { step_id: r2, assignment_id: ra2 } = addStep(testDb, "ch-rej", 1, A2);
Step.reject(testDb, r1, A1.actor_ref, "Does not comply with policy");
// r2 stays Pending (not cascade-withdrawn for Rejected chains)
Assign.recall(testDb, ra1);
Assign.recall(testDb, ra2);
emit(testDb, INIT, "chain_initiated", "ch-rej");
emit(testDb, A1,   "step_rejected",   "ch-rej", r1,
  { reason: "Does not comply with policy", trailing: false });
emit(testDb, SYS,  "chain_resolved",  "ch-rej", null,
  { state: "Rejected", recalled_step_ids: [r2], cascade_partial: false });

// ── ch-wd: all-of-N(2), Withdrawn; initiator cascade-withdraws both steps ────
// Initiator-withdrawn chains emit chain_withdrawn (not chain_resolved).
// All steps are cascade-withdrawn (submitter_ref = initiator_ref = INIT).
insertChain(testDb, "ch-wd", "all-of-N", null, "Withdrawn");
const { step_id: w1, assignment_id: wa1 } = addStep(testDb, "ch-wd", 0, A1);
const { step_id: w2, assignment_id: wa2 } = addStep(testDb, "ch-wd", 1, A2);
Step.withdraw(testDb, w1, INIT.actor_ref, "Superseded by revised document");
Step.withdraw(testDb, w2, INIT.actor_ref, "Superseded by revised document");
Assign.recall(testDb, wa1);
Assign.recall(testDb, wa2);
emit(testDb, INIT, "chain_initiated",  "ch-wd");
emit(testDb, INIT, "step_withdrawn",   "ch-wd", w1,
  { reason: "Superseded by revised document", trailing: false });
emit(testDb, INIT, "step_withdrawn",   "ch-wd", w2,
  { reason: "Superseded by revised document", trailing: false });
emit(testDb, INIT, "chain_withdrawn",  "ch-wd", null,
  { reason: "Superseded by revised document" });

// ── ch-pend: all-of-N(2), Pending; both steps Pending with Active assignments ─
insertChain(testDb, "ch-pend", "all-of-N", null, "Pending");
addStep(testDb, "ch-pend", 0, A1); // assignments stay Active
addStep(testDb, "ch-pend", 1, A2);
emit(testDb, INIT, "chain_initiated", "ch-pend");

// ---------------------------------------------------------------------------
// Expected counts (derived from the setup above — used in multiple tests)
// ---------------------------------------------------------------------------
//
//   Chains:              5
//   Terminal chains:     4 (aon-ok, mon-ok, rej, wd)
//   chain_initiated:     5
//   chain_resolved:      3 (aon-ok, mon-ok, rej)  — step-driven terminal
//   chain_withdrawn:     1 (wd)                   — initiator-withdrawn
//   step_approved:       4 (s1, s2, m1, m2)
//   step_rejected:       1 (r1)
//   step_withdrawn:      2 (w1, w2)
//
//   approval_step rows:
//     Approved → 4 (s1, s2, m1, m2)
//     Pending  → 4 (m3 trailing, r2 trailing, p1, p2)
//     Rejected → 1 (r1)
//     Withdrawn→ 2 (w1, w2)
//   Total:               11
//
//   Assignments:
//     Active   → 2 (p1, p2)
//     Recalled → 9 (all others)

// ===========================================================================
// Invariant 2 — Quorum determinism
// ===========================================================================
// For every terminal chain, quorum.evaluate(kind, m, step-vector) must equal
// chain.state.  This is the spec's "quorum evaluation is pure and stateless"
// guarantee — a reader with only the step rows and the quorum rule can
// independently derive the chain outcome.

Deno.test("invariant 2: quorum determinism — evaluate() matches chain.state for all terminal chains", () => {
  type TerminalRow = {
    chain_id: string;
    quorum_kind: string;
    quorum_m: number | null;
    state: string;
    a: number; r: number; w: number; p: number;
  };

  const rows = testDb.prepare(`
    SELECT c.chain_id,
           c.quorum_kind,
           c.quorum_m,
           c.state,
           SUM(CASE WHEN s.state = 'Approved'  THEN 1 ELSE 0 END) AS a,
           SUM(CASE WHEN s.state = 'Rejected'  THEN 1 ELSE 0 END) AS r,
           SUM(CASE WHEN s.state = 'Withdrawn' THEN 1 ELSE 0 END) AS w,
           SUM(CASE WHEN s.state = 'Pending'   THEN 1 ELSE 0 END) AS p
    FROM   chain c
    JOIN   approval_step s ON s.chain_id = c.chain_id
    WHERE  c.state <> 'Pending'
    GROUP  BY c.chain_id
  `).all() as TerminalRow[];

  assertEquals(rows.length, 4, "expected 4 terminal chains");

  for (const row of rows) {
    const computed = evaluate(
      row.quorum_kind as "all-of-N" | "M-of-N" | "one-of-N",
      row.quorum_m,
      { a: row.a, r: row.r, w: row.w, p: row.p },
    );
    assertEquals(
      computed,
      row.state,
      `chain ${row.chain_id}: evaluate() → ${computed}, chain.state = ${row.state}`,
    );
  }
});

// ===========================================================================
// Invariant 3 — Chain completeness
// ===========================================================================
// Every chain has at least APPROVER_SET_MINIMUM (= 1) steps, and every step's
// chain_id references an existing chain (FK-enforced, but verified in-process
// too).

Deno.test("invariant 3a: chain completeness — every chain has ≥ 1 step", () => {
  const rows = testDb.prepare(`
    SELECT c.chain_id,
           COUNT(s.step_id) AS step_count
    FROM   chain c
    LEFT   JOIN approval_step s ON s.chain_id = c.chain_id
    GROUP  BY c.chain_id
  `).all() as Array<{ chain_id: string; step_count: number }>;

  assertEquals(rows.length, 5, "expected 5 chains");
  for (const { chain_id, step_count } of rows) {
    assertEquals(
      step_count >= 1,
      true,
      `chain ${chain_id} has ${step_count} steps — violates APPROVER_SET_MINIMUM = 1`,
    );
  }
});

Deno.test("invariant 3b: chain completeness — no orphan steps (every step references a known chain)", () => {
  const { n } = testDb.prepare(`
    SELECT COUNT(*) AS n
    FROM   approval_step s
    LEFT   JOIN chain c ON c.chain_id = s.chain_id
    WHERE  c.chain_id IS NULL
  `).get() as { n: number };

  assertEquals(n, 0, "found approval_step rows with no matching chain");
});

// ===========================================================================
// Invariant 4 — Assignment coverage
// ===========================================================================
// During pendency: every Pending step in a Pending chain has exactly one
// Active assignment (the step is live in the approver's in-tray).
// After terminal transition: no Active assignments remain anywhere in the chain
// (cascade-recall fired on resolution).

Deno.test("invariant 4a: assignment coverage — every Pending step in a Pending chain has one Active assignment", () => {
  const rows = testDb.prepare(`
    SELECT s.step_id,
           (SELECT COUNT(*)
            FROM   assignment a
            WHERE  a.task_ref = s.step_id
              AND  a.state    = 'Active') AS active_count
    FROM   approval_step s
    JOIN   chain c ON c.chain_id = s.chain_id
    WHERE  c.state  = 'Pending'
      AND  s.state  = 'Pending'
  `).all() as Array<{ step_id: string; active_count: number }>;

  assertEquals(rows.length > 0, true, "expected at least one Pending step in a Pending chain");
  for (const { step_id, active_count } of rows) {
    assertEquals(
      active_count,
      1,
      `Pending step ${step_id} in a Pending chain has ${active_count} Active assignments (expected 1)`,
    );
  }
});

Deno.test("invariant 4b: assignment coverage — no Active assignments remain in terminal chains", () => {
  const { n } = testDb.prepare(`
    SELECT COUNT(*) AS n
    FROM   assignment   a
    JOIN   approval_step s ON s.step_id  = a.task_ref
    JOIN   chain         c ON c.chain_id = s.chain_id
    WHERE  c.state <> 'Pending'
      AND  a.state  = 'Active'
  `).get() as { n: number };

  assertEquals(n, 0, "found Active assignments in a terminal chain");
});

// ===========================================================================
// Invariant 5 — Audit completeness
// ===========================================================================
// Every chain-level and step-level state transition must produce exactly one
// audit_event row with the matching action_ref.
//
// Structural check: counts of audit events match counts of state transitions
// in the chain/approval_step tables.

Deno.test("invariant 5a: audit completeness — chain_initiated count equals chain count", () => {
  const chains = (testDb.prepare("SELECT COUNT(*) AS n FROM chain").get() as { n: number }).n;
  const events = (testDb.prepare(
    "SELECT COUNT(*) AS n FROM audit_event WHERE action_ref = 'chain_initiated'",
  ).get() as { n: number }).n;

  assertEquals(events, chains, `chain_initiated(${events}) ≠ chain count(${chains})`);
});

Deno.test("invariant 5b: audit completeness — step event counts match step state counts", () => {
  const approved  = (testDb.prepare("SELECT COUNT(*) AS n FROM approval_step WHERE state = 'Approved'").get()  as { n: number }).n;
  const rejected  = (testDb.prepare("SELECT COUNT(*) AS n FROM approval_step WHERE state = 'Rejected'").get()  as { n: number }).n;
  const withdrawn = (testDb.prepare("SELECT COUNT(*) AS n FROM approval_step WHERE state = 'Withdrawn'").get() as { n: number }).n;

  const evApproved  = (testDb.prepare("SELECT COUNT(*) AS n FROM audit_event WHERE action_ref = 'step_approved'").get()  as { n: number }).n;
  const evRejected  = (testDb.prepare("SELECT COUNT(*) AS n FROM audit_event WHERE action_ref = 'step_rejected'").get()  as { n: number }).n;
  const evWithdrawn = (testDb.prepare("SELECT COUNT(*) AS n FROM audit_event WHERE action_ref = 'step_withdrawn'").get() as { n: number }).n;

  assertEquals(evApproved,  approved,  `step_approved events(${evApproved}) ≠ Approved steps(${approved})`);
  assertEquals(evRejected,  rejected,  `step_rejected events(${evRejected}) ≠ Rejected steps(${rejected})`);
  assertEquals(evWithdrawn, withdrawn, `step_withdrawn events(${evWithdrawn}) ≠ Withdrawn steps(${withdrawn})`);
});

Deno.test("invariant 5c: audit completeness — chain_resolved + chain_withdrawn covers all terminal chains", () => {
  // chain_resolved: emitted when a step decision drives the chain terminal
  // chain_withdrawn: emitted when the initiator withdraws the whole chain
  // Together they must account for every terminal chain (exactly one per chain).
  const terminal  = (testDb.prepare("SELECT COUNT(*) AS n FROM chain WHERE state <> 'Pending'").get() as { n: number }).n;
  const resolved  = (testDb.prepare("SELECT COUNT(*) AS n FROM audit_event WHERE action_ref = 'chain_resolved'").get()  as { n: number }).n;
  const withdrawn = (testDb.prepare("SELECT COUNT(*) AS n FROM audit_event WHERE action_ref = 'chain_withdrawn'").get() as { n: number }).n;

  assertEquals(
    resolved + withdrawn,
    terminal,
    `chain_resolved(${resolved}) + chain_withdrawn(${withdrawn}) ≠ terminal chains(${terminal})`,
  );
});

// ===========================================================================
// Invariant 6 — Quorum determinism for trailing decisions
// ===========================================================================
// A trailing step decision (on a chain already in a terminal state) must not
// change the chain's outcome.  This is verified here at the quorum-evaluation
// level: evaluate() returns the same terminal state regardless of how the
// trailing step is decided.
//
// Example: ch-mon-ok (M-of-N(2), n=3) reaches Approved with a=2.
// Step m3 (trailing-Pending) can be approved, rejected, or withdrawn —
// in all cases evaluate() still returns Approved.

Deno.test("invariant 6: trailing decision does not change quorum outcome for M-of-N", () => {
  // Baseline: chain reached Approved with a=2 (quorum met)
  assertEquals(evaluate("M-of-N", 2, { a: 2, r: 0, w: 0, p: 1 }), "Approved");

  // Trailing step m3 approved (a=3)
  assertEquals(evaluate("M-of-N", 2, { a: 3, r: 0, w: 0, p: 0 }), "Approved");

  // Trailing step m3 rejected (r=1 but a=2 >= m=2 → Approved still wins)
  assertEquals(evaluate("M-of-N", 2, { a: 2, r: 1, w: 0, p: 0 }), "Approved");

  // Trailing step m3 withdrawn (w=1 but a=2 >= m=2 → Approved still wins)
  assertEquals(evaluate("M-of-N", 2, { a: 2, r: 0, w: 1, p: 0 }), "Approved");

  // Confirm the DB chain state is still Approved (it was never mutated here)
  const row = testDb.prepare(
    "SELECT state FROM chain WHERE chain_id = 'ch-mon-ok'",
  ).get() as { state: string };
  assertEquals(row.state, "Approved");
});

// ===========================================================================
// Invariant 7 — Chain terminal absorption (SQL trigger)
// ===========================================================================
// Once a chain's state is Approved/Rejected/Withdrawn, any attempt to change
// it to a different state fires the chain_no_terminal_state_change trigger.

Deno.test("invariant 7: chain terminal absorption trigger — UPDATE from terminal state is rejected", () => {
  const idb = makeDb();
  idb.prepare(`
    INSERT INTO chain
      (chain_id, subject_ref, scope, initiator_ref, quorum_kind,
       initiated_at, state, chain_terminal_at, terminal_reason)
    VALUES ('ch-trig', 'subj', 'scope', 't_init', 'all-of-N',
            '2025-01-01T00:00:00.000Z', 'Approved',
            '2025-01-01T01:00:00.000Z', 'quorum reached')
  `).run();

  let threw = false;
  try {
    idb.prepare(
      "UPDATE chain SET state = 'Rejected' WHERE chain_id = 'ch-trig'",
    ).run();
  } catch (e) {
    threw = true;
    // The trigger message should be present in the error
    assertEquals(
      (e as Error).message.includes("chain terminal absorption"),
      true,
      `unexpected error message: ${(e as Error).message}`,
    );
  }
  assertEquals(threw, true, "expected trigger to fire but no error was thrown");

  // State must be unchanged
  const row = idb.prepare(
    "SELECT state FROM chain WHERE chain_id = 'ch-trig'",
  ).get() as { state: string };
  assertEquals(row.state, "Approved");
});

// Same trigger fires when transitioning Withdrawn → Approved
Deno.test("invariant 7: chain terminal absorption trigger — Withdrawn → Approved also blocked", () => {
  const idb = makeDb();
  idb.prepare(`
    INSERT INTO chain
      (chain_id, subject_ref, scope, initiator_ref, quorum_kind,
       initiated_at, state, chain_terminal_at, terminal_reason)
    VALUES ('ch-trig2', 'subj', 'scope', 't_init', 'all-of-N',
            '2025-01-01T00:00:00.000Z', 'Withdrawn',
            '2025-01-01T01:00:00.000Z', 'superseded')
  `).run();

  let threw = false;
  try {
    idb.prepare(
      "UPDATE chain SET state = 'Approved' WHERE chain_id = 'ch-trig2'",
    ).run();
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "expected terminal absorption trigger to fire");
});

// ===========================================================================
// Invariant 8 — Chain field immutability (SQL trigger)
// ===========================================================================
// subject_ref, scope, initiator_ref, quorum_kind, quorum_m, and initiated_at
// are declared immutable in the spec.  The chain_no_field_mutation trigger
// fires on any UPDATE that touches these columns.

Deno.test("invariant 8a: chain field immutability — UPDATE subject_ref fires trigger", () => {
  const idb = makeDb();
  idb.prepare(`
    INSERT INTO chain
      (chain_id, subject_ref, scope, initiator_ref, quorum_kind, initiated_at, state)
    VALUES ('ch-immut', 'original-subject', 'scope', 't_init', 'all-of-N',
            '2025-01-01T00:00:00.000Z', 'Pending')
  `).run();

  let threw = false;
  try {
    idb.prepare(
      "UPDATE chain SET subject_ref = 'mutated' WHERE chain_id = 'ch-immut'",
    ).run();
  } catch (e) {
    threw = true;
    assertEquals(
      (e as Error).message.includes("chain immutable field"),
      true,
      `unexpected error message: ${(e as Error).message}`,
    );
  }
  assertEquals(threw, true, "expected immutability trigger to fire");

  const row = idb.prepare(
    "SELECT subject_ref FROM chain WHERE chain_id = 'ch-immut'",
  ).get() as { subject_ref: string };
  assertEquals(row.subject_ref, "original-subject");
});

Deno.test("invariant 8b: chain field immutability — UPDATE initiator_ref fires trigger", () => {
  const idb = makeDb();
  idb.prepare(`
    INSERT INTO chain
      (chain_id, subject_ref, scope, initiator_ref, quorum_kind, initiated_at, state)
    VALUES ('ch-immut2', 'subj', 'scope', 't_init', 'all-of-N',
            '2025-01-01T00:00:00.000Z', 'Pending')
  `).run();

  let threw = false;
  try {
    idb.prepare(
      "UPDATE chain SET initiator_ref = 't_a1' WHERE chain_id = 'ch-immut2'",
    ).run();
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "expected immutability trigger to fire");
});

Deno.test("invariant 8c: chain field immutability — UPDATE quorum_kind fires trigger", () => {
  const idb = makeDb();
  idb.prepare(`
    INSERT INTO chain
      (chain_id, subject_ref, scope, initiator_ref, quorum_kind, initiated_at, state)
    VALUES ('ch-immut3', 'subj', 'scope', 't_init', 'all-of-N',
            '2025-01-01T00:00:00.000Z', 'Pending')
  `).run();

  let threw = false;
  try {
    idb.prepare(
      "UPDATE chain SET quorum_kind = 'M-of-N' WHERE chain_id = 'ch-immut3'",
    ).run();
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "expected immutability trigger to fire");
});
