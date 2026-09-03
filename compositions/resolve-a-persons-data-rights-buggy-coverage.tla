---- MODULE resolve-a-persons-data-rights-buggy-coverage ----
\* BUGGY TWIN (no-silent-omission / coverage hazard; vacuity guard) for
\* resolve-a-persons-data-rights.tla.
\* Grace Commons — derived validator. The English spec is the source of truth.
\*
\* Updated 2026-08-27 alongside the correct model, when Invariant 1 was restated
\* from one atomic commit to safety plus liveness (methodology debt #19, the
\* atomicity class) and Inv2_NoSilentOmission was re-keyed from the derived index
\* onto the sealed event. This twin's bug is unchanged in substance and its
\* precondition is re-keyed to match.
\*
\* BUG: the fulfillment binds with NO full-coverage precondition, so it can seal
\* the event while some in-scope record is still undispositioned. Breaks
\* Inv2_NoSilentOmission only — the disclosure and the event stay coherent with
\* each other and nothing is orphaned, which is what keeps this twin dedicated to
\* the coverage claim.

CONSTANT Records

VARIABLES disp, sdState, auditState, surfaced
vars == <<disp, sdState, auditState, surfaced>>

TypeOK ==
    /\ disp       \in [Records -> {"none", "set"}]
    /\ sdState    \in {"absent", "present"}
    /\ auditState \in {"absent", "clean", "recovered"}
    /\ surfaced   \in BOOLEAN

Init ==
    /\ disp       = [r \in Records |-> "none"]
    /\ sdState    = "absent"
    /\ auditState = "absent"
    /\ surfaced   = FALSE

DisposeRecord(r) ==
    /\ disp[r] = "none"
    /\ disp' = [disp EXCEPT ![r] = "set"]
    /\ UNCHANGED <<sdState, auditState, surfaced>>

\* BUG: no full-coverage precondition on the commit.
CommitBinding ==
    /\ sdState = "absent"
    /\ sdState'    = "present"
    /\ auditState' = "clean"
    /\ UNCHANGED <<disp, surfaced>>

Next == (\E r \in Records : DisposeRecord(r)) \/ CommitBinding
Spec == Init /\ [][Next]_vars

Coherent ==
    \/ (sdState = "absent"  /\ auditState = "absent" /\ ~surfaced)
    \/ (sdState = "present" /\ auditState \in {"clean", "recovered"})

Orphan == sdState = "present" /\ auditState = "absent"

Inv1_BindingBijection == Coherent \/ (Orphan /\ surfaced)
Inv1_NoUnsurfacedOrphan == Orphan => surfaced
Inv1_NoOrphanEvent ==
    (auditState \in {"clean", "recovered"}) => (sdState = "present")
Inv1_RecoveryDistinguishable ==
    /\ (auditState = "clean")     => ~surfaced
    /\ (auditState = "recovered") => surfaced
Inv2_NoSilentOmission ==
    (auditState \in {"clean", "recovered"}) => (\A r \in Records : disp[r] = "set")

Safety ==
    /\ TypeOK
    /\ Inv1_BindingBijection
    /\ Inv1_NoUnsurfacedOrphan
    /\ Inv1_NoOrphanEvent
    /\ Inv1_RecoveryDistinguishable
    /\ Inv2_NoSilentOmission

====
