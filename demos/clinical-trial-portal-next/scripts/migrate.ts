/**
 * scripts/migrate.ts — apply migrations/0001_init.sql idempotently.
 * Uses whichever backend lib/db.ts selected (pglite by default; pg if DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "../lib/db.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(HERE, "..", "migrations", "0001_init.sql"), "utf-8");
await exec(sql);
console.log(`✓ Migration complete (${process.env.DATABASE_URL ? "pg" : "pglite"}).`);
process.exit(0);
