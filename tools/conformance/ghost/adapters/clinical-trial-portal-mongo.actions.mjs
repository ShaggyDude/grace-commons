// tools/conformance/ghost/adapters/clinical-trial-portal-mongo.actions.mjs
//
// Mongo-render ACTIONS ADAPTER. Async — every op awaits — which the
// render-agnostic scenario runner already supports. Maps the SAME scenario
// verbs onto the Mongo portal's ops (demos/clinical-trial-portal-mongo).
// `createActions({ uri })` takes a CONNECTION STRING, not a file path: the
// engine is a server; build.mjs owns the mongod lifecycle and passes the URI.

import { open } from "../../../../demos/clinical-trial-portal-mongo/portal.mjs";

export default function createActions({ uri }) {
  const portalP = open(uri); // lazily awaited by every verb
  const ctxByActor = new Map();
  const ctx = (actor) => {
    if (!ctxByActor.has(actor)) ctxByActor.set(actor, { actor: null, session: null });
    return ctxByActor.get(actor);
  };

  return {
    async authenticate(actor, { email, password }) {
      const portal = await portalP;
      const r = await portal.login(ctx(actor), { email, password });
      if (!r.ok) throw new Error(`authenticate(${actor}): rejected`);
      return { actor_id: ctx(actor).actor._id };
    },
    async invite(actor, { email, display_name, role }) {
      const portal = await portalP;
      const inv = await portal.issueInvitation(ctx(actor), { email, display_name, intended_role: role });
      return { invitation_id: inv._id, token: inv.token };
    },
    async onboard(actor, { token, password }) {
      const portal = await portalP;
      const r = await portal.acceptInvitation(ctx(actor), { token, password });
      return { actor_id: r.actor._id };
    },
    async grant(actor, { grantee, capability, scope }) {
      const portal = await portalP;
      const perm = await portal.permissionByCode(capability);
      if (!perm) throw new Error(`grant(${actor}): unknown capability '${capability}'`);
      const g = await portal.grantPermission(ctx(actor), { grantee_actor_id: grantee, permission_id: perm._id, scope });
      return { grant_id: g._id };
    },
    async revokeGrant(actor, { grant, reason }) {
      const portal = await portalP;
      await portal.revokeGrant(ctx(actor), { grant_id: grant, reason });
      return {};
    },
    async enrollSubject(actor, { prefix }) {
      const portal = await portalP;
      const study = await portal.studyByProtocol("BCN-OX-201");
      const s = await portal.enrollSubject(ctx(actor), { study_id: study._id, prefix });
      return { subject_id: s._id, subject_code: s.subject_code };
    },
    async recordVisit(actor, { subject, kind }) {
      const portal = await portalP;
      const v = await portal.recordVisit(ctx(actor), { subject_id: subject, visit_kind: kind });
      return { visit_id: v._id };
    },
    async signOut(actor) {
      const portal = await portalP;
      await portal.logout(ctx(actor));
      return {};
    },
    async close() { const portal = await portalP; await portal.close(); },
  };
}
