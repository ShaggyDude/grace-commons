// tests/atoms/credentials.test.ts — Atom: Credential

import { assertEquals, assertExists } from "jsr:@std/assert";
import * as credentials from "../../domain/credentials.ts";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";

function seedActor(ctx: { db: any }) {
  const party = parties.create(ctx.db, `cred-${Date.now()}@x.com`, "Cred Test");
  return actors.create(ctx.db, party.id);
}

Deno.test("credentials.create writes row and returns it", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx);
    const cred = credentials.create(ctx.db, actor.id, "password", "$argon2id$fake");
    assertEquals(cred.actor_id, actor.id);
    assertEquals(cred.kind, "password");
    assertEquals(cred.secret_hash, "$argon2id$fake");
    assertEquals(cred.revoked_at, null);
    assertExists(cred.created_at);
  });
});

Deno.test("credentials.getActiveByActorId finds active credential", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx);
    credentials.create(ctx.db, actor.id, "password", "$argon2id$hash");
    const found = credentials.getActiveByActorId(ctx.db, actor.id);
    assertEquals(found?.actor_id, actor.id);
    assertEquals(found?.revoked_at, null);
  });
});

Deno.test("credentials.getActiveByActorId returns null after revoke", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx);
    const cred = credentials.create(ctx.db, actor.id, "password", "$argon2id$hash");
    credentials.revoke(ctx.db, cred.id);
    assertEquals(credentials.getActiveByActorId(ctx.db, actor.id), null);
  });
});

Deno.test("credentials.getActiveByActorId returns null for unknown actor", () => {
  withTestDb((ctx) => {
    assertEquals(credentials.getActiveByActorId(ctx.db, 9999), null);
  });
});

Deno.test("credentials.getById returns credential", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx);
    const cred = credentials.create(ctx.db, actor.id, "password", "hash");
    assertEquals(credentials.getById(ctx.db, cred.id)?.id, cred.id);
  });
});
