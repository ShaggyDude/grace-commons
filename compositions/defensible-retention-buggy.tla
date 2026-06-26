---- MODULE defensible-retention-buggy ----
\* Grace Commons — Defensible Retention: BUGGY TWIN (vacuity guard).
\*
\* Identical to defensible-retention.tla EXCEPT `Purge` drops the `holds = 0`
\* guard — modeling a purge that consults retention eligibility but NOT the Legal
\* Hold state, the hold-blocks-purge violation. (It also records purgedWhileHeld
\* = holds > 0 so the violation is detectable.)
\*
\* Expected result: Inv_HoldBlocksPurge VIOLATED. PlaceHold, ElapseRetention,
\* Purge -> purged while holds = 1, so purgedWhileHeld = TRUE. If the checker
\* reports all invariants hold here, the harness is vacuous: purging under an
\* active hold would be safe, which is exactly what hold-blocks-purge denies.

EXTENDS Naturals

CONSTANT MaxHolds

VARIABLES retentionElapsed, holds, purged, purgedWhileHeld
vars == <<retentionElapsed, holds, purged, purgedWhileHeld>>

TypeOK ==
    /\ retentionElapsed \in BOOLEAN
    /\ holds \in 0..MaxHolds
    /\ purged \in BOOLEAN
    /\ purgedWhileHeld \in BOOLEAN

Init ==
    /\ retentionElapsed = FALSE
    /\ holds = 0
    /\ purged = FALSE
    /\ purgedWhileHeld = FALSE

ElapseRetention ==
    /\ ~retentionElapsed
    /\ retentionElapsed' = TRUE
    /\ UNCHANGED <<holds, purged, purgedWhileHeld>>

PlaceHold ==
    /\ ~purged
    /\ holds < MaxHolds
    /\ holds' = holds + 1
    /\ UNCHANGED <<retentionElapsed, purged, purgedWhileHeld>>

ReleaseHold ==
    /\ holds > 0
    /\ holds' = holds - 1
    /\ UNCHANGED <<retentionElapsed, purged, purgedWhileHeld>>

\* BUG: no `holds = 0` guard — purge ignores active Legal Holds.
Purge ==
    /\ retentionElapsed
    /\ ~purged
    /\ purged' = TRUE
    /\ purgedWhileHeld' = (holds > 0)
    /\ UNCHANGED <<retentionElapsed, holds>>

Next == ElapseRetention \/ PlaceHold \/ ReleaseHold \/ Purge
Spec == Init /\ [][Next]_vars

Inv_HoldBlocksPurge == ~purgedWhileHeld
Safety == TypeOK /\ Inv_HoldBlocksPurge

====
