// tools/conformance/ghost/adapters/clinical-trial-portal-nextjs.actions.mjs
//
// The actions adapter for render 5 (Next.js + Postgres / pglite). The ghost-flow
// runner drives the render-agnostic full-lifecycle scenario through this; each
// spec-vocabulary verb maps to one of the portal's server actions. The adapter
// keeps per-actor context (a logged-in session token per handle) the way a
// browser keeps a session cookie per tab — `authenticate` and `onboard`
// establish a handle's session; later steps for that handle reuse it.

import { getDb, closeDb } from "../../render5/db.mjs";
import { seed } from "../../render5/seed.mjs";
import {
  signIn, signOut, issueInvite, claimInvite,
  issueAuthority, withdrawAuthority, enrollSubject, recordVisit,
} from "../../render5/portal.mjs";

export default async function createActions({ dbPath }) {
  const db = await getDb(dbPath);
  await seed(db);

  // handle -> { actor_id, session_token }
  const ctxByHandle = new Map();

  function sessionFor(handle) {
    const c = ctxByHandle.get(handle);
    if (!c) throw new Error(`actor handle '${handle}' has no session (authenticate/onboard first)`);
    return c.session_token;
  }

  return {
    async authenticate(handle, { email, password }) {
      const r = await signIn(db, { email, password });
      ctxByHandle.set(handle, { actor_id: r.actor_id, session_token: r.session_token });
      return { actor_id: r.actor_id };
    },

    async invite(handle, { email, display_name, role }) {
      const r = await issueInvite(db, {
        sessionToken: sessionFor(handle), email, display_name, role,
      });
      return { invitation_id: r.invitation_id, token: r.token };
    },

    async onboard(handle, { token, password }) {
      const r = await claimInvite(db, { token, password });
      // The onboarding burst opens the new actor's first session; the handle
      // adopts it, so this newly-onboarded actor can act in later steps.
      ctxByHandle.set(handle, { actor_id: r.actor_id, session_token: r.session_token });
      return { actor_id: r.actor_id };
    },

    async grant(handle, { grantee, capability, scope }) {
      const r = await issueAuthority(db, {
        sessionToken: sessionFor(handle), grantee, capability, scope,
      });
      return { grant_id: r.grant_id };
    },

    async revokeGrant(handle, { grant, reason }) {
      await withdrawAuthority(db, { sessionToken: sessionFor(handle), grant, reason });
      return {};
    },

    async enrollSubject(handle, { prefix }) {
      const r = await enrollSubject(db, { sessionToken: sessionFor(handle), prefix });
      return { subject_id: r.subject_id, subject_code: r.subject_code };
    },

    async recordVisit(handle, { subject, kind }) {
      const r = await recordVisit(db, { sessionToken: sessionFor(handle), subject, kind });
      return { visit_id: r.visit_id };
    },

    async signOut(handle) {
      await signOut(db, { sessionToken: sessionFor(handle) });
      return {};
    },

    async close() {
      await closeDb(dbPath);
    },
  };
}
