// tools/conformance/ghost/adapters/clinical-trial-portal-next.actions.mjs
//
// Render-2 ACTIONS ADAPTER — maps the SAME scenario verbs onto render 2's ops.
// Pure Node (render 2 is jsr-free), so the whole ghost flow runs in-process.
// Together with the render-2 validator adapter, this is all render 2 needs to
// join the conformance + agreement pipeline: two small adapters, no new evaluators.

import { open } from "../../render2/portal.mjs";

export default function createActions({ dbPath }) {
  const portal = open(dbPath);
  const ctxByActor = new Map();
  const ctx = (actor) => {
    if (!ctxByActor.has(actor)) ctxByActor.set(actor, { account_id: null, token_id: null });
    return ctxByActor.get(actor);
  };

  return {
    authenticate(actor, { email, password }) {
      const r = portal.authenticate(ctx(actor), { email, password });
      if (!r.ok) throw new Error(`authenticate(${actor}): rejected`);
      return { actor_id: r.account_id };
    },
    invite(actor, { email, display_name, role }) {
      const r = portal.invite(ctx(actor), { email, full_name: display_name, role });
      return { invitation_id: r.invite_id, token: r.value };
    },
    onboard(actor, { token, password }) {
      const r = portal.onboard(ctx(actor), { value: token, password });
      return { actor_id: r.account_id };
    },
    grant(actor, { grantee, capability, scope }) {
      const r = portal.grant(ctx(actor), { holder_id: grantee, capability_code: capability, scope });
      return { grant_id: r.grant_id };
    },
    revokeGrant(actor, { grant, reason }) {
      portal.rescind(ctx(actor), { grant_id: grant, note: reason });
      return {};
    },
    enrollSubject(actor, { prefix }) {
      const r = portal.enroll(ctx(actor), { prefix });
      return { subject_id: r.participant_id, subject_code: r.code };
    },
    recordVisit(actor, { subject, kind }) {
      const r = portal.encounter(ctx(actor), { participant_id: subject, kind });
      return { visit_id: r.encounter_id };
    },
    signOut(actor) {
      portal.signOut(ctx(actor));
      return {};
    },
    close() { portal.close(); },
  };
}
