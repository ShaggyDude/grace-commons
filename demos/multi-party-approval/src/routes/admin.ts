// Admin routes — demo-only helpers, gated behind ?dev=1.
//
// POST /admin/tamper?dev=1   body: event_id=<n>
//
//   Bypasses the audit_event append-only trigger by:
//     1. DROP TRIGGER audit_event_immutable_after_insert
//     2. UPDATE audit_event SET data_json = json_set(..., '$.tampered_by_demo', ...)
//     3. Recreate the trigger
//
//   After the mutation the stored data_json no longer matches the attestation
//   HMAC or the row_hash, so verify_record(event_id) returns
//   "failed-verification(seq N: attestation mismatch)" and the Check chip
//   goes red — making the hash-chain forgery defense self-explanatory to a
//   first-time viewer.
//
//   This route deliberately does NOT use tx() — it must be outside a
//   transaction because DROP TRIGGER / CREATE TRIGGER are DDL statements that
//   SQLite auto-commits regardless of the surrounding transaction state.

import { Hono } from "hono";
import type { AppVariables } from "../middleware/current_actor.ts";
import { db } from "../db/client.ts";

const admin = new Hono<{ Variables: AppVariables }>();

const TRIGGER_DDL = `
CREATE TRIGGER IF NOT EXISTS audit_event_immutable_after_insert
BEFORE UPDATE ON audit_event
BEGIN
  SELECT RAISE(ABORT, 'audit_event is append-only');
END
`;

admin.post("/tamper", async (c) => {
  // Gate: only reachable in dev mode
  if (c.req.query("dev") !== "1") {
    return c.json({ error: "not found" }, 404);
  }

  const body = await c.req.parseBody();
  const event_id = Number(body["event_id"]);

  if (!Number.isInteger(event_id) || event_id < 1) {
    return c.json({ error: "invalid event_id" }, 400);
  }

  // Confirm the row exists before doing DDL surgery
  const existing = db.prepare(
    "SELECT seq FROM audit_event WHERE event_id = ?",
  ).get(event_id) as { seq: number } | undefined;

  if (!existing) {
    return c.json({ error: "event not found" }, 404);
  }

  // --- DDL bypass window (keep as short as possible) ---
  //
  // SQLite DROP/CREATE TRIGGER are auto-committed DDL.  We drop the trigger,
  // mutate the single row, and recreate the trigger in immediate succession.
  // No other writer can slip in because the shared db handle is single-process
  // and the WAL lock is not held across DDL statements, but the window is
  // intentionally tiny and this path only exists in dev mode.

  db.exec("DROP TRIGGER IF EXISTS audit_event_immutable_after_insert");

  // Inject a visible marker into data_json so the HMAC breaks.
  // json_set preserves all existing keys and adds the new one.
  db.prepare(`
    UPDATE audit_event
    SET data_json = json_set(data_json, '$.tampered_by_demo', 'data altered post-hoc by /admin/tamper')
    WHERE event_id = ?
  `).run(event_id);

  db.exec(TRIGGER_DDL);
  // --- end DDL bypass window ---

  if (c.req.header("HX-Request")) {
    // HTMX swap: replace the tamper button with a persistent red badge.
    // The adjacent "Check" button is unaffected; clicking it now returns the
    // failed-verification chip (red) because the stored data_json no longer
    // matches the recomputed attestation.
    return c.html(
      `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200">
        ⚡ mutated · click Check →
      </span>`,
    );
  }

  return c.json({
    ok: true,
    event_id,
    seq: existing.seq,
    message:
      "data_json mutated; attestation and row_hash are now stale — verify_record will return failed-verification",
  });
});

export { admin };
