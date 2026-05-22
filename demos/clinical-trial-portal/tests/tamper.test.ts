// tests/tamper.test.ts
//
// Tamper-evidence tests.
//
// Demonstrates the core property of the Event Log + Tamper Evidence atoms:
// given an append-only log with a SHA-256 hash chain, any mutation to any row's
// payload_json causes verifyChain to detect divergence at that exact row.
//
// The test mutates the database directly — simulating an adversary who has raw
// write access to the SQLite file — and asserts that verifyChain names the
// correct row id and returns the expected vs. found hashes.

import { assertEquals, assertExists } from "jsr:@std/assert";
import { withTestDb } from "./_helpers.ts";
import * as composition from "../composition.ts";
import * as parties from "../domain/parties.ts";
import * as actors from "../domain/actors.ts";
import * as studies from "../domain/studies.ts";
import * as eventLog from "../domain/event_log.ts";
import type { Ctx } from "../lib/db.ts";
import type { Actor } from "../domain/actors.ts";

// ---------------------------------------------------------------------------
// Seed helper
// ---------------------------------------------------------------------------

function seedActor(ctx: Ctx, email: string, name: string): Actor {
  const party = parties.create(ctx.db, email, name);
  return actors.create(ctx.db, party.id);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("verifyChain: passes on an unmodified chain", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "pi@example.com", "PI");
    ctx.actor = actor;

    composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "SC",
      intended_role: "coordinator",
    });

    const result = eventLog.verifyChain(ctx.db);
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.count, 1);
    }
  });
});

Deno.test("verifyChain: detects mutation of payload_json at row 1", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "pi@example.com", "PI");
    ctx.actor = actor;

    composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "SC",
      intended_role: "coordinator",
    });

    const before = eventLog.listAll(ctx.db);
    assertEquals(before.length, 1);
    const targetId = before[0].id;

    // Adversary mutates payload_json directly
    ctx.db.prepare(
      `UPDATE event_log SET payload_json = '{"tampered":true}' WHERE id = ?`,
    ).run(targetId);

    const result = eventLog.verifyChain(ctx.db);
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.at, targetId);
      assertExists(result.expected);
      assertExists(result.found);
      // The two hashes must differ
      assertEquals(result.expected !== result.found, true);
    }
  });
});

Deno.test("verifyChain: detects mutation mid-chain (row 2 of 3)", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "pi@example.com", "PI");
    const study = studies.create(ctx.db, "BCN-OX-201", "Beacon Oncology");
    ctx.actor = actor;

    // Emit 3 events
    composition.issueInvitation(ctx, {
      email: "sc1@example.com",
      display_name: "SC1",
      intended_role: "coordinator",
    });
    composition.enrollSubject(ctx, { study_id: study.id, prefix: "BCN" });
    composition.enrollSubject(ctx, { study_id: study.id, prefix: "BCN" });

    const rows = eventLog.listAll(ctx.db);
    assertEquals(rows.length, 3);

    // Mutate the middle row
    const middleId = rows[1].id;
    ctx.db.prepare(
      `UPDATE event_log SET payload_json = '{"injected":"evil"}' WHERE id = ?`,
    ).run(middleId);

    const result = eventLog.verifyChain(ctx.db);
    assertEquals(result.ok, false);
    if (!result.ok) {
      // Divergence must be detected at the mutated row, not a later one
      assertEquals(result.at, middleId);
    }
  });
});

Deno.test("verifyChain: detects mutation of occurred_at (not just payload_json)", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "pi@example.com", "PI");
    ctx.actor = actor;

    composition.issueInvitation(ctx, {
      email: "sc@example.com",
      display_name: "SC",
      intended_role: "coordinator",
    });

    const rows = eventLog.listAll(ctx.db);
    const targetId = rows[0].id;

    // Mutate occurred_at — an adversary might try to alter the timestamp
    ctx.db.prepare(
      `UPDATE event_log SET occurred_at = '1970-01-01T00:00:00.000Z' WHERE id = ?`,
    ).run(targetId);

    const result = eventLog.verifyChain(ctx.db);
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.at, targetId);
    }
  });
});

Deno.test("verifyChain: row count is reported correctly on clean chain", () => {
  withTestDb((ctx) => {
    const actor = seedActor(ctx, "pi@example.com", "PI");
    const study = studies.create(ctx.db, "BCN-OX-201", "Beacon Oncology");
    ctx.actor = actor;

    for (let i = 0; i < 5; i++) {
      composition.enrollSubject(ctx, { study_id: study.id, prefix: "BCN" });
    }

    const result = eventLog.verifyChain(ctx.db);
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.count, 5);
    }
  });
});
