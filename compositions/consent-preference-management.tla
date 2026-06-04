---- MODULE consent-preference-management ----
\* Grace Commons — Consent & Preference Management with Revocation Propagation (C2).
\* Spec-level formal sibling of compositions/consent-preference-management.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per PRESSURE_TESTING.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The composition's load-bearing wiring decision is Invariant 3 (revocation-
\* propagation completeness / binding bijection): every withdraw_consent commits
\* the Consent revoke and the consent.revoked propagation event — whose
\* affected_scopes set is the COMPLETE registered downstream set — together or not
\* at all. No reachable state has a revoked consent without its complete
\* propagation record, and none has a propagation record without the revoke.
\*
\* Per consent, three sub-writes:
\*   revoked        : FALSE | TRUE   (Consent.revoke committed)
\*   propagated     : FALSE | TRUE   (consent.revoked Audit Trail event recorded)
\*   scopesComplete : FALSE | TRUE   (the event's affected_scopes = registered set)
\*
\* This CORRECT model performs the three sub-writes as a single atomic action
\* (the host-transaction-boundary form of Invariant 3). The buggy twin performs
\* them as separate, interleavable sub-steps with no compensation — the naive
\* implementation the *Cross-store consistency under partial failure* edge case
\* warns against — and TLC finds the dangling partial (a revoked consent with no
\* propagation event) that violates Invariant 3.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - the Consent grant/expire lifecycle (consent.md — voted English-only).
\* - the Permissions gate (a precondition, not an interleaving).
\* - processing_permitted (Invariant 1) — a query-shape property.
\* - the Audit Trail substrate internals (audit-trail.tla), Retention Window.

CONSTANT Consents               \* finite set of consents that get withdrawn

VARIABLES revoked, propagated, scopesComplete
vars == <<revoked, propagated, scopesComplete>>

TypeOK ==
    /\ revoked        \in [Consents -> BOOLEAN]
    /\ propagated     \in [Consents -> BOOLEAN]
    /\ scopesComplete \in [Consents -> BOOLEAN]

\* Every consent begins live: not revoked, not propagated, scopes not recorded.
Init ==
    /\ revoked        = [c \in Consents |-> FALSE]
    /\ propagated     = [c \in Consents |-> FALSE]
    /\ scopesComplete = [c \in Consents |-> FALSE]

\* CORRECT withdraw_consent: the Consent revoke, the consent.revoked propagation
\* event, and the complete affected_scopes enumeration all land together in one
\* atomic step (the host transaction boundary).
WithdrawConsent(c) ==
    /\ revoked[c] = FALSE
    /\ revoked'        = [revoked        EXCEPT ![c] = TRUE]
    /\ propagated'     = [propagated     EXCEPT ![c] = TRUE]
    /\ scopesComplete' = [scopesComplete EXCEPT ![c] = TRUE]

Next == \E c \in Consents : WithdrawConsent(c)
Spec == Init /\ [][Next]_vars

\* --- composition-level safety invariants ---

\* The two coherent configurations of the three sub-writes for a consent.
Coherent(c) ==
    \/ (revoked[c] = FALSE /\ propagated[c] = FALSE /\ scopesComplete[c] = FALSE)
    \/ (revoked[c] = TRUE  /\ propagated[c] = TRUE  /\ scopesComplete[c] = TRUE)

\* Invariant 3 — revocation-propagation completeness / binding bijection.
Inv3_BindingBijection == \A c \in Consents : Coherent(c)

\* No revoked consent without its complete propagation record.
Inv_NoDanglingRevoke ==
    \A c \in Consents : (revoked[c] = TRUE) => (propagated[c] = TRUE /\ scopesComplete[c] = TRUE)

\* No propagation record without the revoke.
Inv_NoOrphanPropagation ==
    \A c \in Consents : (propagated[c] = TRUE) => (revoked[c] = TRUE)

Safety == TypeOK /\ Inv3_BindingBijection /\ Inv_NoDanglingRevoke /\ Inv_NoOrphanPropagation

====
