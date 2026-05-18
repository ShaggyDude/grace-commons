// scenarios.test.ts — HTTP-level walkthrough tests against a fresh in-memory DB.
//
// Uses app.fetch() (Hono's test interface) — no network server started.
//
// DB isolation: Deno.env.set("DB_PATH", ":memory:") runs as the first
// top-level statement, before any dynamic import that transitively reaches
// src/db/client.ts.  client.ts reads DB_PATH at module-init time, so the
// in-memory DB is used for all tests in this file.
//
// The two other test files (audit_tamper, invariants) never import client.ts,
// so they do not interfere with this isolation — even in the same deno test run.
//
// Requires --allow-env in the test command (already added to deno.json "test").
//
// Five scenarios (BUILD_PLAN.md §12):
//   1. all-of-N  → Approved (full quorum, 4 audit events, final state verified)
//   2. M-of-N 2/3 → Approved at quorum + trailing approval carries trailing=true
//   3. withdraw  → Withdrawn + cascade step_withdrawn emitted for each step
//   4. all-of-N  → Rejected (trailing Pending step stays in place, assignment Recalled)
//   5. tamper    → POST /admin/tamper?dev=1 mutates a row; GET /audit/:id/verify fails

import { assertEquals, assertMatch } from "jsr:@std/assert";
import { dirname, fromFileUrl, join } from "jsr:@std/path";

// ── 0. DB isolation ────────────────────────────────────────────────────────
// Must precede any dynamic import reaching src/db/client.ts.
// Static imports above are pure utilities that never touch client.ts.
Deno.env.set("DB_PATH", ":memory:");

// ── 1. Dynamic imports (executed after env is set) ─────────────────────────
// Order matters: client.ts must be loaded and the schema applied BEFORE app.ts
// is imported, because actor.ts (loaded transitively by app.ts) prepares
// statements against the actor table at module load time.
const { db }  = await import("../src/db/client.ts");

// ── 2. Schema (applied before app.ts loads actor.ts) ──────────────────────
const schemaPath = join(
  dirname(fromFileUrl(import.meta.url)),
  "..",
  "src",
  "db",
  "schema.sql",
);
db.exec(await Deno.readTextFile(schemaPath));

// ── 3. App — safe to load now that the schema exists ──────────────────────
const { app } = await import("../src/app.ts");

// ── 4. Actors + permission grants ─────────────────────────────────────────
// One application actor (system@demo), one initiator (sc_init), three
// approvers (sc_a1 – sc_a3).  Credential secrets must be ≥ 32 bytes.
const NOW = new Date().toISOString();

const ACTORS: Array<{
  actor_ref: string; kind: string; display_name: string;
  credential_public: string; credential_secret: string;
}> = [
  {
    actor_ref:         "system@demo",
    kind:              "application",
    display_name:      "System (Demo)",
    credential_public: "pub_system_demo",
    credential_secret: "sec_system_demo_hmac_key_32bytes!",
  },
  {
    actor_ref:         "sc_init",
    kind:              "human",
    display_name:      "Scenario Initiator",
    credential_public: "pub_sc_init",
    credential_secret: "sec_sc_init_hmac_key_32bytes!!!!!",
  },
  {
    actor_ref:         "sc_a1",
    kind:              "human",
    display_name:      "Scenario Approver 1",
    credential_public: "pub_sc_a1",
    credential_secret: "sec_sc_a1_hmac_key_32_bytes_long!",
  },
  {
    actor_ref:         "sc_a2",
    kind:              "human",
    display_name:      "Scenario Approver 2",
    credential_public: "pub_sc_a2",
    credential_secret: "sec_sc_a2_hmac_key_32_bytes_long!",
  },
  {
    actor_ref:         "sc_a3",
    kind:              "human",
    display_name:      "Scenario Approver 3",
    credential_public: "pub_sc_a3",
    credential_secret: "sec_sc_a3_hmac_key_32_bytes_long!",
  },
];

{
  const insertActor = db.prepare(`
    INSERT INTO actor
      (actor_ref, kind, display_name, credential_public, credential_secret, registered_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const a of ACTORS) {
    insertActor.run(
      a.actor_ref, a.kind, a.display_name,
      a.credential_public, a.credential_secret, NOW,
    );
  }

  const insertGrant = db.prepare(`
    INSERT INTO permission_grant (actor_ref, scope, granted_at, granted_by)
    VALUES (?, ?, ?, ?)
  `);
  insertGrant.run("sc_init", "chains:initiate", NOW, "system@demo");
  insertGrant.run("sc_init", "chains:withdraw",  NOW, "system@demo");
  for (const ref of ["sc_init", "sc_a1", "sc_a2", "sc_a3"]) {
    insertGrant.run(ref, "chains:read", NOW, "system@demo");
  }
}

// ── 5. HTTP helpers ────────────────────────────────────────────────────────

type ReqOpts = {
  /** actor_ref cookie value; defaults to "sc_init" */
  actor?: string;
  /** form-encoded body */
  form?: Record<string, string>;
  /** JSON body */
  json?: Record<string, unknown>;
};

function makeReq(method: string, path: string, opts: ReqOpts = {}): Request {
  const actor = opts.actor ?? "sc_init";
  const headers = new Headers({
    Cookie: `actor_ref=${actor}`,
    Accept: "application/json",
  });
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  } else if (opts.form !== undefined) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    body = new URLSearchParams(opts.form).toString();
  }
  return new Request(`http://test${path}`, { method, headers, body });
}

async function httpGet<T>(path: string, opts: ReqOpts = {}): Promise<{ status: number; body: T }> {
  const res = await app.fetch(makeReq("GET", path, opts));
  return { status: res.status, body: (await res.json()) as T };
}

async function httpPost<T>(path: string, opts: ReqOpts = {}): Promise<{ status: number; body: T }> {
  const res = await app.fetch(makeReq("POST", path, opts));
  return { status: res.status, body: (await res.json()) as T };
}

// ── 6. Shared response shapes ─────────────────────────────────────────────

type Assignment = {
  assignment_id: number;
  assignee_ref:  string;
  state:         string;
  recalled_at:   string | null;
};
type StepView = {
  step_id:      string;
  approver_ref: string;
  state:        string;
  position:     number;
  assignment:   Assignment | null;
};
type ChainView = {
  chain_id:   string;
  state:      string;
  quorum_kind: string;
  quorum_m:   number | null;
  steps:      StepView[];
};
type StepResult = { step_state: string; chain_state: string; trailing: boolean };
type AuditEvent = {
  event_id:    number;
  seq:         number;
  action_ref:  string;
  actor_ref:   string;
  chain_id:    string | null;
  step_id:     string | null;
  data_json:   string;   // JSON-encoded string; parse when inspecting fields
};
type VerifyResult = { event_id: number; result: string; verified: boolean };

/** Return the step_id for a given approver within a fetched chain. */
function stepOf(chain: ChainView, approver_ref: string): string {
  const step = chain.steps.find((s) => s.approver_ref === approver_ref);
  if (!step) throw new Error(`No step for approver_ref="${approver_ref}" in chain ${chain.chain_id}`);
  return step.step_id;
}

// ── 7. Tests ──────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Scenario 1: all-of-N → Approved
//   - Two approvers; both must approve before the chain goes terminal.
//   - After terminal transition all assignments are Recalled.
//   - Audit trail: chain_initiated + 2×step_approved + chain_resolved = 4 events.
// ---------------------------------------------------------------------------
Deno.test("scenario 1 — all-of-N: full quorum → chain Approved", async () => {
  // Initiate
  const { status: s0, body: created } = await httpPost<{ chain_id: string }>("/chains", {
    json: {
      subject_ref:  "sc1-aon-approved",
      scope:        "test-scope-aon",
      quorum_kind:  "all-of-N",
      approver_set: ["sc_a1", "sc_a2"],
    },
  });
  assertEquals(s0, 201, "POST /chains should return 201");
  const cid = created.chain_id;

  // Initial state — both steps Pending, both assignments Active
  const { body: chain0 } = await httpGet<ChainView>(`/chains/${cid}`);
  assertEquals(chain0.state, "Pending");
  assertEquals(chain0.steps.length, 2);
  assertEquals(
    chain0.steps.every((s) => s.state === "Pending"),
    true,
    "all steps should start Pending",
  );
  assertEquals(
    chain0.steps.every((s) => s.assignment?.state === "Active"),
    true,
    "all assignments should start Active",
  );

  const s1 = stepOf(chain0, "sc_a1");
  const s2 = stepOf(chain0, "sc_a2");

  // First approval — quorum not yet met; chain stays Pending
  const { body: r1 } = await httpPost<StepResult>(
    `/chains/${cid}/steps/${s1}/approve`,
    { actor: "sc_a1", json: { reason: "Looks good." } },
  );
  assertEquals(r1.step_state,  "Approved");
  assertEquals(r1.chain_state, "Pending",  "after first approval chain must remain Pending");
  assertEquals(r1.trailing,    false);

  // Second approval — quorum met → terminal transition
  const { body: r2 } = await httpPost<StepResult>(
    `/chains/${cid}/steps/${s2}/approve`,
    { actor: "sc_a2", json: { reason: "Concur." } },
  );
  assertEquals(r2.step_state,  "Approved");
  assertEquals(r2.chain_state, "Approved", "after second approval chain must be Approved");
  assertEquals(r2.trailing,    false);

  // Final chain shape
  const { body: final } = await httpGet<ChainView>(`/chains/${cid}`);
  assertEquals(final.state, "Approved");
  assertEquals(final.steps.every((s) => s.state === "Approved"), true);
  assertEquals(
    final.steps.every((s) => s.assignment?.state === "Recalled"),
    true,
    "all assignments must be Recalled after terminal transition",
  );

  // Audit trail shape
  const { body: events } = await httpGet<AuditEvent[]>(`/audit?chain_id=${cid}`, { actor: "sc_a1" });
  assertEquals(events.length, 4, "chain_initiated + step_approved×2 + chain_resolved");
  const actionRefs = events.map((e) => e.action_ref).sort();
  assertEquals(actionRefs, [
    "chain_initiated",
    "chain_resolved",
    "step_approved",
    "step_approved",
  ].sort());
});

// ---------------------------------------------------------------------------
// Scenario 2: M-of-N 2/3 → Approved + trailing detection
//   - Three approvers, quorum = 2.
//   - After the second approval the chain goes Approved.
//   - The third approval is trailing: chain state unchanged, data_json.trailing=true.
//   - Audit trail: chain_initiated + 3×step_approved + chain_resolved = 5 events.
// ---------------------------------------------------------------------------
Deno.test("scenario 2 — M-of-N: quorum at 2; third approval is trailing", async () => {
  const { body: created } = await httpPost<{ chain_id: string }>("/chains", {
    json: {
      subject_ref:  "sc2-mon-trailing",
      scope:        "test-scope-mon",
      quorum_kind:  "M-of-N",
      m:            2,
      approver_set: ["sc_a1", "sc_a2", "sc_a3"],
    },
  });
  const cid = created.chain_id;

  const { body: chain0 } = await httpGet<ChainView>(`/chains/${cid}`);
  assertEquals(chain0.quorum_kind, "M-of-N");
  assertEquals(chain0.quorum_m,    2);
  assertEquals(chain0.steps.length, 3);

  const s1 = stepOf(chain0, "sc_a1");
  const s2 = stepOf(chain0, "sc_a2");
  const s3 = stepOf(chain0, "sc_a3");

  // First approval — chain still Pending
  const { body: r1 } = await httpPost<StepResult>(
    `/chains/${cid}/steps/${s1}/approve`,
    { actor: "sc_a1" },
  );
  assertEquals(r1.chain_state, "Pending");
  assertEquals(r1.trailing,    false);

  // Second approval — quorum reached, chain → Approved
  const { body: r2 } = await httpPost<StepResult>(
    `/chains/${cid}/steps/${s2}/approve`,
    { actor: "sc_a2" },
  );
  assertEquals(r2.chain_state, "Approved");
  assertEquals(r2.trailing,    false);

  // Third approval — trailing (chain already Approved)
  const { body: r3 } = await httpPost<StepResult>(
    `/chains/${cid}/steps/${s3}/approve`,
    { actor: "sc_a3" },
  );
  assertEquals(r3.step_state,  "Approved");
  assertEquals(r3.chain_state, "Approved",  "chain state must not change for trailing decision");
  assertEquals(r3.trailing,    true,         "trailing must be true when chain is already terminal");

  // Trailing flag is stored in the step_approved audit event's data_json
  const { body: events } = await httpGet<AuditEvent[]>(`/audit?chain_id=${cid}`, { actor: "sc_a3" });
  assertEquals(events.length, 5, "chain_initiated + step_approved×3 + chain_resolved");

  const trailingEvent = events.find(
    (e) => e.action_ref === "step_approved" && e.actor_ref === "sc_a3",
  );
  assertEquals(
    trailingEvent !== undefined,
    true,
    "sc_a3 step_approved audit event must exist",
  );
  const data = JSON.parse(trailingEvent!.data_json) as { trailing: boolean };
  assertEquals(
    data.trailing,
    true,
    "data_json.trailing must be true for the post-quorum approval",
  );
});

// ---------------------------------------------------------------------------
// Scenario 3: chain withdraw → Withdrawn + cascade step_withdrawn events
//   - Initiator withdraws before any step decisions are made.
//   - Both Pending steps cascade to Withdrawn; both assignments Recalled.
//   - Audit trail: chain_initiated + 2×step_withdrawn + chain_withdrawn = 4 events.
//   - Note: chain_withdrawn (not chain_resolved) is emitted by withdraw_chain().
// ---------------------------------------------------------------------------
Deno.test("scenario 3 — withdraw: initiator withdraws → cascade step_withdrawn + chain_withdrawn", async () => {
  const { body: created } = await httpPost<{ chain_id: string }>("/chains", {
    json: {
      subject_ref:  "sc3-withdraw",
      scope:        "test-scope-withdraw",
      quorum_kind:  "all-of-N",
      approver_set: ["sc_a1", "sc_a2"],
    },
  });
  const cid = created.chain_id;

  // Withdraw before any approvals
  const { status, body: wd } = await httpPost<{ state: string }>(
    `/chains/${cid}/withdraw`,
    { json: { reason: "Superseded by amended figures. Resubmitting as v2." } },
  );
  assertEquals(status, 200);
  assertEquals(wd.state, "Withdrawn");

  // Final chain shape
  const { body: final } = await httpGet<ChainView>(`/chains/${cid}`);
  assertEquals(final.state, "Withdrawn");
  assertEquals(
    final.steps.every((s) => s.state === "Withdrawn"),
    true,
    "all steps must be cascade-Withdrawn",
  );
  assertEquals(
    final.steps.every((s) => s.assignment?.state === "Recalled"),
    true,
    "all assignments must be Recalled after withdrawal",
  );

  // Audit trail shape
  const { body: events } = await httpGet<AuditEvent[]>(`/audit?chain_id=${cid}`);
  assertEquals(events.length, 4, "chain_initiated + step_withdrawn×2 + chain_withdrawn");
  const actionRefs = events.map((e) => e.action_ref).sort();
  assertEquals(actionRefs, [
    "chain_initiated",
    "chain_withdrawn",
    "step_withdrawn",
    "step_withdrawn",
  ].sort());

  // Confirm chain_resolved is NOT present — withdrawal emits chain_withdrawn only
  assertEquals(
    events.some((e) => e.action_ref === "chain_resolved"),
    false,
    "chain_resolved must NOT appear; only chain_withdrawn is emitted",
  );
});

// ---------------------------------------------------------------------------
// Scenario 4: all-of-N → Rejected
//   - One of two approvers rejects; quorum becomes unreachable → chain Rejected.
//   - Spec §7: Rejected (unlike Withdrawn) does NOT cascade-withdraw pending steps.
//     The trailing Pending step stays Pending; its assignment IS Recalled.
//   - Audit trail: chain_initiated + step_rejected + chain_resolved = 3 events.
// ---------------------------------------------------------------------------
Deno.test("scenario 4 — rejected: one rejection → chain Rejected; trailing Pending step stays Pending", async () => {
  const { body: created } = await httpPost<{ chain_id: string }>("/chains", {
    json: {
      subject_ref:  "sc4-rejected",
      scope:        "test-scope-rejected",
      quorum_kind:  "all-of-N",
      approver_set: ["sc_a1", "sc_a2"],
    },
  });
  const cid = created.chain_id;

  const { body: chain0 } = await httpGet<ChainView>(`/chains/${cid}`);
  const s1 = stepOf(chain0, "sc_a1");

  // sc_a1 rejects — quorum unreachable for all-of-N → chain → Rejected
  const { body: r1 } = await httpPost<StepResult>(
    `/chains/${cid}/steps/${s1}/reject`,
    { actor: "sc_a1", json: { reason: "Records incomplete." } },
  );
  assertEquals(r1.step_state,  "Rejected");
  assertEquals(r1.chain_state, "Rejected");
  assertEquals(r1.trailing,    false);

  // Final chain shape
  const { body: final } = await httpGet<ChainView>(`/chains/${cid}`);
  assertEquals(final.state, "Rejected");

  const finalS1 = final.steps.find((s) => s.approver_ref === "sc_a1")!;
  const finalS2 = final.steps.find((s) => s.approver_ref === "sc_a2")!;

  assertEquals(finalS1.state, "Rejected");
  assertEquals(
    finalS2.state,
    "Pending",
    "Rejected chain must NOT cascade-withdraw the trailing Pending step",
  );
  assertEquals(
    finalS2.assignment?.state,
    "Recalled",
    "sc_a2 assignment must be Recalled even though the step stays Pending",
  );

  // Audit trail shape
  const { body: events } = await httpGet<AuditEvent[]>(`/audit?chain_id=${cid}`);
  assertEquals(events.length, 3, "chain_initiated + step_rejected + chain_resolved");
  const actionRefs = events.map((e) => e.action_ref).sort();
  assertEquals(actionRefs, [
    "chain_initiated",
    "chain_resolved",
    "step_rejected",
  ].sort());

  // No step_withdrawn events (Rejected does not cascade-withdraw)
  assertEquals(
    events.some((e) => e.action_ref === "step_withdrawn"),
    false,
    "step_withdrawn must NOT appear for a Rejected chain",
  );
});

// ---------------------------------------------------------------------------
// Scenario 5: tamper + verify
//   - Create a small chain (one approver) and approve it.
//   - GET /audit/:id/verify on the genesis event → { verified: true }.
//   - POST /admin/tamper?dev=1 mutates data_json for that event.
//   - GET /audit/:id/verify again → { verified: false, result: "failed-…" }.
//
//   This exercises the full HTTP path for both the tamper helper (admin.ts)
//   and the verify endpoint (audit.ts), wiring them to the same live DB.
// ---------------------------------------------------------------------------
Deno.test("scenario 5 — tamper: POST /admin/tamper mutates row; GET /audit/:id/verify fails", async () => {
  // Create a chain with a single approver and approve it (two audit events).
  const { body: created } = await httpPost<{ chain_id: string }>("/chains", {
    json: {
      subject_ref:  "sc5-tamper-verify",
      scope:        "test-scope-tamper",
      quorum_kind:  "all-of-N",
      approver_set: ["sc_a1"],
    },
  });
  const cid = created.chain_id;

  const { body: chain0 } = await httpGet<ChainView>(`/chains/${cid}`);
  const s1 = stepOf(chain0, "sc_a1");
  await httpPost(`/chains/${cid}/steps/${s1}/approve`, { actor: "sc_a1" });

  // Fetch audit events for this chain and pick the genesis (chain_initiated) row.
  // Events are returned newest-first; find by action_ref.
  const { body: events } = await httpGet<AuditEvent[]>(`/audit?chain_id=${cid}`, { actor: "sc_a1" });
  const genesis = events.find((e) => e.action_ref === "chain_initiated");
  assertEquals(genesis !== undefined, true, "chain_initiated audit event must exist");
  const event_id = genesis!.event_id;

  // ── Before tamper: verify must pass ──────────────────────────────────────
  const { body: before } = await httpGet<VerifyResult>(`/audit/${event_id}/verify`);
  assertEquals(before.verified, true,       "untampered event must verify as clean");
  assertEquals(before.result,   "verified", "result must be exactly 'verified'");

  // ── Tamper: POST /admin/tamper?dev=1 (form body) ──────────────────────────
  // admin.ts uses c.req.parseBody(), so form-encoded body is required.
  const { status: ts, body: tb } = await httpPost<{ ok: boolean }>(
    `/admin/tamper?dev=1`,
    { form: { event_id: String(event_id) } },
  );
  assertEquals(ts, 200, "tamper endpoint should return 200");
  assertEquals((tb as { ok: boolean }).ok, true, "tamper response must carry ok:true");

  // ── After tamper: verify must detect the corruption ───────────────────────
  // verify_record recomputes the HMAC attestation from the stored data_json.
  // The mutated data_json no longer matches the stored attestation → mismatch.
  const { body: after } = await httpGet<VerifyResult>(`/audit/${event_id}/verify`);
  assertEquals(after.verified, false, "tampered event must fail verification");
  assertMatch(
    after.result,
    /^failed-verification\(seq \d+: attestation mismatch\)$/,
    "failure detail must name the seq and the attestation mismatch",
  );
});
