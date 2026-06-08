---- MODULE party-identity-buggy ----
\* Grace Commons — Party Identity atom: BUGGY TWIN (vacuity guard).
\*
\* This is a deliberately-wrong variant the checker MUST reject. It is identical
\* to party-identity.tla EXCEPT that Reinstate drops the
\* HasPassedAfterSuspend(log, len) guard — i.e. it models the F3 defect the
\* English spec's Phase-4 gate closed: `reinstate` that does not require a passed
\* verification recorded after the most recent suspend.
\*
\* Expected result: Invariant 4 (Inv4_PassedAfterSuspend) is VIOLATED by the
\* reachable sequence  VerifyPassed -> Suspend -> Reinstate :
\*   log = <<"vp","sus","rei">>, pstate = "Verified", but the most recent
\*   suspend (index 2) has no "vp" after it. If the checker reports all
\*   invariants hold here, the harness is vacuous and the correct model proves
\*   nothing.

EXTENDS Naturals, FiniteSets

CONSTANT MaxEvents

Event == {"vp", "vf", "sus", "rei", "cls"}
States == {"Unverified", "Verified", "Suspended", "Closed"}

VARIABLES pstate, log, len, everClosed
vars == <<pstate, log, len, everClosed>>

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
    /\ pstate = "Unverified"
    /\ log = [i \in 1..MaxEvents |-> "e"]
    /\ len = 0
    /\ everClosed = FALSE

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

\* BUG: no HasPassedAfterSuspend guard — reinstate succeeds with no passed
\* verification after the most recent suspend.
Reinstate ==
    /\ pstate = "Suspended"
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

Next == VerifyPassed \/ VerifyFailed \/ Suspend \/ Reinstate \/ Close
Spec == Init /\ [][Next]_vars

Inv2_StateExclusivity == pstate \in States
Inv3_ClosedAbsorbing == everClosed => (pstate = "Closed")
Inv4_PassedAfterSuspend == (pstate = "Verified") => HasPassedAfterSuspend(log, len)
Inv6_AppendOnlyPrefix == \A i \in 1..MaxEvents : (i <= len) <=> (log[i] # "e")
Safety == TypeOK /\ Inv2_StateExclusivity /\ Inv3_ClosedAbsorbing
              /\ Inv4_PassedAfterSuspend /\ Inv6_AppendOnlyPrefix

====
