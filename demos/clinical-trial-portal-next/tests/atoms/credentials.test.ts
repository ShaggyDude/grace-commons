// tests/atoms/credentials.test.ts — Atom: Credential
// Ported from render 1 (Deno→node:test, sync→async, ctx.db→module db).
//
// Divergences from render 1's credentials surface:
//   • render 2's domain/credentials.ts exposes only `getActiveByActorId` and
//     `create` — there is no `credentials.revoke` and no `credentials.getById`.
//   • "returns null after revoke" intent is preserved by performing the revoke
//     directly in SQL (set revoked_at) — exactly the state a revoke would leave —
//     then asserting `getActiveByActorId` no longer returns it.
//   • the render 1 "getById returns credential" test (a function render 2 does
//     not have) is adapted to assert the created credential is retrievable as the
//     active credential by its actor, with id round-tripping — same "the row is
//     persisted and addressable" coverage intent, expressed through the surface
//     render 2 actually exposes.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as credentials from "../../domain/credentials.ts";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import type { Ctx, Queryable } from "../../lib/db.ts";
import { withTestDb } from "../_helpers.ts";

async function seedActor(db: Queryable) {
  const party = await parties.create(db, `cred-${Date.now()}@x.com`, "Cred Test");
  return actors.create(db, party.id);
}

test("credentials.create writes row and returns it", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const actor = await seedActor(db);
    const cred = await credentials.create(db, actor.id, "password", "$argon2id$fake");
    assert.equal(cred.actor_id, actor.id);
    assert.equal(cred.kind, "password");
    assert.equal(cred.secret_hash, "$argon2id$fake");
    assert.equal(cred.revoked_at, null);
    assert.ok(cred.created_at != null);
  });
});

test("credentials.getActiveByActorId finds active credential", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const actor = await seedActor(db);
    await credentials.create(db, actor.id, "password", "$argon2id$hash");
    const found = await credentials.getActiveByActorId(db, actor.id);
    assert.equal(found?.actor_id, actor.id);
    assert.equal(found?.revoked_at, null);
  });
});

test("credentials.getActiveByActorId returns null after revoke", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const actor = await seedActor(db);
    const cred = await credentials.create(db, actor.id, "password", "$argon2id$hash");
    // No credentials.revoke in render 2 — apply the revoke state directly. This
    // is exactly the row state a revoke leaves; the assertion under test is that
    // an active lookup excludes a revoked credential.
    await db.query("UPDATE credentials SET revoked_at = $1 WHERE id = $2", [
      new Date().toISOString(),
      cred.id,
    ]);
    assert.equal(await credentials.getActiveByActorId(db, actor.id), null);
  });
});

test("credentials.getActiveByActorId returns null for unknown actor", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    assert.equal(await credentials.getActiveByActorId(db, 9999), null);
  });
});

test("credentials.create persists an addressable row (id round-trips)", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const actor = await seedActor(db);
    const cred = await credentials.create(db, actor.id, "password", "hash");
    // render 2 has no credentials.getById — retrieve the active credential and
    // confirm it is the one just created (same persistence/addressability intent).
    const found = await credentials.getActiveByActorId(db, actor.id);
    assert.equal(found?.id, cred.id);
  });
});
