// tests/atoms/retention_policy.test.ts — Atom: Retention Window

import { assertEquals } from "jsr:@std/assert";
import * as retention_policy from "../../domain/retention_policy.ts";
import { withTestDb } from "../_helpers.ts";

Deno.test("retention_policy.getPolicy returns null before seeding", () => {
  withTestDb((ctx) => {
    assertEquals(retention_policy.getPolicy(ctx.db), null);
  });
});

Deno.test("retention_policy.ensureDefault seeds the row (filter ON by default — production posture)", () => {
  withTestDb((ctx) => {
    retention_policy.ensureDefault(ctx.db);
    const policy = retention_policy.getPolicy(ctx.db);
    assertEquals(policy?.id, 1);
    assertEquals(policy?.days, 2555);
    assertEquals(policy?.enforce_on_read, true);
  });
});

Deno.test("retention_policy.ensureDefault is idempotent", () => {
  withTestDb((ctx) => {
    retention_policy.ensureDefault(ctx.db);
    retention_policy.ensureDefault(ctx.db);
    assertEquals(retention_policy.getPolicy(ctx.db)?.days, 2555);
  });
});

Deno.test("retention_policy.setDays updates the days value", () => {
  withTestDb((ctx) => {
    retention_policy.ensureDefault(ctx.db);
    retention_policy.setDays(ctx.db, 3650);
    assertEquals(retention_policy.getPolicy(ctx.db)?.days, 3650);
  });
});

Deno.test("retention_policy.toggleEnforcement flips enforce_on_read", () => {
  withTestDb((ctx) => {
    retention_policy.ensureDefault(ctx.db);
    // Default is now true (filter ON); toggle goes true → false → true.
    retention_policy.toggleEnforcement(ctx.db);
    assertEquals(retention_policy.getPolicy(ctx.db)?.enforce_on_read, false);
    retention_policy.toggleEnforcement(ctx.db);
    assertEquals(retention_policy.getPolicy(ctx.db)?.enforce_on_read, true);
  });
});
