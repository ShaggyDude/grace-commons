---- MODULE authenticated-actor ----
\* Grace Commons — Authenticated Actor (C17). Credential + Actor Identity.
\* Spec-level formal sibling of compositions/authenticated-actor.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The composition's load-bearing emergent guarantee is Invariant 1 (revocation
\* cascade / attest-surface closure): no attestation is produced by attest_as_actor
\* for a bound principal whose gating credential is non-Active at the time the
\* attestation is written. The cascade is FORWARD-CLOSING — it constrains new
\* attestations, never the validity of attestations already made.
\*
\* Per principal p:
\*   credStatus[p]      : "Active" | "Revoked"   (the gating credential's status)
\*   attested[p]        : FALSE | TRUE           (the composition produced an attestation)
\* Global:
\*   signedAfterRevoke  : FALSE | TRUE   (set TRUE iff an attest ever COMMITS while
\*                                        the credential is non-Active — derived from
\*                                        the actual observed status at commit time,
\*                                        not tracked independently; this avoids the
\*                                        begged-question pitfall)
\*
\* This CORRECT model performs the status-check and the attest commit as a SINGLE
\* ATOMIC action (the serialized check-and-attest critical section of Action wiring
\* step 3): AttestAtomic is guarded on credStatus[p] = "Active" and computes
\* signedAfterRevoke from the observed status in the same step, so the guard forces
\* the observed status Active and signedAfterRevoke can never become TRUE. The buggy
\* twin splits the gate into CheckGate then CommitAttest with a Revoke able to
\* interleave between them (the TOCTOU hazard) and TLC finds the violating history.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - secret-surface separation (Invariant 2) — structural / deployment-obligation,
\*   no temporal dimension.
\* - namespace binding bijection (Invariant 3) — relational/structural (Alloy-class).
\* - attest-log completeness / traceability (Invariant 4) — single-write-path
\*   records-shape property.
\* - constituent invariants (Invariant 5) — each checked in its own model
\*   (credential.tla; actor-identity is English-only), not re-proven here.

CONSTANT Principals             \* finite set of bound principals

VARIABLES credStatus, attested, signedAfterRevoke
vars == <<credStatus, attested, signedAfterRevoke>>

TypeOK ==
    /\ credStatus       \in [Principals -> {"Active", "Revoked"}]
    /\ attested         \in [Principals -> BOOLEAN]
    /\ signedAfterRevoke \in BOOLEAN

\* Every bound principal begins with an Active credential, no attestation yet.
Init ==
    /\ credStatus       = [p \in Principals |-> "Active"]
    /\ attested         = [p \in Principals |-> FALSE]
    /\ signedAfterRevoke = FALSE

\* CORRECT attest: the gate read (credStatus = Active) and the attestation commit
\* are one atomic action. signedAfterRevoke is computed from the observed status;
\* the guard makes the non-Active branch unreachable, so it stays FALSE.
AttestAtomic(p) ==
    /\ credStatus[p] = "Active"
    /\ attested[p] = FALSE
    /\ attested' = [attested EXCEPT ![p] = TRUE]
    /\ signedAfterRevoke' = IF credStatus[p] # "Active" THEN TRUE ELSE signedAfterRevoke
    /\ UNCHANGED credStatus

\* Credential revocation (performed elsewhere; the composition does not call it).
Revoke(p) ==
    /\ credStatus[p] = "Active"
    /\ credStatus' = [credStatus EXCEPT ![p] = "Revoked"]
    /\ UNCHANGED <<attested, signedAfterRevoke>>

Next == \E p \in Principals : AttestAtomic(p) \/ Revoke(p)
Spec == Init /\ [][Next]_vars

\* --- composition-level safety invariant ---
\* Invariant 1 — revocation cascade / attest-surface closure: no attestation is
\* ever committed while the gating credential is non-Active.
Inv1_NoSignAfterRevoke == signedAfterRevoke = FALSE

Safety == TypeOK /\ Inv1_NoSignAfterRevoke

====
