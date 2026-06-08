// tests/composition.test.ts
//
// Composition functions — unit tests with rollback assertions.
//
// Ported from render 1 (demos/clinical-trial-portal/tests/composition.test.ts),
// adapted to render 2's async / Postgres (pglite) seam. This file tests the
// composition mutation surface — the ONLY mutation surface in render 2: rollback
// atomicity (atom rows + audit event commit together or not at all) and the
// named rejection paths.
//
// Critical invariant under test (preserved verbatim from render 1): if a
// composition function throws mid-transaction — forced by monkeyPatchHashToThrow,
// which overrides sha256hex so appendEvent's hashEvent throws inside withTx — both
// the atom row(s) AND the audit event row(s) must roll back. Zero new rows in
// either table. This is the withTx rollback guarantee (lib/db.ts holds the global
// audit advisory lock for the body and ROLLBACKs on throw).
//
// Pattern for rollback tests (render-2 form):
//   1. Seed prerequisites (party, actor, permission, study, …) via async helpers.
//   2. const restore = monkeyPatchHashToThrow();  // appendEvent will now throw
//   3. await assert.rejects(() => composition.someMutation(ctx, input))
//   4. finally { restore(); }
//   5. Assert: the atom table is empty (query via db) AND event_log is empty
//      (or, where a prior event committed in its own withTx, that exactly that
//      prior event survives).
//
// ── render-1 → render-2 divergences adapted here (full list in the report) ──
//   • Deno.test + jsr:@std/assert  →  node:test + node:assert/strict.
//   • withTestDb / withTestDbAsync (render 1) → render 2 has ONE async withTestDb;
//     it hands the callback (ctx, db). There is no separate async variant.
//   • All domain / composition fns are async and take `db` (the module Queryable),
//     not `ctx.db`. Seed helpers are async accordingly.
//   • actors have no display_name column (render 2 dropped it); seedActor's `name`
//     names the PARTY only, and the actor row is the bare {id, party_id, created_at}.
//   • subject codes use COUNT(*)+1 (domain/subjects.ts) — same BCN-001/BCN-002
//     output as render 1's allocator, so those assertions are unchanged.
//   • monkeyPatchHashToThrow overrides sha256hex (event_log hashing), which is a
//     DIFFERENT module from lib/password.ts (scrypt). So on the login/accept
//     success paths the password verify/hash still works; only appendEvent throws —
//     exactly the mid-transaction failure the rollback assertions need.
//   • ctx is mutated in place by acceptInvitation / login on success and restored
//     on throw; render 2 reads ctx.actor / ctx.session straight off ctx (no
//     TypeScript flow-narrowing cast needed, since we never pre-narrow to null in
//     a way the compiler trusts across the await).

import { test } from "node:test";
import assert from "node:assert/strict";
import { withTestDb, monkeyPatchHashToThrow } from "./_helpers.ts";
import * as composition from "../composition.ts";
import * as parties from "../domain/parties.ts";
import * as actors from "../domain/actors.ts";
import * as credentials from "../domain/credentials.ts";
import * as permissions from "../domain/permissions.ts";
import * as invitations from "../domain/invitations.ts";
import * as grants from "../domain/grants.ts";
import * as studies from "../domain/studies.ts";
import * as subjects from "../domain/subjects.ts";
import * as visits from "../domain/visits.ts";
import * as eventLog from "../domain/event_log.ts";
import { hashPassword } from "../lib/password.ts";
import type { Ctx, Queryable } from "../lib/db.ts";
import type { Actor } from "../domain/actors.ts";

// ---------------------------------------------------------------------------
// Seed helpers (async; take the module `db` Queryable). `name` is the PARTY
// display name — render 2's actor row carries no display_name.
// ---------------------------------------------------------------------------

async function seedActor(db: Queryable, email: string, name: string): Promise<Actor> {
  const party = await parties.create(db, email, name);
  return actors.create(db, party.id);
}

async function seedPermission(db: Queryable, code: string, label: string) {
  return permissions.create(db, code, label);
}

// ---------------------------------------------------------------------------
// issueInvitation
// ---------------------------------------------------------------------------

test("issueInvitation: creates invitation row and emits audit event", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const actor = await seedActor(db, "pi@example.com", "PI");
    ctx.actor = actor;

    const inv = await composition.issueInvitation(ctx, {
      email: "new@example.com",
      display_name: "New User",
      intended_role: "coordinator",
    });

    assert.equal(inv.intended_role, "coordinator");
    assert.ok(inv.token != null);

    // Party auto-created for the invitee.
    assert.ok((await parties.getByEmail(db, "new@example.com")) != null);

    // Exactly one audit event.
    const events = await eventLog.listAll(db);
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "invitation.issued");
    assert.equal(events[0].actor_id, actor.id);
    assert.equal(events[0].target_kind, "invitation");
    assert.equal(events[0].target_id, inv.id);
  });
});

test("issueInvitation: requires an authenticated actor", async () => {
  await withTestDb(async (ctx: Ctx) => {
    // ctx.actor is null (anonymous) — the named rejection path.
    await assert.rejects(
      () =>
        composition.issueInvitation(ctx, {
          email: "new@example.com",
          display_name: "New User",
          intended_role: "coordinator",
        }),
      /authenticated actor required/,
    );
  });
});

test("issueInvitation: reuses existing party if email already registered", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const actor = await seedActor(db, "pi@example.com", "PI");
    ctx.actor = actor;
    // Pre-existing party for the invitee's email.
    await parties.create(db, "existing@example.com", "Existing Person");

    await composition.issueInvitation(ctx, {
      email: "existing@example.com",
      display_name: "ignored",
      intended_role: "coordinator",
    });

    // Still only 2 party rows (PI + existing) — no duplicate created.
    assert.equal((await parties.listAll(db)).length, 2);
  });
});

test("issueInvitation: forced audit failure leaves zero invitation rows", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const actor = await seedActor(db, "pi@example.com", "PI");
    ctx.actor = actor;

    const restore = monkeyPatchHashToThrow();
    try {
      await assert.rejects(() =>
        composition.issueInvitation(ctx, {
          email: "new@example.com",
          display_name: "New User",
          intended_role: "coordinator",
        }),
      );
    } finally {
      restore();
    }

    // Both the invitation row AND the event row rolled back.
    assert.equal((await invitations.listAll(db)).length, 0);
    assert.equal((await eventLog.listAll(db)).length, 0);
    // The party row would also have been created inside the same tx — gone too.
    assert.equal((await parties.getByEmail(db, "new@example.com")), null);
  });
});

// ---------------------------------------------------------------------------
// acceptInvitation
// ---------------------------------------------------------------------------

test("acceptInvitation: creates actor, credential, session; marks invitation accepted", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const pi = await seedActor(db, "pi@example.com", "PI");
    ctx.actor = pi;

    // Issue invitation first (as the PI).
    const inv = await composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "Study Coordinator",
      intended_role: "coordinator",
    });

    // Clear PI from ctx — the invitee is anonymous when they land on the accept page.
    ctx.actor = null;
    ctx.session = null;

    const { actor, session } = await composition.acceptInvitation(ctx, {
      token: inv.token,
      password: "secure-pass-123",
    });

    assert.ok(actor.id != null);
    assert.ok(session.token != null);

    // Invitation is now accepted, attributed to the new actor.
    const updated = await invitations.getById(db, inv.id);
    assert.ok(updated?.accepted_at != null);
    assert.equal(updated?.accepted_by_actor_id, actor.id);

    // Credential was created.
    assert.ok((await credentials.getActiveByActorId(db, actor.id)) != null);

    // Five audit events: invitation.issued (by PI), then — by the new actor —
    // invitation.accepted + actor.enrolled + credential.created + session.opened.
    const events = await eventLog.listAll(db);
    assert.equal(events.length, 5);
    assert.equal(events[1].action, "invitation.accepted");
    assert.equal(events[1].actor_id, actor.id);

    // acceptInvitation mutates ctx.actor/session as a side-effect for the route
    // handler — the burst is attributed to the freshly-onboarded actor.
    assert.equal(ctx.actor?.id, actor.id);
    assert.equal(ctx.session?.id, session.id);
  });
});

test("acceptInvitation: rejects an unknown token", async () => {
  await withTestDb(async (ctx: Ctx) => {
    await assert.rejects(
      () => composition.acceptInvitation(ctx, { token: "no-such-token", password: "pw" }),
      /invitation not found/,
    );
  });
});

test("acceptInvitation: rejects an already-revoked invitation", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const pi = await seedActor(db, "pi@example.com", "PI");
    ctx.actor = pi;
    const inv = await composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "SC",
      intended_role: "coordinator",
    });
    await composition.revokeInvitation(ctx, { invitation_id: inv.id });

    ctx.actor = null;
    ctx.session = null;
    await assert.rejects(
      () => composition.acceptInvitation(ctx, { token: inv.token, password: "pw" }),
      /already resolved/,
    );
  });
});

test("acceptInvitation: forced audit failure rolls back all rows; ctx restored", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const pi = await seedActor(db, "pi@example.com", "PI");
    ctx.actor = pi;

    const inv = await composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "Study Coordinator",
      intended_role: "coordinator",
    });

    // Clear PI context; invitee is anonymous.
    ctx.actor = null;
    ctx.session = null;

    const restore = monkeyPatchHashToThrow();
    try {
      await assert.rejects(() =>
        composition.acceptInvitation(ctx, {
          token: inv.token,
          password: "secure-pass-123",
        }),
      );
    } finally {
      restore();
    }

    // No new actor or session rows: only the PI actor exists.
    assert.equal((await actors.listAll(db)).length, 1);
    const acceptedEvents = (await eventLog.listAll(db)).filter(
      (e) => e.action === "invitation.accepted",
    );
    assert.equal(acceptedEvents.length, 0);

    // Invitation is still pending (the markAccepted UPDATE rolled back).
    const stillPending = await invitations.getById(db, inv.id);
    assert.equal(stillPending?.accepted_at, null);

    // ctx restored to the anonymous state it held before the throw.
    assert.equal(ctx.actor, null);
    assert.equal(ctx.session, null);
  });
});

// ---------------------------------------------------------------------------
// revokeInvitation
// ---------------------------------------------------------------------------

test("revokeInvitation: marks invitation revoked and emits audit event", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const actor = await seedActor(db, "pi@example.com", "PI");
    ctx.actor = actor;

    const inv = await composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "SC",
      intended_role: "coordinator",
    });

    await composition.revokeInvitation(ctx, { invitation_id: inv.id });

    const updated = await invitations.getById(db, inv.id);
    assert.ok(updated?.revoked_at != null);

    const events = await eventLog.listAll(db);
    assert.equal(events.length, 2);
    assert.equal(events[1].action, "invitation.revoked");
    assert.equal(events[1].target_id, inv.id);
  });
});

test("revokeInvitation: rejects an unknown invitation id", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const actor = await seedActor(db, "pi@example.com", "PI");
    ctx.actor = actor;
    await assert.rejects(
      () => composition.revokeInvitation(ctx, { invitation_id: 9999 }),
      /not found/,
    );
  });
});

test("revokeInvitation: forced audit failure leaves invitation un-revoked", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const actor = await seedActor(db, "pi@example.com", "PI");
    ctx.actor = actor;

    const inv = await composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "SC",
      intended_role: "coordinator",
    });

    const restore = monkeyPatchHashToThrow();
    try {
      await assert.rejects(() =>
        composition.revokeInvitation(ctx, { invitation_id: inv.id }),
      );
    } finally {
      restore();
    }

    // Invitation must still be pending (the UPDATE rolled back with the event).
    const stillPending = await invitations.getById(db, inv.id);
    assert.equal(stillPending?.revoked_at, null);
    // Only the original invitation.issued event remains.
    assert.equal((await eventLog.listAll(db)).length, 1);
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

test("login: correct credentials → session created, login.succeeded emitted", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    // Set up an actor with a real password hash.
    const party = await parties.create(db, "user@example.com", "User");
    const actor = await actors.create(db, party.id);
    const hash = await hashPassword("correct-password");
    await credentials.create(db, actor.id, "password", hash);

    const result = await composition.login(ctx, {
      email: "user@example.com",
      password: "correct-password",
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.session.token != null);
    }

    const events = await eventLog.listAll(db);
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "login.succeeded");
    assert.equal(events[0].actor_id, actor.id);

    // login mutates ctx on success — the session is now attributed.
    assert.equal(ctx.actor?.id, actor.id);
    assert.ok(ctx.session != null);
  });
});

test("login: wrong password → ok:false invalid_credentials, login.failed emitted, no session", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const party = await parties.create(db, "user@example.com", "User");
    const actor = await actors.create(db, party.id);
    const hash = await hashPassword("correct-password");
    await credentials.create(db, actor.id, "password", hash);

    const result = await composition.login(ctx, {
      email: "user@example.com",
      password: "wrong-password",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      // Generic reason returned to the caller; the specific cause is audit-only.
      assert.equal(result.reason, "invalid_credentials");
    }

    // login.failed event committed, anonymous (actor_id null).
    const events = await eventLog.listAll(db);
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "login.failed");
    assert.equal(events[0].actor_id, null);

    // No session row created; ctx stays anonymous.
    assert.equal(ctx.actor, null);
    assert.equal(ctx.session, null);
  });
});

test("login: unknown email → ok:false invalid_credentials, login.failed emitted", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const result = await composition.login(ctx, {
      email: "nobody@example.com",
      password: "any",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_credentials");
    }
    const events = await eventLog.listAll(db);
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "login.failed");
    assert.equal(events[0].actor_id, null);
  });
});

test("login: forced audit failure on success path rolls back session row; ctx restored", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const party = await parties.create(db, "user@example.com", "User");
    const actor = await actors.create(db, party.id);
    const hash = await hashPassword("correct-password");
    await credentials.create(db, actor.id, "password", hash);

    // Patch AFTER hashing/seeding. verifyPassword uses scrypt (lib/password.ts),
    // not sha256hex, so the credential still verifies — only appendEvent throws,
    // which is what we want: the success path enters withTx then fails mid-tx.
    const restore = monkeyPatchHashToThrow();
    try {
      await assert.rejects(() =>
        composition.login(ctx, {
          email: "user@example.com",
          password: "correct-password",
        }),
      );
    } finally {
      restore();
    }

    // The session row and the login.succeeded event both rolled back. No event
    // survives (the success path emits exactly one event, inside the failed tx).
    assert.equal((await eventLog.listAll(db)).length, 0);
    // ctx restored to the anonymous state it held before the throw.
    assert.equal(ctx.actor, null);
    assert.equal(ctx.session, null);
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

test("logout: revokes session and emits session.revoked", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const party = await parties.create(db, "user@example.com", "User");
    const actor = await actors.create(db, party.id);
    const hash = await hashPassword("pw");
    await credentials.create(db, actor.id, "password", hash);

    const loginResult = await composition.login(ctx, {
      email: "user@example.com",
      password: "pw",
    });
    assert.equal(loginResult.ok, true);

    // ctx.actor and ctx.session are now set from login.
    await composition.logout(ctx);

    const events = await eventLog.listAll(db);
    assert.equal(events.length, 2);
    assert.equal(events[1].action, "session.revoked");
  });
});

test("logout: rejects with no active session", async () => {
  await withTestDb(async (ctx: Ctx) => {
    // ctx.session is null — the named rejection path.
    await assert.rejects(() => composition.logout(ctx), /no active session/);
  });
});

// ---------------------------------------------------------------------------
// grantPermission
// ---------------------------------------------------------------------------

test("grantPermission: creates grant row and emits grant.issued", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const pi = await seedActor(db, "pi@example.com", "PI");
    const sc = await seedActor(db, "sc@example.com", "SC");
    const perm = await seedPermission(db, "enroll_subject", "Enroll Subject");
    ctx.actor = pi;

    const grant = await composition.grantPermission(ctx, {
      grantee_actor_id: sc.id,
      permission_id: perm.id,
      scope: "all",
    });

    assert.ok(grant.id != null);
    assert.equal(grant.grantee_actor_id, sc.id);
    assert.equal(grant.grantor_actor_id, pi.id);

    const events = await eventLog.listAll(db);
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "grant.issued");
    assert.equal(events[0].target_id, grant.id);
  });
});

test("grantPermission: requires an authenticated actor", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const sc = await seedActor(db, "sc@example.com", "SC");
    const perm = await seedPermission(db, "enroll_subject", "Enroll Subject");
    // ctx.actor is null — named rejection.
    await assert.rejects(
      () =>
        composition.grantPermission(ctx, {
          grantee_actor_id: sc.id,
          permission_id: perm.id,
        }),
      /authenticated actor required/,
    );
  });
});

test("grantPermission: forced audit failure leaves zero grant rows", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const pi = await seedActor(db, "pi@example.com", "PI");
    const sc = await seedActor(db, "sc@example.com", "SC");
    const perm = await seedPermission(db, "enroll_subject", "Enroll Subject");
    ctx.actor = pi;

    const restore = monkeyPatchHashToThrow();
    try {
      await assert.rejects(() =>
        composition.grantPermission(ctx, {
          grantee_actor_id: sc.id,
          permission_id: perm.id,
        }),
      );
    } finally {
      restore();
    }

    assert.equal((await grants.listAll(db)).length, 0);
    assert.equal((await eventLog.listAll(db)).length, 0);
  });
});

// ---------------------------------------------------------------------------
// revokeGrant
// ---------------------------------------------------------------------------

test("revokeGrant: marks grant revoked and emits grant.revoked", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const pi = await seedActor(db, "pi@example.com", "PI");
    const sc = await seedActor(db, "sc@example.com", "SC");
    const perm = await seedPermission(db, "enroll_subject", "Enroll Subject");
    ctx.actor = pi;

    const grant = await composition.grantPermission(ctx, {
      grantee_actor_id: sc.id,
      permission_id: perm.id,
    });

    await composition.revokeGrant(ctx, {
      grant_id: grant.id,
      reason: "Role change",
    });

    const updated = await grants.getById(db, grant.id);
    assert.ok(updated?.revoked_at != null);
    assert.equal(updated?.revoke_reason, "Role change");

    const events = await eventLog.listAll(db);
    assert.equal(events.length, 2);
    assert.equal(events[1].action, "grant.revoked");
  });
});

test("revokeGrant: requires an authenticated actor", async () => {
  await withTestDb(async (ctx: Ctx) => {
    // ctx.actor is null — named rejection (checked before any DB write).
    await assert.rejects(
      () => composition.revokeGrant(ctx, { grant_id: 1, reason: "x" }),
      /authenticated actor required/,
    );
  });
});

test("revokeGrant: forced audit failure leaves grant un-revoked", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const pi = await seedActor(db, "pi@example.com", "PI");
    const sc = await seedActor(db, "sc@example.com", "SC");
    const perm = await seedPermission(db, "enroll_subject", "Enroll Subject");
    ctx.actor = pi;

    const grant = await composition.grantPermission(ctx, {
      grantee_actor_id: sc.id,
      permission_id: perm.id,
    });

    const restore = monkeyPatchHashToThrow();
    try {
      await assert.rejects(() =>
        composition.revokeGrant(ctx, { grant_id: grant.id, reason: "Role change" }),
      );
    } finally {
      restore();
    }

    // The grant's revoke UPDATE rolled back with the event — still active.
    const updated = await grants.getById(db, grant.id);
    assert.equal(updated?.revoked_at, null);
    assert.equal(updated?.revoke_reason, null);
    // Only the original grant.issued event remains.
    assert.equal((await eventLog.listAll(db)).length, 1);
  });
});

// ---------------------------------------------------------------------------
// enrollSubject
// ---------------------------------------------------------------------------

test("enrollSubject: creates subject with sequential code and emits subject.enrolled", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const actor = await seedActor(db, "sc@example.com", "SC");
    ctx.actor = actor;
    const study = await studies.create(db, "BCN-OX-201", "Beacon Oncology Phase II");

    const s1 = await composition.enrollSubject(ctx, {
      study_id: study.id,
      prefix: "BCN",
    });
    const s2 = await composition.enrollSubject(ctx, {
      study_id: study.id,
      prefix: "BCN",
    });

    assert.equal(s1.subject_code, "BCN-001");
    assert.equal(s2.subject_code, "BCN-002");

    const events = await eventLog.listAll(db);
    assert.equal(events.length, 2);
    assert.equal(events[0].action, "subject.enrolled");
    assert.equal(events[0].target_id, s1.id);
  });
});

test("enrollSubject: requires an authenticated actor", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const study = await studies.create(db, "BCN-OX-201", "Beacon Oncology Phase II");
    await assert.rejects(
      () => composition.enrollSubject(ctx, { study_id: study.id, prefix: "BCN" }),
      /authenticated actor required/,
    );
  });
});

test("enrollSubject: forced audit failure leaves zero subject rows", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const actor = await seedActor(db, "sc@example.com", "SC");
    ctx.actor = actor;
    const study = await studies.create(db, "BCN-OX-201", "Beacon Oncology Phase II");

    const restore = monkeyPatchHashToThrow();
    try {
      await assert.rejects(() =>
        composition.enrollSubject(ctx, {
          study_id: study.id,
          prefix: "BCN",
        }),
      );
    } finally {
      restore();
    }

    assert.equal((await subjects.listByStudy(db, study.id)).length, 0);
    assert.equal((await eventLog.listAll(db)).length, 0);
  });
});

// ---------------------------------------------------------------------------
// recordVisit
// ---------------------------------------------------------------------------

test("recordVisit: creates visit row and emits visit.recorded", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const actor = await seedActor(db, "sc@example.com", "SC");
    ctx.actor = actor;
    const study = await studies.create(db, "BCN-OX-201", "Beacon Oncology Phase II");

    const subject = await composition.enrollSubject(ctx, {
      study_id: study.id,
      prefix: "BCN",
    });

    const visit = await composition.recordVisit(ctx, {
      subject_id: subject.id,
      visit_kind: "screening",
      notes: "Baseline assessment",
    });

    assert.ok(visit.id != null);
    assert.equal(visit.visit_kind, "screening");
    assert.equal(visit.recorded_by_actor_id, actor.id);

    const events = await eventLog.listAll(db);
    assert.equal(events.length, 2); // subject.enrolled + visit.recorded
    assert.equal(events[1].action, "visit.recorded");
    assert.equal(events[1].target_id, visit.id);
  });
});

test("recordVisit: requires an authenticated actor", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    // Seed a subject via a transient actor, then go anonymous for the recordVisit.
    const actor = await seedActor(db, "sc@example.com", "SC");
    ctx.actor = actor;
    const study = await studies.create(db, "BCN-OX-201", "Beacon Oncology Phase II");
    const subject = await composition.enrollSubject(ctx, { study_id: study.id, prefix: "BCN" });

    ctx.actor = null;
    await assert.rejects(
      () => composition.recordVisit(ctx, { subject_id: subject.id, visit_kind: "week_4" }),
      /authenticated actor required/,
    );
  });
});

test("recordVisit: forced audit failure leaves zero visit rows", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    const actor = await seedActor(db, "sc@example.com", "SC");
    ctx.actor = actor;
    const study = await studies.create(db, "BCN-OX-201", "Beacon Oncology Phase II");
    const subject = await composition.enrollSubject(ctx, {
      study_id: study.id,
      prefix: "BCN",
    });

    const restore = monkeyPatchHashToThrow();
    try {
      await assert.rejects(() =>
        composition.recordVisit(ctx, {
          subject_id: subject.id,
          visit_kind: "week_4",
        }),
      );
    } finally {
      restore();
    }

    assert.equal((await visits.listBySubject(db, subject.id)).length, 0);
    // The enrollSubject event committed in its own withTx before the patched
    // call, so exactly one event survives.
    assert.equal((await eventLog.listAll(db)).length, 1);
  });
});
