---- MODULE provisional-commitment-buggy-window ----
\* Grace Commons — Provisional Commitment atom: BUGGY TWIN (isolated, Inv 7 guard).
\*
\* This is the second of two isolated buggy twins. It targets Invariant 7
\* (confirm-within-window). Its sibling `provisional-commitment-buggy.tla` targets
\* Invariant 8 (transition timestamps after placement). Splitting the hazards
\* across two twins gives each load-bearing invariant its own reachable,
\* checker-rejected counterexample (a combined twin would surface only the
\* shorter violation — Inv 8 at 4 states would mask Inv 7).
\*
\* BUG — confirm at the window boundary: `ConfirmBuggy` admits a confirm while
\* `clock <= ExpiresAt` instead of the correct `clock < ExpiresAt`. A confirm
\* fired at clock = ExpiresAt stamps confirmedAt = ExpiresAt, which
\* `Inv_ConfirmWithinWindow` (confirmedAt < ExpiresAt) catches. Release and Expire
\* stamp the real clock, so `Inv8_TransitionsAfterPlacement` still HOLDS — the
\* violation is isolated to confirm-within-window.
\*
\* Expected result: Safety VIOLATED (Inv_ConfirmWithinWindow). Tick to ExpiresAt,
\* confirm -> confirmedAt = ExpiresAt, not strictly within the window.

EXTENDS Naturals

CONSTANTS PlacedAt, ExpiresAt, MaxClock

States == {"Held", "Confirmed", "Released", "Expired"}

VARIABLES state, clock, confirmedAt, releasedAt, expiredAt, everTerminal
vars == <<state, clock, confirmedAt, releasedAt, expiredAt, everTerminal>>

TypeOK ==
    /\ state \in States
    /\ clock \in 0..MaxClock
    /\ confirmedAt \in 0..MaxClock
    /\ releasedAt \in 0..MaxClock
    /\ expiredAt \in 0..MaxClock
    /\ everTerminal \in BOOLEAN

Init ==
    /\ state = "Held"
    /\ clock = PlacedAt
    /\ confirmedAt = 0
    /\ releasedAt = 0
    /\ expiredAt = 0
    /\ everTerminal = FALSE

Tick ==
    /\ clock < MaxClock
    /\ clock' = clock + 1
    /\ UNCHANGED <<state, confirmedAt, releasedAt, expiredAt, everTerminal>>

\* BUG: confirm admitted at the boundary (clock <= ExpiresAt) — the correct
\* model requires clock < ExpiresAt. confirmedAt is stamped with the real clock,
\* so Inv8 holds; only Inv_ConfirmWithinWindow is violated (at clock = ExpiresAt).
ConfirmBuggy ==
    /\ state = "Held"
    /\ clock <= ExpiresAt
    /\ state' = "Confirmed"
    /\ confirmedAt' = clock
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, releasedAt, expiredAt>>

Release ==
    /\ state = "Held"
    /\ state' = "Released"
    /\ releasedAt' = clock
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, confirmedAt, expiredAt>>

Expire ==
    /\ state = "Held"
    /\ clock >= ExpiresAt
    /\ state' = "Expired"
    /\ expiredAt' = clock
    /\ everTerminal' = TRUE
    /\ UNCHANGED <<clock, confirmedAt, releasedAt>>

Next == Tick \/ ConfirmBuggy \/ Release \/ Expire
Spec == Init /\ [][Next]_vars

Inv_ConfirmWithinWindow == (state = "Confirmed") => (confirmedAt < ExpiresAt)

Inv3_TerminalAbsorbing ==
    everTerminal => (state \in {"Confirmed", "Released", "Expired"})

Inv8_TransitionsAfterPlacement ==
    /\ (state = "Confirmed") => (confirmedAt >= PlacedAt)
    /\ (state = "Released")  => (releasedAt  >= PlacedAt)
    /\ (state = "Expired")   => (expiredAt   >= PlacedAt)

Safety ==
    /\ TypeOK
    /\ Inv_ConfirmWithinWindow
    /\ Inv3_TerminalAbsorbing
    /\ Inv8_TransitionsAfterPlacement

====
