// tools/conformance/adapters/clinical-trial-portal-next-app.adapter.mjs
//
// Validator adapter for the REAL deployable Next.js+Postgres demo
// (demos/clinical-trial-portal-next). Unlike renders 2–5 (headless conformance
// fixtures), this points at the actual app's store. Because that render is a
// faithful port of render 1 — SAME canonical schema and SAME action codes — this
// adapter is a near pass-through: no event-vocabulary map, no column renaming.
// It only coerces ids to numbers (the demo's store is read here with a
// parser-less pglite, so BIGINT comes back as strings) and parses payload_json.
//
// Async init: pglite is async, evaluators are sync — load the store into memory
// once, close pglite, serve sync accessors over the snapshot.
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";

const canon = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
};
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const num = (v) => (v === null || v === undefined ? null : Number(v));

// The demo's hashed-event shape (domain/event_log.ts) — same as render 1.
const rowHash = (r) => sha256(canon({
  id: num(r.id), occurred_at: r.occurred_at, actor_id: num(r.actor_id), session_id: num(r.session_id),
  action: r.action, target_kind: r.target_kind, target_id: num(r.target_id),
  payload_json: r.payload_json, prev_hash: r.prev_hash,
}));

const ONBOARD_ACTIONS = new Set(["invitation.accepted", "actor.enrolled", "credential.created", "session.opened"]);

export default async function createAdapter({ dbPath }) {
  const db = new PGlite(dbPath);
  const all = async (sql) => (await db.query(sql)).rows;
  const snap = {
    event_log: await all("SELECT * FROM event_log ORDER BY id ASC"),
    parties: await all("SELECT * FROM parties ORDER BY id ASC"),
    actors: await all("SELECT * FROM actors ORDER BY id ASC"),
    credentials: await all("SELECT * FROM credentials ORDER BY id ASC"),
    sessions: await all("SELECT * FROM sessions ORDER BY id ASC"),
    grants: await all("SELECT * FROM grants ORDER BY id ASC"),
    invitations: await all("SELECT * FROM invitations ORDER BY id ASC"),
    retention: await all("SELECT * FROM retention_policy WHERE id = 1"),
  };
  await db.close();

  const toEvent = (r) => {
    let payload = {}; try { payload = JSON.parse(r.payload_json); } catch { payload = {}; }
    return {
      id: num(r.id), occurred_at: r.occurred_at, actor_id: num(r.actor_id), session_id: num(r.session_id),
      action: r.action, target_kind: r.target_kind, target_id: num(r.target_id),
      payload, prev_hash: r.prev_hash, this_hash: r.this_hash,
    };
  };
  const events = snap.event_log.map(toEvent);

  const party = (r) => r && ({ id: num(r.id), email: r.email, display_name: r.display_name, created_at: r.created_at });
  const actor = (r) => r && ({ id: num(r.id), party_id: num(r.party_id), created_at: r.created_at });
  const credential = (r) => ({ id: num(r.id), actor_id: num(r.actor_id), kind: r.kind, secret_hash: r.secret_hash, created_at: r.created_at, revoked_at: r.revoked_at });
  const session = (r) => r && ({ id: num(r.id), actor_id: num(r.actor_id), token: r.token, issued_at: r.issued_at, expires_at: r.expires_at, revoked_at: r.revoked_at });
  const grant = (r) => ({ id: num(r.id), grantor_actor_id: num(r.grantor_actor_id), grantee_actor_id: num(r.grantee_actor_id), permission_id: num(r.permission_id), scope: r.scope, issued_at: r.issued_at, revoked_at: r.revoked_at, revoke_reason: r.revoke_reason });
  const invite = (r) => r && ({ id: num(r.id), party_id: num(r.party_id), intended_role: r.intended_role, token: r.token, issued_by_actor_id: num(r.issued_by_actor_id), issued_at: r.issued_at, expires_at: r.expires_at, accepted_at: r.accepted_at, accepted_by_actor_id: num(r.accepted_by_actor_id), revoked_at: r.revoked_at });

  const api = {
    events: () => events,
    eventsByAction: (a) => events.filter((e) => e.action === a),
    eventsByActor: (id) => events.filter((e) => e.actor_id === id),
    event: (id) => events.find((e) => e.id === id) ?? null,

    verifyChain() {
      let count = 0;
      for (const r of snap.event_log) {
        const expected = rowHash(r);
        if (expected !== r.this_hash) return { ok: false, at: num(r.id), expected, found: r.this_hash };
        count++;
      }
      return { ok: true, count };
    },

    parties: () => snap.parties.map(party),
    party: (id) => party(snap.parties.find((r) => num(r.id) === id)) ?? null,
    actors: () => snap.actors.map(actor),
    actor: (id) => actor(snap.actors.find((r) => num(r.id) === id)) ?? null,
    credentials: () => snap.credentials.map(credential),
    sessions: () => snap.sessions.map(session),
    session: (id) => session(snap.sessions.find((r) => num(r.id) === id)) ?? null,
    grants: () => snap.grants.map(grant),
    invitations: () => snap.invitations.map(invite),
    invitation: (id) => invite(snap.invitations.find((r) => num(r.id) === id)) ?? null,
    retentionPolicy: () => { const r = snap.retention[0]; return r ? { days: num(r.days), enforce_on_read: r.enforce_on_read } : null; },

    onboardingCompletions() {
      return api.eventsByAction("actor.enrolled").map((ev) => {
        const burst = events.filter((e) => e.actor_id === ev.actor_id && e.session_id === ev.session_id && ONBOARD_ACTIONS.has(e.action));
        const has = (a) => burst.some((e) => e.action === a);
        return {
          completion_event_id: ev.id, occurred_at: ev.occurred_at,
          actor_id: ev.target_id, attributed_actor_id: ev.actor_id,
          party_id: ev.payload.party_id ?? null, invitation_id: ev.payload.via_invitation_id ?? null,
          session_id: ev.session_id,
          has_invitation_accepted_event: has("invitation.accepted"),
          has_credential_event: has("credential.created"),
          has_session_opened_event: has("session.opened"),
          burst_event_ids: burst.map((e) => e.id),
        };
      });
    },

    close: () => {},
  };
  return api;
}
