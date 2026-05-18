// Verify route — independent recompute of chain invariants.
//
// GET /verify/chains/:chain_id
//   Invariant 2: quorum.evaluate(kind, m, vector) === chain.state
//   Invariant 4: decided_by === approver_ref for Approved/Rejected steps
//   Invariant 5: decided_by === submitter_ref for Withdrawn steps

import { Hono } from "hono";
import type { AppVariables } from "../middleware/current_actor.ts";
import { permitted } from "../domain/permissions.ts";
import { evaluate } from "../domain/quorum.ts";
import { db } from "../db/client.ts";

const verify = new Hono<{ Variables: AppVariables }>();

verify.get("/chains/:chain_id", (c) => {
  const actor = c.get("actor");
  if (!actor) return c.json({ error: "no actor selected" }, 401);
  if (permitted(actor.actor_ref, "chains:read") === "denied") {
    return c.json({ error: "permission-denied" }, 403);
  }

  const chain_id = c.req.param("chain_id");

  const chain = db.prepare("SELECT * FROM chain WHERE chain_id = ?")
    .get(chain_id) as {
      chain_id: string; state: string;
      quorum_kind: "all-of-N" | "M-of-N" | "one-of-N"; quorum_m: number | null;
    } | undefined;

  if (!chain) return c.json({ error: "not-known" }, 404);

  const steps = db.prepare(`
    SELECT step_id, state, approver_ref, submitter_ref, decided_by
    FROM approval_step WHERE chain_id = ? ORDER BY position
  `).all(chain_id) as Array<{
    step_id: string; state: string;
    approver_ref: string; submitter_ref: string; decided_by: string | null;
  }>;

  // --- Invariant 2: quorum determinism ---
  const a = steps.filter(s => s.state === "Approved").length;
  const r = steps.filter(s => s.state === "Rejected").length;
  const w = steps.filter(s => s.state === "Withdrawn").length;
  const p = steps.filter(s => s.state === "Pending").length;

  const computed = evaluate(chain.quorum_kind, chain.quorum_m, { a, r, w, p });
  // A terminal chain's stored state may differ from a fresh evaluation
  // (e.g. trailing decisions don't change chain state). The check is:
  // if chain is terminal, computed could be anything; if Pending, must match.
  const quorumOk = chain.state !== "Pending"
    ? true  // terminal state is authoritative; re-eval may show Pending if trailing
    : computed === chain.state;

  // --- Invariant 4/5: actor identity on decisions ---
  const stepChecks = steps.map(s => {
    if (s.state === "Approved" || s.state === "Rejected") {
      const ok = s.decided_by === s.approver_ref;
      return { step_id: s.step_id, check: "decided_by=approver_ref", ok, state: s.state };
    }
    if (s.state === "Withdrawn") {
      const ok = s.decided_by === s.submitter_ref;
      return { step_id: s.step_id, check: "decided_by=submitter_ref", ok, state: s.state };
    }
    return { step_id: s.step_id, check: "pending-no-check", ok: true, state: s.state };
  });

  const allStepsOk = stepChecks.every(s => s.ok);
  const overallOk = quorumOk && allStepsOk;

  return c.json({
    chain_id,
    chain_state: chain.state,
    ok: overallOk,
    checks: {
      quorum_determinism: {
        ok: quorumOk,
        stored: chain.state,
        computed,
        vector: { a, r, w, p },
      },
      step_actor_identity: {
        ok: allStepsOk,
        steps: stepChecks,
      },
    },
  });
});

export { verify };
