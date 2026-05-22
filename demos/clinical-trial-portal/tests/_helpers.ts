// tests/_helpers.ts
//
// Test infrastructure for Phase 1 atom tests and Phase 2 composition tests.
//
// withTestDb:
//   Opens an in-memory SQLite database, applies the full migration schema,
//   builds a minimal Ctx (actor: null, session: null), and calls the test
//   function. The database is closed in a finally block regardless of outcome.
//
// monkeyPatchHashToThrow:
//   Overrides sha256hex to throw on its next call. Used in composition rollback
//   tests (Phase 2) to verify that a forced failure inside appendEvent causes
//   withTx to roll back both atom rows and audit rows.
//
// Both helpers are synchronous, matching the synchronous withTx contract.

import { openDb, type Ctx } from "../lib/db.ts";
import { _testOverrideSha256hex } from "../lib/hash.ts";

// Read migration SQL once at module load time (synchronous file read).
// URL is resolved relative to this file so the path is correct regardless
// of the working directory at test time.
const MIGRATION_SQL = Deno.readTextFileSync(
  new URL("../migrations/0001_init.sql", import.meta.url),
);

/**
 * Run a test function against a fresh in-memory SQLite database with the
 * full schema applied. The database is isolated per call; no state bleeds
 * between tests.
 *
 * The ctx passed to fn has actor: null and session: null. Tests that need a
 * specific actor/session should set them directly:
 *   withTestDb((ctx) => {
 *     ctx.actor = { id: 1, party_id: 1, display_name: "Test" };
 *     ...
 *   });
 */
export function withTestDb(fn: (ctx: Ctx) => void): void {
  const db = openDb(":memory:");
  // Execute the full migration in one shot (IF NOT EXISTS guards make it safe)
  db.exec(MIGRATION_SQL);
  const ctx: Ctx = { db, actor: null, session: null };
  try {
    fn(ctx);
  } finally {
    db.close();
  }
}

/**
 * Async variant of withTestDb for composition tests that call async functions
 * (acceptInvitation, login) before or after the synchronous withTx boundary.
 */
export async function withTestDbAsync(
  fn: (ctx: Ctx) => Promise<void>,
): Promise<void> {
  const db = openDb(":memory:");
  db.exec(MIGRATION_SQL);
  const ctx: Ctx = { db, actor: null, session: null };
  try {
    await fn(ctx);
  } finally {
    db.close();
  }
}

/**
 * Override sha256hex to throw an error on its next invocation.
 * Returns a restore function — always call it in a finally block.
 *
 * Usage:
 *   const restore = monkeyPatchHashToThrow();
 *   try {
 *     assertThrows(() => someCompositionFunction(...));
 *   } finally {
 *     restore();
 *   }
 *
 * This simulates a failure partway through appendEvent, exercising the
 * withTx rollback guarantee: atom rows AND event_log rows must both be absent.
 */
export function monkeyPatchHashToThrow(): () => void {
  return _testOverrideSha256hex(() => {
    throw new Error("sha256hex deliberately failed for rollback test");
  });
}
