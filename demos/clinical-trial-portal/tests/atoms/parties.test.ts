// tests/atoms/parties.test.ts — Atom: Party Identity

import { assertEquals, assertThrows } from "jsr:@std/assert";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";

Deno.test("parties.create writes row and returns it", () => {
  withTestDb((ctx) => {
    const p = parties.create(ctx.db, "test@example.com", "Test User");
    assertEquals(p.email, "test@example.com");
    assertEquals(p.display_name, "Test User");
    assertEquals(typeof p.id, "number");
    assertEquals(typeof p.created_at, "string");
  });
});

Deno.test("parties.getById returns the created party", () => {
  withTestDb((ctx) => {
    const p = parties.create(ctx.db, "bob@example.com", "Bob");
    const found = parties.getById(ctx.db, p.id);
    assertEquals(found?.email, "bob@example.com");
  });
});

Deno.test("parties.getById returns null for unknown id", () => {
  withTestDb((ctx) => {
    assertEquals(parties.getById(ctx.db, 9999), null);
  });
});

Deno.test("parties.getByEmail finds existing party", () => {
  withTestDb((ctx) => {
    parties.create(ctx.db, "alice@example.com", "Alice");
    const found = parties.getByEmail(ctx.db, "alice@example.com");
    assertEquals(found?.display_name, "Alice");
  });
});

Deno.test("parties.getByEmail returns null for unknown email", () => {
  withTestDb((ctx) => {
    assertEquals(parties.getByEmail(ctx.db, "nobody@example.com"), null);
  });
});

Deno.test("parties.create rejects empty email", () => {
  withTestDb((ctx) => {
    assertThrows(() => parties.create(ctx.db, "", "Name"));
  });
});

Deno.test("parties.create rejects empty display_name", () => {
  withTestDb((ctx) => {
    assertThrows(() => parties.create(ctx.db, "a@b.com", ""));
  });
});

Deno.test("parties.create rejects duplicate email", () => {
  withTestDb((ctx) => {
    parties.create(ctx.db, "dup@example.com", "First");
    assertThrows(() => parties.create(ctx.db, "dup@example.com", "Second"));
  });
});

Deno.test("parties.listAll returns all parties", () => {
  withTestDb((ctx) => {
    parties.create(ctx.db, "a@x.com", "A");
    parties.create(ctx.db, "b@x.com", "B");
    const all = parties.listAll(ctx.db);
    assertEquals(all.length, 2);
  });
});
