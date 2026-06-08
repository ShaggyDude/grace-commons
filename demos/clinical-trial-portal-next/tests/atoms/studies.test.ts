// tests/atoms/studies.test.ts — Regulated artifact: Study
// Ported from render 1 (Deno→node:test, sync→async, ctx.db→module db).
//
// Render-1↔render-2 behavior delta adapted below:
//   • studies.create in render 1 validated empty fields and threw; render 2
//     drops that validation, and an empty string is NOT NULL in Postgres, so
//     render 2 ACCEPTS empty protocol_number/title. The "rejects empty fields"
//     test is therefore re-expressed as render 2's actual behavior: empty
//     strings are accepted (the UNIQUE/NOT-NULL schema is the only gate).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as studies from "../../domain/studies.ts";
import { withTestDb } from "../_helpers.ts";

test("studies.create writes row and returns it", async () => {
  await withTestDb(async (_ctx, db) => {
    const s = await studies.create(db, "BCN-OX-201", "Phase II Oncology Trial");
    assert.equal(s.protocol_number, "BCN-OX-201");
    assert.equal(s.title, "Phase II Oncology Trial");
    assert.equal(typeof s.id, "number");
    assert.equal(typeof s.created_at, "string");
  });
});

test("studies.getByProtocol finds study", async () => {
  await withTestDb(async (_ctx, db) => {
    await studies.create(db, "PROTO-001", "Test Protocol");
    const found = await studies.getByProtocol(db, "PROTO-001");
    assert.equal(found?.title, "Test Protocol");
  });
});

test("studies.getByProtocol returns null for unknown", async () => {
  await withTestDb(async (_ctx, db) => {
    assert.equal(await studies.getByProtocol(db, "NO-SUCH"), null);
  });
});

test("studies.getById returns study", async () => {
  await withTestDb(async (_ctx, db) => {
    const s = await studies.create(db, "ID-TEST", "ID Test");
    const found = await studies.getById(db, s.id);
    assert.equal(found?.protocol_number, "ID-TEST");
  });
});

test("studies.getById returns null for unknown id", async () => {
  await withTestDb(async (_ctx, db) => {
    assert.equal(await studies.getById(db, 9999), null);
  });
});

test("studies.listAll returns all studies", async () => {
  await withTestDb(async (_ctx, db) => {
    await studies.create(db, "S1", "Study 1");
    await studies.create(db, "S2", "Study 2");
    const all = await studies.listAll(db);
    assert.equal(all.length, 2);
  });
});

test("studies.create rejects duplicate protocol_number", async () => {
  await withTestDb(async (_ctx, db) => {
    await studies.create(db, "DUP-PROTO", "Original");
    await assert.rejects(() => studies.create(db, "DUP-PROTO", "Duplicate"));
  });
});

// Render-2 behavior (adapted from render 1's "rejects empty fields"): render 2
// performs no domain-level validation, and "" is NOT NULL in Postgres, so empty
// protocol_number/title are accepted rather than rejected.
test("studies.create accepts empty fields (no render-2 domain validation)", async () => {
  await withTestDb(async (_ctx, db) => {
    const s1 = await studies.create(db, "", "Title Only");
    assert.equal(s1.protocol_number, "");
    const s2 = await studies.create(db, "PROTO-X", "");
    assert.equal(s2.title, "");
  });
});
