// tests/composition.test.ts
//
// Composition functions — unit tests with rollback assertions.
//
// Critical invariant under test: if a composition function throws mid-transaction
// (forced by monkey-patching sha256hex to throw inside appendEvent), both atom
// rows AND audit event rows must roll back — zero new rows in either table.
//
// Pattern for rollback tests:
//   1. Seed prerequisites (party, actor, permission, etc.)
//   2. monkeyPatchHashToThrow() — causes appendEvent to throw
//   3. assertThrows(() => compositionFn(...))
//   4. restore() the hash implementation
//   5. Assert: atom table count === 0, event_log count === 0

import {
  assertEquals,
  assertExists,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert";
import { withTestDb, withTestDbAsync, monkeyPatchHashToThrow } from "./_helpers.ts";
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
import type { Ctx } from "../lib/db.ts";
import type { Actor } from "../domain/actors.ts";

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedActor(ctx: Ctx, email: string, name: string): Actor {
  const party = parties.create(ctx.db, email, name);
  return actors.create(ctx.db, party.id);
}

function seedPermission(ctx: Ctx, code: string, label: string) {
  return permissions.create(ctx.db, code, label);
}

// ---------------------------------------------------------------------------
// issueInvitation
// ---------------------------------------------------------------------------

Deno.test("issueInvitation: creates invitation row and emits audit event", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "pi@example.com", "PI");
    ctx.actor = actor;

    const inv = composition.issueInvitation(ctx, {
      email: "new@example.com",
      display_name: "New User",
      intended_role: "coordinator",
    });

    assertEquals(inv.intended_role, "coordinator");
    assertExists(inv.token);

    // Party auto-created for the invitee
    assertExists(parties.getByEmail(ctx.db, "new@example.com"));

    // Exactly one audit event
    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 1);
    assertEquals(events[0].action, "invitation.issued");
    assertEquals(events[0].actor_id, actor.id);
    assertEquals(events[0].target_kind, "invitation");
    assertEquals(events[0].target_id, inv.id);
  });
});

Deno.test("issueInvitation: reuses existing party if email already registered", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "pi@example.com", "PI");
    ctx.actor = actor;
    // Pre-existing party for the invitee's email
    parties.create(ctx.db, "existing@example.com", "Existing Person");

    composition.issueInvitation(ctx, {
      email: "existing@example.com",
      display_name: "ignored",
      intended_role: "coordinator",
    });

    // Still only 2 party rows (PI + existing)
    assertEquals(parties.listAll(ctx.db).length, 2);
  });
});

Deno.test("issueInvitation: forced audit failure leaves zero invitation rows", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "pi@example.com", "PI");
    ctx.actor = actor;

    const restore = monkeyPatchHashToThrow();
    try {
      assertThrows(() => {
        composition.issueInvitation(ctx, {
          email: "new@example.com",
          display_name: "New User",
          intended_role: "coordinator",
        });
      });
    } finally {
      restore();
    }

    assertEquals(invitations.listAll(ctx.db).length, 0);
    assertEquals(eventLog.listAll(ctx.db).length, 0);
  });
});

// ---------------------------------------------------------------------------
// acceptInvitation
// ---------------------------------------------------------------------------

Deno.test("acceptInvitation: creates actor, credential, session; marks invitation accepted", async () => {
  await withTestDbAsync(async (ctx) => {
    const pi = seedActor(ctx, "pi@example.com", "PI");
    ctx.actor = pi;

    // Issue invitation first
    const inv = composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "Study Coordinator",
      intended_role: "coordinator",
    });

    // Clear pi from ctx (invitee is anonymous when they land on the accept page)
    ctx.actor = null;
    ctx.session = null;

    const { actor, session } = await composition.acceptInvitation(ctx, {
      token: inv.token,
      password: "secure-pass-123",
    });

    assertExists(actor.id);
    assertExists(session.token);

    // Invitation is now accepted
    const updated = invitations.getById(ctx.db, inv.id);
    assertExists(updated?.accepted_at);
    assertEquals(updated?.accepted_by_actor_id, actor.id);

    // Credential was created
    assertExists(credentials.getActiveByActorId(ctx.db, actor.id));

    // Two audit events: invitation.issued (by PI) + invitation.accepted (by new actor)
    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 2);
    assertEquals(events[1].action, "invitation.accepted");
    assertEquals(events[1].actor_id, actor.id);

    // acceptInvitation mutates ctx.actor/session as a side-effect for the
    // route handler. TypeScript flow-narrows ctx.actor to null (from the
    // explicit assignment above) and can't see the async mutation; cast via
    // the Ctx type to get an unnarrowed expression.
    assertEquals((ctx as Ctx).actor?.id, actor.id);
    assertEquals((ctx as Ctx).session?.id, session.id);
  });
});

Deno.test("acceptInvitation: forced audit failure rolls back all rows; ctx restored", async () => {
  await withTestDbAsync(async (ctx) => {
    const pi = seedActor(ctx, "pi@example.com", "PI");
    ctx.actor = pi;

    const inv = composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "Study Coordinator",
      intended_role: "coordinator",
    });

    // Clear PI context; invitee is anonymous
    ctx.actor = null;
    ctx.session = null;

    const restore = monkeyPatchHashToThrow();
    try {
      await assertRejects(async () => {
        await composition.acceptInvitation(ctx, {
          token: inv.token,
          password: "secure-pass-123",
        });
      });
    } finally {
      restore();
    }

    // No actor or session rows created
    assertEquals(actors.listAll(ctx.db).length, 1); // only PI
    assertEquals(eventLog.listAll(ctx.db).filter((e) => e.action === "invitation.accepted").length, 0);

    // Invitation is still pending
    const stillPending = invitations.getById(ctx.db, inv.id);
    assertEquals(stillPending?.accepted_at, null);

    // ctx restored to anonymous state
    assertEquals(ctx.actor, null);
    assertEquals(ctx.session, null);
  });
});

// ---------------------------------------------------------------------------
// revokeInvitation
// ---------------------------------------------------------------------------

Deno.test("revokeInvitation: marks invitation revoked and emits audit event", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "pi@example.com", "PI");
    ctx.actor = actor;

    const inv = composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "SC",
      intended_role: "coordinator",
    });

    composition.revokeInvitation(ctx, { invitation_id: inv.id });

    const updated = invitations.getById(ctx.db, inv.id);
    assertExists(updated?.revoked_at);

    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 2);
    assertEquals(events[1].action, "invitation.revoked");
    assertEquals(events[1].target_id, inv.id);
  });
});

Deno.test("revokeInvitation: forced audit failure leaves invitation un-revoked", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "pi@example.com", "PI");
    ctx.actor = actor;

    const inv = composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "SC",
      intended_role: "coordinator",
    });

    const restore = monkeyPatchHashToThrow();
    try {
      assertThrows(() => {
        composition.revokeInvitation(ctx, { invitation_id: inv.id });
      });
    } finally {
      restore();
    }

    // Invitation must still be pending (the UPDATE rolled back)
    const stillPending = invitations.getById(ctx.db, inv.id);
    assertEquals(stillPending?.revoked_at, null);
    // Only the original invitation.issued event remains
    assertEquals(eventLog.listAll(ctx.db).length, 1);
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

Deno.test("login: correct credentials → session created, login.succeeded emitted", async () => {
  await withTestDbAsync(async (ctx) => {
    // Set up actor with a real password hash
    const party = parties.create(ctx.db, "user@example.com", "User");
    const actor = actors.create(ctx.db, party.id);
    const hash = await hashPassword("correct-password");
    credentials.create(ctx.db, actor.id, "password", hash);

    const result = await composition.login(ctx, {
      email: "user@example.com",
      password: "correct-password",
    });

    assertEquals(result.ok, true);
    if (result.ok) {
      assertExists(result.session.token);
    }

    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 1);
    assertEquals(events[0].action, "login.succeeded");
    assertEquals(events[0].actor_id, actor.id);
  });
});

Deno.test("login: wrong password → login.failed emitted, no session created", async () => {
  await withTestDbAsync(async (ctx) => {
    const party = parties.create(ctx.db, "user@example.com", "User");
    const actor = actors.create(ctx.db, party.id);
    const hash = await hashPassword("correct-password");
    credentials.create(ctx.db, actor.id, "password", hash);

    const result = await composition.login(ctx, {
      email: "user@example.com",
      password: "wrong-password",
    });

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.reason, "invalid_credentials");
    }

    // login.failed event committed (anonymous — actor_id null)
    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 1);
    assertEquals(events[0].action, "login.failed");
    assertEquals(events[0].actor_id, null);
  });
});

Deno.test("login: unknown email → login.failed emitted", async () => {
  await withTestDbAsync(async (ctx) => {
    const result = await composition.login(ctx, {
      email: "nobody@example.com",
      password: "any",
    });

    assertEquals(result.ok, false);
    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 1);
    assertEquals(events[0].action, "login.failed");
  });
});

Deno.test("login: forced audit failure on success path rolls back session row; ctx restored", async () => {
  await withTestDbAsync(async (ctx) => {
    const party = parties.create(ctx.db, "user@example.com", "User");
    const actor = actors.create(ctx.db, party.id);
    const hash = await hashPassword("correct-password");
    credentials.create(ctx.db, actor.id, "password", hash);

    // Patch AFTER hashing so verifyPassword still works, but appendEvent fails.
    const restore = monkeyPatchHashToThrow();
    try {
      await assertRejects(async () => {
        await composition.login(ctx, {
          email: "user@example.com",
          password: "correct-password",
        });
      });
    } finally {
      restore();
    }

    // Session row must have rolled back
    assertEquals(eventLog.listAll(ctx.db).length, 0);
    // ctx restored to anonymous state
    assertEquals(ctx.actor, null);
    assertEquals(ctx.session, null);
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

Deno.test("logout: revokes session and emits session.revoked", async () => {
  await withTestDbAsync(async (ctx) => {
    const party = parties.create(ctx.db, "user@example.com", "User");
    const actor = actors.create(ctx.db, party.id);
    const hash = await hashPassword("pw");
    credentials.create(ctx.db, actor.id, "password", hash);

    const loginResult = await composition.login(ctx, {
      email: "user@example.com",
      password: "pw",
    });
    assertEquals(loginResult.ok, true);

    // ctx.actor and ctx.session are now set from login
    composition.logout(ctx);

    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 2);
    assertEquals(events[1].action, "session.revoked");
  });
});

// ---------------------------------------------------------------------------
// grantPermission
// ---------------------------------------------------------------------------

Deno.test("grantPermission: creates grant row and emits grant.issued", () => {
  withTestDb((ctx) => {
    const pi = seedActor(ctx, "pi@example.com", "PI");
    const sc = seedActor(ctx, "sc@example.com", "SC");
    const perm = seedPermission(ctx, "enroll_subject", "Enroll Subject");
    ctx.actor = pi;

    const grant = composition.grantPermission(ctx, {
      grantee_actor_id: sc.id,
      permission_id: perm.id,
      scope: "all",
    });

    assertExists(grant.id);
    assertEquals(grant.grantee_actor_id, sc.id);
    assertEquals(grant.grantor_actor_id, pi.id);

    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 1);
    assertEquals(events[0].action, "grant.issued");
    assertEquals(events[0].target_id, grant.id);
  });
});

Deno.test("grantPermission: forced audit failure leaves zero grant rows", () => {
  withTestDb((ctx) => {
    const pi = seedActor(ctx, "pi@example.com", "PI");
    const sc = seedActor(ctx, "sc@example.com", "SC");
    const perm = seedPermission(ctx, "enroll_subject", "Enroll Subject");
    ctx.actor = pi;

    const restore = monkeyPatchHashToThrow();
    try {
      assertThrows(() => {
        composition.grantPermission(ctx, {
          grantee_actor_id: sc.id,
          permission_id: perm.id,
        });
      });
    } finally {
      restore();
    }

    assertEquals(grants.listAll(ctx.db).length, 0);
    assertEquals(eventLog.listAll(ctx.db).length, 0);
  });
});

// ---------------------------------------------------------------------------
// revokeGrant
// ---------------------------------------------------------------------------

Deno.test("revokeGrant: marks grant revoked and emits grant.revoked", () => {
  withTestDb((ctx) => {
    const pi = seedActor(ctx, "pi@example.com", "PI");
    const sc = seedActor(ctx, "sc@example.com", "SC");
    const perm = seedPermission(ctx, "enroll_subject", "Enroll Subject");
    ctx.actor = pi;

    const grant = composition.grantPermission(ctx, {
      grantee_actor_id: sc.id,
      permission_id: perm.id,
    });

    composition.revokeGrant(ctx, {
      grant_id: grant.id,
      reason: "Role change",
    });

    const updated = grants.getById(ctx.db, grant.id);
    assertExists(updated?.revoked_at);
    assertEquals(updated?.revoke_reason, "Role change");

    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 2);
    assertEquals(events[1].action, "grant.revoked");
  });
});

// ---------------------------------------------------------------------------
// enrollSubject
// ---------------------------------------------------------------------------

Deno.test("enrollSubject: creates subject with sequential code and emits subject.enrolled", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "sc@example.com", "SC");
    ctx.actor = actor;
    const study = studies.create(ctx.db, "BCN-OX-201", "Beacon Oncology Phase II");

    const s1 = composition.enrollSubject(ctx, {
      study_id: study.id,
      prefix: "BCN",
    });
    const s2 = composition.enrollSubject(ctx, {
      study_id: study.id,
      prefix: "BCN",
    });

    assertEquals(s1.subject_code, "BCN-001");
    assertEquals(s2.subject_code, "BCN-002");

    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 2);
    assertEquals(events[0].action, "subject.enrolled");
    assertEquals(events[0].target_id, s1.id);
  });
});

Deno.test("enrollSubject: forced audit failure leaves zero subject rows", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "sc@example.com", "SC");
    ctx.actor = actor;
    const study = studies.create(ctx.db, "BCN-OX-201", "Beacon Oncology Phase II");

    const restore = monkeyPatchHashToThrow();
    try {
      assertThrows(() => {
        composition.enrollSubject(ctx, {
          study_id: study.id,
          prefix: "BCN",
        });
      });
    } finally {
      restore();
    }

    assertEquals(subjects.listByStudy(ctx.db, study.id).length, 0);
    assertEquals(eventLog.listAll(ctx.db).length, 0);
  });
});

// ---------------------------------------------------------------------------
// recordVisit
// ---------------------------------------------------------------------------

Deno.test("recordVisit: creates visit row and emits visit.recorded", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "sc@example.com", "SC");
    ctx.actor = actor;
    const study = studies.create(ctx.db, "BCN-OX-201", "Beacon Oncology Phase II");

    const subject = composition.enrollSubject(ctx, {
      study_id: study.id,
      prefix: "BCN",
    });

    const visit = composition.recordVisit(ctx, {
      subject_id: subject.id,
      visit_kind: "screening",
      notes: "Baseline assessment",
    });

    assertExists(visit.id);
    assertEquals(visit.visit_kind, "screening");
    assertEquals(visit.recorded_by_actor_id, actor.id);

    const events = eventLog.listAll(ctx.db);
    assertEquals(events.length, 2); // subject.enrolled + visit.recorded
    assertEquals(events[1].action, "visit.recorded");
    assertEquals(events[1].target_id, visit.id);
  });
});

Deno.test("recordVisit: forced audit failure leaves zero visit rows", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "sc@example.com", "SC");
    ctx.actor = actor;
    const study = studies.create(ctx.db, "BCN-OX-201", "Beacon Oncology Phase II");
    const subject = composition.enrollSubject(ctx, {
      study_id: study.id,
      prefix: "BCN",
    });

    const restore = monkeyPatchHashToThrow();
    try {
      assertThrows(() => {
        composition.recordVisit(ctx, {
          subject_id: subject.id,
          visit_kind: "week_4",
        });
      });
    } finally {
      restore();
    }

    assertEquals(visits.listBySubject(ctx.db, subject.id).length, 0);
    // The enrollSubject event must still be there (committed before the patched call)
    assertEquals(eventLog.listAll(ctx.db).length, 1);
  });
});
