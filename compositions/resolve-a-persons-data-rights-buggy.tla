---- MODULE resolve-a-persons-data-rights-buggy ----
\* BUGGY TWIN (orphan-silence hazard; vacuity guard) for
\* resolve-a-persons-data-rights.tla.
\* Grace Commons — derived validator. The English spec is the source of truth.
\*
\* Updated 2026-08-27 alongside the correct model, when Invariant 1 was restated
\* from one atomic commit to safety plus liveness (methodology debt #19, the
\* atomicity class). A twin has to break the invariant as it is NOW stated, or it
\* guards a claim the corpus no longer makes.
\*
\* BUG: the disclosure and the event are split into interleavable steps with NO
\* surfacing and NO compensation — the shape the restated Invariant 1 forbids.
\* The orphan is reachable here, but so is it in the CORRECT model, deliberately;
\* the difference is that here it is SILENT and terminal. Nothing sets surfaced,
\* nothing retries the audit write, and the state is a dead end. That is what the
\* restatement turns on — not whether a partial exists, but whether anyone is
\* looking at it and whether it resolves.
\*
\* Breaks Inv1_NoUnsurfacedOrphan and, with it, the umbrella Inv1_BindingBijection
\* (which is that facet conjoined with Inv1_NoOrphanEvent — see the correct
\* model's comment on the umbrella). Of the CFG-LISTED invariants it breaks
\* exactly one, Inv1_BindingBijection, and it leaves Inv2_NoSilentOmission intact:
\* every disposition is set before the disclosure lands. That is what keeps this
\* twin dedicated to the orphan-silence claim rather than to coverage.

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

\* The disclosure lands, and nothing surfaces it and nothing compensates it.
WriteSD ==
    /\ sdState = "absent"
    /\ disp'    = [r \in Records |-> "set"]
    /\ sdState' = "present"
    /\ UNCHANGED <<auditState, surfaced>>

WriteAudit ==
    /\ sdState = "present"
    /\ auditState = "absent"
    /\ auditState' = "clean"
    /\ UNCHANGED <<disp, sdState, surfaced>>

Next == WriteSD \/ WriteAudit
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
