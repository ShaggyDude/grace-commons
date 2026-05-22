// tests/atoms/sessions.test.ts — Atom: Session

import { assertEquals, assertExists } from "jsr:@std/assert";
import * as sessions from "../../domain/sessions.ts";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";

function seedActor(ctx: { db: any }) {
  const party = parties.create(ctx.db, `sess-${Date.now()}@x.com`, "Sess Test");
  return actors.create(ctx.db, party.id);
}

function futureTs(hoursAhead = 8): string {
  return new Date(Date.now() + hoursAhead * 3_600_000).toISOString();
}

Deno.test("sessions.create writes row and returns it", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx);
    const sess = sessions.create(ctx.db, actor.id, "tok-abc", futureTs());
    assertEquals(sess.actor_id, actor.id);
    assertEquals(sess.token, "tok-abc");
    assertEquals(sess.revoked_at, null);
    assertExists(sess.issued_at);
  });
});

Deno.test("sessions.getActive returns session for valid token", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx);
    sessions.create(ctx.db, actor.id, "valid-tok", futureTs());
    const found = sessions.getActive(ctx.db, "valid-tok");
    assertEquals(found?.actor_id, actor.id);
  });
});

Deno.test("sessions.getActive returns null for revoked session", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx);
    const sess = sessions.create(ctx.db, actor.id, "rev-tok", futureTs());
    sessions.revoke(ctx.db, sess.id);
    assertEquals(sessions.getActive(ctx.db, "rev-tok"), null);
  });
});

Deno.test("sessions.getActive returns null for expired session", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx);
    const pastTs = new Date(Date.now() - 1000).toISOString();
    sessions.create(ctx.db, actor.id, "exp-tok", pastTs);
    assertEquals(sessions.getActive(ctx.db, "exp-tok"), null);
  });
});

Deno.test("sessions.getActive returns null for unknown token", () => {
  withTestDb((ctx) => {
    assertEquals(sessions.getActive(ctx.db, "no-such-token"), null);
  });
});

Deno.test("sessions.revokeByToken sets revoked_at", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx);
    sessions.create(ctx.db, actor.id, "rbt-tok", futureTs());
    sessions.revokeByToken(ctx.db, "rbt-tok");
    assertEquals(sessions.getActive(ctx.db, "rbt-tok"), null);
  });
});
