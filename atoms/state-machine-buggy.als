-- state-machine-buggy.als
-- BUGGY TWIN (vacuity guard) for state-machine.als.
--
-- Introduces real hazards the spec defends against by DROPPING three facts:
--   BUG 1 (Invariant 3): `EveryEntryDeclared` dropped — a history entry may carry a
--          (from, action, to) triple with NO matching declared transition (an
--          undeclared transition was recorded). A_Inv3_OnlyDeclaredTransitions fails.
--   BUG 2 (Invariant 4): `TerminalNoOutgoingDecl` dropped — a declared transition may
--          leave a terminal state, so an entry may fire FROM a terminal state.
--          A_Inv4_TerminalAbsorption fails.
--   BUG 3 (replay): `ChainConsistency` dropped — consecutive entries need not agree
--          (entry[n].to_state != entry[n+1].from_state), so replay does not arrive at
--          a coherent current_state. A_ChainConsistency fails.
--
-- All other facts (linear backbone, single chain, determinism, head-from-initial)
-- are retained so the violations are isolated. If the checker reports all checks
-- UNSAT here, the harness is vacuous.

module state_machine_buggy

abstract sig St {}
abstract sig Action {}

sig Trans {
    tfrom : one St,
    tact  : one Action,
    tto   : one St
}

one sig Config {
    initial  : one St,
    terminal : set St
}

sig Entry {
    successor   : lone Entry,
    predecessor : lone Entry,
    efrom       : one St,
    eact        : one Action,
    eto         : one St
}

-- Linear backbone retained.
fact NoCycles        { all x : Entry | x not in x.^successor }
fact NoSelfLoop      { all x : Entry | x.successor != x }
fact NoMerging       { all x : Entry | lone (successor.x) }
fact SuccPredInverse { all a, b : Entry | a.successor = b iff b.predecessor = a }
fact SingleHistoryChain { lone (Entry - Entry.successor) }

-- Determinism + initial-not-terminal + head-from-initial retained.
fact DeterministicDecl {
    all disj t1, t2 : Trans | not (t1.tfrom = t2.tfrom and t1.tact = t2.tact)
}
fact InitialNotTerminal { Config.initial not in Config.terminal }
fact HeadFromInitial {
    all e : Entry | (no e.predecessor) implies e.efrom = Config.initial
}

-- BUG 1: EveryEntryDeclared DROPPED.
-- BUG 2: TerminalNoOutgoingDecl DROPPED.
-- BUG 3: ChainConsistency DROPPED.

-- ── Assertions (identical to state-machine.als). Several now SAT. ──

assert A_Linear_AtMostOneSuccessor   { all x : Entry | lone x.successor }
check A_Linear_AtMostOneSuccessor for 7

assert A_Linear_AtMostOnePredecessor { all x : Entry | lone x.predecessor }
check A_Linear_AtMostOnePredecessor for 7

assert A_Linear_NoBranching          { all x : Entry | lone (successor.x) }
check A_Linear_NoBranching for 7

assert A_Linear_NoCycles             { all x : Entry | x not in x.^successor }
check A_Linear_NoCycles for 7

-- VIOLATED (BUG 1):
assert A_Inv3_OnlyDeclaredTransitions {
    all e : Entry | some t : Trans |
        t.tfrom = e.efrom and t.tact = e.eact and t.tto = e.eto
}
check A_Inv3_OnlyDeclaredTransitions for 7

assert A_DeterministicDecl {
    all disj t1, t2 : Trans | not (t1.tfrom = t2.tfrom and t1.tact = t2.tact)
}
check A_DeterministicDecl for 7

-- VIOLATED (BUG 2):
assert A_Inv4_TerminalAbsorption {
    no e : Entry | e.efrom in Config.terminal
}
check A_Inv4_TerminalAbsorption for 7

-- VIOLATED (BUG 3):
assert A_ChainConsistency {
    all a, b : Entry | a.successor = b implies a.eto = b.efrom
}
check A_ChainConsistency for 7

assert A_Inv7_ReplayUniqueTail {
    lone (Entry - Entry.successor)
}
check A_Inv7_ReplayUniqueTail for 7

assert A_Inv7_HeadFromInitial {
    all e : Entry | (no e.predecessor) implies e.efrom = Config.initial
}
check A_Inv7_HeadFromInitial for 7

-- Demonstration runs of the hazards (each must be SAT in the twin).
run ShowUndeclaredTransition {
    some e : Entry | no t : Trans |
        (t.tfrom = e.efrom and t.tact = e.eact and t.tto = e.eto)
} for 4

run ShowFireFromTerminal {
    some e : Entry | e.efrom in Config.terminal
} for 4

run ShowInconsistentChain {
    some a, b : Entry | a.successor = b and a.eto != b.efrom
} for 4
