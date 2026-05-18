// Seed script — idempotent, safe to re-run.
//
// Step 2: actors + permission_grants.
// Step 10: five demo chains covering all chain states.
//
// Usage: deno task seed

import { db, tx } from "./client.ts";
import {
  initiate_chain,
  approve_step,
  reject_step,
  withdraw_chain,
} from "../domain/chain.ts";

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// Actors
// Per BUILD_PLAN.md §11. credential_secret is a stand-in HMAC key; in a
// real deployment this would be a proper secret — not hardcoded.
// ---------------------------------------------------------------------------

const actors = [
  // Application actor — used for chain_resolved / cascade_completed audit
  // attribution. No permission grants; its writes are application-initiated.
  {
    actor_ref: "system@demo",
    kind: "application",
    display_name: "System (Demo)",
    credential_public: "pub_system_demo",
    credential_secret: "sec_system_demo_hmac_key_32bytes!",
  },

  // SOX journal-entry walkthrough
  {
    actor_ref: "controller_morgan",
    kind: "human",
    display_name: "Morgan (Controller)",
    credential_public: "pub_controller_morgan",
    credential_secret: "sec_controller_morgan_hmac_32b!!",
  },
  {
    actor_ref: "finance_director_chen",
    kind: "human",
    display_name: "Chen (Finance Director)",
    credential_public: "pub_finance_director_chen",
    credential_secret: "sec_finance_director_chen_32by!!",
  },
  {
    actor_ref: "cfo_park",
    kind: "human",
    display_name: "Park (CFO)",
    credential_public: "pub_cfo_park",
    credential_secret: "sec_cfo_park_hmac_key_32bytes!!!",
  },
  {
    actor_ref: "ceo_walsh",
    kind: "human",
    display_name: "Walsh (CEO)",
    credential_public: "pub_ceo_walsh",
    credential_secret: "sec_ceo_walsh_hmac_key_32bytes!!",
  },

  // FDA Part 11 batch-release walkthrough
  {
    actor_ref: "qa_manager",
    kind: "human",
    display_name: "QA Manager",
    credential_public: "pub_qa_manager",
    credential_secret: "sec_qa_manager_hmac_key_32bytes!",
  },
  {
    actor_ref: "qp_santos",
    kind: "human",
    display_name: "Santos (QP)",
    credential_public: "pub_qp_santos",
    credential_secret: "sec_qp_santos_hmac_key_32bytes!!",
  },
  {
    actor_ref: "qp_lopez",
    kind: "human",
    display_name: "Lopez (QP)",
    credential_public: "pub_qp_lopez",
    credential_secret: "sec_qp_lopez_hmac_key_32bytes!!!",
  },
  {
    actor_ref: "qp_kim",
    kind: "human",
    display_name: "Kim (QP)",
    credential_public: "pub_qp_kim",
    credential_secret: "sec_qp_kim_hmac_key_32bytes!!!!",
  },

  // ICH GCP deviation walkthrough
  {
    actor_ref: "coordinator_lee",
    kind: "human",
    display_name: "Lee (Coordinator)",
    credential_public: "pub_coordinator_lee",
    credential_secret: "sec_coordinator_lee_hmac_32by!!",
  },
  {
    actor_ref: "pi_okafor",
    kind: "human",
    display_name: "Okafor (PI)",
    credential_public: "pub_pi_okafor",
    credential_secret: "sec_pi_okafor_hmac_key_32bytes!",
  },
  {
    actor_ref: "pi_chen",
    kind: "human",
    display_name: "Wei (PI)",
    credential_public: "pub_pi_chen",
    credential_secret: "sec_pi_chen_hmac_key_32bytes!!!",
  },
  {
    actor_ref: "pi_mueller",
    kind: "human",
    display_name: "Müller (PI)",
    credential_public: "pub_pi_mueller",
    credential_secret: "sec_pi_mueller_hmac_key_32bytes!",
  },
  {
    actor_ref: "pi_singh",
    kind: "human",
    display_name: "Singh (PI)",
    credential_public: "pub_pi_singh",
    credential_secret: "sec_pi_singh_hmac_key_32bytes!!!",
  },
];

// ---------------------------------------------------------------------------
// Permission grants
// Per BUILD_PLAN.md §11:
//   - controller_morgan, qa_manager, coordinator_lee → initiate + withdraw
//   - all human actors → read
//   - system@demo → no grants (application actor, not human)
// ---------------------------------------------------------------------------

const initiators = ["controller_morgan", "qa_manager", "coordinator_lee"];
const humanActors = actors
  .filter((a) => a.kind === "human")
  .map((a) => a.actor_ref);

tx(() => {
  const insertActor = db.prepare(`
    INSERT OR IGNORE INTO actor
      (actor_ref, kind, display_name, credential_public, credential_secret, registered_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const a of actors) {
    insertActor.run(
      a.actor_ref,
      a.kind,
      a.display_name,
      a.credential_public,
      a.credential_secret,
      now,
    );
  }

  const insertGrant = db.prepare(`
    INSERT OR IGNORE INTO permission_grant
      (actor_ref, scope, granted_at, granted_by)
    VALUES (?, ?, ?, ?)
  `);

  // initiate + withdraw grants
  for (const ref of initiators) {
    insertGrant.run(ref, "chains:initiate", now, "system@demo");
    insertGrant.run(ref, "chains:withdraw", now, "system@demo");
  }

  // read grants for all humans
  for (const ref of humanActors) {
    insertGrant.run(ref, "chains:read", now, "system@demo");
  }
});

// ---------------------------------------------------------------------------
// Step 10 — Demo chains
//
// Five chains covering every visible state:
//   1. SOX journal entry       — all-of-N,   Pending (1 of 3 approved)
//   2. FDA batch release       — M-of-N(2),  Approved (qp_kim trailing-Pending)
//   3. ICH GCP deviation       — one-of-N,   Pending (all steps active in in-tray)
//   4. Q3 reconciliation draft — all-of-N,   Withdrawn (initiator pulled it)
//   5. FDA batch B108 recall   — all-of-N,   Rejected (one QP rejected)
//
// Idempotent: skipped if any chain already exists.
// ---------------------------------------------------------------------------

/** Unwrap result or throw with a descriptive label. */
function mustOk<T>(result: { ok: T } | { err: string }, label: string): T {
  if ("err" in result) throw new Error(`Seed [${label}]: ${result.err}`);
  return result.ok;
}

/** Return the step_id for the given approver within a chain. */
function stepFor(chain_id: string, approver_ref: string): string {
  const row = db.prepare(
    "SELECT step_id FROM approval_step WHERE chain_id = ? AND approver_ref = ?",
  ).get(chain_id, approver_ref) as { step_id: string } | undefined;
  if (!row) throw new Error(`No step for ${approver_ref} in chain ${chain_id}`);
  return row.step_id;
}

const existingChains = (
  db.prepare("SELECT COUNT(*) as n FROM chain").get() as { n: number }
).n;

if (existingChains > 0) {
  console.log(`  Chains:            (already seeded — ${existingChains} chains, skipping)`);
} else {
  // 1. SOX journal entry — all-of-N; cfo_park approves; chain stays Pending
  const sox = mustOk(
    initiate_chain({
      actor_ref:        "controller_morgan",
      subject_ref:      "Q4-journal-entry-v1",
      scope:            "sox-annual-close",
      approver_set:     ["finance_director_chen", "cfo_park", "ceo_walsh"],
      quorum_kind:      "all-of-N",
      reason:           "Q4 close — requires Controller, CFO, and CEO sign-off under SOX §302.",
      retention_policy: "sox_7_year",
    }),
    "initiate SOX chain",
  );
  mustOk(
    approve_step(
      "cfo_park", sox.chain_id,
      stepFor(sox.chain_id, "cfo_park"),
      "P&L entries reviewed. Amounts reconcile to general ledger.",
    ),
    "cfo_park approve",
  );

  // 2. FDA batch release — M-of-N(2); qp_santos + qp_lopez approve → Approved
  //    qp_kim's step is trailing-Pending with assignment recalled
  const fda = mustOk(
    initiate_chain({
      actor_ref:        "qa_manager",
      subject_ref:      "batch-2025-B117",
      scope:            "fda-batch-release",
      approver_set:     ["qp_santos", "qp_lopez", "qp_kim"],
      quorum_kind:      "M-of-N",
      quorum_m:         2,
      reason:           "Batch B117 release — any 2 of 3 QPs required per SOP-QC-004.",
      retention_policy: "fda_part_11_predicate_rule",
    }),
    "initiate FDA chain",
  );
  mustOk(
    approve_step(
      "qp_santos", fda.chain_id,
      stepFor(fda.chain_id, "qp_santos"),
      "Analytical results reviewed. All specifications met.",
    ),
    "qp_santos approve",
  );
  mustOk(
    approve_step(
      "qp_lopez", fda.chain_id,
      stepFor(fda.chain_id, "qp_lopez"),
      "Microbiological data reviewed. No objections.",
    ),
    "qp_lopez approve",
  );

  // 3. ICH GCP deviation — one-of-N; fully Pending
  //    All four PIs have Active assignments → in-tray demo
  mustOk(
    initiate_chain({
      actor_ref:        "coordinator_lee",
      subject_ref:      "protocol-deviation-2025-003",
      scope:            "ich-gcp-deviation",
      approver_set:     ["pi_chen", "pi_okafor", "pi_mueller", "pi_singh"],
      quorum_kind:      "one-of-N",
      reason:           "Unplanned deviation from v3.1 §7.2 — any lead PI may approve.",
      retention_policy: "ich_e6_tmf",
    }),
    "initiate ICH chain",
  );

  // 4. Q3 reconciliation draft — all-of-N; initiator withdraws → Withdrawn + cascade
  const withdrawn = mustOk(
    initiate_chain({
      actor_ref:        "controller_morgan",
      subject_ref:      "Q3-reconciliation-draft",
      scope:            "sox-annual-close",
      approver_set:     ["finance_director_chen", "cfo_park"],
      quorum_kind:      "all-of-N",
      reason:           "Q3 reconciliation — draft only, submitted for early review.",
      retention_policy: "sox_7_year",
    }),
    "initiate withdrawn chain",
  );
  mustOk(
    withdraw_chain(
      "controller_morgan", withdrawn.chain_id,
      "Draft superseded by amended figures. Resubmitting as Q3-v2.",
    ),
    "withdraw chain",
  );

  // 5. FDA batch B108 recall — all-of-N; qp_santos rejects → Rejected + cascade
  //    qp_kim's step becomes trailing-Pending with assignment recalled
  const rejected = mustOk(
    initiate_chain({
      actor_ref:        "qa_manager",
      subject_ref:      "batch-2025-B108-recall",
      scope:            "fda-batch-release",
      approver_set:     ["qp_santos", "qp_kim"],
      quorum_kind:      "all-of-N",
      reason:           "Batch B108 recall authorisation — both QPs must sign.",
      retention_policy: "fda_part_11_predicate_rule",
    }),
    "initiate rejected chain",
  );
  mustOk(
    reject_step(
      "qp_santos", rejected.chain_id,
      stepFor(rejected.chain_id, "qp_santos"),
      "Batch records incomplete — deviation report missing. Cannot authorise.",
    ),
    "qp_santos reject",
  );

  const chainCount = (
    db.prepare("SELECT COUNT(*) as n FROM chain").get() as { n: number }
  ).n;
  const auditCount = (
    db.prepare("SELECT COUNT(*) as n FROM audit_event").get() as { n: number }
  ).n;
  console.log(`  Chains:            ${chainCount}`);
  console.log(`  Audit events:      ${auditCount}`);
}

// Verify
const actorCount = db.prepare("SELECT COUNT(*) as n FROM actor").get<{ n: number }>()!;
const grantCount = db.prepare("SELECT COUNT(*) as n FROM permission_grant").get<{ n: number }>()!;

console.log(`✓ Seed complete`);
console.log(`  Actors:            ${actorCount.n}`);
console.log(`  Permission grants: ${grantCount.n}`);
