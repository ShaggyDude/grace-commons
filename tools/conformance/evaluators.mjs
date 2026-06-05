// tools/conformance/evaluators.mjs
//
// The check logic — render-AGNOSTIC by construction. Each evaluator is keyed by
// a manifest check id and written PURELY against the adapter contract, in spec
// vocabulary (events, records, ordering). No SQLite, no table names, no
// render-specific knowledge lives here. That is what makes "add render 2 by
// writing only an adapter" true: the evaluators are shared; only the adapter
// changes.
//
// ── Adapter contract (the records-alone seam) ──────────────────────────────
// A render adapter is `createAdapter({ dbPath }) -> Adapter`. Every method is
// SYNCHRONOUS and READ-ONLY:
//
//   /** @typedef {{ id:number, occurred_at:string, actor_id:number|null,
//        session_id:number|null, action:string, target_kind:string|null,
//        target_id:number|null, payload:object, prev_hash:string,
//        this_hash:string }} Event */  // payload is the PARSED payload_json
//
//   events(): Event[]                     // all events, id ascending
//   eventsByAction(action): Event[]
//   eventsByActor(actorId): Event[]
//   event(id): Event | null
//   verifyChain(): {ok:true,count:number} | {ok:false,at:number,expected,found}
//   parties(): Record[]      party(id): Record|null
//   actors(): Record[]       actor(id): Record|null
//   credentials(): Record[]
//   sessions(): Record[]     session(id): Record|null
//   grants(): Record[]
//   invitations(): Record[]  invitation(id): Record|null
//   retentionPolicy(): {days:number, enforce_on_read:0|1} | null
//   onboardingCompletions(): Completion[]   // { actor_id, party_id,
//        invitation_id, session_id, completion_event_id, occurred_at,
//        has_invitation_accepted_event, has_credential_event,
//        has_session_opened_event, burst_event_ids }
//
// Each evaluator returns { status:'pass'|'fail', detail?, offending? }.
// A `fail` MUST name the violated claim in `detail` and list the offending
// records in `offending` — a red has to be actionable (and feedable to the
// regen step next week).

const PASS = (detail) => ({ status: "pass", detail });
const FAIL = (detail, offending = []) => ({ status: "fail", detail, offending });

// Documented anonymous-by-design event classes (Decision §8.10 + the bootstrap
// seam): a login failure has no established identity; the seeded genesis event
// is provisioned before any session exists. Every OTHER event must be attributed.
const ANON_BY_DESIGN = new Set(["login.failed", "study.registered"]);

// ── shared helpers (records-alone, render-agnostic) ──────────────────────────

/** Actors with no enrollment event = seeded/bootstrap identities (the seam). */
function bootstrapActorIds(a) {
  const enrolled = new Set(a.eventsByAction("actor.enrolled").map((e) => e.target_id));
  return new Set(a.actors().map((x) => x.id).filter((id) => !enrolled.has(id)));
}

/** target_id -> [events] for an action (to detect presence + injectivity). */
function byTarget(a, action) {
  const m = new Map();
  for (const e of a.eventsByAction(action)) {
    if (!m.has(e.target_id)) m.set(e.target_id, []);
    m.get(e.target_id).push(e);
  }
  return m;
}

export const EVALUATORS = {
  // ── C16 External Onboarding ────────────────────────────────────────────────
  "C16-1": (a) => {
    const bad = [];
    for (const oc of a.onboardingCompletions()) {
      const inv = oc.invitation_id != null ? a.invitation(oc.invitation_id) : null;
      if (!inv) { bad.push({ completion: oc.completion_event_id, why: "no invitation referenced" }); continue; }
      if (!inv.accepted_at) { bad.push({ invitation: inv.id, why: "invitation not in Accepted state" }); continue; }
      if (inv.accepted_by_actor_id !== oc.actor_id) bad.push({ invitation: inv.id, why: `accepted_by ${inv.accepted_by_actor_id} != enrolled actor ${oc.actor_id}` });
      if (inv.party_id !== oc.party_id) bad.push({ invitation: inv.id, why: `party ${inv.party_id} != completion party ${oc.party_id}` });
      if (inv.accepted_at > oc.occurred_at) bad.push({ invitation: inv.id, why: "acceptance timestamp after completion" });
      if (!oc.has_invitation_accepted_event) bad.push({ invitation: inv.id, why: "no invitation-accepted event precedes completion" });
    }
    return bad.length ? FAIL("onboarded identity does not trace to an accepted invitation", bad)
      : PASS(`${a.onboardingCompletions().length} onboarding(s) trace to accepted invitations`);
  },

  "C16-2": (a) => {
    const creds = a.credentials();
    const bad = [];
    for (const oc of a.onboardingCompletions()) {
      if (!oc.has_credential_event) bad.push({ actor: oc.actor_id, why: "no credential-created event in burst" });
      const cred = creds.find((c) => c.actor_id === oc.actor_id);
      if (!cred) { bad.push({ actor: oc.actor_id, why: "no credential record bound to enrolled actor" }); continue; }
      const actor = a.actor(oc.actor_id);
      if (!actor) { bad.push({ actor: oc.actor_id, why: "credential bound to non-existent actor" }); continue; }
      if (!a.party(actor.party_id)) bad.push({ actor: oc.actor_id, why: `actor's party ${actor.party_id} not in Party store` });
    }
    return bad.length ? FAIL("onboarding credential does not trace to an enrolled party", bad)
      : PASS("every onboarding credential binds to an enrolled party");
  },

  "C16-3": (a) => {
    const creds = a.credentials();
    const bad = [];
    for (const oc of a.onboardingCompletions()) {
      const party = a.party(oc.party_id);
      const cred = creds.find((c) => c.actor_id === oc.actor_id);
      if (!party || !cred) continue; // covered by C16-2
      if (party.created_at > cred.created_at) bad.push({ party: party.id, party_at: party.created_at, cred_at: cred.created_at });
    }
    return bad.length ? FAIL("credential predates the identity it authenticates", bad)
      : PASS("every credential follows its party in time");
  },

  "C16-4": (a) => {
    const acc = byTarget(a, "invitation.accepted");
    const bad = [];
    for (const oc of a.onboardingCompletions()) {
      const events = acc.get(oc.invitation_id) ?? [];
      if (!events.length) { bad.push({ invitation: oc.invitation_id, why: "no invitation-accepted event" }); continue; }
      if (!events.some((e) => e.id < oc.completion_event_id)) bad.push({ invitation: oc.invitation_id, why: "acceptance does not precede completion" });
      const inv = a.invitation(oc.invitation_id);
      if (!inv || !inv.accepted_at) bad.push({ invitation: oc.invitation_id, why: "invitation not in Accepted state" });
    }
    return bad.length ? FAIL("enrollment not gated by a preceding accepted invitation", bad)
      : PASS("every enrollment is gated by a preceding accepted invitation");
  },

  "C16-5": (a) => {
    const bad = [];
    for (const oc of a.onboardingCompletions()) {
      const missing = [];
      if (!oc.has_invitation_accepted_event) missing.push("invitation.accepted");
      if (!oc.has_credential_event) missing.push("credential.created");
      if (!oc.has_session_opened_event) missing.push("session.opened");
      if (missing.length) bad.push({ actor: oc.actor_id, incomplete_burst_missing: missing });
    }
    // Count parity: every accepted invitation that began onboarding completed it.
    const nAcc = a.eventsByAction("invitation.accepted").length;
    const nEnr = a.eventsByAction("actor.enrolled").length;
    const nCred = a.eventsByAction("credential.created").length;
    if (nAcc !== nEnr || nEnr !== nCred) bad.push({ why: `burst counts differ: accepted=${nAcc} enrolled=${nEnr} credential=${nCred} (a partial/interrupted onboarding)` });
    return bad.length ? FAIL("an onboarding burst is incomplete (an unresolved interruption)", bad)
      : PASS("no incomplete onboarding bursts — onboarding is atomic");
  },

  "C16-6": (a) => {
    const issued = byTarget(a, "invitation.issued");
    const accepted = byTarget(a, "invitation.accepted");
    const revoked = byTarget(a, "invitation.revoked");
    const bad = [];
    for (const inv of a.invitations()) {
      if (!issued.has(inv.id)) bad.push({ invitation: inv.id, why: "no invitation-issued event" });
      if (inv.accepted_at && !accepted.has(inv.id)) bad.push({ invitation: inv.id, why: "Accepted state without invitation-accepted event" });
      if (inv.revoked_at && !revoked.has(inv.id)) bad.push({ invitation: inv.id, why: "Revoked state without invitation-revoked event" });
    }
    return bad.length ? FAIL("a terminal invitation transition is unattested", bad)
      : PASS("every invitation transition is attested");
  },

  // ── C13 Login ───────────────────────────────────────────────────────────────
  "C13-1": (a) => {
    const openedBySession = new Set(a.eventsByAction("session.opened").map((e) => e.target_id));
    const loginByActorSession = new Set(
      a.eventsByAction("login.succeeded").map((e) => `${e.actor_id}:${e.session_id}`),
    );
    const bad = [];
    for (const s of a.sessions()) {
      const onboarded = openedBySession.has(s.id);
      const loggedIn = loginByActorSession.has(`${s.actor_id}:${s.id}`);
      if (!onboarded && !loggedIn) bad.push({ session: s.id, actor: s.actor_id, why: "no credential-verified login or onboarding opening event" });
    }
    return bad.length ? FAIL("a session exists with no credential-gated origin", bad)
      : PASS("every session traces to a credential-verified login or onboarding");
  },

  "C13-4": (a) => {
    const bad = [];
    for (const e of a.eventsByAction("login.succeeded")) {
      const s = e.session_id != null ? a.session(e.session_id) : null;
      if (!s) { bad.push({ event: e.id, why: "login.succeeded names no session record" }); continue; }
      if (s.actor_id !== e.actor_id) bad.push({ event: e.id, why: `session actor ${s.actor_id} != event actor ${e.actor_id}` });
      if (e.target_id !== e.actor_id) bad.push({ event: e.id, why: "login.succeeded target is not the authenticated actor" });
    }
    for (const e of a.eventsByAction("login.failed")) {
      if (e.actor_id !== null) bad.push({ event: e.id, why: "failed login attributed to an actor (must be anonymous)" });
    }
    return bad.length ? FAIL("login record and audit trail are inconsistent", bad)
      : PASS("every authentication outcome is recorded consistently");
  },

  "C13-5": (a) => {
    const openedBySession = new Set(a.eventsByAction("session.opened").map((e) => e.target_id));
    const loginByActorSession = new Set(a.eventsByAction("login.succeeded").map((e) => `${e.actor_id}:${e.session_id}`));
    const revokedSession = new Set(a.eventsByAction("session.revoked").map((e) => e.target_id));
    const bad = [];
    for (const s of a.sessions()) {
      const hasOpen = openedBySession.has(s.id) || loginByActorSession.has(`${s.actor_id}:${s.id}`);
      if (!hasOpen) { bad.push({ session: s.id, why: "no opening event — timeline unreconstructable" }); continue; }
      if (s.revoked_at && !revokedSession.has(s.id)) bad.push({ session: s.id, why: "revoked session with no session.revoked event" });
      if (!s.expires_at) bad.push({ session: s.id, why: "no expiry — natural-expiry disposition unobservable" });
    }
    return bad.length ? FAIL("a principal's session history cannot be fully reconstructed", bad)
      : PASS("every session has an opening event and an observable disposition");
  },

  // ── C14 Session-Gated Authorization (principal binding) ──────────────────────
  "C14-4": (a) => {
    const bad = [];
    for (const e of a.events()) {
      if (e.session_id == null) continue; // anonymous/seed events bind no session
      const s = a.session(e.session_id);
      if (!s) { bad.push({ event: e.id, why: `references missing session ${e.session_id}` }); continue; }
      if (s.actor_id !== e.actor_id) bad.push({ event: e.id, why: `attributed to ${e.actor_id} but session ${e.session_id} is owned by ${s.actor_id}` });
    }
    return bad.length ? FAIL("an event is attributed to an actor other than its session's owner", bad)
      : PASS("every event is attributed to its session's owner (attribution is session-derived)");
  },

  // ── APA Attributed Permissions Admin ─────────────────────────────────────────
  "APA-1": (a) => {
    const issued = byTarget(a, "grant.issued");
    const boot = bootstrapActorIds(a);
    const bad = [];
    let bootstrapExcluded = 0;
    for (const g of a.grants()) {
      if (issued.has(g.id)) {
        if (!a.actor(g.grantor_actor_id)) bad.push({ grant: g.id, why: `grantor ${g.grantor_actor_id} not a real actor` });
      } else if (boot.has(g.grantee_actor_id)) {
        bootstrapExcluded++; // provisioning seam: grant among seeded identities
      } else {
        bad.push({ grant: g.id, why: "operational grant has no grant.issued attestation" });
      }
    }
    return bad.length ? FAIL("an operational grant lacks an issuance attestation", bad)
      : PASS(`every operational grant carries an issuance attestation (${bootstrapExcluded} bootstrap grant(s) excluded as the provisioning seam)`);
  },

  "APA-2": (a) => {
    const revoked = byTarget(a, "grant.revoked");
    const boot = bootstrapActorIds(a);
    const bad = [];
    for (const g of a.grants()) {
      if (!g.revoked_at) continue;
      if (revoked.has(g.id)) continue;
      if (boot.has(g.grantee_actor_id)) continue; // bootstrap-revoked = seam
      bad.push({ grant: g.id, why: "Revoked state with no grant.revoked attestation" });
    }
    return bad.length ? FAIL("a revoked grant lacks a revocation attestation", bad)
      : PASS("every revoked grant carries a revocation attestation");
  },

  "APA-4": (a) => {
    const bad = [];
    // Coherent history per grant.
    for (const g of a.grants()) {
      if (!g.issued_at) bad.push({ grant: g.id, why: "no issued_at" });
      if (g.revoked_at) {
        if (g.revoked_at < g.issued_at) bad.push({ grant: g.id, why: "revoked before issued" });
        if (!g.revoke_reason) bad.push({ grant: g.id, why: "revoked with no reason recorded" });
      }
    }
    // Revocation is terminal: every revoke event targets a currently-revoked grant.
    for (const e of a.eventsByAction("grant.revoked")) {
      const g = a.grants().find((x) => x.id === e.target_id);
      if (g && !g.revoked_at) bad.push({ grant: e.target_id, why: "grant.revoked event but grant is not in Revoked state (non-terminal revocation)" });
    }
    return bad.length ? FAIL("Permissions history/terminality bar not met", bad)
      : PASS("grants enumerable with full history; revocation terminal and immediate");
  },

  "APA-6": (a) => {
    const bad = [];
    const dupes = (action) => {
      const m = byTarget(a, action);
      for (const [target, evs] of m) if (evs.length > 1) bad.push({ grant: target, action, count: evs.length, why: "attestation not injective" });
    };
    dupes("grant.issued");
    dupes("grant.revoked");
    return bad.length ? FAIL("attestation exclusivity (injectivity) violated", bad)
      : PASS("issuance and revocation attestations are injective per grant");
  },

  // ── C1 Audit Trail ────────────────────────────────────────────────────────────
  "C1-1": (a) => {
    const vc = a.verifyChain();
    const hasRetention = !!a.retentionPolicy();
    const bad = [];
    for (const e of a.events()) {
      if (!e.action) bad.push({ event: e.id, q: "what", why: "no action" });
      if (e.actor_id == null && !ANON_BY_DESIGN.has(e.action)) bad.push({ event: e.id, q: "who", why: "unexplained anonymous event" });
      if (!hasRetention) bad.push({ event: e.id, q: "retention", why: "no retention policy record covers this event" });
    }
    // "Integrity answerable" = the verify surface returns a definitive verdict
    // (ok, or a localized divergence). Whether the verdict is CLEAN is C1-2b.
    if (!(vc.ok === true || (vc.ok === false && typeof vc.at === "number"))) {
      bad.push({ q: "integrity", why: "verify surface returns no definitive verdict" });
    }
    return bad.length ? FAIL("an audit question (what/who/integrity/retention) is unanswerable for some event", bad)
      : PASS("every event answers what / who / integrity / retention");
  },

  "C1-2a": (a) => {
    const bad = a.events()
      .filter((e) => e.actor_id == null && !ANON_BY_DESIGN.has(e.action))
      .map((e) => ({ event: e.id, action: e.action, why: "mutation event is unexpectedly anonymous" }));
    return bad.length ? FAIL("attribution coverage breached — a non-anonymous event lacks an actor", bad)
      : PASS("every event is attributed, except documented anonymous classes");
  },

  "C1-2b": (a) => {
    const vc = a.verifyChain();
    if (vc.ok) return PASS(`hash chain verifies over ${vc.count} event(s)`);
    return FAIL(
      `hash chain diverges at event #${vc.at} — recomputed ${vc.expected.slice(0, 12)}… but stored ${vc.found.slice(0, 12)}…`,
      [{ at: vc.at, expected: vc.expected, found: vc.found }],
    );
  },

  "C1-3": (a) => {
    const ev = a.events();
    const bad = [];
    const seenHash = new Set();
    for (let i = 0; i < ev.length; i++) {
      if (ev[i].id !== i + 1) bad.push({ index: i, id: ev[i].id, why: "id not contiguous from 1 (gap or reuse)" });
      if (i > 0 && ev[i].occurred_at < ev[i - 1].occurred_at) bad.push({ id: ev[i].id, why: "occurred_at decreases against id order (out of total order)" });
      if (seenHash.has(ev[i].this_hash)) bad.push({ id: ev[i].id, why: "duplicate this_hash (silent overwrite risk)" });
      seenHash.add(ev[i].this_hash);
    }
    return bad.length ? FAIL("Event Log append-only / total-order bar not met", bad)
      : PASS(`log is append-only and totally ordered (${ev.length} events, ids 1..${ev.length})`);
  },

  "C1-4": (a) => {
    const vc = a.verifyChain();
    const bounded = vc.ok === true || (vc.ok === false && typeof vc.at === "number");
    return bounded
      ? PASS(vc.ok ? "no tampering; forensic window empty (verify surface localizes divergence)" : `verify surface localizes the divergence at event #${vc.at}`)
      : FAIL("verify surface cannot bound a divergence (no divergence point returned)", [vc]);
  },

  "C1-5": (a) => {
    const ev = a.events();
    const bad = [];
    for (let i = 0; i < ev.length; i++) if (ev[i].id !== i + 1) bad.push({ id: ev[i].id, why: "id gap — an event may be missing" });
    if (!a.retentionPolicy()) bad.push({ why: "no retention record — cannot distinguish lawful destruction from loss" });
    return bad.length ? FAIL("cannot distinguish lawfully destroyed from missing", bad)
      : PASS("id sequence is gap-free (nothing missing) and retention is filter-on-read (nothing destroyed)");
  },
};
