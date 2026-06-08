-- provenance-buggy.als
-- BUGGY TWIN (vacuity guard) for provenance.als.
--
-- Introduces TWO real hazards the spec defends against, so the checker finds
-- counterexamples (SAT on the corresponding `check`s):
--
-- BUG 1 — custody gap / false predecessor (targets Invariant 4):
--   The `CustodyContinuity` fact is DROPPED. With it gone, a Transferred entry
--   may record a `fromC` that is NOT its predecessor's holder (a forged
--   predecessor / custody gap), and a non-transfer entry's holder may diverge
--   from its predecessor's holder (custody silently changes hands with no
--   transfer). A_Inv4_CustodyUnbroken, A_Inv4_TransferHandToHand, and
--   A_Inv4_OnlyHolderActs all find counterexamples.
--
-- BUG 2 — archived not absorbing (targets Invariant 6):
--   The `ArchivedTerminal` fact is DROPPED. An Archived entry may then have a
--   successor — an entry appended after terminal disposition. A_Inv6_ArchivedTerminal
--   finds a counterexample.
--
-- All other facts (linear backbone, genesis typing, field shape) are retained so
-- the model is non-degenerate and the violations are isolated to the two
-- load-bearing guarantees. If the checker reports all checks UNSAT here, the
-- harness is vacuous.

module provenance_buggy

abstract sig EventType {}
one sig Originated, Received, Transferred, Transformed, Disclosed, Archived extends EventType {}

fun GenesisType : set EventType { Originated + Received }

abstract sig Custodian {}

sig Entry {
    successor   : lone Entry,
    predecessor : lone Entry,
    etype       : one  EventType,
    holder      : one  Custodian,
    acting      : lone Custodian,
    fromC       : lone Custodian,
    toC         : lone Custodian
}

-- Linear backbone retained.
fact NoCycles            { all x : Entry | x not in x.^successor }
fact NoSelfLoop          { all x : Entry | x.successor != x }
fact NoMerging           { all x : Entry | lone (successor.x) }
fact SuccPredInverse     { all a, b : Entry | a.successor = b iff b.predecessor = a }

-- Genesis typing retained.
fact GenesisTyping {
    all x : Entry | (no x.predecessor) iff (x.etype in GenesisType)
}

-- Field shape retained (so transfers still carry from/to and others an acting).
fact TransferFields {
    all x : Entry | x.etype = Transferred implies (one x.fromC and one x.toC and no x.acting)
}
fact NonTransferFields {
    all x : Entry | x.etype != Transferred implies (no x.fromC and no x.toC and one x.acting)
}

-- BUG 1: `CustodyContinuity` fact is DROPPED (custody gap / false predecessor).
-- BUG 2: `ArchivedTerminal` fact is DROPPED (archived not absorbing).

-- ── Assertions (identical to provenance.als). The dropped facts make several SAT. ──

assert A_Linear_AtMostOneSuccessor   { all x : Entry | lone x.successor }
check A_Linear_AtMostOneSuccessor for 8

assert A_Linear_AtMostOnePredecessor { all x : Entry | lone x.predecessor }
check A_Linear_AtMostOnePredecessor for 8

assert A_Linear_NoBranching          { all x : Entry | lone (successor.x) }
check A_Linear_NoBranching for 8

assert A_Linear_NoCycles             { all x : Entry | x not in x.^successor }
check A_Linear_NoCycles for 8

assert A_Inv3_SingleOriginTyping {
    all x : Entry | (no x.predecessor) iff (x.etype in GenesisType)
}
check A_Inv3_SingleOriginTyping for 8

-- VIOLATED in this twin (BUG 1):
assert A_Inv4_CustodyUnbroken {
    all x : Entry | some x.predecessor implies
        ( (x.etype = Transferred implies x.fromC = x.predecessor.holder)
          and
          (x.etype != Transferred implies x.holder = x.predecessor.holder) )
}
check A_Inv4_CustodyUnbroken for 8

-- VIOLATED in this twin (BUG 1):
assert A_Inv4_TransferHandToHand {
    all x : Entry | x.etype = Transferred implies x.fromC = x.predecessor.holder
}
check A_Inv4_TransferHandToHand for 8

assert A_Inv4_TransferSetsHolder {
    all x : Entry | x.etype = Transferred implies x.holder = x.toC
}
check A_Inv4_TransferSetsHolder for 8

-- VIOLATED in this twin (BUG 1):
assert A_Inv4_OnlyHolderActs {
    all x : Entry | (some x.predecessor and x.etype != Transferred) implies
        x.acting = x.predecessor.holder
}
check A_Inv4_OnlyHolderActs for 8

assert A_Inv4_UniqueHolder {
    all x : Entry | one x.holder
}
check A_Inv4_UniqueHolder for 8

-- VIOLATED in this twin (BUG 2):
assert A_Inv6_ArchivedTerminal {
    all x : Entry | x.etype = Archived implies no x.successor
}
check A_Inv6_ArchivedTerminal for 8

assert A_Inv7_CustodianPresent {
    all x : Entry |
        (x.etype = Transferred implies (one x.fromC and one x.toC))
        and
        (x.etype != Transferred implies one x.acting)
}
check A_Inv7_CustodianPresent for 8

-- Demonstration runs of the two hazards (each must be SAT in the twin).
run ShowCustodyGapViolation {
    some disj a, b : Entry, disj c1, c2, c3 : Custodian | {
        a.etype = Originated   a.holder = c1   no a.predecessor
        b.predecessor = a   a.successor = b
        b.etype = Transferred
        b.fromC = c3        -- forged: c3 was never the holder (predecessor holder is c1)
        b.toC = c2
        b.holder = c2
    }
} for 4

run ShowArchivedNotAbsorbingViolation {
    some disj a, b, c : Entry | {
        a.etype = Originated    no a.predecessor    a.successor = b
        b.etype = Archived      b.predecessor = a   b.successor = c
        c.etype = Transferred   c.predecessor = b   -- entry after archive
    }
} for 4
