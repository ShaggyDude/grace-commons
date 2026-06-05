// tools/conformance/ghost/tests/runner.test.mjs
//   node --test tools/conformance/ghost/tests/
//
// Unit tests for the render-agnostic ghost engine, exercised with a MOCK
// adapter (no Deno, no jsr) so the engine — ref resolution, binding, sequencing,
// per-actor routing — is verified independently of any render.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRefs, runScenario } from "../runner.mjs";
import { scenario as fullLifecycle } from "../scenarios/full-lifecycle.mjs";

test("resolveRefs walks $bind.path and leaves literals alone", () => {
  const b = { inv: { token: "abc" }, maya: { actor_id: 3 } };
  assert.equal(resolveRefs("$inv.token", b), "abc");
  assert.equal(resolveRefs("$maya.actor_id", b), 3);
  assert.equal(resolveRefs("literal", b), "literal");
  assert.deepEqual(resolveRefs({ a: "$inv.token", b: 7 }, b), { a: "abc", b: 7 });
});

test("resolveRefs throws on an unresolved reference", () => {
  assert.throws(() => resolveRefs("$nope.x", {}), /unresolved reference/);
});

/** A mock adapter that records calls and returns synthetic ids. */
function mockAdapter() {
  const calls = [];
  let nextActor = 1, nextGrant = 100, nextSubject = 500, nextVisit = 900;
  const seen = new Set();
  return {
    calls,
    authenticate(actor, args) { calls.push(["authenticate", actor, args]); seen.add(actor); return { actor_id: nextActor++ }; },
    invite(actor, args) { calls.push(["invite", actor, args]); return { invitation_id: 1, token: "tok-xyz" }; },
    onboard(actor, args) { calls.push(["onboard", actor, args]); seen.add(actor); return { actor_id: nextActor++ }; },
    grant(actor, args) { calls.push(["grant", actor, args]); return { grant_id: nextGrant++ }; },
    revokeGrant(actor, args) { calls.push(["revokeGrant", actor, args]); return {}; },
    enrollSubject(actor, args) { calls.push(["enrollSubject", actor, args]); return { subject_id: nextSubject++, subject_code: "BCN-001" }; },
    recordVisit(actor, args) { calls.push(["recordVisit", actor, args]); return { visit_id: nextVisit++ }; },
    signOut(actor) { calls.push(["signOut", actor]); return {}; },
    close() {},
  };
}

test("runScenario executes the full lifecycle, threading bindings across steps", async () => {
  const a = mockAdapter();
  const bindings = await runScenario(fullLifecycle, a);

  // 10 steps ran in order.
  assert.equal(a.calls.length, 10);
  assert.deepEqual(a.calls.map((c) => c[0]), [
    "authenticate", "invite", "onboard", "grant", "grant",
    "enrollSubject", "recordVisit", "revokeGrant", "authenticate", "signOut",
  ]);

  // onboard received the token bound from invite.
  const onboard = a.calls.find((c) => c[0] === "onboard");
  assert.equal(onboard[2].token, "tok-xyz");

  // both grants received Maya's actor_id (bound from onboard).
  const grants = a.calls.filter((c) => c[0] === "grant");
  assert.equal(grants[0][2].grantee, bindings.maya.actor_id);
  assert.equal(grants[1][2].grantee, bindings.maya.actor_id);

  // recordVisit got the subject_id bound from enrollSubject.
  const visit = a.calls.find((c) => c[0] === "recordVisit");
  assert.equal(visit[2].subject, bindings.subj.subject_id);

  // revokeGrant targeted the second grant's id.
  const revoke = a.calls.find((c) => c[0] === "revokeGrant");
  assert.equal(revoke[2].grant, bindings.g2.grant_id);
});

test("runScenario reports the failing step with context", async () => {
  const a = mockAdapter();
  a.grant = () => { throw new Error("boom"); };
  await assert.rejects(
    runScenario(fullLifecycle, a),
    /step 4 \(PI grant\) failed: boom/,
  );
});

test("runScenario rejects an unknown action", async () => {
  await assert.rejects(
    runScenario([{ actor: "X", action: "teleport", args: {} }], mockAdapter()),
    /adapter has no such action/,
  );
});
