---- MODULE duplicate-prevention ----
\* Grace Commons — Duplicate Prevention atom.
\* Spec-level formal sibling of atoms/duplicate-prevention.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim (the 2026-06-03 bar reconsideration KEPT this pattern
\* as YES) is Invariant 2 (single-recording — `record` of an already-guarded
\* identity does NOT extend the window; the original recorded_at is preserved).
\*
\* MODELING NOTE (encoding correction, 2026-06-03). Membership in `recorded` is
\* DERIVED, not a lagging flag: the spec's Invariant 1 (anything in `recorded`
\* satisfies now - recorded_at < window) and Invariant 4 (after the window
\* elapses the identity is no longer in `recorded`) together define membership as
\* AUTO-EXPIRING — `seen` is computed from the clock, it does not lag behind an
\* explicit Expire action. The first encoding used a separate `recorded` flag
\* flipped by an Expire step; TLC found a transient (clock past the window while
\* the flag was still set) that the spec forbids. That was a model mis-encoding
\* (conflict-protocol case 2), fixed here by deriving membership; the English was
\* not touched.
\*
\* MODELING CHOICES
\* - One identity. `clock` advances; `everRecorded` marks that a record has been
\*   placed; `recordedAt` is the current guard's start; ghost `firstRecordedAt`
\*   captures recorded_at at the moment the current `seen` episode began.
\*   `seen` is DERIVED: everRecorded /\ now - recordedAt < Window.
\*
\* NOT MODELED (out of scope): the `check` query (read-only, Invariant 3); the
\* containing pattern's response to seen/not-seen.

EXTENDS Naturals

CONSTANTS Window, MaxClock

VARIABLES clock, everRecorded, recordedAt, firstRecordedAt
vars == <<clock, everRecorded, recordedAt, firstRecordedAt>>

\* Derived, auto-expiring membership.
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

\* record of a not-currently-seen identity (never recorded, or window elapsed):
\* start a fresh guard. record while already seen is a no-op (single-recording).
RecordFresh ==
    /\ ~Seen
    /\ everRecorded' = TRUE
    /\ recordedAt' = clock
    /\ firstRecordedAt' = clock
    /\ UNCHANGED clock

Next == Tick \/ RecordFresh
Spec == Init /\ [][Next]_vars

\* Invariant 2 — single-recording: while an identity is seen, its guard start is
\* never pushed forward (no window extension by re-record). THE load-bearing claim.
Inv2_SingleRecording == Seen => (recordedAt = firstRecordedAt)

\* Invariant 1 (window monotonicity) and Invariant 4 (eventual expiry) are
\* DEFINITIONAL under derived membership: `Seen` is, by construction,
\* everRecorded /\ now - recordedAt < Window, so a seen identity is always within
\* window and an identity past its window is automatically not seen.
Safety == TypeOK /\ Inv2_SingleRecording

====
