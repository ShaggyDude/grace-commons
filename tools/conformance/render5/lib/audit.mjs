// tools/conformance/render5/lib/audit.mjs
//
// The tamper-evident audit log helper — this render's Tamper Evidence + Event
// Log surface, wired the way the Audit Trail composition (C1) requires.
//
// Every consequential action appends one `audit_event` row inside the SAME
// transaction as the state change it records (audit-first / atomic). Each row
// carries a monotonic `seq` (the Event Log's total order and surrogate id) and
// a `link_hash` = sha256 over the row's canonical fields INCLUDING seq and the
// predecessor's hash. The chain is seeded by a genesis row (anonymous,
// verb=trial.bootstrapped) that is hashed by the EXACT same function as every
// other row — there is no genesis-only special case. That is the load-bearing
// correctness property: verifyChain recomputes the genesis row identically.

import { createHash } from "node:crypto";

// Canonical JSON: stable key order so the digest is reproducible. We only ever
// hash a flat object of scalars (+ one stringified detail), so a sorted-key
// JSON.stringify is sufficient and deterministic.
function canonical(obj) {
  const keys = Object.keys(obj).sort();
  const flat = {};
  for (const k of keys) flat[k] = obj[k];
  return JSON.stringify(flat);
}

// The hashed projection of an event row. EVERY row — genesis included — is
// hashed over exactly these fields. null actor/token are encoded as null so the
// genesis row (no actor, no token) hashes consistently with the same code path.
export function hashRow({ seq, happened_at, actor_staff, token_id, verb, subject_kind, subject_ref, detail, parent_hash }) {
  const projection = {
    seq,
    happened_at,
    actor_staff: actor_staff ?? null,
    token_id: token_id ?? null,
    verb,
    subject_kind: subject_kind ?? null,
    subject_ref: subject_ref ?? null,
    detail: canonical(detail ?? {}),
    parent_hash,
  };
  return createHash("sha256").update(canonical(projection)).digest("hex");
}

// Append one event. Reads the singleton cursor for the next seq + last hash,
// computes the link hash, inserts the row, advances the cursor. The caller is
// responsible for running this inside a transaction with the state change.
//
// `happened_at` is supplied by the caller so the audit row and the record it
// describes carry the same timestamp; a monotonic clock keeps occurred_at
// non-decreasing in seq order (the Event Log total-order property).
export async function appendEvent(db, {
  happened_at,
  actor_staff = null,
  token_id = null,
  verb,
  subject_kind = null,
  subject_ref = null,
  detail = {},
}) {
  const cur = await db.query(`SELECT next_seq, last_hash FROM audit_cursor WHERE id = 1`);
  const { next_seq, last_hash } = cur.rows[0];
  const seq = Number(next_seq);
  const parent_hash = last_hash;

  const link_hash = hashRow({
    seq,
    happened_at,
    actor_staff,
    token_id,
    verb,
    subject_kind,
    subject_ref,
    detail,
    parent_hash,
  });

  await db.query(
    `INSERT INTO audit_event
       (seq, happened_at, actor_staff, token_id, verb, subject_kind, subject_ref, detail, parent_hash, link_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [seq, happened_at, actor_staff, token_id, verb, subject_kind, subject_ref, JSON.stringify(detail), parent_hash, link_hash],
  );

  await db.query(
    `UPDATE audit_cursor SET next_seq = $1, last_hash = $2 WHERE id = 1`,
    [seq + 1, link_hash],
  );

  return seq;
}
