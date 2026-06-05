// tools/conformance/render4/portal.mjs
//
// Render 4 of the clinical-trial-portal surface — an INDEPENDENT implementation
// authored from the five composition specs + the adapter/evaluator contract
// alone, without reference to renders 1–3.
//
// ── Stack / paradigm ─────────────────────────────────────────────────────────
// Append-only JSONL event store, zero external dependencies, Node built-ins only
// (node:crypto, node:fs). This is deliberately distinct from the SQLite and
// Postgres renders: there is no relational engine, no SQL, no migrations. The
// store is one flat file where every line is a JSON record carrying a `kind`
// discriminator. Records are NEVER mutated or deleted in place — state changes
// are expressed by appending new records (e.g. an invitation acceptance appends
// a `invitation.update` record; a grant revocation appends a `grant.update`
// record). The current view is materialized by folding the log on load. This is
// the event-sourcing / append-only-ledger paradigm, which also happens to make
// the tamper-evidence hash chain a natural fit: the audit events ARE rows in the
// same ledger and the chain is computed over their canonical serialization.
//
// ── How this maps to the five compositions ──────────────────────────────────
//   C16 External Onboarding : invite() + onboard(), the accept→enroll→credential
//                             →session burst, all under one actor_id+session_id.
//   C13 Login               : authenticate() verifies a credential then opens a
//                             session; login.succeeded / login.failed events.
//   C14 Session-Gated Auth  : every mutation event carries the session_id of the
//                             acting principal; attribution is session-derived.
//   APA Permissions Admin   : grant() / revokeGrant() pair each with an event.
//   C1 Audit Trail          : the hash-chained event ledger + retention policy.
//
// The store exposes the composition operations the actions-adapter drives, and a
// read view (snapshot()) the validator adapter maps onto the canonical shapes.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { appendFileSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ── canonical action vocabulary (what the evaluators speak) ──────────────────
// Internal record kinds are free-form; audit events carry these action names so
// the adapter can pass them straight through.
export const ACTIONS = {
  STUDY_REGISTERED: "study.registered",
  LOGIN_SUCCEEDED: "login.succeeded",
  LOGIN_FAILED: "login.failed",
  SESSION_OPENED: "session.opened",
  SESSION_REVOKED: "session.revoked",
  INVITATION_ISSUED: "invitation.issued",
  INVITATION_ACCEPTED: "invitation.accepted",
  INVITATION_REVOKED: "invitation.revoked",
  ACTOR_ENROLLED: "actor.enrolled",
  CREDENTIAL_CREATED: "credential.created",
  GRANT_ISSUED: "grant.issued",
  GRANT_REVOKED: "grant.revoked",
  SUBJECT_ENROLLED: "subject.enrolled",
  VISIT_RECORDED: "visit.recorded",
};

// ── hashing ──────────────────────────────────────────────────────────────────
// The canonical pre-image of an event's hash is a stable JSON serialization of
// its identifying + content fields TOGETHER WITH the previous event's hash. The
// genesis event uses prev_hash = "" (empty string) — and is hashed by EXACTLY
// the same function as every other event, so verifyChain() recomputes the
// genesis row identically. (This is the single most common conformance bug; it
// is closed here by routing genesis through the same computeHash path.)
function canonicalEventPreimage(ev) {
  // Order is fixed and explicit so the recomputation is deterministic.
  return JSON.stringify([
    ev.id,
    ev.occurred_at,
    ev.actor_id ?? null,
    ev.session_id ?? null,
    ev.action,
    ev.target_kind ?? null,
    ev.target_id ?? null,
    // payload serialized with sorted keys for stability
    stableStringify(ev.payload ?? {}),
    ev.prev_hash ?? "",
  ]);
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function computeHash(ev) {
  return createHash("sha256").update(canonicalEventPreimage(ev)).digest("hex");
}

// ── password hashing (scrypt; only that a credential binds, not the method) ──
function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 32);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}
function verifyPassword(plain, stored) {
  try {
    const [scheme, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = scryptSync(plain, salt, expected.length);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ── clock ────────────────────────────────────────────────────────────────────
// A monotonic logical clock keeps occurred_at non-decreasing in id order (C1-3)
// even when several events are appended within the same millisecond.
function makeClock() {
  let last = 0;
  return () => {
    let now = Date.now();
    if (now <= last) now = last + 1;
    last = now;
    return new Date(now).toISOString();
  };
}

// ── the store ────────────────────────────────────────────────────────────────
export class Portal {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.clock = makeClock();
    // materialized state
    this.events = [];              // {id, occurred_at, actor_id, session_id, action, target_kind, target_id, payload, prev_hash, this_hash}
    this.parties = new Map();      // id -> {id, created_at, display_name, email, status}
    this.actors = new Map();       // id -> {id, party_id, display_name, email, created_at, is_bootstrap}
    this.credentials = [];         // {id, actor_id, type, material, created_at}
    this.sessions = new Map();     // id -> {id, actor_id, opened_at, expires_at, revoked_at}
    this.grants = new Map();       // id -> {id, grantor_actor_id, grantee_actor_id, capability, scope, issued_at, revoked_at, revoke_reason, is_bootstrap}
    this.invitations = new Map();  // id -> {id, email, display_name, role, token, party_id, status, issued_at, accepted_at, accepted_by_actor_id, revoked_at}
    this.subjects = new Map();     // id -> {id, subject_code, protocol, enrolled_at, enrolled_by_actor_id}
    this.visits = new Map();       // id -> {id, subject_id, kind, recorded_at, recorded_by_actor_id}
    this.retention = null;         // {days, enforce_on_read}
    // id counters
    this._eventSeq = 0;
    this._partySeq = 0;
    this._actorSeq = 0;
    this._credSeq = 0;
    this._sessionSeq = 0;
    this._grantSeq = 0;
    this._invSeq = 0;
    this._subjectSeq = 0;
    this._visitSeq = 0;
    this._subjectCounter = new Map(); // prefix -> running number

    if (existsSync(dbPath)) this._load();
  }

  // ── persistence ───────────────────────────────────────────────────────────
  _append(record) {
    // append-only: every record is one JSONL line; nothing is ever rewritten
    appendFileSync(this.dbPath, JSON.stringify(record) + "\n");
  }

  _load() {
    const text = readFileSync(this.dbPath, "utf-8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line);
      this._apply(rec);
    }
  }

  // Fold one log record into the materialized view. State transitions arrive as
  // `*.update` records that carry the delta to apply.
  _apply(rec) {
    switch (rec.kind) {
      case "event": {
        this.events.push(rec.data);
        this._eventSeq = Math.max(this._eventSeq, rec.data.id);
        break;
      }
      case "party":
        this.parties.set(rec.data.id, { ...rec.data });
        this._partySeq = Math.max(this._partySeq, rec.data.id);
        break;
      case "actor":
        this.actors.set(rec.data.id, { ...rec.data });
        this._actorSeq = Math.max(this._actorSeq, rec.data.id);
        break;
      case "credential":
        this.credentials.push({ ...rec.data });
        this._credSeq = Math.max(this._credSeq, rec.data.id);
        break;
      case "session":
        this.sessions.set(rec.data.id, { ...rec.data });
        this._sessionSeq = Math.max(this._sessionSeq, rec.data.id);
        break;
      case "session.update": {
        const s = this.sessions.get(rec.data.id);
        if (s) Object.assign(s, rec.data.patch);
        break;
      }
      case "grant":
        this.grants.set(rec.data.id, { ...rec.data });
        this._grantSeq = Math.max(this._grantSeq, rec.data.id);
        break;
      case "grant.update": {
        const g = this.grants.get(rec.data.id);
        if (g) Object.assign(g, rec.data.patch);
        break;
      }
      case "invitation":
        this.invitations.set(rec.data.id, { ...rec.data });
        this._invSeq = Math.max(this._invSeq, rec.data.id);
        break;
      case "invitation.update": {
        const inv = this.invitations.get(rec.data.id);
        if (inv) Object.assign(inv, rec.data.patch);
        break;
      }
      case "subject":
        this.subjects.set(rec.data.id, { ...rec.data });
        this._subjectSeq = Math.max(this._subjectSeq, rec.data.id);
        if (rec.data._prefix) {
          const cur = this._subjectCounter.get(rec.data._prefix) ?? 0;
          this._subjectCounter.set(rec.data._prefix, Math.max(cur, rec.data._n));
        }
        break;
      case "visit":
        this.visits.set(rec.data.id, { ...rec.data });
        this._visitSeq = Math.max(this._visitSeq, rec.data.id);
        break;
      case "retention":
        this.retention = { ...rec.data };
        break;
      default:
        // unknown kinds are ignored (forward-compat)
        break;
    }
  }

  // ── the hash-chained audit event append ─────────────────────────────────────
  // This is the ONLY way events enter the ledger. prev_hash links to the chain
  // tail; genesis (the very first event) links to "".
  _emit({ actor_id = null, session_id = null, action, target_kind = null, target_id = null, payload = {} }) {
    const id = ++this._eventSeq;
    const prev_hash = this.events.length ? this.events[this.events.length - 1].this_hash : "";
    const ev = {
      id,
      occurred_at: this.clock(),
      actor_id,
      session_id,
      action,
      target_kind,
      target_id,
      payload,
      prev_hash,
    };
    ev.this_hash = computeHash(ev);
    this.events.push(ev);
    this._append({ kind: "event", data: ev });
    return ev;
  }

  // ── seeding (the bootstrap seam) ─────────────────────────────────────────────
  // Identities created here have NO actor.enrolled / grant.issued events — that
  // is what marks them as the provisioning seam to the evaluators. The single
  // exception is the genesis study.registered event, which IS in the chain and
  // is anonymous-by-design.
  seed() {
    // genesis audit event — anonymous, in the hash chain, hashed identically.
    this._emit({
      actor_id: null,
      session_id: null,
      action: ACTIONS.STUDY_REGISTERED,
      target_kind: "study",
      target_id: null,
      payload: { protocol: "BCN-OX-201", title: "Beacon Clinical Research" },
    });

    // retention policy record (filter-on-read; the audit log is never purged).
    this.retention = { days: 2555, enforce_on_read: 1 };
    this._append({ kind: "retention", data: this.retention });

    // seed PI and CRA WITHOUT audit events.
    const pi = this._seedIdentity({
      display_name: "Dr. Anya Okonkwo",
      email: "anya@beacon.clinical",
      password: "demo-pi",
    });
    const cra = this._seedIdentity({
      display_name: "Jordan Lee",
      email: "jordan@beacon.clinical",
      password: "demo-cra",
    });

    // bootstrap grants — NO grant.issued events.
    // PI: invite_actor, grant_permission, enroll_subject, record_visit (scope all)
    //     + view_audit (scope own).
    for (const cap of ["invite_actor", "grant_permission", "enroll_subject", "record_visit"]) {
      this._seedGrant(pi.actor.id, cap, "all");
    }
    this._seedGrant(pi.actor.id, "view_audit", "own");
    // CRA: view_audit (scope all).
    this._seedGrant(cra.actor.id, "view_audit", "all");

    return { pi, cra };
  }

  _seedIdentity({ display_name, email, password }) {
    const ts = this.clock();
    const partyId = ++this._partySeq;
    const party = { id: partyId, created_at: ts, display_name, email, status: "verified" };
    this.parties.set(partyId, party);
    this._append({ kind: "party", data: party });

    const actorId = ++this._actorSeq;
    const actor = { id: actorId, party_id: partyId, display_name, email, created_at: ts, is_bootstrap: true };
    this.actors.set(actorId, actor);
    this._append({ kind: "actor", data: actor });

    const credId = ++this._credSeq;
    const cred = { id: credId, actor_id: actorId, type: "password", material: hashPassword(password), created_at: ts };
    this.credentials.push(cred);
    this._append({ kind: "credential", data: cred });

    return { party, actor, credential: cred };
  }

  _seedGrant(granteeActorId, capability, scope) {
    const ts = this.clock();
    const id = ++this._grantSeq;
    const grant = {
      id,
      grantor_actor_id: null, // bootstrap: no grantor actor, no issuance event
      grantee_actor_id: granteeActorId,
      capability,
      scope,
      issued_at: ts,
      revoked_at: null,
      revoke_reason: null,
      is_bootstrap: true,
    };
    this.grants.set(id, grant);
    this._append({ kind: "grant", data: grant });
    return grant;
  }

  // ── lookups ─────────────────────────────────────────────────────────────────
  actorByEmail(email) {
    for (const a of this.actors.values()) if (a.email === email) return a;
    return null;
  }
  activeCredentialForActor(actorId, type = "password") {
    // last-registered credential of the type for the actor
    let found = null;
    for (const c of this.credentials) if (c.actor_id === actorId && c.type === type) found = c;
    return found;
  }
  invitationByToken(token) {
    for (const inv of this.invitations.values()) if (inv.token === token) return inv;
    return null;
  }
  grantsForActor(actorId) {
    const out = [];
    for (const g of this.grants.values()) if (g.grantee_actor_id === actorId) out.push(g);
    return out;
  }

  // Permission gate (C14 principal binding + APA default-deny). Returns true if
  // the actor holds an ACTIVE grant for the capability.
  actorHasCapability(actorId, capability) {
    for (const g of this.grants.values()) {
      if (g.grantee_actor_id === actorId && g.capability === capability && !g.revoked_at) return true;
    }
    return false;
  }

  sessionValid(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    if (s.revoked_at) return false;
    if (s.expires_at && Date.parse(s.expires_at) <= Date.now()) return false;
    return true;
  }

  // ── C13 Login: authenticate ──────────────────────────────────────────────────
  // verify credential → on success open a session and emit login.succeeded +
  // session.opened; on failure emit an anonymous login.failed.
  authenticate({ email, password }) {
    const actor = this.actorByEmail(email);
    const cred = actor ? this.activeCredentialForActor(actor.id) : null;
    const ok = cred ? verifyPassword(password, cred.material) : false;
    if (!ok) {
      // anonymous failed login — no actor, no session (C13-4 / C1-2a)
      this._emit({
        actor_id: null,
        session_id: null,
        action: ACTIONS.LOGIN_FAILED,
        target_kind: "credential",
        target_id: null,
        payload: { email },
      });
      return { ok: false };
    }
    const session = this._openSession(actor.id);
    // login.succeeded: target is the authenticated actor (C13-4 requires
    // target_id === actor_id); attributed to actor + the new session.
    this._emit({
      actor_id: actor.id,
      session_id: session.id,
      action: ACTIONS.LOGIN_SUCCEEDED,
      target_kind: "actor",
      target_id: actor.id,
      payload: { email, credential_id: cred.id, session_id: session.id },
    });
    return { ok: true, actor_id: actor.id, session_id: session.id };
  }

  _openSession(actorId) {
    const id = ++this._sessionSeq;
    const opened = this.clock();
    const expires = new Date(Date.now() + 8 * 3600 * 1000).toISOString(); // 8h
    const session = { id, actor_id: actorId, opened_at: opened, expires_at: expires, revoked_at: null };
    this.sessions.set(id, session);
    this._append({ kind: "session", data: session });
    return session;
  }

  signOut(sessionId, actorId) {
    const s = this.sessions.get(sessionId);
    if (!s || s.revoked_at) return { ok: false };
    const ts = this.clock();
    this.sessions.set(sessionId, { ...s, revoked_at: ts });
    this._append({ kind: "session.update", data: { id: sessionId, patch: { revoked_at: ts } } });
    this._emit({
      actor_id: actorId,
      session_id: sessionId,
      action: ACTIONS.SESSION_REVOKED,
      target_kind: "session",
      target_id: sessionId,
      payload: { reason: "user-initiated-logout" },
    });
    return { ok: true };
  }

  // ── C16 External Onboarding: invite ──────────────────────────────────────────
  // attest (invitation.issued) under the inviter's session, create the invitation
  // in Pending. The inviter must hold invite_actor (APA/C14 gate).
  invite({ inviterActorId, inviterSessionId, email, display_name, role }) {
    if (!this.sessionValid(inviterSessionId)) throw new Error("session-invalid");
    if (!this.actorHasCapability(inviterActorId, "invite_actor")) throw new Error("denied: invite_actor");
    const id = ++this._invSeq;
    const token = "tok_" + randomBytes(12).toString("hex");
    const ts = this.clock();
    const inv = {
      id,
      email,
      display_name,
      role,
      token,
      party_id: null,
      status: "pending",
      issued_at: ts,
      accepted_at: null,
      accepted_by_actor_id: null,
      revoked_at: null,
    };
    this.invitations.set(id, inv);
    this._append({ kind: "invitation", data: inv });
    this._emit({
      actor_id: inviterActorId,
      session_id: inviterSessionId,
      action: ACTIONS.INVITATION_ISSUED,
      target_kind: "invitation",
      target_id: id,
      payload: { email, display_name, role },
    });
    return { invitation_id: id, token };
  }

  // ── C16 onboard — the load-bearing burst ────────────────────────────────────
  // The single serialization gate is Invitation.accept. On success, in ONE burst
  // attributed to the NEW actor + NEW session sharing actor_id+session_id, we
  // emit: invitation.accepted → actor.enrolled → credential.created →
  // session.opened. Order is fixed (accept first, enroll, then credential, then
  // open session). This makes the onboarding burst groupable by (actor, session).
  onboard({ token, password }) {
    const inv = this.invitationByToken(token);
    if (!inv) throw new Error("invitation-invalid: not-known");
    if (inv.status !== "pending") throw new Error(`invitation-invalid: already-resolved(${inv.status})`);

    const ts0 = this.clock();

    // 1. Party Identity enroll (Unverified). Created before the credential.
    const partyId = ++this._partySeq;
    const party = {
      id: partyId,
      created_at: ts0,
      display_name: inv.display_name,
      email: inv.email,
      status: "unverified",
    };
    this.parties.set(partyId, party);
    this._append({ kind: "party", data: party });

    // 2. Actor for the party.
    const actorId = ++this._actorSeq;
    const actor = {
      id: actorId,
      party_id: partyId,
      display_name: inv.display_name,
      email: inv.email,
      created_at: ts0,
      is_bootstrap: false,
    };
    this.actors.set(actorId, actor);
    this._append({ kind: "actor", data: actor });

    // 3. Open the session the burst is attributed to.
    const session = this._openSession(actorId);

    // 4. Accept the invitation (state transition recorded as an update record).
    const acceptTs = this.clock();
    const patch = { status: "accepted", accepted_at: acceptTs, accepted_by_actor_id: actorId, party_id: partyId };
    Object.assign(inv, patch);
    this._append({ kind: "invitation.update", data: { id: inv.id, patch } });

    // 5. Register the credential (after the party; C16-3 credential-follows-party).
    const credTs = this.clock();
    const credId = ++this._credSeq;
    const cred = { id: credId, actor_id: actorId, type: "password", material: hashPassword(password), created_at: credTs };
    this.credentials.push(cred);
    this._append({ kind: "credential", data: cred });

    // ── the burst: all four events share actor_id + session_id ────────────────
    this._emit({
      actor_id: actorId,
      session_id: session.id,
      action: ACTIONS.INVITATION_ACCEPTED,
      target_kind: "invitation",
      target_id: inv.id,
      payload: { token, accepting_identity_ref: inv.email },
    });
    this._emit({
      actor_id: actorId,
      session_id: session.id,
      action: ACTIONS.ACTOR_ENROLLED,
      target_kind: "actor",
      target_id: actorId,
      payload: { party_id: partyId, invitation_id: inv.id },
    });
    this._emit({
      actor_id: actorId,
      session_id: session.id,
      action: ACTIONS.CREDENTIAL_CREATED,
      target_kind: "credential",
      target_id: credId,
      payload: { actor_id: actorId },
    });
    this._emit({
      actor_id: actorId,
      session_id: session.id,
      action: ACTIONS.SESSION_OPENED,
      target_kind: "session",
      target_id: session.id,
      payload: { invitation_id: inv.id, party_id: partyId },
    });

    return { actor_id: actorId, session_id: session.id, party_id: partyId, credential_id: credId, invitation_id: inv.id };
  }

  // ── APA: grant ───────────────────────────────────────────────────────────────
  // attest-before-record: the grantor (under a valid session holding
  // grant_permission) issues a grant; grant.issued names it.
  grant({ grantorActorId, grantorSessionId, granteeActorId, capability, scope }) {
    if (!this.sessionValid(grantorSessionId)) throw new Error("session-invalid");
    if (!this.actorHasCapability(grantorActorId, "grant_permission")) throw new Error("denied: grant_permission");
    const id = ++this._grantSeq;
    const ts = this.clock();
    const g = {
      id,
      grantor_actor_id: grantorActorId,
      grantee_actor_id: granteeActorId,
      capability,
      scope,
      issued_at: ts,
      revoked_at: null,
      revoke_reason: null,
      is_bootstrap: false,
    };
    this.grants.set(id, g);
    this._append({ kind: "grant", data: g });
    this._emit({
      actor_id: grantorActorId,
      session_id: grantorSessionId,
      action: ACTIONS.GRANT_ISSUED,
      target_kind: "grant",
      target_id: id,
      payload: { grantee_actor_id: granteeActorId, capability, scope },
    });
    return { grant_id: id };
  }

  // ── APA: revokeGrant ─────────────────────────────────────────────────────────
  // attest-before-record (revocation is terminal); grant.revoked names it and
  // captures the reason.
  revokeGrant({ revokerActorId, revokerSessionId, grantId, reason }) {
    if (!this.sessionValid(revokerSessionId)) throw new Error("session-invalid");
    if (!this.actorHasCapability(revokerActorId, "grant_permission")) throw new Error("denied: grant_permission");
    const g = this.grants.get(grantId);
    if (!g) throw new Error("not-known");
    if (g.revoked_at) throw new Error("not-active");
    const ts = this.clock();
    const patch = { revoked_at: ts, revoke_reason: reason };
    Object.assign(g, patch);
    this._append({ kind: "grant.update", data: { id: grantId, patch } });
    this._emit({
      actor_id: revokerActorId,
      session_id: revokerSessionId,
      action: ACTIONS.GRANT_REVOKED,
      target_kind: "grant",
      target_id: grantId,
      payload: { reason },
    });
    return { ok: true };
  }

  // ── domain: enrollSubject ────────────────────────────────────────────────────
  enrollSubject({ actorId, sessionId, prefix }) {
    if (!this.sessionValid(sessionId)) throw new Error("session-invalid");
    if (!this.actorHasCapability(actorId, "enroll_subject")) throw new Error("denied: enroll_subject");
    const n = (this._subjectCounter.get(prefix) ?? 0) + 1;
    this._subjectCounter.set(prefix, n);
    const subject_code = `${prefix}-${String(n).padStart(3, "0")}`;
    const id = ++this._subjectSeq;
    const ts = this.clock();
    const subject = { id, subject_code, protocol: "BCN-OX-201", enrolled_at: ts, enrolled_by_actor_id: actorId, _prefix: prefix, _n: n };
    this.subjects.set(id, subject);
    this._append({ kind: "subject", data: subject });
    this._emit({
      actor_id: actorId,
      session_id: sessionId,
      action: ACTIONS.SUBJECT_ENROLLED,
      target_kind: "subject",
      target_id: id,
      payload: { subject_code, protocol: "BCN-OX-201" },
    });
    return { subject_id: id, subject_code };
  }

  // ── domain: recordVisit ──────────────────────────────────────────────────────
  recordVisit({ actorId, sessionId, subjectId, kind }) {
    if (!this.sessionValid(sessionId)) throw new Error("session-invalid");
    if (!this.actorHasCapability(actorId, "record_visit")) throw new Error("denied: record_visit");
    const id = ++this._visitSeq;
    const ts = this.clock();
    const visit = { id, subject_id: subjectId, kind, recorded_at: ts, recorded_by_actor_id: actorId };
    this.visits.set(id, visit);
    this._append({ kind: "visit", data: visit });
    this._emit({
      actor_id: actorId,
      session_id: sessionId,
      action: ACTIONS.VISIT_RECORDED,
      target_kind: "visit",
      target_id: id,
      payload: { subject_id: subjectId, kind },
    });
    return { visit_id: id };
  }

  // ── read view for the validator adapter ──────────────────────────────────────
  snapshot() {
    return {
      events: this.events,
      parties: [...this.parties.values()],
      actors: [...this.actors.values()],
      credentials: this.credentials,
      sessions: [...this.sessions.values()],
      grants: [...this.grants.values()],
      invitations: [...this.invitations.values()],
      retention: this.retention,
    };
  }

  // ── tamper-evidence verify ───────────────────────────────────────────────────
  // Recompute the chain from event #1 the SAME way for every row including
  // genesis. Returns {ok:true,count} or {ok:false,at,expected,found}.
  verifyChain() {
    let prev = "";
    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];
      const recomputed = computeHash({ ...ev, prev_hash: prev });
      if (ev.prev_hash !== prev) {
        return { ok: false, at: ev.id, expected: prev, found: ev.prev_hash };
      }
      if (recomputed !== ev.this_hash) {
        return { ok: false, at: ev.id, expected: recomputed, found: ev.this_hash };
      }
      prev = ev.this_hash;
    }
    return { ok: true, count: this.events.length };
  }
}

// ── factory ──────────────────────────────────────────────────────────────────
export function openPortal(dbPath) {
  return new Portal(dbPath);
}

export function freshPortal(dbPath) {
  // truncate any existing store so a build starts clean
  mkdirSync(dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, "");
  return new Portal(dbPath);
}

export { hashPassword, verifyPassword, computeHash, stableStringify };
