---- MODULE resolve-a-persons-data-rights-buggy ----
\* BUGGY TWIN (binding hazard; vacuity guard) for resolve-a-persons-data-rights.tla.
\*
\* The fulfillment commit is split into three separate, interleavable sub-steps
\* with NO compensation — the naive non-atomic implementation the *Cross-store
\* consistency under partial failure* edge case and Invariant 1 warn against. The
\* Selective Disclosure response-disclosure writes first, then the dsar.*_fulfilled
\* event, then the request_to_fulfillment binding:
\*   WriteSD    -> response-disclosure lands (dispositions land with it here)
\*   WriteAudit -> dsar.*_fulfilled event lands
\*   Bind       -> request_to_fulfillment binding lands
\* Because they are distinct actions, TLC stops after WriteSD alone: sdState =
\* present, auditState = absent, bound = FALSE — a dangling response-disclosure
\* with no sealed fulfillment event (the exact orphan the partial-failure edge
\* case describes). Inv1_BindingBijection and Inv1_NoDanglingFulfillment both fail.
\* The checker rejects the twin. If it reports all invariants hold, the harness is
\* vacuous.

CONSTANT Records

VARIABLES disp, sdState, auditState, bound
vars == <<disp, sdState, auditState, bound>>

TypeOK ==
    /\ disp       \in [Records -> {"none", "set"}]
    /\ sdState    \in {"absent", "present"}
    /\ auditState \in {"absent", "present"}
    /\ bound      \in BOOLEAN

Init ==
    /\ disp       = [r \in Records |-> "none"]
    /\ sdState    = "absent"
    /\ auditState = "absent"
    /\ bound      = FALSE

\* BUG: three separate sub-steps, interleavable, no compensation. Dispositions
\* land atomically with the SD write (coverage is not the focus of this twin), but
\* the disclosure / event / binding are split, so a dangling partial is reachable.
WriteSD ==
    /\ sdState = "absent"
    /\ disp'    = [r \in Records |-> "set"]
    /\ sdState' = "present"
    /\ UNCHANGED <<auditState, bound>>

WriteAudit ==
    /\ sdState = "present"
    /\ auditState = "absent"
    /\ auditState' = "present"
    /\ UNCHANGED <<disp, sdState, bound>>

Bind ==
    /\ sdState = "present"
    /\ auditState = "present"
    /\ ~bound
    /\ bound' = TRUE
    /\ UNCHANGED <<disp, sdState, auditState>>

Next == WriteSD \/ WriteAudit \/ Bind
Spec == Init /\ [][Next]_vars

Coherent ==
    \/ (sdState = "absent"  /\ auditState = "absent"  /\ bound = FALSE)
    \/ (sdState = "present" /\ auditState = "present" /\ bound = TRUE)

Inv1_BindingBijection == Coherent
Inv1_NoDanglingFulfillment ==
    (sdState = "present") => (auditState = "present" /\ bound)
Inv1_NoOrphanEvent ==
    (auditState = "present") => (sdState = "present")
Inv2_NoSilentOmission ==
    bound => (\A r \in Records : disp[r] = "set")

Safety ==
    /\ TypeOK
    /\ Inv1_BindingBijection
    /\ Inv1_NoDanglingFulfillment
    /\ Inv1_NoOrphanEvent
    /\ Inv2_NoSilentOmission

====
