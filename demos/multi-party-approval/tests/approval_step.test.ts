// Unit tests for approval_step.ts and assignment.ts atoms.
//
// Covers:
//   - submit creates a Pending step
//   - approve / reject / withdraw happy paths
//   - wrong-actor rejection (Invariant 4 / 5)
//   - missing reason rejection (Invariant 6)
//   - terminal absorption (Invariant 3): can't decide a decided step
//   - not-known for unknown step_id
//   - assign creates an Active assignment
//   - recall transitions to Recalled and returns 'ok'
//   - recall is idempotent (returns 'not-active' when already Recalled)

import { assertEquals } from "@std/assert";
import { Database } from "@db/sqlite";
import { dirname, fromFileUrl, join } from "jsr:@std/path";
import * as Step from "../src/domain/approval_step.ts";
import * as Assign from "../src/domain/assignment.ts";

// ---------------------------------------------------------------------------
// Test DB factory — full schema, seeded with one actor + one chain
// ---------------------------------------------------------------------------

const schemaPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "../src/db/schema.sql",
);

async function makeTestDb(): Promise<Database> {
  const db = new Database(":memory:");
  const schema = await Deno.readTextFile(schemaPath);
  db.exec(schema);

  // One actor (plays both submitter and approver in most tests)
  db.exec(`
    INSERT INTO actor VALUES (
      'actor_a', 'human', 'Actor A',
      'pub_a', 'sec_a', '2024-01-01T00:00:00.000Z'
    );
    INSERT INTO actor VALUES (
      'actor_b', 'human', 'Actor B',
      'pub_b', 'sec_b', '2024-01-01T00:00:00.000Z'
    );
  `);

  // One chain (needed for approval_step FK)
  db.exec(`
    INSERT INTO chain
      (chain_id, subject_ref, scope, initiator_ref, quorum_kind, initiated_at, state)
    VALUES
      ('chain-test', 'subj-1', 'test-scope', 'actor_a', 'all-of-N',
       '2024-01-01T00:00:00.000Z', 'Pending');
  `);

  return db;
}

// Helpers that produce a submitted step + its assignment
async function freshStep(approver = "actor_a", submitter = "actor_a") {
  const db = await makeTestDb();
  const res = Step.submit(db, {
    chain_id: "chain-test",
    position: 0,
    subject_ref: "subj-1",
    approver_ref: approver,
    submitter_ref: submitter,
    scope: "test-scope",
  });
  if ("err" in res) throw new Error(`submit failed: ${res.err}`);
  const { step_id } = res.ok;
  const assignment_id = Assign.assign(db, step_id, approver);
  return { db, step_id, assignment_id };
}

// ---------------------------------------------------------------------------
// submit
// ---------------------------------------------------------------------------

Deno.test("submit: creates a Pending step", async () => {
  const db = await makeTestDb();
  const res = Step.submit(db, {
    chain_id: "chain-test",
    position: 0,
    subject_ref: "subj-1",
    approver_ref: "actor_a",
    submitter_ref: "actor_a",
    scope: "test-scope",
  });
  assertEquals("ok" in res, true);
  const step = Step.read(db, (res as { ok: { step_id: string } }).ok.step_id)!;
  assertEquals(step.state, "Pending");
  assertEquals(step.decided_by, null);
});

Deno.test("submit: rejects blank subject_ref", async () => {
  const db = await makeTestDb();
  const res = Step.submit(db, {
    chain_id: "chain-test",
    position: 0,
    subject_ref: "   ",
    approver_ref: "actor_a",
    submitter_ref: "actor_a",
    scope: "test-scope",
  });
  assertEquals("err" in res && res.err, "invalid-request");
});

// ---------------------------------------------------------------------------
// approve
// ---------------------------------------------------------------------------

Deno.test("approve: transitions to Approved", async () => {
  const { db, step_id } = await freshStep();
  const res = Step.approve(db, step_id, "actor_a");
  assertEquals("ok" in res && res.ok, "approved");
  assertEquals(Step.read(db, step_id)!.state, "Approved");
});

Deno.test("approve: rejects wrong actor (Invariant 4)", async () => {
  const { db, step_id } = await freshStep("actor_a");
  const res = Step.approve(db, step_id, "actor_b");
  assertEquals("err" in res && res.err, "unauthorized");
  assertEquals(Step.read(db, step_id)!.state, "Pending");
});

Deno.test("approve: rejects unknown step_id", async () => {
  const db = await makeTestDb();
  const res = Step.approve(db, "no-such-step", "actor_a");
  assertEquals("err" in res && res.err, "not-known");
});

Deno.test("approve: terminal absorption — already Approved (Invariant 3)", async () => {
  const { db, step_id } = await freshStep();
  Step.approve(db, step_id, "actor_a");
  const res = Step.approve(db, step_id, "actor_a");
  assertEquals("err" in res && res.err, "not-pending");
});

// ---------------------------------------------------------------------------
// reject
// ---------------------------------------------------------------------------

Deno.test("reject: transitions to Rejected with reason", async () => {
  const { db, step_id } = await freshStep();
  const res = Step.reject(db, step_id, "actor_a", "Not compliant");
  assertEquals("ok" in res && res.ok, "rejected_outcome");
  assertEquals(Step.read(db, step_id)!.state, "Rejected");
  assertEquals(Step.read(db, step_id)!.decision_reason, "Not compliant");
});

Deno.test("reject: requires reason (Invariant 6)", async () => {
  const { db, step_id } = await freshStep();
  const res = Step.reject(db, step_id, "actor_a", "   ");
  assertEquals("err" in res && res.err, "invalid-request");
  assertEquals(Step.read(db, step_id)!.state, "Pending");
});

Deno.test("reject: rejects wrong actor (Invariant 4)", async () => {
  const { db, step_id } = await freshStep("actor_a");
  const res = Step.reject(db, step_id, "actor_b", "Reason");
  assertEquals("err" in res && res.err, "unauthorized");
});

Deno.test("reject: terminal absorption — can't reject Approved step (Invariant 3)", async () => {
  const { db, step_id } = await freshStep();
  Step.approve(db, step_id, "actor_a");
  const res = Step.reject(db, step_id, "actor_a", "Too late");
  assertEquals("err" in res && res.err, "not-pending");
});

// ---------------------------------------------------------------------------
// withdraw (step-level)
// ---------------------------------------------------------------------------

Deno.test("withdraw: transitions to Withdrawn with reason", async () => {
  const { db, step_id } = await freshStep("actor_b", "actor_a");
  // submitter is actor_a, approver is actor_b
  const res = Step.withdraw(db, step_id, "actor_a", "Recalled by initiator");
  assertEquals("ok" in res && res.ok, "withdrawn");
  assertEquals(Step.read(db, step_id)!.state, "Withdrawn");
});

Deno.test("withdraw: rejects wrong actor (Invariant 5 — must be submitter)", async () => {
  const { db, step_id } = await freshStep("actor_b", "actor_a");
  // actor_b is approver, not submitter
  const res = Step.withdraw(db, step_id, "actor_b", "Trying to self-withdraw");
  assertEquals("err" in res && res.err, "unauthorized");
});

Deno.test("withdraw: requires reason", async () => {
  const { db, step_id } = await freshStep();
  const res = Step.withdraw(db, step_id, "actor_a", "");
  assertEquals("err" in res && res.err, "invalid-request");
});

// ---------------------------------------------------------------------------
// assignment — assign
// ---------------------------------------------------------------------------

Deno.test("assign: creates an Active assignment", async () => {
  const db = await makeTestDb();
  const res = Step.submit(db, {
    chain_id: "chain-test",
    position: 0,
    subject_ref: "subj-1",
    approver_ref: "actor_a",
    submitter_ref: "actor_a",
    scope: "test-scope",
  });
  const step_id = (res as { ok: { step_id: string } }).ok.step_id;
  const id = Assign.assign(db, step_id, "actor_a");
  const row = db.prepare(
    "SELECT state FROM assignment WHERE assignment_id = ?",
  ).get(id) as { state: string };
  assertEquals(row.state, "Active");
});

// ---------------------------------------------------------------------------
// assignment — recall
// ---------------------------------------------------------------------------

Deno.test("recall: transitions Active → Recalled, returns 'ok'", async () => {
  const { db, assignment_id } = await freshStep();
  const result = Assign.recall(db, assignment_id);
  assertEquals(result, "ok");
  const row = db.prepare(
    "SELECT state FROM assignment WHERE assignment_id = ?",
  ).get(assignment_id) as { state: string };
  assertEquals(row.state, "Recalled");
});

Deno.test("recall: idempotent — returns 'not-active' when already Recalled", async () => {
  const { db, assignment_id } = await freshStep();
  Assign.recall(db, assignment_id);
  const result = Assign.recall(db, assignment_id);
  assertEquals(result, "not-active");
});

Deno.test("recall: returns 'not-active' for unknown assignment_id", async () => {
  const db = await makeTestDb();
  assertEquals(Assign.recall(db, 99999), "not-active");
});

// ---------------------------------------------------------------------------
// getForStep
// ---------------------------------------------------------------------------

Deno.test("getForStep: returns assignment_id for a known step", async () => {
  const { db, step_id, assignment_id } = await freshStep();
  assertEquals(Assign.getForStep(db, step_id), assignment_id);
});

Deno.test("getForStep: returns undefined for unknown step", async () => {
  const db = await makeTestDb();
  assertEquals(Assign.getForStep(db, "no-such-step"), undefined);
});
