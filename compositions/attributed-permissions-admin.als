module attributed_permissions_admin

/*
 * Alloy model: Attributed Permissions Admin
 * Corresponds to: compositions/attributed-permissions-admin.md
 * Status: Round 1 — static structural model
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
 * operations) is the natural Round 2 extension.
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
-- Configuration but not in Application-level invariants. The fix
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
-- THE THREE FAILING CHECKS NAME ONE MISSING INVARIANT:
-- Attestation Exclusivity
--
-- All three counterexamples above are facets of one gap: the spec
-- never states that every Attestation is used *at most once* across
-- the entire system — as issuance proof for exactly one grant, or
-- as revocation proof for exactly one grant, but not both and not
-- shared between grants. This should be Invariant 7.
--
-- If we add this as a fact, all three checks above pass.
-- The fact below demonstrates this. Toggle it on by removing
-- the block comment, then re-run the checks.
-- ==============================================================

/*
fact Invariant7_Attestation_Exclusivity {
    -- Each Attestation appears at most once in grant_attribution
    -- (injectivity — `lone` on the domain side)
    all a : Attestation | lone System.grant_attribution.a

    -- Each Attestation appears at most once in revocation_attribution
    all a : Attestation | lone System.revocation_attribution.a

    -- The two pools are disjoint: no attestation serves both roles
    no System.grant_attribution[Grant] & System.revocation_attribution[Grant]
}
*/


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
-- DEFERRED: Dynamic model (Round 2)
--
-- A static model captures valid states. To model the *transition*
-- properties — attest-before-record ordering, the fact that
-- revocation is terminal, that pairing entries are never modified —
-- we need a trace-based model: a sequence of states where each
-- step is one of {issue_grant, revoke_grant} and pre/post
-- conditions are stated on adjacent states.
--
-- The key property to verify dynamically:
--   "If grant G exists in state S, then grant_attribution[G] is
--    populated in every state S' reachable from S."
-- That's Invariant 1 stated as a temporal property over traces,
-- not just as a fact about snapshots.
--
-- Alloy 6 has built-in temporal logic (LTL) operators for this.
-- ==============================================================
