// tests/atoms/studies.test.ts — Regulated artifact: Study

import { assertEquals, assertThrows } from "jsr:@std/assert";
import * as studies from "../../domain/studies.ts";
import { withTestDb } from "../_helpers.ts";

Deno.test("studies.create writes row and returns it", () => {
  withTestDb((ctx) => {
    const s = studies.create(ctx.db, "BCN-OX-201", "Phase II Oncology Trial");
    assertEquals(s.protocol_number, "BCN-OX-201");
    assertEquals(s.title, "Phase II Oncology Trial");
  });
});

Deno.test("studies.getByProtocol finds study", () => {
  withTestDb((ctx) => {
    studies.create(ctx.db, "PROTO-001", "Test Protocol");
    const found = studies.getByProtocol(ctx.db, "PROTO-001");
    assertEquals(found?.title, "Test Protocol");
  });
});

Deno.test("studies.getByProtocol returns null for unknown", () => {
  withTestDb((ctx) => {
    assertEquals(studies.getByProtocol(ctx.db, "NO-SUCH"), null);
  });
});

Deno.test("studies.getById returns study", () => {
  withTestDb((ctx) => {
    const s = studies.create(ctx.db, "ID-TEST", "ID Test");
    assertEquals(studies.getById(ctx.db, s.id)?.protocol_number, "ID-TEST");
  });
});

Deno.test("studies.listAll returns all studies", () => {
  withTestDb((ctx) => {
    studies.create(ctx.db, "S1", "Study 1");
    studies.create(ctx.db, "S2", "Study 2");
    assertEquals(studies.listAll(ctx.db).length, 2);
  });
});

Deno.test("studies.create rejects duplicate protocol_number", () => {
  withTestDb((ctx) => {
    studies.create(ctx.db, "DUP-PROTO", "Original");
    assertThrows(() => studies.create(ctx.db, "DUP-PROTO", "Duplicate"));
  });
});

Deno.test("studies.create rejects empty fields", () => {
  withTestDb((ctx) => {
    assertThrows(() => studies.create(ctx.db, "", "Title"));
    assertThrows(() => studies.create(ctx.db, "PROTO", ""));
  });
});
