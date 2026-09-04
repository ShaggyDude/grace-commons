---- MODULE propagate-consent-revocation-downstream-buggy ----
\* BUGGY TWIN (silence hazard; vacuity guard) for
\* propagate-consent-revocation-downstream.tla.
\* Grace Commons — derived validator. The English spec is the source of truth.
\*
\* Rewritten 2026-08-27 alongside the correct model, when Invariant 3 was restated
\* from one atomic commit to safety plus liveness (methodology debt #19, the
\* atomicity class). A twin has to break the invariant as it is NOW stated, or it
\* guards a claim the corpus no longer makes. The previous version of this twin
\* split the withdrawal into separate interleavable sub-steps; that split is no
\* longer a bug, because the repaired composition does exactly that on purpose —
\* it has to, since neither write is reversible. What IS a bug is doing it silently.
\*
\* BUG: the revoke commits and the propagation event does not, with NO surfacing
\* and NO compensation. The orphan is reachable here, but so it is in the CORRECT
\* model, deliberately; the difference is that here it is SILENT and terminal.
\* Nothing sets surfaced, nothing retries the append, and the state is a dead end.
\* That is what the restatement turns on — not whether a partial exists, but
\* whether anyone is looking at it and whether it resolves. This matters
\* particularly here: during the gap the SUPPRESSION is already correct, because
\* [Processing Permitted] reads the Consent store, so the only thing at risk is
\* the record of which downstream scopes should stop — which nothing but the
\* surfacing will ever reveal.
\*
\* Breaks Inv3_NoUnsurfacedOrphan and, with it, the umbrella Inv3_BindingBijection.
\* It leaves Inv3_NoOrphanPropagation intact — no propagation event ever precedes
\* its revoke — which is what keeps this twin dedicated to the silence claim.
\* There is deliberately no twin for the ordering claim here, and that absence is
\* itself a finding rather than an omission: see the correct model's comment on
\* Inv3_NoOrphanPropagation, and the analogous twin
\* capability-backed-sharing-buggy-old-wiring.tla, which is what a violation of
\* that claim looks like in a pattern whose wiring could actually produce one.

CONSTANT Consents

VARIABLES intentState, revoked, propagated, surfaced
vars == <<intentState, revoked, propagated, surfaced>>

TypeOK ==
    /\ intentState \in [Consents -> {"absent", "present"}]
    /\ revoked     \in [Consents -> BOOLEAN]
    /\ propagated  \in [Consents -> {"absent", "clean", "recovered"}]
    /\ surfaced    \in [Consents -> BOOLEAN]

Init ==
    /\ intentState = [c \in Consents |-> "absent"]
    /\ revoked     = [c \in Consents |-> FALSE]
    /\ propagated  = [c \in Consents |-> "absent"]
    /\ surfaced    = [c \in Consents |-> FALSE]

WriteIntent(c) ==
    /\ intentState[c] = "absent"
    /\ intentState' = [intentState EXCEPT ![c] = "present"]
    /\ UNCHANGED <<revoked, propagated, surfaced>>

\* The revoke commits, and nothing surfaces the missing propagation event.
Revoke(c) ==
    /\ intentState[c] = "present"
    /\ ~revoked[c]
    /\ revoked' = [revoked EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<intentState, propagated, surfaced>>

Propagate(c) ==
    /\ revoked[c]
    /\ propagated[c] = "absent"
    /\ propagated' = [propagated EXCEPT ![c] = "clean"]
    /\ UNCHANGED <<intentState, revoked, surfaced>>

Next == \E c \in Consents : WriteIntent(c) \/ Revoke(c) \/ Propagate(c)
Spec == Init /\ [][Next]_vars

Inv3_NoOrphanPropagation ==
    \A c \in Consents :
        (propagated[c] \in {"clean", "recovered"}) => revoked[c]
Inv3_NoUnsurfacedOrphan ==
    \A c \in Consents :
        (revoked[c] /\ propagated[c] = "absent") => surfaced[c]
Inv3_IntentPrecedesRevoke ==
    \A c \in Consents : revoked[c] => (intentState[c] = "present")
Inv3_RecoveryDistinguishable ==
    \A c \in Consents :
        /\ (propagated[c] = "clean")     => ~surfaced[c]
        /\ (propagated[c] = "recovered") => surfaced[c]
Coherent(c) ==
    \/ (~revoked[c] /\ propagated[c] = "absent")
    \/ (revoked[c]  /\ propagated[c] \in {"clean", "recovered"})
Orphan(c) == revoked[c] /\ propagated[c] = "absent"
Inv3_BindingBijection ==
    \A c \in Consents : Coherent(c) \/ (Orphan(c) /\ surfaced[c])

Safety ==
    /\ TypeOK
    /\ Inv3_NoOrphanPropagation
    /\ Inv3_NoUnsurfacedOrphan
    /\ Inv3_IntentPrecedesRevoke
    /\ Inv3_RecoveryDistinguishable
    /\ Inv3_BindingBijection

====
