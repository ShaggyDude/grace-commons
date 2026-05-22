// tests/atoms/permissions.test.ts — Atom: Permissions (registry)

import { assertEquals, assertThrows } from "jsr:@std/assert";
import * as permissions from "../../domain/permissions.ts";
import { withTestDb } from "../_helpers.ts";

Deno.test("permissions.create writes row and returns it", () => {
  withTestDb((ctx) => {
    const p = permissions.create(ctx.db, "test_action", "Test Action");
    assertEquals(p.code, "test_action");
    assertEquals(p.label, "Test Action");
  });
});

Deno.test("permissions.getByCode finds existing permission", () => {
  withTestDb((ctx) => {
    permissions.create(ctx.db, "do_thing", "Do Thing");
    const found = permissions.getByCode(ctx.db, "do_thing");
    assertEquals(found?.label, "Do Thing");
  });
});

Deno.test("permissions.getByCode returns null for unknown code", () => {
  withTestDb((ctx) => {
    assertEquals(permissions.getByCode(ctx.db, "nonexistent"), null);
  });
});

Deno.test("permissions.getById returns permission", () => {
  withTestDb((ctx) => {
    const p = permissions.create(ctx.db, "act_x", "Act X");
    assertEquals(permissions.getById(ctx.db, p.id)?.code, "act_x");
  });
});

Deno.test("permissions.listAll returns all permissions", () => {
  withTestDb((ctx) => {
    permissions.create(ctx.db, "perm_a", "A");
    permissions.create(ctx.db, "perm_b", "B");
    const all = permissions.listAll(ctx.db);
    assertEquals(all.length, 2);
  });
});

Deno.test("permissions.create rejects duplicate code", () => {
  withTestDb((ctx) => {
    permissions.create(ctx.db, "dup_code", "First");
    assertThrows(() => permissions.create(ctx.db, "dup_code", "Second"));
  });
});

Deno.test("permissions.create rejects empty code", () => {
  withTestDb((ctx) => {
    assertThrows(() => permissions.create(ctx.db, "", "Label"));
  });
});
