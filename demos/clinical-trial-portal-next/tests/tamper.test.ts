// tests/tamper.test.ts — Tamper-evidence tests (Event Log + Tamper Evidence).
//
// Ported from render 1 (demos/clinical-trial-portal/tests/tamper.test.ts),
// adapted to render 2's async/Postgres (pglite) seam.
//
// Coverage intent (preserved verbatim from render 1): given an append-only log
// with a SHA-256 hash chain, any mutation to any row causes verifyChain to detect
// divergence at that exact row id, naming expected vs. found hashes. The test
// mutates the database directly — simulating an adversary with raw write access —
// and asserts verifyChain reports the correct row.
//
// Render-2 divergences from render 1:
//   • Events are seeded by driving appendEvent directly inside withTx (render 1
//     drove composition.issueInvitation / composition.enrollSubject). Same effect:
//     a chain of N attributed audit rows. This mirrors the green event_log port,
//     which is render 2's reference for how appendEvent is exercised in tests.
//   • Tampering uses async `db.query("UPDATE … WHERE id = $1", [...])` (Postgres)
//     rather than render 1's synchronous `ctx.db.prepare(…).run(…)` (SQLite).
//   • verifyChain returns a RESULT object ({ ok:true,count } | { ok:false,at,
//     expected,found }) instead of throwing; assertions read the returned shape.
//   • ids are MAX(id)+1 (no IDENTITY); the first event id is 1.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as event_log from "../domain/event_log.ts";
import * as parties from "../domain/parties.ts";
import * as actors from "../domain/actors.ts";
import * as sessions from "../domain/sessions.ts";
import type { Ctx, Queryable } from "../lib/db.ts";
import { withTestDb } from "./_helpers.ts";
import { withTx } from "../lib/db.ts";

// ---------------------------------------------------------------------------
// Seed helper — an attributed actor/session, so seeded events carry actor_id /
// session_id (render 1's events were attributed via the composition's ctx.actor).
// ---------------------------------------------------------------------------

function futureTs() {
  return new Date(Date.now() + 8 * 3_600_000).toISOString();
}

async function seedActorAndSession(ctx: Ctx, db: Queryable) {
  const party = await parties.create(db, `tmp-${Date.now()}@x.com`, "Tamper Test");
  const actor = await actors.create(db, party.id);
  const sess = await sessions.create(db, actor.id, `tok-${Date.now()}`, futureTs());
  ctx.actor = actor as any;
  ctx.session = sess as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("verifyChain: passes on an unmodified chain", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);

    await withTx(ctx, (tx) =>
      event_log.appendEvent(tx, {
        action: "invitation.issued",
        target_kind: "invitation",
        target_id: 1,
        payload: { email: "sc@example.com", intended_role: "coordinator" },
      }),
    );

    const result = await event_log.verifyChain(db);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.count, 1);
    }
  });
});

test("verifyChain: detects mutation of payload_json at row 1", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);

    await withTx(ctx, (tx) =>
      event_log.appendEvent(tx, {
        action: "invitation.issued",
        target_kind: "invitation",
        target_id: 1,
        payload: { email: "sc@example.com", intended_role: "coordinator" },
      }),
    );

    const before = await event_log.listAll(db);
    assert.equal(before.length, 1);
    const targetId = before[0].id;

    // Adversary mutates payload_json directly (async UPDATE, not prepare().run()).
    await db.query(`UPDATE event_log SET payload_json = $1 WHERE id = $2`, [
      '{"tampered":true}',
      targetId,
    ]);

    const result = await event_log.verifyChain(db);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.at, targetId);
      assert.ok(result.expected != null);
      assert.ok(result.found != null);
      // The two hashes must differ.
      assert.equal(result.expected !== result.found, true);
    }
  });
});

test("verifyChain: detects mutation mid-chain (row 2 of 3)", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);

    // Emit 3 events.
    await withTx(ctx, (tx) =>
      event_log.appendEvent(tx, { action: "invitation.issued", payload: { n: 1 } }),
    );
    await withTx(ctx, (tx) =>
      event_log.appendEvent(tx, { action: "subject.enrolled", payload: { n: 2 } }),
    );
    await withTx(ctx, (tx) =>
      event_log.appendEvent(tx, { action: "subject.enrolled", payload: { n: 3 } }),
    );

    const rows = await event_log.listAll(db);
    assert.equal(rows.length, 3);

    // Mutate the middle row.
    const middleId = rows[1].id;
    await db.query(`UPDATE event_log SET payload_json = $1 WHERE id = $2`, [
      '{"injected":"evil"}',
      middleId,
    ]);

    const result = await event_log.verifyChain(db);
    assert.equal(result.ok, false);
    if (!result.ok) {
      // Divergence must be detected at the mutated row, not a later one.
      assert.equal(result.at, middleId);
    }
  });
});

test("verifyChain: detects mutation of occurred_at (not just payload_json)", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);

    await withTx(ctx, (tx) =>
      event_log.appendEvent(tx, {
        action: "invitation.issued",
        payload: { email: "sc@example.com" },
      }),
    );

    const rows = await event_log.listAll(db);
    const targetId = rows[0].id;

    // Mutate occurred_at — an adversary might try to alter the timestamp.
    // occurred_at is part of the hashed payload, so verifyChain must catch this.
    await db.query(`UPDATE event_log SET occurred_at = $1 WHERE id = $2`, [
      "1970-01-01T00:00:00.000Z",
      targetId,
    ]);

    const result = await event_log.verifyChain(db);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.at, targetId);
    }
  });
});

test("verifyChain: row count is reported correctly on clean chain", async () => {
  await withTestDb(async (ctx: Ctx, db) => {
    await seedActorAndSession(ctx, db);

    for (let i = 0; i < 5; i++) {
      await withTx(ctx, (tx) =>
        event_log.appendEvent(tx, { action: "subject.enrolled", payload: { i } }),
      );
    }

    const result = await event_log.verifyChain(db);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.count, 5);
    }
  });
});
