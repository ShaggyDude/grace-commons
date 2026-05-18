// audit_tamper.test.ts — Verify that hash-chain forgery is always detectable.
//
// Six tests, each running against a fresh in-memory Database so they are
// fully isolated and leave data/grace-commons-demo.sqlite untouched.
//
// Mutation types covered (BUILD_PLAN.md §12):
//   baseline  — clean chain of 3 events → "verified"  (harness sanity check)
//   1. data_json mutated       → attestation mismatch
//   2. attestation mutated     → attestation mismatch
//   3. row_hash mutated        → row_hash mismatch  (caught on the mutated row itself)
//   4. row deleted             → prev_row_hash mismatch on the successor row
//   5. forged row inserted     → attestation mismatch
//        (attacker can link the SHA-256 chain but cannot forge the HMAC
//         without knowing the actor's credential_secret)
//
// Schema strategy: makeTestDb() builds a minimal actor + audit_event schema
// WITHOUT the append-only UPDATE/DELETE triggers.  Those triggers enforce
// runtime immutability; here we want to test that verify_record() detects
// what they would have prevented.  Omitting them lets tests mutate rows
// directly, which is cleaner than the DROP/recreate dance in /admin/tamper.

import { assertMatch, assertEquals } from "jsr:@std/assert";
import { Database } from "@db/sqlite";
import {
  computeAttestation,
  computeRowHash,
  record_action,
  verify_record,
  type RetentionPolicy,
} from "../src/domain/audit_trail.ts";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const TEST_ACTOR_REF = "test_actor";
const TEST_SECRET     = "sec_test_actor_hmac_32_bytes!!!!";
const TEST_RETENTION: RetentionPolicy = "sox_7_year";

/**
 * Fresh in-memory SQLite with the minimal schema needed for audit_trail.ts:
 * actor table + audit_event table, WITHOUT the append-only triggers.
 */
function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE actor (
      actor_ref         TEXT PRIMARY KEY,
      kind              TEXT NOT NULL,
      display_name      TEXT NOT NULL,
      credential_public TEXT NOT NULL,
      credential_secret TEXT NOT NULL,
      registered_at     TEXT NOT NULL
    );

    CREATE TABLE audit_event (
      event_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      seq              INTEGER NOT NULL UNIQUE,
      action_ref       TEXT    NOT NULL,
      actor_ref        TEXT    NOT NULL REFERENCES actor(actor_ref),
      chain_id         TEXT    NULL,
      step_id          TEXT    NULL,
      recorded_at      TEXT    NOT NULL,
      data_json        TEXT    NOT NULL,
      retention_policy TEXT    NOT NULL,
      retention_until  TEXT    NOT NULL,
      attestation      TEXT    NOT NULL,
      prev_row_hash    TEXT    NOT NULL,
      row_hash         TEXT    NOT NULL
    );
  `);

  db.prepare(`
    INSERT INTO actor
      (actor_ref, kind, display_name, credential_public, credential_secret, registered_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    TEST_ACTOR_REF,
    "human",
    "Test Actor",
    "pub_test_actor",
    TEST_SECRET,
    "2025-01-01T00:00:00.000Z",
  );

  return db;
}

/**
 * Record `count` events and return their event_ids in insertion order.
 * chain_id / step_id are null so no chain row is required.
 */
function seedEvents(db: Database, count: number): number[] {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    record_action(
      {
        action_ref:        "chain_initiated",
        actor_ref:         TEST_ACTOR_REF,
        credential_secret: TEST_SECRET,
        chain_id:          null,
        step_id:           null,
        data:              { seed_index: i },
        retention_policy:  TEST_RETENTION,
      },
      db,
    );
    const row = db.prepare(
      "SELECT event_id FROM audit_event ORDER BY seq DESC LIMIT 1",
    ).get() as { event_id: number };
    ids.push(row.event_id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("baseline: clean chain of 3 events → verified", () => {
  const db  = makeDb();
  const ids = seedEvents(db, 3);
  // verify_record walks from seq=1 up to the target event's seq.
  // Verifying the last event exercises the full chain.
  assertEquals(verify_record(ids[2], db), "verified");
});

Deno.test("tamper 1 — data_json mutated → attestation mismatch", () => {
  // Matches what POST /admin/tamper does: json_set injects a key that was not
  // present when the HMAC was computed, so recomputing the attestation yields
  // a different digest.
  const db  = makeDb();
  const ids = seedEvents(db, 3);

  // Mutate the genesis row; verifying the last event walks the whole chain.
  db.prepare(
    `UPDATE audit_event
     SET data_json = json_set(data_json, '$.tampered_by_demo', 'altered')
     WHERE event_id = ?`,
  ).run(ids[0]);

  const result = verify_record(ids[2], db);
  assertMatch(result, /^failed-verification\(seq \d+: attestation mismatch\)$/);
});

Deno.test("tamper 2 — attestation field replaced directly → attestation mismatch", () => {
  // Someone overwrites the stored HMAC with an arbitrary hex string.
  // data_json is untouched; the stored attestation still won't match the value
  // verify_record computes from the real credential_secret.
  const db  = makeDb();
  const ids = seedEvents(db, 3);

  const FAKE_ATTESTATION = "a".repeat(64);
  db.prepare(
    "UPDATE audit_event SET attestation = ? WHERE event_id = ?",
  ).run(FAKE_ATTESTATION, ids[1]);

  const result = verify_record(ids[2], db);
  assertMatch(result, /^failed-verification\(seq \d+: attestation mismatch\)$/);
});

Deno.test("tamper 3 — row_hash mutated → row_hash mismatch on that row", () => {
  // Someone replaces the stored row_hash with an arbitrary hex string.
  // verify_record recomputes row_hash from (prev_row_hash ∥ canonical(payload))
  // and finds it doesn't match the stored value — detected on the mutated row
  // itself before the successor row is even checked.
  const db  = makeDb();
  const ids = seedEvents(db, 3);

  const FAKE_ROW_HASH = "b".repeat(64);
  db.prepare(
    "UPDATE audit_event SET row_hash = ? WHERE event_id = ?",
  ).run(FAKE_ROW_HASH, ids[1]); // tamper the middle row

  const result = verify_record(ids[2], db);
  assertMatch(result, /^failed-verification\(seq \d+: row_hash mismatch\)$/);
});

Deno.test("tamper 4 — row deleted (spliced out) → prev_row_hash mismatch on successor", () => {
  // Someone physically removes the middle row from the event log.
  // The successor row's prev_row_hash still points to the deleted row's hash,
  // but after processing row 1, verify_record holds row 1's hash as
  // expectedPrevHash.  Row 3's prev_row_hash (= row 2's hash) doesn't match,
  // exposing the gap.
  const db  = makeDb();
  const ids = seedEvents(db, 3);

  db.prepare("DELETE FROM audit_event WHERE event_id = ?").run(ids[1]);

  const result = verify_record(ids[2], db);
  assertMatch(result, /^failed-verification\(seq \d+: prev_row_hash mismatch\)$/);
});

Deno.test("tamper 5 — forged row inserted → attestation mismatch", () => {
  // An attacker with DB-write access inserts a fabricated row after all
  // existing rows.  They can:
  //   ✓ link the SHA-256 hash chain correctly (prev_row_hash = last real hash)
  //   ✓ compute a well-formed row_hash  (SHA-256 requires no secret)
  //   ✗ forge the HMAC attestation      (requires credential_secret)
  //
  // verify_record catches this: it recomputes attestation with the actor's
  // real key and finds a mismatch.
  //
  // Note: INSERT is not blocked by the append-only triggers (only UPDATE and
  // DELETE are).  The HMAC attestation is the defence against insertion attacks.
  const db  = makeDb();
  const ids = seedEvents(db, 2);

  // Read the chain tail so the forged row can link correctly.
  const tail = db.prepare(`
    SELECT COALESCE(MAX(seq), 0) AS max_seq,
           COALESCE(
             (SELECT row_hash FROM audit_event ORDER BY seq DESC LIMIT 1),
             ''
           ) AS prev_hash
    FROM audit_event
  `).get() as { max_seq: number; prev_hash: string };

  const seq            = tail.max_seq + 1;
  const prev_row_hash  = tail.prev_hash;
  const recorded_at    = "2025-06-01T12:00:00.000Z";
  const data_json      = JSON.stringify({ forged: true, payload: "attacker-controlled" });
  const retention_policy = "sox_7_year";
  const retention_until  = "2032-06-01T00:00:00.000Z";

  const corePayload: Record<string, unknown> = {
    action_ref:       "chain_initiated",
    actor_ref:        TEST_ACTOR_REF,
    chain_id:         null,
    data_json,
    recorded_at,
    retention_policy,
    retention_until,
    seq,
    step_id:          null,
  };

  // Attacker computes the HMAC with the wrong key.
  const ATTACKER_KEY        = "attacker_does_not_know_the_secret";
  const forged_attestation  = computeAttestation(ATTACKER_KEY, corePayload);

  // row_hash can be computed correctly — SHA-256 needs no secret.
  const row_hash = computeRowHash(prev_row_hash, {
    ...corePayload,
    attestation: forged_attestation,
  });

  db.prepare(`
    INSERT INTO audit_event
      (seq, action_ref, actor_ref, chain_id, step_id, recorded_at,
       data_json, retention_policy, retention_until, attestation,
       prev_row_hash, row_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    seq,
    "chain_initiated",
    TEST_ACTOR_REF,
    null, null,
    recorded_at,
    data_json,
    retention_policy,
    retention_until,
    forged_attestation,
    prev_row_hash,
    row_hash,
  );

  const forged = db.prepare(
    "SELECT event_id FROM audit_event ORDER BY seq DESC LIMIT 1",
  ).get() as { event_id: number };

  const result = verify_record(forged.event_id, db);
  assertMatch(result, /^failed-verification\(seq \d+: attestation mismatch\)$/);
});
