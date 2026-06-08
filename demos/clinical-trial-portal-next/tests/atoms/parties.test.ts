// tests/atoms/parties.test.ts — Atom: Party Identity
// Ported from render 1 (Deno→node:test, sync→async, ctx.db→module db).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";

test("parties.create writes row and returns it", async () => {
  await withTestDb(async (_ctx, db) => {
    const p = await parties.create(db, "test@example.com", "Test User");
    assert.equal(p.email, "test@example.com");
    assert.equal(p.display_name, "Test User");
    assert.equal(typeof p.id, "number");
    assert.equal(typeof p.created_at, "string");
  });
});

test("parties.getById returns the created party", async () => {
  await withTestDb(async (_ctx, db) => {
    const p = await parties.create(db, "bob@example.com", "Bob");
    const found = await parties.getById(db, p.id);
    assert.equal(found?.email, "bob@example.com");
  });
});

test("parties.getById returns null for unknown id", async () => {
  await withTestDb(async (_ctx, db) => {
    assert.equal(await parties.getById(db, 9999), null);
  });
});

test("parties.getByEmail finds existing party", async () => {
  await withTestDb(async (_ctx, db) => {
    await parties.create(db, "alice@example.com", "Alice");
    const found = await parties.getByEmail(db, "alice@example.com");
    assert.equal(found?.display_name, "Alice");
  });
});

test("parties.getByEmail returns null for unknown email", async () => {
  await withTestDb(async (_ctx, db) => {
    assert.equal(await parties.getByEmail(db, "nobody@example.com"), null);
  });
});

test("parties.create rejects empty email", async () => {
  await withTestDb(async (_ctx, db) => {
    await assert.rejects(() => parties.create(db, "", "Name"));
  });
});

test("parties.create rejects empty display_name", async () => {
  await withTestDb(async (_ctx, db) => {
    await assert.rejects(() => parties.create(db, "a@b.com", ""));
  });
});

test("parties.create rejects duplicate email", async () => {
  await withTestDb(async (_ctx, db) => {
    await parties.create(db, "dup@example.com", "First");
    await assert.rejects(() => parties.create(db, "dup@example.com", "Second"));
  });
});

test("parties.listAll returns all parties", async () => {
  await withTestDb(async (_ctx, db) => {
    await parties.create(db, "a@x.com", "A");
    await parties.create(db, "b@x.com", "B");
    const all = await parties.listAll(db);
    assert.equal(all.length, 2);
  });
});
