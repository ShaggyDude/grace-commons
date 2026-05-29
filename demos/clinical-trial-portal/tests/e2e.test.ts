// tests/e2e.test.ts
//
// End-to-end lifecycle test: invite → accept → grant → enroll → visit → audit verify
//
// Strategy: boot the full Hono route graph against a fresh in-memory SQLite DB
// (no file I/O, no real server port). Use Hono's built-in app.request() for all
// HTTP interactions. Seed PI and CRA via domain helpers directly — this mirrors
// what seed.ts does in production and is documented as the "Bootstrap Identity"
// seam (§8 decision #8).
//
// The test walks the five-actor scenario from the plan's Domain Story (§1):
//   Anya (PI)  →  invites Maya (SC)  →  Maya accepts, is granted permissions
//   →  Maya enrolls BCN-001  →  Maya records screening visit
//   →  Jordan (CRA) logs in, verifies the chain
//
// Assertions cover:
//   - HTTP status codes for every step
//   - DB state at each mutation (actor created, invitation accepted, grants issued,
//     subject enrolled, visit recorded)
//   - Event log actions — every action in the planned set is present
//   - verifyChain returns ok:true (hash chain intact through the full lifecycle)
//   - GET /audit/verify renders "Verified" in the HTML body

import { assertEquals, assertExists, assertMatch } from "jsr:@std/assert";
import { Hono } from "hono";
import type { Context } from "hono";
import { openDb, type DB } from "../lib/db.ts";
import type { AppEnv } from "../lib/env.ts";
import { authRouter } from "../routes/auth.ts";
import { invitationsRouter } from "../routes/invitations.ts";
import { dashboardRouter } from "../routes/dashboard.ts";
import { peopleRouter } from "../routes/people.ts";
import { subjectsRouter } from "../routes/subjects.ts";
import { auditRouter } from "../routes/audit.ts";
import * as parties from "../domain/parties.ts";
import * as actors from "../domain/actors.ts";
import * as credentials from "../domain/credentials.ts";
import * as grants from "../domain/grants.ts";
import * as permissions from "../domain/permissions.ts";
import * as studies from "../domain/studies.ts";
import * as invitations from "../domain/invitations.ts";
import * as subjects from "../domain/subjects.ts";
import * as visits from "../domain/visits.ts";
import * as eventLog from "../domain/event_log.ts";
import * as retentionPolicy from "../domain/retention_policy.ts";
import { hashPassword } from "../lib/password.ts";

// ---------------------------------------------------------------------------
// Migration SQL — read once at module load.
// ---------------------------------------------------------------------------

const MIGRATION_SQL = Deno.readTextFileSync(
  new URL("../migrations/0001_init.sql", import.meta.url),
);

// ---------------------------------------------------------------------------
// Test app factory.
//
// Mirrors main.ts's route graph but replaces the per-request DB open/close with
// a shared in-memory instance. A shared DB is necessary because SQLite's
// ":memory:" creates an isolated DB on every openDb() call — per-request opens
// would give each request an empty database.
// ---------------------------------------------------------------------------

function buildTestApp(db: DB): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // DB middleware: always return the shared test DB, never close it mid-request.
  app.use("*", async (c: Context<AppEnv>, next) => {
    c.set("db", db);
    await next();
  });

  app.get("/", (c) => c.redirect("/login"));
  app.route("/", authRouter);
  app.route("/", invitationsRouter);
  app.route("/", dashboardRouter);
  app.route("/", peopleRouter);
  app.route("/", subjectsRouter);
  app.route("/", auditRouter);
  app.notFound((c) => c.text("Not Found", 404));

  return app;
}

// ---------------------------------------------------------------------------
// HTTP helpers.
// ---------------------------------------------------------------------------

/** Submit a form-encoded POST, optionally with a session cookie. */
function formPost(
  app: Hono<AppEnv>,
  path: string,
  fields: Record<string, string>,
  cookie?: string,
) {
  const body = new URLSearchParams(fields).toString();
  return app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
  });
}

/** GET with an optional session cookie. */
function get(
  app: Hono<AppEnv>,
  path: string,
  cookie?: string,
) {
  return app.request(path, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

/** Extract the `session=TOKEN` value from a Set-Cookie header. */
function sessionCookie(res: Response): string | null {
  const header = res.headers.get("set-cookie");
  if (!header) return null;
  const m = header.match(/session=([^;]+)/);
  return m ? `session=${m[1]}` : null;
}

// ---------------------------------------------------------------------------
// Main e2e test.
// ---------------------------------------------------------------------------

Deno.test("e2e: invite → accept → grant → enroll → visit → audit verify", async () => {
  // ── 0. Setup: in-memory DB + seed ─────────────────────────────────────────

  const db = openDb(":memory:");
  db.exec(MIGRATION_SQL);
  retentionPolicy.ensureDefault(db);

  // Seed permissions catalog.
  const CODES = [
    "invite_actor",
    "grant_permission",
    "enroll_subject",
    "record_visit",
    "view_audit",
  ] as const;
  const permMap: Record<string, number> = {};
  for (const code of CODES) {
    permMap[code] = permissions.create(db, code, code).id;
  }

  // Seed study (required by subjects routes — hardcoded protocol "BCN-OX-201").
  studies.create(db, "BCN-OX-201", "Beacon Oncology Phase II Trial");

  // Seed PI: Dr. Anya Okonkwo
  const anyaParty = parties.create(db, "anya@beacon.clinical", "Dr. Anya Okonkwo");
  const anyaActor = actors.create(db, anyaParty.id);
  credentials.create(db, anyaActor.id, "password", await hashPassword("demo-pi"));
  for (const code of CODES) {
    grants.create(db, {
      grantor_actor_id: anyaActor.id,
      grantee_actor_id: anyaActor.id,
      permission_id: permMap[code],
      scope: code === "view_audit" ? "all" : "all",
    });
  }

  // Seed CRA: Jordan Lee (view_audit, scope=all, granted by PI)
  const jordanParty = parties.create(db, "jordan@beacon.clinical", "Jordan Lee");
  const jordanActor = actors.create(db, jordanParty.id);
  credentials.create(db, jordanActor.id, "password", await hashPassword("demo-cra"));
  grants.create(db, {
    grantor_actor_id: anyaActor.id,
    grantee_actor_id: jordanActor.id,
    permission_id: permMap["view_audit"],
    scope: "all",
  });

  const app = buildTestApp(db);

  // ── 1. PI logs in ──────────────────────────────────────────────────────────

  const piLoginRes = await formPost(app, "/login", {
    email: "anya@beacon.clinical",
    password: "demo-pi",
  });
  assertEquals(piLoginRes.status, 302, "PI login should redirect to /dashboard");
  assertEquals(piLoginRes.headers.get("location"), "/dashboard");
  const piCookie = sessionCookie(piLoginRes);
  assertExists(piCookie, "PI login should set session cookie");

  // ── 2. PI issues invitation for Maya Chen ──────────────────────────────────

  const inviteRes = await formPost(app, "/invitations", {
    email: "maya@example.com",
    display_name: "Maya Chen",
    intended_role: "study_coordinator",
  }, piCookie);
  assertEquals(inviteRes.status, 302, "Invite POST should redirect to /people");

  // Retrieve the invitation token from DB (not in HTTP response — by design).
  const pending = invitations.listPending(db);
  assertEquals(pending.length, 1, "Exactly one pending invitation after PI invites Maya");
  const invToken = pending[0].token;
  assertExists(invToken);

  // invitation.issued event was committed.
  const issuedEvents = eventLog.listFiltered(db, { action: "invitation.issued" });
  assertEquals(issuedEvents.length, 1);
  assertEquals(issuedEvents[0].actor_id, anyaActor.id);

  // ── 3. GET the accept form (unauthenticated) ───────────────────────────────

  const acceptGetRes = await get(app, `/invitations/accept/${invToken}`);
  assertEquals(acceptGetRes.status, 200, "Accept form should render for a valid token");

  // ── 4. Maya accepts invitation and sets her password ──────────────────────

  const acceptRes = await formPost(app, `/invitations/accept/${invToken}`, {
    password: "SecureMaya123!",
    confirm: "SecureMaya123!",
  });
  assertEquals(acceptRes.status, 302, "Accept POST should redirect to /dashboard");
  assertEquals(acceptRes.headers.get("location"), "/dashboard");
  const mayaCookie = sessionCookie(acceptRes);
  assertExists(mayaCookie, "Accept POST should set session cookie for Maya");

  // Maya's actor and party were created.
  const mayaParty = parties.getByEmail(db, "maya@example.com");
  assertExists(mayaParty, "Party row should exist for maya@example.com");
  const mayaActor = actors.getByPartyId(db, mayaParty!.id);
  assertExists(mayaActor, "Actor row should exist for Maya");

  // Invitation is marked accepted.
  const acceptedInv = invitations.getById(db, pending[0].id);
  assertExists(acceptedInv?.accepted_at, "Invitation should be marked accepted");
  assertEquals(acceptedInv?.accepted_by_actor_id, mayaActor!.id);

  // Onboarding audit events are all present.
  const allEventsAfterOnboard = eventLog.listAll(db);
  const actionSet = new Set(allEventsAfterOnboard.map((e) => e.action));
  for (const action of ["invitation.accepted", "actor.enrolled", "credential.created", "session.opened"]) {
    assertEquals(actionSet.has(action), true, `Expected '${action}' in event log after onboarding`);
  }

  // ── 5. PI grants enroll_subject and record_visit to Maya ──────────────────

  const grantEnrollRes = await formPost(app, "/grants", {
    grantee_actor_id: String(mayaActor!.id),
    permission_id: String(permMap["enroll_subject"]),
    scope: "all",
  }, piCookie);
  assertEquals(grantEnrollRes.status, 302);

  const grantVisitRes = await formPost(app, "/grants", {
    grantee_actor_id: String(mayaActor!.id),
    permission_id: String(permMap["record_visit"]),
    scope: "own",
  }, piCookie);
  assertEquals(grantVisitRes.status, 302);

  // Two grant.issued events (one per grant).
  const grantEvents = eventLog.listFiltered(db, { action: "grant.issued" });
  assertEquals(grantEvents.length, 2, "Two grant.issued events — enroll_subject and record_visit");

  // ── 6. Maya enrolls subject BCN-001 ───────────────────────────────────────

  const enrollRes = await formPost(app, "/subjects", {
    notes: "Baseline screening",
  }, mayaCookie);
  assertEquals(enrollRes.status, 302, "Enroll POST should redirect to subject detail");

  // Subject was created in the DB.
  const study = studies.getByProtocol(db, "BCN-OX-201");
  assertExists(study);
  const subjectList = subjects.listByStudy(db, study!.id);
  assertEquals(subjectList.length, 1);
  assertEquals(subjectList[0].subject_code, "BCN-001");
  assertEquals(subjectList[0].enrolled_by_actor_id, mayaActor!.id);

  // subject.enrolled event attributed to Maya.
  const enrollEventList = eventLog.listFiltered(db, { action: "subject.enrolled" });
  assertEquals(enrollEventList.length, 1);
  assertEquals(enrollEventList[0].actor_id, mayaActor!.id);

  // ── 7. Maya records the screening visit ───────────────────────────────────

  const subjectId = subjectList[0].id;
  const visitRes = await formPost(app, `/subjects/${subjectId}/visits`, {
    visit_kind: "screening",
    notes: "Baseline vitals recorded",
  }, mayaCookie);
  assertEquals(visitRes.status, 302, "Visit POST should redirect to subject detail");

  // Visit row was created.
  const visitList = visits.listBySubject(db, subjectId);
  assertEquals(visitList.length, 1);
  assertEquals(visitList[0].visit_kind, "screening");
  assertEquals(visitList[0].recorded_by_actor_id, mayaActor!.id);

  // visit.recorded event attributed to Maya.
  const visitEventList = eventLog.listFiltered(db, { action: "visit.recorded" });
  assertEquals(visitEventList.length, 1);
  assertEquals(visitEventList[0].actor_id, mayaActor!.id);

  // ── 8. CRA logs in ────────────────────────────────────────────────────────

  const craLoginRes = await formPost(app, "/login", {
    email: "jordan@beacon.clinical",
    password: "demo-cra",
  });
  assertEquals(craLoginRes.status, 302, "CRA login should redirect to /dashboard");
  const craCookie = sessionCookie(craLoginRes);
  assertExists(craCookie, "CRA login should set session cookie");

  // ── 9. CRA verifies the audit chain ───────────────────────────────────────

  const verifyRes = await get(app, "/audit/verify", craCookie);
  assertEquals(verifyRes.status, 200);
  const verifyBody = await verifyRes.text();
  assertMatch(verifyBody, /Verified/i, "Verify page should report 'Verified N events'");

  // Chain must be cryptographically intact at the DB level too.
  const chainResult = eventLog.verifyChain(db);
  assertEquals(chainResult.ok, true, "verifyChain() should pass after full lifecycle");

  // ── 10. Full event-set coverage check ─────────────────────────────────────
  //
  // Every action specified in the plan's §6 event catalog that this scenario
  // exercises should be present in the log. This catches any future regression
  // where a composition function silently stops emitting an event.

  const finalActions = new Set(eventLog.listAll(db).map((e) => e.action));
  const required = [
    "login.succeeded",    // PI login (step 1) + CRA login (step 8)
    "invitation.issued",  // PI invites Maya (step 2)
    "invitation.accepted", // Maya accepts (step 4)
    "actor.enrolled",     // Maya's actor created on accept (step 4)
    "credential.created", // Maya's password credential (step 4)
    "session.opened",     // Maya's first session via onboard (step 4)
    "grant.issued",       // PI grants enroll_subject + record_visit (step 5)
    "subject.enrolled",   // Maya enrolls BCN-001 (step 6)
    "visit.recorded",     // Maya records screening (step 7)
    "audit.viewed",       // GET /audit/verify emits audit.viewed ... actually verify doesn't
  ] as const;

  // audit.viewed comes from GET /audit, not /audit/verify.
  // Test it separately by hitting /audit directly.
  const auditListRes = await get(app, "/audit", craCookie);
  assertEquals(auditListRes.status, 200);

  // Now audit.viewed should be in the log.
  const allActions = new Set(eventLog.listAll(db).map((e) => e.action));
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
    "audit.viewed",
  ]) {
    assertEquals(
      allActions.has(action),
      true,
      `Expected action '${action}' in event log after full lifecycle`,
    );
  }

  db.close();
});

// ---------------------------------------------------------------------------
// Own-scope detail guard — /subjects/:id must 404 for actors whose grant
// scope is 'own' when the subject was enrolled by a different actor.
// ---------------------------------------------------------------------------

Deno.test("own-scope: GET /subjects/:id returns 404 for subject enrolled by another actor", async () => {
  const db = openDb(":memory:");
  db.exec(MIGRATION_SQL);
  const app = buildTestApp(db);

  // Seed permissions and study (route hardcodes "BCN-OX-201" — must match).
  const enrollPerm = permissions.create(db, "enroll_subject", "enroll_subject");
  studies.create(db, "BCN-OX-201", "Beacon Phase II");

  // Actor A — enrolls a subject under own-scope.
  const partyA = parties.create(db, "actor-a@test.local", "Actor A");
  const actorA = actors.create(db, partyA.id);
  const hashA = await hashPassword("passwordA");
  credentials.create(db, actorA.id, "password", hashA);
  grants.create(db, { grantor_actor_id: actorA.id, grantee_actor_id: actorA.id, permission_id: enrollPerm.id, scope: "own" });

  // Actor B — also has enroll_subject with own scope but did not enroll the subject.
  const partyB = parties.create(db, "actor-b@test.local", "Actor B");
  const actorB = actors.create(db, partyB.id);
  const hashB = await hashPassword("passwordB");
  credentials.create(db, actorB.id, "password", hashB);
  grants.create(db, { grantor_actor_id: actorA.id, grantee_actor_id: actorB.id, permission_id: enrollPerm.id, scope: "own" });

  // Actor A logs in and enrolls a subject.
  const loginA = await formPost(app, "/login", { email: "actor-a@test.local", password: "passwordA" });
  const cookieA = sessionCookie(loginA);
  assertExists(cookieA, "Actor A should get a session cookie");

  const enrollRes = await formPost(app, "/subjects", {}, cookieA);
  assertEquals(enrollRes.status, 302, "Enroll POST should redirect");

  const seededStudy = studies.getByProtocol(db, "BCN-OX-201");
  assertExists(seededStudy);
  const subjectList = subjects.listByStudy(db, seededStudy.id);
  assertEquals(subjectList.length, 1);
  const subjectId = subjectList[0].id;
  assertEquals(subjectList[0].enrolled_by_actor_id, actorA.id);

  // Actor A can access the subject detail.
  const ownRes = await get(app, `/subjects/${subjectId}`, cookieA);
  assertEquals(ownRes.status, 200, "Actor A should see their own subject");

  // Actor B logs in and attempts to access Actor A's subject — must get 404.
  const loginB = await formPost(app, "/login", { email: "actor-b@test.local", password: "passwordB" });
  const cookieB = sessionCookie(loginB);
  assertExists(cookieB, "Actor B should get a session cookie");

  const crossRes = await get(app, `/subjects/${subjectId}`, cookieB);
  assertEquals(crossRes.status, 404, "Actor B must not access a subject enrolled by Actor A under own scope");

  db.close();
});
