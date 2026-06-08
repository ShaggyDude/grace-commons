---- MODULE event-log-buggy ----
\* Grace Commons — Event Log atom: BUGGY TWIN (vacuity guard).
\*
\* Identical to event-log.tla EXCEPT it adds the VolatileRestart action the
\* English spec explicitly warns against (State §next_sequence_number:
\* "Volatile implementations that reset to 1 on restart violate this invariant
\* across the lifetime of the log instance"). Resetting next_seq to 1 lets a
\* later-appended event receive a sequence_number no larger than an earlier
\* event's — breaking Invariant 4 (sequence-number monotonicity).
\*
\* Expected result: Inv4_Monotonic VIOLATED by  AppendOk -> VolatileRestart ->
\* AppendOk : position 1 has seq 1, position 2 (appended strictly later) also
\* has seq 1, so log[1].seq < log[2].seq is false. If the checker reports all
\* invariants hold here, the harness is vacuous.

EXTENDS Naturals

CONSTANTS MaxLen, MaxSeq

EmptyEvt == [eid |-> 0, seq |-> 0]

VARIABLES log, len, next_seq, next_eid
vars == <<log, len, next_seq, next_eid>>

TypeOK ==
    /\ len \in 0..MaxLen
    /\ next_seq \in 1..(MaxSeq + 1)
    /\ next_eid \in 1..(MaxLen + 1)
    /\ log \in [1..MaxLen -> [eid: 0..(MaxLen + 1), seq: 0..MaxSeq]]

Init ==
    /\ log = [i \in 1..MaxLen |-> EmptyEvt]
    /\ len = 0
    /\ next_seq = 1
    /\ next_eid = 1

AppendOk ==
    /\ len < MaxLen
    /\ next_seq <= MaxSeq
    /\ log' = [log EXCEPT ![len + 1] = [eid |-> next_eid, seq |-> next_seq]]
    /\ len' = len + 1
    /\ next_seq' = next_seq + 1
    /\ next_eid' = next_eid + 1

AppendStorageFail ==
    /\ next_seq <= MaxSeq
    /\ next_seq' = next_seq + 1
    /\ UNCHANGED <<log, len, next_eid>>

\* BUG: volatile restart resets the allocator to 1 — the spec's named violation.
VolatileRestart ==
    /\ next_seq' = 1
    /\ UNCHANGED <<log, len, next_eid>>

Next == AppendOk \/ AppendStorageFail \/ VolatileRestart
Spec == Init /\ [][Next]_vars

Inv4_Monotonic == \A i, j \in 1..len : (i < j) => (log[i].seq < log[j].seq)
Inv3_TotalOrder == \A i, j \in 1..len : (i # j) => (log[i].seq # log[j].seq)
Inv6_NoIdReuse == \A i, j \in 1..len : (i # j) => (log[i].eid # log[j].eid)
Inv1_AppendOnlyPrefix == \A i \in 1..MaxLen : (i <= len) <=> (log[i] # EmptyEvt)
Safety == TypeOK /\ Inv4_Monotonic /\ Inv3_TotalOrder /\ Inv6_NoIdReuse
              /\ Inv1_AppendOnlyPrefix

====
