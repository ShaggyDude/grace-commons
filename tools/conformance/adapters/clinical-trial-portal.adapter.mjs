// tools/conformance/adapters/clinical-trial-portal.adapter.mjs
//
// Render adapter for render 1 (Beacon Clinical Research, Deno+Hono+SQLite).
// THE ONLY per-render code in the validator. A thin, trusted, records-alone
// query layer over the render's SQLite store. It maps spec concepts onto this
// render's concrete events/tables; the evaluators never see SQLite.
//
// Trusted component: a WRONG mapping here makes a conformant render look broken
// (or a broken one look clean), so this file is deliberately small and
// reviewed. It only READS — opened read-only — because a conformance check that
// could mutate the records it inspects is not a conformance check.
//
// Dependency-light: node:sqlite + node:crypto only, matching the repo's harness
// house style. verifyChain() is a 1:1 port of the render's own
// domain/event_log.ts verifyChain + lib/canonical.ts canonicalize + lib/hash.ts
// sha256hex, so "the chain verifies" means exactly what it means inside the
// render — not a re-derivation that could drift.

import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

// ── ported render primitives (byte-faithful to the render's lib/) ───────────

/** lib/canonical.ts — keys sorted lexicographically, no whitespace, null kept. */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

/** lib/hash.ts — synchronous SHA-256 hex. */
const sha256hex = (input) => createHash("sha256").update(input).digest("hex");

// The exact hashable shape from domain/event_log.ts (note: payload_json is the
// stored canonical string, hashed as-is, NOT re-canonicalized).
function rowHash(row) {
  return sha256hex(
    canonicalize({
      id: row.id,
      occurred_at: row.occurred_at,
      actor_id: row.actor_id,
      session_id: row.session_id,
      action: row.action,
      target_kind: row.target_kind,
      target_id: row.target_id,
      payload_json: row.payload_json,
      prev_hash: row.prev_hash,
    }),
  );
}

// Onboarding burst: in render 1 acceptInvitation sets ctx.actor + ctx.session
// before emitting all four events, so the whole burst shares (actor_id,
// session_id). This grouping is the render-specific knowledge the adapter
// exists to hold.
const ONBOARD_ACTIONS = new Set([
  "invitation.accepted",
  "actor.enrolled",
  "credential.created",
  "session.opened",
]);

export default function createAdapter({ dbPath }) {
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const allEvents = () =>
    db.prepare("SELECT * FROM event_log ORDER BY id ASC").all().map(parseEvent);

  function parseEvent(r) {
    let payload = {};
    try { payload = JSON.parse(r.payload_json); } catch { payload = {}; }
    return { ...r, payload };
  }

  const api = {
    // ── events ──
    events: () => allEvents(),
    eventsByAction: (action) =>
      db.prepare("SELECT * FROM event_log WHERE action = ? ORDER BY id ASC").all(action).map(parseEvent),
    eventsByActor: (actorId) =>
      db.prepare("SELECT * FROM event_log WHERE actor_id = ? ORDER BY id ASC").all(actorId).map(parseEvent),
    event: (id) => {
      const r = db.prepare("SELECT * FROM event_log WHERE id = ?").get(id);
      return r ? parseEvent(r) : null;
    },

    // ── tamper-evidence (ported verifyChain) ──
    verifyChain() {
      const rows = db.prepare("SELECT * FROM event_log ORDER BY id ASC").all();
      let count = 0;
      for (const row of rows) {
        const expected = rowHash(row);
        if (expected !== row.this_hash) {
          return { ok: false, at: row.id, expected, found: row.this_hash };
        }
        count++;
      }
      return { ok: true, count };
    },

    // ── constituent atom stores ──
    parties: () => db.prepare("SELECT * FROM parties ORDER BY id ASC").all(),
    party: (id) => db.prepare("SELECT * FROM parties WHERE id = ?").get(id) ?? null,
    actors: () => db.prepare("SELECT * FROM actors ORDER BY id ASC").all(),
    actor: (id) => db.prepare("SELECT * FROM actors WHERE id = ?").get(id) ?? null,
    credentials: () => db.prepare("SELECT * FROM credentials ORDER BY id ASC").all(),
    sessions: () => db.prepare("SELECT * FROM sessions ORDER BY id ASC").all(),
    session: (id) => db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) ?? null,
    grants: () => db.prepare("SELECT * FROM grants ORDER BY id ASC").all(),
    invitations: () => db.prepare("SELECT * FROM invitations ORDER BY id ASC").all(),
    invitation: (id) => db.prepare("SELECT * FROM invitations WHERE id = ?").get(id) ?? null,
    retentionPolicy: () => db.prepare("SELECT * FROM retention_policy WHERE id = 1").get() ?? null,

    // ── onboarding completions (render-specific mapping) ──
    onboardingCompletions() {
      const completions = api.eventsByAction("actor.enrolled");
      return completions.map((ev) => {
        const burst = db
          .prepare("SELECT * FROM event_log WHERE actor_id = ? AND session_id = ? ORDER BY id ASC")
          .all(ev.actor_id, ev.session_id)
          .map(parseEvent)
          .filter((e) => ONBOARD_ACTIONS.has(e.action));
        const has = (a) => burst.some((e) => e.action === a);
        return {
          completion_event_id: ev.id,
          occurred_at: ev.occurred_at,
          actor_id: ev.target_id,        // actor.enrolled targets the new actor
          attributed_actor_id: ev.actor_id,
          party_id: ev.payload.party_id ?? null,
          invitation_id: ev.payload.via_invitation_id ?? null,
          session_id: ev.session_id,
          has_invitation_accepted_event: has("invitation.accepted"),
          has_credential_event: has("credential.created"),
          has_session_opened_event: has("session.opened"),
          burst_event_ids: burst.map((e) => e.id),
        };
      });
    },

    close: () => db.close(),
  };

  return api;
}
