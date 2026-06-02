module attributed_permissions_admin

/*
 * Alloy model: Attributed Permissions Admin
 * Corresponds to: compositions/attributed-permissions-admin.md
 * Status: Round 3 — static structural model + dynamic trace model
 *
 * ---------------------------------------------------------------
 * HOW TO READ THIS FILE
 *
 * Alloy thinks in possible worlds. A world is one particular
 * assignment of atoms to sigs and relations. The Analyzer tries
 * every such assignment up to the scope you give it (e.g., "for 5"
 * means up to 5 atoms of each unscoped sig) and reports whether
 * your assertions ever fail.
 *
 * If a `check` comes back clean: no counterexample within scope.
 * That's strong evidence, not a proof. (For proofs: Alloy* or TLA+.)
 * If a `check` finds a counterexample: a real world violates your
 * claim. Either the claim is wrong or a fact is missing.
 *
 * `run` asks for a satisfying instance — useful for sanity-checking
 * that your facts aren't so tight they make everything impossible.
 *
 * ---------------------------------------------------------------
 * WHAT THIS MODEL COVERS
 *
 * This is a *static* structural model: it describes valid system
 * states, not sequences of operations. It captures:
 *   - The two constituent atoms' core structure (Grant, Attestation)
 *   - The composition's emergent state (grant_attribution,
 *     revocation_attribution maps)
 *   - Application-level Invariants 1–3 and 6 as facts
 *   - Invariant 4 (time monotonicity) deferred — requires timestamps
 *   - Invariant 5 (constituent invariants preserved) implicit in typing
 *
 * A dynamic model (tracing sequences of issue_grant / revoke_grant
 * operations) is appended below as the Round 3 extension. It uses
 * Alloy 6's built-in LTL operators (always, eventually, ' for "next
 * state") and fresh `Dyn*` sig names so the static and dynamic
 * models coexist in this one file without interference.
 * ---------------------------------------------------------------
 */


-- ==============================================================
-- BASE TYPES
--
-- The spec treats all of these as opaque references — we don't care
-- what's inside a SubjectRef. Alloy models them as uninterpreted
-- atoms. We care only about the *relations* between things, not
-- their internal content.
-- ==============================================================

sig SubjectRef {}   -- who receives the permission
sig ActionScope {}  -- what the permission covers
sig ActorRef {}     -- who grants or revokes
sig ActionRef {}    -- the proposal_ref passed to Actor Identity's attest


-- ==============================================================
-- GRANT STATUS
--
-- `abstract` means no atom is directly a GrantStatus — every atom
-- is either Active or Revoked. `one sig` means exactly one Active
-- atom and exactly one Revoked atom exist across all worlds.
-- This is how you model a two-value enum in Alloy.
-- ==============================================================

abstract sig GrantStatus {}
one sig Active, Revoked extends GrantStatus {}


-- ==============================================================
-- ATOM: PERMISSIONS — the grant store
--
-- Each Grant has exactly one subject, one scope, one status.
-- The `one` keyword on each field enforces this.
-- In Alloy, fields on a sig are *relations*, not slots — Grant.status
-- is a relation Grant -> GrantStatus restricted to be a function by `one`.
-- ==============================================================

sig Grant {
    subject : one SubjectRef,
    scope   : one ActionScope,
    status  : one GrantStatus
}


-- ==============================================================
-- ATOM: ACTOR IDENTITY — the attestation store
--
-- Each Attestation binds one actor to one action_ref.
-- (The credential validation is a dynamic concern — not modeled here.)
-- ==============================================================

sig Attestation {
    actor      : one ActorRef,
    action_ref : one ActionRef
}


-- ==============================================================
-- APPLICATION STATE — the composition's emergent state
--
-- `one sig System` is a singleton: there's exactly one System in
-- every world. Its fields are the two attribution maps.
--
-- `Grant -> lone Attestation` is a *partial function*: each Grant
-- maps to at most one Attestation. `lone` = zero or one.
-- If a Grant has no entry in grant_attribution, the relation
-- is empty for that Grant. Invariant 1 will forbid that.
-- ==============================================================

one sig System {
    grant_attribution      : Grant -> lone Attestation,
    revocation_attribution : Grant -> lone Attestation
}


-- ==============================================================
-- INVARIANT 1 — Attribution completeness
--
-- Every Grant has *exactly one* grant_attribution entry.
-- `one` in a quantified expression means exactly one atom
-- satisfies the expression — here, exactly one Attestation is
-- related to g via grant_attribution.
--
-- This is the central invariant: no grant without its attribution.
-- Note: the spec qualifies this as conditional on the pairing-write
-- durability requirement; we model the nominal (non-failure) case.
-- ==============================================================

fact Attribution_Completeness {
    all g : Grant | one System.grant_attribution[g]
}


-- ==============================================================
-- INVARIANT 2 — Revocation attribution
--
-- Every Revoked grant has exactly one revocation_attribution entry.
-- Active grants have none.
--
-- `implies` is logical implication. `no` means zero — the relation
-- is empty for that Grant.
-- ==============================================================

fact Revocation_Attribution {
    all g : Grant |
        g.status = Revoked implies one System.revocation_attribution[g]
}

fact Active_Grants_Have_No_Revocation_Attribution {
    all g : Grant |
        g.status = Active implies no System.revocation_attribution[g]
}


-- ==============================================================
-- INVARIANT 6 — Pairing-map durability (structural aspect)
--
-- The range of both attribution maps must be real Attestation atoms.
-- In Alloy's type system this is enforced automatically by the sig
-- declarations above — you can't put a non-Attestation into a
-- `Grant -> lone Attestation` relation. But stating it explicitly
-- documents the intent and catches type-level errors in model edits.
--
-- `R[S]` is relational image: the set of atoms related to any atom
-- in S via R. Here: the set of Attestations that appear on the
-- right-hand side of grant_attribution.
-- ==============================================================

fact Pairing_Map_Range_Valid {
    System.grant_attribution[Grant] in Attestation
    System.revocation_attribution[Grant] in Attestation
}


-- ==============================================================
-- CHECK: INVARIANT 3 — Attribution recoverability
--
-- The spec states: given any grant_id, the composition's records
-- yield the issuance attestation. This follows trivially from
-- Invariant 1 — if grant_attribution is total, recoverability is
-- guaranteed. We assert it and let Alloy verify the entailment.
--
-- Expected result: CLEAN (no counterexample). Alloy will confirm
-- that Invariant 1 entails Invariant 3 structurally.
-- ==============================================================

assert Attribution_Recoverability {
    all g : Grant | some System.grant_attribution[g]
}

check Attribution_Recoverability for 6


-- ==============================================================
-- CHECK: Are issuance and revocation attestations always distinct?
--
-- For a Revoked grant, Invariant 1 gives an issuance attestation
-- and Invariant 2 gives a revocation attestation. Are these
-- guaranteed to be *different* Attestation atoms?
--
-- The spec relies on the proposal format to ensure this: the grant
-- proposal includes a nonce and the revocation proposal is
-- {grant_id, requested_at} — structurally different action_refs.
-- But the spec never promotes this to a named invariant.
--
-- Expected result: COUNTEREXAMPLE FOUND.
-- Alloy will show a world where the same Attestation atom is in
-- both grant_attribution[g] and revocation_attribution[g] for
-- a Revoked grant. Nothing in the current facts prevents it.
--
-- This is a real spec gap. The nonce-uniqueness argument lives in
-- Configuration but not in Composition-level invariants. The fix
-- is a new invariant (see below).
-- ==============================================================

assert Issuance_Revocation_Attestations_Differ {
    all g : Grant | g.status = Revoked implies
        System.grant_attribution[g] != System.revocation_attribution[g]
}

check Issuance_Revocation_Attestations_Differ for 5


-- ==============================================================
-- CHECK: Is grant_attribution injective?
--
-- Injectivity: no two different grants share the same issuance
-- attestation. The spec's nonce mechanism guarantees this in
-- practice — every grant proposal gets a fresh nonce, so every
-- attestation binds a distinct proposal_ref. But is there an
-- invariant that says so?
--
-- Expected result: COUNTEREXAMPLE FOUND.
-- Alloy will find a world with two grants (g1, g2) where
-- grant_attribution[g1] = grant_attribution[g2]. Nothing prevents
-- it. This is the same gap: proposal-format uniqueness is a
-- mechanism argument in Configuration, not a named invariant.
-- ==============================================================

assert Grant_Attribution_Injective {
    all a : Attestation | lone System.grant_attribution.a
}

check Grant_Attribution_Injective for 5


-- ==============================================================
-- CHECK: Do issuance and revocation attestation pools not overlap?
--
-- Can the same Attestation be the issuance proof for one grant
-- AND the revocation proof for a different grant?
--
-- Expected result: COUNTEREXAMPLE FOUND.
-- The range of grant_attribution and revocation_attribution are
-- unconstrained in our current facts; they can overlap freely.
-- ==============================================================

assert Issuance_Revocation_Pools_Disjoint {
    no System.grant_attribution[Grant] & System.revocation_attribution[Grant]
}

check Issuance_Revocation_Pools_Disjoint for 5


-- ==============================================================
-- INVARIANT 7 — Attestation Exclusivity
--
-- Surfaced by Round 1 Alloy model; closed in spec before Round 2.
-- The three checks above (Issuance_Revocation_Attestations_Differ,
-- Grant_Attribution_Injective, Issuance_Revocation_Pools_Disjoint)
-- all found counterexamples without this fact. With it, all three
-- pass clean. The prose review argued this held via the nonce
-- mechanism in Configuration; the model showed that mechanism
-- argument does not substitute for a named, checkable invariant.
--
-- Three properties in one fact:
--   (1) grant_attribution is injective — no shared issuance proofs
--   (2) revocation_attribution is injective — no shared revocation proofs
--   (3) the two ranges are disjoint — no attestation serves both roles
-- ==============================================================

fact Invariant7_Attestation_Exclusivity {
    -- (1) Each Attestation appears at most once in grant_attribution
    all a : Attestation | lone System.grant_attribution.a

    -- (2) Each Attestation appears at most once in revocation_attribution
    all a : Attestation | lone System.revocation_attribution.a

    -- (3) The two pools are disjoint: no attestation serves both roles
    no System.grant_attribution[Grant] & System.revocation_attribution[Grant]
}


-- ==============================================================
-- RUN: Show a valid system with at least one Active grant
--
-- `run` finds a satisfying instance — a world where the predicate
-- holds and all facts are satisfied. This is the sanity check:
-- if `run` finds nothing, your facts are contradictory (over-constrained).
-- ==============================================================

pred has_active_grant {
    some g : Grant | g.status = Active
}

run has_active_grant for 4


-- ==============================================================
-- RUN: Show a valid system with both Active and Revoked grants
-- (the full attribution picture — two grants, two issuance
-- attestations, one revocation attestation)
-- ==============================================================

pred full_lifecycle {
    some g1 : Grant | g1.status = Active
    some g2 : Grant | g2.status = Revoked
}

run full_lifecycle for 5


-- ==============================================================
-- RUN: Show orphan attestations
--
-- An Attestation that appears in neither map is an orphan —
-- the spec explicitly models these as evidence of failed issuance
-- or revocation attempts. This run confirms they're possible
-- within the model (not excluded by any fact) and shows what
-- the orphan population looks like.
-- ==============================================================

pred has_orphan_attestations {
    some a : Attestation |
        a not in System.grant_attribution[Grant] and
        a not in System.revocation_attribution[Grant]
}

run has_orphan_attestations for 5


-- ==============================================================
-- ROUND 3 — DYNAMIC TRACE MODEL
--
-- The static model above checks the spec's snapshot invariants —
-- properties that must hold in any valid state. It cannot check
-- the spec's *temporal* claims, deferred from Round 1 and Round 2:
--
--   (T1) Attest-before-record ordering — no transition records a
--        grant (or revocation) without also writing the pairing.
--   (T2) Invariant 1 holds in every reachable state, not just in
--        valid snapshots.
--   (T3) Invariant 2 holds over Revoked grants in every reachable
--        state.
--   (T4) Invariant 6 — Pairing-map durability over time. Entries
--        in grant_attribution and revocation_attribution, once
--        written, persist in every subsequent state.
--   (T5) Revocation is terminal — once a grant's status flips to
--        Revoked, it stays Revoked forever.
--   (T6) Invariant 8 — Orphan log durability over time. Entries,
--        once written to the orphan log, persist (structurally
--        identical to T4 for the attribution maps).
--
-- This section uses Alloy 6's built-in LTL operators (always,
-- eventually, ' for "next state") to express these directly. The
-- dynamic model uses fresh sig names prefixed `Dyn` so it does
-- not perturb the static facts above; the two models coexist in
-- this file by separating namespaces.
--
-- Orphan-log DURABILITY (Invariant 8) is modeled: dyn_orphan_log
-- is a `var` field on DynSystem, dyn_init sets it empty, every
-- transition preserves it (happy-path transitions add no orphans),
-- and Dyn_Orphan_Log_Durability asserts entries persist over
-- time. On the current trace fact the log stays empty and the
-- assertion is vacuously satisfied; the assertion structure
-- nonetheless encodes the durability discipline and becomes
-- nontrivial when failure-path transitions are added later.
-- Round 4 F4.2 closure.
--
-- Failure-path orphan CREATION is intentionally NOT modeled. The
-- happy-path transitions are sufficient to discharge the load-
-- bearing temporal claims listed above; adding the rejection
-- branches and the resulting orphan-creation writes is a natural
-- later extension if a failure-case evidence requirement arises.
-- ==============================================================


-- ==============================================================
-- DYNAMIC TYPES
--
-- Fresh sigs prefixed `Dyn` so the static model's Grant /
-- Attestation / System sigs are not made mutable (which would
-- change the meaning of the static facts above).
-- ==============================================================

sig DynGrant {
    dyn_subject : one SubjectRef,
    dyn_scope   : one ActionScope
}

sig DynAttestation {
    dyn_actor      : one ActorRef,
    dyn_action_ref : one ActionRef
}


-- ==============================================================
-- DYNAMIC STATE
--
-- `var` fields can change between trace states. The set fields
-- (grants_in_store, attestations_in_store) track which atoms are
-- live in the corresponding store at the current time; the
-- relation fields track the composition's emergent state.
-- ==============================================================

one sig DynSystem {
    var dyn_grants_in_store        : set DynGrant,
    var dyn_attestations_in_store  : set DynAttestation,
    var dyn_grant_status           : DynGrant -> lone GrantStatus,
    var dyn_grant_attribution      : DynGrant -> lone DynAttestation,
    var dyn_revocation_attribution : DynGrant -> lone DynAttestation,
    var dyn_orphan_log             : set DynAttestation
}


-- ==============================================================
-- INITIAL STATE
--
-- All stores empty at trace start. The dynamic model exercises
-- the composition from a clean slate.
-- ==============================================================

pred dyn_init {
    no DynSystem.dyn_grants_in_store
    no DynSystem.dyn_attestations_in_store
    no DynSystem.dyn_grant_status
    no DynSystem.dyn_grant_attribution
    no DynSystem.dyn_revocation_attribution
    no DynSystem.dyn_orphan_log
}


-- ==============================================================
-- TRANSITIONS
--
-- Each transition is atomic — it describes the next state in one
-- step. The `'` (prime) operator names a relation's value in the
-- next state.
-- ==============================================================

-- Stutter: no state change.
pred dyn_stutter {
    DynSystem.dyn_grants_in_store'        = DynSystem.dyn_grants_in_store
    DynSystem.dyn_attestations_in_store'  = DynSystem.dyn_attestations_in_store
    DynSystem.dyn_grant_status'           = DynSystem.dyn_grant_status
    DynSystem.dyn_grant_attribution'      = DynSystem.dyn_grant_attribution
    DynSystem.dyn_revocation_attribution' = DynSystem.dyn_revocation_attribution
    DynSystem.dyn_orphan_log'             = DynSystem.dyn_orphan_log
}

-- issue_grant happy path: atomically add attestation, add grant
-- with status Active, write the issuance pairing.
pred dyn_issue_grant [g : DynGrant, a : DynAttestation] {
    -- Preconditions
    g not in DynSystem.dyn_grants_in_store
    a not in DynSystem.dyn_attestations_in_store

    -- Postconditions (next state)
    DynSystem.dyn_grants_in_store'        = DynSystem.dyn_grants_in_store + g
    DynSystem.dyn_attestations_in_store'  = DynSystem.dyn_attestations_in_store + a
    DynSystem.dyn_grant_status'           = DynSystem.dyn_grant_status + (g -> Active)
    DynSystem.dyn_grant_attribution'      = DynSystem.dyn_grant_attribution + (g -> a)
    DynSystem.dyn_revocation_attribution' = DynSystem.dyn_revocation_attribution
    DynSystem.dyn_orphan_log'             = DynSystem.dyn_orphan_log
}

-- revoke_grant happy path: atomically add revocation attestation,
-- flip status Active -> Revoked, write the revocation pairing.
pred dyn_revoke_grant [g : DynGrant, a : DynAttestation] {
    -- Preconditions
    g in DynSystem.dyn_grants_in_store
    DynSystem.dyn_grant_status[g] = Active
    a not in DynSystem.dyn_attestations_in_store

    -- Postconditions (next state)
    DynSystem.dyn_grants_in_store'        = DynSystem.dyn_grants_in_store
    DynSystem.dyn_attestations_in_store'  = DynSystem.dyn_attestations_in_store + a
    DynSystem.dyn_grant_status'           = (DynSystem.dyn_grant_status - (g -> Active)) + (g -> Revoked)
    DynSystem.dyn_grant_attribution'      = DynSystem.dyn_grant_attribution
    DynSystem.dyn_revocation_attribution' = DynSystem.dyn_revocation_attribution + (g -> a)
    DynSystem.dyn_orphan_log'             = DynSystem.dyn_orphan_log
}


-- ==============================================================
-- TRACE FACT
--
-- The dynamic system starts in dyn_init and every transition is
-- one of {stutter, issue_grant for some g/a, revoke_grant for
-- some g/a}. `always` in a fact context constrains every state
-- transition along every valid trace.
-- ==============================================================

fact dyn_trace {
    dyn_init
    always (
        dyn_stutter or
        (some g : DynGrant, a : DynAttestation | dyn_issue_grant[g, a]) or
        (some g : DynGrant, a : DynAttestation | dyn_revoke_grant[g, a])
    )
}


-- ==============================================================
-- LTL ASSERTIONS — the temporal claims
-- ==============================================================

-- T2: Invariant 1 — Attribution completeness holds in every state.
-- For every grant currently in the store, an issuance pairing exists.
-- The dynamic claim: this holds not just in valid snapshots, but in
-- every reachable state along every reachable trace.
assert Dyn_Invariant_1_Always {
    always (all g : DynSystem.dyn_grants_in_store |
        one DynSystem.dyn_grant_attribution[g])
}
check Dyn_Invariant_1_Always for 4 but 1..6 steps

-- T3: Invariant 2 — Revocation attribution holds in every state.
-- For every Revoked grant currently in the store, a revocation
-- pairing exists.
assert Dyn_Invariant_2_Always {
    always (all g : DynSystem.dyn_grants_in_store |
        DynSystem.dyn_grant_status[g] = Revoked implies
            one DynSystem.dyn_revocation_attribution[g])
}
check Dyn_Invariant_2_Always for 4 but 1..6 steps

-- T4: Pairing-map durability over time. Once a pairing entry
-- (g -> a) exists in grant_attribution or revocation_attribution,
-- it persists in every subsequent state. This is Invariant 6
-- stated as a temporal property.
assert Dyn_Pairing_Durability {
    always (all g : DynGrant, a : DynAttestation |
        (g -> a) in DynSystem.dyn_grant_attribution implies
            always ((g -> a) in DynSystem.dyn_grant_attribution))
    always (all g : DynGrant, a : DynAttestation |
        (g -> a) in DynSystem.dyn_revocation_attribution implies
            always ((g -> a) in DynSystem.dyn_revocation_attribution))
}
check Dyn_Pairing_Durability for 4 but 1..6 steps

-- T5: Revocation is terminal. Once a grant's status flips to
-- Revoked, it stays Revoked.
assert Dyn_Revocation_Terminal {
    always (all g : DynGrant |
        DynSystem.dyn_grant_status[g] = Revoked implies
            always (DynSystem.dyn_grant_status[g] = Revoked))
}
check Dyn_Revocation_Terminal for 4 but 1..6 steps

-- T1: Attest-before-record (consequence form). The spec's
-- "attest before record" temporal claim says the attestation is
-- recorded in Actor Identity before the grant is recorded in
-- Permissions. The atomic dyn_issue_grant transition collapses
-- both writes into a single step, so the ordering itself is not
-- directly observable in the trace. The *consequence* of the
-- ordering is observable, and that is what this assertion checks:
-- at every reachable state, for every grant in the store, the
-- attestation paired with it (via grant_attribution) must be in
-- the attestations_in_store set — i.e., the pairing must point
-- at a currently-stored attestation, not at a phantom reference.
--
-- This assertion is STRICTLY STRONGER than Dyn_Invariant_1_Always
-- above. Dyn_Invariant_1_Always asserts only that
-- `one grant_attribution[g]` (a pairing exists in the map
-- relation). Dyn_Attest_Before_Record additionally requires the
-- pairing's target to be in attestations_in_store — ruling out
-- the state where the map points at an Attestation atom that
-- isn't (or is no longer) in the Actor Identity store.
--
-- Both hold on the current transition set only because no
-- transition removes from attestations_in_store. Absent that
-- monotonicity, the two assertions would diverge — which is
-- exactly the situation an adversarial deletion of an Actor
-- Identity record would produce, and which Invariant 6 + Actor
-- Identity's Invariant 9 jointly forbid.
assert Dyn_Attest_Before_Record {
    always (all g : DynSystem.dyn_grants_in_store |
        DynSystem.dyn_grant_attribution[g] in DynSystem.dyn_attestations_in_store)
}
check Dyn_Attest_Before_Record for 4 but 1..6 steps


-- T6: Invariant 8 — Orphan log durability over time. Once an
-- attestation appears in the orphan log, it persists in every
-- subsequent state. This is the temporal version of Invariant 8,
-- structurally identical to Dyn_Pairing_Durability for the
-- attribution maps.
--
-- On the current happy-path-only trace fact, dyn_issue_grant and
-- dyn_revoke_grant preserve dyn_orphan_log (both add nothing to
-- it). The log is therefore always empty along every reachable
-- trace, and the assertion is vacuously satisfied. The assertion
-- structure nonetheless encodes the durability discipline: when
-- a future round adds failure-path transitions that populate the
-- log, the assertion becomes nontrivial and verifies that those
-- transitions cannot retroactively remove or rewrite log entries.
-- Holding the assertion clean in the current model is the
-- structural precondition for adding failure transitions later
-- without rewriting the durability contract.
assert Dyn_Orphan_Log_Durability {
    always (all a : DynAttestation |
        a in DynSystem.dyn_orphan_log implies
            always (a in DynSystem.dyn_orphan_log))
}
check Dyn_Orphan_Log_Durability for 4 but 1..6 steps


-- ==============================================================
-- RUN: an existence witness — a trace producing a Revoked grant
--
-- Confirms the dynamic model is satisfiable: there exists a trace
-- that starts in dyn_init, takes some sequence of transitions,
-- and ends with at least one grant in Revoked state. If this run
-- returns no instance, the facts are over-constrained.
-- ==============================================================

pred dyn_trace_with_revoked {
    eventually (some g : DynSystem.dyn_grants_in_store |
        DynSystem.dyn_grant_status[g] = Revoked)
}

run dyn_trace_with_revoked for 4 but 1..6 steps
