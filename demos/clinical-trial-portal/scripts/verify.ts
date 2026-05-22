// scripts/verify.ts
//
// CLI for `deno task verify`: Recompute the hash chain from event #1 and report
// the result. Monitors and auditors who do not want to trust the web UI can run
// this directly against the database file.
//
// Usage:
//   deno task verify                          (uses ./data/dev.db)
//   deno run -A scripts/verify.ts path/to.db  (explicit path)
//
// Exit codes:
//   0  — chain verified
//   1  — tamper detected or database error

import { openDb } from "../lib/db.ts";
import { verifyChain } from "../domain/event_log.ts";

const dbPath = Deno.args[0] ?? "./data/dev.db";

try {
  const db = openDb(dbPath);
  const result = verifyChain(db);
  db.close();

  if (result.ok) {
    const n = result.count;
    console.log(`✓  Hash chain verified — ${n} event${n === 1 ? "" : "s"} checked.`);
    Deno.exit(0);
  } else {
    console.error(`✗  Tamper detected at event #${result.at}`);
    console.error(`   Expected hash: ${result.expected}`);
    console.error(`   Stored hash:   ${result.found}`);
    Deno.exit(1);
  }
} catch (err) {
  if (err instanceof Deno.errors.NotFound) {
    console.error(`Database not found: ${dbPath}`);
    console.error("Run: deno task migrate && deno task seed");
  } else {
    console.error("Error:", err instanceof Error ? err.message : String(err));
  }
  Deno.exit(1);
}
