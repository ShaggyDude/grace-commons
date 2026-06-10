---- MODULE authenticated-actor-buggy ----
\* BUGGY TWIN (vacuity guard) for authenticated-actor.tla.
\*
\* The attest gate is split into two separate, interleavable steps — the non-atomic
\* check-then-attest the *Concurrency* edge case and Invariant 1 warn against:
\*   CheckGate(p)    -> latches gateOpen[p] = TRUE while credStatus[p] = "Active"
\*   CommitAttest(p) -> writes the attestation if gateOpen[p] is set
\* Because Revoke(p) can interleave between the two, the history
\*   CheckGate(p) -> Revoke(p) -> CommitAttest(p)
\* commits an attestation while credStatus[p] = "Revoked", computing
\* signedAfterRevoke = TRUE from the observed status. Inv1_NoSignAfterRevoke fails.
\* The checker rejects the twin. If the checker reports the invariant holds here,
\* the harness is vacuous.

CONSTANT Principals

VARIABLES credStatus, attested, signedAfterRevoke, gateOpen
vars == <<credStatus, attested, signedAfterRevoke, gateOpen>>

TypeOK ==
    /\ credStatus       \in [Principals -> {"Active", "Revoked"}]
    /\ attested         \in [Principals -> BOOLEAN]
    /\ signedAfterRevoke \in BOOLEAN
    /\ gateOpen         \in [Principals -> BOOLEAN]

Init ==
    /\ credStatus       = [p \in Principals |-> "Active"]
    /\ attested         = [p \in Principals |-> FALSE]
    /\ signedAfterRevoke = FALSE
    /\ gateOpen         = [p \in Principals |-> FALSE]

\* BUG: gate check and attest commit are separate, interleavable steps.
CheckGate(p) ==
    /\ credStatus[p] = "Active"
    /\ gateOpen[p] = FALSE
    /\ attested[p] = FALSE
    /\ gateOpen' = [gateOpen EXCEPT ![p] = TRUE]
    /\ UNCHANGED <<credStatus, attested, signedAfterRevoke>>

CommitAttest(p) ==
    /\ gateOpen[p] = TRUE
    /\ attested[p] = FALSE
    /\ attested' = [attested EXCEPT ![p] = TRUE]
    /\ signedAfterRevoke' = IF credStatus[p] # "Active" THEN TRUE ELSE signedAfterRevoke
    /\ UNCHANGED <<credStatus, gateOpen>>

Revoke(p) ==
    /\ credStatus[p] = "Active"
    /\ credStatus' = [credStatus EXCEPT ![p] = "Revoked"]
    /\ UNCHANGED <<attested, gateOpen, signedAfterRevoke>>

Next == \E p \in Principals : CheckGate(p) \/ CommitAttest(p) \/ Revoke(p)
Spec == Init /\ [][Next]_vars

Inv1_NoSignAfterRevoke == signedAfterRevoke = FALSE

Safety == TypeOK /\ Inv1_NoSignAfterRevoke

====
