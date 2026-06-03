---- MODULE party-identity ----
\* Grace Commons — Party Identity atom.
\* Spec-level formal sibling of atoms/compliance/party-identity.md.
\* Derived validator; the English spec is the single source of truth. If this
\* model and the English disagree, diagnose per PRESSURE_TESTING.md §The conflict
\* protocol before changing either.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim of the atom is Invariant 4: a party in Verified state
\* has at least one `passed` verification recorded AFTER the most recent suspend,
\* in INSERTION ORDER (or, if never suspended, since enroll). This is an
\* ordering-across-action-sequences property — exactly the class three-pass
\* English review cannot exhaust but TLC checks under every interleaving.
\*
\* MODELING CHOICES
\* - One party. Invariant 4 is an intra-party ordering property; concurrency
\*   ACROSS parties does not bear on it, so a single party exercises the claim
\*   while keeping the state space finite.
\* - The party's event stream (verification events + state-change suspends, etc.)
\*   is modeled as an insertion-ordered log: a function 1..MaxEvents -> Event,
\*   with `len` filled slots. The Sequences module is avoided deliberately — the
\*   repo's WASM checker (tla-checker) handles Naturals/FiniteSets/functions; the
\*   existing composition models use the same restraint.
\* - Invariant 4 is DERIVED from the log (HasPassedAfterSuspend below), not
\*   tracked as a flag updated by the same rule as the reinstate guard. That
\*   keeps the check honest: the invariant is evaluated against the actual
\*   insertion-ordered history, so the buggy twin genuinely produces a violating
\*   log rather than a flag that was never set.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - Field-format validation (invalid-request) and storage-failure rejections —
\*   these are pre-write guards, not ordering claims.
\* - Atomicity of multi-record writes (Invariant 11) — a within-action property,
\*   not an interleaving-of-actions property.
\* - Multiple parties and id uniqueness (Invariants 9, 10) — structural, not
\*   ordering; Alloy's bounded-structural surface is the right tool, not TLC.

EXTENDS Naturals, FiniteSets

CONSTANT MaxEvents          \* bound on the event-log length (keeps TLC finite)

\* Event alphabet recorded in the insertion-ordered log:
\*   vp = verify(passed)   vf = verify(failed)
\*   sus = suspend         rei = reinstate        cls = close
\* "e" marks an unfilled log slot.
Event == {"vp", "vf", "sus", "rei", "cls"}
States == {"Unverified", "Verified", "Suspended", "Closed"}

VARIABLES
    pstate,                 \* current party state
    log,                    \* 1..MaxEvents -> Event \cup {"e"} ; insertion order
    len,                    \* number of filled log slots
    everClosed              \* history flag: has close ever fired (for Inv 3)

vars == <<pstate, log, len, everClosed>>

\* A `passed` verification with no suspend after it == a passed verification
\* after the MOST RECENT suspend, in insertion order. Derived from the log.
HasPassedAfterSuspend(lg, n) ==
    \E i \in 1..n :
        /\ lg[i] = "vp"
        /\ \A j \in 1..n : (j > i) => (lg[j] # "sus")

TypeOK ==
    /\ pstate \in States
    /\ len \in 0..MaxEvents
    /\ log \in [1..MaxEvents -> (Event \cup {"e"})]
    /\ everClosed \in BOOLEAN

Init ==
    /\ pstate = "Unverified"            \* enroll: party starts Unverified
    /\ log = [i \in 1..MaxEvents |-> "e"]
    /\ len = 0
    /\ everClosed = FALSE

\* --- actions (each appends exactly one event in insertion order) ---

VerifyPassed ==
    /\ pstate # "Closed"
    /\ len < MaxEvents
    /\ log' = [log EXCEPT ![len + 1] = "vp"]
    /\ len' = len + 1
    /\ pstate' = IF pstate = "Unverified" THEN "Verified" ELSE pstate
    /\ UNCHANGED everClosed

VerifyFailed ==
    /\ pstate # "Closed"
    /\ len < MaxEvents
    /\ log' = [log EXCEPT ![len + 1] = "vf"]
    /\ len' = len + 1
    /\ UNCHANGED <<pstate, everClosed>>

Suspend ==
    /\ pstate = "Verified"
    /\ len < MaxEvents
    /\ log' = [log EXCEPT ![len + 1] = "sus"]
    /\ len' = len + 1
    /\ pstate' = "Suspended"
    /\ UNCHANGED everClosed

\* CORRECT reinstate: guarded on a passed verification after the most recent
\* suspend. This is the atom's direct enforcement of Invariant 4.
Reinstate ==
    /\ pstate = "Suspended"
    /\ HasPassedAfterSuspend(log, len)
    /\ len < MaxEvents
    /\ log' = [log EXCEPT ![len + 1] = "rei"]
    /\ len' = len + 1
    /\ pstate' = "Verified"
    /\ UNCHANGED everClosed

Close ==
    /\ pstate # "Closed"
    /\ len < MaxEvents
    /\ log' = [log EXCEPT ![len + 1] = "cls"]
    /\ len' = len + 1
    /\ pstate' = "Closed"
    /\ everClosed' = TRUE

Next ==
    \/ VerifyPassed
    \/ VerifyFailed
    \/ Suspend
    \/ Reinstate
    \/ Close

Spec == Init /\ [][Next]_vars

\* --- safety invariants (the verification surface) ---

\* Invariant 2 — state membership exclusivity.
Inv2_StateExclusivity == pstate \in States

\* Invariant 3 — Closed is absorbing (history-flag form).
Inv3_ClosedAbsorbing == everClosed => (pstate = "Closed")

\* Invariant 4 — Verified requires a passed verification after the most recent
\* suspend, in insertion order. THE load-bearing claim.
Inv4_PassedAfterSuspend ==
    (pstate = "Verified") => HasPassedAfterSuspend(log, len)

Safety == TypeOK /\ Inv2_StateExclusivity /\ Inv3_ClosedAbsorbing /\ Inv4_PassedAfterSuspend

====
