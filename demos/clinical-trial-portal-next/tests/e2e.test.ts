// tests/e2e.test.ts
//
// End-to-end lifecycle test: login → invite → accept → grant → enroll → visit →
// revoke → (CRA) login → logout → audit verify.
//
// Ported from render 1 (demos/clinical-trial-portal/tests/e2e.test.ts), adapted
// to render 2's async / Postgres (pglite) shape. The load-bearing structural
// difference between the renders:
//
//   • Render 1 booted the full Hono route graph and drove the lifecycle over HTTP
//     (app.request(), form POSTs, status codes, Set-Cookie session extraction).
//   • Render 2 has ONE mutation surface — composition.ts. There are no routes to
//     boot and no HTTP status codes to assert. We drive the composition functions
//     directly: login / issueInvitation / acceptInvitation / grantPermission /
//     enrollSubject / recordVisit / revokeGrant / logout. The coverage intent is
//     preserved (every lifecycle step + the full audit-event set + chain verify);
//     the HTTP assertions are re-expressed as return-value + DB-state + event-log
//     assertions against render 2's real API.
//
// ctx model — mirrors the conformance actions adapter's per-actor ctx map
// (tools/conformance/ghost/adapters/clinical-trial-portal-next.actions.mjs): each
// actor (PI, Maya, CRA) carries its OWN { actor, session } ctx. login() and
// acceptInvitation() MUTATE the ctx they are handed (composition.ts writes
// tx.ctx.actor / tx.ctx.session, and tx.ctx is the same object passed to withTx),
// so after login(piCtx, …) the PI's actor/session live on piCtx and attribute
// every subsequent PI action in the audit log.
//
// Seeding — render 1 seeded PI + CRA via domain helpers directly inside the test
// (the documented "Bootstrap Identity" seam). We do the same, mirroring
// scripts/seed.ts's minimal roster (parties → actors → credentials → permissions
// → grants → study). We deliberately do NOT append the seed's backdated
// study.registered genesis event: this test walks the lifecycle and asserts the
// event log is EXACTLY the lifecycle's events in order, so the chain begins with
// the PI's first login.succeeded. Bootstrap rows emit no audit events (the seam),
// which is exactly what makes that exact-order assertion clean.

import { test } from "node:test";
import assert from "node:assert/strict";

import { withTestDb } from "./_helpers.ts";
import { db, type Ctx } from "../lib/db.ts";
import * as composition from "../composition.ts";
import { hashPassword } from "../lib/password.ts";
import * as parties from "../domain/parties.ts";
import * as actors from "../domain/actors.ts";
import * as credentials from "../domain/credentials.ts";
import * as permissions from "../domain/permissions.ts";
import * as grants from "../domain/grants.ts";
import * as studies from "../domain/studies.ts";
import * as invitations from "../domain/invitations.ts";
import * as subjects from "../domain/subjects.ts";
import * as visits from "../domain/visits.ts";
import * as retention from "../domain/retention_policy.ts";
import { verifyChain, listAll, type EventRow } from "../domain/event_log.ts";

// ---------------------------------------------------------------------------
// Seed helpers — the "Bootstrap Identity" seam (no audit events for seeded rows).
// Mirrors scripts/seed.ts's roster: 5 permissions, study BCN-OX-201, retention
// policy with enforcement OFF (so the full chain stays visible), PI Anya (all 5
// permissions, self-granted) and CRA Jordan (view_audit, granted by the PI).
// ---------------------------------------------------------------------------

const PERMS: [string, string][] = [
  ["invite_actor", "Invite a coordinator"],
  ["grant_permission", "Manage grants on others"],
  ["enroll_subject", "Enroll a subject into the protocol"],
  ["record_visit", "Record a study visit"],
  ["view_audit", "View the audit log"],
];

/** Seed the static catalog (permissions + study + retention). Returns the study
 *  and a code→permission_id map. */
async function seedCatalog() {
  const permMap: Record<string, number> = {};
  for (const [code, label] of PERMS) {
    permMap[code] = (await permissions.create(db, code, label)).id;
  }
  const study = await studies.create(db, "BCN-OX-201", "Beacon Oncology Phase II Trial");
  await retention.ensure(db, 2555, false); // enforcement OFF — full chain visible, matches seed.ts
  return { study, permMap };
}

/** Bootstrap an account directly (no audit events — the seam). Returns the actor. */
async function bootstrapAccount(
  email: string,
  name: string,
  password: string,
  permMap: Record<string, number>,
  grantSpecs: [string, "all" | "own"][],
  grantorActorId?: number,
) {
  const party = await parties.create(db, email, name);
  const actor = await actors.create(db, party.id);
  await credentials.create(db, actor.id, "password", await hashPassword(password));
  for (const [code, scope] of grantSpecs) {
    await grants.create(db, {
      grantor_actor_id: grantorActorId ?? actor.id, // self-grant unless a grantor is given
      grantee_actor_id: actor.id,
      permission_id: permMap[code],
      scope,
    });
  }
  return actor;
}

/** The ordered list of `action` strings the event log holds after a clean run of
 *  the full lifecycle. Bootstrap rows emit nothing, so the chain begins with the
 *  PI's first login.succeeded and is exactly these, in this order. */
const EXPECTED_ACTIONS = [
  "login.succeeded",     // 1. PI logs in
  "invitation.issued",   // 2. PI invites Maya
  "invitation.accepted", // 3. Maya accepts ─┐
  "actor.enrolled",      //                  │ acceptInvitation emits four events,
  "credential.created",  //                  │ in this fixed order
  "session.opened",      // 3. …            ─┘
  "grant.issued",        // 4. PI grants enroll_subject
  "grant.issued",        // 5. PI grants record_visit
  "subject.enrolled",    // 6. Maya enrolls BCN-001
  "visit.recorded",      // 7. Maya records the screening visit
  "grant.revoked",       // 8. PI revokes the record_visit grant
  "login.succeeded",     // 9. CRA logs in
  "session.revoked",     // 10. PI logs out
] as const;

// ---------------------------------------------------------------------------
// Main e2e test — the full domain lifecycle against a running store, end to end,
// then verify the audit chain + the full audit-event set.
// ---------------------------------------------------------------------------

test("e2e: login → invite → accept → grant → enroll → visit → revoke → logout → audit verify", async () => {
  await withTestDb(async (_ctx, _db) => {
    // ── 0. Seed: permissions + study + retention + PI + CRA ────────────────────

    const { study, permMap } = await seedCatalog();

    const anyaActor = await bootstrapAccount(
      "anya@beacon.clinical",
      "Dr. Anya Okonkwo",
      "demo-pi",
      permMap,
      [
        ["invite_actor", "all"],
        ["grant_permission", "all"],
        ["enroll_subject", "all"],
        ["record_visit", "all"],
        ["view_audit", "all"],
      ],
    );

    // CRA Jordan — view_audit only, granted BY the PI (grantor = PI actor).
    const jordanActor = await bootstrapAccount(
      "jordan@beacon.clinical",
      "Jordan Lee",
      "demo-cra",
      permMap,
      [["view_audit", "all"]],
      anyaActor.id,
    );

    // No audit events from the bootstrap seam — the log starts empty.
    assert.equal((await listAll(db)).length, 0, "bootstrap rows emit no audit events");

    // Per-actor ctx objects — one each, mirroring the actions adapter's ctxByActor.
    const piCtx: Ctx = { actor: null, session: null };
    const mayaCtx: Ctx = { actor: null, session: null };
    const craCtx: Ctx = { actor: null, session: null };

    // ── 1. PI logs in ──────────────────────────────────────────────────────────
    // Render 1 asserted a 302 → /dashboard and a Set-Cookie session. Render 2's
    // login() returns {ok, session} and mutates piCtx (sets actor + session).

    const piLogin = await composition.login(piCtx, { email: "anya@beacon.clinical", password: "demo-pi" });
    assert.ok(piLogin.ok, "PI login should succeed");
    assert.ok(piLogin.ok && piLogin.session != null, "PI login should return a session");
    assert.ok(piCtx.session != null, "login() should set ctx.session");
    assert.equal(piCtx.actor?.id, anyaActor.id, "login() should attribute the ctx to the PI actor");

    // login.succeeded attributed to the PI.
    {
      const evs = (await listAll(db)).filter((e) => e.action === "login.succeeded");
      assert.equal(evs.length, 1, "exactly one login.succeeded after PI login");
      assert.equal(evs[0].actor_id, anyaActor.id);
    }

    // ── 2. PI issues an invitation for Maya Chen ───────────────────────────────
    // Render 1: form POST /invitations → 302 /people, token only in the DB.
    // Render 2: issueInvitation(ctx, {email, display_name, intended_role}) → Invitation.

    const inv = await composition.issueInvitation(piCtx, {
      email: "maya@beacon.clinical",
      display_name: "Maya Chen",
      intended_role: "study_coordinator",
    });
    assert.ok(inv.id != null, "issueInvitation returns the created invitation");
    assert.ok(inv.token != null, "invitation carries a bearer token");

    // Exactly one pending invitation; the returned token matches the DB row.
    const pending = await invitations.listPending(db);
    assert.equal(pending.length, 1, "exactly one pending invitation after PI invites Maya");
    assert.equal(pending[0].token, inv.token);

    // invitation.issued committed and attributed to the PI.
    {
      const issued = (await listAll(db)).filter((e) => e.action === "invitation.issued");
      assert.equal(issued.length, 1);
      assert.equal(issued[0].actor_id, anyaActor.id);
      assert.equal(issued[0].target_id, inv.id);
    }

    // ── 3. Maya accepts the invitation and sets her password ───────────────────
    // Render 1: GET accept form (200) then POST → 302 /dashboard + Set-Cookie.
    // Render 2: acceptInvitation(ctx, {token, password}) → {actor, session},
    // mutating mayaCtx. There is no accept-form GET surface in the composition.

    const accept = await composition.acceptInvitation(mayaCtx, {
      token: inv.token,
      password: "maya-demo-pw",
    });
    assert.ok(accept.actor != null, "acceptInvitation returns the new actor");
    assert.ok(accept.session != null, "acceptInvitation returns the new session");
    assert.equal(mayaCtx.actor?.id, accept.actor.id, "acceptInvitation should set ctx.actor to Maya");
    assert.ok(mayaCtx.session != null, "acceptInvitation should set ctx.session");

    // Maya's party + actor exist; the new actor is the one bound to her party.
    const mayaParty = await parties.getByEmail(db, "maya@beacon.clinical");
    assert.ok(mayaParty != null, "party row should exist for maya@beacon.clinical");
    const mayaActor = await actors.getByPartyId(db, mayaParty!.id);
    assert.ok(mayaActor != null, "actor row should exist for Maya");
    assert.equal(mayaActor!.id, accept.actor.id);

    // The invitation is now marked accepted by Maya's actor.
    const acceptedInv = await invitations.getById(db, inv.id);
    assert.ok(acceptedInv?.accepted_at != null, "invitation should be marked accepted");
    assert.equal(acceptedInv?.accepted_by_actor_id, mayaActor!.id);

    // The four onboarding events are all present, attributed to Maya + her session.
    {
      const all = await listAll(db);
      const byAction = (a: string) => all.filter((e) => e.action === a);
      for (const action of ["invitation.accepted", "actor.enrolled", "credential.created", "session.opened"]) {
        assert.equal(byAction(action).length, 1, `expected exactly one '${action}' after onboarding`);
        assert.equal(byAction(action)[0].actor_id, mayaActor!.id, `'${action}' should be attributed to Maya`);
        assert.equal(byAction(action)[0].session_id, accept.session.id, `'${action}' should carry Maya's session`);
      }
    }

    // ── 4 & 5. PI grants enroll_subject and record_visit to Maya ───────────────
    // Render 1 granted record_visit at scope 'own'. Render 2's canonical lifecycle
    // (scenarios/full-lifecycle.mjs) grants BOTH at scope 'all' — scope filtering
    // lives in the read/route layer, not in this composition surface, so the
    // lifecycle walk uses 'all' for both. We follow the render-2 canonical scope.

    const g1 = await composition.grantPermission(piCtx, {
      grantee_actor_id: mayaActor!.id,
      permission_id: permMap["enroll_subject"],
      scope: "all",
    });
    assert.ok(g1.id != null, "grantPermission(enroll_subject) returns the grant");

    const g2 = await composition.grantPermission(piCtx, {
      grantee_actor_id: mayaActor!.id,
      permission_id: permMap["record_visit"],
      scope: "all",
    });
    assert.ok(g2.id != null, "grantPermission(record_visit) returns the grant");

    // Two grant.issued events, both attributed to the PI.
    {
      const granted = (await listAll(db)).filter((e) => e.action === "grant.issued");
      assert.equal(granted.length, 2, "two grant.issued events — enroll_subject and record_visit");
      assert.equal(granted[0].actor_id, anyaActor.id);
      assert.equal(granted[1].actor_id, anyaActor.id);
      assert.deepEqual([granted[0].target_id, granted[1].target_id], [g1.id, g2.id]);
    }

    // ── 6. Maya enrolls a subject (BCN-001) ────────────────────────────────────
    // Render 1: POST /subjects with the study hardcoded; code derived as "BCN-001".
    // Render 2: enrollSubject(ctx, {study_id, prefix}); code = prefix + "-" +
    // (COUNT+1, zero-padded to 3) → "BCN-001" for the first subject.

    const subject = await composition.enrollSubject(mayaCtx, { study_id: study.id, prefix: "BCN" });
    assert.equal(subject.subject_code, "BCN-001", "first BCN subject is BCN-001");
    assert.equal(subject.enrolled_by_actor_id, mayaActor!.id, "subject enrolled by Maya");

    // The subject is in the DB under the seeded study.
    const subjectList = await subjects.listByStudy(db, study.id);
    assert.equal(subjectList.length, 1);
    assert.equal(subjectList[0].subject_code, "BCN-001");
    assert.equal(subjectList[0].enrolled_by_actor_id, mayaActor!.id);

    // subject.enrolled attributed to Maya, targeting the new subject.
    {
      const enrolled = (await listAll(db)).filter((e) => e.action === "subject.enrolled");
      assert.equal(enrolled.length, 1);
      assert.equal(enrolled[0].actor_id, mayaActor!.id);
      assert.equal(enrolled[0].target_id, subject.id);
    }

    // ── 7. Maya records the screening visit ────────────────────────────────────
    // Render 1: POST /subjects/:id/visits with visit_kind 'screening'.
    // Render 2: recordVisit(ctx, {subject_id, visit_kind}).

    const visit = await composition.recordVisit(mayaCtx, { subject_id: subject.id, visit_kind: "screening" });
    assert.equal(visit.visit_kind, "screening");
    assert.equal(visit.recorded_by_actor_id, mayaActor!.id, "visit recorded by Maya");

    // The visit row exists for the subject.
    const visitList = await visits.listBySubject(db, subject.id);
    assert.equal(visitList.length, 1);
    assert.equal(visitList[0].visit_kind, "screening");
    assert.equal(visitList[0].recorded_by_actor_id, mayaActor!.id);

    // visit.recorded attributed to Maya, targeting the new visit.
    {
      const recorded = (await listAll(db)).filter((e) => e.action === "visit.recorded");
      assert.equal(recorded.length, 1);
      assert.equal(recorded[0].actor_id, mayaActor!.id);
      assert.equal(recorded[0].target_id, visit.id);
    }

    // ── 8. PI revokes the record_visit grant ───────────────────────────────────
    // Render 2's canonical lifecycle includes a revocation (scenario step 8). The
    // composition's revokeGrant(ctx, {grant_id, reason}) emits grant.revoked.

    await composition.revokeGrant(piCtx, { grant_id: g2.id, reason: "demo: role change" });

    // The grant is now revoked in the DB, with the reason recorded.
    const revokedGrant = await grants.getById(db, g2.id);
    assert.ok(revokedGrant?.revoked_at != null, "record_visit grant should be revoked");
    assert.equal(revokedGrant?.revoke_reason, "demo: role change");

    // grant.revoked attributed to the PI, targeting g2.
    {
      const revoked = (await listAll(db)).filter((e) => e.action === "grant.revoked");
      assert.equal(revoked.length, 1);
      assert.equal(revoked[0].actor_id, anyaActor.id);
      assert.equal(revoked[0].target_id, g2.id);
    }

    // ── 9. CRA logs in ─────────────────────────────────────────────────────────
    // Render 1: CRA form login → 302 /dashboard + Set-Cookie, then GET /audit/verify.
    // Render 2: login() into craCtx; the chain is verified directly below.

    const craLogin = await composition.login(craCtx, { email: "jordan@beacon.clinical", password: "demo-cra" });
    assert.ok(craLogin.ok, "CRA login should succeed");
    assert.equal(craCtx.actor?.id, jordanActor.id, "login() should attribute the ctx to the CRA actor");

    // Two login.succeeded events now (PI step 1 + CRA step 9).
    {
      const logins = (await listAll(db)).filter((e) => e.action === "login.succeeded");
      assert.equal(logins.length, 2, "two login.succeeded — PI and CRA");
      assert.deepEqual([logins[0].actor_id, logins[1].actor_id], [anyaActor.id, jordanActor.id]);
    }

    // ── 10. PI logs out ────────────────────────────────────────────────────────
    // Render 2: logout(ctx) revokes the active session and emits session.revoked.

    const piSessionId = piCtx.session!.id;
    await composition.logout(piCtx);

    // session.revoked attributed to the PI, targeting the PI's session.
    {
      const revoked = (await listAll(db)).filter((e) => e.action === "session.revoked");
      assert.equal(revoked.length, 1);
      assert.equal(revoked[0].actor_id, anyaActor.id);
      assert.equal(revoked[0].target_id, piSessionId);
    }

    // ── 11. Audit chain verifies, and the event set is exactly the lifecycle ───
    // Render 1: GET /audit/verify renders "Verified" + verifyChain(db).ok === true.
    // Render 2: verifyChain(db) returns {ok:true, count:N}. There is NO audit-view
    // mutation surface in the composition (render 1's audit.viewed came from the
    // GET /audit route, which does not exist here), so the view-page assertions
    // are dropped and the chain is verified directly against the store.

    const allEvents: EventRow[] = await listAll(db);

    // Exact ordered action sequence — strictly stronger than render 1's set check.
    assert.deepEqual(
      allEvents.map((e) => e.action),
      [...EXPECTED_ACTIONS],
      "event log holds exactly the lifecycle's actions, in order",
    );

    // Every required action is present (kept as an explicit coverage guard so a
    // future regression where a composition fn stops emitting an event is caught).
    const present = new Set(allEvents.map((e) => e.action));
    for (const action of [
      "login.succeeded",
      "invitation.issued",
      "invitation.accepted",
      "actor.enrolled",
      "credential.created",
      "session.opened",
      "grant.issued",
      "subject.enrolled",
      "visit.recorded",
      "grant.revoked",
      "session.revoked",
    ]) {
      assert.ok(present.has(action), `expected action '${action}' in event log after full lifecycle`);
    }

    // The hash chain is cryptographically intact through the full lifecycle, and
    // its count matches the number of events the lifecycle produced.
    const chain = await verifyChain(db);
    assert.equal(chain.ok, true, "verifyChain() should pass after the full lifecycle");
    assert.equal(chain.ok && chain.count, EXPECTED_ACTIONS.length, "verifyChain count equals the lifecycle event count");
  });
});

// ---------------------------------------------------------------------------
// Rejection-path coverage.
//
// Render 1's second e2e test was an own-scope GET /subjects/:id 404 guard — a
// route-layer authorization check. Render 2 has no routes and no scope-404 surface
// in its single mutation surface (scope filtering lives in the read/route layer,
// not composition.ts), so that test cannot be ported faithfully against the
// composition. To preserve the file's happy-path-AND-rejection-path coverage
// intent (the authoring convention), it is re-expressed against the rejection
// surfaces the composition DOES expose: login on a bad password, and
// acceptInvitation on an already-resolved token.
// ---------------------------------------------------------------------------

test("rejection: login returns invalid_credentials for a wrong password (no session, no login.succeeded)", async () => {
  await withTestDb(async (_ctx, _db) => {
    const permMap: Record<string, number> = {};
    for (const [code, label] of PERMS) permMap[code] = (await permissions.create(db, code, label)).id;
    const actor = await bootstrapAccount("anya@beacon.clinical", "Dr. Anya Okonkwo", "demo-pi", permMap, [
      ["invite_actor", "all"],
    ]);

    const ctx: Ctx = { actor: null, session: null };
    const res = await composition.login(ctx, { email: "anya@beacon.clinical", password: "wrong-password" });

    // The generic reason is returned; the specific cause is only in the audit log.
    assert.equal(res.ok, false, "wrong password must not authenticate");
    assert.equal(!res.ok && res.reason, "invalid_credentials");
    assert.equal(ctx.actor, null, "a failed login must not set ctx.actor");
    assert.equal(ctx.session, null, "a failed login must not set ctx.session");

    // A login.failed event is recorded; no login.succeeded was emitted.
    const all = await listAll(db);
    assert.equal(all.filter((e) => e.action === "login.failed").length, 1, "login.failed recorded");
    assert.equal(all.filter((e) => e.action === "login.succeeded").length, 0, "no login.succeeded on failure");
    // The failed-login event is anonymous (no actor attribution at the failure point).
    assert.equal(all.find((e) => e.action === "login.failed")!.actor_id, null);
    // Sanity: an unknown email is also rejected with the same generic reason.
    const unknown = await composition.login(ctx, { email: "nobody@beacon.clinical", password: "x" });
    assert.equal(!unknown.ok && unknown.reason, "invalid_credentials");

    // The chain stays intact across failure events too.
    const chain = await verifyChain(db);
    assert.equal(chain.ok, true, "verifyChain() should pass with login.failed events in the log");
    // Actor was bootstrapped (proves the failure was a password mismatch, not a missing account).
    assert.ok(await actors.getById(db, actor.id));
  });
});

test("rejection: acceptInvitation rejects an already-accepted token (single-resolution lifecycle)", async () => {
  await withTestDb(async (_ctx, _db) => {
    const permMap: Record<string, number> = {};
    for (const [code, label] of PERMS) permMap[code] = (await permissions.create(db, code, label)).id;
    const pi = await bootstrapAccount("anya@beacon.clinical", "Dr. Anya Okonkwo", "demo-pi", permMap, [
      ["invite_actor", "all"],
    ]);

    const piCtx: Ctx = { actor: null, session: null };
    await composition.login(piCtx, { email: "anya@beacon.clinical", password: "demo-pi" });

    const inv = await composition.issueInvitation(piCtx, {
      email: "maya@beacon.clinical",
      display_name: "Maya Chen",
      intended_role: "study_coordinator",
    });

    // First acceptance succeeds.
    const mayaCtx: Ctx = { actor: null, session: null };
    await composition.acceptInvitation(mayaCtx, { token: inv.token, password: "maya-demo-pw" });

    // A second acceptance of the SAME token must be rejected (invitation is a
    // single-resolution artifact: Pending → Accepted | Expired | Revoked).
    const intruderCtx: Ctx = { actor: null, session: null };
    await assert.rejects(
      () => composition.acceptInvitation(intruderCtx, { token: inv.token, password: "intruder-pw" }),
      /already resolved/,
      "re-accepting a resolved invitation must reject",
    );
    // The rejected attempt left the intruder ctx untouched.
    assert.equal(intruderCtx.actor, null, "a rejected acceptInvitation must not set ctx.actor");
    assert.equal(intruderCtx.session, null, "a rejected acceptInvitation must not set ctx.session");

    // An unknown token is rejected too.
    await assert.rejects(
      () => composition.acceptInvitation({ actor: null, session: null }, { token: "no-such-token", password: "x" }),
      /not found/,
    );

    // Exactly one actor was created from the invitation (the rejected re-accept
    // committed nothing — withTx rolled back). PI + Maya = 2 actors total.
    assert.equal((await actors.listAll(db)).length, 2, "only the first acceptance created an actor");
    assert.ok(pi); // PI bootstrapped; referenced to keep the binding meaningful.

    // Chain intact after the successful onboard + the rejected re-accept.
    const chain = await verifyChain(db);
    assert.equal(chain.ok, true, "verifyChain() should pass; the rejected re-accept appended nothing");
  });
});
