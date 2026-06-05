// tools/conformance/adapters/clinical-trial-portal-next.adapter.mjs
//
// Render-2 VALIDATOR ADAPTER. The only render-specific code needed to measure
// render 2 — proof that a second render drops in by writing an adapter. It does
// real translation: render 2's ledger/tables use a different vocabulary and
// schema, and this maps them back to the CANONICAL action names and record
// shapes the (unchanged) evaluators expect.
//
// Canonical action vocabulary = render 1's event names (the names evaluators.mjs
// speaks). Render 2's `kind` values are mapped here.

import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

const canon = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
};
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// render-2 kind -> canonical (render-1) action
const ACTION = {
  "ledger.genesis": "study.registered",
  "auth.ok": "login.succeeded",
  "auth.fail": "login.failed",
  "session.start": "session.opened",
  "session.end": "session.revoked",
  "account.invite": "invitation.issued",
  "account.invite-accept": "invitation.accepted",
  "account.invite-void": "invitation.revoked",
  "account.open": "actor.enrolled",
  "secret.set": "credential.created",
  "authz.grant": "grant.issued",
  "authz.rescind": "grant.revoked",
  "participant.enroll": "subject.enrolled",
  "encounter.log": "visit.recorded",
};
const TARGET_KIND = {
  account: "actor", token: "session", invite: "invitation", authorization: "grant",
  participant: "subject", encounter: "visit", secret: "credential", study: "study",
};
const ONBOARD_KINDS = new Set(["account.invite-accept", "account.open", "secret.set", "session.start"]);

/** Recompute render 2's digest over its RAW hashable shape (genesis incl. seq). */
function rowDigest(r) {
  return sha256(canon({
    seq: r.seq, at: r.at, account_id: r.account_id, token_id: r.token_id,
    kind: r.kind, subject_type: r.subject_type, subject_ref: r.subject_ref,
    body: r.body, prior_digest: r.prior_digest,
  }));
}

export default function createAdapter({ dbPath }) {
  const db = new DatabaseSync(dbPath, { readOnly: true });

  // ── map a ledger row to a canonical Event ──
  const toEvent = (r) => {
    let payload = {};
    try { payload = JSON.parse(r.body); } catch { payload = {}; }
    return {
      id: r.seq,
      occurred_at: r.at,
      actor_id: r.account_id,
      session_id: r.token_id,
      action: ACTION[r.kind] ?? r.kind,
      target_kind: r.subject_type ? (TARGET_KIND[r.subject_type] ?? r.subject_type) : null,
      target_id: r.subject_ref,
      payload,
      prev_hash: r.prior_digest,
      this_hash: r.digest,
    };
  };
  const ledger = () => db.prepare("SELECT * FROM ledger ORDER BY seq ASC").all();

  // ── canonical record shapes (render-1 column names the evaluators read) ──
  const party = (r) => r && ({ id: r.id, email: r.email, display_name: r.full_name, created_at: r.joined_at });
  const actor = (r) => r && ({ id: r.id, party_id: r.person_id, created_at: r.opened_at });
  const credential = (r) => ({ id: r.id, actor_id: r.account_id, kind: r.method, secret_hash: r.material, created_at: r.set_at, revoked_at: r.retired_at });
  const session = (r) => r && ({ id: r.id, actor_id: r.account_id, token: r.value, issued_at: r.started_at, expires_at: r.ends_at, revoked_at: r.ended_at });
  const grant = (r) => ({ id: r.id, grantor_actor_id: r.grantor_id, grantee_actor_id: r.holder_id, permission_id: r.capability_id, scope: r.scope, issued_at: r.granted_at, revoked_at: r.rescinded_at, revoke_reason: r.rescind_note });
  const invite = (r) => r && ({ id: r.id, party_id: r.person_id, intended_role: r.role, token: r.secret_value, issued_by_actor_id: r.sent_by_id, issued_at: r.sent_at, expires_at: r.expires_at, accepted_at: r.accepted_at, accepted_by_actor_id: r.accepted_by_id, revoked_at: r.voided_at });

  const api = {
    events: () => ledger().map(toEvent),
    eventsByAction: (a) => ledger().map(toEvent).filter((e) => e.action === a),
    eventsByActor: (id) => ledger().map(toEvent).filter((e) => e.actor_id === id),
    event: (id) => { const r = db.prepare("SELECT * FROM ledger WHERE seq = ?").get(id); return r ? toEvent(r) : null; },

    verifyChain() {
      const rows = ledger();
      let count = 0;
      for (const r of rows) {
        const expected = rowDigest(r);
        if (expected !== r.digest) return { ok: false, at: r.seq, expected, found: r.digest };
        count++;
      }
      return { ok: true, count };
    },

    parties: () => db.prepare("SELECT * FROM people ORDER BY id").all().map(party),
    party: (id) => party(db.prepare("SELECT * FROM people WHERE id = ?").get(id)) ?? null,
    actors: () => db.prepare("SELECT * FROM accounts ORDER BY id").all().map(actor),
    actor: (id) => actor(db.prepare("SELECT * FROM accounts WHERE id = ?").get(id)) ?? null,
    credentials: () => db.prepare("SELECT * FROM secrets ORDER BY id").all().map(credential),
    sessions: () => db.prepare("SELECT * FROM tokens ORDER BY id").all().map(session),
    session: (id) => session(db.prepare("SELECT * FROM tokens WHERE id = ?").get(id)) ?? null,
    grants: () => db.prepare("SELECT * FROM authorizations ORDER BY id").all().map(grant),
    invitations: () => db.prepare("SELECT * FROM invites ORDER BY id").all().map(invite),
    invitation: (id) => invite(db.prepare("SELECT * FROM invites WHERE id = ?").get(id)) ?? null,
    retentionPolicy: () => { const r = db.prepare("SELECT * FROM retention WHERE id = 1").get(); return r ? { days: r.horizon_days, enforce_on_read: r.filter_on_read } : null; },

    onboardingCompletions() {
      const opens = api.eventsByAction("actor.enrolled");
      return opens.map((ev) => {
        const burst = db.prepare("SELECT * FROM ledger WHERE account_id = ? AND token_id = ? ORDER BY seq")
          .all(ev.actor_id, ev.session_id).filter((r) => ONBOARD_KINDS.has(r.kind));
        const has = (canonAction) => burst.some((r) => (ACTION[r.kind] ?? r.kind) === canonAction);
        return {
          completion_event_id: ev.id,
          occurred_at: ev.occurred_at,
          actor_id: ev.target_id,                  // account.open targets the new account
          attributed_actor_id: ev.actor_id,
          party_id: ev.payload.person_id ?? null,  // render-2 body key → normalized
          invitation_id: ev.payload.via_invite_id ?? null,
          session_id: ev.session_id,
          has_invitation_accepted_event: has("invitation.accepted"),
          has_credential_event: has("credential.created"),
          has_session_opened_event: has("session.opened"),
          burst_event_ids: burst.map((r) => r.seq),
        };
      });
    },

    close: () => db.close(),
  };
  return api;
}
