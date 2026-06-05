// tools/conformance/ghost/adapters/clinical-trial-portal-pg.actions.mjs
//
// Render-3 ACTIONS ADAPTER (Postgres / pglite). Async — every op awaits — which
// the render-agnostic scenario runner already supports (it awaits each step).
// Maps the SAME scenario verbs onto render 3's Postgres ops.

import { open } from "../../render3/portal.mjs";

export default function createActions({ dbPath }) {
  const portal = open(dbPath);
  const ctxByActor = new Map();
  const ctx = (actor) => {
    if (!ctxByActor.has(actor)) ctxByActor.set(actor, { login_id: null, session_id: null });
    return ctxByActor.get(actor);
  };

  return {
    async authenticate(actor, { email, password }) {
      const r = await portal.authenticate(ctx(actor), { email, password });
      if (!r.ok) throw new Error(`authenticate(${actor}): rejected`);
      return { actor_id: r.login_id };
    },
    async invite(actor, { email, display_name, role }) {
      const r = await portal.invite(ctx(actor), { email, full_name: display_name, role });
      return { invitation_id: r.invite_id, token: r.ticket };
    },
    async onboard(actor, { token, password }) {
      const r = await portal.onboard(ctx(actor), { ticket: token, password });
      return { actor_id: r.login_id };
    },
    async grant(actor, { grantee, capability, scope }) {
      const r = await portal.grant(ctx(actor), { holder_id: grantee, perm_code: capability, scope });
      return { grant_id: r.grant_id };
    },
    async revokeGrant(actor, { grant, reason }) {
      await portal.rescind(ctx(actor), { grant_id: grant, reason });
      return {};
    },
    async enrollSubject(actor, { prefix }) {
      const r = await portal.enroll(ctx(actor), { prefix });
      return { subject_id: r.enrollee_id, subject_code: r.code };
    },
    async recordVisit(actor, { subject, kind }) {
      const r = await portal.encounter(ctx(actor), { enrollee_id: subject, kind });
      return { visit_id: r.visit_id };
    },
    async signOut(actor) {
      await portal.signOut(ctx(actor));
      return {};
    },
    async close() { await portal.close(); },
  };
}
