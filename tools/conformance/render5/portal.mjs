// tools/conformance/render5/portal.mjs
//
// The composition surface — the "server actions" of the Beacon portal, written
// in Next.js + Postgres idioms (async functions over a pglite client, each one
// the thing a `"use server"` action would call). This is where the five
// compositions are wired:
//
//   Login (C13)                         → signIn / signOut
//   External Onboarding (C16)           → issueInvite / claimInvite
//   Attributed Permissions Admin (APA)  → issueAuthority / withdrawAuthority
//   Session-Gated Authorization (C14)   → gate() — every mutation runs through it
//   Audit Trail (C1)                    → appendEvent inside every mutating tx
//
// Every mutation:
//   * runs the session gate first (C14: validate session → derive principal,
//     never trust a caller-supplied principal);
//   * checks the principal holds the capability (Permissions default-deny);
//   * writes its state change AND its audit row in ONE transaction (audit-first,
//     atomic — onboarding writes its 4-event burst sharing one actor+token).
//
// The internal event vocabulary (auth.login_ok, session.started, …) is this
// render's own; the validator adapter maps it to the canonical spec vocabulary.

import { appendEvent } from "./lib/audit.mjs";
import { hashSecret, verifySecret, newToken } from "./lib/crypto.mjs";
import { now } from "./lib/clock.mjs";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

// ── small helpers ─────────────────────────────────────────────────────────────

async function tx(db, fn) {
  await db.query("BEGIN");
  try {
    const r = await fn();
    await db.query("COMMIT");
    return r;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

async function staffByEmail(db, email) {
  const r = await db.query(
    `SELECT s.staff_id, s.party_id, s.role
       FROM staff s JOIN party p ON p.party_id = s.party_id
      WHERE p.email = $1`,
    [email],
  );
  return r.rows[0] ?? null;
}

async function activeSecret(db, staff_id) {
  const r = await db.query(
    `SELECT * FROM secret WHERE staff_id = $1 ORDER BY secret_id DESC LIMIT 1`,
    [staff_id],
  );
  return r.rows[0] ?? null;
}

// Session-Gated Authorization (C14): resolve the session token to its owner.
// Returns { staff_id, token_id } or throws session-invalid. The principal is
// ALWAYS derived here, never supplied by the caller (Invariant 2 — principal
// binding).
async function resolveSession(db, sessionToken) {
  if (!sessionToken) throw new Error("session-invalid(not-known)");
  const r = await db.query(
    `SELECT token_id, staff_id, ended_at, lapses_at FROM access_token WHERE token = $1`,
    [sessionToken],
  );
  const row = r.rows[0];
  if (!row) throw new Error("session-invalid(not-known)");
  if (row.ended_at) throw new Error("session-invalid(revoked)");
  if (new Date(row.lapses_at).getTime() <= Date.now()) throw new Error("session-invalid(expired)");
  return { staff_id: Number(row.staff_id), token_id: Number(row.token_id) };
}

// Permissions default-deny: principal holds an active grant for capability?
async function holdsCapability(db, staff_id, capability) {
  const r = await db.query(
    `SELECT 1 FROM authority
      WHERE holder_staff = $1 AND capability = $2 AND withdrawn_at IS NULL
      LIMIT 1`,
    [staff_id, capability],
  );
  return r.rows.length > 0;
}

// The gate: C14 wired over the audited surface. Validates the session, derives
// the principal, then checks the capability. Returns the session context.
async function gate(db, sessionToken, capability) {
  const ctx = await resolveSession(db, sessionToken);
  if (!(await holdsCapability(db, ctx.staff_id, capability))) {
    throw new Error(`denied(${capability})`);
  }
  return ctx;
}

// ── Login (C13) ───────────────────────────────────────────────────────────────

// signIn: Credential.verify → Session.issue, both events recorded. On failure,
// an anonymous auth.login_denied event (no actor, no session).
export async function signIn(db, { email, password }) {
  return tx(db, async () => {
    const staff = await staffByEmail(db, email);
    const secret = staff ? await activeSecret(db, staff.staff_id) : null;
    const ok = staff && secret && verifySecret(password, secret);

    if (!ok) {
      // Anonymous failed-login event (ANON_BY_DESIGN: login.failed).
      await appendEvent(db, {
        happened_at: now(),
        actor_staff: null,
        token_id: null,
        verb: "auth.login_denied",
        subject_kind: "staff",
        subject_ref: null,
        detail: { email, reason: "credential-invalid" },
      });
      throw new Error("credential-invalid");
    }

    const ts = now();
    const token = newToken("sess");
    const lapses = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const ins = await db.query(
      `INSERT INTO access_token (staff_id, token, started_at, lapses_at)
         VALUES ($1,$2,$3,$4) RETURNING token_id`,
      [staff.staff_id, token, ts, lapses],
    );
    const token_id = Number(ins.rows[0].token_id);

    // login.succeeded — attributed to the actor + its own session.
    await appendEvent(db, {
      happened_at: ts,
      actor_staff: staff.staff_id,
      token_id,
      verb: "auth.login_ok",
      subject_kind: "staff",
      subject_ref: staff.staff_id,
      detail: { email, token_id },
    });

    return { actor_id: staff.staff_id, session_token: token, token_id };
  });
}

// signOut: Session.revoke + logout event.
export async function signOut(db, { sessionToken }) {
  return tx(db, async () => {
    const ctx = await resolveSession(db, sessionToken);
    const ts = now();
    await db.query(
      `UPDATE access_token SET ended_at = $1 WHERE token_id = $2`,
      [ts, ctx.token_id],
    );
    await appendEvent(db, {
      happened_at: ts,
      actor_staff: ctx.staff_id,
      token_id: ctx.token_id,
      verb: "session.terminated",
      subject_kind: "session",
      subject_ref: ctx.token_id,
      detail: { reason: "user-initiated-logout" },
    });
    return { ok: true };
  });
}

// ── External Onboarding (C16) ─────────────────────────────────────────────────

// issueInvite: an authorized actor (invite_actor) initiates an invitation.
export async function issueInvite(db, { sessionToken, email, display_name, role }) {
  return tx(db, async () => {
    const ctx = await gate(db, sessionToken, "invite_actor");
    const ts = now();
    const token = newToken("inv");
    const ins = await db.query(
      `INSERT INTO enrollment_invite
         (token, invitee_email, display_name, intended_role, issued_by_staff, issued_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING invite_id`,
      [token, email, display_name, role, ctx.staff_id, ts],
    );
    const invite_id = Number(ins.rows[0].invite_id);

    await appendEvent(db, {
      happened_at: ts,
      actor_staff: ctx.staff_id,
      token_id: ctx.token_id,
      verb: "enrollment.invite_sent",
      subject_kind: "invite",
      subject_ref: invite_id,
      detail: { invitee_email: email, intended_role: role },
    });

    return { invitation_id: invite_id, token };
  });
}

// claimInvite: the load-bearing onboarding center. Invitation.accept (gate) →
// Party.enroll → Credential.register → Session.issue. The four onboarding events
// (invitation.accepted, actor.enrolled, credential.created, session.opened)
// share the NEW actor + NEW session, written atomically so the burst groups.
export async function claimInvite(db, { token, password }) {
  return tx(db, async () => {
    const inv = await db.query(
      `SELECT * FROM enrollment_invite WHERE token = $1`,
      [token],
    );
    const invite = inv.rows[0];
    if (!invite) throw new Error("invitation-invalid(not-known)");
    if (invite.withdrawn_at) throw new Error("invitation-invalid(already-resolved(Revoked))");
    if (invite.claimed_at) throw new Error("invitation-invalid(already-resolved(Accepted))");

    const ts = now();

    // Party.enroll — the new identity record (Unverified-equivalent: it simply
    // exists in the party store).
    const party = await db.query(
      `INSERT INTO party (display_name, email, enrolled_at) VALUES ($1,$2,$3) RETURNING party_id`,
      [invite.display_name, invite.invitee_email, ts],
    );
    const party_id = Number(party.rows[0].party_id);

    const staff = await db.query(
      `INSERT INTO staff (party_id, role, registered_at) VALUES ($1,$2,$3) RETURNING staff_id`,
      [party_id, invite.intended_role, ts],
    );
    const staff_id = Number(staff.rows[0].staff_id);

    // Invitation transitions to Accepted, bound to the accepting identity.
    await db.query(
      `UPDATE enrollment_invite
          SET claimed_at = $1, claimed_by_staff = $2, claimed_party = $3
        WHERE invite_id = $4`,
      [ts, staff_id, party_id, invite.invite_id],
    );

    // The new session is opened as part of onboarding so the burst shares one
    // session_id with the actor.enrolled / credential.created events.
    const sessToken = newToken("sess");
    const lapses = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const tok = await db.query(
      `INSERT INTO access_token (staff_id, token, started_at, lapses_at)
         VALUES ($1,$2,$3,$4) RETURNING token_id`,
      [staff_id, sessToken, ts, lapses],
    );
    const token_id = Number(tok.rows[0].token_id);

    // Credential.register — bound to the freshly-enrolled staff/party.
    const { algo, salt, digest } = hashSecret(password);
    const cred = await db.query(
      `INSERT INTO secret (staff_id, algo, salt, digest, minted_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING secret_id`,
      [staff_id, algo, salt, digest, ts],
    );
    const secret_id = Number(cred.rows[0].secret_id);

    // The onboarding burst — all four events share actor_staff + token_id so the
    // adapter's onboardingCompletions() can group them. Order matters:
    //   invitation.accepted, actor.enrolled, credential.created, session.opened.
    await appendEvent(db, {
      happened_at: ts, actor_staff: staff_id, token_id,
      verb: "enrollment.invite_claimed", subject_kind: "invite", subject_ref: invite.invite_id,
      detail: { invitation_id: invite.invite_id, party_id, accepting_email: invite.invitee_email },
    });
    await appendEvent(db, {
      happened_at: ts, actor_staff: staff_id, token_id,
      verb: "staff.registered", subject_kind: "staff", subject_ref: staff_id,
      detail: { party_id, role: invite.intended_role, invitation_id: invite.invite_id },
    });
    await appendEvent(db, {
      happened_at: ts, actor_staff: staff_id, token_id,
      verb: "secret.minted", subject_kind: "secret", subject_ref: secret_id,
      detail: { staff_id, party_id },
    });
    await appendEvent(db, {
      happened_at: ts, actor_staff: staff_id, token_id,
      verb: "session.started", subject_kind: "session", subject_ref: token_id,
      detail: { staff_id, onboarding: true },
    });

    return { actor_id: staff_id, party_id, session_token: sessToken, token_id, invitation_id: invite.invite_id };
  });
}

// ── Attributed Permissions Admin (APA) ────────────────────────────────────────

// issueAuthority: attributed grant. The grantor (gate: grant_permission) is
// recorded on the grant AND in a grant.issued event.
export async function issueAuthority(db, { sessionToken, grantee, capability, scope }) {
  return tx(db, async () => {
    const ctx = await gate(db, sessionToken, "grant_permission");
    const ts = now();
    const ins = await db.query(
      `INSERT INTO authority (holder_staff, capability, reach, granted_by_staff, granted_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING authority_id`,
      [Number(grantee), capability, scope ?? "all", ctx.staff_id, ts],
    );
    const authority_id = Number(ins.rows[0].authority_id);

    await appendEvent(db, {
      happened_at: ts,
      actor_staff: ctx.staff_id,
      token_id: ctx.token_id,
      verb: "authz.granted",
      subject_kind: "authority",
      subject_ref: authority_id,
      detail: { grantee: Number(grantee), capability, reach: scope ?? "all" },
    });

    return { grant_id: authority_id };
  });
}

// withdrawAuthority: attributed revocation. Terminal; records reason + event.
export async function withdrawAuthority(db, { sessionToken, grant, reason }) {
  return tx(db, async () => {
    const ctx = await gate(db, sessionToken, "grant_permission");
    const ts = now();
    const cur = await db.query(
      `SELECT * FROM authority WHERE authority_id = $1`,
      [Number(grant)],
    );
    const row = cur.rows[0];
    if (!row) throw new Error("not-known");
    if (row.withdrawn_at) throw new Error("not-active");

    await db.query(
      `UPDATE authority SET withdrawn_at = $1, withdraw_note = $2 WHERE authority_id = $3`,
      [ts, reason ?? "unspecified", Number(grant)],
    );

    await appendEvent(db, {
      happened_at: ts,
      actor_staff: ctx.staff_id,
      token_id: ctx.token_id,
      verb: "authz.withdrawn",
      subject_kind: "authority",
      subject_ref: Number(grant),
      detail: { reason: reason ?? "unspecified" },
    });

    return { ok: true };
  });
}

// ── Study operations (domain mutations under the gate) ────────────────────────

// enrollSubject: requires enroll_subject. Allocates the next BCN-### code.
export async function enrollSubject(db, { sessionToken, prefix }) {
  return tx(db, async () => {
    const ctx = await gate(db, sessionToken, "enroll_subject");
    const ts = now();
    const cnt = await db.query(`SELECT COUNT(*)::int AS n FROM study_subject`);
    const code = `${prefix}-${String(cnt.rows[0].n + 1).padStart(3, "0")}`;
    const ins = await db.query(
      `INSERT INTO study_subject (subject_code, protocol, enrolled_by_staff, enrolled_at)
         VALUES ($1,$2,$3,$4) RETURNING subject_id`,
      [code, "BCN-OX-201", ctx.staff_id, ts],
    );
    const subject_id = Number(ins.rows[0].subject_id);

    await appendEvent(db, {
      happened_at: ts,
      actor_staff: ctx.staff_id,
      token_id: ctx.token_id,
      verb: "subject.enrolled",
      subject_kind: "subject",
      subject_ref: subject_id,
      detail: { subject_code: code, protocol: "BCN-OX-201" },
    });

    return { subject_id, subject_code: code };
  });
}

// recordVisit: requires record_visit.
export async function recordVisit(db, { sessionToken, subject, kind }) {
  return tx(db, async () => {
    const ctx = await gate(db, sessionToken, "record_visit");
    const ts = now();
    const ins = await db.query(
      `INSERT INTO subject_visit (subject_id, visit_kind, recorded_by_staff, recorded_at)
         VALUES ($1,$2,$3,$4) RETURNING visit_id`,
      [Number(subject), kind, ctx.staff_id, ts],
    );
    const visit_id = Number(ins.rows[0].visit_id);

    await appendEvent(db, {
      happened_at: ts,
      actor_staff: ctx.staff_id,
      token_id: ctx.token_id,
      verb: "visit.logged",
      subject_kind: "visit",
      subject_ref: visit_id,
      detail: { subject_id: Number(subject), visit_kind: kind },
    });

    return { visit_id };
  });
}
