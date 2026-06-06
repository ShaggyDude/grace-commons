// composition.ts — THE ONLY mutation surface (second render).
//
// Ported from render 1 (demos/clinical-trial-portal/composition.ts). Every
// function: takes a Ctx + typed input; wraps its body in `await withTx` (which
// holds the global audit advisory lock — BUILD_PLAN §4); writes atom rows + one
// or more audit events in the SAME transaction; returns a plain object. Action
// codes and audit payload fields are TRANSCRIBED from render 1 — an auditor
// diffing the two renders' event logs must see identical `action` strings.
//
// Async difference: password hashing (Argon2/scrypt) runs BEFORE withTx to keep
// the global lock hold-time minimal.
//
// Action codes (same as render 1):
//   invitation.issued | invitation.accepted | invitation.revoked
//   login.succeeded   | login.failed        | session.revoked
//   grant.issued      | grant.revoked
//   subject.enrolled  | visit.recorded
import { withTx, db, type Ctx } from "./lib/db.ts";
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

const SESSION_DAYS = 7;
const expiresIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

// ── Invitation lifecycle ─────────────────────────────────────────────────────

/**
 * External Onboarding (C16) — invite step. Creates the Party if new.
 * Emits: invitation.issued
 */
export async function issueInvitation(
  ctx: Ctx,
  input: { email: string; display_name: string; intended_role: string; expires_in_days?: number },
): Promise<Invitation> {
  if (!ctx.actor) throw new Error("issueInvitation: authenticated actor required");
  const token = randomToken();
  const expires_at = expiresIn(input.expires_in_days ?? 7);
  return withTx(ctx, async (tx) => {
    const party = (await parties.getByEmail(tx, input.email)) ?? (await parties.create(tx, input.email, input.display_name));
    const inv = await invitations.create(tx, {
      party_id: party.id, intended_role: input.intended_role, token,
      issued_by_actor_id: ctx.actor!.id, expires_at,
    });
    await appendEvent(tx, {
      action: "invitation.issued", target_kind: "invitation", target_id: inv.id,
      payload: { display_name: input.display_name, email: input.email, intended_role: input.intended_role, expires_at },
    });
    return inv;
  });
}

/**
 * External Onboarding (C16) — onboard step. Argon2/scrypt hash runs BEFORE the
 * transaction. Creates Actor + Credential + Session; marks the invitation
 * accepted; logs the invitee in.
 * Emits: invitation.accepted, actor.enrolled, credential.created, session.opened
 */
export async function acceptInvitation(
  ctx: Ctx,
  input: { token: string; password: string },
): Promise<{ actor: Actor; session: Session }> {
  const secret_hash = await hashPassword(input.password);
  const sessionToken = randomToken();
  const expires_at = expiresIn(SESSION_DAYS);
  const savedActor = ctx.actor, savedSession = ctx.session;
  try {
    return await withTx(ctx, async (tx) => {
      const inv = await invitations.getByToken(tx, input.token);
      if (!inv) throw new Error("acceptInvitation: invitation not found");
      if (inv.accepted_at || inv.revoked_at) throw new Error("acceptInvitation: invitation already resolved");
      if (new Date(inv.expires_at) <= new Date()) throw new Error("acceptInvitation: invitation expired");

      const actor = await actors.create(tx, inv.party_id);
      await credentials.create(tx, actor.id, "password", secret_hash);
      await invitations.markAccepted(tx, inv.id, actor.id);
      const session = await sessions.create(tx, actor.id, sessionToken, expires_at);

      // Attribute the burst to the new actor + session.
      tx.ctx.actor = actor as any;
      tx.ctx.session = session as any;

      await appendEvent(tx, { action: "invitation.accepted", target_kind: "invitation", target_id: inv.id, payload: { intended_role: inv.intended_role } });
      await appendEvent(tx, { action: "actor.enrolled", target_kind: "actor", target_id: actor.id, payload: { party_id: inv.party_id, via_invitation_id: inv.id } });
      await appendEvent(tx, { action: "credential.created", target_kind: "credential", payload: { kind: "password" } });
      await appendEvent(tx, { action: "session.opened", target_kind: "session", target_id: session.id, payload: { actor_id: actor.id, via: "onboard" } });
      return { actor, session };
    });
  } catch (err) {
    ctx.actor = savedActor; ctx.session = savedSession;
    throw err;
  }
}

/** Emits: invitation.revoked */
export async function revokeInvitation(ctx: Ctx, input: { invitation_id: number }): Promise<void> {
  if (!ctx.actor) throw new Error("revokeInvitation: authenticated actor required");
  await withTx(ctx, async (tx) => {
    const inv = await invitations.getById(tx, input.invitation_id);
    if (!inv) throw new Error(`revokeInvitation: #${input.invitation_id} not found`);
    await invitations.revoke(tx, input.invitation_id);
    await appendEvent(tx, { action: "invitation.revoked", target_kind: "invitation", target_id: input.invitation_id, payload: { intended_role: inv.intended_role } });
  });
}

// ── Authentication (Login C13) ───────────────────────────────────────────────

/**
 * Login (C13). Verify runs BEFORE the transaction. Every failure path emits an
 * anonymous login.failed; success emits login.succeeded.
 * Returns the generic "invalid_credentials" reason — the specific cause is only
 * in the audit log.
 */
export async function login(
  ctx: Ctx,
  input: { email: string; password: string },
): Promise<{ ok: true; session: Session } | { ok: false; reason: string }> {
  const failed = async (payload: Record<string, unknown>) => {
    await withTx(ctx, async (tx) => { await appendEvent(tx, { action: "login.failed", payload }); });
    return { ok: false as const, reason: "invalid_credentials" };
  };

  const party = await parties.getByEmail(db, input.email);
  if (!party) return failed({ email: input.email, reason: "unknown_email" });
  const actor = await actors.getByPartyId(db, party.id);
  if (!actor) return failed({ email: input.email, party_id: party.id, reason: "no_actor" });
  const cred = await credentials.getActiveByActorId(db, actor.id);
  if (!cred) return failed({ email: input.email, party_id: party.id, reason: "no_credential" });

  const valid = await verifyPassword(input.password, cred.secret_hash);
  if (!valid) return failed({ email: input.email, party_id: party.id, reason: "bad_password" });

  const sessionToken = randomToken();
  const expires_at = expiresIn(SESSION_DAYS);
  const savedActor = ctx.actor, savedSession = ctx.session;
  try {
    const session = await withTx(ctx, async (tx) => {
      const s = await sessions.create(tx, actor.id, sessionToken, expires_at);
      tx.ctx.actor = actor as any; tx.ctx.session = s as any;
      await appendEvent(tx, { action: "login.succeeded", target_kind: "actor", target_id: actor.id, payload: {} });
      return s;
    });
    return { ok: true, session };
  } catch (err) {
    ctx.actor = savedActor; ctx.session = savedSession;
    throw err;
  }
}

/** Emits: session.revoked */
export async function logout(ctx: Ctx): Promise<void> {
  if (!ctx.session) throw new Error("logout: no active session");
  await withTx(ctx, async (tx) => {
    await sessions.revoke(tx, tx.ctx.session!.id);
    await appendEvent(tx, { action: "session.revoked", target_kind: "session", target_id: tx.ctx.session!.id, payload: {} });
  });
}

// ── Attributed Permissions Admin (APA) ───────────────────────────────────────

/** Emits: grant.issued */
export async function grantPermission(
  ctx: Ctx,
  input: { grantee_actor_id: number; permission_id: number; scope?: "all" | "own" },
): Promise<Grant> {
  if (!ctx.actor) throw new Error("grantPermission: authenticated actor required");
  return withTx(ctx, async (tx) => {
    const grant = await grants.create(tx, {
      grantor_actor_id: ctx.actor!.id, grantee_actor_id: input.grantee_actor_id,
      permission_id: input.permission_id, scope: input.scope ?? "all",
    });
    await appendEvent(tx, {
      action: "grant.issued", target_kind: "grant", target_id: grant.id,
      payload: { grantee_actor_id: input.grantee_actor_id, permission_id: input.permission_id, scope: input.scope ?? "all" },
    });
    return grant;
  });
}

/** Emits: grant.revoked */
export async function revokeGrant(ctx: Ctx, input: { grant_id: number; reason: string }): Promise<void> {
  if (!ctx.actor) throw new Error("revokeGrant: authenticated actor required");
  await withTx(ctx, async (tx) => {
    await grants.revoke(tx, input.grant_id, input.reason);
    await appendEvent(tx, { action: "grant.revoked", target_kind: "grant", target_id: input.grant_id, payload: { reason: input.reason } });
  });
}

// ── Regulated clinical actions ───────────────────────────────────────────────

/** Emits: subject.enrolled */
export async function enrollSubject(
  ctx: Ctx,
  input: { study_id: number; prefix: string; notes?: string | null },
): Promise<Subject> {
  if (!ctx.actor) throw new Error("enrollSubject: authenticated actor required");
  return withTx(ctx, async (tx) => {
    const subject_code = await subjects.nextSubjectCode(tx, input.prefix);
    const subject = await subjects.create(tx, {
      study_id: input.study_id, subject_code, enrolled_by_actor_id: ctx.actor!.id, notes: input.notes ?? null,
    });
    await appendEvent(tx, { action: "subject.enrolled", target_kind: "subject", target_id: subject.id, payload: { study_id: input.study_id, subject_code } });
    return subject;
  });
}

/** Emits: visit.recorded */
export async function recordVisit(
  ctx: Ctx,
  input: { subject_id: number; visit_kind: string; notes?: string | null },
): Promise<Visit> {
  if (!ctx.actor) throw new Error("recordVisit: authenticated actor required");
  return withTx(ctx, async (tx) => {
    const visit = await visits.create(tx, {
      subject_id: input.subject_id, visit_kind: input.visit_kind, recorded_by_actor_id: ctx.actor!.id, notes: input.notes ?? null,
    });
    await appendEvent(tx, { action: "visit.recorded", target_kind: "visit", target_id: visit.id, payload: { subject_id: input.subject_id, visit_kind: input.visit_kind } });
    return visit;
  });
}
