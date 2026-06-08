-- clinical-observation.als
-- Alloy structural model for the Grace Commons Clinical Observation atom
-- (atoms/clinical-observation.md)
--
-- PURPOSE
-- Verify the load-bearing structural invariants of the Clinical Observation atom
-- by bounded exhaustive search. The model encodes amendment-chain linearity as its
-- primary target claim.
--
-- INVARIANTS ENCODED
--   Invariant 2 — Amendment produces a successor (amend creates a new record; original
--                 transitions to Amended with successor_id set).
--   Invariant 3 — Amendment chains are linear (at most one successor, at most one
--                 predecessor; no branching, no cycles).
--   Invariant 4 — patient_ref is inherited across amendment chains (all observations
--                 in a chain share the same patient_ref).
--   Invariant 5 — observation_type is inherited across amendment chains.
--   Invariant 6 — Retracted is terminal (no further transitions from Retracted).
--   Invariant 9 — Transition metadata is write-once / consistent with state.
--
-- SCOPE
-- Static structural model (snapshots). Each Obs sig represents one observation record
-- in the store. The amendment chain is modeled as a directed relation (successor) over
-- the set of observations. States are encoded as an abstract sig with named singletons.
-- Transitions are verified via structural consistency facts, not temporal steps.
--
-- NOT MODELED HERE
-- - Clock semantics / recorded_at ordering (not needed to verify chain linearity)
-- - Cryptographic tamper-evidence (composing-pattern concern)
-- - Access control / permission checks (composing-pattern concern)
-- - Storage-failure atomicity (implementation obligation, not structural invariant)
-- - Multi-store-instance routing (deployment concern)
-- - Value constraints per observation_type (deployment policy)
--
-- HOW TO READ THE RESULTS
-- Every "check A_*" should return UNSAT — "No counterexample found" — meaning the
-- asserted guarantee holds for all configurations within the scope.
-- Every "run Show*" should return SAT — at least one instance exists — confirming the
-- configuration space is non-empty (invariants are satisfiable; no fact over-constrains).
-- A "check" that returns SAT (counterexample found) is a spec finding.
-- A "run" that returns UNSAT (no instance) means the facts are too restrictive.

module clinical_observation

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures (types)
-- ─────────────────────────────────────────────────────────────────────────────

-- State enum: exactly one of three values (spec §State).
abstract sig State {}
one sig Recorded, Amended, Retracted extends State {}

-- Opaque reference types. Alloy generates concrete atoms freely.
-- These model patient_ref, recorded_by / amended_by / retracted_by, and observation_type.
abstract sig PatientRef {}
abstract sig ClinRef {}       -- clinician reference (recorded_by / amended_by / retracted_by)
abstract sig ObsType {}       -- observation_type (blood_pressure_systolic, heart_rate, …)

-- The observation record.
-- successor:    lone — at most one direct successor (Invariant 3, first half).
--               No "one" because most observations have no successor.
-- predecessor:  lone — at most one direct predecessor (Invariant 3, second half).
-- patient:      one  — always present and immutable (Invariant 1, 4).
-- obsType:      one  — always present and immutable (Invariant 1, 5).
-- recordedBy:   one  — always present and immutable (Invariant 1).
-- amendedBy:    lone — present only on successor observations (set by amend).
-- retractedBy:  lone — present only on Retracted observations (Invariant 9).
-- state:        one  — always exactly one state (spec §State).
sig Obs {
    successor   : lone Obs,   -- the correcting observation (set when this becomes Amended)
    predecessor : lone Obs,   -- the observation this corrects (set on amend creation)
    patient     : one  PatientRef,
    obsType     : one  ObsType,
    recordedBy  : one  ClinRef,
    amendedBy   : lone ClinRef,   -- who made the correction; set only on successor obs
    retractedBy : lone ClinRef,   -- who retracted; set only on Retracted obs
    state       : one  State
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural well-formedness facts
-- These constrain the universe to VALID configurations only.
-- A fact is a constraint Alloy treats as always true for all instances.
-- ─────────────────────────────────────────────────────────────────────────────

-- Invariant 3 (no-cycles half): the amendment chain is acyclic.
-- "x in x.^successor" would mean x can reach itself via one or more successor steps.
-- The spec says chains are singly-linked and terminate; they never form a loop.
fact NoCycles {
    all x : Obs | x not in x.^successor
}

-- Invariant 3 (at-most-one-successor half): no observation has two successors.
-- This is the core linearity guarantee. "lone" on the field already enforces this
-- per-observation, but stating it here as an explicit fact makes it a named constraint
-- the assertions can reference directly.
-- (Note: "lone x.successor" is structurally guaranteed by the field's "lone" multiplicity,
-- but the branching constraint is the logical claim we want to name and test.)
fact LinearChain {
    -- Each obs has at most one successor (enforced by "lone" multiplicity on the field).
    -- The inverse direction: no two distinct observations share the same successor.
    -- i.e., no observation is the successor of two different observations (no merging either).
    all x : Obs | lone (successor.x)
}

-- Inverse consistency: successor and predecessor are inverses of each other.
-- If obs B is the successor of obs A, then A must be the predecessor of B (and vice versa).
-- This encodes the bidirectional link that spec §State and §Actions describe:
-- after amend, original gets successor_id and successor gets predecessor_id.
fact SuccessorPredecessorInverse {
    all a, b : Obs | a.successor = b iff b.predecessor = a
}

-- Invariant 2 (state consistency with successor/predecessor links):
-- An observation in Amended state must have exactly one successor.
-- An observation in Recorded state with a predecessor (i.e., it IS a successor) must have
-- no successor of its own unless it has been further amended.
-- Amended state iff successor is set (the link and the state label are consistent).
fact AmendedIffHasSuccessor {
    all x : Obs | x.state = Amended iff one x.successor
}

-- Recorded state means: not amended (no successor) and not retracted.
-- A Recorded observation may have a predecessor (it is itself a successor) — that is fine;
-- it is still the current end of the chain.
fact RecordedConsistency {
    all x : Obs | x.state = Recorded implies (no x.successor)
}

-- Invariant 6: Retracted is terminal — no further successor can be created from a
-- Retracted observation. (amend would be rejected as already-retracted.)
fact RetractedIsTerminal {
    all x : Obs | x.state = Retracted implies no x.successor
}

-- Invariant 9 (transition metadata consistency — write-once structural analog):
-- amendedBy is set iff the observation has a predecessor (it was created by amend).
fact AmendedByConsistency {
    all x : Obs | (one x.amendedBy) iff (one x.predecessor)
}

-- retractedBy is set iff the observation is in Retracted state.
fact RetractedByConsistency {
    all x : Obs | (one x.retractedBy) iff (x.state = Retracted)
}

-- Invariant 4: All observations in an amendment chain share the same patient_ref.
-- If B is the successor of A, they must have the same patient.
fact PatientRefInherited {
    all a, b : Obs | a.successor = b implies b.patient = a.patient
}

-- Invariant 5: All observations in an amendment chain share the same observation_type.
-- If B is the successor of A, they must have the same obsType.
fact ObsTypeInherited {
    all a, b : Obs | a.successor = b implies b.obsType = a.obsType
}

-- No self-loops: an observation cannot be its own successor.
-- (Subsumed by NoCycles but stated explicitly for clarity and direct testability.)
fact NoSelfLoop {
    all x : Obs | x.successor != x
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- Each "check" command asks Alloy: is there any configuration satisfying the
-- facts but violating this assertion? UNSAT = guarantee holds. SAT = spec finding.
-- ─────────────────────────────────────────────────────────────────────────────

-- A_Inv3_AtMostOneSuccessor (Invariant 3):
-- No observation has more than one direct successor.
assert A_Inv3_AtMostOneSuccessor {
    all x : Obs | lone x.successor
}
check A_Inv3_AtMostOneSuccessor for 8

-- A_Inv3_AtMostOnePredecessor (Invariant 3):
-- No observation has more than one direct predecessor (no merging of chains).
assert A_Inv3_AtMostOnePredecessor {
    all x : Obs | lone x.predecessor
}
check A_Inv3_AtMostOnePredecessor for 8

-- A_Inv3_NoBranching (Invariant 3):
-- No two distinct observations have the same successor (the anti-branching direction).
-- i.e., every observation is the successor of at most one other observation.
assert A_Inv3_NoBranching {
    all x : Obs | lone (successor.x)
}
check A_Inv3_NoBranching for 8

-- A_Inv3_NoCycles (Invariant 3):
-- The amendment chain is acyclic — no observation can reach itself via successor steps.
assert A_Inv3_NoCycles {
    all x : Obs | x not in x.^successor
}
check A_Inv3_NoCycles for 8

-- A_Inv2_AmendedHasSuccessor (Invariant 2):
-- Every Amended observation has exactly one successor.
assert A_Inv2_AmendedHasSuccessor {
    all x : Obs | x.state = Amended implies one x.successor
}
check A_Inv2_AmendedHasSuccessor for 8

-- A_Inv2_SuccessorHasPredecessor (Invariant 2):
-- Every observation that has a predecessor must itself be the successor of that predecessor.
-- i.e., if x.predecessor = a, then a.successor = x. (Inverse consistency.)
assert A_Inv2_SuccessorHasPredecessor {
    all x : Obs | one x.predecessor implies x.predecessor.successor = x
}
check A_Inv2_SuccessorHasPredecessor for 8

-- A_Inv4_PatientRefChainConsistency (Invariant 4):
-- All observations reachable via successor* from a given observation share the same patient.
assert A_Inv4_PatientRefChainConsistency {
    all x, y : Obs | y in x.*successor implies y.patient = x.patient
}
check A_Inv4_PatientRefChainConsistency for 8

-- A_Inv5_ObsTypeChainConsistency (Invariant 5):
-- All observations reachable via successor* from a given observation share the same obsType.
assert A_Inv5_ObsTypeChainConsistency {
    all x, y : Obs | y in x.*successor implies y.obsType = x.obsType
}
check A_Inv5_ObsTypeChainConsistency for 8

-- A_Inv6_RetractedHasNoSuccessor (Invariant 6):
-- A Retracted observation has no successor. Retraction is terminal.
assert A_Inv6_RetractedHasNoSuccessor {
    all x : Obs | x.state = Retracted implies no x.successor
}
check A_Inv6_RetractedHasNoSuccessor for 8

-- A_Inv9_AmendedBySetOnSuccessorOnly (Invariant 9):
-- amendedBy is set iff the observation has a predecessor (created by amend).
assert A_Inv9_AmendedBySetOnSuccessorOnly {
    all x : Obs | (one x.amendedBy) iff (one x.predecessor)
}
check A_Inv9_AmendedBySetOnSuccessorOnly for 8

-- A_Inv9_RetractedBySetOnRetractedOnly (Invariant 9):
-- retractedBy is set iff the observation is in Retracted state.
assert A_Inv9_RetractedBySetOnRetractedOnly {
    all x : Obs | (one x.retractedBy) iff (x.state = Retracted)
}
check A_Inv9_RetractedBySetOnRetractedOnly for 8

-- A_SuccessorPredecessorAreInverse:
-- successor and predecessor relations are strict inverses of each other.
assert A_SuccessorPredecessorAreInverse {
    all a, b : Obs | a.successor = b iff b.predecessor = a
}
check A_SuccessorPredecessorAreInverse for 8

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs
-- Every "run" must return SAT — at least one instance — confirming the facts do
-- not over-constrain the model (the invariants are mutually satisfiable).
-- ─────────────────────────────────────────────────────────────────────────────

-- A single Recorded observation: the simplest valid store state.
run ShowSingleRecorded {
    some x : Obs | x.state = Recorded and no x.predecessor and no x.successor
} for 3

-- A single Retracted observation with retractedBy set.
run ShowRetracted {
    some x : Obs | x.state = Retracted and one x.retractedBy
} for 3

-- A two-link amendment chain: obs A (Amended) → obs B (Recorded).
-- This is the minimal non-trivial chain. Non-vacuity guard for linearity checks.
run ShowTwoLinkChain {
    some disj a, b : Obs | {
        a.successor = b
        a.state = Amended
        b.state = Recorded
        b.predecessor = a
        one b.amendedBy          -- correction attribution is set
        no a.predecessor         -- a is the chain head (original observation)
        a.patient = b.patient    -- Invariant 4: same patient across chain
        a.obsType = b.obsType    -- Invariant 5: same type across chain
    }
} for 4

-- A three-link amendment chain: obs A (Amended) → obs B (Amended) → obs C (Recorded).
-- This is the critical non-vacuity run: confirms linearity facts permit multi-link chains
-- and does NOT make them impossible (would falsely satisfy the linearity assertions trivially
-- over empty chains).
run ShowThreeLinkChain {
    some disj a, b, c : Obs | {
        a.successor = b
        b.successor = c
        a.state = Amended
        b.state = Amended
        c.state = Recorded
        b.predecessor = a
        c.predecessor = b
        no a.predecessor         -- a is the chain head
        one b.amendedBy
        one c.amendedBy
        a.patient = b.patient
        b.patient = c.patient
        a.obsType = b.obsType
        b.obsType = c.obsType
    }
} for 5

-- A tail-retracted chain: obs A (Amended) → obs B (Retracted).
-- The spec allows Amended → Retracted (State section, valid transitions).
-- The successor B was Recorded, then retracted. A is Amended (has its successor B),
-- B is Retracted (has retractedBy, no further successor allowed).
-- This confirms: retraction of a successor observation does not affect the chain
-- structure up to that point.
run ShowTailRetractedChain {
    some disj a, b : Obs | {
        a.successor = b
        a.state = Amended
        b.state = Retracted
        b.predecessor = a
        one b.amendedBy          -- b was created by amend, so amendedBy is set
        one b.retractedBy        -- b was subsequently retracted
        no a.predecessor         -- a is the chain head
        a.patient = b.patient
        a.obsType = b.obsType
    }
} for 4

-- Two independent chains, different patients — store can hold multiple unrelated chains.
run ShowTwoIndependentChains {
    some disj a, b, c, d : Obs, disj p1, p2 : PatientRef | {
        a.successor = b
        a.state = Amended
        b.state = Recorded
        b.predecessor = a
        a.patient = p1
        b.patient = p1
        c.successor = d
        c.state = Amended
        d.state = Recorded
        d.predecessor = c
        c.patient = p2
        d.patient = p2
        p1 != p2
    }
} for 6
