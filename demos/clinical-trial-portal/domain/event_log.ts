// domain/event_log.ts
//
// Atom: Event Log + Tamper Evidence (C1 audit substrate)
//
// Library spec — Event Log (quoted from grace-commons/atoms/temporal/event-log.md):
//   "Event Log is a foundational temporal atom that provides a single, simple
//    guarantee: anything appended to the log stays in the log, in the order it
//    arrived, forever (within the lifetime of the log instance), unchanged. [...]
//    The pattern exposes exactly two actions: append, which adds a new event at
//    the tail and returns an opaque identifier; and read, which returns events in
//    strict sequence order for any well-formed query. There is no edit and no
//    delete surface — the log is append-only by design."
//
// Library spec — Tamper Evidence (quoted from grace-commons/atoms/compliance/tamper-evidence.md):
//   "Tamper Evidence is the compliance atom that answers the question 'how do I
//    know these records weren't altered after the fact?' It does this through
//    seals: immutable records that bind a proof — a cryptographic commitment to
//    a record set's content at a point in time — to the record set it covers.
//    [...] The atom enforces detectability, not prevention: it cannot stop an
//    adversary with write access to both the records and the seal store, but it
//    ensures that tampering is structurally visible to anyone who has the
//    original records and the seal."
//
// Implementation note:
//   appendEvent is the one atom helper that does more than "narrow data
//   operations": it reads the previous row's this_hash, computes the new hash
//   over canonical JSON, and inserts. It does NOT start a transaction (the
//   caller — always composition.ts — is already in one). Hash computation lives
//   in lib/hash.ts (sha256hex, synchronous) and lib/canonical.ts (canonicalize).
//
// Invariants:
//   - event_log is append-only (no UPDATE or DELETE in this codebase)
//   - id uses AUTOINCREMENT — no gap reuse, strictly monotonic
//   - this_hash is UNIQUE (schema constraint; prevents silent hash collisions)
//   - prev_hash of row #1 is '' (empty string)
//   - payload_json is serialized via canonicalize() only — never JSON.stringify
//   - actor_id and session_id are nullable (anonymous events such as login.failed)

import type { DB, Tx } from "../lib/db.ts";
import { canonicalize } from "../lib/canonical.ts";
import { sha256hex } from "../lib/hash.ts";

export interface EventRow {
  id: number;
  occurred_at: string;
  actor_id: number | null;
  session_id: number | null;
  action: string;
  target_kind: string | null;
  target_id: number | null;
  payload_json: string;
  prev_hash: string;
  this_hash: string;
}

export interface AppendEventInput {
  action: string;
  target_kind?: string | null;
  target_id?: number | null;
  payload?: Record<string, unknown>;
}

/**
 * Append a new event to the audit log inside the caller's transaction.
 *
 * Hash chain construction:
 *   prev_hash  ← this_hash of the most recent row (or '' for row #1)
 *   this_hash  ← sha256hex(canonicalize({
 *                  id, occurred_at, actor_id, session_id, action,
 *                  target_kind, target_id, payload_json, prev_hash
 *                }))
 *
 * Returns the new event id.
 * MUST be called inside a withTx block — does not start its own transaction.
 */
export function appendEvent(tx: Tx, input: AppendEventInput): number {
  const prev = tx.db
    .prepare("SELECT this_hash FROM event_log ORDER BY id DESC LIMIT 1")
    .get<{ this_hash: string }>();
  const prev_hash = prev?.this_hash ?? "";

  // Read the current max id so we can pre-compute the hash with the correct id.
  // AUTOINCREMENT guarantees the next id is max(id)+1 when rows exist.
  const maxRow = tx.db
    .prepare("SELECT COALESCE(MAX(id), 0) AS m FROM event_log")
    .get<{ m: number }>();
  const id = (maxRow?.m ?? 0) + 1;

  const occurred_at = new Date().toISOString();
  const payload_json = canonicalize(input.payload ?? {});

  const hashable = canonicalize({
    id,
    occurred_at,
    actor_id: tx.ctx.actor?.id ?? null,
    session_id: tx.ctx.session?.id ?? null,
    action: input.action,
    target_kind: input.target_kind ?? null,
    target_id: input.target_id ?? null,
    payload_json,
    prev_hash,
  });
  const this_hash = sha256hex(hashable);

  tx.db
    .prepare(
      `INSERT INTO event_log
         (id, occurred_at, actor_id, session_id, action, target_kind,
          target_id, payload_json, prev_hash, this_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      occurred_at,
      tx.ctx.actor?.id ?? null,
      tx.ctx.session?.id ?? null,
      input.action,
      input.target_kind ?? null,
      input.target_id ?? null,
      payload_json,
      prev_hash,
      this_hash,
    );

  return id;
}

/**
 * Re-compute the hash chain from event #1 and return the first divergence.
 *
 * Returns { ok: true, count } if all hashes match.
 * Returns { ok: false, at, expected, found } at the first mismatch.
 */
export function verifyChain(
  db: DB,
): { ok: true; count: number } | {
  ok: false;
  at: number;
  expected: string;
  found: string;
} {
  const rows = db
    .prepare("SELECT * FROM event_log ORDER BY id ASC")
    .all<EventRow>();

  let count = 0;
  for (const row of rows) {
    const hashable = canonicalize({
      id: row.id,
      occurred_at: row.occurred_at,
      actor_id: row.actor_id,
      session_id: row.session_id,
      action: row.action,
      target_kind: row.target_kind,
      target_id: row.target_id,
      payload_json: row.payload_json,
      prev_hash: row.prev_hash,
    });
    const expected = sha256hex(hashable);
    if (expected !== row.this_hash) {
      return { ok: false, at: row.id, expected, found: row.this_hash };
    }
    count++;
  }
  return { ok: true, count };
}

/** Return all events ordered by id (oldest first). */
export function listAll(db: DB): EventRow[] {
  return db
    .prepare("SELECT * FROM event_log ORDER BY id ASC")
    .all<EventRow>();
}

/** Return a single event by id. */
export function getById(db: DB, id: number): EventRow | null {
  return (
    db
      .prepare("SELECT * FROM event_log WHERE id = ?")
      .get<EventRow>(id) ?? null
  );
}

export interface EventFilters {
  actor_id?: number | null;
  action?: string | null;
  target_kind?: string | null;
  target_id?: number | null;
  from_date?: string | null;
  to_date?: string | null;
  search?: string | null;
}

/**
 * Return events matching the given filters, newest first.
 * All filter fields are optional; omit or pass null to skip that filter.
 */
export function listFiltered(db: DB, filters: EventFilters): EventRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.actor_id != null) {
    conditions.push("actor_id = ?");
    params.push(filters.actor_id);
  }
  if (filters.action) {
    conditions.push("action = ?");
    params.push(filters.action);
  }
  if (filters.target_kind) {
    conditions.push("target_kind = ?");
    params.push(filters.target_kind);
  }
  if (filters.target_id != null) {
    conditions.push("target_id = ?");
    params.push(filters.target_id);
  }
  if (filters.from_date) {
    conditions.push("occurred_at >= ?");
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    conditions.push("occurred_at <= ?");
    params.push(filters.to_date);
  }
  if (filters.search) {
    conditions.push("payload_json LIKE ?");
    params.push(`%${filters.search}%`);
  }

  const where = conditions.length > 0
    ? "WHERE " + conditions.join(" AND ")
    : "";
  return db
    .prepare(`SELECT * FROM event_log ${where} ORDER BY id DESC`)
    .all<EventRow>(...params);
}
