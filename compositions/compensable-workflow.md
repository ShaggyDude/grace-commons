---
title: Compensable Workflow
parent: Compositions
nav_order: 12
has_toc: true
toc: true
---

# Compensable Workflow

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Compensable Workflow wires two building blocks — a workflow state machine (a process that moves through a declared sequence of steps, one step current at a time) and an event log (an add-only record of everything that happens) — so that a multi-step process can be undone *as a whole* even after some of its steps have already had real-world effects.

The trick is that each forward step is recorded together with a **compensating action**: a second step that reverses the first one's effect, the way a refund reverses a charge or a cancellation reverses a reservation. While everything is going well the compensable workflow just advances, step by step. If a step fails (or someone cancels), the compensable workflow runs the compensating actions for the steps that already finished, in reverse order — so the process ends up either fully done or fully undone, never stranded half-finished.

(A guarantee that appears only when the two building blocks are combined is called an *emergent guarantee*; here the headline one is **all-or-compensated** — no finished step's real-world effect is left standing after an abort.)

Because the engine that runs a compensable workflow normally *retries* steps that may have failed, every step and every compensation must be **idempotent** — safe to run more than once with the same result — which the composition enforces with a per-effect key.

This is the building block for order processing, travel and financial bookings, and supply-chain flows: anywhere a sequence of real, external actions needs to come out all-or-nothing without a single database transaction wrapping them.

---

## Intent

A great many business processes are a short sequence of local steps, each touching a different system and each producing a real effect in the world: an order-fulfillment flow reserves inventory, then charges a card, then schedules a shipment; a travel booking reserves a flight, then a hotel, then a car; a money transfer debits one account, then credits another. The steps are not in one database, so there is no single transaction spanning them. If a later step fails, the earlier steps have already happened — the card is charged, the inventory is held — and the process needs *all-or-nothing* semantics anyway: either the whole sequence commits, or its effects are undone.

A *distributed transaction* — a protocol that locks every participating system and commits or rolls back all of them atomically (two-phase commit and its kin) — is the textbook answer and the one real systems routinely refuse: it couples the services, holds locks across network boundaries, and fails badly under partition. The *compensable workflow* is the alternative. A compensable workflow runs the steps as independent local commits and, for each step, records a **compensating action** — a second forward operation that semantically reverses the first (a refund reverses a charge; a release reverses a reservation). On failure or cancel, the compensable workflow executes the compensating actions for the steps that already completed, in reverse order. The net effect is *eventual* all-or-nothing — the compensable workflow ends either committed or fully compensated — achieved without any distributed lock.

The two constituent atoms supply the halves this needs and neither supplies the whole. [State Machine](../atoms/state-machine.md) governs the step sequence: a deployment-declared set of states and transitions, exactly one current state at all times, and a transition history that is append-only, total-ordered, and replays deterministically to the current state (its Invariants 2, 5, 6, 7). But it only ever *advances or refuses* — it has no surface for reversing a transition that already fired, and it deliberately does not evaluate the conditions under which a step should be abandoned (its Invariant 8, guard-gating without evaluation). [Event Log](../atoms/event-log.md) supplies the durable, append-only, total-ordered record of what actually happened (its Invariants 1, 3) but takes no action on it. This composition is the wiring that turns the two into a compensable workflow: each forward step, on completing, appends an event that registers its compensating action; the compensable workflow's position is the State Machine current state, derived from that log; and an emergent *advance-or-compensate* action drives the compensable workflow forward step by step or, once a step fails or the compensable workflow is cancelled, runs the registered compensations in reverse.

The sharpest way to locate this pattern is against its structural sibling, [Undo History](./undo-history.md). Undo History is the same skeleton — a durable step log plus an all-or-nothing-ish guarantee — with the *opposite* reversal mechanism. Undo reverses an action by **replay-skip**: it recomputes the visible state as if the skipped event had never occurred. That works only when an action's entire effect lives inside the log, and Undo History's own Edge cases name exactly where it stops working: *"actions with external side effects — sending emails, charging cards — where the side effect is not reversible by skipping the event."* That boundary is the compensable workflow's whole reason to exist. A charge is not undone by deleting the charge event — the money has already moved — so the compensable workflow reverses it by recording and running an explicit compensating action (a refund), which is itself a real, recorded forward effect. **Replay-skip versus compensating action** is the one load-bearing difference between the two patterns; everything else is shared.

This composition is **not a new primitive.** State Machine and Event Log are unchanged; the compensating action is a *sub-atomic recorded closure* — a captured operation-plus-arguments paired to a forward step, the same shape Undo History's compensating events take — not an atom in its own right. The compensable workflow's position carries no state that is not derivable from the step/compensation log. It is also, deliberately, **not a distributed-transaction protocol** and **not the durable-execution engine** that runs it. How the steps are driven and retried — a Temporal-style replay engine, a message queue, hand-rolled orchestration code — and whether the steps coordinate through a central orchestrator or by reacting to each other's events (*orchestration versus choreography*) are **realization choices below the contract**: a compensable workflow is one of the named realizations of the distributed-atomicity obligation (database transaction / compensable workflow / queue) recorded as the obligation-realization boundary in [`execution-contract.md`](../execution-contract.md). What this spec owns is the part that boundary does *not* capture — the step-to-compensation pairing, the reverse-order compensation discipline, and the two emergent invariants (all-or-compensated, and idempotency under retry). A refund is a domain-meaningful act with its own recorded effect, not the transparent rollback of a database transaction; that domain meaning is what earns this a composition spec rather than a single line in the realization registry.

---

## Composes

- **[State Machine](../atoms/state-machine.md)** — the step-sequence spine. The compensable workflow's steps and their legal order are a declared state machine (states, transitions, an initial state, terminal states); the compensable workflow's *position* is the instance's `current_state`; the forward and compensating moves are declared transitions. The composition instantiates one State Machine instance per compensable workflow run and calls `fire` as its sole state-change path — it never reverses a fired transition (the atom has no such surface), it fires a *forward* compensating transition instead. It relies on the atom's declared-transition discipline, single-current-state guarantee, terminal absorption, and replay-deterministic append-only history (Invariants 2, 4, 5, 7), and on its guard-gating-without-evaluation (Invariant 8): the *decision* to abandon and compensate is evaluated here, at the composition layer, not by the atom.

- **[Event Log](../atoms/event-log.md)** — the durable record of the run. The composition owns one Event Log instance per compensable workflow and appends one event for each step completion and each compensation run. The compensable workflow position, the set of completed steps, the registered compensating actions, and the set of effects already applied are all **derived** from this log by replay — the composition stores no separate copy of them. This mirrors Undo History's event-sourced design and is what keeps the compensable workflow a composition rather than a new stateful atom: there is no non-derivable state. It relies on the log's append-only and total-order guarantees (Invariants 1, 3) and on `append`'s `storage-failure` rejection.

The **[Compensating Action]** itself is *sub-atomic* — a recorded closure (the reversing operation plus the arguments captured at the step's completion), the same primitive Undo History uses for its compensating events, not a freestanding atom.

Two neighbours, named here so the boundaries are explicit. [Execute Gated Workflow](./execute-gated-workflow.md) is the **sibling over the same spine**: it also wires State Machine, but for *human-approval gating of forward progress* (a transition fires only after a real Approval Step is Approved). This composition wires the same spine for *failure-compensation of completed steps*. The two are orthogonal — a regulated compensable workflow would compose both. [Undo History](./undo-history.md) is the **complement**, reversing by replay-skip where this composition reverses by compensating action (see Intent). The [Audit Trail](./audit-trail.md) regulated-audit substrate is deliberately *not* composed in this base shape (see Edge cases).

---

## Composition logic

### Composition state

The composition owns emergent state that wires the two atoms into one compensable-workflow surface. Every element is reconstructible by replaying the Event Log — a **derived index** in the sense of [`execution-contract.md`](../execution-contract.md) §Composition state — so the composition holds no truth the log does not. The State Machine constituent owns the compensable workflow position (`current_state`) and the transition history.

- **`compensable workflow_store`** — the set of compensable workflow instance records. Each record carries `compensable workflow_id` (the State Machine `instance_id`, assigned by the constituent at start), `definition_ref` (an opaque reference to the deployment-declared step/compensation sequence supplied at start), `subject_ref` (the entity the compensable workflow acts on — an order id, a booking id), `started_at`, and the terminal `outcome` once reached ([Committed] | [Compensated] — [Halted] is a non-terminal holding state, carried as a phase, not an outcome). Every field is set once at start and is immutable thereafter, and is itself recoverable from the `compensable workflow_started` event — the store is a convenience projection, not independent state.

- **`step_log`** — the Event Log instance for this compensable workflow. It holds the run's events: `compensable workflow_started`, `step_completed` (carrying the step name, the registered [Compensation Ref] with its captured arguments, and the step's [Effect Key]), `compensation_run` (carrying the step it compensates and the compensation's own [Effect Key]), the phase markers `compensation_begun` (forward → compensating) and `compensable workflow_halted` (compensating → the non-terminal holding state, on a stalled compensation), and the terminal markers `compensable workflow_committed` / `compensable workflow_compensated`. This is the source of truth; every element below is a projection of it.

- **`completed_steps`** *(derived index)* — the ordered list of steps that have completed and not yet been compensated, newest last. Rebuilt by replaying `step_completed` minus `compensation_run`. Read in reverse to drive compensation order.

- **`compensation_registry`** *(derived index)* — map from a completed step to the compensating action registered for it (the [Compensation Ref] and the arguments captured at completion — e.g. the `charge_id` a refund needs). Populated from `step_completed` events; consulted when the compensable workflow compensates. A step is reversed using the data recorded *at its completion*, never recomputed from current state.

- **`applied_effects`** *(derived index)* — the set of [Effect Key]s for step effects and compensation effects already applied. Rebuilt from the log. This is the at-most-once ledger behind idempotency under retry (Invariant 7): an effect whose key is already present is recognized as done and not re-applied. Each [Effect Key] is **stable across retries** — derived deterministically from `(compensable workflow_id, step)` for a step effect and `(compensable workflow_id, step, compensation)` for a compensation, never minted fresh per attempt — so a retried effect collides with its own prior key rather than escaping the dedup. A random per-attempt key would defeat the ledger.

### Derivation semantics

The projections in Composition state are not stored; they are computed from the Event Log on demand. This subsection defines how, and every "derived", "rebuilt", or "replay" reference in Action wiring and the invariants points here.

1. Read the compensable workflow's events in `sequence_number` order.
2. **Phase and position.** The compensable workflow is in the *forward* phase until a `compensation_begun` event appears and in the *compensating* phase after it; it enters the non-terminal *halted* holding state on a `compensable workflow_halted` event and returns to *compensating* on the next `compensation_run` (the retried compensation); the terminal `outcome` is set by a terminal event (`compensable workflow_committed` | `compensable workflow_compensated`). Equivalently — and authoritatively — the position is the State Machine `current_state` replayed from its transition history (Invariant 2).
3. **`completed_steps`.** Each `step_completed(step, …)` appends `step`; each `compensation_run(step, …)` removes it. The surviving list, newest last, is the set of completed-and-not-yet-compensated steps; read newest-first it is the compensation order (Invariant 5).
4. **`compensation_registry`.** Each `step_completed` records `step → {compensation_ref, captured arguments}`, read at compensation time so a step is reversed from the data recorded at its completion, not recomputed from current state.
5. **`applied_effects`.** Each `step_completed` and each `compensation_run` adds its [Effect Key]; an effect whose key is already present is already applied (Invariant 7).

Replay assumes events are appended only on success — the storage-failure branch in Action wiring guarantees a `step_completed` is written only when the step's effect actually landed — so every recorded completion reflects a real external effect.

### Configuration

- **`compensation_order`** — the order in which completed steps are compensated when a compensable workflow aborts. Default **reverse of completion order** (last-in-first-out, *LIFO*): the most recently completed step is compensated first, so a later effect is unwound before any earlier effect it may depend on. This is the conventional default. A deployment whose compensations are mutually independent may set `parallel`; running them concurrently is a **realization choice that preserves all-or-compensated (Invariant 4) but relaxes the reverse order (Invariant 5)** by design — it sits below the contract in the same sense as the engine, and the spec checks the observable *all-compensated* outcome, not the schedule.

- **`on_compensation_failure`** — what the compensable workflow does when a compensating action itself fails. Default **halt-and-surface**: the compensable workflow records `compensable workflow_halted` to enter a **non-terminal holding state**, stops automatic progress, and surfaces the failed compensation as a routed, records-visible obligation. It is not done — once the obstacle is cleared, a retried [Advance] re-runs the stalled compensation (the state machine permits *halted → compensating*) and compensation continues to the [Compensated] terminal. The obligation is *never* silently skipped, because a skipped compensation is exactly the all-or-compensated violation the pattern exists to prevent. A deployment may set `continue` (attempt the remaining compensations and surface the failed one at the end) when the compensations are independent; the failed compensation is still surfaced, never dropped.

- **Below the contract (named, not configured here).** The durable-execution engine that drives and *retries* steps, and the orchestration-versus-choreography topology, are realization, not configuration of this composition — see Intent and Edge cases. The composition's only requirement on the engine is the one Invariant 7 encodes: that it may retry, and therefore steps and compensations must be idempotent.

### Primitive policies

Composition-boundary validation, applied before any constituent call:

- **`compensable workflow_id`, `subject_ref`, `definition_ref`, [Compensation Ref], [Effect Key]** — each must contain at least one non-whitespace character; null, empty, or whitespace-only is `invalid-request`.
- **`reason`** (optional on [Cancel]) — if supplied, at least one non-whitespace character.
- **The compensable workflow definition, validated at [Start Workflow].** Every declared step that performs an *external effect* (one whose result escapes this compensable workflow's own log — a charge, a shipment, an outbound message) **must declare a compensating action**, or be explicitly marked `read-only` (no external effect to reverse) or `pivot` (the commit point past which the compensable workflow only rolls forward — see Edge cases). A step with an external effect and no compensation and no such marker is [Invalid Definition]: the composition refuses it up front, because all-or-compensated (Invariant 4) cannot be promised for an effect nothing can reverse. This is the compensable workflow analog of Execute Gated Workflow's rule that `gate_spec` must cover every guarded transition.

### Action wiring

The composition exposes a small surface. The load-bearing action is the emergent **[Advance]** — neither constituent atom has it — which in the forward phase runs the next step and in the compensating phase runs the next compensation; this is the *advance-or-compensate* verb the pattern is named for. Every action that changes state appends exactly one Event Log event; if the append is rejected with `storage-failure`, the action did not happen and no derived state changes (mirroring Undo History's storage-failure discipline).

- **[Start Workflow]** — (Projected contract: `start_compensable workflow(definition, subject_ref, [reason]) → {compensable workflow_id} | rejected(invalid-definition | invalid-request | storage-failure)`) — validate the definition per Primitive policies (reject [Invalid Definition] if any external-effect step lacks a compensation or marker). Instantiate one State Machine with the step/compensation sequence as its declared transitions and *not-started* as the initial state. Append `compensable workflow_started` to the Event Log; write the `compensable workflow_store` spine record. On any `append`/`storage-failure`, surface `storage-failure` and issue no `compensable workflow_id` — the compensable workflow did not start. Return `{compensable workflow_id}`.

- **[Advance]** — (Projected contract: `advance(compensable workflow_id) → {step, outcome} | rejected(not-known | already-terminal | step-failed | storage-failure)`) — the emergent advance-or-compensate action. Look up `compensable workflow_store[compensable workflow_id]` (`not-known` if absent). If the position is a terminal state, return `already-terminal`.
  - *Forward phase.* Execute the next declared step's effect **under its [Effect Key]** (per Invariant 7: if `applied_effects` already holds the key, the effect is recognized as done and not re-run — this is what makes a retried [Advance] safe). On the effect succeeding, append one `step_completed` event registering the step's [Compensation Ref], the arguments to reverse *this* step, and the [Effect Key]; then `fire` the State Machine forward. If the step's effect fails, record no completion, append `compensation_begun` to enter the compensating phase, and return [Step Failed]. A step is complete only when both its effect and its `step_completed` append have landed; if the append fails after the effect succeeded, surface `storage-failure` and leave the compensable workflow at the prior position — the retry of [Advance] re-attempts the step under the same [Effect Key], the effect is recognized as already applied (no double-charge), and the append is retried. (This effect-then-record window is the cross-store partial-failure case; see Edge cases.)
  - *Compensating phase.* Run the compensating action for the most recently completed, not-yet-compensated step (per `compensation_order`), again **under its own [Effect Key]**. On success append `compensation_run` and `fire` the compensable workflow one step closer to the compensated terminal. When no completed-uncompensated steps remain, append `compensable workflow_compensated` and the compensable workflow reaches its compensated terminal. If a compensation fails, apply `on_compensation_failure` (default: append `compensable workflow_halted`, entering the non-terminal holding state); a later [Advance] from [Halted] re-runs the stalled compensation under its same [Effect Key], so a repaired obstacle resumes compensation rather than restarting it.

- **[Cancel]** — (Projected contract: `cancel(compensable workflow_id, [reason]) → {outcome} | rejected(not-known | already-terminal | storage-failure)`) — request abort of an in-flight compensable workflow. Append `compensation_begun` to move it from the forward phase into the compensating phase (subsequent [Advance] calls run compensations). A compensable workflow already committed or compensated returns `already-terminal`; a compensable workflow past its `pivot` returns its roll-forward disposition (see Edge cases).

- **[Position]** — (Projected contract: `position(compensable workflow_id) → {phase, step, outcome} | rejected(not-known)`) — read the compensable workflow's phase and current step, derived from the State Machine current state.

- **[Read Log]** — (Projected contract: `read_log(compensable workflow_id, query) → ordered_sequence_of_events | rejected(not-known | invalid-query)`) — pass-through to the Event Log's `read`; the full step/compensation trail at any time.

### The load-bearing wiring decision

The decision the composition exists to enforce: **a completed step whose effect escaped the system is reversed by a recorded compensating action, not by replay-skip.**

*Principle.* When a compensable workflow aborts, each completed step that produced an external effect must be reversed by executing the specific compensating action recorded *at that step's completion* — a refund against the recorded charge, a release against the recorded reservation — run in reverse order of completion. Reversal is a new, recorded forward effect, not a deletion of history and not a recomputation of state.

*Likely objection.* "Undo History already reverses a logged action by skipping its event and re-deriving state — why not event-source the compensable workflow the same way and avoid a second mechanism?" And, one level up: "If the guarantee is just 'no partial visible state', isn't this merely the obligation-realization boundary — declare distributed atomicity, let the projector pick a database transaction, a compensable workflow, or a queue — rather than a composition with content of its own?"

*Mechanism.* Replay-skip reverses only effects that live entirely in the log: re-deriving state as if an event never happened cannot un-charge a card or un-send a shipment, because those effects already left the system. The compensable workflow therefore reverses by an explicit compensating action, which is itself a real recorded effect — and *that* is content the obligation-realization boundary does not carry. The boundary promises an observable ("no partial visible state") and lets a realization fulfil it; the compensable workflow additionally specifies the step-to-compensation *pairing*, the reverse-order discipline, and the at-most-once obligation under retry — domain-meaningful structure, because a refund is a business act an auditor sees in the ledger, not the transparent rollback of a transaction. The compensating closure is captured at completion (with the arguments needed to reverse *that* step's specific effect) and replayed from the log, so the composition introduces no non-derivable state; the engine that drives and retries the steps stays below the contract.

*Result.* All-or-compensated (Invariant 4) falls out of the wiring as an emergent property: in every terminal state, each completed external effect is either part of a committed compensable workflow or has had its paired compensation executed, and the step/compensation log makes which-of-the-two true *from the records alone*. The constituent atoms are unchanged; the guarantee lives entirely in the composition, exactly as it does in Undo History — but bought with the opposite reversal mechanism, which is the boundary past which Undo History could not go.

---

## Composition-level invariants

These emerge from the composition; none belongs to a single constituent atom. Each is stated over the compensable workflow's reachable states and names the constituent guarantees and wiring it rests on.

- **Invariant 1 — Log faithfulness.** Every successful step completion and every compensation run appends exactly one event to the Event Log; no such event appears without the corresponding action, and no completion or compensation goes unrecorded. The compensable workflow position, the completed-step set, the compensation registry, and the applied-effect set are all *derived* from the log, never stored independently. *Rests on:* Event Log Invariants 1 (append-only) and 3 (total order); the storage-failure discipline in Action wiring.

- **Invariant 2 — Position equivalence.** At all times the compensable workflow's exposed position equals the result of replaying the step/compensation log — equivalently, the State Machine `current_state` derived from its append-only history. The position is not stored separately from the log that defines it. *Rests on:* State Machine Invariant 7 (replay determinism); Event Log Invariant 3.

- **Invariant 3 — Compensation pairing.** Every completed step that declared an external effect has exactly one compensating action registered for it, captured at completion with the arguments required to reverse *that* step's specific effect. A step with an external effect and no compensation cannot complete, because it cannot start (the definition is rejected as [Invalid Definition]). *Rests on:* the definition validation in Primitive policies.

- **Invariant 4 — All-or-compensated.** *(The load-bearing claim.)* Stated as safety plus liveness rather than a flat absolute, because a compensation is itself a real action that can fail. *Safety:* no compensable workflow reaches a [Committed] or [Compensated] terminal while any completed step's escaped effect is uncompensated — in [Committed], every completed effect is meant to stand; in [Compensated], every completed effect has had its registered compensating action executed. *Liveness:* an escaped effect whose compensation has not yet succeeded is never silently abandoned — it is carried as a visible, routed obligation in the explicitly-named, non-terminal [Halted] holding state (Invariant 6) until discharged. The hazard the invariant forbids is the *silent* survivor: a completed external effect that an abort leaves standing with no record that it must be reversed. *Rests on:* Invariants 1–3 and the advance-or-compensate wiring; the `on_compensation_failure = halt-and-surface` default, which converts a failed compensation into a surfaced obligation rather than a skipped one.

- **Invariant 5 — Reverse-order compensation.** When a compensable workflow aborts, completed steps are compensated in the reverse of their completion order by default, so any later effect is unwound before an earlier effect it may depend on. Running compensations in parallel (a configured, below-the-contract realization) preserves Invariant 4 but relaxes this ordering by design. *Rests on:* `compensation_order`; `completed_steps` read newest-first.

- **Invariant 6 — Single terminal outcome.** A compensable workflow has exactly two terminal outcomes — [Committed] (all steps done) and [Compensated] (all completed steps' compensations run) — and reaches exactly one of them; it is never stuck in a *silent* partial state. [Halted] is **not** a third terminal: it is the explicitly-surfaced, non-terminal holding state a stalled compensation enters, from which repair-and-retry returns the compensable workflow to the compensating phase and onward to [Compensated] (`compensating → halted → compensating → compensated`). The honest claim is therefore that the only resting outcomes are [Committed] or [Compensated], and any pause short of them is the visible, obligation-bearing [Halted] state — never a silent partial. *Rests on:* State Machine Invariant 4 (terminal absorption — [Committed] and [Compensated] are the absorbing states; [Halted] deliberately is not); the `on_compensation_failure` rule.

- **Invariant 7 — Idempotency under retry.** Because the durable-execution engine may deliver or replay any step or compensation more than once, each step effect and each compensation is applied *at most once per compensable workflow*: an effect whose [Effect Key] is already in `applied_effects` is recognized as done and re-delivery is a no-op that returns the first result. This is what makes Invariant 4 hold under a *retrying* executor rather than only under hypothetical exactly-once execution — the invariant a retrying executor surfaces most sharply, and the one that carries this pattern past Undo History's replay-reversible boundary. *Rests on:* the [Effect Key] discipline — a composition-introduced surface whose at-most-once *mechanism* is the idempotency-key discipline owned by the [Idempotent Reservation](./idempotent-reservation.md) peer pattern (a declared peer dependency, per [`pressure-testing.md`](../pressure-testing.md) §Capability provenance); `applied_effects` derived from the log.

- **Invariant 8 — Forward-closed after abort.** Once a compensable workflow enters the compensating phase, no further forward step completes; the only effects appended thereafter are compensations. (Reaching a new forward state after compensation has begun is out of scope — that is a re-run, not this pattern; see Edge cases.) *Rests on:* the phase guard in [Advance] and [Cancel].

- **Invariant 9 — Constituent invariants preserved.** All State Machine invariants hold over the compensable workflow's transitions (the composition only ever `fire`s declared transitions and never bypasses or rewrites history) and all Event Log invariants hold over the step log (compensation is a new appended forward effect, never a mutation or deletion). *Rests on:* State Machine Invariants 1–10; Event Log Invariants 1–7.

---

## Examples

### Walkthrough — order fulfillment

A compensable workflow with three external-effect steps — *reserve* inventory, *charge* the card, *ship* the order — and their compensations *release*, *refund*, and (for shipment) *recall*. The definition passes validation: every external-effect step names a compensation.

1. `start_compensable workflow(order_fulfillment, "order-9")` → `{compensable workflow_id: s1}`. Log: `[compensable workflow_started]`. Position: *not-started* (forward phase).
2. `advance(s1)` → runs *reserve* under `effect_key e1`; inventory held. Appends `step_completed(reserve, comp=release, args={hold_id}, e1)`; fires forward. Position: *reserved*.
3. `advance(s1)` → runs *charge* under `e2`; card charged. Appends `step_completed(charge, comp=refund, args={charge_id}, e2)`; fires. Position: *charged*.
4. `advance(s1)` → runs *ship* under `e3`; **the shipping carrier rejects the request.** No completion is recorded. The compensable workflow appends `compensation_begun` and flips to the compensating phase. Returns [Step Failed].
5. `advance(s1)` → compensating phase, reverse order: the most recent completed step is *charge*, so it runs *refund* against the recorded `charge_id` under `effect_key e4`. Appends `compensation_run(charge, e4)`; fires toward the compensated terminal.
6. `advance(s1)` → compensates *reserve* by running *release* against the recorded `hold_id`. Appends `compensation_run(reserve)`. No completed-uncompensated steps remain; appends `compensable workflow_compensated`. Position: *compensated* (terminal).

Outcome: the charge was refunded and the reservation released — the order's external effects are all reversed. The card was charged and then refunded; both remain visible in the payment ledger (a *semantic* reversal, not a pretence the charge never happened — see Edge cases). All-or-compensated holds: no completed effect survived the abort.

### Idempotency under retry

Replay step 3 with a realistic engine. `advance(s1)` charges the card under `e2`, the charge succeeds, but the `step_completed` append fails (`storage-failure`); the compensable workflow stays at *reserved*. The durable-execution engine retries `advance(s1)`: it re-attempts *charge* under the **same `effect_key e2`**, the payment service recognizes `e2` as already charged and returns the original result without charging again, and this time the append lands. The card is charged exactly once despite two [Advance] attempts. Without the [Effect Key] ledger (Invariant 7) the retry would double-charge — which is why idempotency under retry is load-bearing here, not a nicety.

### Domain examples

- **Travel booking** — steps *book-flight*, *book-hotel*, *book-car* with compensations *cancel-flight*, *cancel-hotel*, *cancel-car*. If the car fails, the hotel and flight are cancelled in reverse order. The classic compensable workflow.
- **Money transfer** — *debit* source then *credit* destination, compensation *reverse-debit*. If the credit fails, the debit is reversed; the ledger shows debit-then-reversal, not a vanished debit.
- **Supply-chain fulfilment** — *allocate*, *pick*, *pack*, *dispatch* with a `pivot` at *dispatch*: once dispatched, the compensable workflow rolls forward (a recall is a new business process, not a compensation), so steps before the pivot are compensable and the pivot is the commit point.

### Rejection paths

- [Start Workflow] with a definition whose *charge* step declares no compensation and is not marked `read-only` or `pivot` → `rejected(invalid-definition)`. The compensable workflow never starts; the composition refuses to promise all-or-compensated for an irreversible effect.
- A *refund* compensation fails during the compensating phase with `on_compensation_failure = halt-and-surface` → the compensable workflow enters the non-terminal [Halted] holding state, surfacing the outstanding refund as a records-visible obligation; it rests *visibly stalled*, not in a silent partial, and once the refund path is repaired a retried [Advance] re-runs the refund and the compensable workflow proceeds to [Compensated]. With `continue`, the remaining compensations run and the failed refund is surfaced at the end — never dropped.

---

## Edge cases and explicit non-goals

What this composition does not cover:

- **The durable-execution engine and topology are below the contract.** Whether the steps are driven by a Temporal-style replay engine, a message bus, or hand-written orchestration, and whether they coordinate via a central orchestrator or by reacting to each other's events (*orchestration versus choreography*), are realization choices, not part of this spec — the obligation-realization boundary in [`execution-contract.md`](../execution-contract.md). The Temporal *server* itself has no compensable workflow concept; compensable workflow and compensation are assembled at the SDK/composition layer from the engine's generic durable-execution primitives. This spec owns the observable contract (the invariants); the engine owns the *how*.
- **Semantic reversal, not rollback.** A compensation undoes a step's effect *semantically* (a refund offsets a charge); it does not erase history or restore a byte-for-byte prior state. Both the charge and the refund remain visible. Callers that need true rollback need a single transactional store, not a compensable workflow — which is the trade the compensable workflow exists to make.
- **No isolation.** Sagas are not isolated in the database-transaction sense: while a compensable workflow is mid-flight, another reader can observe its intermediate effects (a reservation that may yet be released, a charge that may yet be refunded). Guarding against the resulting anomalies — dirty reads, lost updates — requires semantic locks or commutative operations and is handled by a separate pattern (a Saga Isolation / Semantic Lock pattern *(forthcoming)*), deliberately out of scope here.
- **The pivot / irreversible step.** Some steps cannot be compensated (a physical dispatch, an irreversible external notification). The definition marks such a step a `pivot`: before it, the compensable workflow can compensate; at and after it, the compensable workflow may only roll forward (retry until success), because there is no compensation to run. A compensable workflow whose *only* path past a failure is through an uncompensable, un-retryable step cannot guarantee all-or-compensated and is a definition error.
- **Re-run / resume after compensation.** Once compensated, a compensable workflow is terminal; re-attempting the business goal is a *new* compensable workflow, not a resumption of this one (Invariant 8). A "retry the whole order" surface is a separate orchestration pattern.
- **Compensation that cannot ever succeed.** `halt-and-surface` makes a stuck compensation visible as an obligation, but resolving it (manual intervention, an alternate compensation) is operational/escalation work outside the composition. A compensation that can *never* succeed leaves the compensable workflow permanently in [Halted] — a recorded, escalated permanent exception, not a silent loss and not a fourth terminal outcome.
- **Regulated overlay deferred.** This is the base shape. A regulated compensable workflow — adding the regulated adversarial scenarios and Generation acceptance sections, and composing the [Audit Trail](./audit-trail.md) substrate for attributed, retention-bounded, tamper-sealed step and compensation records — is a future composition, exactly as Undo History defers attribution and retention to a composition with Audit Trail. The emergent invariants here are domain-neutral infrastructure.
- **Concurrent actors and clock.** Single logical compensable workflow instance; `recorded_at` ordering is best-effort and the Event Log `sequence_number` is authoritative (inherited from Event Log Invariant 7). Multi-actor cancellation races are resolved by the log order.

Where the composition breaks down: when a step's external effect is genuinely irreversible *and* not a markable pivot (nothing can compensate it and it cannot be retried to success); when step effects are not idempotent and the executor retries (Invariant 7 fails at its root); and when the steps require true isolation rather than eventual all-or-nothing.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are the composed action-wirings it exposes ([Start Workflow], [Advance], [Cancel]) and the two derived reads ([Position], [Read Log]), the signature concept it introduces (the [Compensating Action]), the fields of the recorded effects it owns ([Effect Key], [Compensation Ref]), its own terminal outcomes and holding state ([Committed], [Compensated], [Halted]), and its own rejections ([Invalid Definition], [Step Failed]). Its emergent state is entirely a **derived index** of the Event Log (the `compensable workflow_store`, `completed_steps`, `compensation_registry`, `applied_effects`) — it stores no truth the log does not, so those projections are left as backticked derived-index tokens rather than carded. References to the constituent atoms and their operations — State Machine's `fire` / `current_state`, Event Log's `append` / `read` — the inherited rejection tokens (`not-known`, `already-terminal`, `invalid-request`, `storage-failure`, `invalid-query`), and the deployment configuration knobs (`compensation_order`, `on_compensation_failure`) remain qualified/backticked, not carded here. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Start Workflow

The composition action that begins a run: it validates the definition (rejecting [Invalid Definition] if any external-effect step lacks a [Compensating Action] or marker), instantiates one State Machine over the declared step/compensation sequence, and appends the `compensable workflow_started` event. Returns the run's `compensable workflow_id`.

Kind: Operation

#### Advance

The composition's emergent, load-bearing action — the *advance-or-compensate* verb neither constituent has. In the forward phase it runs the next step under its [Effect Key] and records completion; in the compensating phase it runs the next [Compensating Action], newest-first. Returns the step and outcome, or [Step Failed] when a forward step's effect fails (flipping the run to compensating).

Kind: Operation

#### Cancel

The composition action that requests abort of an in-flight run — it appends `compensation_begun` to move the run from the forward phase into the compensating phase, so subsequent [Advance] calls run compensations. A terminal run returns `already-terminal`; a run past its `pivot` returns its roll-forward disposition.

Kind: Operation

#### Position

The derived read query returning the run's phase, current step, and outcome — derived from the State Machine current state (Invariant 2), not stored separately.

Kind: Operation

#### Read Log

The derived read query — a passthrough to the Event Log's `read` returning the run's full step/compensation trail at any time.

Kind: Operation

#### Compensating Action

The composition's signature concept: a captured operation-plus-arguments paired to a forward step and recorded at that step's completion, which semantically reverses the step's external effect (a refund reverses a charge, a release reverses a reservation). Sub-atomic — a recorded closure, the same primitive Undo History uses for its compensating events, not a freestanding atom. Run in reverse completion order on abort.

Kind: Type

#### Effect Key

The at-most-once idempotency key carried by each recorded step effect and compensation. Stable across retries — derived deterministically from the run id and step (and compensation), never minted fresh per attempt — so a retried effect collides with its own prior key. The applied-effect ledger keys off it; an effect whose key is already present is recognized as done and not re-applied (Invariant 7).

Kind:      Field
Field of:  a recorded effect
Role:      the at-most-once dedup key
Projects:  effect_key

#### Compensation Ref

The reference to a completed step's registered [Compensating Action], recorded in its `step_completed` event alongside the arguments captured at completion. Consulted, newest-first, when the run compensates.

Kind:      Field
Field of:  the step-completion record
Role:      the step's registered reversal
Projects:  compensation_ref

#### Committed

The terminal outcome in which every step completed and all effects are meant to stand. One of the run's two resting outcomes.

Kind:      Member
Member of: the run outcome
Role:      terminal outcome
Projects:  committed

#### Compensated

The terminal outcome in which the run aborted and every completed step's [Compensating Action] has been run. The other of the two resting outcomes.

Kind:      Member
Member of: the run outcome
Role:      terminal outcome
Projects:  compensated

#### Halted

The explicitly-surfaced, **non-terminal** holding state a stalled compensation enters (`on_compensation_failure = halt-and-surface`). Not a third terminal: a repaired obstacle lets a retried [Advance] resume compensation (`compensating → halted → compensating → compensated`). Carries the outstanding compensation as a visible, routed obligation — never a silent partial.

Kind:      Member
Member of: the run phase
Role:      non-terminal holding state
Projects:  halted

#### Invalid Definition

The composition's own rejection at [Start Workflow] — returned when the supplied definition has an external-effect step with no [Compensating Action] and no `read-only` / `pivot` marker. The run never starts, because all-or-compensated cannot be promised for an irreversible effect.

Kind:      Member
Member of: the start rejection
Role:      Rejection
Projects:  invalid-definition

#### Step Failed

The composition's own outcome from [Advance] when a forward step's external effect fails — no completion is recorded, `compensation_begun` is appended (flipping the run to the compensating phase), and this is returned to the caller.

Kind:      Member
Member of: the advance rejection
Role:      Outcome
Projects:  step-failed

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Start Workflow]: #start-workflow
[Advance]: #advance
[Cancel]: #cancel
[Position]: #position
[Read Log]: #read-log
[Compensating Action]: #compensating-action
[Effect Key]: #effect-key
[Compensation Ref]: #compensation-ref
[Committed]: #committed
[Compensated]: #compensated
[Halted]: #halted
[Invalid Definition]: #invalid-definition
[Step Failed]: #step-failed

---

## Standards references

This composition draws on:

- **Sagas** (Hector Garcia-Molina and Kenneth Salem, *Sagas*, ACM SIGMOD — the Association for Computing Machinery's Special Interest Group on Management of Data — 1987) — the originating paper: a long-lived transaction expressed as a sequence of subtransactions, each with a compensating transaction that semantically undoes it, committing without holding locks for the whole duration.
- **Compensating-transaction pattern** — the enterprise-integration and cloud design-pattern formulation of reversal-by-compensation for operations that cannot share one atomic transaction.
- **Durable execution — Temporal** (`io.temporal.workflow.Saga`) — the crystallized SDK form: an in-memory list of compensating closures registered as steps complete, run in reverse order on failure, durable only through workflow replay. The Temporal *server* carries no compensable workflow concept — the engine is domain-blind durable execution — which is the source-grounded basis for placing the engine below the contract.
- **Microservices compensable workflow** (Chris Richardson, microservices.io) — the orchestration-versus-choreography framing and the compensatable / pivot / retriable step taxonomy, named here as realization detail rather than concept.

It composes with, and is positioned against, two library patterns: [Undo History](./undo-history.md) (event sourcing with compensating *events*; the replay-skip complement) and [Idempotent Reservation](./idempotent-reservation.md) (the idempotency-key discipline behind Invariant 7). The constituent atoms carry their own inheritance — State Machine (BPMN — Business Process Model and Notation; HL7 FHIR — Health Level Seven Fast Healthcare Interoperability Resources — Task lifecycle; 21 CFR Part 11 — US Code of Federal Regulations, Title 21, Part 11, electronic records) and Event Log (ISO/IEC 27001 — the international information-security standard; NIST SP 800-92 — National Institute of Standards and Technology log-management guidance).

---

## Status

`grounded on Final Critique 4 — 2026-06-16` — drafted, self-reviewed, refined through one council round, and ground by the **Opus "Happy Torvalds X2" clearance gate** (fresh-reader Phase 3 + Phase 4, merged) on 2026-06-16 with **0 foundational findings** (Lineage §Final Critique). The formal layer is present and verifying (model-present bar met); the formal-layer vote is **YES — cast and discharged**. Composition logic, nine emergent invariants, the load-bearing wiring decision (compensation-by-recorded-action for external-effect reversal), an order-fulfillment walkthrough exercising the committed, compensated, and idempotency-under-retry paths, and the deferred items are specified; the derived TLA+ model machine-checks the two load-bearing invariants (all-or-compensated, idempotency-under-retry) with a rejected twin each. `grounded` is a launch point, not a finish line — touch-triggered re-passes and scheduled rescans continue to ratchet confidence, and the named next formal increment is a log-plus-replay model promoting Invariants 1 and 2 from by-construction/out-of-scope to covered. Decomposition source: [`working-ideas/dream-compositions.md`](../working-ideas/dream-compositions.md) §7, source-grounded against the Temporal server and the Java and TypeScript SDKs. Under the unified methodology (3×3 baseline + Final Critique starting at Round 4), this pattern's closing fresh-reader Opus round is retro-labeled Final Critique 4; its baseline was compressed (draft → self-review → one council round → closing Opus review), preserved in the Lineage as historical record.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

This is a fresh draft; Lineage accumulates as the pattern survives passes.

**Decomposition (settled before drafting).** This composition is the **external-side-effect complement of Undo History**: the same durable-step-log skeleton with the opposite reversal mechanism (compensating action versus replay-skip), entering exactly at the boundary Undo History's Edge cases name as its breakdown. No new primitive — State Machine + Event Log unchanged, the compensating action a sub-atomic recorded closure, the compensable workflow position derived from the log. The decomposition was source-grounded (dream-compositions §7): the Temporal Java SDK's `io.temporal.workflow.Saga` is an in-memory list of compensation closures, durable only via workflow replay, run last-in-first-out by default (`parallelCompensation` / `continueWithError` as realization knobs); the TypeScript SDK has no `Saga` abstraction; and the Temporal server's 2,718 Go source files carry no compensable workflow concept — confirming compensable workflow/compensation as composition/SDK-level, with the durable-execution engine below the contract.

**Formal-layer vote — YES (discharged 2026-06-16).** All-or-compensated (Invariant 4) is a safety claim over every failure interleaving, and idempotency under retry (Invariant 7) is a claim over a *retrying* executor — both load-bearing temporal/safety properties a derived TLA+ model must discharge under exhaustive interleaving. A model was authored and now meets the model-present bar (green; a rejected twin per checked invariant; non-vacuous; bound saturated — [`pressure-testing.md`](../pressure-testing.md) §The formal-layer vote); detail and the coverage matrix follow. The two honest unknowns the plan flagged were both handled: an *external* side effect is modeled as an effect-ledger flag plus an at-most-once witness counter (reversal is a recorded compensating action, never replay-skip), and idempotency-under-retry is modeled with an explicit retry window — `StepEffect` re-fires until `StepRecord` advances — over which the witness counter must stay ≤ 1.

**Formal model — authored and verified — 2026-06-16.** Derived model [`compensable-workflow.tla`](./compensable-workflow.tla) + [`compensable-workflow.cfg`](./compensable-workflow.cfg), checked by the WASM `tla-checker` via [`tools/harness/check.mjs`](../tools/harness/README.md). *Encoding* (mirrors the proven pure-function idiom of [`atoms/party-identity.tla`](../atoms/party-identity.tla) / [`undo-history.tla`](./undo-history.tla) — flat `\E`/`\A`, no `CHOOSE`, no `Sequences`): the compensable workflow is an effect ledger — per-step `applied`/`comp` booleans plus `0..2` witness counters `appCnt`/`compCnt` — with forward steps run in index order via a `pos` pointer. The split between `StepEffect` (lands the external effect, *re-fireable* — the engine may re-deliver) and `StepRecord` (advances) is the effect-then-record retry window the idempotency claim turns on; compensation keys off `applied` and runs highest-uncompensated-first (LIFO). *What it checks:* **Inv 4 all-or-compensated** (a compensable workflow rests only as [Committed] with every effect landed, or [Compensated] with every landed effect compensated) and **Inv 7 idempotency-under-retry** (`appCnt`/`compCnt` ≤ 1 despite re-delivery), plus **Inv 6** terminal consistency. *Twins — per-invariant teeth confirmed individually, not just against the `Safety` conjunction:*

| Twin | Inv 4 | Inv 7 | hazard re-introduced |
|---|---|---|---|
| [`compensable-workflow-skip-comp-buggy.tla`](./compensable-workflow-skip-comp-buggy.tla) | **VIOL** | hold | the compensation loop exits after the most-recent step — an earlier completed effect survives the abort uncompensated |
| [`compensable-workflow-double-apply-buggy.tla`](./compensable-workflow-double-apply-buggy.tla) | hold | **VIOL** | a non-idempotent handler re-applies on re-delivery (`appCnt` reaches 2) — the double-charge under retry |

Each load-bearing invariant has its own twin the checker rejects on *that* invariant (Inv 4 ← skip-comp, Inv 7 ← double-apply), so neither check is vacuous. *Bounds:* committed `N = 2` (rich enough for two-step reverse compensation, the abort interleaving, and the retry double-apply), 22 states, holds. No absorbing cap, so explored states grow monotonically with `N` rather than plateauing — confirmed holding at `N` = 2 / 3 / 4 / 5 → 22 / 34 / 48 / 64 states, every bump still holding (monotone growth, no truncation hiding a bug). *Conflict-protocol outcome:* none — the model **corroborates** the English (the Option-B non-terminal [Halted] reading, the effect-then-record window, and Inv 4 / 6 / 7 all hold as written); canonical English unchanged.

**Coverage cross-check matrix** (per [`pressure-testing.md`](../pressure-testing.md) §The coverage cross-check):

| Spec invariant | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| 1 — Log faithfulness | no | by-construction | the effect ledger is monotone (flags set once; counters only advance under guard); no mutation/removal action. Append-faithfulness over a real Event Log is a structural surface — a future increment, as undo-history models it. |
| 2 — Position equivalence | no | out-of-scope (named) | not vote-named load-bearing; the model tracks `phase`/`pos` directly rather than deriving from a log + independent replay, so position-equivalence is not modeled (not by-construction); the log-plus-independent-replay equivalence (undo-history.tla's Inv 2 shape) is a future increment. |
| 3 — Compensation pairing | no | by-construction | the model assumes well-formed definitions (every applied step has a compensation available); the [Invalid Definition] pre-run guard is not an interleaving claim. |
| **4 — All-or-compensated** | **yes** | **covered (safety limb)** | `Inv4_AllOrCompensated` + twin `compensable-workflow-skip-comp-buggy` machine-check the *safety* limb (no terminal with an uncompensated escaped effect). *Load-bearing, verified.* The *liveness* limb (an outstanding compensation carried visibly in the non-terminal [Halted] state) and the [Halted] mechanism are out-of-scope (named) — a liveness/operational property the prose + by-construction argument carries, and a safety invariant is the wrong surface for it; a future increment. |
| 5 — Reverse-order compensation | no | by-construction | `CompEffect`'s `IsCompTarget` guard enforces highest-uncompensated-first (LIFO) — enforced, not asserted; flag for promotion if it becomes load-bearing. |
| 6 — Single terminal | no | covered / by-construction | `Inv6_TerminalConsistent` (committed ⇒ all recorded); terminal absorption by construction (no action enabled out of [Committed]/[Compensated]). |
| **7 — Idempotency under retry** | **yes** | **covered** | `Inv7_Idempotent` + twin `compensable-workflow-double-apply-buggy`. *Load-bearing, verified.* Forward-effect retry window modeled; compensation idempotency symmetric/by-construction. |
| 8 — Forward-closed after abort | no | by-construction | `StepEffect`/`StepRecord` guarded `phase = "forward"`; no forward effect lands after `Abort`. |
| 9 — Constituent invariants preserved | no | out-of-scope (constituent) | State Machine and Event Log own invariants are verified in their own models (assume-guarantee); this composition model abstracts them as contracts. |

No GAP rows: both vote-named load-bearing invariants (4, 7) are covered with their own twins. The named out-of-scope rows (2 position-equivalence; 9 constituent) and the by-construction rows are the honest residual — the next formal increment is a log-plus-replay model that promotes Inv 1 (now by-construction) and Inv 2 (now out-of-scope) to covered, the way undo-history's Tier-B extension did.

**Gate-3 disposition (recorded).** The sharp question for this pattern is whether its domain layer earns a canonical composition spec or collapses into the obligation-realization boundary ("declare distributed atomicity; let the projector pick database-transaction / compensable workflow / queue"). Disposition: **it earns a spec.** The boundary carries only the observable ("no partial visible state"); the compensable workflow additionally carries the step-to-compensation pairing, the reverse-order discipline, and the all-or-compensated and idempotency-under-retry invariants — and a compensation is a domain-meaningful recorded act (a refund), not transparent rollback. The honest tension is recorded for the reviewer: the spec's load-bearing content is the *invariants and the external-effect-compensation discipline*; the runner itself is generic and below the contract, exactly as Undo History's replay mechanism is. If a pass shows the domain layer reduces to "declare the obligation and let the projector realize it," this collapses toward a realization-registry entry rather than a composition — to be settled in review.

**Council feedback (draft, pre-foundation) — 2026-06-16.** A council review of the first draft returned a strong assessment (clear decomposition, constituent selection, emergent invariants, and obligation-versus-realization separation all rated highly; low risk of collapsing into the realization registry) with two findings, both classified *refining* and closed in-pattern:

- *F1 — [Halted] versus Invariant 6 (terminal-outcome mismatch).* The draft listed three terminal outcomes ([Committed], [Compensated], [Halted]) while Invariant 6 named only two and then discussed [Halted] — an inconsistency. Resolved by the council's Option B: [Halted] is **not** a terminal outcome but an explicitly-surfaced, *non-terminal holding state* a stalled compensation enters, left by repair-and-retry (`compensating → halted → compensating → compensated`). Invariant 6 now states exactly two terminals; `compensable workflow_halted` is recorded as a phase marker, not a terminal; and Configuration, Action wiring (a retried [Advance] re-runs the stalled compensation from [Halted]), Derivation semantics, Invariant 4, the rejection example, and the Edge case were all reconciled to this reading.

- *F2 — the compensatable / pivot / retriable step taxonomy as an extraction candidate (Pass 2 / EOS).* The council observed that the step taxonomy (Richardson's compensatable / pivot / retriable) does real work and recurs across distributed workflows, so it may be more fundamental than a matter specific to this composition. **Disposition: recorded as a deferred extraction candidate, not extracted.** It appears in a single composition today, which does not meet the composition-layer extraction gate's recurrence bar (Gate 1 counts recurrence at the invariant level across compositions; a single occurrence is not recurrence — [`pressure-testing.md`](../pressure-testing.md) Pass 2 §The composition-layer extraction gate). The promotion trigger: a second composition independently forcing the same step-classification distinction. A note for that future review — a step's compensability class is a property of the step *declaration* and appears to own no state of its own, so Gate 3 likely routes it to a **structural template** (the way *acyclicity / well-foundedness* landed in [`spec-format.md`](../spec-format.md) §Structural-relation invariant templates rather than becoming an atom), not to a new atom. A candidate for the concept-recovery / extraction backlog ([`roadmap.md`](../roadmap.md) §Concept-recovery atom backlog), to be added there when this pattern lands.

**Final Critique — Opus "Happy Torvalds X2" clearance gate (fresh-reader) — 2026-06-16.** A fresh-reader Opus round (Phase 3 final adversarial + Phase 4 readiness gate, merged per [`pressure-testing.md`](../pressure-testing.md) §Round structure and naming) applied the Pass 1/2/3 question sets at X2 depth to the spec and the formal model, re-deriving every judgment and **independently re-running the harness**: correct model PASS at 22 states; both twins rejected; per-invariant teeth re-confirmed with single-`INVARIANT` cfgs (skip-comp violates Inv 4 only; double-apply violates Inv 7 only); saturation re-derived N = 2..6 → 22 / 34 / 48 / 64 / 82, holding at every bound; and reachability probes confirming the [Compensated] terminal, the effect-then-record window, and abort-after-completion are all reachable (the explored states are not all-forward). The reviewer independently re-derived the gate-3 *earns a spec* disposition as sound, and scrutinized the Inv 1 / Inv 2 by-construction/out-of-scope rows for GAPs-in-disguise — confirming they are defensible for a base model (not vote-named load-bearing; monotone ledger; named future-increment path), not gaps. **Verdict: 0 foundational findings — generation-ready, clears the gate at the 92%-good threshold.** Four findings, all closed in-pattern:

- *F-P1-F1 — Intent invariant-citation imprecision — refining → fixed.* The Intent cited State Machine "Invariants 2, 5, 7" for the append-only/total-ordered/replay clause, omitting Invariant 6 (total order); corrected to "2, 5, 6, 7".
- *F-FL-F3 — coverage matrix overstated Inv 4 — refining → fixed.* The Inv 4 row read flatly "covered" though only the *safety* limb is machine-checked; the *liveness* limb (an outstanding compensation carried visibly in the non-terminal [Halted] state) and the [Halted] mechanism are out-of-model-scope. The row now reads "covered (safety limb)" with the liveness limb named out-of-scope — closing the partial-coverage-behind-a-green-check the coverage cross-check exists to surface.
- *F-FL-F4 — matrix/prose label drift on Inv 2 — refining → fixed.* Inv 2 was tagged "supporting / out-of-scope" in the matrix but "by-construction" in the no-GAP summary; reconciled — Inv 2 is not vote-named load-bearing ("no") and is out-of-scope (not modeled, not by-construction), distinct from Inv 1 (by-construction).
- *F-P3-F2 — superlative corpus-state framing — rhetorical → softened.* "First composition past the boundary" / "the first the library carries past…" are present-tense corpus-ordering claims better left to ROADMAP (the no-snapshot rule's spirit); softened to drop "first" while keeping the accurate replay-skip-complement claim.

This round is the merged Phase 3 / Phase 4 closing review (Final Critique 4); with 0 foundational findings it **grounds the pattern** — `grounded on Final Critique 4 — 2026-06-16`. The refinement history preceding it: draft → self-review (GRID / EOS / Linus) → one council round (F1 / F2) → this fresh-reader Opus round.

**Structural milestone.** Crosses the boundary [Undo History](./undo-history.md) names as its breakdown — *external side effects not reversible by replay-skip* — closing that forthcoming reference by naming this composition as the pattern on the other side of it. Second consumer of the sub-atomic compensating-action primitive after Undo History. Sibling of [Execute Gated Workflow](./execute-gated-workflow.md) over the shared State Machine spine (human-approval gating versus failure-compensation). Gives the obligation-realization boundary's *compensable workflow* realization a named composition that specifies what that realization must observably guarantee.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, or rejection taxonomy changed (the invariant count held at nine). (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added after Edge cases (13 terms): 5 Operations — the three composed action-wirings ([Start Workflow], [Advance], [Cancel]) plus the two derived reads ([Position], [Read Log]); 1 Type — the composition's signature [Compensating Action] concept; 2 Fields — the recorded-effect payloads ([Effect Key], [Compensation Ref]); and 5 Members — the terminal outcomes and holding state ([Committed], [Compensated], [Halted]) plus the composition's own rejections ([Invalid Definition], [Step Failed]). **No emergent record store carded:** the composition's own state is entirely a derived index of the Event Log (`compensable workflow_store`, `completed_steps`, `compensation_registry`, `applied_effects`), left as backticked derived-index tokens per the Execution-Contract Composition-state rule. Survivors left backticked: the one labeled projected-contract signature per composed Operation; the qualified constituent calls (State Machine's `fire` / `current_state`, Event Log's `append` / `read`) and the run's event-type wire values (`compensable workflow_started`, `step_completed`, `compensation_run`, `compensation_begun`, `compensable workflow_halted`, `compensable workflow_committed` / `compensable workflow_compensated`); the inherited rejection tokens (`not-known`, `already-terminal`, `invalid-request`, `storage-failure`, `invalid-query`); the step markers (`read-only`, `pivot`) and configuration knobs (`compensation_order`, `on_compensation_failure`); the derived-index tokens; and concrete example ids, steps, and effect keys. Constituent atom names remain the existing full links to `../atoms/*`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), the descriptive top blockquote folded out after confirming each claim (compensating-action pairing, the two-atom composition, eventual all-or-nothing without a distributed transaction, the replay-skip-complement framing, constituents unchanged) is carried by Summary / Intent / Composes; no *also-known-as* line existed, so none was invented (the *Saga* name lives in Standards references). (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #1** — the single-paragraph Summary split into one-idea-per-paragraph units, lossless. (e) **prose cut #5 — skipped (with reason):** the composition owns no emergent fixed state machine of its own — the step states are the State Machine constituent's, deployment-declared per definition; the composition's own phase progression (forward → compensating → [Committed]|[Compensated], with [Halted] a non-terminal holding state) is already stated crisply in Derivation semantics and Invariant 6, so no prose state-machine description needs condensing into a table. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-06-16`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (13 terms); nine composition-level invariants preserved; the `.tla` models untouched — harness re-run green: `compensable-workflow.tla` PASS + both buggy twins (`compensable-workflow-skip-comp-buggy`, `compensable-workflow-double-apply-buggy`) rejected under `--buggy`.

</details>
