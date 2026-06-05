// tools/conformance/adapters/clinical-trial-portal-r4.adapter.mjs
//
// Render-4 VALIDATOR adapter — the records-alone query seam. Maps the append-only
// JSONL portal store onto the canonical shapes the shared evaluators expect
// (see tools/conformance/evaluators.mjs header). Read-only; every method is
// synchronous. The store is loaded once from its JSONL log; the materialized
// view is then queried.
//
// Canonical Event shape produced by events():
//   { id, occurred_at, actor_id, session_id, action, target_kind, target_id,
//     payload (parsed object), prev_hash, this_hash }
// The portal's internal event records already carry exactly these fields, so the
// mapping is mostly identity — the value of the append-only paradigm is that the
// audit ledger IS the event store.

import { openPortal } from "../render4/portal.mjs";

export default function createAdapter({ dbPath }) {
  const portal = openPortal(dbPath);

  // events sorted ascending by id (already appended in order; sort defensively)
  const allEvents = [...portal.events].sort((a, b) => a.id - b.id);
  const eventById = new Map(allEvents.map((e) => [e.id, e]));

  // ── canonical Event projection ──────────────────────────────────────────────
  const toCanonicalEvent = (e) => ({
    id: e.id,
    occurred_at: e.occurred_at,
    actor_id: e.actor_id ?? null,
    session_id: e.session_id ?? null,
    action: e.action,
    target_kind: e.target_kind ?? null,
    target_id: e.target_id ?? null,
    payload: e.payload ?? {},
    prev_hash: e.prev_hash ?? "",
    this_hash: e.this_hash,
  });

  const canonicalEvents = allEvents.map(toCanonicalEvent);

  // ── records projections ─────────────────────────────────────────────────────
  // parties: { id, created_at, ... }
  const parties = [...portal.parties.values()].map((p) => ({
    id: p.id,
    created_at: p.created_at,
    display_name: p.display_name,
    email: p.email,
    status: p.status,
  }));
  const partyById = new Map(parties.map((p) => [p.id, p]));

  // actors: { id, party_id, ... }
  const actors = [...portal.actors.values()].map((a) => ({
    id: a.id,
    party_id: a.party_id,
    display_name: a.display_name,
    email: a.email,
    created_at: a.created_at,
  }));
  const actorById = new Map(actors.map((a) => [a.id, a]));

  // credentials: { id, actor_id, created_at, ... }
  const credentials = portal.credentials.map((c) => ({
    id: c.id,
    actor_id: c.actor_id,
    type: c.type,
    created_at: c.created_at,
  }));

  // sessions: { id, actor_id, expires_at, revoked_at }
  const sessions = [...portal.sessions.values()].map((s) => ({
    id: s.id,
    actor_id: s.actor_id,
    opened_at: s.opened_at,
    expires_at: s.expires_at ?? null,
    revoked_at: s.revoked_at ?? null,
  }));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  // grants: { id, grantor_actor_id, grantee_actor_id, issued_at, revoked_at, revoke_reason }
  const grants = [...portal.grants.values()].map((g) => ({
    id: g.id,
    grantor_actor_id: g.grantor_actor_id ?? null,
    grantee_actor_id: g.grantee_actor_id,
    capability: g.capability,
    scope: g.scope,
    issued_at: g.issued_at,
    revoked_at: g.revoked_at ?? null,
    revoke_reason: g.revoke_reason ?? null,
  }));

  // invitations: { id, accepted_at, accepted_by_actor_id, party_id, revoked_at }
  const invitations = [...portal.invitations.values()].map((inv) => ({
    id: inv.id,
    email: inv.email,
    status: inv.status,
    issued_at: inv.issued_at,
    accepted_at: inv.accepted_at ?? null,
    accepted_by_actor_id: inv.accepted_by_actor_id ?? null,
    party_id: inv.party_id ?? null,
    revoked_at: inv.revoked_at ?? null,
  }));
  const invitationById = new Map(invitations.map((i) => [i.id, i]));

  // ── onboardingCompletions() ─────────────────────────────────────────────────
  // An onboarding burst is the set of events sharing one (actor_id, session_id)
  // pair that contains an actor.enrolled event. We group such bursts and surface
  // the Completion shape the C16 evaluators read. The "completion" event is the
  // actor.enrolled event (it carries party_id + invitation_id in its payload).
  function onboardingCompletions() {
    const enrolled = canonicalEvents.filter((e) => e.action === "actor.enrolled");
    const completions = [];
    for (const enr of enrolled) {
      const actorId = enr.actor_id;
      const sessionId = enr.session_id;
      // all events of this burst share actor_id + session_id
      const burst = canonicalEvents.filter(
        (e) => e.actor_id === actorId && e.session_id === sessionId,
      );
      const burstIds = burst.map((e) => e.id);
      const partyId = enr.payload?.party_id ?? actorById.get(actorId)?.party_id ?? null;
      const invitationId = enr.payload?.invitation_id ?? null;
      const has_invitation_accepted_event = burst.some((e) => e.action === "invitation.accepted");
      const has_credential_event = burst.some((e) => e.action === "credential.created");
      const has_session_opened_event = burst.some((e) => e.action === "session.opened");
      completions.push({
        actor_id: actorId,
        party_id: partyId,
        invitation_id: invitationId,
        session_id: sessionId,
        completion_event_id: enr.id,
        occurred_at: enr.occurred_at,
        has_invitation_accepted_event,
        has_credential_event,
        has_session_opened_event,
        burst_event_ids: burstIds,
      });
    }
    return completions;
  }

  // ── adapter surface ─────────────────────────────────────────────────────────
  return {
    // events
    events: () => canonicalEvents,
    eventsByAction: (action) => canonicalEvents.filter((e) => e.action === action),
    eventsByActor: (actorId) => canonicalEvents.filter((e) => e.actor_id === actorId),
    event: (id) => {
      const e = eventById.get(id);
      return e ? toCanonicalEvent(e) : null;
    },
    verifyChain: () => portal.verifyChain(),

    // parties
    parties: () => parties,
    party: (id) => partyById.get(id) ?? null,

    // actors
    actors: () => actors,
    actor: (id) => actorById.get(id) ?? null,

    // credentials
    credentials: () => credentials,

    // sessions
    sessions: () => sessions,
    session: (id) => sessionById.get(id) ?? null,

    // grants
    grants: () => grants,

    // invitations
    invitations: () => invitations,
    invitation: (id) => invitationById.get(id) ?? null,

    // retention
    retentionPolicy: () =>
      portal.retention ? { days: portal.retention.days, enforce_on_read: portal.retention.enforce_on_read } : null,

    // onboarding
    onboardingCompletions,

    close() {},
  };
}
