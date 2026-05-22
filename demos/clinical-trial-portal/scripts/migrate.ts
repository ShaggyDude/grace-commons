/**
 * Migrate: Apply the schema to a fresh SQLite database.
 * Idempotent: uses CREATE TABLE IF NOT EXISTS so it can be run multiple times.
 *
 * Usage: deno run -A scripts/migrate.ts
 *
 * Creates ./data/dev.db with the full schema from migrations/0001_init.sql.
 */

import { openDb } from "../lib/db.ts";

const DB_PATH = "./data/dev.db";

// Ensure data directory exists
try {
  await Deno.mkdir("./data", { recursive: true });
} catch {
  // directory may already exist
}

// Read the migration file
const migrationSql = await Deno.readTextFile("./migrations/0001_init.sql");

// Open or create the database
const db = openDb(DB_PATH);

// Apply the migration (idempotent due to CREATE TABLE IF NOT EXISTS)
db.exec(migrationSql);

console.log(`✓ Migration complete. Database: ${DB_PATH}`);

db.close();
