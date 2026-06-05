// tools/conformance/ghost/adapters/clinical-trial-portal-r4.actions.mjs
//
// Render-4 actions adapter — drives the render-agnostic ghost scenario against
// the append-only JSONL portal store. Each verb is spec-vocabulary; the render
// mapping lives inside. Per-actor context (the logged-in actor_id + session_id)
// is held in `this.ctx`, keyed by the scenario's actor handle ("PI", "Maya",
// "CRA"). `authenticate` and `onboard` establish a handle's context; later steps
// reuse it.

import { openPortal } from "../../render4/portal.mjs";

export default function createActions({ dbPath }) {
  const portal = openPortal(dbPath);
  const ctx = new Map(); // handle -> { actor_id, session_id }

  const need = (handle) => {
    const c = ctx.get(handle);
    if (!c) throw new Error(`actor handle '${handle}' has no session (not authenticated/onboarded)`);
    return c;
  };

  return {
    // authenticate(actor, { email, password }) -> { actor_id }
    authenticate(handle, { email, password }) {
      const r = portal.authenticate({ email, password });
      if (!r.ok) throw new Error(`authentication failed for ${email}`);
      ctx.set(handle, { actor_id: r.actor_id, session_id: r.session_id });
      return { actor_id: r.actor_id };
    },

    // invite(actor, { email, display_name, role }) -> { invitation_id, token }
    invite(handle, { email, display_name, role }) {
      const c = need(handle);
      const r = portal.invite({
        inviterActorId: c.actor_id,
        inviterSessionId: c.session_id,
        email,
        display_name,
        role,
      });
      return { invitation_id: r.invitation_id, token: r.token };
    },

    // onboard(actor, { token, password }) -> { actor_id }
    onboard(handle, { token, password }) {
      const r = portal.onboard({ token, password });
      // establish the onboarded actor's context (the burst opened a session)
      ctx.set(handle, { actor_id: r.actor_id, session_id: r.session_id });
      return { actor_id: r.actor_id };
    },

    // grant(actor, { grantee, capability, scope }) -> { grant_id }
    grant(handle, { grantee, capability, scope }) {
      const c = need(handle);
      const r = portal.grant({
        grantorActorId: c.actor_id,
        grantorSessionId: c.session_id,
        granteeActorId: grantee,
        capability,
        scope,
      });
      return { grant_id: r.grant_id };
    },

    // revokeGrant(actor, { grant, reason }) -> {}
    revokeGrant(handle, { grant, reason }) {
      const c = need(handle);
      portal.revokeGrant({
        revokerActorId: c.actor_id,
        revokerSessionId: c.session_id,
        grantId: grant,
        reason,
      });
      return {};
    },

    // enrollSubject(actor, { prefix }) -> { subject_id, subject_code }
    enrollSubject(handle, { prefix }) {
      const c = need(handle);
      const r = portal.enrollSubject({ actorId: c.actor_id, sessionId: c.session_id, prefix });
      return { subject_id: r.subject_id, subject_code: r.subject_code };
    },

    // recordVisit(actor, { subject, kind }) -> { visit_id }
    recordVisit(handle, { subject, kind }) {
      const c = need(handle);
      const r = portal.recordVisit({ actorId: c.actor_id, sessionId: c.session_id, subjectId: subject, kind });
      return { visit_id: r.visit_id };
    },

    // signOut(actor) -> {}
    signOut(handle) {
      const c = need(handle);
      portal.signOut(c.session_id, c.actor_id);
      return {};
    },

    close() {
      // append-only store: nothing buffered, every write already flushed.
    },
  };
}
