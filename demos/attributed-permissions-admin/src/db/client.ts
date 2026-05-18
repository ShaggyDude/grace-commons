import { Database } from "@db/sqlite";

// Ensure the data directory exists
try {
  await Deno.mkdir("data", { recursive: true });
} catch {
  // already exists
}

const DB_PATH = Deno.env.get("DB_PATH") ?? "data/apa-demo.sqlite";

export const db = new Database(DB_PATH);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");
db.exec("PRAGMA synchronous = NORMAL");

/**
 * Wraps a synchronous function in a BEGIN IMMEDIATE / COMMIT transaction.
 * Rolls back and re-throws on any error.
 *
 * issue_grant and revoke_grant both use this to ensure the attest + write +
 * pair sequence is atomic. See CORNERS.md "Transaction boundary" for the
 * orphan-log interaction.
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
