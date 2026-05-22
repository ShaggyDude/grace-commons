// composition.ts
//
// The ONLY mutation surface. Every function here:
//   • runs inside withTx (synchronous transaction boundary)
//   • writes one or more atom rows via domain helpers
//   • emits one or more audit events via appendEvent
//
// If any step throws, withTx rolls back — atom rows AND audit rows alike.
// This invariant is verified by tests/composition.test.ts.
//
// Async functions (acceptInvitation, login) perform async work (Argon2id
// hashing / verification) BEFORE entering withTx, because withTx is
// synchronous. The rule: no async operation inside a withTx block.
//
// Audit action strings follow dot-notation: <noun>.<verb>
//   invitation.issued | invitation.accepted | invitation.revoked
//   login.succeeded   | login.failed
//   session.revoked
//   grant.issued      | grant.revoked
//   subject.enrolled
//   visit.recorded

import { withTx, type Ctx } from "./lib/db.ts";
import { hashPassword, verifyPassword } from "./lib/password.ts";
import { randomToken } from "./lib/hash.ts";
import { appendEvent } from "./domain/event_log.ts";
import * as parties from "./domain/parties.ts";
import * as actors from "./domain/actors.ts";
import * as credentials from "./domain/credentials.ts";
import * as sessions from "./domain/sessions.ts";
import * as invitations from "./domain/invitations.ts";
import * as grants from "./domain/grants.ts";
import * as subjects from "./domain/subjects.ts";
import * as visits from "./domain/visits.ts";

import type { Invitation } from "./domain/invitations.ts";
import type { Session } from "./domain/sessions.ts";
import type { Grant } from "./domain/grants.ts";
import type { Subject } from "./domain/subjects.ts";
import type { Visit } from "./domain/visits.ts";
import type { Actor } from "./domain/actors.ts";

// Session lifetime for newly issued sessions (login + acceptInvitation).
const SESSION_DAYS = 7;

// ---------------------------------------------------------------------------
// Invitation lifecycle
// ---------------------------------------------------------------------------

/**
 * Issue an invitation to an email address.
 *
 * Creates the Party record if one does not already exist for the given email.
 * The caller must hold the `invite_actor` permission (enforced upstream at
 * the route layer; not re-checked here).
 *
 * Emits: invitation.issued
 */
export function issueInvitation(
  ctx: Ctx,
  input: {
    email: string;
    display_name: string;
    intended_role: string;
    expires_in_days?: number;
  },
): Invitation {
  if (!ctx.actor) throw new Error("issueInvitation: authenticated actor required");

  const expiryDays = input.expires_in_days ?? 7;
  const expires_at = new Date(Date.now() + expiryDays * 86_400_000).toISOString();
  const token = randomToken();

  return withTx(ctx, (tx) => {
    // Upsert party — create only if the email is new.
    let party = parties.getByEmail(tx.db, input.email);
    if (!party) {
      party = parties.create(tx.db, input.email, input.display_name);
    }

    const invitation = invitations.create(tx.db, {
      party_id: party.id,
      intended_role: input.intended_role,
      token,
      issued_by_actor_id: tx.ctx.actor!.id,
      expires_at,
    });

    appendEvent(tx, {
      action: "invitation.issued",
      target_kind: "invitation",
      target_id: invitation.id,
      payload: {
        email: input.email,
        intended_role: input.intended_role,
        expires_at,
      },
    });

    return invitation;
  });
}

/**
 * Accept an invitation and complete onboarding.
 *
 * Creates: Actor (for the invitation's party), Credential (Argon2id hash of
 * the supplied password), Session (so the invitee is immediately logged in).
 * Marks the invitation as accepted.
 *
 * The Argon2id hash is computed BEFORE entering withTx (async; cannot run
 * inside the synchronous transaction boundary).
 *
 * Emits: invitation.accepted (attributed to the newly created actor)
 */
export async function acceptInvitation(
  ctx: Ctx,
  input: { token: string; password: string },
): Promise<{ actor: Actor; session: Session }> {
  // Hash the password before entering withTx — async work must stay outside.
  const secret_hash = await hashPassword(input.password);
  const sessionToken = randomToken();
  const expires_at = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();

  // Save ctx state so we can restore it if the transaction rolls back.
  const savedActor = ctx.actor;
  const savedSession = ctx.session;

  try {
    return withTx(ctx, (tx) => {
      const inv = invitations.getByToken(tx.db, input.token);
      if (!inv) throw new Error("acceptInvitation: invitation not found");
      if (inv.accepted_at || inv.revoked_at) {
        throw new Error("acceptInvitation: invitation already resolved");
      }
      if (new Date(inv.expires_at) <= new Date()) {
        throw new Error("acceptInvitation: invitation expired");
      }

      const actor = actors.create(tx.db, inv.party_id);
      credentials.create(tx.db, actor.id, "password", secret_hash);
      invitations.markAccepted(tx.db, inv.id, actor.id);
      const session = sessions.create(tx.db, actor.id, sessionToken, expires_at);

      // Set attribution on ctx before emitting the event, so the audit row
      // correctly names the newly created actor rather than null.
      tx.ctx.actor = actor;
      tx.ctx.session = session;

      appendEvent(tx, {
        action: "invitation.accepted",
        target_kind: "invitation",
        target_id: inv.id,
        payload: { intended_role: inv.intended_role },
      });

      return { actor, session };
    });
  } catch (err) {
    // Transaction rolled back — restore ctx to the state before the call.
    ctx.actor = savedActor;
    ctx.session = savedSession;
    throw err;
  }
}

/**
 * Revoke a pending invitation.
 *
 * The invitation must be in the Pending state; invitations.revoke throws if
 * it is already resolved.
 *
 * Emits: invitation.revoked
 */
export function revokeInvitation(
  ctx: Ctx,
  input: { invitation_id: number },
): void {
  if (!ctx.actor) throw new Error("revokeInvitation: authenticated actor required");

  withTx(ctx, (tx) => {
    const inv = invitations.getById(tx.db, input.invitation_id);
    if (!inv) throw new Error(`revokeInvitation: invitation #${input.invitation_id} not found`);

    invitations.revoke(tx.db, input.invitation_id);

    appendEvent(tx, {
      action: "invitation.revoked",
      target_kind: "invitation",
      target_id: input.invitation_id,
      payload: { intended_role: inv.intended_role },
    });
  });
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Authenticate with email + password and issue a session.
 *
 * All failure paths emit a `login.failed` event (anonymous — no actor_id)
 * that commits independently, so failed attempts are auditable.
 *
 * The Argon2id verification runs BEFORE entering withTx (async; cannot run
 * inside the synchronous transaction boundary).
 *
 * Returns: { ok: true, session } on success; { ok: false, reason } on failure.
 * The returned `reason` is always the generic string "invalid_credentials" —
 * the specific failure cause is recorded only in the audit log.
 */
export async function login(
  ctx: Ctx,
  input: { email: string; password: string },
): Promise<{ ok: true; session: Session } | { ok: false; reason: string }> {
  // --- Look up party, actor, credential (synchronous reads, no transaction) ---

  const party = parties.getByEmail(ctx.db, input.email);
  if (!party) {
    withTx(ctx, (tx) => {
      appendEvent(tx, {
        action: "login.failed",
        payload: { reason: "unknown_email" },
      });
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  const actor = actors.getByPartyId(ctx.db, party.id);
  if (!actor) {
    withTx(ctx, (tx) => {
      appendEvent(tx, {
        action: "login.failed",
        payload: { reason: "no_actor" },
      });
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  const cred = credentials.getActiveByActorId(ctx.db, actor.id);
  if (!cred) {
    withTx(ctx, (tx) => {
      appendEvent(tx, {
        action: "login.failed",
        payload: { reason: "no_credential" },
      });
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  // --- Async Argon2id verification (must happen before withTx) ---

  const valid = await verifyPassword(input.password, cred.secret_hash);
  if (!valid) {
    withTx(ctx, (tx) => {
      appendEvent(tx, {
        action: "login.failed",
        payload: { reason: "bad_password" },
      });
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  // --- Success: create session and emit login.succeeded in one transaction ---

  const sessionToken = randomToken();
  const expires_at = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();

  const savedActor = ctx.actor;
  const savedSession = ctx.session;

  try {
    const session = withTx(ctx, (tx) => {
      const s = sessions.create(tx.db, actor.id, sessionToken, expires_at);
      // Set attribution on ctx before the audit event.
      tx.ctx.actor = actor;
      tx.ctx.session = s;
      appendEvent(tx, {
        action: "login.succeeded",
        target_kind: "actor",
        target_id: actor.id,
        payload: {},
      });
      return s;
    });
    return { ok: true, session };
  } catch (err) {
    ctx.actor = savedActor;
    ctx.session = savedSession;
    throw err;
  }
}

/**
 * Revoke the current session (logout).
 *
 * Emits: session.revoked (attributed to the actor ending the session)
 */
export function logout(ctx: Ctx): void {
  if (!ctx.session) throw new Error("logout: no active session");

  withTx(ctx, (tx) => {
    sessions.revoke(tx.db, tx.ctx.session!.id);
    appendEvent(tx, {
      action: "session.revoked",
      target_kind: "session",
      target_id: tx.ctx.session!.id,
      payload: {},
    });
  });
}

// ---------------------------------------------------------------------------
// Permissions management
// ---------------------------------------------------------------------------

/**
 * Issue a permission grant.
 *
 * The grantor must hold the `grant_permission` permission (checked upstream).
 *
 * Emits: grant.issued
 */
export function grantPermission(
  ctx: Ctx,
  input: {
    grantee_actor_id: number;
    permission_id: number;
    scope?: "all" | "own";
  },
): Grant {
  if (!ctx.actor) throw new Error("grantPermission: authenticated actor required");

  return withTx(ctx, (tx) => {
    const grant = grants.create(tx.db, {
      grantor_actor_id: tx.ctx.actor!.id,
      grantee_actor_id: input.grantee_actor_id,
      permission_id: input.permission_id,
      scope: input.scope ?? "all",
    });

    appendEvent(tx, {
      action: "grant.issued",
      target_kind: "grant",
      target_id: grant.id,
      payload: {
        grantee_actor_id: input.grantee_actor_id,
        permission_id: input.permission_id,
        scope: input.scope ?? "all",
      },
    });

    return grant;
  });
}

/**
 * Revoke a permission grant.
 *
 * Emits: grant.revoked
 */
export function revokeGrant(
  ctx: Ctx,
  input: { grant_id: number; reason: string },
): void {
  if (!ctx.actor) throw new Error("revokeGrant: authenticated actor required");

  withTx(ctx, (tx) => {
    grants.revoke(tx.db, input.grant_id, input.reason);
    appendEvent(tx, {
      action: "grant.revoked",
      target_kind: "grant",
      target_id: input.grant_id,
      payload: { reason: input.reason },
    });
  });
}

// ---------------------------------------------------------------------------
// Regulated clinical actions
// ---------------------------------------------------------------------------

/**
 * Enroll a new subject into a study.
 *
 * Assigns the next sequential subject code for the given study prefix
 * (e.g., "BCN" → "BCN-001", "BCN-002", …).
 * The caller must hold the `enroll_subject` permission (checked upstream).
 *
 * Emits: subject.enrolled
 */
export function enrollSubject(
  ctx: Ctx,
  input: {
    study_id: number;
    prefix: string;
    notes?: string | null;
  },
): Subject {
  if (!ctx.actor) throw new Error("enrollSubject: authenticated actor required");

  return withTx(ctx, (tx) => {
    const subject_code = subjects.nextSubjectCode(tx.db, input.prefix);

    const subject = subjects.create(tx.db, {
      study_id: input.study_id,
      subject_code,
      enrolled_by_actor_id: tx.ctx.actor!.id,
      notes: input.notes ?? null,
    });

    appendEvent(tx, {
      action: "subject.enrolled",
      target_kind: "subject",
      target_id: subject.id,
      payload: {
        study_id: input.study_id,
        subject_code,
      },
    });

    return subject;
  });
}

/**
 * Record a study visit for a subject.
 *
 * The caller must hold the `record_visit` permission (checked upstream).
 *
 * Emits: visit.recorded
 */
export function recordVisit(
  ctx: Ctx,
  input: {
    subject_id: number;
    visit_kind: string;
    notes?: string | null;
  },
): Visit {
  if (!ctx.actor) throw new Error("recordVisit: authenticated actor required");

  return withTx(ctx, (tx) => {
    const visit = visits.create(tx.db, {
      subject_id: input.subject_id,
      visit_kind: input.visit_kind,
      recorded_by_actor_id: tx.ctx.actor!.id,
      notes: input.notes ?? null,
    });

    appendEvent(tx, {
      action: "visit.recorded",
      target_kind: "visit",
      target_id: visit.id,
      payload: {
        subject_id: input.subject_id,
        visit_kind: input.visit_kind,
      },
    });

    return visit;
  });
}
