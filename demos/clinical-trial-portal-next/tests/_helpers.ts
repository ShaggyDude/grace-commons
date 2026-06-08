// tests/_helpers.ts — test infrastructure for the second render (Node + pglite).
//
// Ported from render 1 (demos/clinical-trial-portal/tests/_helpers.ts), adapted
// for render 2's async, module-level db seam:
//   • render 1 injected a per-test SQLite handle on `ctx.db`; render 2's domain
//     functions read the module-level `db`/`withTx` from lib/db.ts, which memoize
//     ONE backend on globalThis. So isolation here = force an ephemeral pglite
//     (`PGLITE_DIR="memory://"`, the seam lib/db.ts documents for tests), reset
//     the memoized globals, and apply the schema, fresh per test.
//   • everything is async (the driver is async), so withTestDb is async and the
//     callback receives (ctx, db) — `db` is the module Queryable, routed to the
//     freshly-built backend.
//
// node --test runs each FILE in its own process and the tests within a file
// sequentially, so the global reset below is safe (no two tests share a backend).

import { readFileSync } from "node:fs";
import { db, exec, type Ctx, type Queryable } from "../lib/db.ts";
import { _testOverrideSha256hex } from "../lib/hash.ts";

const MIGRATION_SQL = readFileSync(
  new URL("../migrations/0001_init.sql", import.meta.url),
  "utf8",
);

const G = globalThis as any;

// Every table the schema declares, child-before-parent is irrelevant because
// TRUNCATE … CASCADE + RESTART IDENTITY clears rows and resets every IDENTITY
// sequence in one statement (event_log has no IDENTITY — its MAX(id)+1 allocator
// simply restarts at 1 once the table is empty).
const ALL_TABLES =
  "parties, actors, credentials, sessions, permissions, grants, invitations, " +
  "event_log, retention_policy, studies, subjects, visits";

/**
 * Build the ephemeral in-memory pglite + schema ONCE per test-file process, then
 * reuse it. pglite's WASM init is ~seconds; doing it per-test would make the
 * suite minutes long. node --test isolates files in separate processes, so one
 * warm instance per file is still fully isolated across files.
 */
async function ensureSchemaOnce(): Promise<void> {
  if (G.__beaconTestReady) return;
  delete process.env.DATABASE_URL;      // force the pglite path, never a real server
  process.env.PGLITE_DIR = "memory://"; // ephemeral in-memory instance
  delete G.__beaconBackend; delete G.__beaconPglite; // start from a clean backend
  await exec(MIGRATION_SQL);            // IF NOT EXISTS guards make this safe
  G.__beaconTestReady = true;
}

/**
 * Run `fn` against an isolated, empty database with the full schema applied. The
 * callback gets a minimal Ctx (actor:null, session:null) and the module-level
 * `db` Queryable. Rows are cleared and IDENTITY sequences reset before each call,
 * so no state bleeds between tests (matching render 1's fresh :memory: per test,
 * without paying the WASM-init cost every time).
 *
 * Tests that need a specific actor/session set them directly:
 *   await withTestDb(async (ctx, db) => {
 *     ctx.actor = { id: 1, party_id: 1, display_name: "Test" };
 *     ...
 *   });
 */
export async function withTestDb(
  fn: (ctx: Ctx, db: Queryable) => Promise<void>,
): Promise<void> {
  await ensureSchemaOnce();
  await exec(`TRUNCATE ${ALL_TABLES} RESTART IDENTITY CASCADE`);
  const ctx: Ctx = { actor: null, session: null };
  await fn(ctx, db);
}

/**
 * Override sha256hex to throw on its next invocation; returns a restore fn
 * (always call it in finally). Simulates a failure partway through appendEvent,
 * exercising the withTx rollback guarantee: atom rows AND event_log rows must
 * both be absent. Mirrors render 1's monkeyPatchHashToThrow.
 */
export function monkeyPatchHashToThrow(): () => void {
  return _testOverrideSha256hex(() => {
    throw new Error("sha256hex deliberately failed for rollback test");
  });
}
