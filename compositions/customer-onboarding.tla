---- MODULE kyc-customer-onboarding ----
\* Grace Commons — KYC / Customer Onboarding with Ongoing Monitoring (C8).
\* Spec-level formal sibling of compositions/kyc-customer-onboarding.md.
\* Derived validator; the English spec is the single source of truth. On any
\* disagreement, diagnose per pressure-testing.md §The conflict protocol.
\*
\* WHAT THIS MODEL CHECKS
\* The load-bearing claim is the adverse-monitoring coupling: an adverse trigger
\* (sanctions match, PEP change, adverse media) PRECEDES a suspend, and the
\* composition maintains the biconditional open-trigger <=> Suspended — a party
\* is Suspended if and only if it carries at least one open (unresolved) adverse
\* trigger. There is no Suspended-without-trigger and no open-trigger-without-
\* Suspended.
\*
\* MODELING CHOICES
\* - One party. `state` in {Verified, Suspended}; `openTriggers` counts open
\*   adverse triggers. Raising a trigger drives the suspend (trigger precedes /
\*   causes suspend); resolving the last trigger reinstates. The biconditional is
\*   checked as boolean equality so the encoding stays in the checker's fragment.
\*
\* NOT MODELED (out of scope): the Party Identity verification lifecycle (see
\* party-identity.tla), the Audit Trail substrate (see audit-trail.tla),
\* Retention Window, trigger identity/attribution.

EXTENDS Naturals

CONSTANT MaxTriggers        \* max concurrent open adverse triggers

VARIABLES state, openTriggers
vars == <<state, openTriggers>>

TypeOK ==
    /\ state \in {"Verified", "Suspended"}
    /\ openTriggers \in 0..MaxTriggers

Init ==
    /\ state = "Verified"
    /\ openTriggers = 0

\* an adverse trigger is raised; it drives the suspend (trigger precedes suspend).
RaiseTrigger ==
    /\ openTriggers < MaxTriggers
    /\ openTriggers' = openTriggers + 1
    /\ state' = "Suspended"

\* a trigger is resolved; reinstatement happens exactly when the last one clears.
ResolveTrigger ==
    /\ openTriggers > 0
    /\ openTriggers' = openTriggers - 1
    /\ state' = IF openTriggers - 1 = 0 THEN "Verified" ELSE "Suspended"

Next == RaiseTrigger \/ ResolveTrigger
Spec == Init /\ [][Next]_vars

\* Load-bearing — a party is Suspended iff it carries an open adverse trigger.
Inv_OpenTriggerIffSuspended == (openTriggers > 0) = (state = "Suspended")
Safety == TypeOK /\ Inv_OpenTriggerIffSuspended

====
