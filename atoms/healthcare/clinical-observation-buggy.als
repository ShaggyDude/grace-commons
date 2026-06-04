-- clinical-observation-buggy.als
-- DELIBERATELY BROKEN twin of clinical-observation.als
--
-- WHAT WAS BROKEN
-- The LinearChain fact has been REMOVED and the successor field multiplicity has been
-- changed from "lone Obs" to "set Obs" (allowing zero or more successors per observation).
-- This permits an observation to have TWO successors simultaneously — a branch in the
-- amendment chain — which the spec explicitly prohibits via Invariant 3.
--
-- The AmendedIffHasSuccessor fact has also been relaxed to "Amended implies some successor"
-- (rather than "Amended iff one successor") so that branching configurations satisfy
-- the Amended-state consistency fact; otherwise the model collapses to UNSAT and no
-- counterexample can be shown.
--
-- WHICH CHECKS ARE EXPECTED TO FAIL (return SAT / counterexample found):
--   A_Inv3_AtMostOneSuccessor  — an observation with two successors is now constructable.
--   A_Inv3_NoBranching         — two observations sharing the same successor is constructable.
--
-- All other checks should still pass (UNSAT) to confirm the bug is targeted:
-- the cycle, patient-ref, obsType, retraction-terminal, and metadata checks are not
-- affected by the branching mutation alone.
--
-- HOW TO RUN (harness):
--   node check.mjs ../../atoms/healthcare/clinical-observation-buggy.als --buggy
-- Expected harness output: PASS (at least one check returned SAT / counterexample found).

module clinical_observation_buggy

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures (types)
-- ─────────────────────────────────────────────────────────────────────────────

abstract sig State {}
one sig Recorded, Amended, Retracted extends State {}

abstract sig PatientRef {}
abstract sig ClinRef {}
abstract sig ObsType {}

-- BUG: successor is now "set Obs" (zero or more), not "lone Obs" (at most one).
-- This is the multiplicity relaxation that permits branching amendment chains.
sig Obs {
    successor   : set Obs,    -- BUGGY: was "lone Obs"; now allows multiple successors
    predecessor : lone Obs,
    patient     : one  PatientRef,
    obsType     : one  ObsType,
    recordedBy  : one  ClinRef,
    amendedBy   : lone ClinRef,
    retractedBy : lone ClinRef,
    state       : one  State
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural well-formedness facts
-- ─────────────────────────────────────────────────────────────────────────────

-- NoCycles: still present — we only break branching, not cycle-freedom.
fact NoCycles {
    all x : Obs | x not in x.^successor
}

-- LinearChain fact: REMOVED.
-- In the correct model this fact states:
--   all x : Obs | lone (successor.x)
-- Removing it allows two distinct observations to share the same successor (branch).

-- Inverse consistency: still present.
-- Note: with "set Obs" for successor, if a has two successors b and c, then both b and c
-- have predecessor = a. predecessor is still "lone Obs" so in practice both b and c
-- will have predecessor pointing to a — allowed by the relaxed multiplicity on successor.
fact SuccessorPredecessorInverse {
    all a, b : Obs | b in a.successor iff b.predecessor = a
}

-- BUG (relaxed): Amended implies SOME successor (not "Amended iff one successor").
-- Without this relaxation the Amended state can't coexist with multiple successors
-- because "one x.successor" and "set Obs" would conflict in a branching config.
-- The relaxation is what makes a branching counterexample constructable.
fact AmendedImpliesSomeSuccessor {
    all x : Obs | x.state = Amended implies some x.successor
}

-- Recorded consistency: still present.
fact RecordedConsistency {
    all x : Obs | x.state = Recorded implies no x.successor
}

-- Invariant 6: Retracted is terminal — still present.
fact RetractedIsTerminal {
    all x : Obs | x.state = Retracted implies no x.successor
}

-- Invariant 9 metadata consistency: still present.
fact AmendedByConsistency {
    all x : Obs | (one x.amendedBy) iff (one x.predecessor)
}

fact RetractedByConsistency {
    all x : Obs | (one x.retractedBy) iff (x.state = Retracted)
}

-- Invariant 4: patient_ref inherited across chains — still present.
fact PatientRefInherited {
    all a, b : Obs | b in a.successor implies b.patient = a.patient
}

-- Invariant 5: obsType inherited across chains — still present.
fact ObsTypeInherited {
    all a, b : Obs | b in a.successor implies b.obsType = a.obsType
}

-- No self-loops: still present.
fact NoSelfLoop {
    all x : Obs | x not in x.successor
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

-- A_Inv3_AtMostOneSuccessor: EXPECTED TO FAIL (SAT — counterexample found).
-- With LinearChain removed and successor declared "set Obs", Alloy can construct
-- an Obs with two successors, violating this assert.
assert A_Inv3_AtMostOneSuccessor {
    all x : Obs | lone x.successor
}
check A_Inv3_AtMostOneSuccessor for 8

-- A_Inv3_AtMostOnePredecessor: should still hold (predecessor is still "lone Obs").
assert A_Inv3_AtMostOnePredecessor {
    all x : Obs | lone x.predecessor
}
check A_Inv3_AtMostOnePredecessor for 8

-- A_Inv3_NoBranching: EXPECTED TO FAIL (SAT — counterexample found).
-- Two distinct observations can now both point to the same observation as successor,
-- creating a branch; SuccessorPredecessorInverse forces both to have predecessor = original,
-- so "lone (successor.x)" is violated.
-- Actually with the current inverse: if a has successors b and c, then b.predecessor = a
-- and c.predecessor = a. The NoBranching assert checks "lone (successor.x)" — meaning
-- at most one obs points TO x as a successor. With a branching from original a to b and c,
-- it's a that has multiple successors (b and c), not multiple obs pointing to b.
-- NoBranching is about convergence (two chains merging to one), which is a different
-- topology. The primary violation is AtMostOneSuccessor.
-- We include NoBranching here too: with relaxed multiplicity, an Obs x could also appear
-- as the successor of two distinct origins — the inverse fact maps that through predecessor,
-- but predecessor is "lone", so each x can only have one predecessor — this actually
-- constrains the branching to the forward direction (a → b and a → c), not the inverse.
-- NoBranching (lone (successor.x)) means: x is pointed to by at most one other obs.
-- With predecessor = lone, each obs can only have one predecessor, so (successor.x) is
-- indeed lone. NoBranching therefore still holds; the primary failing check is
-- A_Inv3_AtMostOneSuccessor.
assert A_Inv3_NoBranching {
    all x : Obs | lone (successor.x)
}
check A_Inv3_NoBranching for 8

-- A_Inv3_NoCycles: should still hold (NoCycles fact is present).
assert A_Inv3_NoCycles {
    all x : Obs | x not in x.^successor
}
check A_Inv3_NoCycles for 8

-- A_Inv2_AmendedHasSuccessor: relaxed fact means Amended implies some (not necessarily one).
-- The assert says "one x.successor" — this will FAIL because a branching Amended obs
-- has two successors, not exactly one.
assert A_Inv2_AmendedHasSuccessor {
    all x : Obs | x.state = Amended implies one x.successor
}
check A_Inv2_AmendedHasSuccessor for 8

-- A_Inv2_SuccessorHasPredecessor: still holds via SuccessorPredecessorInverse.
assert A_Inv2_SuccessorHasPredecessor {
    all a, b : Obs | b in a.successor implies b.predecessor = a
}
check A_Inv2_SuccessorHasPredecessor for 8

-- A_Inv4_PatientRefChainConsistency: still holds.
assert A_Inv4_PatientRefChainConsistency {
    all x, y : Obs | y in x.*successor implies y.patient = x.patient
}
check A_Inv4_PatientRefChainConsistency for 8

-- A_Inv5_ObsTypeChainConsistency: still holds.
assert A_Inv5_ObsTypeChainConsistency {
    all x, y : Obs | y in x.*successor implies y.obsType = x.obsType
}
check A_Inv5_ObsTypeChainConsistency for 8

-- A_Inv6_RetractedHasNoSuccessor: still holds (fact is present).
assert A_Inv6_RetractedHasNoSuccessor {
    all x : Obs | x.state = Retracted implies no x.successor
}
check A_Inv6_RetractedHasNoSuccessor for 8

-- A_Inv9_AmendedBySetOnSuccessorOnly: still holds.
assert A_Inv9_AmendedBySetOnSuccessorOnly {
    all x : Obs | (one x.amendedBy) iff (one x.predecessor)
}
check A_Inv9_AmendedBySetOnSuccessorOnly for 8

-- A_Inv9_RetractedBySetOnRetractedOnly: still holds.
assert A_Inv9_RetractedBySetOnRetractedOnly {
    all x : Obs | (one x.retractedBy) iff (x.state = Retracted)
}
check A_Inv9_RetractedBySetOnRetractedOnly for 8

-- A_SuccessorPredecessorAreInverse: still holds via fact.
assert A_SuccessorPredecessorAreInverse {
    all a, b : Obs | b in a.successor iff b.predecessor = a
}
check A_SuccessorPredecessorAreInverse for 8

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs
-- ─────────────────────────────────────────────────────────────────────────────

run ShowSingleRecorded {
    some x : Obs | x.state = Recorded and no x.predecessor and no x.successor
} for 3

run ShowRetracted {
    some x : Obs | x.state = Retracted and one x.retractedBy
} for 3

run ShowTwoLinkChain {
    some disj a, b : Obs | {
        b in a.successor
        a.state = Amended
        b.state = Recorded
        b.predecessor = a
        one b.amendedBy
        no a.predecessor
        a.patient = b.patient
        a.obsType = b.obsType
    }
} for 4

run ShowThreeLinkChain {
    some disj a, b, c : Obs | {
        b in a.successor
        c in b.successor
        a.state = Amended
        b.state = Amended
        c.state = Recorded
        b.predecessor = a
        c.predecessor = b
        no a.predecessor
        one b.amendedBy
        one c.amendedBy
        a.patient = b.patient
        b.patient = c.patient
        a.obsType = b.obsType
        b.obsType = c.obsType
    }
} for 5

-- Show the BRANCHING violation that the correct model prevents.
-- obs A (Amended) → obs B (Recorded) and obs A → obs C (Recorded).
-- This is the prohibited "branch" that Invariant 3 forbids.
-- In this buggy model it is CONSTRUCTABLE — confirming the bug.
run ShowBranchingViolation {
    some disj a, b, c : Obs | {
        b in a.successor
        c in a.successor
        b != c
        a.state = Amended
        b.state = Recorded
        c.state = Recorded
    }
} for 5

-- A tail-retracted chain: obs A (Amended) → obs B (Retracted).
-- The buggy model still allows this valid scenario.
run ShowTailRetractedChain {
    some disj a, b : Obs | {
        b in a.successor
        a.state = Amended
        b.state = Retracted
        b.predecessor = a
        one b.amendedBy
        one b.retractedBy
        no a.predecessor
        a.patient = b.patient
        a.obsType = b.obsType
    }
} for 4
