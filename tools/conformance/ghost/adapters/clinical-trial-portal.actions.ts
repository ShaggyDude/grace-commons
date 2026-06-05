// tools/conformance/ghost/adapters/clinical-trial-portal.actions.ts
//
// Render-1 ACTIONS ADAPTER — maps the scenario's spec-vocabulary verbs onto
// render 1's composition layer. The ghost analog of the validator's render
// adapter: the only render-specific piece. A render 2 supplies its own.
//
// Run with Deno (imports the demo's jsr deps). It is exercised by ghost/run.ts.
//
// ⚠ UNVERIFIED IN-SANDBOX (jsr.io firewalled where this was written). It is a
// thin, mechanical re-expression of the exact composition calls the proven
// flow.ts already ran successfully, so confidence is high — but your first run
// on a Deno box is its test. Fixes land here, never in the demo.

import { openDb, type Ctx } from "../../../../demos/clinical-trial-portal/lib/db.ts";
import * as composition from "../../../../demos/clinical-trial-portal/composition.ts";
import * as permissions from "../../../../demos/clinical-trial-portal/domain/permissions.ts";

export default function createActions({ dbPath }: { dbPath: string }) {
  const db = openDb(dbPath);
  // Per-actor context: authenticate / onboard establish it; other verbs reuse it.
  const ctxByActor = new Map<string, Ctx>();
  const ctx = (actor: string): Ctx => {
    if (!ctxByActor.has(actor)) ctxByActor.set(actor, { db, actor: null, session: null });
    return ctxByActor.get(actor)!;
  };

  return {
    async authenticate(actor: string, { email, password }: { email: string; password: string }) {
      const c = ctx(actor);
      const r = await composition.login(c, { email, password });
      if (!r.ok) throw new Error(`authenticate(${actor}): ${r.reason}`);
      return { actor_id: c.actor!.id };
    },

    invite(actor: string, { email, display_name, role }: { email: string; display_name: string; role: string }) {
      const inv = composition.issueInvitation(ctx(actor), { email, display_name, intended_role: role });
      return { invitation_id: inv.id, token: inv.token };
    },

    async onboard(actor: string, { token, password }: { token: string; password: string }) {
      const { actor: a } = await composition.acceptInvitation(ctx(actor), { token, password });
      return { actor_id: a.id };
    },

    grant(actor: string, { grantee, capability, scope }: { grantee: number; capability: string; scope?: "all" | "own" }) {
      const perm = permissions.getByCode(db, capability);
      if (!perm) throw new Error(`grant: unknown capability '${capability}'`);
      const g = composition.grantPermission(ctx(actor), {
        grantee_actor_id: grantee,
        permission_id: perm.id,
        scope: scope ?? "all",
      });
      return { grant_id: g.id };
    },

    revokeGrant(actor: string, { grant, reason }: { grant: number; reason: string }) {
      composition.revokeGrant(ctx(actor), { grant_id: grant, reason });
      return {};
    },

    enrollSubject(actor: string, { prefix }: { prefix: string }) {
      const study = db
        .prepare("SELECT id FROM studies WHERE protocol_number = ?")
        .get<{ id: number }>("BCN-OX-201");
      if (!study) throw new Error("enrollSubject: study BCN-OX-201 not found — store seeded?");
      const s = composition.enrollSubject(ctx(actor), { study_id: study.id, prefix });
      return { subject_id: s.id, subject_code: s.subject_code };
    },

    recordVisit(actor: string, { subject, kind }: { subject: number; kind: string }) {
      const v = composition.recordVisit(ctx(actor), { subject_id: subject, visit_kind: kind });
      return { visit_id: v.id };
    },

    signOut(actor: string) {
      composition.logout(ctx(actor));
      return {};
    },

    close() {
      db.close();
    },
  };
}
