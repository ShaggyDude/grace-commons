// tests/atoms/permissions.test.ts — Atom: Permissions (registry)
// Ported from render 1 (Deno→node:test, sync→async, ctx.db→module db).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as permissions from "../../domain/permissions.ts";
import { withTestDb } from "../_helpers.ts";

test("permissions.create writes row and returns it", async () => {
  await withTestDb(async (_ctx, db) => {
    const p = await permissions.create(db, "test_action", "Test Action");
    assert.equal(p.code, "test_action");
    assert.equal(p.label, "Test Action");
  });
});

test("permissions.getByCode finds existing permission", async () => {
  await withTestDb(async (_ctx, db) => {
    await permissions.create(db, "do_thing", "Do Thing");
    const found = await permissions.getByCode(db, "do_thing");
    assert.equal(found?.label, "Do Thing");
  });
});

test("permissions.getByCode returns null for unknown code", async () => {
  await withTestDb(async (_ctx, db) => {
    assert.equal(await permissions.getByCode(db, "nonexistent"), null);
  });
});

test("permissions.getById returns permission", async () => {
  await withTestDb(async (_ctx, db) => {
    const p = await permissions.create(db, "act_x", "Act X");
    assert.equal((await permissions.getById(db, p.id))?.code, "act_x");
  });
});

test("permissions.listAll returns all permissions", async () => {
  await withTestDb(async (_ctx, db) => {
    await permissions.create(db, "perm_a", "A");
    await permissions.create(db, "perm_b", "B");
    const all = await permissions.listAll(db);
    assert.equal(all.length, 2);
  });
});

test("permissions.create rejects duplicate code", async () => {
  await withTestDb(async (_ctx, db) => {
    await permissions.create(db, "dup_code", "First");
    // Render 2: rejection comes from the UNIQUE(code) constraint (Postgres),
    // surfacing as a rejected promise rather than a sync throw.
    await assert.rejects(() => permissions.create(db, "dup_code", "Second"));
  });
});

test("permissions.create rejects empty code", async () => {
  await withTestDb(async (_ctx, db) => {
    // Render 2 guards `!code || !label` in-function before the insert.
    await assert.rejects(() => permissions.create(db, "", "Label"));
  });
});
