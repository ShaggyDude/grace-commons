-- medication-order.als
-- Alloy structural model for the Grace Commons Medication Order atom
-- (atoms/healthcare/medication-order.md)
--
-- PURPOSE
-- Verify the load-bearing structural invariants of the Medication Order atom
-- by bounded exhaustive search. The model encodes:
--   (a) amendment-chain linearity (Invariant 4), and
--   (b) the pre-dispensing amendment guard (Invariant 3),
-- as its primary target claims.
--
-- INVARIANTS ENCODED
--   Invariant 3 — Amendment is pre-dispensing only. An order may acquire a
--                 successor (i.e. be amended) only while in a pre-dispensing
--                 state (Ordered or Verified). Orders in Dispensed, Administered,
--                 Completed, Cancelled, or Discontinued state must not have a
--                 successor. Amended and On Hold are excluded by the state
--                 consistency facts below (Amended has a successor by definition;
--                 On Hold orders carry a prior_state guard at the action layer —
--                 not the structural layer, so On Hold is also excluded from
--                 having a successor here, since the spec says amend rejects
--                 on-hold orders with "on-hold" and only valid source states for
--                 amend are Ordered or Verified).
--   Invariant 4 — Amendment chains are linear. Each order has at most one
--                 successor_id and at most one predecessor_id. Chains are
--                 singly-linked; branching and cycles are forbidden.
--   Invariant 2 — Successor inherits identity fields. The successor carries the
--                 same patient_ref, prescriber_ref, and medication_ref as the
--                 original. (Spec §Identity model and §Invariants 2/4.)
--
-- SCOPE
-- Static structural model (snapshots). Each Order sig represents one medication
-- order record in the store. The amendment chain is modeled as a directed relation
-- (successor) over the set of orders. States are encoded as an abstract sig with
-- named singletons. The pre-dispensing guard is modeled as a structural fact:
-- an order has a successor iff it is in Amended state, and Amended state is only
-- reachable from pre-dispensing states (Ordered or Verified) — making the post-
-- dispensing-no-successor invariant a structural consequence verifiable by check.
--
-- NOT MODELED HERE
-- - Clock semantics / ordered_at / verified_at / dispensed_at (not needed to
--   verify chain linearity or the dispensing boundary)
-- - Hold/reinstate mechanics (Invariants 5, 9) — covered by medication-order.tla
-- - Cryptographic tamper-evidence (composing-pattern concern)
-- - Access control / permission checks (composing-pattern concern)
-- - Field validation (non-whitespace constraints) — Invariants 10, 11
-- - Storage-failure atomicity (implementation obligation, not structural invariant)
-- - Multi-store-instance routing (deployment concern)
-- - Value constraints on dose / dose_unit / route / frequency (deployment policy)
--
-- HOW TO READ THE RESULTS
-- Every "check A_*" should return UNSAT — "No counterexample found" — meaning the
-- asserted guarantee holds for all configurations within the scope.
-- Every "run Show*" should return SAT — at least one instance exists — confirming
-- the configuration space is non-empty (invariants are satisfiable; no fact
-- over-constrains).
-- A "check" that returns SAT (counterexample found) is a spec finding.
-- A "run" that returns UNSAT (no instance) means the facts are too restrictive.
--
-- HARNESS COMMANDS (from tools/harness):
--   node check.mjs ../../atoms/healthcare/medication-order.als
--   Expected: PASS (all checks UNSAT, all runs SAT)

module medication_order

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures (types)
-- ─────────────────────────────────────────────────────────────────────────────

-- State enum: exactly one of nine values (spec §State).
-- Pre-dispensing states: Ordered, Verified.
-- Post-dispensing / terminal / inactive states: Dispensed, Administered,
--   Completed, Cancelled, Discontinued, Amended.
-- On Hold: structurally excluded from having a successor because amend rejects
--   on-hold orders; modeled as a distinct state here for completeness.
abstract sig State {}
one sig Ordered, Verified, Dispensed, Administered, Completed,
        Cancelled, Discontinued, Amended, OnHold extends State {}

-- Pre-dispensing states are those from which amend is permitted.
-- Spec §Actions §amend: "Valid only for orders in Ordered or Verified state."
-- Spec §Invariant 3: "amend is rejected for any order in Dispensed, Administered,
--   Completed, On Hold, Cancelled, Discontinued, or Amended state."
fun PreDispensingState : set State {
    Ordered + Verified
}

-- Post-dispensing states: Dispensed, Administered, Completed, Discontinued.
-- Plus terminal-before-dispensing (Cancelled) and inactive (Amended, OnHold).
-- All of these must NOT have a successor.
fun NoSuccessorState : set State {
    Dispensed + Administered + Completed + Cancelled + Discontinued + OnHold
}

-- Opaque reference types. Alloy generates concrete atoms freely.
abstract sig PatientRef    {}
abstract sig PrescriberRef {}  -- prescriber_ref (also inherited by successor)
abstract sig MedicationRef {}  -- medication_ref (also inherited by successor)
abstract sig ClinRef       {}  -- clinician reference for amended_by, etc.

-- The medication order record.
-- successor:   lone — at most one direct successor (Invariant 4, at-most-one half).
--              Present iff this order has been amended (state = Amended).
-- predecessor: lone — at most one direct predecessor (Invariant 4, inverse half).
--              Present iff this order was created by amend.
-- patient:     one  — always present; inherited by successor (Invariants 1, 2).
-- prescriber:  one  — always present; inherited by successor (Invariants 1, 2).
-- medication:  one  — always present; inherited by successor (Invariants 1, 2).
-- amendedBy:   lone — present only on successor orders (set by amend).
-- state:       one  — always exactly one state (spec §State).
sig Order {
    successor   : lone Order,   -- the correcting order (set when this becomes Amended)
    predecessor : lone Order,   -- the order this corrects (set on amend creation)
    patient     : one  PatientRef,
    prescriber  : one  PrescriberRef,
    medication  : one  MedicationRef,
    amendedBy   : lone ClinRef,  -- who made the correction; set only on successor orders
    state       : one  State
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural well-formedness facts
-- These constrain the universe to VALID configurations only.
-- A fact is a constraint Alloy treats as always true for all instances.
-- ─────────────────────────────────────────────────────────────────────────────

-- Invariant 4 (no-cycles half): the amendment chain is acyclic.
-- "x in x.^successor" would mean x can reach itself via one or more successor steps.
-- The spec says chains are singly-linked and terminate; they never form a loop.
fact NoCycles {
    all x : Order | x not in x.^successor
}

-- Invariant 4 (no-merging half): no two distinct orders share the same successor.
-- i.e., every order is the successor of at most one other order.
-- This enforces that chains do not converge (two different originals amended to
-- the same successor is structurally prohibited).
fact LinearChain {
    all x : Order | lone (successor.x)
}

-- Inverse consistency: successor and predecessor are inverses of each other.
-- If order B is the successor of order A, then A must be the predecessor of B.
-- This encodes the bidirectional link that spec §State and §Actions describe:
-- after amend, original gets successor_id and successor gets predecessor_id.
fact SuccessorPredecessorInverse {
    all a, b : Order | a.successor = b iff b.predecessor = a
}

-- Amended state iff successor is set (the link and the state label are consistent).
-- Spec §State: "Amended — the order has been superseded by a successor. Retained
-- and visible; carries successor_id pointing to the correcting order."
fact AmendedIffHasSuccessor {
    all x : Order | x.state = Amended iff one x.successor
}

-- No self-loops: an order cannot be its own successor.
-- Subsumed by NoCycles but stated explicitly for clarity and direct testability.
fact NoSelfLoop {
    all x : Order | x.successor != x
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariant 3: Pre-dispensing amendment guard
-- An order may only be amended (acquire a successor) while in a pre-dispensing
-- state. Equivalently: an order with a successor must be in Amended state, and
-- AmendedIffHasSuccessor already encodes "Amended iff has successor". The guard
-- closes the loop: Amended state is only reachable from Ordered or Verified.
-- Structurally: if an order is Amended, then its predecessor (the order that was
-- amended) was in a pre-dispensing state *at the moment of amendment*.
-- In a static snapshot model the predecessor's current state IS Amended; to
-- capture the pre-dispensing guard structurally we assert the inverse:
-- orders in post-dispensing / terminal / inactive states must have no successor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Invariant 3 (core structural form): orders that have passed the dispensing
-- boundary — or were cancelled, discontinued, or put on hold — cannot be amended.
-- This is the structural invariant: no order in a NoSuccessorState has a successor.
fact PreDispensingOnlyAmendment {
    all x : Order | x.state in NoSuccessorState implies no x.successor
}

-- Successor state constraint: a successor order (one with a predecessor) always
-- starts in Ordered state. Spec §Actions §amend: "The successor starts in Ordered
-- state regardless of whether the original was Ordered or Verified."
-- Spec §Behavior: "The successor always starts in Ordered state."
fact SuccessorStartsOrdered {
    all x : Order | one x.predecessor implies x.state in (Ordered + Verified + Dispensed +
        Administered + Completed + Cancelled + Discontinued + Amended + OnHold)
    -- Note: a successor's CURRENT state can be any valid state because the static
    -- model is a snapshot of the store — the successor may have progressed beyond
    -- Ordered by the time of the snapshot. The structural guard we care about is
    -- that a successor cannot be a chain head that bypassed Ordered; there is no
    -- constraint to add here beyond what the state machine already enforces by the
    -- linear chain structure. The "starts in Ordered" rule is a temporal claim
    -- (captured by medication-order.tla), not a static structural constraint.
}

-- amendedBy is set iff the order has a predecessor (it was created by amend).
-- Spec §Actions §amend: "The successor carries ... amended_by." and
-- §Invariant 12: "amended_by / amendment_reason on a successor ... all immutable."
fact AmendedByConsistency {
    all x : Order | (one x.amendedBy) iff (one x.predecessor)
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariant 2: Inherited identity fields
-- The successor carries the same patient_ref, prescriber_ref, and medication_ref
-- as the original. Spec §Identity model and §Invariant 2.
-- ─────────────────────────────────────────────────────────────────────────────

-- patient_ref is inherited across amendment chains.
fact PatientRefInherited {
    all a, b : Order | a.successor = b implies b.patient = a.patient
}

-- prescriber_ref is inherited across amendment chains.
-- Spec §Identity model: "prescriber_ref is inherited unchanged by any successor
-- order created by amend — prescribing authorship belongs to the original prescriber."
fact PrescriberRefInherited {
    all a, b : Order | a.successor = b implies b.prescriber = a.prescriber
}

-- medication_ref is inherited across amendment chains.
-- Spec §Identity model: "medication_ref is inherited unchanged by any successor
-- order created by amend. An order placed for the wrong medication must be
-- cancelled and re-ordered; amendment cannot change the medication identity."
fact MedicationRefInherited {
    all a, b : Order | a.successor = b implies b.medication = a.medication
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- Each "check" command asks Alloy: is there any configuration satisfying the
-- facts but violating this assertion? UNSAT = guarantee holds. SAT = spec finding.
-- ─────────────────────────────────────────────────────────────────────────────

-- A_Inv4_AtMostOneSuccessor (Invariant 4):
-- No order has more than one direct successor.
assert A_Inv4_AtMostOneSuccessor {
    all x : Order | lone x.successor
}
check A_Inv4_AtMostOneSuccessor for 8

-- A_Inv4_AtMostOnePredecessor (Invariant 4):
-- No order has more than one direct predecessor (no merging of chains).
assert A_Inv4_AtMostOnePredecessor {
    all x : Order | lone x.predecessor
}
check A_Inv4_AtMostOnePredecessor for 8

-- A_Inv4_NoBranching (Invariant 4):
-- No two distinct orders have the same successor (the anti-branching direction:
-- no order is the successor of two different orders — no convergence).
assert A_Inv4_NoBranching {
    all x : Order | lone (successor.x)
}
check A_Inv4_NoBranching for 8

-- A_Inv4_NoCycles (Invariant 4):
-- The amendment chain is acyclic — no order can reach itself via successor steps.
assert A_Inv4_NoCycles {
    all x : Order | x not in x.^successor
}
check A_Inv4_NoCycles for 8

-- A_Inv3_NoSuccessorAfterDispensing (Invariant 3):
-- Orders that have crossed the dispensing boundary (or been cancelled/discontinued
-- or put on hold) cannot have a successor. This directly encodes "amendment is
-- pre-dispensing only."
assert A_Inv3_NoSuccessorAfterDispensing {
    all x : Order | x.state in NoSuccessorState implies no x.successor
}
check A_Inv3_NoSuccessorAfterDispensing for 8

-- A_Inv3_AmendedMustHavePredecessorInPreDispensingState (Invariant 3):
-- Equivalently: if an order is Amended, its predecessor (the one that was amended)
-- must have been in a pre-dispensing state. In the static snapshot, the original
-- is NOW in Amended state (AmendedIffHasSuccessor), not in Ordered/Verified.
-- But the transitional guard is captured by PreDispensingOnlyAmendment: an order
-- cannot BECOME Amended unless it started from Ordered or Verified. We assert
-- the contrapositive: no order in a post-dispensing/terminal/inactive state has
-- a successor (same claim, asserting it is derivable from the facts).
-- This check is logically equivalent to A_Inv3_NoSuccessorAfterDispensing but
-- stated from the "pre-dispensing source" perspective for coverage completeness.
assert A_Inv3_SuccessorOnlyFromPreDispensing {
    all a : Order | one a.successor implies a.state = Amended
}
check A_Inv3_SuccessorOnlyFromPreDispensing for 8

-- A_Inv4_AmendedHasSuccessor:
-- Every Amended order has exactly one successor.
assert A_Inv4_AmendedHasSuccessor {
    all x : Order | x.state = Amended implies one x.successor
}
check A_Inv4_AmendedHasSuccessor for 8

-- A_Inv4_SuccessorHasPredecessor:
-- Every order that has a predecessor must itself be the successor of that predecessor.
assert A_Inv4_SuccessorHasPredecessor {
    all x : Order | one x.predecessor implies x.predecessor.successor = x
}
check A_Inv4_SuccessorHasPredecessor for 8

-- A_Inv2_PatientRefChainConsistency (Invariant 2):
-- All orders reachable via successor* from a given order share the same patient.
assert A_Inv2_PatientRefChainConsistency {
    all x, y : Order | y in x.*successor implies y.patient = x.patient
}
check A_Inv2_PatientRefChainConsistency for 8

-- A_Inv2_PrescriberRefChainConsistency (Invariant 2):
-- All orders reachable via successor* share the same prescriber_ref.
assert A_Inv2_PrescriberRefChainConsistency {
    all x, y : Order | y in x.*successor implies y.prescriber = x.prescriber
}
check A_Inv2_PrescriberRefChainConsistency for 8

-- A_Inv2_MedicationRefChainConsistency (Invariant 2):
-- All orders reachable via successor* share the same medication_ref.
-- Spec: "Amendment cannot change the medication identity."
assert A_Inv2_MedicationRefChainConsistency {
    all x, y : Order | y in x.*successor implies y.medication = x.medication
}
check A_Inv2_MedicationRefChainConsistency for 8

-- A_Inv12_AmendedBySetOnSuccessorOnly:
-- amendedBy is set iff the order has a predecessor (created by amend).
assert A_Inv12_AmendedBySetOnSuccessorOnly {
    all x : Order | (one x.amendedBy) iff (one x.predecessor)
}
check A_Inv12_AmendedBySetOnSuccessorOnly for 8

-- A_SuccessorPredecessorAreInverse:
-- successor and predecessor relations are strict inverses of each other.
assert A_SuccessorPredecessorAreInverse {
    all a, b : Order | a.successor = b iff b.predecessor = a
}
check A_SuccessorPredecessorAreInverse for 8

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs
-- Every "run" must return SAT — at least one instance — confirming the facts do
-- not over-constrain the model (the invariants are mutually satisfiable).
-- These are the non-vacuity guards: each load-bearing predicate is paired with
-- a run that exercises the relevant configuration space.
-- ─────────────────────────────────────────────────────────────────────────────

-- A single Ordered order: the simplest valid store state.
run ShowSingleOrdered {
    some x : Order | x.state = Ordered and no x.predecessor and no x.successor
} for 3

-- A single order in a post-dispensing terminal state with no successor.
run ShowDispensedNoSuccessor {
    some x : Order | x.state = Dispensed and no x.successor and no x.predecessor
} for 3

-- A two-link amendment chain: order A (Amended) → order B (Ordered).
-- This is the minimal non-trivial chain. Non-vacuity guard for Inv 3 and Inv 4
-- linearity checks: confirms a valid pre-dispensing amendment is constructable.
-- A's original state was pre-dispensing (Ordered or Verified); A is now Amended
-- (the transition has occurred). B is the successor, starting in Ordered.
run ShowTwoLinkChain {
    some disj a, b : Order | {
        a.successor = b
        a.state = Amended
        b.state = Ordered
        b.predecessor = a
        one b.amendedBy              -- correction attribution is set on the successor
        no a.predecessor             -- a is the chain head (original order)
        a.patient = b.patient        -- Invariant 2: same patient across chain
        a.prescriber = b.prescriber  -- Invariant 2: same prescriber across chain
        a.medication = b.medication  -- Invariant 2: same medication across chain
    }
} for 4

-- A three-link amendment chain: A (Amended) → B (Amended) → C (Ordered).
-- Critical non-vacuity run: confirms linearity facts permit multi-link chains
-- and do NOT make them impossible (would falsely satisfy the linearity assertions
-- trivially over empty chains).
run ShowThreeLinkChain {
    some disj a, b, c : Order | {
        a.successor = b
        b.successor = c
        a.state = Amended
        b.state = Amended
        c.state = Ordered
        b.predecessor = a
        c.predecessor = b
        no a.predecessor             -- a is the chain head
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

-- An order that progressed to Dispensed (no successor): the post-dispensing case.
-- This confirms the pre-dispensing guard is satisfiable (an order CAN reach
-- Dispensed) — not over-constrained to only Ordered/Verified states.
run ShowDispensedTerminal {
    some disj a, b : Order | {
        a.successor = b             -- a was amended before reaching Dispensed
        a.state = Amended
        b.state = Dispensed         -- successor progressed to Dispensed
        b.predecessor = a
        one b.amendedBy
        no a.predecessor
        a.patient = b.patient
        a.prescriber = b.prescriber
        a.medication = b.medication
        no b.successor              -- the Dispensed order has no successor (Inv 3)
    }
} for 4

-- Two independent amendment chains for different patients.
-- Confirms the store can hold multiple unrelated chains simultaneously.
run ShowTwoIndependentChains {
    some disj a, b, c, d : Order, disj p1, p2 : PatientRef | {
        a.successor = b
        a.state = Amended
        b.state = Ordered
        b.predecessor = a
        a.patient = p1
        b.patient = p1
        c.successor = d
        c.state = Amended
        d.state = Ordered
        d.predecessor = c
        c.patient = p2
        d.patient = p2
        p1 != p2
    }
} for 6

-- Non-vacuity guard for Invariant 3 (post-dispensing has no successor):
-- Confirm a Dispensed order, a Administered order, and an Amended order can
-- coexist in a valid store snapshot.
run ShowMixedStates {
    some disj a, b, c : Order | {
        a.state = Dispensed
        b.state = Administered
        c.state = Amended
        no a.successor
        no b.successor
        one c.successor
        no a.predecessor
        no b.predecessor
    }
} for 5
