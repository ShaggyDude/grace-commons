// tools/conformance/adapters/clinical-trial-portal-nextjs.adapter.mjs
//
// The records-alone adapter for render 5 (Next.js + Postgres / pglite). The ONLY
// per-render code the validator loads. It maps THIS render's store onto the
// canonical shapes the shared evaluators expect (events in spec vocabulary,
// constituent-atom records, onboarding completions, retention policy).
//
// pglite is async; the evaluators call accessors synchronously. So createAdapter
// is async: it opens the store, loads every table into memory ONCE, closes
// pglite, and then exposes synchronous accessors over the in-memory snapshot.
//
// The internal action vocabulary (auth.login_ok, session.started, …) is mapped
// to the canonical spec vocabulary (login.succeeded, session.opened, …) here,
// and nowhere else — the evaluators never see a render-specific verb.

import { PGlite } from "@electric-sql/pglite";
import { hashRow } from "../render5/lib/audit.mjs";

// internal verb -> canonical spec action
const VERB_MAP = {
  "trial.bootstrapped": "study.registered",
  "auth.login_ok": "login.succeeded",
  "auth.login_denied": "login.failed",
  "session.started": "session.opened",
  "session.terminated": "session.revoked",
  "enrollment.invite_sent": "invitation.issued",
  "enrollment.invite_claimed": "invitation.accepted",
  "enrollment.invite_withdrawn": "invitation.revoked",
  "staff.registered": "actor.enrolled",
  "secret.minted": "credential.created",
  "authz.granted": "grant.issued",
  "authz.withdrawn": "grant.revoked",
  "subject.enrolled": "subject.enrolled",
  "visit.logged": "visit.recorded",
};

function n(v) {
  return v == null ? null : Number(v);
}

// Normalise a timestamptz the snapshot returns (Date | string) to ISO string —
// the SAME representation the writer hashed (it wrote an ISO string), so the
// recomputed hash matches.
function iso(v) {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export default async function createAdapter({ dbPath }) {
  const db = new PGlite(dbPath);
  await db.waitReady;

  const q = async (sql) => (await db.query(sql)).rows;

  const rawEvents = await q(`SELECT * FROM audit_event ORDER BY seq ASC`);
  const rawParties = await q(`SELECT * FROM party ORDER BY party_id ASC`);
  const rawStaff = await q(`SELECT * FROM staff ORDER BY staff_id ASC`);
  const rawSecrets = await q(`SELECT * FROM secret ORDER BY secret_id ASC`);
  const rawTokens = await q(`SELECT * FROM access_token ORDER BY token_id ASC`);
  const rawAuth = await q(`SELECT * FROM authority ORDER BY authority_id ASC`);
  const rawInvites = await q(`SELECT * FROM enrollment_invite ORDER BY invite_id ASC`);
  const rawRetention = await q(`SELECT * FROM retention_rule WHERE id = 1`);

  await db.close();

  // ── canonical Events ────────────────────────────────────────────────────────
  // Carry BOTH the canonical projection AND the raw hash fields needed to
  // recompute the chain exactly as the writer did.
  const events = rawEvents.map((r) => ({
    id: Number(r.seq),
    occurred_at: iso(r.happened_at),
    actor_id: n(r.actor_staff),
    session_id: n(r.token_id),
    action: VERB_MAP[r.verb] ?? r.verb,
    target_kind: r.subject_kind ?? null,
    target_id: n(r.subject_ref),
    payload: typeof r.detail === "string" ? JSON.parse(r.detail) : (r.detail ?? {}),
    prev_hash: r.parent_hash,
    this_hash: r.link_hash,
    // raw fields for verifyChain (internal verb is what was hashed)
    _raw: {
      seq: Number(r.seq),
      happened_at: iso(r.happened_at),
      actor_staff: n(r.actor_staff),
      token_id: n(r.token_id),
      verb: r.verb,
      subject_kind: r.subject_kind ?? null,
      subject_ref: n(r.subject_ref),
      detail: typeof r.detail === "string" ? JSON.parse(r.detail) : (r.detail ?? {}),
      parent_hash: r.parent_hash,
      link_hash: r.link_hash,
    },
  }));

  const eventById = new Map(events.map((e) => [e.id, e]));

  // ── actors (staff) ──────────────────────────────────────────────────────────
  const actors = rawStaff.map((s) => ({
    id: Number(s.staff_id),
    party_id: Number(s.party_id),
    role: s.role,
    created_at: iso(s.registered_at),
  }));
  const actorById = new Map(actors.map((a) => [a.id, a]));

  // ── parties ─────────────────────────────────────────────────────────────────
  const parties = rawParties.map((p) => ({
    id: Number(p.party_id),
    display_name: p.display_name,
    email: p.email,
    created_at: iso(p.enrolled_at),
  }));
  const partyById = new Map(parties.map((p) => [p.id, p]));

  // ── credentials (secrets) ───────────────────────────────────────────────────
  const credentials = rawSecrets.map((c) => ({
    id: Number(c.secret_id),
    actor_id: Number(c.staff_id),
    created_at: iso(c.minted_at),
  }));

  // ── sessions (access tokens) ────────────────────────────────────────────────
  const sessions = rawTokens.map((t) => ({
    id: Number(t.token_id),
    actor_id: Number(t.staff_id),
    created_at: iso(t.started_at),
    expires_at: iso(t.lapses_at),
    revoked_at: iso(t.ended_at),
  }));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  // ── grants (authorities) ────────────────────────────────────────────────────
  // grantor_actor_id is the operational grantor (NULL for bootstrap grants —
  // the provisioning seam APA-1 excludes).
  const grants = rawAuth.map((g) => ({
    id: Number(g.authority_id),
    grantee_actor_id: Number(g.holder_staff),
    grantor_actor_id: n(g.granted_by_staff),
    capability: g.capability,
    scope: g.reach,
    issued_at: iso(g.granted_at),
    revoked_at: iso(g.withdrawn_at),
    revoke_reason: g.withdraw_note ?? null,
  }));

  // ── invitations ─────────────────────────────────────────────────────────────
  const invitations = rawInvites.map((i) => ({
    id: Number(i.invite_id),
    party_id: n(i.claimed_party),
    accepted_at: iso(i.claimed_at),
    accepted_by_actor_id: n(i.claimed_by_staff),
    revoked_at: iso(i.withdrawn_at),
    issued_at: iso(i.issued_at),
  }));
  const invitationById = new Map(invitations.map((i) => [i.id, i]));

  // ── retention policy ────────────────────────────────────────────────────────
  const retention = rawRetention.length
    ? { days: Number(rawRetention[0].horizon_days), enforce_on_read: rawRetention[0].filter_on_read ? 1 : 0 }
    : null;

  // ── onboarding completions ──────────────────────────────────────────────────
  // An onboarding burst is the set of events sharing one (actor_id, session_id)
  // that contains an actor.enrolled (canonical). The completion event is the
  // actor.enrolled event; invitation/credential/session presence are derived
  // from the burst. The invitation is recovered from the burst's
  // invitation.accepted payload (invitation_id).
  function onboardingCompletions() {
    const byKey = new Map(); // `${actor}:${session}` -> events[]
    for (const e of events) {
      if (e.actor_id == null || e.session_id == null) continue;
      const key = `${e.actor_id}:${e.session_id}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(e);
    }
    const out = [];
    for (const [, evs] of byKey) {
      const enrolled = evs.find((e) => e.action === "actor.enrolled");
      if (!enrolled) continue; // not an onboarding burst
      const accepted = evs.find((e) => e.action === "invitation.accepted");
      const cred = evs.find((e) => e.action === "credential.created");
      const opened = evs.find((e) => e.action === "session.opened");
      const invitation_id = accepted ? (accepted.payload.invitation_id ?? null) : null;
      const actor = actorById.get(enrolled.actor_id);
      out.push({
        actor_id: enrolled.actor_id,
        party_id: actor ? actor.party_id : null,
        invitation_id,
        session_id: enrolled.session_id,
        completion_event_id: enrolled.id,
        occurred_at: enrolled.occurred_at,
        has_invitation_accepted_event: !!accepted,
        has_credential_event: !!cred,
        has_session_opened_event: !!opened,
        burst_event_ids: evs.map((e) => e.id).sort((a, b) => a - b),
      });
    }
    return out.sort((a, b) => a.completion_event_id - b.completion_event_id);
  }

  // ── verifyChain ─────────────────────────────────────────────────────────────
  // Recompute each row's hash from its raw projection (incl. seq + prev hash),
  // exactly as the writer did — genesis included, no special case. Confirm each
  // row's prev_hash equals the prior row's recomputed hash, and that the stored
  // hash matches the recomputation.
  function verifyChain() {
    let prev = "";
    for (let i = 0; i < events.length; i++) {
      const raw = events[i]._raw;
      if (raw.parent_hash !== prev) {
        return { ok: false, at: raw.seq, expected: prev, found: raw.parent_hash };
      }
      const recomputed = hashRow({
        seq: raw.seq,
        happened_at: raw.happened_at,
        actor_staff: raw.actor_staff,
        token_id: raw.token_id,
        verb: raw.verb,
        subject_kind: raw.subject_kind,
        subject_ref: raw.subject_ref,
        detail: raw.detail,
        parent_hash: raw.parent_hash,
      });
      if (recomputed !== raw.link_hash) {
        return { ok: false, at: raw.seq, expected: recomputed, found: raw.link_hash };
      }
      prev = raw.link_hash;
    }
    return { ok: true, count: events.length };
  }

  // ── eventsByAction / eventsByActor (canonical-vocabulary filters) ────────────
  function eventsByAction(action) {
    return events.filter((e) => e.action === action);
  }
  function eventsByActor(actorId) {
    return events.filter((e) => e.actor_id === actorId);
  }

  return {
    events: () => events,
    eventsByAction,
    eventsByActor,
    event: (id) => eventById.get(id) ?? null,
    verifyChain,

    parties: () => parties,
    party: (id) => partyById.get(id) ?? null,

    actors: () => actors,
    actor: (id) => actorById.get(id) ?? null,

    credentials: () => credentials,

    sessions: () => sessions,
    session: (id) => sessionById.get(id) ?? null,

    grants: () => grants,

    invitations: () => invitations,
    invitation: (id) => invitationById.get(id) ?? null,

    retentionPolicy: () => retention,

    onboardingCompletions,

    close: () => {},
  };
}
