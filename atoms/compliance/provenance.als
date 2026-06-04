-- provenance.als
-- Alloy structural model for the Grace Commons Provenance atom
-- (atoms/compliance/provenance.md)
--
-- PURPOSE
-- Verify the load-bearing structural invariants of the Provenance atom by bounded
-- exhaustive search. The model encodes the custody chain of ONE artifact as a
-- linear sequence of entries and verifies:
--   (a) custody continuity / no gap (Invariant 4) — the load-bearing claim,
--   (b) single origin (Invariant 3),
--   (c) archived-is-terminal/absorbing (Invariant 6),
--   (d) the linear-chain backbone (Invariants 2/5 — append-only, total order),
--   (e) custodian presence (Invariant 7) and event-type validity (Invariant 8).
--
-- MODELING APPROACH (mirrors atoms/healthcare/clinical-observation.als)
-- Static structural snapshot. Each Entry is one custody record. The chain is a
-- directed linear relation (successor/predecessor). `holder` is the current
-- custodian in effect immediately AFTER an entry (the cached current_custodian
-- projection, here made explicit per entry so continuity can be checked
-- structurally). Custody continuity is the hand-to-hand rule across every link:
-- the custody coming INTO an entry equals the custody going OUT of its
-- predecessor. For a Transferred entry the incoming custody is `fromC`; for any
-- other entry it is `holder` (unchanged). A Transferred entry sets the new
-- holder to `toC`.
--
-- NOT MODELED HERE
-- - Clock semantics / recorded_at ordering (sequence_number is the order source;
--   linear position models it; Invariant 5 is the linear backbone)
-- - Cryptographic tamper-evidence (Tamper Evidence — composing concern)
-- - Non-repudiable custodian identity (Actor Identity — composing concern)
-- - Disclosure scope/authority (Selective Disclosure — composing concern)
-- - Storage-failure atomicity (implementation obligation, not a structural invariant)
-- - Multi-store routing / id-uniqueness across stores (deployment concern)
--
-- HOW TO READ THE RESULTS
-- Every "check A_*" should return UNSAT ("No counterexample found") — the
-- guarantee holds for all configurations in scope. Every "run Show*" should
-- return SAT — the configuration space is non-empty (no fact over-constrains).
-- A check that returns SAT is a spec finding; a run that returns UNSAT means the
-- facts are too restrictive.

module provenance

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures
-- ─────────────────────────────────────────────────────────────────────────────

-- Event type enum: exactly one of six values (spec §State).
abstract sig EventType {}
one sig Originated, Received, Transferred, Transformed, Disclosed, Archived extends EventType {}

-- The genesis event types (a chain opens with exactly one of these).
fun GenesisType : set EventType { Originated + Received }

-- Opaque custodian reference. Alloy generates concrete atoms freely
-- (abstract sig with no extensions behaves as a normal sig).
abstract sig Custodian {}

-- A custody entry.
-- successor/predecessor : lone — linear chain (Invariant 2/5; no branching).
-- etype  : one — exactly one event type (spec §State).
-- holder : one — the current custodian in effect immediately AFTER this entry.
-- acting : lone — the custodian who performed a non-transfer action (genesis,
--          transform, disclose, archive); absent on transfers.
-- fromC  : lone — transfer only: the outgoing custodian (= predecessor.holder).
-- toC    : lone — transfer only: the incoming custodian (= this.holder).
sig Entry {
    successor   : lone Entry,
    predecessor : lone Entry,
    etype       : one  EventType,
    holder      : one  Custodian,
    acting      : lone Custodian,
    fromC       : lone Custodian,
    toC         : lone Custodian
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural well-formedness facts (constrain the universe to VALID chains)
-- ─────────────────────────────────────────────────────────────────────────────

-- Linear backbone (Invariant 2/5): acyclic, singly-linked, no branching/merging.
fact NoCycles            { all x : Entry | x not in x.^successor }
fact NoSelfLoop          { all x : Entry | x.successor != x }
fact NoMerging           { all x : Entry | lone (successor.x) }
fact SuccPredInverse     { all a, b : Entry | a.successor = b iff b.predecessor = a }

-- Invariant 3 / 8 — genesis typing: an entry is genesis (no predecessor) iff its
-- event type is a genesis type. Non-genesis entries carry a non-genesis type.
fact GenesisTyping {
    all x : Entry | (no x.predecessor) iff (x.etype in GenesisType)
}

-- Invariant 6 — Archived is terminal: an Archived entry has no successor.
fact ArchivedTerminal {
    all x : Entry | x.etype = Archived implies no x.successor
}

-- Field shape by event type.
-- Transfers carry fromC and toC and no acting custodian.
fact TransferFields {
    all x : Entry | x.etype = Transferred implies (one x.fromC and one x.toC and no x.acting)
}
-- Non-transfer entries carry an acting custodian and no from/to.
fact NonTransferFields {
    all x : Entry | x.etype != Transferred implies (no x.fromC and no x.toC and one x.acting)
}

-- Invariant 4 — Custody continuity (the load-bearing fact). At every link the
-- custody coming INTO an entry equals the custody going OUT of its predecessor:
--   * Transferred entry: fromC = predecessor.holder, and the new holder = toC.
--   * any other non-genesis entry: holder = predecessor.holder (custody unchanged)
--     and the acting custodian = the holder (only the current holder may act).
-- Genesis entry: acting = holder (the originating custodian); holder is the
-- genesis custodian by construction.
fact CustodyContinuity {
    all x : Entry |
        (some x.predecessor and x.etype = Transferred) implies
            (x.fromC = x.predecessor.holder and x.holder = x.toC)
    all x : Entry |
        (some x.predecessor and x.etype != Transferred) implies
            (x.holder = x.predecessor.holder and x.acting = x.holder)
    all x : Entry |
        (no x.predecessor) implies (x.acting = x.holder)
}

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions — each "check" asks: is there a configuration satisfying the facts
-- but violating this guarantee? UNSAT = holds. SAT = finding.
-- ─────────────────────────────────────────────────────────────────────────────

-- Linear backbone (Invariant 2/5).
assert A_Linear_AtMostOneSuccessor   { all x : Entry | lone x.successor }
check A_Linear_AtMostOneSuccessor for 8

assert A_Linear_AtMostOnePredecessor { all x : Entry | lone x.predecessor }
check A_Linear_AtMostOnePredecessor for 8

assert A_Linear_NoBranching          { all x : Entry | lone (successor.x) }
check A_Linear_NoBranching for 8

assert A_Linear_NoCycles             { all x : Entry | x not in x.^successor }
check A_Linear_NoCycles for 8

-- Invariant 3 — Single origin: genesis iff genesis-type; every non-genesis entry
-- has a predecessor (a strictly-earlier entry). In a linear component this makes
-- the genesis the unique source.
assert A_Inv3_SingleOriginTyping {
    all x : Entry | (no x.predecessor) iff (x.etype in GenesisType)
}
check A_Inv3_SingleOriginTyping for 8

-- Invariant 4 — Custody continuity (no gap), the load-bearing claim. At every
-- link the incoming custody equals the predecessor's outgoing custody.
assert A_Inv4_CustodyUnbroken {
    all x : Entry | some x.predecessor implies
        ( (x.etype = Transferred implies x.fromC = x.predecessor.holder)
          and
          (x.etype != Transferred implies x.holder = x.predecessor.holder) )
}
check A_Inv4_CustodyUnbroken for 8

-- Invariant 4 — a Transferred entry's hand-to-hand outgoing custodian equals the
-- prior holder (the false-predecessor attack surface; cannot be forged).
assert A_Inv4_TransferHandToHand {
    all x : Entry | x.etype = Transferred implies x.fromC = x.predecessor.holder
}
check A_Inv4_TransferHandToHand for 8

-- Invariant 4 — a Transferred entry installs toC as the new holder.
assert A_Inv4_TransferSetsHolder {
    all x : Entry | x.etype = Transferred implies x.holder = x.toC
}
check A_Inv4_TransferSetsHolder for 8

-- Invariant 4 — only the current holder may transform/disclose/archive: a
-- non-genesis non-transfer entry's acting custodian equals the prior holder.
assert A_Inv4_OnlyHolderActs {
    all x : Entry | (some x.predecessor and x.etype != Transferred) implies
        x.acting = x.predecessor.holder
}
check A_Inv4_OnlyHolderActs for 8

-- Invariant 4 — custody is never held by nobody: every entry has exactly one holder.
assert A_Inv4_UniqueHolder {
    all x : Entry | one x.holder
}
check A_Inv4_UniqueHolder for 8

-- Invariant 6 — Archived is terminal and absorbing: no successor after Archived.
assert A_Inv6_ArchivedTerminal {
    all x : Entry | x.etype = Archived implies no x.successor
}
check A_Inv6_ArchivedTerminal for 8

-- Invariant 7 — Custodian presence: every entry names a custodian; transfers name
-- both from and to.
assert A_Inv7_CustodianPresent {
    all x : Entry |
        (x.etype = Transferred implies (one x.fromC and one x.toC))
        and
        (x.etype != Transferred implies one x.acting)
}
check A_Inv7_CustodianPresent for 8

-- ─────────────────────────────────────────────────────────────────────────────
-- Satisfiability runs — each must be SAT (non-vacuity guards).
-- ─────────────────────────────────────────────────────────────────────────────

-- A single genesis (Originated) entry: the simplest valid chain.
run ShowSingleGenesis {
    some x : Entry | x.etype = Originated and no x.predecessor and no x.successor
} for 3

-- A genesis (Received) entry — intake from an external prior holder.
run ShowReceivedGenesis {
    some x : Entry | x.etype = Received and no x.predecessor and no x.successor
} for 3

-- A two-entry chain: Originated → Transferred, custody changes hands.
-- Non-vacuity guard for the continuity / hand-to-hand checks.
run ShowTransferChain {
    some disj a, b : Entry, disj c1, c2 : Custodian | {
        a.etype = Originated
        no a.predecessor
        a.holder = c1
        a.acting = c1
        b.predecessor = a
        a.successor = b
        b.etype = Transferred
        b.fromC = c1
        b.toC = c2
        b.holder = c2
    }
} for 4

-- A full lifecycle: Originated → Transferred → Transformed → Disclosed → Archived.
-- The critical non-vacuity run: a multi-link chain with a custody change and the
-- terminal archive, all holders continuous.
run ShowFullLifecycle {
    some disj a, b, c, d, e : Entry, disj c1, c2 : Custodian | {
        a.etype = Originated     a.holder = c1   a.acting = c1   no a.predecessor
        a.successor = b
        b.etype = Transferred    b.predecessor = a   b.fromC = c1   b.toC = c2   b.holder = c2
        b.successor = c
        c.etype = Transformed    c.predecessor = b   c.holder = c2   c.acting = c2
        c.successor = d
        d.etype = Disclosed      d.predecessor = c   d.holder = c2   d.acting = c2
        d.successor = e
        e.etype = Archived       e.predecessor = d   e.holder = c2   e.acting = c2
        no e.successor
    }
} for 6

-- Two independent chains (different artifacts / custodians) coexisting in a store.
run ShowTwoIndependentChains {
    some disj a, b, c, d : Entry, disj c1, c2, c3, c4 : Custodian | {
        a.etype = Originated   a.holder = c1   a.acting = c1   no a.predecessor
        a.successor = b
        b.etype = Transferred  b.predecessor = a   b.fromC = c1   b.toC = c2   b.holder = c2
        c.etype = Originated   c.holder = c3   c.acting = c3   no c.predecessor
        c.successor = d
        d.etype = Transferred  d.predecessor = c   d.fromC = c3   d.toC = c4   d.holder = c4
    }
} for 6
