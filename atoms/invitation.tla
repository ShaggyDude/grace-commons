---- MODULE invitation ----
\* Grace Commons — Invitation atom (execution/render-time refactor, 2026-06-21).
\* Spec-level formal sibling of atoms/invitation.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* (1) Single-resolution BY WRITE: an invitation is written to at most one stored
\*     terminal in {Accepted, Declined, Revoked}; once written, that resolution is
\*     immutable. Ghost `resolution` records the first stored terminal reached, so
\*     "the resolution never changes once set" is the falsifiable predicate
\*     resolution # none => state = resolution.
\* (2) Expiry is DERIVED, never written. There is no action that stores "Expired"
\*     and no expired field. `Expired` is the read-time projection EffStatus(now).
\*     A resolving write fires only while the window is open (now < ExpiresAt), so a
\*     lapsed invitation can only ever READ Expired — it never becomes a stored
\*     terminal after the deadline, and the store never holds an "Expired" value.
\* (3) The POSITIVE derivation: a lapsed Pending record (state = Pending,
\*     now >= ExpiresAt) ALWAYS reads Expired. Inv_LapsedReadsExpired checks this
\*     non-vacuously (its antecedent Lapsed(now) IS reachable — every Pending state
\*     at now >= ExpiresAt satisfies it), unlike Inv_DerivedExpiryCoherent whose
\*     antecedent excludes Pending and so never exercises the Pending->Expired arc.
\*
\* MODELING CHOICES
\* - One invitation. `state` in {Pending, Accepted, Declined, Revoked} — NO stored
\*   Expired. `now` is an injected clock that only advances (Tick); `ExpiresAt` is a
\*   fixed deadline. Each resolving action guards on state = Pending /\ now < ExpiresAt:
\*   the injected clock is READ in the guard (pure), never used to WRITE an Expired
\*   state. EffStatus(c) is the derived effective status `read` returns at render time.
\* - BOUND SATURATION (FC F1): `Tick` is clamped at `ExpiresAt + 1`, not at MaxClock.
\*   One tick past the deadline (now = ExpiresAt + 1) is the only behaviorally-
\*   distinct LAPSED clock value — every clock value >= ExpiresAt produces the same
\*   guard outcomes (all resolving writes disabled; Lapsed(now) true on Pending), so
\*   collapsing them to a single representative loses no reachable behavior. With the
\*   clamp the reachable space SATURATES: raising MaxClock above ExpiresAt + 1 adds
\*   no states. MaxClock now only sizes the TypeOK domain; it is no longer the thing
\*   that bounds exploration. (Recorded saturation point: see invitation.cfg.)
\*
\* NOT MODELED (out of scope, named): identity binding at accept, field validation,
\* token id discipline / uniqueness (Alloy-class, single invitation here), and the
\* immutability of stored resolution fields (structural). Concurrent check-and-commit
\* atomicity under contention is a runtime-serialization obligation (Execution
\* Contract sequence-safety class), NOT modeled here — see the coverage matrix.

EXTENDS Naturals

CONSTANT ExpiresAt    \* fixed deadline (a natural; lapsed once now >= ExpiresAt)
CONSTANT MaxClock     \* TypeOK clock domain bound; must be >= ExpiresAt + 1.
                      \* Exploration saturates at ExpiresAt + 1 regardless (Tick clamp).

VARIABLES state, resolution, now
vars == <<state, resolution, now>>

StoredTerminals == {"Accepted", "Declined", "Revoked"}
StoredStates    == {"Pending"} \cup StoredTerminals

TypeOK ==
    /\ state \in StoredStates
    /\ resolution \in (StoredTerminals \cup {"none"})
    /\ now \in 0..MaxClock

Init ==
    /\ state = "Pending"
    /\ resolution = "none"
    /\ now = 0

\* Derived, read-time effective status (render time). Never stored.
Lapsed(c)    == (state = "Pending") /\ (c >= ExpiresAt)
EffStatus(c) == IF Lapsed(c) THEN "Expired" ELSE state

\* The injected clock advances at the I/O seam; it writes nothing else. Clamped
\* at ExpiresAt + 1 (FC F1): one tick past the deadline is the only behaviorally-
\* distinct lapsed value, so the reachable space saturates there.
Tick ==
    /\ now < ExpiresAt + 1
    /\ now' = now + 1
    /\ UNCHANGED <<state, resolution>>

\* Resolving writes: only while Pending AND not lapsed (now < ExpiresAt). The
\* injected `now` is read in the guard (pure); no write ever sets an Expired state.
Resolve(t) ==
    /\ state = "Pending"
    /\ now < ExpiresAt
    /\ state' = t
    /\ resolution' = IF resolution = "none" THEN t ELSE resolution
    /\ UNCHANGED now

Accept  == Resolve("Accepted")
Decline == Resolve("Declined")
Revoke  == Resolve("Revoked")

Next == Accept \/ Decline \/ Revoke \/ Tick
Spec == Init /\ [][Next]_vars

\* Load-bearing — single-resolution by write (immutable once written).
Inv_SingleResolution == (resolution # "none") => (state = resolution)

\* Expiry is derived, never written: the store never holds an "Expired" value
\* (by construction — no action writes it; promoted to an explicit check so a
\* future edit that re-introduces a stored Expired is caught).
Inv_NoStoredExpired == state \in StoredStates

\* The derivation never misclassifies a written terminal as Expired: a stored
\* terminal always reads back as itself. NOTE (FC F2): this antecedent excludes
\* Pending, so it does NOT exercise the positive Pending->Expired derivation — it
\* is the NEGATIVE half only. Inv_LapsedReadsExpired below supplies the positive,
\* non-vacuous half.
Inv_DerivedExpiryCoherent == (state \in StoredTerminals) => (EffStatus(now) = state)

\* POSITIVE derivation (FC F2), non-vacuous: every lapsed Pending record reads
\* Expired. The antecedent Lapsed(now) is reachable (Pending states at
\* now >= ExpiresAt exist — e.g. (Pending, none, ExpiresAt)), so this check
\* actually bites. The buggy twin invitation-buggy-derivation.tla breaks the
\* derivation (EffStatus returns `state` unconditionally) and is rejected here.
Inv_LapsedReadsExpired == Lapsed(now) => (EffStatus(now) = "Expired")

Safety ==
    /\ TypeOK
    /\ Inv_SingleResolution
    /\ Inv_NoStoredExpired
    /\ Inv_DerivedExpiryCoherent
    /\ Inv_LapsedReadsExpired
====
