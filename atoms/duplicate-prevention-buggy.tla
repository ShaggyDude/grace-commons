---- MODULE duplicate-prevention-buggy ----
\* Grace Commons — Duplicate Prevention atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to duplicate-prevention.tla EXCEPT it adds RecordExtendBug: a
\* `record` of an already-seen identity that PUSHES recorded_at forward to the
\* current clock — the window extension Invariant 2 (single-recording) forbids
\* ("record does not extend the window for an already-recorded identity; the
\* original recorded_at is preserved").
\*
\* Expected result: Inv2_SingleRecording VIOLATED. RecordFresh at clock 0, Tick to
\* clock 1 (still seen, 1 - 0 < 2), RecordExtendBug -> recordedAt = 1 while
\* firstRecordedAt = 0, and the identity is still Seen. If the checker reports all
\* invariants hold here, the harness is vacuous.

EXTENDS Naturals

CONSTANTS Window, MaxClock

VARIABLES clock, everRecorded, recordedAt, firstRecordedAt
vars == <<clock, everRecorded, recordedAt, firstRecordedAt>>

Seen == everRecorded /\ (clock - recordedAt < Window)

TypeOK ==
    /\ clock \in 0..MaxClock
    /\ everRecorded \in BOOLEAN
    /\ recordedAt \in 0..MaxClock
    /\ firstRecordedAt \in 0..MaxClock

Init ==
    /\ clock = 0
    /\ everRecorded = FALSE
    /\ recordedAt = 0
    /\ firstRecordedAt = 0

Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<everRecorded, recordedAt, firstRecordedAt>>

RecordFresh ==
    /\ ~Seen
    /\ everRecorded' = TRUE
    /\ recordedAt' = clock
    /\ firstRecordedAt' = clock
    /\ UNCHANGED clock

\* BUG: re-record while seen pushes recorded_at forward (extends the window).
RecordExtendBug ==
    /\ Seen
    /\ recordedAt' = clock
    /\ UNCHANGED <<clock, everRecorded, firstRecordedAt>>

Next == Tick \/ RecordFresh \/ RecordExtendBug
Spec == Init /\ [][Next]_vars

Inv2_SingleRecording == Seen => (recordedAt = firstRecordedAt)
Safety == TypeOK /\ Inv2_SingleRecording

====
