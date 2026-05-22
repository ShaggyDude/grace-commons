// tests/atoms/event_log.test.ts — Atom: Event Log + Tamper Evidence

import { assertEquals } from "jsr:@std/assert";
import * as event_log from "../../domain/event_log.ts";
import * as parties from "../../domain/parties.ts";
import * as actors from "../../domain/actors.ts";
import * as sessions from "../../domain/sessions.ts";
import { withTestDb, monkeyPatchHashToThrow } from "../_helpers.ts";
import { withTx } from "../../lib/db.ts";

function futureTs() {
  return new Date(Date.now() + 8 * 3_600_000).toISOString();
}

function seedActorAndSession(ctx: { db: any; actor: any; session: any }) {
  const party = parties.create(ctx.db, `el-${Date.now()}@x.com`, "EL Test");
  const actor = actors.create(ctx.db, party.id);
  const sess = sessions.create(ctx.db, actor.id, `tok-${Date.now()}`, futureTs());
  ctx.actor = actor;
  ctx.session = sess;
}

Deno.test("appendEvent inserts a row and returns id", () => {
  withTestDb((ctx) => {
    seedActorAndSession(ctx);
    const id = withTx(ctx, (tx) =>
      event_log.appendEvent(tx, { action: "test.action", target_kind: "test", target_id: 1 })
    );
    assertEquals(id, 1);
    const rows = event_log.listAll(ctx.db);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].action, "test.action");
  });
});

Deno.test("appendEvent chains prev_hash correctly", () => {
  withTestDb((ctx) => {
    seedActorAndSession(ctx);
    withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "first" }));
    withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "second" }));
    const rows = event_log.listAll(ctx.db);
    assertEquals(rows[0].prev_hash, "");
    assertEquals(rows[1].prev_hash, rows[0].this_hash);
  });
});

Deno.test("appendEvent uses empty prev_hash for row #1", () => {
  withTestDb((ctx) => {
    seedActorAndSession(ctx);
    withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "first.event" }));
    const rows = event_log.listAll(ctx.db);
    assertEquals(rows[0].prev_hash, "");
  });
});

Deno.test("verifyChain returns ok for intact log", () => {
  withTestDb((ctx) => {
    seedActorAndSession(ctx);
    withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "a" }));
    withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "b" }));
    withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "c" }));
    const result = event_log.verifyChain(ctx.db);
    assertEquals(result.ok, true);
    if (result.ok) assertEquals(result.count, 3);
  });
});

Deno.test("verifyChain detects tampered payload_json", () => {
  withTestDb((ctx) => {
    seedActorAndSession(ctx);
    withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "first", payload: { original: true } }));
    withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "second" }));
    // Tamper row #1 directly
    ctx.db.prepare("UPDATE event_log SET payload_json = ? WHERE id = 1")
      .run('{"tampered":true}');
    const result = event_log.verifyChain(ctx.db);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.at, 1);
  });
});

Deno.test("verifyChain returns ok: true, count: 0 for empty log", () => {
  withTestDb((ctx) => {
    const result = event_log.verifyChain(ctx.db);
    assertEquals(result.ok, true);
    if (result.ok) assertEquals(result.count, 0);
  });
});

Deno.test("appendEvent rollback: hash failure leaves no rows", () => {
  withTestDb((ctx) => {
    seedActorAndSession(ctx);
    const restore = monkeyPatchHashToThrow();
    try {
      try {
        withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "should.not.commit" }));
      } catch {
        // expected
      }
    } finally {
      restore();
    }
    assertEquals(event_log.listAll(ctx.db).length, 0);
  });
});

Deno.test("listFiltered filters by action", () => {
  withTestDb((ctx) => {
    seedActorAndSession(ctx);
    withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "alpha" }));
    withTx(ctx, (tx) => event_log.appendEvent(tx, { action: "beta" }));
    const rows = event_log.listFiltered(ctx.db, { action: "alpha" });
    assertEquals(rows.length, 1);
    assertEquals(rows[0].action, "alpha");
  });
});
