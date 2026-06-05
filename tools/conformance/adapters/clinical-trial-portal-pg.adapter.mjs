// tools/conformance/adapters/clinical-trial-portal-pg.adapter.mjs
//
// Render-3 VALIDATOR ADAPTER (Postgres / pglite). Async init: the engine is
// async, but the evaluators are synchronous, so this loads render 3's whole
// store into memory once, closes Postgres, and exposes sync accessors over the
// snapshot — mapping render 3's schema + event vocabulary back to the canonical
// (render-1) shapes the unchanged evaluators expect.

import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";

const canon = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
};
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const ACTION = {
  "audit.genesis": "study.registered", "signin.ok": "login.succeeded", "signin.no": "login.failed",
  "session.open": "session.opened", "session.close": "session.revoked",
  "member.invite": "invitation.issued", "member.join-accept": "invitation.accepted", "member.invite-cancel": "invitation.revoked",
  "login.create": "actor.enrolled", "passcode.create": "credential.created",
  "perm.grant": "grant.issued", "perm.undo": "grant.revoked",
  "enrollee.add": "subject.enrolled", "visit.add": "visit.recorded",
};
const TARGET_KIND = { login: "actor", session: "session", invitation: "invitation", grant: "grant", enrollee: "subject", visit: "visit", passcode: "credential", trial: "study" };
const ONBOARD_KINDS = new Set(["member.join-accept", "login.create", "passcode.create", "session.open"]);

function auditDigest(r) {
  return sha256(canon({ seq: r.seq, ts: r.ts, login_id: r.login_id, session_id: r.session_id, kind: r.kind, ref_type: r.ref_type, ref_id: r.ref_id, data: r.data, prev: r.prev }));
}

export default async function createAdapter({ dbPath }) {
  const db = new PGlite(dbPath);
  const all = async (t) => (await db.query(`SELECT * FROM ${t} ORDER BY ${t === "audit" ? "seq" : "id"} ASC`)).rows;
  // Load the whole store, then close Postgres — accessors are sync over snapshots.
  const snap = {
    members: await all("members"), logins: await all("logins"), passcodes: await all("passcodes"),
    sessions: await all("sessions"), grants: await all("grants_tbl"), invitations: await all("invitations"),
    audit: await all("audit"), retention: await all("retention_cfg"),
  };
  await db.close();

  const toEvent = (r) => {
    let payload = {}; try { payload = JSON.parse(r.data); } catch { payload = {}; }
    return {
      id: r.seq, occurred_at: r.ts, actor_id: r.login_id, session_id: r.session_id,
      action: ACTION[r.kind] ?? r.kind, target_kind: r.ref_type ? (TARGET_KIND[r.ref_type] ?? r.ref_type) : null,
      target_id: r.ref_id, payload, prev_hash: r.prev, this_hash: r.mac,
    };
  };
  const events = snap.audit.map(toEvent);

  const party = (r) => r && ({ id: r.id, email: r.email, display_name: r.display_name, created_at: r.registered_at });
  const actor = (r) => r && ({ id: r.id, party_id: r.member_id, created_at: r.created_at });
  const credential = (r) => ({ id: r.id, actor_id: r.login_id, kind: r.scheme, secret_hash: r.digest, created_at: r.created_at, revoked_at: r.disabled_at });
  const session = (r) => r && ({ id: r.id, actor_id: r.login_id, token: r.ticket, issued_at: r.opened_at, expires_at: r.closes_at, revoked_at: r.closed_at });
  const grant = (r) => ({ id: r.id, grantor_actor_id: r.granter_id, grantee_actor_id: r.holder_id, permission_id: r.perm_id, scope: r.scope, issued_at: r.made_at, revoked_at: r.undone_at, revoke_reason: r.undo_reason });
  const invite = (r) => r && ({ id: r.id, party_id: r.member_id, intended_role: r.role, token: r.ticket, issued_by_actor_id: r.sent_by, issued_at: r.sent_at, expires_at: r.expires_at, accepted_at: r.taken_at, accepted_by_actor_id: r.taken_by, revoked_at: r.cancelled_at });

  const api = {
    events: () => events,
    eventsByAction: (a) => events.filter((e) => e.action === a),
    eventsByActor: (id) => events.filter((e) => e.actor_id === id),
    event: (id) => events.find((e) => e.id === id) ?? null,

    verifyChain() {
      let count = 0;
      for (const r of snap.audit) {
        const expected = auditDigest(r);
        if (expected !== r.mac) return { ok: false, at: r.seq, expected, found: r.mac };
        count++;
      }
      return { ok: true, count };
    },

    parties: () => snap.members.map(party),
    party: (id) => party(snap.members.find((r) => r.id === id)) ?? null,
    actors: () => snap.logins.map(actor),
    actor: (id) => actor(snap.logins.find((r) => r.id === id)) ?? null,
    credentials: () => snap.passcodes.map(credential),
    sessions: () => snap.sessions.map(session),
    session: (id) => session(snap.sessions.find((r) => r.id === id)) ?? null,
    grants: () => snap.grants.map(grant),
    invitations: () => snap.invitations.map(invite),
    invitation: (id) => invite(snap.invitations.find((r) => r.id === id)) ?? null,
    retentionPolicy: () => { const r = snap.retention[0]; return r ? { days: r.days, enforce_on_read: r.filter_reads } : null; },

    onboardingCompletions() {
      return api.eventsByAction("actor.enrolled").map((ev) => {
        const burst = snap.audit.filter((r) => r.login_id === ev.actor_id && r.session_id === ev.session_id && ONBOARD_KINDS.has(r.kind));
        const has = (canonAction) => burst.some((r) => (ACTION[r.kind] ?? r.kind) === canonAction);
        return {
          completion_event_id: ev.id, occurred_at: ev.occurred_at,
          actor_id: ev.target_id, attributed_actor_id: ev.actor_id,
          party_id: ev.payload.member_id ?? null, invitation_id: ev.payload.via_invitation_id ?? null,
          session_id: ev.session_id,
          has_invitation_accepted_event: has("invitation.accepted"),
          has_credential_event: has("credential.created"),
          has_session_opened_event: has("session.opened"),
          burst_event_ids: burst.map((r) => r.seq),
        };
      });
    },

    close: () => {},   // Postgres already closed after the snapshot load.
  };
  return api;
}
