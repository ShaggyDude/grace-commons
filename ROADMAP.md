---
title: Roadmap
nav_order: 6
has_toc: true
toc: true
---

# Roadmap

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> What the library is building toward, in dependency order. Atoms before the compositions that name them. Each entry names what it unlocks.

The library's current state is documented in [`readme.md`](./readme.md). This file records what comes next and why, at the granularity of individual patterns. Priority reflects dependency readiness first, regulatory coverage second — a composition that needs three new atoms is lower priority than one that needs one, regardless of business value, because the blocking atoms must land first.

The topological ordering principle is codified in [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md): atoms before compositions, constituents before the applications that name them. This roadmap is organized accordingly.

---

## Current state — 2026-06-08

**Taxonomy flattened; status reconciled — 2026-06-08.** The `atoms/<category>/` subfolders were dissolved; atoms are stored flat (`atoms/<name>.md`) with classification derived (overlays from the composition graph; `domain` the one intrinsic, EOS-gated axis), and the per-category READMEs replaced by a generated browse-by-overlay catalog (`atoms/index.md`, via `tools/taxonomy/generate_views.py`). Corpus unchanged at **45 grounded patterns (27 atoms, 18 compositions)**; the move was path-safe — all 74 formal models still found and green. This ROADMAP's atom/composition status was then reconciled to reality: the planned-sequence atoms (#7–#14) are all grounded, and the genuine remaining composition backlog is **C6, C7, C11, C15, C17, C18** (all unblocked, none blocked on a missing atom). See [`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md).

**Coverage GAPs closed — 2026-06-04.** The 6 genuine coverage GAPs the inaugural cross-check surfaced (Medication Order Inv 3/4, Credential Inv 7, Legal Hold Inv 6, Provisional Commitment Inv 8, Capacity Constraint Inv 5; plus the Inv 14 reconsideration) are **all closed** — produced by parallel Sonnet subagents, Opus-gated (diff review + independent harness re-run). Medication Order gained an Alloy structural model (`medication-order.als`, mirroring `clinical-observation.als`) covering the pre-dispensing-only + linear-amendment invariants; Credential, Legal Hold, Provisional Commitment, and Capacity Constraint gained TLA+ model extensions (rotation-chain link; two-clock temporal ordering; release/expire transition timestamps; a `release` action making non-negativity non-vacuous). Capacity Constraint Inv 14 (within-action atomicity) was reconsidered to **out-of-scope** (a host obligation, not an action-vs-action interleaving — parallels Party Identity Inv 11). Every vote-named load-bearing invariant across the five patterns now carries a named check **and its own dedicated, checker-rejected buggy twin** — Legal Hold, Provisional Commitment, Capacity Constraint, and (on a 2026-06-04 follow-up audit) Credential each carry a second isolated twin so no previously-covered invariant lost its counterexample when the new check landed. (Credential initially shipped a single combined twin in which the shorter Inv 7 counterexample masked the Inv 2 counterexample; the follow-up split it into `credential-buggy.tla` (Inv 7) and `credential-buggy-toctou.tla` (Inv 2).) The five patterns drop their `formal coverage: Inv N pending` caveat and return to unqualified `grounded`. See [`tools/harness/coverage/README.md`](./tools/harness/coverage/README.md) §Resolution. Harness re-run green: 5 correct models hold, 9 twins rejected.

**Provenance (atom #7) grounded — 2026-06-04.** The first net-new pattern of the sprint: a regulated compliance atom — an append-only single-artifact custody chain whose load-bearing guarantee is **custody continuity** (transfers are hand-to-hand, exactly one current custodian at all times, no gap; the outgoing custodian is read from chain state so a false predecessor cannot be forged). The EOS Pass-2 boundary against Event Log holds (custody continuity is not expressible on a content-agnostic event stream), and the `disclose` overlap with the existing Selective Disclosure atom was extracted as a composing boundary. Sonnet-drafted against an Opus plan, Opus-gated (Pass 1 / 2 / 3 + Final Critique; two foundational + four refining findings closed in-pattern), formal-layer vote YES with an Alloy model ([`provenance.als`](./atoms/provenance.md)) + buggy twin verified in `tools/harness/`. This brings the library to **39 grounded patterns** and **unblocks Chain of Custody (C12)** — the cross-domain pharma↔legal-evidence reference composition — whose remaining constituents (Actor Identity, Tamper Evidence, Retention Window, Audit Trail) are all already grounded.

**Chain of Custody (C12) grounded — 2026-06-04.** Immediately after Provenance, C12 was authored end-to-end (Opus plan → Sonnet draft → Opus gate: Pass 1 / 2 / 3 + Final Critique, two foundational + three refining findings closed → TLA+ binding-bijection model + buggy twin verified in `tools/harness/`). C12 composes **Provenance + Audit Trail (substrate)** — the substrate supplies Actor Identity attribution, Tamper Evidence sealing, and Retention Window governance transitively, so naming Audit Trail satisfies the "+ Actor Identity + Tamper Evidence + Retention Window" requirement per the compositions-of-compositions convention. Its emergent guarantee is **records-alone custody proof** (`verify_custody`): unbroken + attributed + tamper-evident + retention-governed custody from origin to disposition, which neither constituent provides alone. C12 is the library's cross-domain flagship — pharmaceutical (FDA 21 CFR Part 211 / DEA 1304) and legal-evidence (FRE 901(b)(9)) chain of custody are the same structure, one composition serving both — and the **first composition to compose the Provenance atom**. This brings the library to **40 grounded patterns (14 grounded compositions)** and retires the Chain-of-Custody forthcoming-link in Provenance.

**Workflow / State Machine (atom #9) grounded — 2026-06-04.** The general-purpose state-machine primitive: a named instance moving through a deployment-**declared** finite set of states via declared transitions, enforcing only-declared-transitions, exactly-one-current-state, terminal absorption, and a replay-deterministic append-only transition history; it gates (but deliberately does not evaluate) caller-asserted transition guards. EOS boundaries held against Approval Step (the fixed-state sibling — states fixed by the atom vs. declared by the deployment) and Event Log (declared-transition enforcement is not expressible on a content-agnostic stream); guard *evaluation* and a shared-declaration Definition Registry were extracted as composing concerns. Sonnet-drafted against an Opus plan, Opus-gated (one foundational finding — a `fired_at` cross-entry monotonicity rule that contradicted the best-effort-clock claim, relaxed to match Event Log — plus one refining, both closed), formal-layer vote YES with an Alloy model (`workflow-state-machine.als`) + buggy twin verified in `tools/harness/`. This **resolves the `workflow` one-atom open question** (the category now stands on two atoms), **unblocks Stateful Workflow Execution (C10)** — the last composition that was blocked on a remaining atom, so every C-numbered composition is now grounded or unblocked — and brings the library to **41 grounded patterns**.

**Stateful Workflow Execution (C10) grounded — 2026-06-04.** Immediately after Workflow / State Machine, C10 was authored end-to-end (Opus plan → Sonnet draft → Opus gate: Pass 1 / 2 / 3 + Final Critique, one foundational + one refining finding closed → TLA+ approval-gated-transition model + buggy twin verified in `tools/harness/`). C10 composes **Workflow / State Machine + Approval Step + Permissions + Assignment + Audit Trail (substrate)** and is the **first composition to compose the Workflow / State Machine atom**. Its load-bearing emergent property is the precise closure of an atom-level extraction: Workflow / State Machine deliberately gates on a caller-*asserted* `guard_satisfied` without evaluating; C10 **evaluates** approval-type guards by binding each guarded transition to an Approval Step and asserting `guard_satisfied = true` only when that step is genuinely Approved — *guard evaluation re-converges here*. The foundational gate finding (the gate's Approval Step submitter must be the workflow initiator, else the moot-gate cascade is unauthorized under Approval Step Invariant 5) was closed. This brings the library to **42 grounded patterns (15 grounded compositions)** and retires the C10 forthcoming-links in Workflow / State Machine and Approval Step. With it, **every one of the seventeen C-numbered compositions is now grounded or unblocked, and no composition is blocked on a remaining atom.**

**Forensic Recovery (C3) grounded — 2026-06-04.** The deliberately-easy follow-on: Soft Delete + Audit Trail (substrate) — the same atom-plus-substrate template as C12, gated quickly. Every delete/restore/purge is attributed, tamper-evidently sealed, and `recover_history` reconstructs the full ordered lifecycle that Soft Delete's current-state-only summary discards; the headline invariant is *no record is purged without an auditable, sealed record of who/when/why*. EOS boundary held: the purge-*eligibility* gate (Legal Hold / Retention Window) stays with Defensible Retention (C1); C3 records faithfully. The one gate finding — the binding bijection needed its sole-write-path precondition and a verifiability correction (Soft Delete keeps no transition history, so `record_to_events` + the Audit Trail Event Log is authoritative) — was closed. TLA+ binding-bijection model + buggy twin verified. This brings the library to **43 grounded patterns (16 grounded compositions)** and retires the Forensic Recovery forthcoming-links in Soft Delete.

**Consent & Preference Management with Revocation Propagation (C2) grounded — 2026-06-04.** The GDPR consent-lifecycle composition: Consent + Permissions + Audit Trail (substrate) + a distinct consent-record Retention Window placement. Authored end-to-end (Opus-gated: Pass 1 / 2 / 3 + Final Critique, foundational + refining findings closed → TLA+ binding-bijection model + buggy twin verified in `tools/harness/`). Two halves to its emergent guarantee: **consent-gates-processing** (`processing_permitted` is the single gate every processing system consumes, `permitted` iff `Consent.check` → `granted`) and **revocation propagation** (the load-bearing one) — `withdraw_consent` commits the Consent revoke and a `consent.revoked` event enumerating the *complete* downstream processing-scope set the consent governed, together or not at all (the revoke ⇔ complete-propagation-record binding bijection, modeled on `audit-trail.tla` / `forensic-recovery.tla`). EOS Pass 2: Permissions confirmed a constituent (the inward-authorization surface gating administration) rather than a peer, with the inward/outward separation locked as Invariant 7; downstream *cessation* and delivery-shaping preference management (C11) extracted as composing concerns. This brings the library to **44 grounded patterns (17 grounded compositions)** and retires the C2 forthcoming-links in Consent and KYC (C8).

**Reservation Lifecycle (C9) grounded — 2026-06-04.** The pool-aware reservation composition: Capacity Constraint Enforcement + Provisional Commitment + Duplicate Prevention + Event Log + Actor Identity — the pool-arithmetic superset of Idempotent Reservation (which wires Provisional Commitment + Duplicate Prevention but not pool arithmetic). Authored against Idempotent Reservation as the structural template (Opus gate: Pass 1 / 2 / 3 + Final Critique → TLA+ allocation-coherence model + buggy twin verified in `tools/harness/`). The load-bearing emergent guarantee is **allocation coherence** — the pool's `allocated` total stays in exact lockstep with the live-reservation set (Held or Confirmed), within `[0, capacity]` — which the composition owns via the `reservation_to_pool` binding (with a `slot_released` flag): `reserve` allocates-and-holds atomically (compensating release if the hold fails), `confirm_reservation` keeps the slot, `cancel_reservation`/`expire_reservation` return it exactly once. The three reservation-bug failure modes — oversell, slot-leak, double-release — are each foreclosed by a named mechanism. EOS Pass 2: the binding is the emergent concern neither Capacity Constraint (fungible arithmetic, no per-allocation identity) nor Provisional Commitment (per-reservation identity, no pool) owns; Event Log + Actor Identity composed directly (the lighter pairing, Audit Trail named as a peer for litigation-exposed deployments); overbooking (a `capacity` choice) and un-booking (Reversal) extracted. This brings the library to **45 grounded patterns (18 grounded compositions)** and retires the C9 forthcoming-links in Capacity Constraint Enforcement and Provisional Commitment.

**All 38 grounded patterns are now fully `grounded`** following the 2026-06-03 formal-layer vote sweep (aggressive bar), the backlog models landing, and a bar reconsideration. **Coverage cross-check — inaugural sweep (2026-06-04):** all 22 vote-yes models were run through the formal-layer coverage cross-check (`tools/harness/coverage/`, see its README). 14 fully clean; 4 by-construction flags resolved (2 promoted to explicit checks — Event Log Inv 1, Provisional Commitment Inv 3; 2 recorded as deliberate frame properties — Approval Step Inv 9, Medication Order Inv 9); and **6 genuine coverage GAPs across 5 patterns** (Medication Order Inv 3/4, Credential Inv 7, Legal Hold Inv 6, Provisional Commitment Inv 8, Capacity Constraint Inv 5/14) — each a *second* vote-named invariant with partial/no formal coverage, now honestly labeled `formal coverage: Inv N pending` on those patterns' Status lines and queued early-sprint. Not English regressions; the primary load-bearing invariant of each is verified with a rejected twin. **The entire formal-model backlog is complete:** 18 TLA+ models (Opus-authored) and 4 Alloy structural models (Sonnet-drafted, Opus-gated) landed; 3 clock/precedence patterns were reconsidered to English-only (formal-not-warranted). Zero pending. Every model ships a buggy twin the checker rejects as the vacuity guard. Eight backlog models landed (the four high-stakes TLA+ models plus the Med–High tier: Assignment, Medication Order, Preference / Personalization, Approval Step). **Bar reconsideration (2026-06-03):** the aggressive-bar YES on three of the five flagged clock/precedence patterns was downgraded to NO (formal-not-warranted) on a second pass — **Retention Window, Session, Consent** are records-alone/precondition claims a model would only re-confirm, so they return to fully `grounded` English-only; **Provisional Commitment** and **Duplicate Prevention** keep their YES (genuine action-vs-action races — confirm-vs-auto-expiry, concurrent first-record) and remain in the TLA+ queue. See each pattern's Lineage §Formal-layer vote for the per-pattern rationale. KYC / Customer Onboarding (C8) grounded on Final Critique 4 (2026-06-03). **Formal-model backlog progress (2026-06-03):** the four high-stakes TLA+ models are landed — Party Identity (`party-identity.tla`, 532 states clean), Event Log (`event-log.tla`, 119 states), Audit Trail (`audit-trail.tla`, buggy twin shows the non-atomic cascade is unsafe, 9 states), and Capacity Constraint Enforcement (`capacity-constraint-enforcement.tla`, buggy twin shows the TOCTOU race overshoots capacity, 7 states) — each with a buggy twin the checker rejects, all verified via `tools/harness/`; see each pattern's Lineage §Formal model. Remaining lane: the 4 Alloy/structural drafts (Sonnet) and the ~17 lower-stakes TLA+ models (minus any removed by the bar reconsideration). The reproducible dual harness (`tools/harness/`: TLA+ via `tla-checker` WASM, Alloy via the `alloy.dist` jar under an npm-provisioned JRE 17) was stood up and all pre-existing models audited through it — surfacing a never-typechecked assertion in `capability.als` (fixed) and two further findings (see §"Harness audit findings" below). The next move on the atom side is one of the two remaining unstarted planned atoms (#7 Provenance, #9 Workflow / State Machine); on the composition side, one of the nine unblocked-and-unstarted compositions (C2, C3, C6, C7, C9, C11, C15, C17, C18 — see compositions section).

**Formal-layer vote sweep — 2026-06-03.** A formal-layer vote was cast for all 38 grounded patterns per `PRESSURE_TESTING.md §Formal models`. The 13 that remain fully `grounded`: model present (7) — Capability, Attributed Permissions Admin, External Onboarding, Login, Privileged Access Provisioning, Session-Gated Authorization, Multi-Party Approval; voted formal-not-warranted (6) — Actor Identity, Selective Disclosure, Tamper Evidence, Personal Todo, Soft Delete, Notification Fanout. The other 25 voted YES but have no formal model authored yet; they are downgraded to `grounded (English) — formal layer pending` and constitute the model backlog. **Update 2026-06-03:** The **entire formal-model backlog has landed** — all 38 patterns are fully `grounded`. The 18 TLA+ models (the four high-stakes; the Med–High tier Assignment, Medication Order, Preference, Approval Step; the two kept clock candidates Provisional Commitment, Duplicate Prevention; the five remaining High-stakes Credential, Invitation, Idempotent Reservation, Defensible Retention, KYC; and the three Med Legal Hold, Shared Todo, Undo History) plus the 4 Alloy structural models (Permissions, Notification, Subscription, Clinical Observation — Sonnet-drafted, Opus-gated via review + independent buggy-twin run). A bar reconsideration restored three (Retention Window, Session, Consent) to fully `grounded` as English-only. **Zero pending.**

**Formal-model backlog (triage — 2026-06-03).** The 25 pending patterns, classified by property class → tool, with a suggested author by subtlety/stakes. Each model also ships a **buggy twin** (a deliberately-wrong variant the checker must reject) as the vacuity guard, and findings fold back into the canonical English per the conflict protocol. This table is the single home for the tool/author assignment (per DRY, it is deliberately *not* duplicated into each spec's vote entry — the vote entries carry the *why*, the load-bearing invariants).

*Alloy / structural — Sonnet may draft, Opus reviews:*

| Pattern | Tool | Author | Load-bearing property |
|---|---|---|---|
| Permissions ✅ **landed 2026-06-03** | Alloy | Sonnet draft → Opus gate | Active→Revoked monotonicity; terminal absorption — `permissions.als` + buggy twin (revoke drops Active precondition; 2 checks find counterexamples) |
| Notification ✅ **landed 2026-06-03** | Alloy | Sonnet draft → Opus gate | status monotonicity; terminal exclusivity — `notification.als` + buggy twin (timestamp `iff`→`implies`; 5 checks find counterexamples) |
| Subscription ✅ **landed 2026-06-03** | Alloy | Sonnet draft → Opus gate | at-most-one-active per key; no-id-reuse — `subscription.als` + buggy twin (drops at-most-one-active fact; check finds counterexample) |
| Clinical Observation ✅ **landed 2026-06-03** | Alloy | Sonnet draft → Opus gate | linear amendment chains (no branching) — `clinical-observation.als` + buggy twin (`lone`→`set` successor; 2 checks find counterexamples) |

*TLA+ / behavioral — Opus authors (interleaving, ordering, time, cascade):*

| Pattern | Tool | Stakes | Load-bearing property |
|---|---|---|---|
| Party Identity ✅ **landed 2026-06-03** | TLA+ | High | Verified requires passed-after-most-recent-suspend (insertion order) — `party-identity.tla` + buggy twin (re-introduces the F3 defect; rejected at 22 states); 532 states clean |
| Event Log ✅ **landed 2026-06-03** | TLA+ | High (foundational) | append-only + sequence monotonicity — `event-log.tla` + buggy twin (volatile-restart resets seq to 1; rejected at 14 states); 119 states clean |
| Audit Trail ✅ **landed 2026-06-03** | TLA+ | High (substrate) | cascade-on-purge atomicity across 4 stores; honest-destruction — `audit-trail.tla` + buggy twin (non-atomic cascade → dangling partial; rejected at 4 states); 9 states clean |
| Capacity Constraint Enforcement ✅ **landed 2026-06-03** | TLA+ | High | allocated ≤ capacity under serializable concurrency — `capacity-constraint-enforcement.tla` + buggy twin (TOCTOU check-then-commit overshoots to 3>2; rejected at 27 states); 7 states clean |
| Credential ✅ **landed 2026-06-03** | TLA+ | High | active uniqueness under concurrent register — `credential.tla` + buggy twin (TOCTOU register → two Active; rejected at 33 states); 105 states clean |
| Invitation ✅ **landed 2026-06-03** | TLA+ | High | single-resolution atomicity under concurrent accept/decline/revoke — `invitation.tla` + buggy twin (re-resolution override; rejected at 6 states); 5 states clean |
| Idempotent Reservation ✅ **landed 2026-06-03** | TLA+ | High | exactly-once-in-window; unsafe eviction ordering — `idempotent-reservation.tla` + buggy twin (early eviction → double-effect; rejected at 14 states); 17 states clean |
| Defensible Retention ✅ **landed 2026-06-03** | TLA+ | High | hold-blocks-purge (named race); multi-hold independence — `defensible-retention.tla` + buggy twin (purge ignores active hold; rejected at 8 states); 7 states clean |
| KYC / Customer Onboarding (C8) ✅ **landed 2026-06-03** | TLA+ | High | adverse-trigger-precedes-suspend; open-trigger ⇔ Suspended — `kyc-customer-onboarding.tla` + buggy twin (suspend without trigger; rejected at 3 states); 3 states clean |
| Assignment ✅ **landed 2026-06-03** | TLA+ | Med–High | reassign atomicity (no observable both/neither Active) — `assignment.tla` + buggy twin (non-atomic reassign → two-Active window; rejected at 6 states); 47 states clean |
| Medication Order ✅ **landed 2026-06-03** | TLA+ | Med–High | hold carries prior_state; reinstate restores exactly it — `medication-order.tla` + buggy twin (reinstate-to-default; rejected at 11 states); 31 states clean |
| Preference / Personalization ✅ **landed 2026-06-03** | TLA+ | Med–High | supersession atomicity (no observer sees two in-effect) — `preference.tla` + buggy twin (non-atomic supersession → two-in-effect; rejected at 5 states); 32 states clean |
| Approval Step ✅ **landed 2026-06-03** | TLA+ | Med–High | approver/submitter exclusivity; concurrent step independence — `approval-step.tla` + buggy twin (unguarded approve; rejected at 4 states); 16 states clean |
| ~~Consent~~ 🟢 **reconsidered → NO (English-only), 2026-06-03** | — | Med | earlier-terminal-event-wins (revoke vs expiry) — precedence by insertion order; records-alone, no model |
| Legal Hold ✅ **landed 2026-06-03** | TLA+ | Med | concurrent-hold independence/isolation — `legal-hold.tla` + buggy twin (cascading release; rejected at 12 states); 27 states clean |
| ~~Session~~ 🟢 **reconsidered → NO (English-only), 2026-06-03** | — | Med | conjunctive validity; revoked-precedes-expired — conjunction of record fields; interleaving lives in Session-Gated Authorization |
| ~~Retention Window~~ 🟢 **reconsidered → NO (English-only), 2026-06-03** | — | Med (clock) | no-early-purge — single-action time-gated precondition; hold-blocks-purge race lives in Defensible Retention |
| Provisional Commitment ✅ **landed 2026-06-03** | TLA+ | Med (clock) | confirm-within-window (expiry race) — **kept YES**, then modeled: `provisional-commitment.tla` + buggy twin (confirm-after-window; rejected at 10 states); 17 states clean |
| Duplicate Prevention ✅ **landed 2026-06-03** | TLA+ | Med (clock) | single-recording; window monotonicity — **kept YES**, then modeled: `duplicate-prevention.tla` + buggy twin (re-record extends window; rejected at 11 states); 14 states clean. Surfaced + fixed a conflict-protocol case-2 model mis-encoding (lagging flag → derived membership) |
| Shared Todo ✅ **landed 2026-06-03** | TLA+ | Med | cascade-on-delete (recall before delete); at-most-one-responsible — `shared-todo.tla` + buggy twin (delete without recall → dangling assignment; rejected at 4 states); 3 states clean |
| Undo History ✅ **landed 2026-06-03** | TLA+ | Med | visible state = replay of non-undone events; undo targeting — `undo-history.tla` + buggy twin (oldest-first undo; rejected at 6 states); 10 states clean |

Tally (original aggressive bar): ~4 Alloy/Sonnet, ~21 TLA+/Opus. **Final 2026-06-03 state:** all 18 TLA+ models landed (corroborating their English specs; one surfaced a conflict-protocol case-2 model mis-encoding, fixed in the derivation), 3 downgraded to English-only on the bar reconsideration (Retention Window, Session, Consent), leaving only the 4 Alloy/Sonnet structural drafts pending. The bar reconsideration was the right lever, exactly as anticipated here: the clock-based and precedence entries were the defensible "English + records-alone is sufficient" reconsiderations, and three of the five cleared it. Harness is settled (`tools/harness/`), so each model's pass/fail is mechanical.

**Harness chosen — `tools/harness/` (2026-06-03).** One reproducible dual harness, provisioned npm-only (no firewalled downloads): TLA+ via the `tla-checker` WASM checker (extends the original `grants/tla-poc/run.mjs` approach), Alloy via the `org.alloytools.alloy.dist` jar running headless under an npm-provisioned JRE 17 (`javajre-linux-64`; the JRE lives on the native `/tmp` FS because unpacking it into the mounted repo drops `libjli.so`). `node check.mjs <model> [--buggy]` enforces correct-holds / buggy-rejected; `node audit.mjs` runs every model. Each backlog model ships with a buggy twin as the vacuity guard. See `tools/harness/README.md`.

**Harness audit findings (2026-06-03).** All nine pre-existing formal models were run through the new harness. Six were clean (`session-gated-authorization.als`, `attributed-permissions-admin.als`, `login.tla`, `attributedPermissionsAdmin.tla`, `MultiPartyApproval.tla` + buggy twin). Three findings, all in patterns marked `grounded`, all outside the formal-model backlog — logged here for routing:

- **`capability.als` — never-typechecked assertion (fixed).** Line 193 read `r.status = Revoked implies no (r.status = Expired)` — `no` applied to a boolean. The file never typechecked under the CLI, so assertion `A_TerminalModesDistinguishable` was *never actually checked* despite Capability shipping `grounded on Final Critique 4`. Corrected to `r.status != Expired` (case-2 model mis-encoding; English untouched). With it fixed, all 22 `check` assertions now run and hold — but the run surfaced a *second* finding: **4 vacuous `run` commands** (`ShowExhaustionTransition`, `ShowMultiUsePartialRedeem`, `ShowRevokeTransition`, `ShowExpireTransition`) — transition examples with no instance in scope. Needs case-1-vs-2 diagnosis; not hand-patched.
- **`privilegedAccessProvisioning.tla` — not verifiable under the chosen checker.** Its `.cfg` uses `ACTION_CONSTRAINT`, which the WASM checker does not support; the model returns `NoInitialStates` and is effectively unverified by this harness. Resolution is either the official `tla2tools.jar` (a firewalled download, unavailable in-sandbox) or a model rewrite expressing the constraint as an invariant.
- **`externalOnboarding.tla` — low state count.** Passes but explores only 44 states; worth confirming the bounds actually exercise the interleavings the English defends.

**Atoms grounded** (at `grounded` or `grounded (English) — formal layer pending`; see sweep note above)**:**

- `compliance` (13): Actor Identity, Capability, Consent, Credential, Invitation, Legal Hold, Party Identity, Permissions, Provenance, Retention Window, Selective Disclosure, Session, Tamper Evidence
- `healthcare` (2): Clinical Observation, Medication Order
- `messaging` (3): Notification, Preference / Personalization, Subscription
- `productivity` (2): Assignment, Personal Todo
- `resource-lifecycle` (3): Capacity Constraint Enforcement, Provisional Commitment, Soft Delete
- `temporal` (2): Duplicate Prevention, Event Log
- `workflow` (2): Approval Step, Workflow / State Machine

**Atoms partially resolved:** none — Preference / Personalization grounded on Final Critique 5 (2026-05-29); see atom #10 below.

**Compositions grounded** (at `grounded` or `grounded (English) — formal layer pending`; see sweep note above)**:** Attributed Permissions Admin, Audit Trail, Chain of Custody, Consent & Preference Management, Defensible Retention, External Onboarding, Forensic Recovery, Idempotent Reservation, KYC / Customer Onboarding, Login, Multi-Party Approval, Notification Fanout, Privileged Access Provisioning, Reservation Lifecycle, Session-Gated Authorization, Shared Todo, Stateful Workflow Execution, Undo History.

The healthcare atoms (Clinical Observation, Medication Order) are outside the core dependency-ordered sequence — they were authored as worked examples of the methodology applied to a domain where the regulatory surface is HIPAA (Health Insurance Portability and Accountability Act) and 21 CFR Part 11 rather than the BSA (Bank Secrecy Act) / AML (Anti-Money Laundering) / GDPR (General Data Protection Regulation) / SOX (Sarbanes-Oxley Act) cluster the compliance atoms anchor. They are grounded and composable; their downstream compositions (e.g., a Clinical Trial Data Capture composition, a Medication Administration Record composition) are not on this roadmap yet because the worked-example value is in the atoms themselves rather than in any specific composition the library is committed to delivering next.

---

## Planned-sequence atoms — all grounded (roadmap history)

All of atoms #7–#14 are now grounded; none remains on the planned sequence. The detailed entries below are retained as roadmap history (originally sequenced by how many downstream compositions each unblocked).

---

### 7. Provenance

**Category:** `compliance` — resolved to compliance (compliance-infrastructure primitive, regulated overlay).

**Status:** `grounded` 2026-06-04 (Alloy model `provenance.als` + buggy twin verified in `tools/harness/`). Sonnet-drafted against an Opus plan; Opus-gated through Pass 1 / 2 / 3 + Final Critique (two foundational + four refining findings closed in-pattern). Unblocks Chain of Custody (C12). The descriptive entry below is retained as roadmap history.

**What it is.** A compliance and temporal primitive: an append-only chain recording the origin, custody history, and transformation history of a record or artifact. Provenance answers *where did this come from, who has handled it, and what has been done to it*. It is distinct from Event Log (which records what happened in a system) and from Actor Identity (which verifies who performed an action) — Provenance specifically models the chain of custody of a *thing*, not a stream of system events. Each custody event is immutable once recorded; the chain is append-only.

**Why it's next.** Of the remaining atoms, Provenance is the highest-leverage in terms of composing surface: it strictly blocks Chain of Custody (C12) — the library's cross-domain reference case spanning pharmaceutical and legal-evidence custody — and additionally enriches Immutable Transaction Ledger (C6), Data Subject Rights Fulfillment (C7), and KYC (Know Your Customer) / Customer Onboarding (C8) as an optional composing atom for chain-of-custody guarantees. The scoping requires careful EOS Pass 2 work to establish what "this thing's custody history" means without absorbing the event-log or actor-identity concerns — the boundary against Event Log is the key conceptual-independence test.

**Key invariants (anticipated).** Each provenance entry is immutable once recorded. The chain is append-only — no entry is removed or reordered. Every entry names a custodian (an actor reference), a timestamp, and an event type (originated, received, transformed, transferred, disclosed, archived). The chain is complete — no custody gap is permitted between recorded entries; a gap is a finding, not a valid state.

**Standards anchored.** ISO 23081 (records management metadata — provenance as a required metadata element); W3C PROV (data provenance ontology); FDA 21 CFR Part 211 (pharmaceutical chain of custody); SEC (Securities and Exchange Commission) Rule 17a-4 (records must be maintained as originally created — provenance of the original form).

**Unlocks.** Strictly blocks Chain of Custody (C12) — Provenance is C12's core atom, not an enrichment. Additionally enriches Immutable Transaction Ledger (C6), DSAR (C7), and KYC (C8) as an optional composing atom for chain-of-custody guarantees; those three are unblocked without Provenance but gain emergent invariants when composed with it.

---

### 9. Workflow / State Machine

**Category:** `workflow`

**Status:** `grounded` 2026-06-04 (Alloy model `workflow-state-machine.als` + buggy twin verified in `tools/harness/`). Sonnet-drafted against an Opus plan; Opus-gated through Pass 1 / 2 / 3 + Final Critique (one foundational + one refining finding closed). Unblocks Stateful Workflow Execution (C10) and **resolves the workflow-category one-atom open question** (it is the second workflow atom). The descriptive entry below is retained as roadmap history.

**What it is.** A workflow primitive: a named entity moving through a defined, finite set of states via explicitly declared transitions. The atom does not know what the entity is — it knows the entity's current state, the transitions that are valid from that state, and the history of how it got there. States and transitions are declared at instantiation; the atom enforces that only declared transitions are applied and that the full transition history is auditable. A Workflow instance has exactly one current state at all times; concurrent active states and fork-join constructs are composing concerns, not atom-level concerns.

**Why it's after Capacity Constraint.** Approval Step (atom #4, grounded) opened the `workflow/` category but left it a single-entry category. Workflow / State Machine is the general primitive that justifies the category: Approval Step is a specific kind of state machine (one designed for human approval decisions); Workflow / State Machine is the general case. The two atoms compose into Stateful Workflow Execution (C10), which produces multi-actor gated workflows with tamper-evident transition histories — a pattern that recurs in regulated manufacturing, financial operations, and HR processes. Once this atom lands, the workflow category stands on its own and the broader axial-split taxonomy question can be revisited with two workflow atoms as evidence.

**Key invariants (anticipated).** Only declared transitions are valid — an undeclared transition is rejected with `invalid-transition`. The current state is always exactly one of the declared states. The full transition history — prior state, target state, triggering action, timestamp, actor — is auditable and append-only. A state declared as terminal at instantiation is absorbing — no further transitions are accepted. Transition guards are declared at instantiation; the atom enforces that a guard must be `satisfied` before a transition fires, but does not evaluate the guard — that is the caller's obligation.

**Standards anchored.** FDA 21 CFR Part 11 (electronic records in regulated workflows — each state transition is a regulated event); ISO 9001 §8.5.1 (production workflow controls); BPMN 2.0 (the canonical notation for stateful workflow — this atom is the primitive behind a BPMN state diagram); HL7 (Health Level Seven) FHIR (Fast Healthcare Interoperability Resources) Task resource (clinical workflow state machine — Task states map directly to this atom's state machine).

**Unlocks.** Stateful Workflow Execution (C10). Resolves the workflow-category one-atom question (**resolved 2026-06-04** — the category now stands on two grounded atoms).

---

### 10. Preference / Personalization

**Category:** `messaging`

**Status:** `grounded on Final Critique 5 — 2026-05-29`. Author-conducted foundation passes (Pass 1 GRID, Pass 2 EOS, Pass 3 Linus) and one refinement round; fresh-reader AI Phase 3 round (2026-05-25); first Opus Phase 4 gate (2026-05-25 — Final Critique 4) surfaced 3 foundational findings, all closed; the 2026-05-29 fresh-reader Phase 3 + Opus Happy Torvalds X2 rerun (Final Critique 5) returned zero foundational findings (17 refining, 1 rhetorical, all closed in-pattern) and grounds the atom. It lives at [`atoms/preference.md`](./atoms/preference.md). The five anticipated invariants below are realized as ten hard invariants (record immutability, status monotonicity, at-most-one-currently-in-effect, supersession atomicity, channel-set membership at creation, value-preserving suspension, query determinism, no id reuse, store durability, configuration-record integrity) plus Temporal property 11 (timestamp ordering, best-effort under non-monotonic clocks).

**What it is.** A messaging primitive: a durable binding of a principal's delivery preferences — channel priority, frequency limits, quiet hours, format preferences, per-topic opt-downs — that governs *how* a notification reaches a recipient, independently of *whether* they are subscribed (Subscription) or *whether* processing is legally permitted (Consent). The three atoms are distinct: Subscription governs which topics a principal follows; Consent governs whether the system may process or communicate with the principal at all; Preference governs the delivery envelope when Subscription and Consent have both permitted the notification. States: Active, Suspended (preferences retained but delivery suppressed for the principal), Deleted.

**Why it's last.** Subscription, Notification, and Notification Fanout are all grounded; Consent is grounded. The next natural question in the messaging surface is: *how does a subscriber control the shape of delivery?* Preference / Personalization is the atom that answers it. It sits last in the planned sequence because the composing surface (Preference-Aware Notification Fanout, C11) is narrower than the other remaining atoms', not because the atom is less important — it just unblocks one composition rather than several.

**Key invariants (anticipated).** A principal has at most one active Preference record — preferences are not additive; a new preference set replaces the prior one (with the prior set retained in history). Preference updates are not retroactive — a notification already queued before an update is delivered under the prior preferences; the update governs future deliveries only. A Suspended Preference record suppresses delivery without removing subscriptions — the subscriber retains their topic bindings while suppressing notifications. Preference / Personalization does not define what channels exist or what format options are valid — those are deployment-specific enumerations declared at instantiation.

**Standards anchored.** CAN-SPAM Act (opt-out and frequency controls for commercial email); TCPA (frequency and consent controls for SMS and phone marketing); GDPR Article 7(3) (preference changes must be as easy as the original grant — the Preference atom's update action is the mechanism).

**Unlocks.** Preference-Aware Notification Fanout (C11).

---

### 11. Credential

**Classification:** stored flat as `atoms/credential.md` — no category folder. Its **regulated** and **security** classifications are overlays derived from its composers, not a folder it is filed under; this resolves the former provisional `compliance/` placement and the question of a dedicated security/identity folder. See the [usage-derived taxonomy](./atoms/TAXONOMY.md).

**Status:** `grounded` 2026-05-19 (Final Critique 4); formal layer landed 2026-06-03 (`credential.tla` + buggy twins). Retained below as roadmap history.

**What it is.** An authentication primitive: a durable binding between a principal and a secret or token that the principal presents to prove they are who they claim to be. Credential models the registration of that binding, the verification of presented material against it, the rotation of the binding to a new secret while retiring the prior one, and the revocation of the binding entirely. Each credential record is tied to exactly one principal at registration and that binding is immutable; rotation produces a *new* credential record bound to the same principal, never a mutation of the prior one. The prior record transitions to the terminal state `Rotated`, preserving the full rotation history in the record store. Actions: `register`, `verify`, `rotate`, `revoke`.

**Why it's next.** Credential retires the `Authentication *(forthcoming)*` debt in [`atoms/actor-identity.md`](./atoms/actor-identity.md) — Actor Identity verifies *who* an actor is; Credential is the mechanism by which that verification is operationalized as a bound secret the actor can present. The two atoms are distinct: Actor Identity is a persistent identity record; Credential is the authentication surface the identity record can bind. Of the four new atoms, Credential and Session are the highest-leverage pair: Credential strictly blocks C13 (Login), which wires Credential verification to Session issuance. It additionally enriches C16 (External Onboarding), where a credential is registered at the moment an invited party's identity is accepted.

**Key invariants (anticipated).** `verify` returns `verified` only for the principal bound at registration — sole-holder verification is absolute. Once a credential transitions to `Revoked`, no future `verify` call returns `verified` — revocation is absorbing. Rotation never mutates the prior credential record; it produces a new record and transitions the prior record to `Rotated`. State machine: Active → Rotated | Revoked | Expired (three terminal states). The full rotation and revocation history is auditable from the record store alone.

**Standards anchored.** NIST SP 800-63B (authenticator assurance levels — IAL/AAL tiers); OpenID Connect Core 1.0 (credential material exchange); RFC 7519 (JWT — credential token encoding); FIDO2/WebAuthn (phishing-resistant authenticator binding); PCI DSS (Payment Card Industry Data Security Standard) Requirement 8 (credential management controls); ISO/IEC 27001 §A.9.4 (system and application access controls). Explicitly not citing NIST 800-63A — identity proofing belongs upstream to Party Identity.

**Unlocks.** Strictly blocks C13 (Login — Credential + Session + Actor Identity). Additionally enriches C16 (External Onboarding — the credential registration step in the onboarding arc).

---

### 12. Session

**Classification:** stored flat as `atoms/session.md` — no category folder. Its **regulated** and **security** classifications are overlays derived from its composers, not a folder it is filed under; this resolves the former provisional `compliance/` placement and the question of a dedicated security/identity folder. See the [usage-derived taxonomy](./atoms/TAXONOMY.md).

**Status:** `grounded` 2026-05-19 (Final Critique 4); formal-layer vote reconsidered to NO (formal-not-warranted; records-alone, interleaving lives in Session-Gated Authorization). Retained below as roadmap history.

**What it is.** A time-limited authenticated channel primitive: a record attesting that a given principal was authenticated at a specific moment and that the authentication remains valid until the session expires or is explicitly revoked. Session does not perform authentication — that is Credential's surface. Session records the *result* of a successful authentication and makes it queryable by composing systems for the duration of its validity. Each session carries an `expires_at` timestamp set at issuance and never mutated; extension of a session produces a new session record, not a modification of the prior one. Actions: `issue`, `validate`, `expire`, `revoke`. State machine: Active → Expired | Revoked (two terminal states).

**Why it's next.** Session is the time-bounding surface that Credential verification produces: a successful `verify` produces a short-lived authenticated channel; that channel is a Session. Without Session, Credential verification has no durable expression that composing systems can query — Login (C13) needs both. Session additionally unblocks Session-Gated Authorization (C14), which gates every permission check on session validity before the permission check runs.

**Key invariants (anticipated).** A session is valid if and only if it has been issued, `now < expires_at`, and it has not been revoked — the validity bound is conjunctive. `validate(token)` returns `valid | invalid(expired | revoked | not-known)` — three first-class invalid outcomes, mirroring Actor Identity's `verify` discipline, never collapsed to a single `invalid`. Revocation is absorbing: a revoked session cannot be re-validated. `expires_at` is set at issue time and never mutated; a session that needs a longer lifetime is re-issued, not extended in place.

**Standards anchored.** NIST SP 800-63B §7 (session management and reauthentication requirements); OWASP ASVS V3 (session management verification standard); RFC 6265 (HTTP state management — cookie-based session binding); SAML 2.0 §4.1.4 (session establishment and termination); RFC 6819 (OAuth 2.0 threat model, session-related threat mitigations); OIDC Session Management 1.0 (session lifecycle and logout across identity providers).

**Unlocks.** Strictly blocks C13 (Login — Credential + Session + Actor Identity) and C14 (Session-Gated Authorization — Session + Permissions).

---

### 13. Capability

**Classification:** stored flat as `atoms/capability.md` — no category folder. The object-capability literature anchors it as a security primitive; under the usage-derived taxonomy that shows up as a derived **security** overlay (alongside **regulated**), not a folder placement. This resolves the former provisional `compliance/` placement. See the [usage-derived taxonomy](./atoms/TAXONOMY.md).

**Status:** `grounded` 2026-05-19 (Final Critique 4; Alloy model `capability.als` + buggy twin). Retained below as roadmap history.

**What it is.** A bearer-token authorization primitive: an unforgeable token that carries its own authorization to access a specific resource or perform a specific action. The defining property of a Capability is that possession of the token is sufficient authorization — the redeemer's identity is intentionally irrelevant at redemption time. Capability generalizes single-use links (a password-reset link), multi-use API tokens (a service credential scoped to a single resource), and pre-authorized action tokens under one structural pattern. Each capability carries a `remaining_redemptions` counter set at allocation (default 1) and decremented monotonically on each redemption; a capability with `remaining_redemptions = 0` is exhausted and terminal. Actions: `allocate`, `redeem`. State machine: Allocated → Redeemed | Expired | Revoked (three terminal states, with exhaustion via counter being the structural route to Redeemed).

**Why it's next.** Capability is the library's forcing function for making the OCAP-vs-Permissions distinction explicit. Permissions is identity-keyed: a permission check gates on *who* is asking. Capability is bearer-keyed: the token gates on *what is being presented*, with no identity check at redemption time. The two atoms compose into structurally distinct patterns with different audit signatures. Without a Capability atom, a composing system is forced to model bearer-token semantics inside Permissions or an ad-hoc construct, hiding the architectural distinction the library exists to make visible. Capability strictly blocks C15 (Capability-Backed Sharing), the library's worked example of bearer-token semantics composing with regulated audit.

**Key invariants (anticipated).** Redemption requires only possession of the token — no identity check at redemption time; the redeemer's identity is structurally irrelevant and intentionally so. The allocator's identity is recorded at allocation time and attestable via Actor Identity, producing an asymmetric audit record: allocator is known, redeemer is not. `remaining_redemptions` is set at allocation and decremented monotonically; it never increases. Exhaustion (counter at 0), expiry, and revocation are three structurally distinct terminal modes and are never conflated in the record or in validation logic.

**Standards anchored.** Daniel Jackson, *Software Abstractions* — `Capability [Resource]` concept (the atom's structural core); Mark Miller and the object-capability (OCAP) literature (bearer-key authorization semantics); Levy (1984), *Capability-Based Computer Systems* (canonical reference for bearer-token capability semantics); Birgisson et al. (2014), *Macaroons* (context-limited bearer credentials — a constrained Capability variant); RFC 6749 §1.4 (OAuth 2.0 access tokens — cited with explicit caveats about OAuth's identity-bound conflations diverging from pure OCAP; this atom defines the pure OCAP surface, not the OAuth surface).

**Unlocks.** Strictly blocks C15 (Capability-Backed Sharing — Capability + Selective Disclosure + Audit Trail substrate). The atom's primary value on EOS Pass 2 is forcing the OCAP-vs-Permissions distinction to be made explicit in the library.

---

### 14. Invitation

**Classification:** stored flat as `atoms/invitation.md` — no category folder. Its core concern is onboarding an external entity into a system identity context; under the usage-derived taxonomy that is captured by its derived **security** and **regulated** overlays rather than a dedicated identity folder. This resolves the former provisional `compliance/` placement. See the [usage-derived taxonomy](./atoms/TAXONOMY.md).

**Status:** `grounded` 2026-05-19 (Final Critique 4); formal layer landed 2026-06-03 (`invitation.tla` + buggy twin). Retained below as roadmap history.

**What it is.** A lifecycle primitive for inviting an external entity to join a context: a durable record of the invitation event itself, from the moment the invitation is issued through its resolution — accepted, declined, expired, or revoked before resolution. The defining property of Invitation is that the invitee's identity may not be known or validatable at initiation time; the moment of acceptance is when an identity is bound. Actions: `initiate`, `accept`, `decline`, `revoke`, `expire`. State machine: Pending → Accepted | Declined | Expired | Revoked (four terminal states). `accept` carries an `accepting_identity_ref` argument — the identity is bound at the moment of acceptance and is immutable thereafter.

**Why it's next.** Invitation is the library's mechanism for onboarding an unknown external entity into a system identity context. Party Identity (atom #6, grounded) models a persistent verifiable identity; Invitation is the gate through which an external party first enters the identity surface. Without Invitation, the library has no structured account of how an external party comes to exist in the system at all — C16 (External Onboarding) cannot be specified without it. Invitation also completes the Capability-vs-Invitation design question (see Open taxonomy question): both atoms use bearer-token transport; the distinction is that Invitation carries `Declined` as a first-class semantic outcome (a human decision, not a system event) and binds an identity at resolution — two properties Capability does not have.

**Key invariants (anticipated).** Exactly one transition out of `Pending` — once an invitation has been accepted, declined, expired, or revoked, any subsequent action attempt returns `already-resolved(state)`. The `invitee_ref` at initiation may not resolve to a known system identity; it is not validated at initiate time and is not required to match the `accepting_identity_ref` at accept time — opaque invitee at initiation is structurally intentional. The identity bound at acceptance (`accepting_identity_ref`) is immutable once set; it cannot be rebound or updated after the accept transition.

**Standards anchored.** GDPR Article 32 (security of processing — invitation tokens are credentials in transit and must be treated accordingly); HIPAA §164.312 (access control requirements — invitation-based provisioning is a covered access-granting mechanism); SCIM 2.0 (System for Cross-domain Identity Management — invitation-style user provisioning is adjacent to SCIM's `POST /Users` with an invite flow). Standards anchoring is lighter for Invitation than for Credential, Session, or Capability; the atom earns its keep on EOS Pass 2 conceptual independence rather than regulatory depth.

**Unlocks.** Strictly blocks C16 (External Onboarding — Invitation + Party Identity + Credential + Audit Trail substrate).

---

## Grounded atoms — short status (formerly atoms #1–#6, #8)

The seven atoms below were on the planned sequence and have shipped. Detailed authoring notes are in the atom files themselves; the entries below are retained as roadmap-history.

- **[Legal Hold](./atoms/legal-hold.md)** — `grounded` 2026-05-13. Compliance primitive; actor-issued hold preventing record purge regardless of retention eligibility. Unblocked C1 (Defensible Retention, now grounded) and C7 (DSAR).
- **[Consent](./atoms/consent.md)** — `grounded` 2026-05-13. Compliance primitive; data subject's agreement to a specified processing purpose with grant/revoke/expire lifecycle. Unblocked C2 (Consent & Preference Management), C7 (DSAR), C8 (KYC).
- **[Soft Delete](./atoms/soft-delete.md)** — `grounded` 2026-05-13. Resource-lifecycle primitive; recoverable deletion with explicit purge. Unblocked C3 (Forensic Recovery).
- **[Approval Step](./atoms/approval-step.md)** — `grounded` 2026-05-13. Workflow primitive; single approval gate with Pending/Approved/Rejected/Withdrawn lifecycle. Unblocked C4 (Multi-Party Approval, now grounded). First entry in `workflow`.
- **[Selective Disclosure](./atoms/selective-disclosure.md)** — `grounded` 2026-05-13. Compliance primitive; durable record of what subset of a record was disclosed, to whom, when, and under what authority. Unblocked C6 (Immutable Transaction Ledger) and C7 (DSAR).
- **[Party Identity](./atoms/party-identity.md)** — `grounded` 2026-05-14. Compliance primitive; persistent verifiable identity record for an external party with Unverified/Verified/Suspended/Closed lifecycle. Unblocked C8 (KYC / Customer Onboarding). Survived foundation round plus Opus Phase 4 clearance gate; six clearance-gate findings closed in-pattern.
- **[Capacity Constraint Enforcement](./atoms/capacity-constraint-enforcement.md)** — `grounded` 2026-05-15. Resource-lifecycle primitive; named, bounded pool of a finite resource with arithmetic enforcing *total allocated never exceeds declared capacity* under four named host obligations. Unblocked C9 (Reservation Lifecycle). Foundation round plus two Phase 4 Opus clearance-gate rounds (round 1: 11 foundational findings closed; round 2: 3 foundational + 5 refining + 1 rhetorical closed). First atom grounded under the 92%-good threshold codified in this revision of PRESSURE_TESTING.md.

---

## Compositions — current state

Compositions are sequenced by readiness. Of the seventeen C-numbered compositions, **twelve are grounded** (C1, **C2**, **C3**, C4, C5, C8, **C9**, C10, C12, C13, C14, C16); five are unblocked and not started (C6, C7, C11, C15, C17 — plus C18); none is blocked on a remaining atom. **C2 (Consent & Preference Management) and C9 (Reservation Lifecycle) grounded 2026-06-04** — C2 wires Consent + Permissions + Audit Trail (substrate) for the consent-gates-processing gate plus the revocation-propagation binding bijection; C9 wires Capacity Constraint + Provisional Commitment + Duplicate Prevention + Event Log + Actor Identity for the allocation-coherence guarantee (the pool-arithmetic superset of Idempotent Reservation). Both ship TLA+ models + buggy twins verified in `tools/harness/`. **C3 (Forensic Recovery), C10 (Stateful Workflow Execution), and C12 (Chain of Custody) all grounded 2026-06-04** — C10 immediately after its spine atom Workflow / State Machine, C12 immediately after its core atom Provenance, C3 as an easy template-driven Soft Delete + Audit Trail substrate composition. C11 became unblocked when Preference / Personalization grounded on 2026-05-29. Provenance also enriches three other compositions (C6, C7, C8) as an optional composing atom for chain-of-custody guarantees — those compositions remain unblocked without it, but gain emergent invariants when composed with it once it lands.

---

### Grounded

- **[C1. Regulated Record Retention & Defensible Deletion](./compositions/defensible-retention.md)** — `grounded` 2026-05-13. Legal Hold + Audit Trail + Retention Window. Foundation, Round 2, and AI-conducted Round 3 (Opus) all clean. Anchors SOX, HIPAA, SEC Rule 17a-4, GDPR Article 17, FRCP (Federal Rules of Civil Procedure) Rule 37(e).
- **[C4. Multi-Party Approval](./compositions/multi-party-approval.md)** — `grounded` 2026-05-13. Approval Step + Permissions + Assignment + Audit Trail (substrate). Foundation, Round 2 (human), and Round 3 (Opus Super-Torvalds) all clean. Anchors SOX §404, FDA 21 CFR Part 11, ICH E6 GCP, ISO 9001 §8.5.1.
- **[C5. Notification Fanout](./compositions/notification-fanout.md)** — `grounded` 2026-05-13. Subscription + Notification. Foundation plus Opus adversarial pass (26 findings, all resolved). Completes the messaging atom pair and formalizes the fan-out boundary rule from the Execution Contract.

---

### Unblocked, not started

These compositions have all their constituent atoms grounded. They are ready for authoring; sequencing is by regulatory-coverage value and emergent-invariant interest.

#### C2. Consent & Preference Management with Revocation Propagation

**Status: `grounded` 2026-06-04.** Composes **Consent + Permissions + Audit Trail (substrate)** plus a distinct consent-record Retention Window placement; per the substrate convention, naming Audit Trail satisfies the Event Log + Actor Identity + Retention Window + Tamper Evidence prerequisites transitively. Authored end-to-end (Opus gate: Pass 1 / 2 / 3 + Final Critique; EOS Pass 2 confirmed Permissions a constituent, not a peer, and extracted downstream cessation + delivery-shaping preferences as composing concerns) → TLA+ binding-bijection model + buggy twin verified in `tools/harness/`. See [`compositions/consent-preference-management.md`](./compositions/consent-preference-management.md).

**Prerequisites:** Consent + Audit Trail + Retention Window + Permissions + Event Log — all grounded.

**What it adds.** Consent made operational — checked before every processing action via the `processing_permitted` gate, propagated on revocation (the `consent.revoked` event enumerates the complete downstream scope set, committed atomically with the revoke), auditable for regulatory proof. Emergent invariants: no processing action proceeds under a Consent basis without a `permitted` gate result for the relevant purpose scope; a revocation produces an audit record naming every downstream scope affected (the binding bijection); the full consent history is recoverable from the records alone; and inward (Permissions) / outward (Consent) authorization stay separate.

**Standards anchored.** GDPR Articles 6–7, GDPR Article 7(3), CCPA/CPRA, HIPAA Authorization §164.508.

#### C3. Forensic Recovery

**Status: `grounded` 2026-06-04.** **Prerequisites:** Soft Delete + Audit Trail (substrate, → Event Log + Actor Identity + Retention Window + Tamper Evidence) — all grounded. The forensic-attribution composition: every delete/restore/purge attributed, tamper-evidently sealed, and `recover_history`-recoverable (the full ordered lifecycle Soft Delete's current-state summary cannot provide). The purge-*eligibility* gate (Legal Hold / Retention Window) is Defensible Retention (C1)'s concern, not C3's. Ships with a TLA+ binding-bijection model + buggy twin ("no purge without an audit record"). See [`compositions/forensic-recovery.md`](./compositions/forensic-recovery.md).

**What it adds.** Soft deletion made forensically complete — every deletion, restoration, and purge is attribution-stamped and tamper-evident; the full lifecycle of every soft-deleted record is recoverable from the audit trail. Emergent invariant: no soft-deleted record is purged without an auditable record naming who purged it, when, and under what authority.

**Standards anchored.** GDPR Article 17, HIPAA PHI (Protected Health Information) destruction, e-discovery preservation obligation.

#### C6. Immutable Transaction Ledger with Selective Disclosure

**Prerequisites:** Selective Disclosure + Event Log + Tamper Evidence + Actor Identity + Retention Window + Idempotent Reservation — all grounded.

**What it adds.** A transaction record both non-repudiable and selectively shareable — the full ledger is tamper-evident and attribution-stamped; a subset can be disclosed without breaking the integrity of the remainder. Emergent invariant: a disclosed subset is itself tamper-evident; the undisclosed portion is not compromised by the disclosure.

**Standards anchored.** Financial services (trade confirmation, settlement records); healthcare billing; clinical trials (regulatory submission).

#### C7. Data Subject Rights Fulfillment (DSAR)

**Prerequisites:** Legal Hold + Consent + Selective Disclosure + Audit Trail + Retention Window + Actor Identity + Event Log — all grounded.

**What it adds.** Data subject rights made mechanically answerable — a DSAR request triggers a structured query across the composition's records; the response is provably complete, accurate, and timely. Emergent invariants: no record touching the data subject is omitted without an auditable reason (active Legal Hold, third-party confidentiality); every disclosure made in response is recorded in the Selective Disclosure store.

**Standards anchored.** GDPR Articles 15–20, CCPA/CPRA, HIPAA individual right of access (§164.524).

#### C8. KYC (Know Your Customer) / Customer Onboarding with Ongoing Monitoring

**Prerequisites:** Party Identity + Consent + Audit Trail + Event Log + Idempotent Reservation + Retention Window + Actor Identity — all grounded (Party Identity completed 2026-05-14).

**What it adds.** Customer onboarding made regulatorily complete — every identity verification step is attribution-stamped and tamper-evident; the onboarding record is immutable from the moment the customer is enrolled; ongoing screening triggers (sanctions list match, PEP (Politically Exposed Person) status change, adverse media) are recorded as events against the Party Identity record. Emergent invariant: no customer proceeds to active status without a verified Party Identity record; no Party Identity verification is performed without a corresponding Audit Trail entry.

**Standards anchored.** FATF (Financial Action Task Force) Recommendations 10–12, BSA/AML (31 CFR §1020.220), FinCEN beneficial ownership rule (31 CFR §1010.230), EU 5th Anti-Money Laundering Directive.

**Status: `grounded on Final Critique 4` — 2026-06-03.** Composes Party Identity + Retention Window + Audit Trail (substrate); Idempotent Reservation and Consent were evaluated as constituents and demoted to optional Duplicate Prevention enrichment and C2 composing peer respectively (see the composition's Lineage notes — Pass 2 findings). Three-pass baseline (3×3) plus the AI-conducted Final Critique; foundational findings closed in each baseline round, and the Phase-4 Opus clearance gate returned zero foundational findings.

#### C9. Reservation Lifecycle

**Status: `grounded` 2026-06-04.** Composes Capacity Constraint Enforcement + Provisional Commitment + Duplicate Prevention + Event Log + Actor Identity — the pool-arithmetic superset of Idempotent Reservation. Authored against Idempotent Reservation as the structural template (Opus gate: Pass 1 / 2 / 3 + Final Critique → TLA+ allocation-coherence model + buggy twin verified). The load-bearing emergent invariant is allocation coherence (`allocated` in lockstep with the live-reservation set, within `[0, capacity]`), owned via the `reservation_to_pool` binding with a `slot_released` flag; oversell, slot-leak, and double-release are each foreclosed by a named mechanism. See [`compositions/reservation-lifecycle.md`](./compositions/reservation-lifecycle.md).

**Prerequisites:** Capacity Constraint Enforcement + Provisional Commitment + Duplicate Prevention + Event Log + Actor Identity — all grounded (Capacity Constraint Enforcement completed 2026-05-15).

**What it adds.** The full arc of a reservation: capacity query against the pool, provisional hold against a specific slot, idempotent confirmation under concurrent demand, and eventual resolution — confirmed, cancelled, or expired. Emergent invariants: confirmed reservations never exceed pool capacity; a cancelled or expired reservation releases its slot back to the pool atomically; no reservation transitions to Confirmed unless its provisional hold is still Active at confirmation time.

**Standards anchored.** Booking and ticketing systems; financial settlement (credit limit enforcement); supply chain and inventory.

**Newly unblocked.** This composition was blocked on Capacity Constraint Enforcement through 2026-05-14; it is unblocked as of 2026-05-15.

#### C17. Authenticated Actor

**Prerequisites:** Credential (atom #11 — `grounded` 2026-05-19) + Actor Identity (grounded). Both grounded; unblocked as of 2026-05-21.

**What it adds.** The formal relationship between a principal's authentication credential and their attestation key — two identity surfaces the individual atoms define independently but whose relationship they leave unspecified. Three emergent invariants the individual atoms do not own: (1) **Revocation cascade** — whether `Credential.revoke` must cascade to invalidate the Actor Identity attest surface, closing the gap where a principal whose login is revoked can still sign attestations; (2) **Secret surface separation** — whether the same cryptographic material may serve both as the Credential verifier and the Actor Identity attest key, or whether the surfaces must be distinct; (3) **Namespace binding** — how `principal_ref` (Credential's identity key) and `actor_ref` (Actor Identity's identity key) are formally bound to the same human or system principal, preventing an audit record attributed to a different identity surface than the session record it corresponds to. Implementation-discovered gap: see `demos/attributed-permissions-admin/CORNERS.md` §Cross-atom identity surface aliasing.

**Standards anchored.** NIST SP 800-63B §5.2 (verifier requirements — separation of authentication secrets from signing keys); NIST SP 800-57 Part 1 (key management — key separation by purpose); PCI DSS Requirement 8.6 (management of system and application accounts and authentication factors — distinct credential surfaces for distinct purposes); FIPS 140-3 (cryptographic module separation requirements).

**Newly unblocked.** Both constituent atoms grounded as of 2026-05-19. The gap was surfaced by implementation pressure on the Attributed Permissions Admin demo on 2026-05-21.

---

#### C18. Actor Suspension

**Prerequisites:** Actor Identity (grounded) + Permissions (grounded) + Session (grounded — via C13 Login) + Audit Trail (grounded). All grounded; unblocked at this entry's creation date. Optionally composes Credential (grounded) where policy requires deactivating the actor's credentials alongside their grants and sessions.

**What it adds.** Coordinated deactivation of an actor's authorization and authentication surfaces in one transactional boundary, with a single tamper-evident `actor.suspended` Audit Trail event naming the full scope of what was revoked. Three emergent invariants the individual atoms do not own: (1) **Atomicity of multi-surface revocation** — after `suspend_actor` returns success, the actor holds zero active grants in Permissions and zero active sessions in Session, all written under one transaction; a partial state (grants revoked but sessions still active, or vice versa) is not a reachable post-state. (2) **Audit completeness of revocation scope** — the `actor.suspended` event enumerates every `grant_id` and `session_token` revoked by the call, so an auditor can reconstruct from records alone which surfaces were taken offline at suspension time; a revocation that touches a grant or session whose id is not in the event payload is a finding. (3) **Suspension cascade ordering** — Actor Identity's status transition (Active → Suspended) is the precondition for the cascade; the cascade reads Actor Identity status as the gate, the same way Login's `revoke_sessions_for_credential` reads credential status. An attempted cascade against an already-Suspended actor is a no-op return with `{grants_revoked: 0, sessions_revoked: 0}`, not an error. The composition's Pass-3-shaped TOCTOU concern mirrors Login's FC1: one constituent revocation succeeds, another storage-fails, actor is now in a partial state. The default discipline is all-or-nothing under a single transaction boundary (matching Login's atomic-action commit pattern); a best-effort variant with partial-state attestation is named as a deployment-policy alternative.

**Standards anchored.** NIST SP 800-53 AC-2(3) (account management — disable accounts when no longer required) + AC-6(5) (least privilege — revoke unnecessary privileges); SOX §404 (internal controls over user access); HIPAA §164.308(a)(3)(ii)(C) (termination procedures — terminate access when employment ends); PCI DSS Requirement 8.1.3 (immediately revoke access for terminated users); ISO/IEC 27001 §A.9.2.6 (removal or adjustment of access rights).

**Newly unblocked.** All four constituent atoms grounded as of 2026-05-21. Named as a stretch item for the Clinical Trial Portal demo (`compositions/Demo2-plan.md` §Phase 7 — "soft-revoke pattern" for coordinated revocation of an actor's grants and sessions in one transaction emitting `actor.suspended`).

---

### Formerly blocked on remaining atoms — now grounded or unblocked

#### C12. Chain of Custody

**Status: `grounded` 2026-06-04.** **Prerequisites:** Provenance *(atom #7 — grounded)* + Audit Trail (substrate, supplying Actor Identity + Tamper Evidence + Retention Window transitively) — all grounded. C12 composes Provenance + Audit Trail; its emergent guarantee is records-alone custody proof (`verify_custody`), with a TLA+ binding-bijection model + buggy twin. This entry is retained under "Blocked on remaining atoms" only as history of its former state; C12 is now grounded — see [`compositions/chain-of-custody.md`](./compositions/chain-of-custody.md).

**What it adds.** A complete chain-of-custody record for a thing — a physical item, a digital artifact, a sample, a document — from origin through every transfer, transformation, and terminal disposition. Every custody event is attribution-stamped and tamper-evident; the full chain is reconstructable from the records alone with no gaps permitted. Emergent invariants: no custody event is recorded without a named custodian and a timestamp; no gap between consecutive custody events is a valid state; the chain is append-only and tamper-evident at every link.

**The cross-domain thesis in one example.** Pharmaceutical chain of custody (FDA 21 CFR Part 211 — drug sample from manufacturer through distributor to pharmacy) and evidence chain of custody (legal forensics — item from crime scene through lab to court) are structurally identical. Same atoms, same emergent invariants, different domain vocabulary. One grounded composition serves both. This is the library's core claim made concrete: the pattern belongs in one place, not reinvented in every domain that needs it.

**Standards anchored.** FDA 21 CFR Part 211 (pharmaceutical chain of custody); DEA 21 CFR Part 1304 (controlled substance handling records); Federal Rules of Evidence 901(b)(9) (chain of custody as authentication for physical evidence); ISO 17025 (laboratory sample handling and traceability); ASTM E1492 (evidence handling in forensic science).

**Unlocks.** A worked example of cross-domain pattern reuse — the library's strongest argument for the open-commons model. Natural reference case for grant submissions and early adopter conversations in healthcare and legal tech.

---

#### C10. Stateful Workflow Execution

**Status: `grounded` 2026-06-04.** **Prerequisites:** Workflow / State Machine (atom #9) + Approval Step + Permissions + Assignment + Audit Trail (substrate, → Event Log + Actor Identity + Retention Window + Tamper Evidence) — all grounded. The composition where guard *evaluation* re-converges (a guarded transition fires only when its bound Approval Step is Approved); ships with a TLA+ approval-gated-transition model + buggy twin. First composition to compose the Workflow / State Machine atom. This entry is retained under "Blocked on remaining atoms" only as history of its former state; C10 is now grounded — see [`compositions/stateful-workflow-execution.md`](./compositions/stateful-workflow-execution.md).

**What it adds.** A multi-actor gated workflow made auditably complete — declared-state transitions enforced by the Workflow / State Machine atom; human approval gates enforced by Approval Step instances; assignment of work to actors enforced by Assignment; permissions to trigger transitions enforced by Permissions. Emergent invariants: no state transition proceeds without the required approval gate cleared; no approval is granted by an actor lacking the required permission; the full workflow history is tamper-evident and attribution-stamped.

**Standards anchored.** SOX §404, FDA 21 CFR Part 11, ISO 9001 §8.5.1, BPMN 2.0.

#### C11. Preference-Aware Notification Fanout

**Prerequisites:** Preference / Personalization *(atom #10 — `grounded` 2026-05-29)* + existing: Subscription, Notification (grounded); Notification Fanout composition (grounded). **Newly unblocked 2026-05-29** — Preference grounded on Final Critique 5; C11 is now ready for authoring and belongs with the unblocked-not-started compositions (retained under this heading only as history of its former blocked-on-atom-#10 status).

**What it adds.** Notification Fanout extended with per-subscriber delivery shaping — the fanout step consults each subscriber's Preference record and adjusts channel, format, and rate. Emergent invariants: a Suspended Preference record suppresses delivery even when Subscription is Active; frequency-cap violations are held or dropped per declared policy rather than silently delivered; the `failed` list distinguishes delivery-attempted-and-failed from delivery-suppressed-by-preference.

**Standards anchored.** CAN-SPAM, TCPA, GDPR Article 7(3).

#### C13. Login

**Prerequisites:** Credential (atom #11 — `grounded` 2026-05-19) + Session (atom #12 — `grounded` 2026-05-19) + Audit Trail substrate (grounded). **Status: `grounded` 2026-05-20.**

**What it adds.** Credential verification wired to Session issuance, both attested under the verified principal. Login is the composition where a successful `verify` produces a record that persists the authentication result — the Session — rather than returning it as a transient signal. Emergent invariant: a Session is valid only if the Credential it was derived from remains Active; revocation of a Credential invalidates every Session derived from it — the cascade rule. The cascade lives in Login's emergent state (a derivation map from credential to issued sessions), not in either constituent atom, because neither atom alone knows the other exists. A composing system that revokes a Credential without cascading to sessions has produced a record set that violates the cascade invariant but not any invariant of either constituent atom alone — the gap is exactly the composition layer's job to close.

**Standards anchored.** NIST SP 800-63B (authenticator verification producing a bound session); OIDC Core 1.0 (the authorization-code login flow producing an ID token and session); SAML 2.0 (SSO authentication producing a session assertion).

#### C14. Session-Gated Authorization

**Prerequisites:** Session (atom #12 — `grounded` 2026-05-19) + Permissions (grounded). **Status: `grounded` 2026-05-20.**

**What it adds.** Every permission check gated on session validity — expired or revoked sessions reject all permission queries before the Permissions check runs. The gate is a pre-check at the composition boundary, not inside either constituent atom. Principal binding is the load-bearing emergent invariant: the `principal_ref` passed to `Permissions.permitted` is always the principal extracted from the validated session — never a caller-supplied value. A caller cannot interrogate permissions for an arbitrary principal by presenting an arbitrary session token. The composition introduces no cross-atom state; the gate is a sequencing constraint. Forensic coverage of individual authorization decisions requires [Audit Trail](./compositions/audit-trail.md) composed in as a substrate. Four emergent invariants: session gates authorization, principal binding, denial is not rejection, default deny. Grounded on Final Critique 4; three rounds of findings (GA two-tier restructure, implementation-boundary bypass edge case, Permissions fail-safe assumption named).

**Standards anchored.** NIST SP 800-53 AC-3 (Access Enforcement); NIST SP 800-53 AC-12 (Session Termination); NIST SP 800-63B §7 (session management); OWASP ASVS V3.3 (session expiry enforced at the resource level); PCI DSS Requirement 7 + 8; HIPAA §164.312(a)(1) + §164.312(d); ISO/IEC 27001 §A.9.4.1.

#### C15. Capability-Backed Sharing

**Prerequisites:** Capability *(atom #13 — grounded)* + Selective Disclosure (grounded) + Audit Trail substrate (grounded) — all grounded; this composition is unblocked, not started.

**What it adds.** A capability token allocated to authorize disclosure of a record subset; redemption triggers the disclosure and the audit record in one wired step. The emergent invariant is the audit-subject asymmetry: the audit record reads "disclosed by bearer of capability X, allocated by actor Y at time T" — the allocator is identified (via the Capability atom's allocation provenance invariant), the redeemer is structurally not. This is the library's worked example of bearer-token semantics composing with regulated audit without breaking either: Selective Disclosure's invariants are satisfied (a disclosure record exists); Capability's bearer-key semantics are satisfied (no identity check at redemption); the Audit Trail records what was disclosed, by whom it was authorized, and that a bearer redeemed it. The load-bearing wiring decision: the audit-subject asymmetry is defended in-line in the composition because it is a property of the wiring, not of either constituent.

**Standards anchored.** GDPR Article 32 (security of sharing — capability tokens as access-control mechanism for regulated disclosures); HIPAA §164.514 (minimum necessary standard — a Capability can carry a scope constraint limiting what subset is accessible); OCAP literature (bearer-key authorization semantics, as anchored in Capability atom #13).

#### C16. External Onboarding

**Prerequisites:** Invitation (atom #14 — `grounded` 2026-05-19) + Credential (atom #11 — `grounded` 2026-05-19) + Party Identity (grounded) + Audit Trail substrate (grounded). **Status: `grounded` 2026-05-21.**

**What it adds.** The full arc of admitting an external entity: invitation issued by an authorized actor, accepted (binding the invitee's external identity reference at accept time, not initiate time), Party Identity enrolled in Unverified state, credential registered, every step attested in the Audit Trail. Load-bearing emergent invariant: invitation-gates-enrollment — no Party Identity is created unless `Invitation.accept` precedes it in the same `onboard` call, and the `onboarding.completed` Audit Trail event names invitation token, accepting identity reference, party record, and credential in one tamper-evident entry. The actor credential pre-check fires before `Invitation.accept` so unauthenticated callers cannot probe invitation validity. Five emergent invariants. Three rounds of findings resolved in-pattern (audit-first step ordering, invitation-state probing prevention, `duplicate-active-credential` vs `storage-failure` distinction, Invariant 4 qualifier for background-scheduler expiry). Grounded on Final Critique 4.

**Standards anchored.** GDPR Articles 6–7; HIPAA §164.312(a)(1) + §164.312(d); SOC 2 CC6.2; NIST SP 800-63A; SCIM 2.0 RFC 7644; FATF Recommendations 10–12 (enrollment record as the CDD (Customer Due Diligence) starting point; verification is C8's concern).

---

## Summary table

| # | Pattern | Type | Status | Unblocks / Notes |
|---|---------|------|--------|------------------|
| — | Personal Todo, Assignment | Atoms | Personal Todo: `grounded` 2026-05-13; Assignment: `grounded` 2026-05-13 | `productivity` |
| — | Duplicate Prevention, Event Log | Atoms | `grounded` 2026-05-13 | `temporal` |
| — | Provisional Commitment | Atom | `grounded` 2026-05-13 | `resource-lifecycle` |
| — | Actor Identity, Retention Window, Tamper Evidence, Permissions | Atoms | Actor Identity, Tamper Evidence: `grounded` 2026-05-13; Retention Window, Permissions: `grounded` 2026-05-13 | `compliance` |
| — | Subscription, Notification | Atoms | `grounded` 2026-05-13 | `messaging` |
| — | Clinical Observation, Medication Order | Atoms | `grounded` 2026-05-13 | `healthcare` (outside core sequence) |
| 1 | Legal Hold | Atom | `grounded` 2026-05-13 | C1, C7 |
| 2 | Consent | Atom | `grounded` 2026-05-13 | C2, C7, C8 |
| 3 | Soft Delete | Atom | `grounded` 2026-05-13 | C3 |
| 4 | Approval Step | Atom | `grounded` 2026-05-13 | C4 |
| 5 | Selective Disclosure | Atom | `grounded` 2026-05-13 | C6, C7 |
| 6 | Party Identity | Atom | `grounded` 2026-05-14 | C8 |
| 7 | Provenance | Atom | `grounded` 2026-06-04 | Unblocks C12 (Chain of Custody); enriches C6, C7, C8; Alloy model + buggy twin |
| 8 | Capacity Constraint Enforcement | Atom | `grounded` 2026-05-15 | C9 |
| 9 | Workflow / State Machine | Atom | `grounded` 2026-06-04 | Unblocks C10; resolves workflow-category one-atom question; Alloy model + buggy twin |
| 10 | Preference / Personalization | Atom | `grounded` 2026-05-29 | C11; grounded on Final Critique 5; ten hard invariants + Temporal property 11 |
| 11 | Credential | Atom | `grounded` 2026-05-19 | C13 (Login); enriches C16; retires Authentication forthcoming-link in actor-identity.md |
| 12 | Session | Atom | `grounded` 2026-05-19 | C13 (Login), C14 (Session-Gated Authorization) |
| 13 | Capability | Atom | `grounded` 2026-05-19 | C15 (Capability-Backed Sharing) |
| 14 | Invitation | Atom | `grounded` 2026-05-19 | C16 (External Onboarding) |
| — | Undo History | Composition | `grounded` 2026-05-13 | Personal Todo + Event Log |
| — | Idempotent Reservation | Composition | `grounded` 2026-05-13 | Provisional Commitment + Duplicate Prevention |
| — | Audit Trail | Composition | `grounded` 2026-05-13 | Event Log + Actor Identity + Retention Window + Tamper Evidence |
| — | Shared Todo | Composition | `grounded` 2026-05-13 | Personal Todo + Permissions + Assignment |
| — | Notification Fanout | Composition | `grounded` 2026-05-13 | Subscription + Notification |
| — | Attributed Permissions Admin | Composition | `grounded` 2026-05-18 | Permissions + Actor Identity; first two-compliance-atom composition; ships with dynamic Alloy trace model |
| — | Privileged Access Provisioning | Composition | `grounded` 2026-05-20 | Multi-Party Approval + Credential + Session + Capability + Audit Trail; approval-gates-provisioning invariant; session-gated exercise; TLA+ behavioral model ships alongside |
| — | Login | Composition | `grounded` 2026-05-20 | Credential + Session + Audit Trail; cascade invariant: Credential revocation invalidates all derived Sessions; `credential_to_sessions` map is the cascade mechanism |
| C1 | Defensible Retention | Composition | `grounded` 2026-05-13 | Legal Hold + Audit Trail + Retention Window |
| C2 | Consent & Preference Management | Composition | `grounded` 2026-06-04 | Consent + Permissions + Audit Trail (substrate); consent-gates-processing + revocation-propagation binding bijection; TLA+ model |
| C3 | Forensic Recovery | Composition | `grounded` 2026-06-04 | Soft Delete + Audit Trail (substrate); attributed + tamper-evident + full-history-recoverable destruction lifecycle; purge-eligibility gate delegated to C1; TLA+ binding-bijection model |
| C4 | Multi-Party Approval | Composition | `grounded` 2026-05-13 | Approval Step + Permissions + Assignment + Audit Trail |
| C6 | Immutable Transaction Ledger | Composition | Unblocked; not started | Selective Disclosure (grounded) |
| C7 | Data Subject Rights Fulfillment | Composition | Unblocked; not started | Legal Hold + Consent + Selective Disclosure (all grounded) |
| C8 | KYC / Customer Onboarding | Composition | `grounded` 2026-06-03 | Party Identity + Consent (both grounded) |
| C9 | Reservation Lifecycle | Composition | `grounded` 2026-06-04 | Capacity Constraint + Provisional Commitment + Duplicate Prevention + Event Log + Actor Identity; allocation-coherence binding; TLA+ model |
| C10 | Stateful Workflow Execution | Composition | `grounded` 2026-06-04 | Workflow / State Machine + Approval Step + Permissions + Assignment + Audit Trail (substrate); approval-gated transitions (guard *evaluation* re-converges); TLA+ model; first composition to compose Workflow / State Machine |
| C12 | Chain of Custody | Composition | `grounded` 2026-06-04 | Provenance + Audit Trail (substrate, → Actor Identity + Tamper Evidence + Retention Window); records-alone custody proof; TLA+ binding-bijection model; cross-domain pharma≡legal-evidence flagship; first composition to compose Provenance |
| C11 | Preference-Aware Notification Fanout | Composition | Unblocked; not started — **newly unblocked 2026-05-29** | Preference / Personalization (grounded) + existing Subscription, Notification, Notification Fanout |
| C13 | Login | Composition | `grounded` 2026-05-20 | Credential + Session + Audit Trail; cascade invariant: Credential revocation invalidates all derived Sessions via `credential_to_sessions` map |
| C14 | Session-Gated Authorization | Composition | `grounded` 2026-05-20 | Session + Permissions; principal binding as emergent invariant — session-extracted principal gates every permission query |
| C15 | Capability-Backed Sharing | Composition | Unblocked; not started — **newly unblocked 2026-05-20** | Capability + Selective Disclosure + Audit Trail; library's worked example of bearer-token semantics composing with regulated audit |
| C16 | External Onboarding | Composition | `grounded` 2026-05-21 | Invitation + Credential + Party Identity + Audit Trail; invitation-gates-enrollment as load-bearing invariant; actor credential pre-check before Invitation.accept |
| C17 | Authenticated Actor | Composition | Unblocked; not started — **newly unblocked 2026-05-21** | Credential + Actor Identity; owns revocation cascade, secret surface separation, and principal_ref / actor_ref namespace binding. Implementation-discovered gap via APA demo. |
| C18 | Actor Suspension | Composition | Unblocked; not started — **newly unblocked 2026-05-23** | Actor Identity + Permissions + Session + Audit Trail; emergent invariants: atomicity of multi-surface revocation under one transaction, audit completeness over revocation scope, and suspension cascade ordering. Outbound-side counterpart to C13 Login's inbound credential cascade. Named as Demo2 Phase 7 stretch item. |

---

## Formal model coverage

Per `PRESSURE_TESTING.md §Formal models`, Alloy and TLA+ artifacts complement the three-pass methodology but are not prerequisites for `grounded` status. The inventory below records which grounded patterns currently ship formal-model siblings, and which have explicit deferred-formal-models entries in their Lineage notes.

### Shipped

| Pattern | Type | Alloy | TLA+ | Files |
|---|---|---|---|---|
| Capability | Atom | ✓ | — | `atoms/capability.als` + `capability_check.py` |
| Attributed Permissions Admin | Composition | ✓ | ✓ | `compositions/attributed-permissions-admin.als`, `attributedPermissionsAdmin.tla` + `.cfg` |
| Privileged Access Provisioning | Composition | — | ✓ | `compositions/privilegedAccessProvisioning.tla` + `.cfg` + `privileged_access_provisioning_check.py` |
| Login | Composition | — | ✓ | `compositions/login.tla` + `.cfg` |
| External Onboarding | Composition | — | ✓ | `compositions/externalOnboarding.tla` + `.cfg` |
| Session-Gated Authorization | Composition | ✓ | — | `compositions/session-gated-authorization.als` |

### Deferred — recorded in Lineage notes

| Pattern | Type | Candidate artifacts | Recorded |
|---|---|---|---|
| Preference / Personalization | Atom | TLA+ on supersession atomicity (Invariant 4) + linearizable-per-`principal_ref` requirement + check-4 indistinguishability; Alloy on the records relation (preference + configuration records, Invariants 5 and 10, bootstrap-ordering) | `atoms/preference.md` Lineage notes, Phase 4 round, *Deferred work — formal models* item |

### All other grounded patterns

No formal-model siblings shipped and no deferred-formal-models Lineage entry. Per the methodology this is a respectable state — `grounded` is the bar, formal models are the complement. New deferred candidates should land as a *Deferred work — formal models* item in the relevant pattern's Lineage notes (mirroring the Preference pattern), and graduate to this table's *Shipped* section when the artifact lands.

### Convention

A pattern moves from *Deferred* to *Shipped* when (a) the artifact exists at the path named here, (b) a *Formal model* entry is recorded in the pattern's Lineage notes per `PRESSURE_TESTING.md` (what the artifact is, what it checks, bounds/scope, deliberate exclusions, result), and (c) the row in this table is updated. Findings from formal-model runs route through the standard review channel — a contradiction inside the spec becomes a Pass-3-shaped finding in Lineage notes, not an in-flight spec rewrite.

---

## Methodology debts — open

These are methodology-level items the library has accumulated and not yet resolved. They are recorded here so a future session picks them up rather than re-deriving them.

**1. Propagation pass for the 92%-good threshold and three-class finding taxonomy.** [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md) §"What grounded means" was extended on 2026-05-15 with the *92%-good grounding threshold* (a pattern grounds when the Phase 4 clearance gate's foundational findings reach zero, even if refining and rhetorical findings remain) and the *foundational / refining / rhetorical* three-class finding taxonomy. Capacity Constraint Enforcement is the first atom whose Lineage notes were authored under the new taxonomy and the new compact finding-→-fix line format (*F-id — short name — class → fix in one or two sentences*). All other grounded patterns retain Lineage notes in the prior narrative-paragraph form and Status lines that reference the prior unbounded "gate runs again until clean" rule rather than the threshold. A propagation pass should: (a) update each grounded pattern's Status line to reference the threshold and the foundational-density-at-grounding count, (b) refactor each pattern's Lineage notes to the compact format with explicit class labels per finding, (c) process in dependency order (atoms before compositions that name them) so cross-references stay stable. Priority order for the pass: Party Identity (most recent prior gate-clearing atom; the format is most directly comparable), then the canonical regulated-audit stack (Event Log, Actor Identity, Retention Window, Tamper Evidence, Audit Trail), then the remaining atoms and compositions in their grounded-date order.

**2. Methodology cross-reference from existing pattern Lineage notes to the threshold.** Patterns whose Lineage notes refer to "the gate runs again until clean" or similar pre-threshold phrasing should be updated to point at PRESSURE_TESTING.md §"The 92%-good grounding threshold" once the propagation pass runs. This is a substring-search-and-replace rather than a content rewrite; the existing findings and fixes stay, only the methodology rationale anchors update.

**3. Decide whether the threshold counts toward grandfathering.** Patterns grandfathered at `grounded` before the AI adversarial round was codified (per PRESSURE_TESTING.md §"What grounded means" — "Grandfathered patterns") have not been subjected to a Phase 4 clearance gate at all, much less under the 92%-good threshold. The grandfathering clause currently says they will be brought to the full nine-pass standard in a dedicated re-pass sweep. Question for that future sweep: does running Phase 4 under the threshold count as bringing them to standard, or is a pre-threshold-era clean Phase 4 required first? The pragmatic read is yes — the threshold is a refinement on what *clean* means, not a different standard — but the question should be resolved when the sweep is scheduled, not before.

**4. Author-fatigue / round-count signal.** Capacity Constraint Enforcement required two Phase 4 rounds (11 + 9 findings closed across both) before clearing under the new threshold. The library's prior gate-clearing pattern (Party Identity) cleared in one round (6 findings). The two-round count for CCE is correlated with the atom's surface area — 14 invariants, four host obligations, two state machines, regulated overlay, eight composing patterns. The empirical pattern: more surface = more rounds, with diminishing structural-finding density per round. The threshold is what makes the loop terminate cleanly. No action required, but a useful data point for future rich-surface atoms (Workflow / State Machine and Provenance are likely candidates).

**6. Formal verification pass — Alloy for snapshots, TLA+ for traces.** The library has no codified formal verification step. The three-pass methodology (GRID / EOS / Linus) plus Final Critique does the intellectual work that formal verification depends on — defining system state, naming actions, stating invariants, eliminating ambiguity — but stops short of machine-checked verification. The discovery (captured in `DISCOVERIES.md`, 2026-05-19): once a Grace Commons spec is grounded, generating Alloy or TLA+ models from it is largely mechanical, because the spec already contains the named actions, preconditions, postconditions, and numbered invariants the model requires. The feedback loop is: *English specification → formal model → counterexamples → refined specification*. The formal pass is not a separate discipline; it is a mechanical extension of the same thinking.

The tool split, by question type rather than by artifact type: **Alloy handles snapshot questions** — "is there any configuration of state where this invariant is violated?" (structural soundness, impossible constraints, reference validity, audit chain completeness). **TLA+ handles trace questions** — "is there any sequence of steps where this property breaks?" (concurrent action invariant violations, atomicity of operations, failures leaving state unchanged, temporal always/eventually properties, interleaving possibilities). In practice, atoms tend to generate structural questions (Alloy) and compositions tend to generate temporal and concurrency questions (TLA+), but the mapping is by question type, not artifact type — Invitation's concurrent-accept is TLA+ territory even though it is an atom; a simple two-atom structural composition may be fully checkable in Alloy.

The ordering is fixed by the discovery: prose first, formal second. The English spec is canonical; the formal model translates from it, not the other way around. A formal model written before the prose spec is grounded is built on shifting ground — the three-pass review will change the spec and break the model.

What needs to land in `PRESSURE_TESTING.md`: a named Step 4 — formal verification — with the Alloy/TLA+ question-type split, the prose-first ordering rationale, and guidance on when the step is required (regulated atoms and compositions with concurrency-critical invariants) vs. optional (structural-only compositions with no temporal emergent invariants). The Attributed Permissions Admin composition is the canonical worked example: it shipped with a static Alloy structural model and a dynamic Alloy 6 LTL (Linear Temporal Logic) model verifying its load-bearing temporal claims.

**7. Logic Confinement Principle — full application to projector and verification harness.** The Logic Confinement Principle is now a first-class architectural commitment in `EXECUTION_CONTRACT.md`. The Beacon reference implementation satisfies rules 1 (core is pure), 2 (single seam), 3 (explicit inputs for clock/id), and 6 (async at the edge) fully. Two rules remain partially satisfied: rule 4 (explicit construction — `createEvent` before `appendEvent` — rather than hidden work inside transactional functions) and rule 5 (compiler-emitted local invariant assertions, not distributed runtime assumptions). Closing these requires: (a) separating event construction from event insertion in the composition layer, making the constructed event an explicit value before the transaction boundary; (b) designing the projector to emit local invariant assertions compiled from each atom's named invariant set. First natural targets: the projector architecture and the verification harness derivation pipeline. Scoped to the NLnet grant period as a named deliverable; surfaced 2026-05-29.

**5. Compliance-folder sustainability under the #11–#14 cluster — RESOLVED (2026-06-08).** This debt anticipated that Credential, Session, Capability, and Invitation (#11–#14) would overload a `compliance/` folder with atoms that carry regulated surfaces (NIST 800-63B, PCI DSS, OWASP ASVS, GDPR) but are not *of* compliance — they are authentication, session-management, object-capability, and onboarding primitives whose regulated surface exists only because regulation touches authentication and access. The forcing function landed and was resolved structurally rather than by re-foldering: the usage-derived taxonomy dissolved the category folders entirely, atoms are stored flat, and `regulated` / `security` are **derived overlays** read from the composition graph — so an authentication primitive carries the security and regulated overlays without being filed *under* compliance, and the "which folder" question disappears rather than being re-answered. See [`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md) and the 2026-06-08 entry in [`DISCOVERIES.md`](./DISCOVERIES.md).

**8. Spec-to-implementation lineage manifest (the "recipe").** Each reference implementation (Beacon, the Multi-Party Approval demo, and every future projection) currently records its derivation from the spec corpus only implicitly — recoverable only by reverse-engineering imports and domain-file names, as a 2026-05-29 audit of Beacon's spec set demonstrated when its composition list had to be inferred rather than read. That implicit lineage is a gap, not a convenience: the grant's round-trip benchmark ("regenerate the reference implementation from its grounded specifications") cannot run without an explicit statement of *which* specifications, and the implementation-discovered-findings loop ([`CLAUDE.md`](./CLAUDE.md) §"Implementation-discovered findings") cannot close without it either — a spec that moves on Final Critique N must be able to name the implementations it has just made stale, and a finding surfaced during a build must route to a specific spec passage rather than to a whole file. The deliverable is a machine-readable per-implementation manifest that is (a) **bidirectional** — implementation → the spec files and grounding versions it derives from, and spec → its dependent implementations; (b) **version-pinned** — each dependency carries the spec's grounding marker or commit so drift is detectable; and (c) **granular enough to route findings** — a code symbol (table, guard, invariant check) traces to a named action or numbered invariant in the spec, not merely to the file. Discipline: the manifest is generated from the implementation's actual references and CI-checked against the corpus, never hand-authored — a hand-maintained lineage file is itself an unverified artifact, exactly the drift the methodology exists to prevent. The canonical manifest is structured; the human-readable lineage view is a projection of it — Grace Commons applied to itself. Scoped to the NLnet grant period as a named deliverable underpinning both the projector and the round-trip benchmark; surfaced 2026-05-29.

---

## Taxonomy question — resolved (2026-06-08)

The `workflow` category's one-atom concern was **resolved** 2026-06-04: it stands on two atoms — Approval Step (the fixed-state pole — states fixed by the atom) and Workflow / State Machine (the general-declared pole — states declared by the deployment). The broader axial-split question is now **also resolved** — see below.

**The broader axial split — resolved (2026-06-08).** The categories (`productivity`, `temporal`, `resource-lifecycle`, `compliance`, `messaging`, `workflow`, `healthcare`) did mix conceptual axes — `healthcare` domain-scoped, the others concept-scoped, `compliance` conflating pure-infrastructure atoms with atoms-that-happen-to-be-regulated. The usage-derived taxonomy ([`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md)) resolved it: atoms are stored flat, cross-cutting classification (regulated, security, standards) is **derived** from the composition graph as overlays, and `domain` is the single intrinsic, EOS-gated axis (seeded on Medication Order; held on Clinical Observation as the masquerade case). The resolution came out sharper than the "regulation as a `regulated: true` flag" framing once guessed here: regulation is not a stored flag but a *derived* fact. The deferral discipline paid off — waiting until the catalog forced the cut let classification be read off a reviewed substrate (the composition graph) rather than guessed one folder per atom.

**Capability-vs-Invitation bearer-token question.** Both Capability (atom #13) and Invitation (atom #14) use bearer-token transport: the holder of the token is authorized to take an action, with no identity check at the point of action. Both are time-bounded and both can be revoked. The argued distinction is that Capability is for *resource access* — the token authorizes access to a specific resource or action, and the redeemer's identity is permanently and intentionally irrelevant — while Invitation is for *identity onboarding* — the token authorizes a single entry event, and the resolution of that event binds an identity that is then permanently recorded. The structural difference is `Declined` as a first-class outcome: a Capability has no `declined` state because a bearer either redeems it or doesn't; an Invitation carries `Declined` as a named terminal state because a human's deliberate refusal is semantically distinct from non-use. The authoring discipline resolves this: draft Capability first (atom #13) and use it as the Pass 2 mirror when drafting Invitation. If Invitation cannot be specified as freestanding — if its specification must name Capability's structure to distinguish itself — the two collapse into one atom (bearer-token-with-lifecycle) and the distinction is carried as a mode or subtype rather than a separate atom.

---

## Q3 2026 – Q2 2027: Year 1 Goal — ~100 Near-Perfect Atoms

**Target:** Reach approximately 100 high-quality, pressure-tested atoms and compositions by the end of the first year, with strong healthcare coverage and initial cross-domain atoms. The current 25 atoms and 13 compositions were produced in roughly three weeks while simultaneously building the methodology, the framework, and the live demo — with a second architect and dedicated tooling, this target is directional but realistic.

### Key Initiatives

**1. Logic Confinement Principle.**
Formalize and fully apply the Logic Confinement Principle across the entire library and tooling. Core must remain pure (synchronous, deterministic, no I/O, no implicit time, randomness, or crypto). Single seam discipline, explicit inputs, behavior as data transformation, and async-at-the-edge rules apply to all projections. Update projector and verification harness to enforce these constraints mechanically. Beacon demo refactored to fully conform as the reference implementation.

**2. Tag-Based Ontology (not folders).**
Replace folder hierarchy with a rich, multi-dimensional tagging system driven by data rather than card-sorting. Tags will cover: Domain, Behavioral Property, Lifecycle Stage, Regulatory Anchor, Composition Role, Technical Property, Maturity. Enables dynamic views — "All EHDS-relevant atoms", "All audit-related patterns", "Cross-domain universals". Ontology evolves organically from actual composition usage, regulatory overlap, and implementation data. The usage-derived taxonomy (flat storage + derived overlays, landed 2026-06-08) is the first realization of this tag-based direction — overlays *are* data-driven tags read off the composition graph; this initiative extends it into a richer multi-dimensional ontology.

**3. Healthcare Core Expansion.**
Ground 55–65 new healthcare-focused atoms, building on the existing Clinical Observation and Medication Order base. Primary downstream target: EHDS implementation patterns. A first triaged candidate backlog — separating genuinely-new atoms from domain specializations of existing concept-scoped atoms — is recorded in §"Healthcare atom backlog" below; the expansion draws from that deduplicated backlog, not a raw wishlist.

**4. Cross-Domain Attack.**
Begin deliberate extraction and generalization of universal atoms — Audit Trail, Multi-Party Approval, Defensible Retention, Consent Propagation variants and related patterns. This phase will intentionally stress and evolve the ontology.

**5. Tooling Maturity.**
Deliver second-author-ready projector and verification harness — the core NLnet grant deliverable. The tooling makes the ~100-atom target achievable by a two-person team within the grant period.

---

## Healthcare atom backlog — triaged candidate list (2026-06-04)

> Seeded from an external brainstorm of OpenEMR / Open Hospital atom candidates and triaged against the library's reuse thesis. The thesis matters here more than anywhere: most healthcare "atoms" people list are **domain specializations of existing concept-scoped atoms, not new freestanding concepts**. "Audit Logging" is not a new atom — it is Event Log + Audit Trail. "Patient Identity" is Party Identity with a medical-record-number field. Grounding redundant domain-named atoms would defeat the cross-domain reuse the library exists to demonstrate. This section records the triage so the Healthcare Core Expansion initiative draws from a deduplicated backlog.
>
> Triage verdicts: **grounded** (already in the library); **reuse** (covered by an existing pattern — no new atom; the candidate is that pattern applied to a healthcare subject); **not-an-atom** (deployment config, a reference enumeration, a wire format, a foreign-key link, or a projection — not a stateful EOS concept with its own state machine, actions, and invariants); **new-atom** (a genuinely freestanding concept worth grounding, subject to the EOS Pass-2 test); **composition** (an application of two or more atoms).

### Already grounded, or covered by reuse (no new atom)

| Candidate | Verdict | Covered by |
|---|---|---|
| Medication Order | grounded | `atoms/medication-order.md` |
| Vital Signs Observation | reuse | Clinical Observation (vitals *are* clinical observations) |
| Patient Identity | reuse | Party Identity (a patient is a party; MRN is a deployment field) |
| Patient Consent | reuse | Consent (purpose-scoped agreement; treatment-consent and HIPAA authorization are scopes) |
| Patient Record Access / PHI Access Event | reuse | Permissions + Session-Gated Authorization (C14) + Selective Disclosure + Audit Trail |
| Encounter Status / Order Status | reuse | Workflow / State Machine (a declared status lifecycle) |
| Appointment Slot / Booking / Cancellation / Provider Schedule | reuse | Capacity Constraint Enforcement + Provisional Commitment + Reservation Lifecycle (C9); provider availability is a time-indexed capacity pool |
| User Authentication | reuse | Credential + Session + Login (C13) |
| Role-Based Access | reuse | Permissions (a role is a named reusable grant set — see the *Role* new-atom note below if the bundle itself earns an atom) |
| Audit Logging | reuse | Event Log + Audit Trail (the canonical "do not re-invent the audit atom") |
| Data Retention Rule | reuse | Retention Window + Defensible Retention (C1) |
| Provider Credential (authentication sense) | reuse | Credential |
| Patient Demographics | not-an-atom | a mutable attribute schema; its correction history is Clinical Observation's amendment-chain shape, not a new concept |
| Encounter Type | not-an-atom | a reference enumeration (a code) |
| Billing Encounter Link | not-an-atom | a cross-reference / foreign key — composition-layer state, not an atom |
| FHIR Resource Export / HL7 Message / Document Import / External System Sync | not-an-atom | serialization / wire formats / integration projections; PHI crossing the boundary is a Selective Disclosure event, message delivery is Notification, idempotent receipt is Duplicate Prevention, document custody is Provenance |
| Facility Configuration | not-an-atom | deployment configuration |

### Genuinely-new atom candidates (worth grounding, pending EOS Pass-2)

| Candidate | Category | One-line scope | EOS note / composes |
|---|---|---|---|
| **Problem / Condition Entry** | healthcare | a longitudinal clinical condition with an active → resolved/inactive status lifecycle and an amendment trail; Problem-List entries, diagnoses, and Allergy Records are instances | distinct from Clinical Observation (a point-in-time measurement) — a condition persists and changes status over time; composes Clinical Observation, Provenance, Audit Trail. **Highest-leverage healthcare atom on this list.** |
| **Fulfillable Order** | healthcare / generic | the general order-with-fulfillment lifecycle (placed, in-progress, then completed or cancelled, with a result attachment); Lab Order, Procedure Order, and Medication Order are specializations | the general primitive Medication Order is a specific case of (as Approval Step is to Workflow / State Machine); Pass 2 decides whether to extract the general atom or keep per-domain order atoms |
| **Clinical Administration Record** | healthcare | an immutable "substance/treatment X was administered to patient P at time T" event (immunization, medication administration, infusion) with site/dose/lot | borderline — may be Clinical Observation specialized; resolve at authoring whether administration-vs-observation earns its own atom. Consumed by the MAR composition |
| **Record Merge / Identity Reconciliation** | resource-lifecycle (generic) | merge two duplicate identity records into a surviving record, with merge provenance and (often) reversible un-merge; Patient Merge, customer dedup, party reconciliation are instances | own state machine (two sources to one merged record, reversible); composes Party Identity + Provenance + Audit Trail |
| **Qualification / Credentialing Record** | compliance (generic) | a verifiable professional qualification — license, board certification, clinical privilege — with issuer, scope, expiry, and verification status | the *licensure* sense of "Provider Credential", **distinct from the authentication Credential atom** (name-collision flag); composes Actor Identity, Retention Window. Recurs across healthcare licensure and financial KYC |
| **Ledger Entry / Posting** | resource-lifecycle (generic, financial) | an immutable financial posting against an account (debit or credit) with a reference and reversal-by-new-entry discipline | Charge Capture and Payment Posting are instances; the home composition is Immutable Transaction Ledger (C6) |
| **Amendable Document / Signed Note** | generic | a narrative record with addendum/amendment history and an author signature; Clinical Note is the canonical instance | likely covered by Clinical Observation's amendment-chain shape + an Actor Identity signature — resolve at authoring whether a distinct document atom is warranted |
| **Role / Permission Bundle** | compliance | a named, reusable set of permission grants assignable to actors (the "role" in RBAC) | borderline — Permissions composes individual grants; a Role atom adds the reusable named bundle + assignment. Decide whether the grouping earns an atom or is a Permissions composition |
| **Time-Slot Schedule** | temporal / resource-lifecycle | a recurring time-indexed availability calendar (a provider's bookable slots over time) | borderline — Capacity Constraint Enforcement covers the bounded-pool side; a distinct atom is warranted only if recurrence / calendar arithmetic recurs widely |

### Healthcare composition candidates (applications, not atoms)

- **Patient Record** — Party Identity + Problem/Condition entries + Clinical Observations + a Workflow / State Machine encounter lifecycle, under Audit Trail.
- **Patient Encounter** — an episode of care: party references (patient, providers) + a Workflow / State Machine encounter-status lifecycle + the observations and orders recorded during it.
- **Medication Administration Record (MAR)** — Medication Order + Clinical Administration Record + Chain of Custody (C12) for the drug, under Audit Trail.
- **Prescription Fulfillment** — Medication Order + the dispensing event + Chain of Custody.
- **Insurance Claim Lifecycle** — a Workflow / State Machine claim lifecycle (submitted, adjudicated, then paid/denied/appealed) + Ledger Entries + an encounter link, under Audit Trail.
- **Clinical Trial Data Capture** and **Immunization Registry Reporting** — downstream healthcare compositions noted elsewhere as worked-example targets.

### Sequencing note

The recommended first picks when Healthcare Core Expansion begins are the three highest-leverage genuinely-new atoms: **Problem / Condition Entry** (anchors the longitudinal clinical-record surface; unblocks Patient Record), **Fulfillable Order** (generalizes Medication Order; unblocks Lab and Procedure orders), and **Qualification / Credentialing Record** (recurs across healthcare licensure and financial KYC). Every candidate above must still clear the EOS Pass-2 freestanding test before it earns an atom file — the entries flagged *borderline* are flagged precisely because that test may route them back to an existing pattern rather than a new atom.

---

*The roadmap is a living document. Patterns are added as the library's content forces resolution of open questions, not on a fixed schedule.*
