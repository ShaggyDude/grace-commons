-- medication-order-buggy.als
-- DELIBERATELY BROKEN twin of medication-order.als
--
-- WHAT WAS BROKEN
-- Two independent mutations have been introduced, each targeting one of the two
-- new load-bearing invariants verified by medication-order.als.
--
-- BUG 1 — INVARIANT 4 VIOLATED (branching amendment chains):
--   The successor field multiplicity has been changed from "lone Order" to
--   "set Order" (allowing zero or more successors per order). This permits an
--   order to have TWO successors simultaneously — a branch in the amendment
--   chain — which the spec explicitly prohibits via Invariant 4 ("each order
--   has at most one successor_id ... amendment chains are singly-linked;
--   branching is not permitted").
--   The AmendedIffHasSuccessor fact has also been relaxed to "Amended implies
--   some successor" (rather than "Amended iff one successor") so that branching
--   configurations satisfy the Amended-state consistency fact; otherwise the
--   model collapses to UNSAT and no counterexample can be shown.
--
-- BUG 2 — INVARIANT 3 VIOLATED (post-dispensing amendment permitted):
--   The PreDispensingOnlyAmendment fact has been REMOVED. Without it, orders
--   in Dispensed, Administered, Completed, Cancelled, Discontinued, or OnHold
--   state are no longer prohibited from having a successor. This permits a
--   post-dispensing order to be amended, which the spec explicitly prohibits
--   ("amend is rejected for any order in Dispensed, Administered, Completed,
--   On Hold, Cancelled, Discontinued, or Amended state").
--   The AmendedIffHasSuccessor fact is also relaxed (for Bug 1) — but that
--   alone would only help branching; the Dispensed/etc. orders can now appear
--   as having a successor because the structural guard is gone.
--   To make a Dispensed order with a successor constructable, we also relax
--   AmendedIffHasSuccessor to "has successor implies not (Dispensed...)" — wait,
--   we do NOT add that; instead we simply remove PreDispensingOnlyAmendment and
--   relax AmendedIffHasSuccessor to "Amended implies some successor" so that a
--   Dispensed order CAN have a successor without needing to be in Amended state.
--   This is the real hazard: the dispensing boundary is not enforced.
--
-- WHICH CHECKS ARE EXPECTED TO FAIL (return SAT / counterexample found):
--   A_Inv4_AtMostOneSuccessor         — an order with two successors is constructable
--   A_Inv3_NoSuccessorAfterDispensing — a Dispensed/Administered/etc. order with a
--                                       successor is now constructable
--   A_Inv3_SuccessorOnlyFromPreDispensing — same as above from the source perspective
--   A_Inv4_AmendedHasSuccessor        — a branching Amended order has two successors,
--                                       violating the "exactly one" assertion
--
-- All other checks should still pass (UNSAT) to confirm the bugs are targeted:
-- the cycle-freedom, inherited-field, and metadata checks are not affected by
-- these two mutations alone.
--
-- HOW TO RUN (harness):
--   node check.mjs ../../atoms/medication-order-buggy.als --buggy
-- Expected harness output: PASS (at least one check returned SAT / counterexample found).

module medication_order_buggy

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures (types)
-- ─────────────────────────────────────────────────────────────────────────────

abstract sig State {}
one sig Ordered, Verified, Dispensed, Administered, Completed,
        Cancelled, Discontinued, Amended, OnHold extends State {}

fun PreDispensingState : set State {
    Ordered + Verified
}

fun NoSuccessorState : set State {
    Dispensed + Administered + Completed + Cancelled + Discontinued + OnHold
}

abstract sig PatientRef    {}
abstract sig PrescriberRef {}
abstract sig MedicationRef {}
abstract sig ClinRef       {}

-- BUG 1: successor is now "set Order" (zero or more), not "lone Order" (at most one).
-- This is the multiplicity relaxation that permits branching amendment chains.
sig Order {
    successor   : set Order,   -- BUGGY: was "lone Order"; now allows multiple successors
    predecessor : lone Order,
    patient     : one  PatientRef,
    prescriber  : one  PrescriberRef,
    medication  : one  MedicationRef,
    amendedBy   : lone ClinRef,
    state       : one  State
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural well-formedness facts
-- ─────────────────────────────────────────────────────────────────────────────

-- NoCycles: still present — we only break branching and the dispensing guard.
fact NoCycles {
    all x : Order | x not in x.^successor
}

-- LinearChain fact: REMOVED (the no-merging / no-convergence half).
-- In the correct model this fact states:
--   all x : Order | lone (successor.x)
-- Removing it would allow two distinct origins to share the same successor.
-- (In practice, with predecessor still "lone", each order can only have one
-- predecessor, so the primary failure is the forward-branching direction — Bug 1.)
-- We leave LinearChain absent to ensure the branching violation is exploitable.

-- Inverse consistency: still present.
-- With "set Order" for successor, if a has two successors b and c, then both
-- b and c have predecessor = a (since predecessor is still "lone Order").
fact SuccessorPredecessorInverse {
    all a, b : Order | b in a.successor iff b.predecessor = a
}

-- BUG 1 (relaxed Amended state consistency): Amended implies SOME successor
-- (not "Amended iff one successor"). Without this relaxation, the Amended state
-- can't coexist with multiple successors because "one x.successor" would reject
-- two-successor configs. The relaxation makes a branching counterexample
-- constructable.
-- BUG 2 (extended relaxation): we do NOT require has-successor implies Amended.
-- The correct model's AmendedIffHasSuccessor says both directions:
--   "Amended iff one x.successor"
-- Here we only say "Amended implies some successor", leaving the other direction
-- (has successor implies Amended) unspecified. This means a Dispensed order can
-- have a successor without being in Amended state — the pre-dispensing guard
-- collapses entirely.
fact AmendedImpliesSomeSuccessor {
    all x : Order | x.state = Amended implies some x.successor
}

-- PreDispensingOnlyAmendment fact: REMOVED.
-- In the correct model this fact states:
--   all x : Order | x.state in NoSuccessorState implies no x.successor
-- Removing it is Bug 2: orders in Dispensed, Administered, Completed, Cancelled,
-- Discontinued, or OnHold state can now have successors, violating Invariant 3.

-- No self-loops: still present.
fact NoSelfLoop {
    all x : Order | x not in x.successor
}

-- amendedBy is set iff the order has a predecessor: still present.
fact AmendedByConsistency {
    all x : Order | (one x.amendedBy) iff (one x.predecessor)
}

-- Inherited identity fields: still present (these are not the broken invariants).
fact PatientRefInherited {
    all a, b : Order | b in a.successor implies b.patient = a.patient
}

fact PrescriberRefInherited {
    all a, b : Order | b in a.successor implies b.prescriber = a.prescriber
}

fact MedicationRefInherited {
    all a, b : Order | b in a.successor implies b.medication = a.medication
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

-- A_Inv4_AtMostOneSuccessor: EXPECTED TO FAIL (SAT — counterexample found).
-- With successor declared "set Order" and LinearChain removed, Alloy can construct
-- an Order with two successors, violating this assert.
assert A_Inv4_AtMostOneSuccessor {
    all x : Order | lone x.successor
}
check A_Inv4_AtMostOneSuccessor for 8

-- A_Inv4_AtMostOnePredecessor: should still hold (predecessor is still "lone Order").
assert A_Inv4_AtMostOnePredecessor {
    all x : Order | lone x.predecessor
}
check A_Inv4_AtMostOnePredecessor for 8

-- A_Inv4_NoBranching: may or may not fail depending on whether the convergence
-- direction is exploited. With predecessor still "lone", each order has at most
-- one predecessor, so (successor.x) is at most one per x — this still holds.
-- The primary branching violation is forward: A → B and A → C.
assert A_Inv4_NoBranching {
    all x : Order | lone (successor.x)
}
check A_Inv4_NoBranching for 8

-- A_Inv4_NoCycles: should still hold (NoCycles fact is present).
assert A_Inv4_NoCycles {
    all x : Order | x not in x.^successor
}
check A_Inv4_NoCycles for 8

-- A_Inv3_NoSuccessorAfterDispensing: EXPECTED TO FAIL (SAT — counterexample found).
-- With PreDispensingOnlyAmendment removed and AmendedIffHasSuccessor relaxed
-- (has-successor no longer requires Amended state), Alloy can construct a Dispensed
-- order with a successor — exactly the hazard Invariant 3 defends against.
assert A_Inv3_NoSuccessorAfterDispensing {
    all x : Order | x.state in NoSuccessorState implies no x.successor
}
check A_Inv3_NoSuccessorAfterDispensing for 8

-- A_Inv3_SuccessorOnlyFromPreDispensing: EXPECTED TO FAIL (SAT — counterexample found).
-- With the dispensing guard removed, a Dispensed order can have a successor;
-- such an order is not in Amended state (the relaxed fact only says
-- "Amended implies some successor", not "has successor implies Amended"),
-- so this assert is violated.
assert A_Inv3_SuccessorOnlyFromPreDispensing {
    all a : Order | one a.successor implies a.state = Amended
}
check A_Inv3_SuccessorOnlyFromPreDispensing for 8

-- A_Inv4_AmendedHasSuccessor: EXPECTED TO FAIL (SAT — counterexample found).
-- A branching Amended order has two successors; the assert says "one x.successor"
-- (exactly one), which is violated when an Amended order has two.
assert A_Inv4_AmendedHasSuccessor {
    all x : Order | x.state = Amended implies one x.successor
}
check A_Inv4_AmendedHasSuccessor for 8

-- A_Inv4_SuccessorHasPredecessor: still holds via SuccessorPredecessorInverse.
assert A_Inv4_SuccessorHasPredecessor {
    all a, b : Order | b in a.successor implies b.predecessor = a
}
check A_Inv4_SuccessorHasPredecessor for 8

-- A_Inv2_PatientRefChainConsistency: still holds (fact is present).
assert A_Inv2_PatientRefChainConsistency {
    all x, y : Order | y in x.*successor implies y.patient = x.patient
}
check A_Inv2_PatientRefChainConsistency for 8

-- A_Inv2_PrescriberRefChainConsistency: still holds.
assert A_Inv2_PrescriberRefChainConsistency {
    all x, y : Order | y in x.*successor implies y.prescriber = x.prescriber
}
check A_Inv2_PrescriberRefChainConsistency for 8

-- A_Inv2_MedicationRefChainConsistency: still holds.
assert A_Inv2_MedicationRefChainConsistency {
    all x, y : Order | y in x.*successor implies y.medication = x.medication
}
check A_Inv2_MedicationRefChainConsistency for 8

-- A_Inv12_AmendedBySetOnSuccessorOnly: still holds.
assert A_Inv12_AmendedBySetOnSuccessorOnly {
    all x : Order | (one x.amendedBy) iff (one x.predecessor)
}
check A_Inv12_AmendedBySetOnSuccessorOnly for 8

-- A_SuccessorPredecessorAreInverse: still holds via fact.
assert A_SuccessorPredecessorAreInverse {
    all a, b : Order | b in a.successor iff b.predecessor = a
}
check A_SuccessorPredecessorAreInverse for 8

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs
-- ─────────────────────────────────────────────────────────────────────────────

run ShowSingleOrdered {
    some x : Order | x.state = Ordered and no x.predecessor and no x.successor
} for 3

run ShowDispensedNoSuccessor {
    some x : Order | x.state = Dispensed and no x.successor and no x.predecessor
} for 3

run ShowTwoLinkChain {
    some disj a, b : Order | {
        b in a.successor
        a.state = Amended
        b.state = Ordered
        b.predecessor = a
        one b.amendedBy
        no a.predecessor
        a.patient = b.patient
        a.prescriber = b.prescriber
        a.medication = b.medication
    }
} for 4

run ShowThreeLinkChain {
    some disj a, b, c : Order | {
        b in a.successor
        c in b.successor
        a.state = Amended
        b.state = Amended
        c.state = Ordered
        b.predecessor = a
        c.predecessor = b
        no a.predecessor
        one b.amendedBy
        one c.amendedBy
        a.patient = b.patient
        b.patient = c.patient
        a.prescriber = b.prescriber
        b.prescriber = c.prescriber
        a.medication = b.medication
        b.medication = c.medication
    }
} for 5

-- Show the BRANCHING violation (Bug 1): order A (Amended) → B (Ordered) AND
-- order A → C (Ordered). This is the prohibited "branch" that Invariant 4
-- forbids. In this buggy model it is CONSTRUCTABLE.
run ShowBranchingViolation {
    some disj a, b, c : Order | {
        b in a.successor
        c in a.successor
        b != c
        a.state = Amended
        b.state = Ordered
        c.state = Ordered
        a.patient = b.patient
        a.patient = c.patient
        a.prescriber = b.prescriber
        a.prescriber = c.prescriber
        a.medication = b.medication
        a.medication = c.medication
    }
} for 5

-- Show the POST-DISPENSING AMENDMENT violation (Bug 2): a Dispensed order
-- that has a successor. This is the prohibited case that Invariant 3 forbids.
-- In this buggy model, without PreDispensingOnlyAmendment, it is CONSTRUCTABLE.
run ShowPostDispensingAmendmentViolation {
    some disj a, b : Order | {
        b in a.successor
        a.state = Dispensed     -- the hazard: Dispensed order has a successor
        b.state = Ordered
        b.predecessor = a
        one b.amendedBy
        no a.predecessor
        a.patient = b.patient
        a.prescriber = b.prescriber
        a.medication = b.medication
    }
} for 4

-- Show an Administered order with a successor (another Bug 2 instance).
run ShowAdministeredAmendmentViolation {
    some disj a, b : Order | {
        b in a.successor
        a.state = Administered   -- also prohibited by Invariant 3
        b.state = Ordered
        b.predecessor = a
        one b.amendedBy
        no a.predecessor
        a.patient = b.patient
        a.prescriber = b.prescriber
        a.medication = b.medication
    }
} for 4
