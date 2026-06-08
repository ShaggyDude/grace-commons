// tests/atoms/retention_policy.test.ts — Atom: Retention Window
// Ported from render 1 (Deno→node:test, sync→async, ctx.db→module db).
//
// Render 2's surface is smaller than render 1's: it exposes only get(q) and
// ensure(q, days?, enforce_on_read?). Render 1's setDays / toggleEnforcement do
// not exist here, so those two tests are re-expressed against render 2's actual
// behavior while preserving coverage intent:
//   • single-row identity (id = 1 by schema CHECK) — tested directly;
//   • the days value and the enforce_on_read flag both seedable via ensure();
//   • idempotency that does NOT overwrite an existing row (ON CONFLICT DO NOTHING).
//
// Behavior difference adapted (per port rule 5): render 1's ensureDefault seeded
// enforce_on_read = TRUE ("production posture"); render 2's ensure() passes the
// parameter default enforce_on_read = false explicitly, which overrides the
// schema's DEFAULT TRUE. So after a bare ensure(db) the flag is FALSE here.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as retention_policy from "../../domain/retention_policy.ts";
import { withTestDb } from "../_helpers.ts";

test("retention_policy.get returns null before seeding", async () => {
  await withTestDb(async (_ctx, db) => {
    assert.equal(await retention_policy.get(db), null);
  });
});

test("retention_policy.ensure seeds the single row (id=1, days=2555)", async () => {
  await withTestDb(async (_ctx, db) => {
    await retention_policy.ensure(db);
    const policy = await retention_policy.get(db);
    assert.equal(policy?.id, 1);
    assert.equal(policy?.days, 2555);
    // Render 2: ensure() passes enforce_on_read=false explicitly (overrides the
    // schema DEFAULT TRUE). Render 1 seeded TRUE; this is the adapted assertion.
    assert.equal(policy?.enforce_on_read, false);
  });
});

test("retention_policy.ensure is idempotent and does not overwrite", async () => {
  await withTestDb(async (_ctx, db) => {
    await retention_policy.ensure(db);
    // ON CONFLICT (id) DO NOTHING: a second call with different args is a no-op,
    // so the first-seeded values survive.
    await retention_policy.ensure(db, 3650, true);
    const policy = await retention_policy.get(db);
    assert.equal(policy?.days, 2555);
    assert.equal(policy?.enforce_on_read, false);
  });
});

test("retention_policy.ensure honors custom days and enforce_on_read on first seed", async () => {
  // Render 1 exercised setDays / toggleEnforcement; render 2 sets both through
  // ensure()'s arguments on the initial insert. Same coverage: the days value
  // and the enforce_on_read flag are both writable.
  await withTestDb(async (_ctx, db) => {
    await retention_policy.ensure(db, 3650, true);
    const policy = await retention_policy.get(db);
    assert.equal(policy?.days, 3650);
    assert.equal(policy?.enforce_on_read, true);
  });
});

test("retention_policy is single-row: schema CHECK rejects id != 1", async () => {
  // The single-row invariant (PRIMARY KEY CHECK (id = 1)) is the structural
  // guarantee behind render 1's getPolicy(... WHERE id = 1) assumption.
  await withTestDb(async (_ctx, db) => {
    await retention_policy.ensure(db);
    await assert.rejects(() =>
      db.query("INSERT INTO retention_policy (id, days) VALUES (2, 100)")
    );
  });
});
