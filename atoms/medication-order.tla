---- MODULE medication-order ----
\* Grace Commons — Medication Order atom.
\* Spec-level formal sibling of atoms/medication-order.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is Invariant 5 (hold carries prior_state; reinstate
\* returns to EXACTLY it — the target is not a parameter, so deviation is
\* structurally impossible) together with Invariant 9 (an On Hold order accepts
\* only reinstate). The model exercises the lifecycle and checks the hold/
\* reinstate round-trip: after a reinstate the order is back in the state it was
\* held from, for every holdable state.
\*
\* MODELING CHOICES
\* - The main lifecycle states (Ordered, Verified, Dispensed, Administered,
\*   Completed, Cancelled, Discontinued, OnHold). `prior` is On Hold's stored
\*   prior_state; the ghost `heldFrom` records the state at the most recent hold
\*   and `justReinstated` flags the step right after a reinstate, so the round-
\*   trip is a falsifiable state predicate rather than a tautology.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - amend / successor-predecessor chains (Invariants 3,4 — structural, linear
\*   amendment is the Alloy-class property, not this ordering claim).
\* - field validation, storage-failure, id discipline.

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

\* --- forward lifecycle (each clears justReinstated, leaves prior/heldFrom) ---
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

\* hold: record current state as prior_state (and ghost heldFrom).
Hold ==
    /\ state \in Holdable
    /\ state' = "OnHold"
    /\ prior' = state
    /\ heldFrom' = state
    /\ justReinstated' = FALSE

\* CORRECT reinstate: return to the stored prior_state, not a parameter.
Reinstate ==
    /\ state = "OnHold"
    /\ state' = prior
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

\* Invariant 5 (round-trip) — after a reinstate, the order is back in exactly
\* the state it was held from. THE load-bearing claim.
Inv5_ReinstateRoundTrip == justReinstated => (state = heldFrom)

\* Invariant 5 (well-formedness) — On Hold always carries a valid holdable prior.
Inv5_PriorValid == (state = "OnHold") => (prior \in Holdable)

Safety == TypeOK /\ Inv5_ReinstateRoundTrip /\ Inv5_PriorValid

\* NOTE Invariant 9 (On Hold accepts only reinstate) is enforced by construction:
\* every forward action guards on a non-OnHold source state, so from OnHold only
\* Reinstate is enabled.

====
