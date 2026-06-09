---- MODULE reservation-lifecycle ----
\* Grace Commons — Reservation Lifecycle (C9) composition.
\* Spec-level formal sibling of compositions/reservation-lifecycle.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The composition's load-bearing wiring decision is Invariant 1 (allocation
\* coherence): the pool's running `allocated` total stays in exact lockstep with
\* the set of reservations in a slot-holding state (Held or Confirmed), and within
\* [0, Capacity]. So the pool never oversells, never strands a slot, and a
\* Confirmed reservation keeps its slot (Confirmed consumes the unit).
\*
\* Per reservation: state in {none, held, confirmed, released, expired}.
\* Global: allocated, the pool's running total.
\*   reserve  : none -> held,      allocated++ (guarded allocated < Capacity)
\*   confirm  : held -> confirmed, allocated unchanged (slot kept)
\*   cancel   : held -> released,  allocated-- (slot returned)
\*   expire   : held -> expired,   allocated-- (slot returned)
\*
\* This CORRECT model performs each slot-changing transition atomically (the host
\* transaction boundary). The buggy twin performs a non-atomic cancel that
\* releases the commitment WITHOUT returning the slot — the leak the
\* *Cross-store consistency under partial failure* edge case warns against — and
\* TLC finds the state where `allocated` exceeds the live-reservation count.
\*
\* NOT MODELED (out of scope for the load-bearing property)
\* - idempotency (Invariant 5 — see idempotent-reservation.tla).
\* - the constituent state machines and their own invariants.
\* - attribution / journaling (Invariant 6).

EXTENDS Naturals, FiniteSets

CONSTANTS Reservations,         \* finite set of reservations against one pool
          Capacity              \* the pool's declared capacity

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

\* CORRECT reserve: capacity gate + hold + allocate, atomically.
Reserve(r) ==
    /\ state[r] = "none"
    /\ allocated < Capacity
    /\ state' = [state EXCEPT ![r] = "held"]
    /\ allocated' = allocated + 1

\* CORRECT confirm: Held -> Confirmed; the slot is kept (allocated unchanged).
Confirm(r) ==
    /\ state[r] = "held"
    /\ state' = [state EXCEPT ![r] = "confirmed"]
    /\ UNCHANGED allocated

\* CORRECT cancel: Held -> Released and the pool slot returned, atomically.
Cancel(r) ==
    /\ state[r] = "held"
    /\ state' = [state EXCEPT ![r] = "released"]
    /\ allocated' = allocated - 1

\* CORRECT expire: Held -> Expired and the pool slot returned, atomically.
Expire(r) ==
    /\ state[r] = "held"
    /\ state' = [state EXCEPT ![r] = "expired"]
    /\ allocated' = allocated - 1

Next == \E r \in Reservations : Reserve(r) \/ Confirm(r) \/ Cancel(r) \/ Expire(r)
Spec == Init /\ [][Next]_vars

\* --- composition-level safety invariants ---

\* Invariant 1 — allocation coherence: the counter equals the live-reservation
\* set and stays within [0, Capacity]. THE load-bearing claim.
AllocationCoherence ==
    /\ allocated = LiveCount
    /\ allocated <= Capacity
    /\ allocated >= 0

Safety == TypeOK /\ AllocationCoherence

====
