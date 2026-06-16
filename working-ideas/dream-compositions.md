# Dream compositions — ideation over the existing atom inventory (2026-06-12)

> **Status: internal staging, not canonical.** Brainstorm output from a Cowork session sweep of the 27 grounded atoms and 24 grounded compositions. Nothing here is proposed, sequenced, or counted; each candidate is gate-sketched (pressure-testing.md §the three gates) but has had no pass run against it. This file dies into `roadmap.md` proposals for whichever candidates the author promotes, and into the trash for the rest.

Selection bias, deliberate: candidates favor underused atoms (Clinical Observation, Medication Order, Capability, Provenance, Capacity Constraint Enforcement), substrate reuse, cross-domain reach in the C12 mold (one structure, several regulator-shaped domains), and emergent invariants with obvious formal-layer shapes.

---

## 1. Break-Glass Access

**Composes:** Permissions + Capability + Session + Notification Fanout (substrate) + Audit Trail (substrate).

**The idea.** Exceptional access as a first-class surface rather than a hole: an operator invokes break-glass and receives a time-boxed Capability minted *outside* the normal grant path — but the mint is gated on sealed attribution landing first, fan-out notification to the oversight set is atomic with the mint, and expiry is a derived predicate (no sweeper — the capability *is* expired by definition when the window passes).

**Emergent invariants (no constituent owns these):**
- *Attested exceptional access* — no break-glass act without a prior, sealed, attributed mint record (attest-before-access; the attributed-permissions-admin geometry pointed at the override path).
- *No silent override* — the oversight fanout is part of the mint's atomicity surface; an unnotified override is structurally impossible, not procedurally discouraged.
- *Mandatory post-hoc review* — every break-glass window closes into a pending Approval Step; an expired-unreviewed window escalates. (The escalation deadline wants the forthcoming **Regulatory Deadline** atom — second consumer, strengthens its recurrence case.)

**Domains:** HIPAA emergency access (legally *required* to exist, rarely accountable), SRE production break-glass, financial ops overrides, court-sealed-record emergency unsealing.

**Formal shape:** TLA+ interleaving — no `access` event without prior `mint+seal`; buggy twin: access lands before the seal write.

---

## 2. Delegation with Recall

**Composes:** Permissions + Capability + Actor Identity (+ Session).

**The idea.** Authority delegated person-to-person, time-boxed, possibly re-delegated — with recall that forward-closes the *entire chain*. Delegation records reference their parent grant; the chain is derived state (transitive closure over existing records), never stored.

**Emergent invariants:**
- *Chain integrity* — no live delegated authority whose root (or any ancestor) is revoked: recall is transitive forward closure, the C17 cascade generalized from one hop to chains.
- *Dual attribution* — every delegated act is attributed to both the acting principal and the granting chain (pairing-map geometry, two columns).

**Domains:** power of attorney, OAuth on-behalf-of, covering physician, corporate signing authority, ship's-master delegation.

**Formal shape:** Alloy — transitive closure (`^parent`) over grant records; injectivity of the delegation pairing; check that revocation of any ancestor empties the live descendant set. (The first composition whose model *needs* `^` — worth doing for that alone.)

---

## 3. Closed-Loop Medication Administration

**Composes:** Medication Order + Clinical Observation + Approval Step + Authenticated Actor (substrate) + Audit Trail (substrate).

**The idea.** The eMAR/BCMA loop: order → pharmacist verification (Approval Step) → administration, where the administration action atomically reads order status + verification + a named contraindication predicate over Clinical Observations, and writes the attributed administration event paired to the order.

**Emergent invariants:**
- *No administration without a live verified order* — order revocation/expiry forward-closes the administration surface (C17's cascade pointed at a clinical act).
- *Administration ⇔ order pairing* — every administration event pairs to exactly one order line it discharges (binding-bijection family).
- *Observation-gated administration* — when the deployment declares a contraindication predicate (e.g., "hold if systolic < 90"), administration is blocked while the predicate fails, read atomically with the act.

**Domains:** hospital eMAR (Joint Commission / FDA), corrections medication logs, veterinary, clinical-trial dosing compliance. First composition to use both healthcare atoms; the healthcare flagship the way C12 is the custody flagship.

**Formal shape:** TLA+ — interleaving of order revocation vs. administration (the TOCTOU twin writes itself).

---

## 4. Recall & Containment

**Composes:** Provenance + Notification Fanout (substrate) + Legal Hold + Soft Delete.

**The idea.** A defective artifact is quarantined: the quarantine forward-closes new custody/issuance events, places preservation on the existing records (Legal Hold — evidence, not erasure), and notifies every downstream holder — where "every downstream holder" is *derived from the Provenance chain*, not from a maintained list.

**Emergent invariants:**
- *Containment completeness* — the notified set provably covers the custody-derived holder set (coverage-totality, C7's no-silent-omission shape). This is **Completeness Model**-shaped — second consumer after C7/C8, which is exactly the recurrence evidence that forthcoming atom needs.
- *No custody after quarantine* — provenance append for the quarantined artifact is forward-closed except for the recall-return path.

**Domains:** pharma batch recall (FDA 21 CFR 7), food safety (FSMA 204 traceability), package-registry yank / vulnerable-dependency containment, breached-data notification.

**Formal shape:** TLA+ coverage totality + a twin that drops one holder.

---

## 5. Maker-Checker Disjointness

**Composes:** Multi-Party Approval (substrate) + Actor Identity + Assignment.

**The idea.** Segregation of duties as a *proven cross-store property* rather than a policy: for any subject, the approver set and the maker set (actors attributed to the subject's creation or benefit) are disjoint — derived from attestation records, not from role labels.

**Emergent invariants:**
- *Maker ∉ checkers, per subject, by attribution* — pool disjointness, which is Invariant 7's geometry lifted to the human layer. (The Alloy model is nearly a rename of attributed-permissions-admin's.)
- *Disjointness at decision time* — checked against the attribution store when the approval lands, not when the approver was assigned (TOCTOU-honest).

**Domains:** SOX payment release, journal peer review, grant adjudication, code-review-before-merge. Cheap to gate — small delta over MPA — with outsized regulator resonance.

---

## 6. Consent-Scoped Observation

**Composes:** Consent + Clinical Observation + Selective Disclosure + Retention Window.

**The idea.** Data collection under living consent: every observation is stamped to the consent epoch that authorized its purpose; withdrawal forward-closes *new* collection without invalidating lawfully-collected priors; every disclosure of observations is scope-gated against the consent state at disclosure time.

**Emergent invariants:**
- *Epoch stamping* — observation ⇔ then-Active consent pairing for the purpose (pairing-map family).
- *Withdrawal boundary* — post-withdrawal observations for that purpose are structurally impossible; pre-withdrawal observations remain, with the boundary auditable from records alone.
- *Disclosure scope conformance* — no disclosure event whose scope exceeds the consent's at its `recorded_at`.

**Domains:** clinical trials (21 CFR 50, GDPR Art. 9), biobanks, wearables / real-world-evidence pipelines, school-records research consent (FERPA).

---

## 7. Saga / Compensable Workflow *(added 2026-06-15)*

**Composes:** Workflow / State Machine + Event Log (+ Audit Trail substrate); the compensating-action primitive (sub-atomic — the same one Undo History uses).

**The idea.** A forward sequence of local steps, each paired with a compensating action; on failure or cancel, completed steps are compensated in reverse — eventual all-or-nothing without a distributed transaction. It is the **external-side-effect complement of Undo History**: Undo reverses by *replay-skip* (which works only when actions have no external effects), and Undo's own Edge-cases section names the boundary where that fails — *"actions with external side effects — sending emails, charging cards — where the side effect is not reversible by skipping the event."* That boundary *is* the saga: it reverses by an explicit compensating action (charge→refund, reserve→cancel) precisely because the effect escaped the log. Same skeleton (durable step log + all-or-nothing-ish guarantee), opposite reversal mechanism. Saga position is derived from the step/compensation log — no new state. The durable-execution engine and choreography-vs-orchestration are **realization, below the contract** (a saga is one of the named realizations of the distributed-atomicity obligation — `outbound-contract-ports.md`: DB tx / saga / queue); the steps, compensation pairings, and the guarantee are the composition.

**Emergent invariants (no constituent owns these):**
- *All-or-compensated* — no completed step's effect survives an abort uncompensated (eventual all-or-nothing). The load-bearing claim.
- *Single terminal outcome* — a saga ends committed or fully compensated, never stuck partial.
- *Idempotency under retry* — durable execution replays and retries, so steps and compensations must be idempotent (the invariant Temporal surfaces most sharply).

**Domains:** order processing, travel booking, financial transfers, supply-chain fulfilment, healthcare order sets — and the saga-shaped flows in Temporal, Odoo, ERPNext.

**Formal shape:** TLA+ interleaving — *all-or-compensated* over every failure interleaving; buggy twin: a saga that skips a compensation, leaving a completed step's effect alive after abort (the exact analog of Undo History's twins). A second twin breaks idempotency (a compensation that double-applies under retry).

**Relation / gate-3 question.** Adjacent to **Stateful Workflow Execution** (already grounded) — Saga ≈ that, wired for failure-compensation. Open gate-3: does the domain layer (steps + compensation pairings + guarantee) earn a *canonical composition spec*, or is it just "declare the all-or-compensated obligation and let the projector realize it"? Hunch: it earns a spec — compensation *semantics* are domain-meaningful (a refund is a domain act, unlike pure atomicity).

**Recovery 2026-06-15 (Temporal Java SDK `io.temporal.workflow.Saga`) — decomposition confirmed.** `addCompensation(op, args…)` registers a compensation *closure* (the sub-atomic primitive, not an atom); the Saga's compensation list is **replayed from Temporal's event history**, not independently durable (no non-derivable state → composition, not atom); `compensate()` runs the registered compensations **LIFO / reverse order** by default (the emergent advance-or-compensate verb + the undo-in-reverse semantics); `parallelCompensation` (and the continue-on-error knob) are *realization* options below the contract. The third invariant surfaced exactly as predicted — **idempotency under retry** (the engine replays the workflow and retries activities, so steps *and* compensations must be idempotent). **Gate-3 call: earns a spec** — the external-side-effect complement of Undo History, carrying *all-or-compensated* + *idempotency-under-retry*, with the durable-execution engine staying below the contract. Saturation holds: no new primitive (Workflow + Event Log + sub-atomic compensation + two emergent invariants). Confidence: the **layer split is now empirically dispositive.** The Temporal *server* (local clone, Go, 2,718 files: history / matching / worker / persistence) owns **no saga and no user-facing compensation primitive** — the engine is domain-blind durable execution (event history, replay, activity retries), so saga/compensation cannot be engine-level mechanism; they are composition/SDK-level, assembled from the engine's primitives. (Tell: even Temporal's *own* internal compensation lives in a worker-deployment *workflow*, not the engine.) Both remaining slivers now closed from local clones. (1) **Literal `sdk-java/.../Saga.java` read** confirms the decomposition exactly: the class holds an in-memory `List` of compensation *closures*, with **durability coming from workflow replay** (the class has zero persistence — so no non-derivable state → composition, not atom); `compensate()` runs them **LIFO / reverse** by default; `parallelCompensation` and `continueWithError` are realization knobs. The abstraction is ~40 lines of logic — the other ~280 are `addCompensation` arity overloads — i.e. trivially thin. (2) The **TS SDK has no `Saga` abstraction** in source (only an incidental test mention): 3 of 4 SDKs leave saga as a hand-rolled try/catch + compensation-array *pattern*. That cross-SDK variance *confirms* saturation — saga is too thin to merit a class. Gate-3, refined: it earns a spec, but the spec's load-bearing content is the **invariants** (all-or-compensated + idempotency-under-retry) and the external-effect-compensation discipline — the runner itself is generic/domain-blind, exactly like Undo History's replay mechanism. Confidence: source-grounded across the server + both SDKs (~95%+). Source: Grok saga writeup + this recovery (Temporal server + sdk-java + sdk-typescript source).

---

## Bench (one-liners, weaker or narrower)

- **Capacity-Held Admission** — Provisional Commitment + Capacity Constraint Enforcement + Assignment: conservation under interleaving (holds + confirmed ≤ cap at every instant); beds/ICU/quota. Solid, but closer to Reservation Lifecycle than a new flagship.
- **Invitation-Gated Enrollment with Expiry Hygiene** — Invitation + Party Identity + Duplicate Prevention: one live invitation per invitee per context, acceptance mints exactly one identity; mostly covered by External Onboarding's neighborhood.
- **Attested Configuration Change** — Approval Step + Event Log + Tamper Evidence: change-management with sealed approvals; real demand (SOC 2), but possibly Audit Trail + MPA already compose to it — needs a Gate 2 check before it earns a row.

---

## Gate posture (summary)

All seven lead candidates are wiring over existing atoms (Gate 3: every "chain," "holder set," "epoch," and saga position above is derived from constituent records — no new state machine; where a candidate wants new state, it instead names the forthcoming atom that owns it). Each names emergent must-be-trues no constituent owns (Gate 2). Gate 1 recurrence is sketched via the cross-domain instances and, twice, by feeding existing forthcoming-atom cases (Regulatory Deadline, Completeness Model) a second consumer. Saga (#7, added 2026-06-15) fits the same posture with one wrinkle: it is also a *realization* of an already-named obligation (distributed atomicity), so its gate-3 question is sharper — composition vs. below-the-contract realization — to be settled on a Temporal concept-recovery run.
