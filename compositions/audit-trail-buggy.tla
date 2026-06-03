---- MODULE audit-trail-buggy ----
\* Grace Commons — Audit Trail composition: BUGGY TWIN (vacuity guard).
\*
\* Identical to audit-trail.tla EXCEPT the cascade is performed as separate,
\* interleavable sub-steps with NO compensating record — the naive non-atomic
\* implementation the spec's *Cross-store consistency under failure* edge case
\* and Invariant 4 warn against. The sub-steps follow the spec's stated order
\* (retention -> destroy event -> purge attestation -> mark seal records-purged)
\* but, because they are distinct actions, TLC can stop the cascade partway.
\*
\* Expected result: Inv4_Cascade VIOLATED. After PurgeRetention(e) alone the
\* event is {retState=Purged, evState=present, attState=live, sealCov=covered}
\* — neither coherent configuration — a dangling cross-store partial. If the
\* checker reports all invariants hold here, the harness is vacuous: it would
\* mean the non-atomic cascade is safe, which is exactly the claim Invariant 4
\* exists to deny.

CONSTANT Events

VARIABLES evState, attState, sealCov, retState, eligible
vars == <<evState, attState, sealCov, retState, eligible>>

TypeOK ==
    /\ evState  \in [Events -> {"present", "purged"}]
    /\ attState \in [Events -> {"live", "purged"}]
    /\ sealCov  \in [Events -> {"covered", "recpurged"}]
    /\ retState \in [Events -> {"Retained", "Purged"}]
    /\ eligible \in [Events -> BOOLEAN]

Init ==
    /\ evState  = [e \in Events |-> "present"]
    /\ attState = [e \in Events |-> "live"]
    /\ sealCov  = [e \in Events |-> "covered"]
    /\ retState = [e \in Events |-> "Retained"]
    /\ eligible = [e \in Events |-> FALSE]

MarkEligible(e) ==
    /\ retState[e] = "Retained"
    /\ ~eligible[e]
    /\ eligible' = [eligible EXCEPT ![e] = TRUE]
    /\ UNCHANGED <<evState, attState, sealCov, retState>>

\* BUG: non-atomic cascade — four independent steps, no compensation.
PurgeRetention(e) ==
    /\ retState[e] = "Retained"
    /\ eligible[e]
    /\ retState' = [retState EXCEPT ![e] = "Purged"]
    /\ UNCHANGED <<evState, attState, sealCov, eligible>>

DestroyEvent(e) ==
    /\ retState[e] = "Purged"
    /\ evState[e] = "present"
    /\ evState' = [evState EXCEPT ![e] = "purged"]
    /\ UNCHANGED <<attState, sealCov, retState, eligible>>

PurgeAttestation(e) ==
    /\ evState[e] = "purged"
    /\ attState[e] = "live"
    /\ attState' = [attState EXCEPT ![e] = "purged"]
    /\ UNCHANGED <<evState, sealCov, retState, eligible>>

MarkSealPurged(e) ==
    /\ attState[e] = "purged"
    /\ sealCov[e] = "covered"
    /\ sealCov' = [sealCov EXCEPT ![e] = "recpurged"]
    /\ UNCHANGED <<evState, attState, retState, eligible>>

Next ==
    \E e \in Events :
        \/ MarkEligible(e)
        \/ PurgeRetention(e)
        \/ DestroyEvent(e)
        \/ PurgeAttestation(e)
        \/ MarkSealPurged(e)

Spec == Init /\ [][Next]_vars

Coherent(e) ==
    \/ (retState[e] = "Retained" /\ evState[e] = "present"
            /\ attState[e] = "live"   /\ sealCov[e] = "covered")
    \/ (retState[e] = "Purged"   /\ evState[e] = "purged"
            /\ attState[e] = "purged" /\ sealCov[e] = "recpurged")

Inv4_Cascade == \A e \in Events : Coherent(e)
Inv8_HonestDestruction == \A e \in Events : (evState[e] = "purged") => (retState[e] = "Purged")
Inv1_AttributionCoverage == \A e \in Events : (retState[e] = "Retained") => (attState[e] = "live")
Safety == TypeOK /\ Inv4_Cascade /\ Inv8_HonestDestruction /\ Inv1_AttributionCoverage

====
