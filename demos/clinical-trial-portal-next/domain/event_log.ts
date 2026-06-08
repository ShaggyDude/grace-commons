/**
 * domain/event_log.ts — Event Log + Tamper Evidence (C1 audit substrate).
 *
 * Library spec — Event Log (atoms/event-log.md): "anything appended to
 * the log stays in the log, in the order it arrived, forever, unchanged … append
 * adds a new event at the tail and returns an opaque identifier; read returns
 * events in strict sequence order. There is no edit and no delete surface."
 * Library spec — Tamper Evidence (atoms/tamper-evidence.md): seals
 * make tampering "structurally visible to anyone who has the original records and
 * the seal."
 *
 * Ported from render 1 (demos/clinical-trial-portal/domain/event_log.ts), now
 * async + Postgres. `id` is assigned MAX(id)+1 under the global advisory lock
 * (held by withTx) so it can be part of the hash before insert (BUILD_PLAN §6.4).
 *
 * PORTING HAZARD made explicit: SQLite returned integer columns as JS numbers;
 * Postgres returns BIGINT as strings. The hashed payload must use the SAME types
 * on append and on verify, so every id is coerced to a JS number via `num()`
 * before hashing. (This is a render-layer detail the SQLite engine hid — it
 * belongs in the divergence log, BUILD_PLAN §9.)
 */
import type { Queryable, Tx } from "../lib/db.ts";
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
  /** Override the event timestamp (e.g. the seed's backdated genesis). Defaults
   *  to now(). Uses the SAME hash path as every other event — deliberately, so
   *  the genesis row can never diverge from appendEvent the way render 1's did. */
  occurred_at?: string;
}

/** Coerce a BIGINT-as-string (or number/null) to a JS number|null. */
const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

/**
 * The hashed payload shape — IDENTICAL to render 1 (BUILD_PLAN §6.3). All ids are
 * JS numbers here so append and verify hash the same bytes.
 */
function hashEvent(f: {
  id: number; occurred_at: string; actor_id: number | null; session_id: number | null;
  action: string; target_kind: string | null; target_id: number | null;
  payload_json: string; prev_hash: string;
}): string {
  return sha256hex(canonicalize({
    id: f.id,
    occurred_at: f.occurred_at,
    actor_id: f.actor_id,
    session_id: f.session_id,
    action: f.action,
    target_kind: f.target_kind,
    target_id: f.target_id,
    payload_json: f.payload_json,
    prev_hash: f.prev_hash,
  }));
}

/**
 * Append one event inside the caller's transaction (advisory lock already held).
 * Reads the tail this_hash and MAX(id) race-free under the lock, computes id and
 * this_hash, inserts the explicit id. Returns the new event id.
 */
export async function appendEvent(tx: Tx, input: AppendEventInput): Promise<number> {
  const [prev] = await tx.query<{ this_hash: string }>(
    "SELECT this_hash FROM event_log ORDER BY id DESC LIMIT 1",
  );
  const prev_hash = prev?.this_hash ?? "";

  const [maxRow] = await tx.query<{ m: string | number }>(
    "SELECT COALESCE(MAX(id), 0) AS m FROM event_log",
  );
  const id = Number(maxRow.m) + 1;

  const occurred_at = input.occurred_at ?? new Date().toISOString();
  const actor_id = num(tx.ctx.actor?.id);
  const session_id = num(tx.ctx.session?.id);
  const target_kind = input.target_kind ?? null;
  const target_id = num(input.target_id);
  const payload_json = canonicalize(input.payload ?? {});

  const this_hash = hashEvent({
    id, occurred_at, actor_id, session_id,
    action: input.action, target_kind, target_id, payload_json, prev_hash,
  });

  await tx.query(
    `INSERT INTO event_log
       (id, occurred_at, actor_id, session_id, action, target_kind, target_id, payload_json, prev_hash, this_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, occurred_at, actor_id, session_id, input.action, target_kind, target_id, payload_json, prev_hash, this_hash],
  );
  return id;
}

/**
 * Re-compute the chain from event #1. Returns {ok,count} if intact, or the first
 * divergent row id with expected/found hashes.
 */
export async function verifyChain(
  q: Queryable,
): Promise<{ ok: true; count: number } | { ok: false; at: number; expected: string; found: string }> {
  const rows = await q.query<EventRow>("SELECT * FROM event_log ORDER BY id ASC");
  let count = 0;
  for (const row of rows) {
    const expected = hashEvent({
      id: num(row.id)!,
      occurred_at: row.occurred_at,
      actor_id: num(row.actor_id),
      session_id: num(row.session_id),
      action: row.action,
      target_kind: row.target_kind,
      target_id: num(row.target_id),
      payload_json: row.payload_json,
      prev_hash: row.prev_hash,
    });
    if (expected !== row.this_hash) {
      return { ok: false, at: num(row.id)!, expected, found: row.this_hash };
    }
    count++;
  }
  return { ok: true, count };
}

/** Read helpers (reads use the top-level Queryable; no transaction). */
export async function listAll(q: Queryable): Promise<EventRow[]> {
  return q.query<EventRow>("SELECT * FROM event_log ORDER BY id ASC");
}
export async function getById(q: Queryable, id: number): Promise<EventRow | null> {
  const [row] = await q.query<EventRow>("SELECT * FROM event_log WHERE id = $1", [id]);
  return row ?? null;
}
