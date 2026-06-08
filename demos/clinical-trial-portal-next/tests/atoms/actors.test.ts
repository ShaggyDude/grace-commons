// tests/atoms/actors.test.ts — Atom: Actor Identity
// Ported from render 1 (Deno→node:test, sync→async, ctx.db→module db).
//
// Divergence from render 1: render 2's Actor row carries only {id, party_id,
// created_at} — there is no `display_name` column on actors (the name lives on
// the bound party). Render 1's assertions on `actor.display_name` are adapted to
// assert the binding (party_id) and, where the original intent was display-name
// coverage, to read the name back through the bound party. Coverage intent —
// "the actor binds to the right party and the set is retrievable" — is preserved.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import type { Ctx, Queryable } from "../../lib/db.ts";
import { withTestDb } from "../_helpers.ts";

function seedParty(db: Queryable) {
  return parties.create(db, "actor-test@example.com", "Actor Test User");
}

test("actors.create writes row and binds to the party", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const party = await seedParty(db);
    const actor = await actors.create(db, party.id);
    assert.equal(actor.party_id, party.id);
    assert.ok(actor.created_at != null);
    // display_name lives on the party in render 2 — read it back through the bind.
    const boundParty = await parties.getById(db, actor.party_id);
    assert.equal(boundParty?.display_name, "Actor Test User");
  });
});

test("actors.getById returns the actor bound to its party", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const party = await seedParty(db);
    const actor = await actors.create(db, party.id);
    const found = await actors.getById(db, actor.id);
    assert.equal(found?.id, actor.id);
    assert.equal(found?.party_id, party.id);
    const boundParty = await parties.getById(db, found!.party_id);
    assert.equal(boundParty?.display_name, "Actor Test User");
  });
});

test("actors.getById returns null for unknown id", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    assert.equal(await actors.getById(db, 9999), null);
  });
});

test("actors.getByPartyId returns actor for known party", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const party = await seedParty(db);
    const actor = await actors.create(db, party.id);
    const found = await actors.getByPartyId(db, party.id);
    assert.equal(found?.id, actor.id);
  });
});

test("actors.listAll returns all actors bound to the right parties", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const p1 = await parties.create(db, "x@x.com", "X");
    const p2 = await parties.create(db, "y@y.com", "Y");
    await actors.create(db, p1.id);
    await actors.create(db, p2.id);
    const all = await actors.listAll(db);
    assert.equal(all.length, 2);
    // Resolve display names through the bound parties (no display_name on actors).
    const names = (
      await Promise.all(
        all.map(async (a) => (await parties.getById(db, a.party_id))?.display_name),
      )
    ).sort();
    assert.deepEqual(names, ["X", "Y"]);
  });
});
