---- MODULE data-subject-rights-fulfillment-buggy-coverage ----
\* BUGGY TWIN (no-silent-omission / coverage hazard; vacuity guard) for
\* data-subject-rights-fulfillment.tla.
\*
\* This twin keeps the BINDING atomic — the response-disclosure, the dsar.*_fulfilled
\* event, and the request_to_fulfillment binding still land together — so
\* Inv1_BindingBijection holds here. The bug is in COVERAGE: in-scope records are
\* disposed one at a time, and CommitBinding fires WITHOUT a full-coverage guard.
\* So a committed fulfillment with an undispositioned in-scope record is reachable —
\* the silent omission Invariant 2 forbids and that C6's binding-only model did not
\* need to check. From Init, CommitBinding alone yields bound = TRUE with every
\* disp[r] = "none": Inv2_NoSilentOmission fails. The checker rejects the twin.
\*
\* The two twins isolate the two load-bearing invariants: -buggy fails
\* Inv1 (binding), -buggy-coverage fails Inv2 (coverage). Together they prove the
\* CORRECT model's green is non-vacuous on BOTH guarantees.

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

\* Records disposed one at a time.
DisposeRecord(r) ==
    /\ disp[r] = "none"
    /\ disp' = [disp EXCEPT ![r] = "set"]
    /\ UNCHANGED <<sdState, auditState, bound>>

\* BUG: the binding commits atomically but with NO full-coverage precondition, so
\* it can fire while some in-scope record is still undispositioned.
CommitBinding ==
    /\ ~bound
    /\ sdState'    = "present"
    /\ auditState' = "present"
    /\ bound'      = TRUE
    /\ UNCHANGED disp

Next == (\E r \in Records : DisposeRecord(r)) \/ CommitBinding
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
