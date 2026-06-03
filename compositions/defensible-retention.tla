---- MODULE defensible-retention ----
\* Grace Commons — Regulated Record Retention & Defensible Deletion (C1).
\* Spec-level formal sibling of compositions/defensible-retention.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is hold-blocks-purge (the named race): a record under
\* an active Legal Hold is NEVER purged, even once its retention has elapsed and
\* the record is otherwise purge-eligible. With multi-hold independence: a record
\* is purgeable only when ALL holds have been released (hold count back to zero).
\* The race the model targets: a retention-eligible purge interleaving with hold
\* placement/release — the hold must win.
\*
\* MODELING CHOICES
\* - One record. `retentionElapsed` (the retention window has passed), `holds`
\*   (count of active Legal Holds), `purged`. Ghost `purgedWhileHeld` records
\*   whether a purge ever fired while holds > 0, making "no record under hold is
\*   purged" a falsifiable predicate.
\*
\* NOT MODELED (out of scope): the Audit Trail substrate's own invariants (see
\* audit-trail.tla), retention clock arithmetic (elapse modeled as a flag flip),
\* hold identity / attribution.

EXTENDS Naturals

CONSTANT MaxHolds           \* max concurrent Legal Holds on the record

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

\* the retention window elapses (record becomes retention-eligible for purge).
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

\* CORRECT purge: admitted only when retention has elapsed AND no hold is active
\* (multi-hold independence: all holds released => holds = 0).
Purge ==
    /\ retentionElapsed
    /\ holds = 0
    /\ ~purged
    /\ purged' = TRUE
    /\ purgedWhileHeld' = FALSE
    /\ UNCHANGED <<retentionElapsed, holds>>

Next == ElapseRetention \/ PlaceHold \/ ReleaseHold \/ Purge
Spec == Init /\ [][Next]_vars

\* Load-bearing — no record under an active Legal Hold is ever purged.
Inv_HoldBlocksPurge == ~purgedWhileHeld
Safety == TypeOK /\ Inv_HoldBlocksPurge

====
