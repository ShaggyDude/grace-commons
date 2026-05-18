import { Database } from "@db/sqlite";

// Ensure the data directory exists
try {
  await Deno.mkdir("data", { recursive: true });
} catch {
  // already exists
}

const DB_PATH = Deno.env.get("DB_PATH") ?? "data/grace-commons-demo.sqlite";

export const db = new Database(DB_PATH);

// Per BUILD_PLAN.md §1: WAL mode + busy_timeout = strictly stronger than
// per-chain_id mutex. Single writer, no partial-state risk.
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");
db.exec("PRAGMA synchronous = NORMAL");

/**
 * Wraps a synchronous function in a BEGIN IMMEDIATE / COMMIT transaction.
 * Rolls back and re-throws on any error.
 *
 * Every chain-level and step-level action in chain.ts uses this wrapper.
 * The per-DB writer lock (WAL + BEGIN IMMEDIATE) is the serialization
 * mechanism — see BUILD_PLAN.md §1 and CORNERS.md "Per-DB writer lock".
 */
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors — original error is the one to surface
    }
    throw err;
  }
}
