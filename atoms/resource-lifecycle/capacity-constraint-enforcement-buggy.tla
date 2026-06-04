---- MODULE capacity-constraint-enforcement-buggy ----
\* Grace Commons — Capacity Constraint Enforcement: BUGGY TWIN (vacuity guard).
\*
\* Identical to capacity-constraint-enforcement.tla EXCEPT the release action
\* drops the `allocated >= 1` guard AND the `status[w] = "allocated"` status
\* guard — modeling a double-release bug: a caller releases a second time after
\* the first release already returned the unit and the worker is back to "idle".
\* The English spec's `count <= allocated` precondition (Decision points —
\* `release`; Invariant 5) blocks this; without it, ReleaseBuggy fires on any
\* worker in any state, and a double-release drives `allocated` below 0.
\*
\* `AllocateAtomic` is retained unchanged from the correct model (single atomic
\* check-and-commit) so that Inv4_CapacityConstraint stays satisfied — isolating
\* Inv5_NonNegativity as the failing invariant for this twin's vacuity guard.
\*
\* Expected result: Inv5_NonNegativity VIOLATED at 3 states.
\* Concrete path (found by TLC): Init [allocated=0, all "idle"],
\*   ReleaseBuggy(w1) [allocated=-1, all "idle"] -- Inv5 violated in 1 step.
\* Because ReleaseBuggy has NO status guard, it fires immediately from Init even
\* though no worker has ever allocated a unit. The correct model's guard
\* `status[w] = "allocated"` prevents release-without-prior-allocation; dropping
\* it is the bug this twin encodes.
\* If the checker reports all invariants hold here, the harness is vacuous: it
\* would mean a release without the non-negativity precondition is safe, which
\* is exactly what Invariant 5 exists to deny.

EXTENDS Naturals, FiniteSets

CONSTANTS Capacity, Workers

VARIABLES allocated, status   \* status: Workers -> {"idle","allocated"}
vars == <<allocated, status>>

\* TypeOK scoped to status only so it does not mask Inv5 when allocated < 0.
TypeOK ==
    /\ status \in [Workers -> {"idle", "allocated"}]

Init ==
    /\ allocated = 0
    /\ status = [w \in Workers |-> "idle"]

\* CORRECT allocate: serializable check-and-commit — unchanged from the correct
\* model. Inv4_CapacityConstraint is not the focus of this twin.
AllocateAtomic(w) ==
    /\ status[w] = "idle"
    /\ allocated + 1 <= Capacity
    /\ allocated' = allocated + 1
    /\ status' = [status EXCEPT ![w] = "allocated"]

\* BUG: release drops BOTH the status guard (status[w]="allocated") AND the
\* arithmetic guard (allocated >= 1). A worker in "idle" state — one that
\* already released — can call ReleaseBuggy again, decrementing allocated below
\* zero. This is the double-release hazard; the correct model's guard
\* `status[w] = "allocated"` prevents it because a released worker is back to
\* "idle" and cannot fire ReleaseAtomic a second time.
ReleaseBuggy(w) ==
    /\ allocated' = allocated - 1
    /\ UNCHANGED status

Next ==
    \E w \in Workers :
        \/ AllocateAtomic(w)
        \/ ReleaseBuggy(w)
Spec == Init /\ [][Next]_vars

Inv4_CapacityConstraint == allocated <= Capacity
Inv5_NonNegativity == allocated >= 0
Safety == TypeOK /\ Inv4_CapacityConstraint /\ Inv5_NonNegativity

====
