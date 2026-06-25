---- MODULE reserve-from-pool-buggy ----
\* BUGGY TWIN (vacuity guard) for reserve-from-pool.tla.
\*
\* Replaces the correct atomic Cancel with CancelBuggy, which moves the
\* reservation Held -> Released but does NOT decrement `allocated` — the
\* non-atomic slot-leak the *Cross-store consistency under partial failure* edge
\* case and Invariant 1 (allocation coherence) warn against: the commitment is
\* released but its pool slot is never returned. From Init, Reserve(r) then
\* CancelBuggy(r) reaches state[r] = released with allocated = 1 while the
\* live-reservation count is 0 — allocated (1) /= LiveCount (0). AllocationCoherence
\* fails. The checker rejects the twin.
\* If the checker reports all invariants hold here, the harness is vacuous.

EXTENDS Naturals, FiniteSets

CONSTANTS Reservations, Capacity

States == {"none", "held", "confirmed", "released", "expired"}
SlotHolding(s) == s \in {"held", "confirmed"}

VARIABLES state, allocated
vars == <<state, allocated>>

LiveCount == Cardinality({r \in Reservations : SlotHolding(state[r])})

TypeOK ==
    /\ state \in [Reservations -> States]
    /\ allocated \in 0..Cardinality(Reservations)

Init ==
    /\ state = [r \in Reservations |-> "none"]
    /\ allocated = 0

Reserve(r) ==
    /\ state[r] = "none"
    /\ allocated < Capacity
    /\ state' = [state EXCEPT ![r] = "held"]
    /\ allocated' = allocated + 1

Confirm(r) ==
    /\ state[r] = "held"
    /\ state' = [state EXCEPT ![r] = "confirmed"]
    /\ UNCHANGED allocated

\* BUG: release the commitment WITHOUT returning the pool slot (leak).
CancelBuggy(r) ==
    /\ state[r] = "held"
    /\ state' = [state EXCEPT ![r] = "released"]
    /\ UNCHANGED allocated

Expire(r) ==
    /\ state[r] = "held"
    /\ state' = [state EXCEPT ![r] = "expired"]
    /\ allocated' = allocated - 1

Next == \E r \in Reservations : Reserve(r) \/ Confirm(r) \/ CancelBuggy(r) \/ Expire(r)
Spec == Init /\ [][Next]_vars

AllocationCoherence ==
    /\ allocated = LiveCount
    /\ allocated <= Capacity
    /\ allocated >= 0

Safety == TypeOK /\ AllocationCoherence

====
