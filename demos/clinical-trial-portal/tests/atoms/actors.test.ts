// tests/atoms/actors.test.ts — Atom: Actor Identity

import { assertEquals, assertExists } from "jsr:@std/assert";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import type { Ctx } from "../../lib/db.ts";
import { withTestDb } from "../_helpers.ts";

function seedParty(ctx: Ctx) {
  return parties.create(ctx.db, "actor-test@example.com", "Actor Test User");
}

Deno.test("actors.create writes row and returns it with display_name", () => {
  withTestDb((ctx) => {
    const party = seedParty(ctx);
    const actor = actors.create(ctx.db, party.id);
    assertEquals(actor.party_id, party.id);
    assertEquals(actor.display_name, "Actor Test User");
    assertExists(actor.created_at);
  });
});

Deno.test("actors.getById returns actor with display_name", () => {
  withTestDb((ctx) => {
    const party = seedParty(ctx);
    const actor = actors.create(ctx.db, party.id);
    const found = actors.getById(ctx.db, actor.id);
    assertEquals(found?.id, actor.id);
    assertEquals(found?.display_name, "Actor Test User");
  });
});

Deno.test("actors.getById returns null for unknown id", () => {
  withTestDb((ctx) => {
    assertEquals(actors.getById(ctx.db, 9999), null);
  });
});

Deno.test("actors.getByPartyId returns actor for known party", () => {
  withTestDb((ctx) => {
    const party = seedParty(ctx);
    const actor = actors.create(ctx.db, party.id);
    const found = actors.getByPartyId(ctx.db, party.id);
    assertEquals(found?.id, actor.id);
  });
});

Deno.test("actors.listAll returns all actors with display names", () => {
  withTestDb((ctx) => {
    const p1 = parties.create(ctx.db, "x@x.com", "X");
    const p2 = parties.create(ctx.db, "y@y.com", "Y");
    actors.create(ctx.db, p1.id);
    actors.create(ctx.db, p2.id);
    const all = actors.listAll(ctx.db);
    assertEquals(all.length, 2);
    assertEquals(all.map((a) => a.display_name).sort(), ["X", "Y"]);
  });
});
