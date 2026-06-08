// tests/atoms/event_log.test.ts — Atom: Event Log + Tamper Evidence
// Ported from render 1 (Deno→node:test, sync→async, ctx.db→module db).
//
// Render-2 mechanics carried over from the domain module:
//   • appendEvent runs inside withTx (the global audit advisory lock is held for
//     the body); it reads the acting actor/session off tx.ctx. render 2's withTx
//     passes the SAME ctx object into tx.ctx, so setting ctx.actor/ctx.session
//     before the withTx call propagates — matching render 1's seedActorAndSession.
//   • id is allocated MAX(id)+1 (no IDENTITY); first event id is 1, prev_hash "".
//
// Divergences from render 1:
//   • tampering is done with `db.query("UPDATE …")` (async Postgres) rather than
//     render 1's synchronous `ctx.db.prepare(…).run(…)` (SQLite).
//   • render 2's domain/event_log.ts has no `listFiltered`; render 1's
//     "listFiltered filters by action" test is adapted to retrieve a specific
//     event by id via `getById` (the read surface render 2 exposes) while keeping
//     the "a specific appended event is individually retrievable" coverage intent.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as event_log from "../../domain/event_log.ts";
import * as parties from "../../domain/parties.ts";
import * as actors from "../../domain/actors.ts";
import * as sessions from "../../domain/sessions.ts";
import type { Ctx, Queryable } from "../../lib/db.ts";
import { withTestDb, monkeyPatchHashToThrow } from "../_helpers.ts";
import { withTx } from "../../lib/db.ts";

function futureTs() {
  return new Date(Date.now() + 8 * 3_600_000).toISOString();
}

async function seedActorAndSession(ctx: Ctx, db: Queryable) {
  const party = await parties.create(db, `el-${Date.now()}@x.com`, "EL Test");
  const actor = await actors.create(db, party.id);
  const sess = await sessions.create(db, actor.id, `tok-${Date.now()}`, futureTs());
  ctx.actor = actor as any;
  ctx.session = sess as any;
}

test("appendEvent inserts a row and returns id", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);
    const id = await withTx(ctx, (tx) =>
      event_log.appendEvent(tx, { action: "test.action", target_kind: "test", target_id: 1 }),
    );
    assert.equal(id, 1);
    const rows = await event_log.listAll(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, "test.action");
  });
});

test("appendEvent chains prev_hash correctly", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);
    await withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "first" }));
    await withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "second" }));
    const rows = await event_log.listAll(db);
    assert.equal(rows[0].prev_hash, "");
    assert.equal(rows[1].prev_hash, rows[0].this_hash);
  });
});

test("appendEvent uses empty prev_hash for row #1", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);
    await withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "first.event" }));
    const rows = await event_log.listAll(db);
    assert.equal(rows[0].prev_hash, "");
  });
});

test("verifyChain returns ok for intact log", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);
    await withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "a" }));
    await withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "b" }));
    await withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "c" }));
    const result = await event_log.verifyChain(db);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.count, 3);
  });
});

test("verifyChain detects tampered payload_json", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);
    await withTx(ctx, (tx) =>
      event_log.appendEvent(tx, { action: "first", payload: { original: true } }),
    );
    await withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "second" }));
    // Tamper row #1 directly (async UPDATE, not render 1's prepare().run()).
    await db.query("UPDATE event_log SET payload_json = $1 WHERE id = 1", [
      '{"tampered":true}',
    ]);
    const result = await event_log.verifyChain(db);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.at, 1);
  });
});

test("verifyChain returns ok: true, count: 0 for empty log", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const result = await event_log.verifyChain(db);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.count, 0);
  });
});

test("appendEvent rollback: hash failure leaves no rows", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);
    const restore = monkeyPatchHashToThrow();
    try {
      await assert.rejects(() =>
        withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "should.not.commit" })),
      );
    } finally {
      restore();
    }
    assert.equal((await event_log.listAll(db)).length, 0);
  });
});

test("appended event is individually retrievable by id", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);
    const idAlpha = await withTx(ctx, (tx) =>
      event_log.appendEvent(tx, { action: "alpha" }),
    );
    await withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "beta" }));
    // render 2 has no listFiltered — retrieve the specific event by id instead.
    const row = await event_log.getById(db, idAlpha);
    assert.ok(row != null);
    assert.equal(row?.action, "alpha");
  });
});
