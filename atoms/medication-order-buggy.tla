---- MODULE medication-order-buggy ----
\* Grace Commons — Medication Order atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to medication-order.tla EXCEPT `reinstate` returns to a FIXED state
\* ("Ordered") instead of the stored prior_state — modeling an implementation
\* that treats the reinstate target as a default rather than reading prior_state.
\* This violates Invariant 5 (reinstate returns to EXACTLY prior_state).
\*
\* Expected result: Inv5_ReinstateRoundTrip VIOLATED. Hold from Dispensed, then
\* reinstate: heldFrom = "Dispensed" but state lands in "Ordered". If the checker
\* reports all invariants hold here, the harness is vacuous: reinstate-to-default
\* would be safe, which is exactly what Invariant 5 denies.

VARIABLES state, prior, heldFrom, justReinstated
vars == <<state, prior, heldFrom, justReinstated>>

States == {"Ordered", "Verified", "Dispensed", "Administered",
           "Completed", "Cancelled", "Discontinued", "OnHold"}
Holdable == {"Ordered", "Verified", "Dispensed", "Administered"}

TypeOK ==
    /\ state \in States
    /\ prior \in (Holdable \cup {"none"})
    /\ heldFrom \in (Holdable \cup {"none"})
    /\ justReinstated \in BOOLEAN

Init ==
    /\ state = "Ordered"
    /\ prior = "none"
    /\ heldFrom = "none"
    /\ justReinstated = FALSE

Verify ==
    /\ state = "Ordered" /\ state' = "Verified"
    /\ justReinstated' = FALSE /\ UNCHANGED <<prior, heldFrom>>
Dispense ==
    /\ state = "Verified" /\ state' = "Dispensed"
    /\ justReinstated' = FALSE /\ UNCHANGED <<prior, heldFrom>>
Administer ==
    /\ state = "Dispensed" /\ state' = "Administered"
    /\ justReinstated' = FALSE /\ UNCHANGED <<prior, heldFrom>>
Complete ==
    /\ state = "Administered" /\ state' = "Completed"
    /\ justReinstated' = FALSE /\ UNCHANGED <<prior, heldFrom>>
Cancel ==
    /\ state \in {"Ordered", "Verified"} /\ state' = "Cancelled"
    /\ justReinstated' = FALSE /\ UNCHANGED <<prior, heldFrom>>
Discontinue ==
    /\ state \in {"Dispensed", "Administered"} /\ state' = "Discontinued"
    /\ justReinstated' = FALSE /\ UNCHANGED <<prior, heldFrom>>

Hold ==
    /\ state \in Holdable
    /\ state' = "OnHold"
    /\ prior' = state
    /\ heldFrom' = state
    /\ justReinstated' = FALSE

\* BUG: reinstate to a fixed default, ignoring prior_state.
Reinstate ==
    /\ state = "OnHold"
    /\ state' = "Ordered"
    /\ prior' = "none"
    /\ heldFrom' = heldFrom
    /\ justReinstated' = TRUE

Next ==
    \/ Verify
    \/ Dispense
    \/ Administer
    \/ Complete
    \/ Cancel
    \/ Discontinue
    \/ Hold
    \/ Reinstate
Spec == Init /\ [][Next]_vars

Inv5_ReinstateRoundTrip == justReinstated => (state = heldFrom)
Inv5_PriorValid == (state = "OnHold") => (prior \in Holdable)
Safety == TypeOK /\ Inv5_ReinstateRoundTrip /\ Inv5_PriorValid

====
