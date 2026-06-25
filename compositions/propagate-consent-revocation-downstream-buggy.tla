---- MODULE consent-preference-management-buggy ----
\* BUGGY TWIN (vacuity guard) for consent-preference-management.tla.
\*
\* The withdraw_consent commit is split into three separate, interleavable
\* sub-steps with NO compensation — the naive non-atomic implementation the
\* *Cross-store consistency under partial failure* edge case and Invariant 3
\* warn against:
\*   Revoke        -> Consent.revoke commits
\*   Propagate     -> consent.revoked event recorded
\*   CompleteScopes -> affected_scopes enumeration recorded
\* Because they are distinct actions, TLC stops after Revoke(c) alone:
\* revoked[c] = TRUE, propagated[c] = FALSE, scopesComplete[c] = FALSE — a
\* revoked consent whose withdrawal was never propagated (a downstream processor
\* that should stop has no record telling it to). Inv3_BindingBijection and
\* Inv_NoDanglingRevoke both fail. The checker rejects the twin.
\* If the checker reports all invariants hold here, the harness is vacuous.

CONSTANT Consents

VARIABLES revoked, propagated, scopesComplete
vars == <<revoked, propagated, scopesComplete>>

TypeOK ==
    /\ revoked        \in [Consents -> BOOLEAN]
    /\ propagated     \in [Consents -> BOOLEAN]
    /\ scopesComplete \in [Consents -> BOOLEAN]

Init ==
    /\ revoked        = [c \in Consents |-> FALSE]
    /\ propagated     = [c \in Consents |-> FALSE]
    /\ scopesComplete = [c \in Consents |-> FALSE]

\* BUG: three separate sub-steps, interleavable, no compensation.
Revoke(c) ==
    /\ revoked[c] = FALSE
    /\ revoked' = [revoked EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<propagated, scopesComplete>>

Propagate(c) ==
    /\ revoked[c] = TRUE
    /\ propagated[c] = FALSE
    /\ propagated' = [propagated EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<revoked, scopesComplete>>

CompleteScopes(c) ==
    /\ propagated[c] = TRUE
    /\ ~scopesComplete[c]
    /\ scopesComplete' = [scopesComplete EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<revoked, propagated>>

Next == \E c \in Consents : Revoke(c) \/ Propagate(c) \/ CompleteScopes(c)
Spec == Init /\ [][Next]_vars

Coherent(c) ==
    \/ (revoked[c] = FALSE /\ propagated[c] = FALSE /\ scopesComplete[c] = FALSE)
    \/ (revoked[c] = TRUE  /\ propagated[c] = TRUE  /\ scopesComplete[c] = TRUE)

Inv3_BindingBijection == \A c \in Consents : Coherent(c)
Inv_NoDanglingRevoke ==
    \A c \in Consents : (revoked[c] = TRUE) => (propagated[c] = TRUE /\ scopesComplete[c] = TRUE)
Inv_NoOrphanPropagation ==
    \A c \in Consents : (propagated[c] = TRUE) => (revoked[c] = TRUE)

Safety == TypeOK /\ Inv3_BindingBijection /\ Inv_NoDanglingRevoke /\ Inv_NoOrphanPropagation

====
