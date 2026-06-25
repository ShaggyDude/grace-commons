---- MODULE customer-onboarding-buggy ----
\* Grace Commons — Customer Onboarding: BUGGY TWIN (vacuity guard).
\*
\* Identical to customer-onboarding.tla EXCEPT it adds SuspendWithoutTrigger:
\* a suspend that fires with no preceding adverse trigger. This breaks both
\* adverse-trigger-precedes-suspend (there is no trigger before the suspend) and
\* the biconditional open-trigger <=> Suspended (Suspended while openTriggers = 0).
\*
\* Expected result: Inv_OpenTriggerIffSuspended VIOLATED. From the initial state,
\* SuspendWithoutTrigger -> state = Suspended while openTriggers = 0, so
\* (0 > 0) = FALSE but (state = Suspended) = TRUE. If the checker reports all
\* invariants hold here, the harness is vacuous.

EXTENDS Naturals

CONSTANT MaxTriggers

VARIABLES state, openTriggers
vars == <<state, openTriggers>>

TypeOK ==
    /\ state \in {"Verified", "Suspended"}
    /\ openTriggers \in 0..MaxTriggers

Init ==
    /\ state = "Verified"
    /\ openTriggers = 0

RaiseTrigger ==
    /\ openTriggers < MaxTriggers
    /\ openTriggers' = openTriggers + 1
    /\ state' = "Suspended"

ResolveTrigger ==
    /\ openTriggers > 0
    /\ openTriggers' = openTriggers - 1
    /\ state' = IF openTriggers - 1 = 0 THEN "Verified" ELSE "Suspended"

\* BUG: suspend with no preceding adverse trigger.
SuspendWithoutTrigger ==
    /\ state = "Verified"
    /\ state' = "Suspended"
    /\ UNCHANGED openTriggers

Next == RaiseTrigger \/ ResolveTrigger \/ SuspendWithoutTrigger
Spec == Init /\ [][Next]_vars

Inv_OpenTriggerIffSuspended == (openTriggers > 0) = (state = "Suspended")
Safety == TypeOK /\ Inv_OpenTriggerIffSuspended

====
