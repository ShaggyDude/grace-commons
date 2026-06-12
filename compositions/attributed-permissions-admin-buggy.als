module attributed_permissions_admin_buggy

/*
 * BUGGY TWIN — DO NOT FIX.
 *
 * This is attributed-permissions-admin.als with the
 * Invariant7_Attestation_Exclusivity fact commented out (marked
 * BUGGY below). It deliberately re-introduces the hazard the spec
 * closed when the Round 1 model surfaced Invariant 7: with no
 * exclusivity constraint, the state space permits one attestation
 * to be double-spent across administrative acts — a retried
 * issue_grant pairing one attestation with two grant records, or
 * a revocation reusing the issuance attestation as its proof.
 *
 * The harness must REJECT this twin
 * (tools/harness/check.mjs <this file> --buggy):
 *   expected COUNTEREXAMPLE (SAT):
 *       Issuance_Revocation_Attestations_Differ
 *       Grant_Attribution_Injective
 *       Issuance_Revocation_Pools_Disjoint
 *       Invariant_7_Always
 *   everything else: checks hold, runs satisfiable.
 *
 * This file is the committed form of the Round 4 regression gate
 * and the vacuity guard required by pressure-testing.md
 * §What "the model exists and verifies" means (criterion 2).
 * Regenerate it from the canonical file whenever the canonical
 * model changes: copy, rename the module, comment out the
 * Invariant 7 fact.
 */

/*
 * Alloy model: Attributed Permissions Admin
 * Corresponds to: compositions/attributed-permissions-admin.md
 * Status: Round 4 — unified temporal model (Alloy 6 `var` state)
 *
 * ---------------------------------------------------------------
 * HOW TO READ THIS FILE
 *
 * Alloy thinks in possible worlds. With Alloy 6's `var` keyword a
 * world is no longer a single snapshot: it is a *trace* — an
 * initial state plus a successor state for every time step,
 * looping back on itself so every trace is infinite. Non-`var`
 * sigs and fields hold the same value in every state of a trace;
 * `var` fields may change between states.
 *
 * Two semantic rules carry this whole file. Both are easy to get
 * wrong, so both are stated up front:
 *
 *   RULE 1. A formula with NO temporal operators speaks only
 *           about the FIRST state of the trace. `fact { P }`
 *           means "P holds at time zero" — nothing more.
 *   RULE 2. To speak about every state, you must say `always P`.
 *
 * Round 3 worked around Rule 1 by giving the dynamic model its
 * own Dyn*-prefixed sigs, so the static facts could stay
 * non-temporal in the same file without being reinterpreted.
 * Round 4 — this file — removes that workaround and instead uses
 * Rule 1 deliberately:
 *
 *   - The spec's snapshot invariants are stated as non-temporal
 *     facts. By Rule 1 they constrain the INITIAL state only:
 *     every trace begins in an arbitrary valid snapshot (not
 *     necessarily an empty one).
 *   - The composition's operations (issue_grant, revoke_grant)
 *     are the only dynamics, imposed by one temporal fact:
 *     `always (some transition fires)`.
 *   - That the invariants then hold in EVERY state is not assumed
 *     anywhere. It is PROVEN: each invariant fact has a matching
 *     assertion under `always`, checked against the transition
 *     system (see PRESERVATION CHECKS below).
 *
 * So nothing here silently weakened from "all states" to "initial
 * state" in the Alloy 6 move: every initial-state fact has a
 * corresponding preservation check, and the checks are the
 * evidence. This is the inductive-invariant idiom — the facts are
 * the base case, the transitions are the inductive step, and the
 * `check` commands discharge the induction within scope.
 *
 * If a `check` comes back clean: no counterexample within scope.
 * That's strong evidence, not a proof. (For proofs: Alloy* or
 * TLA+ — see the TLA+ sibling, attributedPermissionsAdmin.tla.)
 * If a `check` finds a counterexample: a real trace violates the
 * claim. Either the claim is wrong or a constraint is missing.
 *
 * `run` asks for a satisfying instance — the sanity check that
 * the constraints aren't so tight they make everything impossible
 * (and the vacuity guard each `check` is paired against).
 *
 * ---------------------------------------------------------------
 * WHAT THIS MODEL COVERS
 *
 *   - The two constituent atoms' core structure (Grant,
 *     Attestation) and store membership over time
 *   - The composition's emergent state (grant_attribution,
 *     revocation_attribution, orphan log)
 *   - Application-level Invariants 1, 2, and 7 as initial-state
 *     facts, each with a preservation check under `always`
 *   - The Round 1/2 snapshot checks, preserved as initial-state
 *     checks (the regression gate — see below)
 *   - The temporal claims T1–T6, restated over the unified model.
 *     Traces now start from any valid snapshot rather than only
 *     the empty state, so every `always` claim is strictly
 *     stronger than its Round 3 counterpart, and orphan-log
 *     durability (T6) is no longer vacuous — traces may begin
 *     with a populated orphan log whose entries must persist.
 *   - Invariant 4 (time monotonicity) deferred — requires
 *     timestamps; discharged on the TLA+ sibling under a logical
 *     clock. Invariant 5 (constituent invariants preserved) is
 *     implicit in typing. Failure-path orphan CREATION remains
 *     unmodeled: happy-path transitions discharge the load-bearing
 *     temporal claims; rejection branches that populate the orphan
 *     log are the natural later extension if a failure-case
 *     evidence requirement arises.
 *
 * ---------------------------------------------------------------
 * REGRESSION GATE — the Round 1 evidentiary record, kept live
 *
 * Invariant 7 (Attestation Exclusivity) exists because the Round 1
 * model found it missing. That evidence is preserved as an
 * executable property of this file:
 *
 *   With the Invariant7_Attestation_Exclusivity fact commented
 *   out, EXACTLY these four commands find counterexamples:
 *       Issuance_Revocation_Attestations_Differ
 *       Grant_Attribution_Injective
 *       Issuance_Revocation_Pools_Disjoint
 *       Invariant_7_Always
 *   With the fact present, every check in the file is clean and
 *   every run is satisfiable.
 *
 * The committed buggy twin (attributed-permissions-admin-buggy.als)
 * is exactly this file with that fact commented out; the harness
 * must reject it (tools/harness/check.mjs <twin> --buggy). If the
 * set of failing checks ever differs from the four above, the
 * model's semantics have shifted: stop and diagnose before
 * shipping.
 * ---------------------------------------------------------------
 */


-- ==============================================================
-- BASE TYPES
--
-- The spec treats all of these as opaque references — we don't
-- care what's inside a SubjectRef. Alloy models them as
-- uninterpreted atoms. We care only about the *relations* between
-- things, not their internal content. None of these vary over
-- time.
-- ==============================================================

sig SubjectRef {}   -- who receives the permission
sig ActionScope {}  -- what the permission covers
sig ActorRef {}     -- who grants or revokes
sig ActionRef {}    -- the proposal_ref passed to Actor Identity's attest


-- ==============================================================
-- GRANT STATUS
--
-- `enum` is shorthand for the abstract-sig pattern:
--
--     abstract sig GrantStatus {}
--     one sig Active, Revoked extends GrantStatus {}
--
-- i.e., exactly one Active atom and one Revoked atom exist, every
-- GrantStatus is one of the two, and no atom is a bare
-- GrantStatus. The formal layer prefers the compressed canonical
-- form; the teaching burden lives here in the comment, not in the
-- syntax. (Round 4 — same rationale as preferring pure TLA+ over
-- PlusCal on the TLA+ sibling.)
-- ==============================================================

enum GrantStatus { Active, Revoked }


-- ==============================================================
-- ATOM: PERMISSIONS — the grant store
--
-- subject and scope are a grant's immutable identity, so they are
-- plain fields. status is the one thing about a grant that
-- changes over its life, so it is `var`. It is `lone` rather than
-- `one` because Alloy atoms exist for the whole trace: a Grant
-- atom that has not (yet) been issued is simply outside
-- grants_in_store and has NO status. The WELL-FORMED SNAPSHOT
-- fact pins that discipline at time zero; Wellformed_Always
-- proves the operations keep it.
--
-- In Alloy, fields on a sig are *relations*, not slots —
-- status is a relation Grant -> GrantStatus, kept a partial
-- function by `lone`.
-- ==============================================================

sig Grant {
    subject    : one SubjectRef,
    scope      : one ActionScope,
    var status : lone GrantStatus
}


-- ==============================================================
-- ATOM: ACTOR IDENTITY — the attestation store
--
-- Each Attestation binds one actor to one action_ref, immutably:
-- attestations are point-in-time records, so nothing on this sig
-- is `var`. Whether an attestation is currently *stored* is store
-- membership (attestations_in_store below), not a property of the
-- record. (Credential validation is Authenticated Actor's
-- concern — not modeled here.)
-- ==============================================================

sig Attestation {
    actor      : one ActorRef,
    action_ref : one ActionRef
}


-- ==============================================================
-- SYSTEM STATE — the stores plus the composition's emergent state
--
-- `one sig System` is a singleton holding all mutable state:
--
--   grants_in_store / attestations_in_store — which atoms are
--   live in the Permissions store / Actor Identity store at the
--   current time. This is the store-scoping discipline from
--   pressure-testing.md §Formal-model authoring pitfalls: a
--   pre/post pair is the same entity at two times, never two
--   entities at one time, so facts quantify over store members,
--   not over all atoms.
--
--   grant_attribution / revocation_attribution — the composition's
--   emergent state: the pairing maps. `Grant -> lone Attestation`
--   is a *partial function* — each Grant maps to at most one
--   Attestation (`lone` = zero or one).
--
--   orphan_log — attestations recorded as orphaned by failed
--   issuance/revocation attempts: Invariant 8's surface.
--
-- NOTE (Round 4): Round 3 carried a Pairing_Map_Range_Valid fact
-- restating what the two map declarations already enforce — that
-- their ranges contain only Attestation atoms. A fact entailed by
-- a declaration is inert; worse, if a later edit weakens the
-- declaration, the leftover fact silently re-imposes the
-- constraint and masks the edit. The fact is removed. The intent
-- is documented here, and its checkable form is the
-- Pairing_Map_Range_Valid assert + check at the end of this file
-- — the right instrument for "redundant today, loud if it ever
-- stops being redundant."
-- ==============================================================

one sig System {
    var grants_in_store        : set Grant,
    var attestations_in_store  : set Attestation,
    var grant_attribution      : Grant -> lone Attestation,
    var revocation_attribution : Grant -> lone Attestation,
    var orphan_log             : set Attestation
}


-- ==============================================================
-- WELL-FORMED SNAPSHOT (initial state)
--
-- Modeling scaffolding, not a spec invariant: this says what "a
-- snapshot of this system" means, so traces start from a
-- meaningful state rather than arbitrary garbage (a status on a
-- grant no store contains; a pairing pointing at an attestation
-- that was never recorded).
--
-- Per RULE 1 in the header, this fact constrains ONLY the initial
-- state — and that is not a silent weakening, because
-- Wellformed_Always below proves the operations preserve every
-- conjunct in every reachable state.
-- ==============================================================

fact Wellformed_Snapshot {
    -- status is defined exactly for stored grants
    all g : System.grants_in_store | one g.status
    all g : Grant - System.grants_in_store | no g.status

    -- the pairing maps speak only of stored grants...
    System.grant_attribution.Attestation in System.grants_in_store
    System.revocation_attribution.Attestation in System.grants_in_store

    -- ...and point only at stored attestations (the structural
    -- consequence of attest-before-record; see Attest_Before_Record)
    System.grant_attribution[Grant] in System.attestations_in_store
    System.revocation_attribution[Grant] in System.attestations_in_store

    -- the orphan log records stored attestations
    System.orphan_log in System.attestations_in_store
}


-- ==============================================================
-- INVARIANT 1 — Attribution completeness (initial state)
--
-- Every stored Grant has *exactly one* grant_attribution entry.
-- `one` in a quantified expression means exactly one atom
-- satisfies it — here, exactly one Attestation is related to g
-- via grant_attribution.
--
-- This is the central invariant: no grant without its
-- attribution. The spec qualifies it as conditional on the
-- pairing-write durability requirement; we model the nominal
-- (non-failure) case.
--
-- Initial state only (RULE 1); preservation by the operations is
-- proven at Invariant_1_Always.
-- ==============================================================

fact Attribution_Completeness {
    all g : System.grants_in_store | one System.grant_attribution[g]
}


-- ==============================================================
-- INVARIANT 2 — Revocation attribution (initial state)
--
-- Every stored Revoked grant has exactly one
-- revocation_attribution entry; Active grants have none.
-- `implies` is logical implication; `no` means the relation is
-- empty for that Grant.
--
-- Initial state only (RULE 1); preservation is proven at
-- Invariant_2_Always.
-- ==============================================================

fact Revocation_Attribution {
    all g : System.grants_in_store |
        g.status = Revoked implies one System.revocation_attribution[g]
}

fact Active_Grants_Have_No_Revocation_Attribution {
    all g : System.grants_in_store |
        g.status = Active implies no System.revocation_attribution[g]
}


-- ==============================================================
-- CHECK: INVARIANT 3 — Attribution recoverability (initial state)
--
-- The spec states: given any grant_id, the composition's records
-- yield the issuance attestation. This follows trivially from
-- Invariant 1 — if grant_attribution is total over stored grants,
-- recoverability is guaranteed. We assert it and let Alloy verify
-- the entailment.
--
-- Expected result: CLEAN (no counterexample) — it depends only on
-- the Invariant 1 fact, so it stays clean even in the buggy twin.
--
-- The `1..1 steps` scope makes this a pure snapshot check: a
-- one-state trace (held in place by the stutter transition), so
-- the command searches exactly the space of valid initial states,
-- as the Round 1 static model did.
-- ==============================================================

assert Attribution_Recoverability {
    all g : System.grants_in_store | some System.grant_attribution[g]
}

check Attribution_Recoverability for 6 but 1..1 steps


-- ==============================================================
-- CHECK: Are issuance and revocation attestations always distinct?
--
-- For a stored Revoked grant, Invariant 1 gives an issuance
-- attestation and Invariant 2 gives a revocation attestation. Are
-- these guaranteed to be *different* Attestation atoms?
--
-- The spec relies on the proposal format to ensure this: the
-- grant proposal includes a nonce and the revocation proposal is
-- {grant_id, requested_at} — structurally different action_refs.
-- Round 1 found that argument lived in Configuration but was
-- never promoted to a named invariant — so the state space
-- *permitted* the violation, and any conforming implementation
-- was allowed to produce it.
--
-- Expected result: CLEAN with the Invariant 7 fact below present.
-- With that fact commented out (the buggy twin), COUNTEREXAMPLE:
-- the same Attestation atom in both grant_attribution[g] and
-- revocation_attribution[g] for a Revoked grant — one attestation
-- double-spent across two administrative acts. This check is part
-- of the regression gate (see header).
-- ==============================================================

assert Issuance_Revocation_Attestations_Differ {
    all g : System.grants_in_store | g.status = Revoked implies
        System.grant_attribution[g] != System.revocation_attribution[g]
}

check Issuance_Revocation_Attestations_Differ for 5 but 1..1 steps


-- ==============================================================
-- CHECK: Is grant_attribution injective?
--
-- Injectivity: no two different grants share the same issuance
-- attestation. The spec's nonce mechanism guarantees this in
-- practice — every grant proposal gets a fresh nonce, so every
-- attestation binds a distinct proposal_ref. But a mechanism
-- argument in Configuration is not an invariant over the state
-- space.
--
-- Expected result: CLEAN with the Invariant 7 fact present.
-- Without it (buggy twin), COUNTEREXAMPLE: two stored grants
-- (g1, g2) with grant_attribution[g1] = grant_attribution[g2] —
-- e.g., a retried issue_grant pairing one attestation with two
-- grant records. Part of the regression gate.
-- ==============================================================

assert Grant_Attribution_Injective {
    all a : Attestation | lone System.grant_attribution.a
}

check Grant_Attribution_Injective for 5 but 1..1 steps


-- ==============================================================
-- CHECK: Do issuance and revocation attestation pools overlap?
--
-- Can the same Attestation be the issuance proof for one grant
-- AND the revocation proof for a different grant — e.g., a
-- revocation reusing an issuance attestation as its proof?
--
-- Expected result: CLEAN with the Invariant 7 fact present.
-- Without it (buggy twin), COUNTEREXAMPLE: the two ranges are
-- otherwise unconstrained and overlap freely, breaking the audit
-- chain. Part of the regression gate.
-- ==============================================================

assert Issuance_Revocation_Pools_Disjoint {
    no (System.grant_attribution[Grant] & System.revocation_attribution[Grant])
}

check Issuance_Revocation_Pools_Disjoint for 5 but 1..1 steps


-- ==============================================================
-- INVARIANT 7 — Attestation Exclusivity (initial state)
--
-- Surfaced by the Round 1 model; closed in the spec before
-- Round 2. The three checks above all found counterexamples
-- without this fact; with it, all three pass clean. The prose
-- review had argued exclusivity held via the nonce mechanism in
-- Configuration; the model showed that a mechanism argument does
-- not substitute for a named, checkable invariant — Invariant 7
-- moved it from "our mechanism happens to prevent it" to "any
-- conforming implementation must."
--
-- Three properties in one fact:
--   (1) grant_attribution is injective — no shared issuance proofs
--   (2) revocation_attribution is injective — no shared
--       revocation proofs
--   (3) the two ranges are disjoint — no attestation serves both
--       roles
--
-- Initial state only (RULE 1). That the OPERATIONS maintain
-- exclusivity from a valid start — i.e., that the spec's nonce
-- mechanism, rendered as the freshness precondition on the
-- transitions below, actually enforces this invariant over time —
-- is proven at Invariant_7_Always.
--
-- THE REGRESSION GATE LIVES HERE: commenting out this one fact
-- must flip exactly the three checks above plus Invariant_7_Always
-- to COUNTEREXAMPLE (that is the committed buggy twin), and
-- nothing else.
-- ==============================================================

-- BUGGY fact Invariant7_Attestation_Exclusivity {
-- BUGGY     -- (1) Each Attestation appears at most once in grant_attribution
-- BUGGY     all a : Attestation | lone System.grant_attribution.a
--
-- BUGGY     -- (2) Each Attestation appears at most once in revocation_attribution
-- BUGGY     all a : Attestation | lone System.revocation_attribution.a
--
-- BUGGY     -- (3) The two pools are disjoint: no attestation serves both roles
-- BUGGY     no (System.grant_attribution[Grant] & System.revocation_attribution[Grant])
-- BUGGY }


-- ==============================================================
-- RUN: Show a valid snapshot with at least one Active grant
--
-- `run` finds a satisfying instance — a world where the predicate
-- holds and all facts are satisfied. This is the sanity check: if
-- `run` finds nothing, the facts are contradictory
-- (over-constrained). Each snapshot check above is non-vacuous
-- because these runs are satisfiable over the same initial-state
-- space.
-- ==============================================================

pred has_active_grant {
    some g : System.grants_in_store | g.status = Active
}

run has_active_grant for 4 but 1..1 steps


-- ==============================================================
-- RUN: Show a valid snapshot with both Active and Revoked grants
-- (the full attribution picture — two grants, two issuance
-- attestations, one revocation attestation)
-- ==============================================================

pred full_lifecycle {
    some g1 : System.grants_in_store | g1.status = Active
    some g2 : System.grants_in_store | g2.status = Revoked
}

run full_lifecycle for 5 but 1..1 steps


-- ==============================================================
-- RUN: Show orphan attestations
--
-- An attestation in the Actor Identity store that appears in
-- neither pairing map is an orphan — the spec explicitly models
-- these as evidence of failed issuance or revocation attempts.
-- This run confirms they're possible within the model (not
-- excluded by any fact) and shows what the orphan population
-- looks like.
-- ==============================================================

pred has_orphan_attestations {
    some a : System.attestations_in_store |
        a not in System.grant_attribution[Grant]
        and a not in System.revocation_attribution[Grant]
}

run has_orphan_attestations for 5 but 1..1 steps


-- ==============================================================
-- TRANSITIONS — the composition's operations
--
-- Each transition is atomic: it relates one state to the next in
-- a single step. The `'` (prime) operator names a field's value
-- in the next state. Every transition constrains EVERY var field
-- — anything left unconstrained would be free to change
-- arbitrarily between states (the frame conditions are the
-- `= unchanged` lines and the `all h : Grant - g` quantifications).
--
-- The freshness precondition `a not in attestations_in_store` is
-- the model's rendering of the spec's nonce mechanism
-- (Configuration): every issue_grant / revoke_grant call attests
-- a structurally fresh proposal_ref, so the attestation it
-- records is new — never a reused record. Invariant_7_Always
-- below is the proof that this mechanism preserves Invariant 7
-- over time: mechanism and named invariant, both present, neither
-- substituting for the other.
-- ==============================================================

-- Stutter: no state change. Also what makes one-state snapshot
-- traces (the `1..1 steps` commands above) and lasso loops
-- possible.
pred stutter {
    System.grants_in_store'        = System.grants_in_store
    System.attestations_in_store'  = System.attestations_in_store
    all g : Grant | g.status'      = g.status
    System.grant_attribution'      = System.grant_attribution
    System.revocation_attribution' = System.revocation_attribution
    System.orphan_log'             = System.orphan_log
}

-- issue_grant happy path: atomically add the attestation, add the
-- grant with status Active, write the issuance pairing.
pred issue_grant [g : Grant, a : Attestation] {
    -- Preconditions
    g not in System.grants_in_store
    a not in System.attestations_in_store   -- freshness: the nonce

    -- Postconditions (next state)
    System.grants_in_store'        = System.grants_in_store + g
    System.attestations_in_store'  = System.attestations_in_store + a
    g.status'                      = Active
    all h : Grant - g | h.status'  = h.status
    System.grant_attribution'      = System.grant_attribution + (g -> a)
    System.revocation_attribution' = System.revocation_attribution
    System.orphan_log'             = System.orphan_log
}

-- revoke_grant happy path: atomically add the revocation
-- attestation, flip status Active -> Revoked, write the
-- revocation pairing.
pred revoke_grant [g : Grant, a : Attestation] {
    -- Preconditions
    g in System.grants_in_store
    g.status = Active
    a not in System.attestations_in_store   -- freshness: the nonce

    -- Postconditions (next state)
    System.grants_in_store'        = System.grants_in_store
    System.attestations_in_store'  = System.attestations_in_store + a
    g.status'                      = Revoked
    all h : Grant - g | h.status'  = h.status
    System.grant_attribution'      = System.grant_attribution
    System.revocation_attribution' = System.revocation_attribution + (g -> a)
    System.orphan_log'             = System.orphan_log
}


-- ==============================================================
-- TRACE FACT
--
-- Every step of every trace is one of {stutter, issue_grant,
-- revoke_grant}. `always` in a fact constrains every state
-- transition along every trace (RULE 2).
--
-- Note what is NOT here: an init conjunct. Round 3's dyn_trace
-- pinned the initial state to empty; Round 4 lets traces begin in
-- ANY valid snapshot (any state satisfying the initial-state
-- facts above). Every trace property checked below is therefore
-- strictly stronger than its Round 3 counterpart — it holds from
-- every valid starting point, not just from the clean slate. The
-- from_empty_lifecycle run below keeps the clean-slate case
-- exercised.
-- ==============================================================

fact Transitions {
    always (
        stutter or
        (some g : Grant, a : Attestation | issue_grant[g, a]) or
        (some g : Grant, a : Attestation | revoke_grant[g, a])
    )
}


-- ==============================================================
-- PRESERVATION CHECKS — the snapshot invariants, proven over time
--
-- Round 3 checked Invariants 1 and 2 as temporal assertions (T2,
-- T3) against the empty-init trace model, and never checked
-- Invariant 7 temporally at all — exclusivity held there only
-- by construction of the transitions, an assumption rather than a
-- verified property. Round 4 promotes all three to explicit
-- `always` checks over traces that start in arbitrary valid
-- snapshots.
--
-- ON THE `1..2 steps` BOUND — deliberate, and stronger than it
-- looks. Because the initial state is an ARBITRARY valid snapshot
-- (every state satisfying the facts, not just states reachable
-- from empty), a two-state trace is exactly the inductive step:
--   base case   — the facts give the invariant at state 0;
--   inductive   — these checks prove no single transition from
--   step          ANY fact-satisfying state reaches a violating
--                 state (the violating successor would appear at
--                 state 1 of a two-state counterexample trace,
--                 closed into a lasso by stutter).
-- UNSAT here therefore proves the invariant at EVERY trace depth,
-- not merely within an unrolled window — strictly stronger than
-- the same check at `1..6 steps`, and far cheaper to solve. The
-- empty-init Round 3 model could not use this idiom: its deep
-- states were reachable-only, so short traces proved nothing
-- beyond the first steps from empty.
-- ==============================================================

-- Invariant 1 over time (subsumes Round 3's T2 /
-- Dyn_Invariant_1_Always): every stored grant has its issuance
-- pairing in every state.
assert Invariant_1_Always {
    always (all g : System.grants_in_store |
        one System.grant_attribution[g])
}
check Invariant_1_Always for 4 but 1..2 steps

-- Invariant 2 over time (subsumes Round 3's T3 /
-- Dyn_Invariant_2_Always, and now also covers the Active half of
-- the invariant pair, which Round 3's T3 omitted): Revoked stored
-- grants have exactly one revocation pairing; Active ones have
-- none.
assert Invariant_2_Always {
    always (all g : System.grants_in_store |
        (g.status = Revoked implies one System.revocation_attribution[g])
        and (g.status = Active implies no System.revocation_attribution[g]))
}
check Invariant_2_Always for 4 but 1..2 steps

-- Invariant 7 over time (NEW in Round 4): the freshness
-- precondition — the spec's nonce mechanism — preserves
-- attestation exclusivity through every operation. This is the
-- promotion of Invariant 7's temporal half from "true by
-- construction of the transitions" to "verified property"
-- (pressure-testing.md §The coverage cross-check: by-construction
-- → covered). Part of the regression gate: in the buggy twin this
-- check fails at the unseeded initial state.
assert Invariant_7_Always {
    always (
        (all a : Attestation | lone System.grant_attribution.a)
        and (all a : Attestation | lone System.revocation_attribution.a)
        and no (System.grant_attribution[Grant] & System.revocation_attribution[Grant])
    )
}
check Invariant_7_Always for 4 but 1..2 steps

-- Well-formedness over time: the snapshot scaffolding
-- (Wellformed_Snapshot) is preserved by every operation. This is
-- the explicit guard against RULE 1's trap — the initial-state
-- facts cannot silently fail to propagate, because this check
-- would catch the first operation that breaks them.
assert Wellformed_Always {
    always (
        (all g : System.grants_in_store | one g.status)
        and (all g : Grant - System.grants_in_store | no g.status)
        and System.grant_attribution.Attestation in System.grants_in_store
        and System.revocation_attribution.Attestation in System.grants_in_store
        and System.grant_attribution[Grant] in System.attestations_in_store
        and System.revocation_attribution[Grant] in System.attestations_in_store
        and System.orphan_log in System.attestations_in_store
    )
}
check Wellformed_Always for 4 but 1..2 steps


-- ==============================================================
-- TEMPORAL CLAIMS — T1, T4, T5, T6 (Round 3 names: Dyn_*)
--
-- T2 and T3 do not appear here: they are subsumed by
-- Invariant_1_Always and Invariant_2_Always above.
--
-- These use the same `1..2 steps` inductive bound as the
-- preservation checks, and for the same reason: the initial-state
-- facts are exactly the conjunction the preservation checks prove
-- invariant, so every reachable state at every depth is itself a
-- fact-satisfying state — and a durability or terminality
-- violation, if any transition could produce one, therefore
-- appears within one step of some fact-satisfying initial state.
-- UNSAT at `1..2 steps` covers all trace depths. The trace runs
-- at the end of the file keep multi-step behavior exercised.
-- ==============================================================

-- T4: Pairing-map durability over time (Invariant 6 stated
-- temporally). Once a pairing entry (g -> a) exists in either
-- map, it persists in every subsequent state.
assert Pairing_Durability {
    always (all g : Grant, a : Attestation |
        (g -> a) in System.grant_attribution implies
            always ((g -> a) in System.grant_attribution))
    always (all g : Grant, a : Attestation |
        (g -> a) in System.revocation_attribution implies
            always ((g -> a) in System.revocation_attribution))
}
check Pairing_Durability for 4 but 1..2 steps

-- T5: Revocation is terminal. Once a grant's status flips to
-- Revoked, it stays Revoked.
assert Revocation_Terminal {
    always (all g : Grant |
        g.status = Revoked implies always (g.status = Revoked))
}
check Revocation_Terminal for 4 but 1..2 steps

-- T1: Attest-before-record (consequence form). The atomic
-- issue_grant transition collapses the attestation write and the
-- grant write into one step, so the ordering itself is not
-- directly observable; its *consequence* is: at every reachable
-- state, every stored grant's issuance pairing points at a
-- currently-stored attestation — never at a phantom reference.
--
-- This is STRICTLY STRONGER than Invariant_1_Always, which only
-- requires that a pairing exists in the map relation; this
-- additionally requires the pairing's target to be in
-- attestations_in_store. Both hold on the current transition set
-- only because no transition removes from attestations_in_store.
-- Absent that monotonicity — exactly what an adversarial deletion
-- of an Actor Identity record would produce, and what Invariant 6
-- + Actor Identity's Invariant 9 jointly forbid — the two
-- assertions diverge. (The revocation-side twin of this property
-- is covered by Wellformed_Always.)
assert Attest_Before_Record {
    always (all g : System.grants_in_store |
        System.grant_attribution[g] in System.attestations_in_store)
}
check Attest_Before_Record for 4 but 1..2 steps

-- T6: Orphan-log durability over time (Invariant 8 stated
-- temporally). Once an attestation appears in the orphan log, it
-- persists in every subsequent state.
--
-- Round 3 noted this assertion was vacuously satisfied: with the
-- empty init and happy-path-only transitions, the log was always
-- empty. Round 4 narrows that caveat — traces may now BEGIN with
-- a populated orphan log, so the durability discipline is
-- exercised on real entries. What remains unmodeled is failure-
-- path orphan CREATION (transitions that add to the log
-- mid-trace), still the natural later extension.
assert Orphan_Log_Durability {
    always (all a : Attestation |
        a in System.orphan_log implies
            always (a in System.orphan_log))
}
check Orphan_Log_Durability for 4 but 1..2 steps


-- ==============================================================
-- RUN: trace witnesses — the temporal checks are non-vacuous
-- ==============================================================

-- A trace reaching a state with a Revoked stored grant exists.
pred trace_with_revoked {
    eventually (some g : System.grants_in_store |
        g.status = Revoked)
}

run trace_with_revoked for 4 but 1..6 steps

-- The Round 3 clean-slate case, kept as an explicit witness: from
-- the empty state (which satisfies all the initial-state facts
-- vacuously), an issue_grant followed by a revoke_grant is
-- reachable. If this run returns no instance, the transition
-- preconditions are over-constrained.
pred from_empty_lifecycle {
    no System.grants_in_store
    no System.attestations_in_store
    eventually (some g : System.grants_in_store |
        g.status = Revoked)
}

run from_empty_lifecycle for 4 but 1..6 steps


-- ==============================================================
-- CHECK: Pairing-map range validity (Invariant 6, structural
-- aspect) — documented redundancy, kept loud
--
-- The ranges of both attribution maps contain only Attestation
-- atoms. Today this is entailed by the System field declarations
-- (`Grant -> lone Attestation`), so this check is expected CLEAN
-- by typing alone — it is deliberately redundant. It exists
-- because Round 3 stated the same intent as a fact, and a
-- redundant FACT is the wrong instrument: inert while the
-- declarations hold, silently load-bearing (and edit-masking) if
-- they are ever weakened. As an assert + check, the same intent
-- stays documented and becomes a loud failure instead of a silent
-- constraint if a future edit weakens the declared field types.
-- ==============================================================

assert Pairing_Map_Range_Valid {
    always (
        System.grant_attribution[Grant] in Attestation
        and System.revocation_attribution[Grant] in Attestation
    )
}

check Pairing_Map_Range_Valid for 5 but 1..2 steps
