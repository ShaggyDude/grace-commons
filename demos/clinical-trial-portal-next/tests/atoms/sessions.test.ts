// tests/atoms/sessions.test.ts — Atom: Session
// Ported from render 1 (Deno→node:test, sync→async, ctx.db→module db).
//
// Lifecycle: Active → Expired | Revoked. Render 2's getActive enforces both
// guards in SQL — `revoked_at IS NULL AND expires_at > now` — so an expired or
// revoked session is simply absent from the active query.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as sessions from "../../domain/sessions.ts";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";
import type { Queryable } from "../../lib/db.ts";

let seq = 0;
async function seedActor(db: Queryable) {
  // Unique email per call so repeated seeding inside one fresh db never collides.
  const party = await parties.create(db, `sess-${++seq}@x.com`, "Sess Test");
  return actors.create(db, party.id);
}

function futureTs(hoursAhead = 8): string {
  return new Date(Date.now() + hoursAhead * 3_600_000).toISOString();
}

test("sessions.create writes row and returns it", async () => {
  await withTestDb(async (_ctx, db) => {
    const actor = await seedActor(db);
    const sess = await sessions.create(db, actor.id, "tok-abc", futureTs());
    assert.equal(sess.actor_id, actor.id);
    assert.equal(sess.token, "tok-abc");
    assert.equal(sess.revoked_at, null);
    assert.ok(sess.issued_at != null);
  });
});

test("sessions.getActive returns session for valid token", async () => {
  await withTestDb(async (_ctx, db) => {
    const actor = await seedActor(db);
    await sessions.create(db, actor.id, "valid-tok", futureTs());
    const found = await sessions.getActive(db, "valid-tok");
    assert.equal(found?.actor_id, actor.id);
  });
});

test("sessions.getActive returns null for revoked session", async () => {
  await withTestDb(async (_ctx, db) => {
    const actor = await seedActor(db);
    const sess = await sessions.create(db, actor.id, "rev-tok", futureTs());
    await sessions.revoke(db, sess.id);
    assert.equal(await sessions.getActive(db, "rev-tok"), null);
  });
});

test("sessions.getActive returns null for expired session", async () => {
  await withTestDb(async (_ctx, db) => {
    const actor = await seedActor(db);
    const pastTs = new Date(Date.now() - 1000).toISOString();
    await sessions.create(db, actor.id, "exp-tok", pastTs);
    assert.equal(await sessions.getActive(db, "exp-tok"), null);
  });
});

test("sessions.getActive returns null for unknown token", async () => {
  await withTestDb(async (_ctx, db) => {
    assert.equal(await sessions.getActive(db, "no-such-token"), null);
  });
});

test("sessions.revoke (by token lookup) drops the session from active", async () => {
  // Render 1 had a `revokeByToken` helper; render 2 only exposes revoke(id).
  // Same coverage intent: a revoked session no longer returns from getActive.
  await withTestDb(async (_ctx, db) => {
    const actor = await seedActor(db);
    const sess = await sessions.create(db, actor.id, "rbt-tok", futureTs());
    const active = await sessions.getActive(db, "rbt-tok");
    assert.ok(active != null);
    await sessions.revoke(db, active!.id);
    assert.equal(await sessions.getActive(db, "rbt-tok"), null);
  });
});
