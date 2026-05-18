// Applies src/db/schema.sql to the configured database file.
// Safe to run multiple times — all CREATE statements use IF NOT EXISTS.
//
// Usage: deno task migrate

import { db } from "./client.ts";
import { dirname, fromFileUrl, join } from "jsr:@std/path";

const __dirname = dirname(fromFileUrl(import.meta.url));
const schemaPath = join(__dirname, "schema.sql");
const sql = await Deno.readTextFile(schemaPath);

db.exec(sql);

console.log("✓ Migration complete");
console.log(`  Database: ${Deno.env.get("DB_PATH") ?? "data/apa-demo.sqlite"}`);
