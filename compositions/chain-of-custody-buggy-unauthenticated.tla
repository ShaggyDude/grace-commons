---- MODULE chain-of-custody-buggy-unauthenticated ----
\* BUGGY TWIN (vacuity guard) for chain-of-custody.tla — the AUTHENTICATION arm.
\*
\* Isolated twin for Invariant 7 (authentication precedes commitment), added
\* 2026-08-26 by the authentication-precedence round. The correct model splits
\* every custody action into WriteIntent -> commit, where the intent record is
\* the AuditTrail.record_action inside which the substrate validates the acting
\* custodian's credential. This twin removes that ordering constraint and
\* nothing else:
\*   CommitClean / FailPartial no longer require intentState[e] = "present"
\* Everything about the binding bijection, surfacing, and compensation is left
\* exactly as the correct model has it, so this twin isolates the authentication
\* claim rather than masking it behind an orphan counterexample — the same
\* one-twin-per-load-bearing-invariant discipline applied to Credential and to
\* Execute Gated Workflow's two twins.
\*
\* TLC reaches provState[e] = "present" with intentState[e] = "absent": a
\* custody entry committed — custody moved, transformed, disclosed, or the chain
\* permanently closed — with the acting custodian's credential never validated.
\* Inv7_AuthPrecedence fails; Invariant 4's facets all still hold, which is the
\* isolation the twin exists to demonstrate. The checker rejects the twin. If it
\* reports all invariants hold here, the harness is vacuous for Invariant 7.

CONSTANT Entries

VARIABLES intentState, provState, auditState, surfaced
vars == <<intentState, provState, auditState, surfaced>>

TypeOK ==
    /\ intentState \in [Entries -> {"absent", "present"}]
    /\ provState  \in [Entries -> {"absent", "present"}]
    /\ auditState \in [Entries -> {"absent", "clean", "recovered"}]
    /\ surfaced   \in [Entries -> BOOLEAN]

Init ==
    /\ intentState = [e \in Entries |-> "absent"]
    /\ provState  = [e \in Entries |-> "absent"]
    /\ auditState = [e \in Entries |-> "absent"]
    /\ surfaced   = [e \in Entries |-> FALSE]

WriteIntent(e) ==
    /\ intentState[e] = "absent"
    /\ intentState' = [intentState EXCEPT ![e] = "present"]
    /\ UNCHANGED <<provState, auditState, surfaced>>

\* BUG: no intentState precondition. The custody entry can commit before the
\* acting custodian's credential has been validated anywhere.
CommitClean(e) ==
    /\ provState[e] = "absent"
    /\ provState'  = [provState  EXCEPT ![e] = "present"]
    /\ auditState' = [auditState EXCEPT ![e] = "clean"]
    /\ UNCHANGED <<intentState, surfaced>>

\* BUG: same omission on the partial-failure arm.
FailPartial(e) ==
    /\ provState[e] = "absent"
    /\ provState'  = [provState EXCEPT ![e] = "present"]
    /\ surfaced'   = [surfaced  EXCEPT ![e] = TRUE]
    /\ UNCHANGED <<intentState, auditState>>

RetryAudit(e) ==
    /\ provState[e] = "present"
    /\ auditState[e] = "absent"
    /\ auditState' = [auditState EXCEPT ![e] = "recovered"]
    /\ UNCHANGED <<intentState, provState, surfaced>>

Next == \E e \in Entries :
            WriteIntent(e) \/ CommitClean(e) \/ FailPartial(e) \/ RetryAudit(e)
Spec == Init /\ [][Next]_vars

Orphan(e) == provState[e] = "present" /\ auditState[e] = "absent"

Coherent(e) ==
    \/ (provState[e] = "absent"  /\ auditState[e] = "absent" /\ ~surfaced[e])
    \/ (provState[e] = "present" /\ auditState[e] \in {"clean", "recovered"})

Inv4_SafetyBijection == \A e \in Entries : Coherent(e) \/ (Orphan(e) /\ surfaced[e])

Inv4_NoUnsurfacedOrphan == \A e \in Entries : Orphan(e) => surfaced[e]

Inv4_NoOrphanAudit ==
    \A e \in Entries : (auditState[e] # "absent") => (provState[e] = "present")

Inv4_RecoveryDistinguishable ==
    \A e \in Entries :
        /\ (auditState[e] = "clean")     => ~surfaced[e]
        /\ (auditState[e] = "recovered") => surfaced[e]

Inv7_AuthPrecedence ==
    \A e \in Entries : (provState[e] = "present") => (intentState[e] = "present")

Safety ==
    /\ TypeOK
    /\ Inv7_AuthPrecedence
    /\ Inv4_SafetyBijection
    /\ Inv4_NoUnsurfacedOrphan
    /\ Inv4_NoOrphanAudit
    /\ Inv4_RecoveryDistinguishable

====
