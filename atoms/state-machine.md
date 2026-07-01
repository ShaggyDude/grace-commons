---
title: State Machine
parent: Atomic Concepts
has_toc: true
toc: true
---

# State Machine

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>

## Summary

State Machine records a single named process instance — think of it as a token moving through a flowchart — where the flowchart (the set of valid states and the transitions between them) is declared by the system deploying it rather than fixed by this atom.

When the instance is created, the deployer provides the complete map: every state, every allowed move between states (each move is a named action, optionally gated by a condition the calling system must assert is satisfied), the starting state, and any states that are permanent endpoints. From that moment forward the map is frozen — it cannot be changed for this instance.

The atom then enforces three guarantees for the lifetime of the instance: only declared moves are allowed (an undeclared move is refused); exactly one current state exists at all times; and every move that succeeds is recorded permanently, in order, with enough context to replay the full history and arrive at the current state.

These guarantees make the system useful for regulated processes (a pharmaceutical batch that must prove it moved only through the approved sequence of quality-control states) and for any process where you need an unambiguous, auditable record of what happened and in what order. This atom is the general pattern; [Approval Step](./approval-step.md) is one specific kind of state machine with its states and rules fixed in advance, whose instances do not need their own declaration.

---

## Intent

Many real-world processes move an entity through a defined sequence of states: a pharmaceutical batch advances from *sampled* through *tested* through *qualified* through *released*; a purchase order advances from *draft* through *submitted* through *approved* through *fulfilled*; a software change request advances from *open* through *in-review* through *merged* through *deployed*. In each case the valid state transitions are known in advance, the order in which they fire must be recorded and auditable, and the current state must be unambiguously knowable at any moment. These processes recur across virtually every regulated and non-regulated domain; the structure that governs them is the same structure in all of them: a named entity, a finite declared set of states, a declared set of transitions, and a durable history of which transitions have fired and in what order.

The core problem is that different deployments need different state machines. A pharmaceutical batch-release workflow has states and transitions governed by 21 CFR (Code of Federal Regulations — the codification of US federal agency rules) Part 11 and ISO (International Organization for Standardization) 9001 §8.5.1. An HL7 (Health Level Seven — an international standards organization for healthcare data exchange) FHIR (Fast Healthcare Interoperability Resources — a standard for exchanging healthcare information) Task resource has its own lifecycle (`requested → accepted → in-progress → completed | failed | cancelled`). A BPMN (Business Process Model and Notation — an international standard for modeling business processes) workflow diagram has states and transitions that vary by process type. Writing a separate atom for each is not feasible; the commonality is the pattern of declared-finite-state-machine enforcement, not the particular states or transitions. This atom captures that pattern.

State Machine is the specification of the declared-state-machine structure. It records: what states and transitions were declared for this instance; what the instance's current state is; and every transition that has ever fired, in order, with attribution. It enforces: that only declared transitions fire; that exactly one current state exists at all times; that terminal states are absorbing; that the transition history is append-only and total-ordered; and that any caller-asserted guard obligation is gated before a guarded transition fires. It does not evaluate guard predicates (that is the caller's responsibility), does not attribute transitions to identities in a non-repudiable way (that is [Actor Identity](./actor-identity.md)'s responsibility), does not cryptographically protect the history (that is [Tamper Evidence](./tamper-evidence.md)'s responsibility), and does not govern retention of the history (that is [Retention Window](./retention-window.md)'s responsibility).

The atom is structurally distinct from three adjacent concepts, and the distinctions are load-bearing:

**State Machine vs. Approval Step.** [Approval Step](./approval-step.md) is a *specific* state machine whose states are fixed by the atom (Pending, Approved, Rejected, Withdrawn), whose transitions are fixed by the atom (submit, approve, reject, withdraw), and whose semantics are fixed by the atom (exactly one named approver; submitter exclusivity on withdrawal; required reason on rejection). Approval Step is fully specified at the atom level — external evaluators know the states and their semantics without consulting any deployment configuration. State Machine is the *general* case: the states and transitions are declared by the deployment at instantiation and are opaque to the atom. An Approval Step carries approval-specific semantics (approver exclusivity, decision attribution requirements, decision completeness as a compliance invariant); State Machine carries none of those — it carries the declared-machine-enforcement invariants that apply to any finite state machine regardless of what the states mean. Both are freestanding atoms. They compose into [Execute Gated Workflow](../compositions/execute-gated-workflow.md) (`grounded` 2026-06-04), where a State Machine instance governs the overall process lifecycle while Approval Step instances govern the gate transitions within it.

**State Machine vs. Event Log.** [Event Log](./event-log.md) is an append-only sequence of immutable events with no notion of declared states, declared transitions, current state, or transition validity. Event Log records what happened; State Machine enforces what is allowed to happen and tracks the resulting state. The transition history in this atom resembles an Event Log structurally (append-only, total-ordered by sequence number, `sequence_number` is the order source, `fired_at` is best-effort wall time) but the load-bearing concept here is declared-transition enforcement — only declared transitions fire, and current state is always derivable by replaying the history. Event Log provides no declared-transition gate; this atom does. This atom is freestanding and does not name Event Log. Tamper-evident preservation of the transition history is an obligation of a composing Audit Trail; event-log-substrate composition is an obligation of the Execute Gated Workflow composition.

**State Machine vs. Approval Step (conceptual boundary, restated precisely).** Approval Step's state machine is fully determined by the atom specification; no deployment configuration is needed for an external evaluator to know the valid states and transitions. This atom's state machine is fully determined by the deployment declaration supplied at instantiation; an external evaluator must read the declaration to know the valid states and transitions for a given instance. The specificity axis is the load-bearing distinction: Approval Step is specification-level; State Machine is instance-level.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It carries its own state (the instance set, the declaration per instance, the current state per instance, the transition history per instance), its own actions (`instantiate`, `fire`, `current`, `history`, `read_declaration`), and its own invariants (declaration immutability, exactly one current state, only-declared-transitions, terminal absorption, history append-only and complete, history total order, replay determinism, guard-gating without evaluation, transition attribution, instance store durability). Composing patterns add non-repudiable attribution, tamper evidence, retention governance, guard evaluation, approval gates, permissions checks, and multi-actor orchestration.

---

## Structure

### Store instance model

The State Machine atom operates against a named store instance. A `store_name` identifies the instance; multiple store instances coexist in real systems — one per organizational domain, one per regulated process type, one per deployment environment, depending on topology. [Instance Id] values are unique within a store instance; uniqueness across store instances is a composing concept. The same [Subject Ref] (an opaque reference to the entity whose lifecycle this workflow governs) may appear in multiple simultaneous workflow instances within the same store — one per distinct workflow process. Calls implicitly target a single routed store instance; instance selection is handled at the deployment-routing layer, not defined by this atom.

### Identity model

Each workflow instance has an opaque, immutable, system-generated [Instance Id] — assigned on [Instantiate], never reused, never reassigned within the store instance. It must be a non-empty string sortable in lexicographic byte-order; this property is required for deterministic [History] ordering. The [Instance Id] is the workflow instance's identity; the [Declaration], the [Current State], and the [Transition History] are properties of the instance, not its identity.

Each entry in a workflow instance's transition history has an opaque, immutable, system-generated [Transition Id] — assigned when [Fire] records the transition, never reused, never reassigned within the instance. It must be a non-empty string. The [Transition Id] is the history entry's identity.

[Subject Ref] is an optional opaque reference to the entity whose lifecycle this workflow governs — a batch id, a document id, a transaction id, a work item id. Set on [Instantiate], immutable. The atom does not validate that the subject exists or is in any particular state; [Subject Ref] is the caller's responsibility. Its absence is valid; if supplied, it must contain at least one non-whitespace character.

[Instance Metadata] is an optional opaque payload (caller-supplied at [Instantiate]) providing deployment context. Set on [Instantiate], immutable. The atom does not interpret it; it records it as an auditable field. If supplied, it must be non-null and non-empty.

### The declaration

The [Declaration] is the immutable map that governs a workflow instance. It is supplied in full at [Instantiate] and never changes thereafter. Every enforcement decision the atom makes — whether a transition is valid, whether a terminal state blocks a [Fire], whether a guard must be asserted — is derived from this [Declaration].

The [Declaration] contains the following fields:

- **[States]** — a non-empty set of named states. Each state name must contain at least one non-whitespace character. State names within the declaration must be unique (no duplicate names within the same declaration).
- **[Transitions]** — a set of declared transitions, each carrying `{from_state, action, to_state, guard?}` where [From State] and [To State] must both be members of [States], [Action] is a non-empty-string named trigger, and [Guard] is an optional opaque guard label (a non-empty string naming the condition the caller must assert is satisfied before this transition fires; the atom does not evaluate the guard predicate — guard evaluation is the caller's obligation). At most one declared transition may share the same `(from_state, action)` pair; duplicate `(from_state, action)` pairs are rejected at [Instantiate] as an invalid declaration. This is the determinism constraint: given the current state and a named action, at most one declared transition matches.
- **[Initial State]** — a member of [States]. The instance's current state on creation. Must be a non-terminal state — an instance whose initial state is already terminal would accept no transitions and is rejected at [Instantiate] as an invalid declaration.
- **[Terminal States]** — a subset of [States] (possibly empty). States in this set are absorbing: once the instance's current state is a terminal state, no [Fire] succeeds. No declared transition may have a [From State] in [Terminal States]; any such declaration is rejected at [Instantiate] as an invalid declaration.

### Inputs and Outputs

**Inputs:**

- [Instantiate] calls from deployers and process-orchestration systems, each carrying a complete [Declaration], an optional [Actor Ref], optional [Instance Metadata], and an optional [Instantiated At] timestamp.
- [Fire] calls from process actors, automated workflow engines, and orchestration systems, each carrying an [Instance Id], an [Action] name, an optional [Actor Ref], an optional [Guard Satisfied] flag, and an optional [Fired At] timestamp.
- [Current] queries from process actors and dashboards, carrying an [Instance Id].
- [History] queries from auditors, investigators, and composing systems, carrying an [Instance Id] and an optional query filter.
- [Read Declaration] queries from deployers, auditors, and composing systems, carrying an [Instance Id].

**Outputs:**

- For [Instantiate]: a fresh [Instance Id], or a rejection naming the failed precondition.
- For [Fire]: the `new_state` the instance has transitioned to, or a rejection naming the failed precondition.
- For [Current]: the current state name as a string, or a rejection.
- For [History]: a (possibly empty) ordered sequence of transition history entries. Each entry carries: [Transition Id], [Sequence Number], [From State], [To State], [Action], [Actor Ref] (if supplied at the firing [Fire] call), [Fired At], and [Guard Satisfied] (true if the transition carried a [Guard] label and the caller asserted `guard_satisfied = true`; absent if the transition had no guard).
- For [Read Declaration]: the immutable [Declaration] as supplied at [Instantiate], or a rejection.

### State

Each workflow instance is in exactly one state drawn from its declared [States] at all times.

**Instance-level state per workflow instance:**

- **[Current State]** — the current state name; a member of the instance's declared [States]. Set to [Initial State] on [Instantiate]. Updated to the [To State] of the most recently fired declared transition on each successful [Fire]. Invariant: exactly one value; always a member of [States].
- **[Transition History]** — the ordered append-only sequence of transition history entries for this instance. Begins empty at [Instantiate]. Each successful [Fire] appends exactly one entry. Never shrinks.
- **[Next Sequence Number]** — the sequence number the next [Fire] will assign to its history entry. Begins at 1 for a fresh instance. Increments by 1 on each successful [Fire]. Part of the instance's persistent state — durable implementations must preserve it across restarts to maintain sequence-number monotonicity (see Event Log's discipline, mirrored here). Volatile implementations that reset to 1 on restart violate this atom's History total-order invariant across the lifetime of the instance.

**Store-level state:**

- **`instances`** — the set of all known [Instance Id]s and their associated declarations, current states, transition histories, and [Next Sequence Number] counters. Append-only at the instance granularity: no instance is removed. Transition history within each instance is also append-only. Instance state ([Current State]) changes on successful [Fire].

There is no delete or edit surface. Once an instance is created, it remains. Once a history entry is written, it remains.

### Actions

For optional parameters in all actions, "supplied" means provided as a parseable value of the declared type. Null, missing, and empty (or whitespace-only) values are equivalent to "not supplied," and the action's documented default applies.

- **[Instantiate]** — (Projected contract: `instantiate(declaration, [actor_ref], [instance_metadata], [instantiated_at]) → instance_id | rejected(invalid-declaration | invalid-request | storage-failure)`) — validate the declaration's well-formedness, create a new workflow instance in [Initial State], and record the genesis.

  Declaration validation checks (all failures are [Invalid Declaration]):
  - [States] is non-empty.
  - Every state name in [States] contains at least one non-whitespace character.
  - State names within [States] are unique (no duplicates).
  - [Initial State] is a member of [States].
  - [Initial State] is not a member of [Terminal States].
  - Every declared transition's [From State] and [To State] are members of [States].
  - No declared transition has a [From State] in [Terminal States].
  - No two declared transitions share the same `(from_state, action)` pair.
  - Every declared transition's [Action] contains at least one non-whitespace character.
  - Every declared transition's [Guard] label, if present, contains at least one non-whitespace character.

  If the declaration is well-formed: assigns a fresh [Instance Id] and [Next Sequence Number] = 1; records [Current State] = [Initial State]; records [Instance Metadata] (if supplied); records [Instantiated At] (wall clock if not supplied; must not be in the future — an instance cannot be declared in the future; violation is [Invalid Request]); records [Actor Ref] (if supplied; must contain at least one non-whitespace character — violation is [Invalid Request]); sets [Transition History] to empty.

  [Storage Failure] if the store write fails after all preconditions pass; no [Instance Id] is issued and no record enters the store. Rejection priority: [Invalid Declaration] on any declaration defect → [Invalid Request] on [Actor Ref] or [Instantiated At] violations → [Storage Failure].

- **[Fire]** — (Projected contract: `fire(instance_id, action, [actor_ref], [guard_satisfied], [fired_at]) → new_state | rejected(not-known | terminal | invalid-transition | guard-not-satisfied | invalid-request | storage-failure)`) — look up the unique declared transition from the instance's current state matching [Action]; if found and all preconditions are met, append one immutable history entry and advance [Current State] to the transition's [To State].

  The [Instance Id] and [Action] parameters must each contain at least one non-whitespace character ([Invalid Request]); a null, empty, or whitespace-only value for either is malformed and rejected before any existence check is performed.

  [Actor Ref], if supplied, must contain at least one non-whitespace character ([Invalid Request]). [Fired At], if supplied, must not be in the future ([Invalid Request]). The resolved [Fired At] — whether caller-supplied or wall-clock-defaulted — must be ≥ the instance's [Instantiated At]; a value that is less is [Invalid Request] (a transition cannot be recorded as occurring before the instance existed — the within-instance bound analogous to Approval Step's `decided_at ≥ submitted_at`). The atom does **not** enforce monotonicity of [Fired At] across history entries: under a skewing or non-monotonic clock a later transition may legitimately carry an earlier [Fired At] than its predecessor. [Sequence Number], not [Fired At], is the authoritative order source, mirroring Event Log's best-effort wall-time discipline (Invariant 6).

  If all parameter checks pass: look up the instance ([Not Known] if no instance with this [Instance Id] exists). Check whether [Current State] is a terminal state ([Terminal] if yes — no transition out of a terminal state is permitted). Look up the declared transition matching `(current_state, action)` ([Invalid Transition] if no such transition is declared). If the matched transition carries a [Guard] label: the transition fires only if [Guard Satisfied] is supplied as `true` ([Guard Not Satisfied] if [Guard Satisfied] is absent or not `true`).

  On success: increment [Next Sequence Number]; append one immutable history entry with fields [Transition Id] (fresh opaque id), [Sequence Number] (the prior [Next Sequence Number] — i.e., the value before incrementing), [From State] (prior [Current State]), [To State] (the transition's [To State]), [Action] (the named trigger), [Actor Ref] (as supplied, or absent if not supplied), [Fired At] (resolved value), [Guard Satisfied] (true if the transition carried a [Guard] and the caller asserted it — absent if the transition had no guard); set [Current State] = [To State]. Return `new_state = to_state`.

  Rejection priority: malformed [Instance Id] or [Action] ([Invalid Request]) → [Not Known] → [Terminal] → [Invalid Transition] → [Guard Not Satisfied] → attribution/temporal ([Invalid Request]) → [Storage Failure].

  [Storage Failure] leaves the instance in its prior state with no history entry written and [Next Sequence Number] unchanged; the caller must retry.

- **[Current]** — (Projected contract: `current(instance_id) → current_state | rejected(not-known | invalid-request)`) — return the instance's current state name. The [Instance Id] parameter must contain at least one non-whitespace character ([Invalid Request]). [Not Known] if no instance with this [Instance Id] exists. Returns the [Current State] string.

- **[History]** — (Projected contract: `history(instance_id, [query]) → ordered_sequence_of_transitions | rejected(not-known | invalid-query | invalid-request)`) — return the instance's transition history matching the query, ordered by [Sequence Number] ascending.

  The [Instance Id] parameter must contain at least one non-whitespace character ([Invalid Request]). [Not Known] if no instance with this [Instance Id] exists.

  The supported filter axes are exactly: [Transition Id], [Sequence Number] (range), [From State], [To State], [Action], [Actor Ref], and time ranges on [Fired At]. A time range filter on [Fired At] takes the form `{after: <timestamp>, before: <timestamp>}` with both sub-keys optional; `after` is an inclusive lower bound and `before` is an inclusive upper bound. Filter keys are flat strings, not dot-notation paths. Any combination of supported axes is valid.

  A [From State], [To State], [Action], or [Actor Ref] filter value that is null, empty, or whitespace-only is [Invalid Query]. A [Sequence Number] range with end before start is [Invalid Query]. A [Fired At] time range with end before start is [Invalid Query]. A [Transition Id] filter value that is null, empty, or whitespace-only is [Invalid Query]. A query carrying an unrecognized filter key — any key outside the supported axes named above — is [Invalid Query]; an unrecognized key is rejected rather than silently ignored, because silent ignore would return a result set inconsistent with the caller's intent.

  A well-formed query matching no transitions returns an empty sequence, not a rejection. A query with no filters returns the full history in [Sequence Number] ascending order.

- **[Read Declaration]** — (Projected contract: `read_declaration(instance_id) → declaration | rejected(not-known | invalid-request)`) — return the immutable [Declaration] as supplied at [Instantiate]. The [Instance Id] parameter must contain at least one non-whitespace character ([Invalid Request]). [Not Known] if no instance with this [Instance Id] exists. The returned [Declaration] is the exact declaration as supplied; no fields are normalized or reordered.

### Flow

**Example: ISO 9001 batch qualification workflow.**

A pharmaceutical manufacturer declares a three-state batch qualification workflow:

```
states: {sampled, testing, released}
transitions: [
  {from: sampled, action: begin-testing, to: testing},
  {from: testing, action: release, to: released, guard: "QP-sign-off"},
  {from: testing, action: reject-batch, to: rejected}
]
initial_state: sampled
terminal_states: {released, rejected}
```

Note that the `rejected` state appears as a transition target but was not listed in [States]; the [Instantiate] call therefore returns `rejected(invalid-declaration)`. The declaration is corrected:

```
states: {sampled, testing, released, rejected}
transitions: [
  {from: sampled, action: begin-testing, to: testing},
  {from: testing, action: release, to: released, guard: "QP-sign-off"},
  {from: testing, action: reject-batch, to: rejected}
]
initial_state: sampled
terminal_states: {released, rejected}
```

1. **Instantiate.** `instantiate(declaration, actor_ref: "system-planner")` → `instance_id: "wf-batch-0044"`. The instance enters `sampled`.
2. **Begin testing.** `fire("wf-batch-0044", action: "begin-testing", actor_ref: "lab-tech-rivera")` → `new_state: "testing"`. The history records one entry: `{from: sampled, to: testing, action: begin-testing, seq: 1}`.
3. **Attempt release without asserting guard.** `fire("wf-batch-0044", action: "release", actor_ref: "qp-director-santos")` → `rejected(guard-not-satisfied)`. The `release` transition requires `guard: "QP-sign-off"` to be asserted. No history entry is written; current state remains `testing`.
4. **Release with guard asserted.** `fire("wf-batch-0044", action: "release", actor_ref: "qp-director-santos", guard_satisfied: true)` → `new_state: "released"`. The history records a second entry: `{from: testing, to: released, action: release, seq: 2, guard_satisfied: true}`. The instance is now in a terminal state.
5. **Attempt further transition.** `fire("wf-batch-0044", action: "begin-testing")` → `rejected(terminal)`. The instance is in `released`, a terminal state.
6. **Audit query.** `history("wf-batch-0044")` returns the two-entry sequence in `sequence_number` order: the `begin-testing` transition and the `release` transition. The regulator can confirm the batch moved only through declared, valid states in the declared order.

### Decision points

- **At [Instantiate]** — declaration validation runs first and is comprehensive (see Actions above); any defect is [Invalid Declaration]. If the declaration is valid, [Actor Ref] and [Instantiated At] are checked ([Invalid Request] on violations). [Storage Failure] on store-write failure with no [Instance Id] issued. Rejection priority: [Invalid Declaration] → [Invalid Request] → [Storage Failure].

- **At [Fire]** — [Instance Id] and [Action] are checked first for well-formedness (null, empty, or whitespace-only is [Invalid Request] before any store lookup). The store is consulted: [Not Known] if the instance does not exist. The [Current State] is checked against [Terminal States]: [Terminal] if the current state is terminal. The declared transitions for [Current State] are scanned for a transition matching [Action]: [Invalid Transition] if no match. If the matched transition carries a [Guard] label: the transition fires only if `guard_satisfied = true` is asserted by the caller ([Guard Not Satisfied] if not). Attribution and temporal checks follow: [Actor Ref] (if supplied) must contain at least one non-whitespace character; [Fired At] (resolved) must not be in the future and must be ≥ the instance's [Instantiated At] (a transition cannot predate instantiation). [Fired At] is not required to be monotonic across entries — [Sequence Number] is the order source. [Storage Failure] on store-write failure; no entry written; no state change. Rejection priority: malformed [Instance Id] or [Action] ([Invalid Request]) → [Not Known] → [Terminal] → [Invalid Transition] → [Guard Not Satisfied] → attribution/temporal ([Invalid Request]) → [Storage Failure].

- **At [Current]** — [Instance Id] must be non-whitespace ([Invalid Request]). [Not Known] if the instance does not exist. Returns [Current State].

- **At [History]** — [Instance Id] must be non-whitespace ([Invalid Request]). [Not Known] if the instance does not exist. Filter values are checked for well-formedness (empty/whitespace-only values for string axes are [Invalid Query]; malformed ranges are [Invalid Query]; unrecognized keys are [Invalid Query]). A well-formed query matching no transitions returns an empty sequence.

- **At [Read Declaration]** — [Instance Id] must be non-whitespace ([Invalid Request]). [Not Known] if the instance does not exist.

### Behavior

- **Instances are durable on success.** Once [Instantiate] returns an [Instance Id], the instance is in the store, its [Declaration] is set and immutable, and it will appear in subsequent [Current] and [History] queries.

- **[Fire] is not idempotent.** Two [Fire] calls with the same `(instance_id, action)` pair (where both are otherwise valid) will both succeed if the declared transition is still available — the first advances [Current State] to [To State], and the second will look up the declared transitions from [To State]. A second call with the same [Action] from a different state may succeed, fail with [Invalid Transition], or fail with [Terminal], depending on the declaration. For at-most-once semantics under retry conditions, the calling system must supply its own idempotency key; this atom does not provide one.

- **Guard enforcement is a gate, not an evaluation.** When a declared transition carries a [Guard] label, the atom enforces that the caller must assert `guard_satisfied = true` before the transition fires. The atom does not evaluate whether the guard condition is actually true in the external world — that is the caller's obligation. The history records that the guard was asserted satisfied (`guard_satisfied: true` in the entry), not that the underlying predicate was evaluated by the atom. A caller that asserts `guard_satisfied = true` without actually evaluating the predicate is violating the declared process semantics; the atom records the assertion faithfully regardless. Guard evaluation correctness is a calling-system obligation.

- **Declared-transition enforcement is strict.** A [Fire] call with an [Action] that has no declared transition from the current state is always [Invalid Transition]. There is no fallback, no wildcard transition, and no "any action" surface. The atom enforces exactly what was declared at instantiation.

- **Terminal states are absorbing.** A [Fire] call on an instance whose [Current State] is in [Terminal States] is always [Terminal]. There is no re-open, re-activate, or post-terminal transition surface. The declaration may not name transitions out of terminal states (enforced at [Instantiate]). A process that requires post-terminal behavior must model that behavior in the declaration as a non-terminal state, or the calling system must instantiate a new workflow instance.

- **History is append-only.** The transition history only grows. Each successful [Fire] appends one entry. No history entry is ever removed or modified. An unfiltered [History] query at time `t2 > t1` returns every entry visible at `t1` plus any added between `t1` and `t2`.

- **[Current State] is replay-deterministic.** The [Current State] at any moment equals the [To State] of the history entry with the highest [Sequence Number], or [Initial State] if no entry exists. Any implementation that correctly replays the history in [Sequence Number] order will arrive at the correct [Current State].

### Feedback

- After [Instantiate] — a new instance exists; [Instance Id], [Current State] (= [Initial State]), the immutable [Declaration], and [Next Sequence Number] = 1 are set.
- After [Fire] — the instance's [Current State] is updated to `new_state`; one history entry is appended with the full transition record; [Next Sequence Number] is incremented.
- After [Current] — the current state string is returned; no state changes.
- After [History] — an ordered sequence of transition history entries matching the query is returned; no state changes.
- After [Read Declaration] — the immutable [Declaration] is returned; no state changes.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Declaration immutability.** After a successful [Instantiate], the fields [States], [Transitions], [Initial State], and [Terminal States] comprising the [Declaration] never change, regardless of any subsequent action on the instance. [Read Declaration] returns the exact [Declaration] as supplied at [Instantiate] at any point in the instance's lifetime.

- **Invariant 2 — Exactly one current state.** At all times, every known workflow instance has a [Current State] that is exactly one member of its declared [States]. The [Current State] is never absent, never null, and never a value not in the instance's declared [States].

- **Invariant 3 — Only-declared-transitions fire.** Every successful [Fire] corresponds to exactly one declared transition `{from_state = prior current_state, action = the named trigger, to_state = new_state}` that is present in the instance's declaration. A [Fire] call whose [Action] has no declared transition from the current state is rejected [Invalid Transition] and changes no state and produces no history entry. The determinism constraint (at most one declared transition per `(from_state, action)` pair, enforced at [Instantiate]) ensures the matched transition, if any, is unique.

- **Invariant 4 — Terminal absorption.** Once [Current State] is a member of [Terminal States], no [Fire] succeeds; the instance remains in that terminal state permanently. No declared transition may have a [From State] in [Terminal States] (enforced at [Instantiate]). Terminal states are absorbing: they have no outgoing transitions by construction and by enforcement.

- **Invariant 5 — History append-only and complete.** Every successful [Fire] appends exactly one immutable history entry to the instance's [Transition History]. No history entry is ever removed or modified. The count of history entries is monotonically non-decreasing. An instance with no successful [Fire] calls has an empty history; an instance with N successful [Fire] calls has exactly N history entries.

- **Invariant 6 — History total order.** History entries within an instance have strictly increasing [Sequence Number] values. No two entries share a [Sequence Number]. The [Sequence Number] is the total-order source for the history; [Fired At] is best-effort wall time only. An implementation that resets [Next Sequence Number] to 1 on restart without persisting the counter violates this invariant across the lifetime of the instance, producing two entries with `sequence_number = 1`. The [Next Sequence Number] counter is part of the instance's persistent state and must survive restarts.

- **Invariant 7 — Replay determinism.** The [Current State] of an instance equals the [To State] of the history entry with the highest [Sequence Number], or [Initial State] if no entry exists. Replaying the history in [Sequence Number] order from the beginning — starting at [Initial State], applying each entry's [To State] in sequence — produces the [Current State]. The history is a gap-free record from which [Current State] is always derivable without consulting any mutable field.

- **Invariant 8 — Guard-gating without evaluation.** A declared transition carrying a [Guard] label fires only if the caller asserts `guard_satisfied = true`; the atom enforces the gate but does not evaluate the guard predicate. The history entry for a guarded transition records `guard_satisfied: true`, attesting that the caller asserted the guard was satisfied at the time of the [Fire] call. A [Fire] call on a guarded transition that does not assert `guard_satisfied = true` is rejected [Guard Not Satisfied] and produces no history entry. The atom does not check whether the asserted guard condition is actually satisfied in the external world; that is the caller's obligation.

- **Invariant 9 — Transition attribution completeness.** Every history entry carries [Transition Id], [Sequence Number], [From State], [To State], [Action], and [Fired At] — each set and non-null. [Actor Ref], if supplied on the [Fire] call, is present in the entry and contains at least one non-whitespace character; [Actor Ref] is absent from the entry if not supplied on the [Fire] call. The entry is complete for forensic replay regardless of whether [Actor Ref] was supplied; [Actor Ref] presence is deployment policy, not atom-level mandate.

- **Invariant 10 — Instance store durability.** No workflow instance or history entry is removed from the store. The total instance count is monotonically non-decreasing. A [Storage Failure] response on [Fire] guarantees that no partial history entry was written and that the instance's [Current State] and [Next Sequence Number] are unchanged. A [Storage Failure] response on [Instantiate] guarantees that no partial instance record was written and no [Instance Id] was issued.

---

## Examples

### Happy path — ISO 9001 batch qualification

See Flow section. A complete two-transition arc is walked there: instantiation with a declaration validation failure (to illustrate [Invalid Declaration]), re-instantiation with the corrected declaration, `begin-testing` firing, a `release` rejection due to unasserted guard, a `release` success with guard asserted, a [Terminal] rejection on post-terminal [Fire], and a final audit [History] query.

### Rejection path — undeclared transition

A workflow instance `"wf-po-0199"` is currently in state `"draft"`. The declaration for this instance does not include a transition from `draft` with action `"approve"` (approval happens only from `"submitted"`, not `"draft"`). A workflow engine with a routing bug calls `fire("wf-po-0199", action: "approve")` → `rejected(invalid-transition)`. No history entry is written; [Current State] remains `"draft"`. The workflow engine logs the rejection and routes to the correct action (`"submit"` from `"draft"` before `"approve"` from `"submitted"`).

### Rejection path — guard not asserted

A workflow instance `"wf-cr-0055"` has a declared transition `{from: in-review, action: merge, to: merged, guard: "two-approver-sign-off"}`. The automation engine calls `fire("wf-cr-0055", action: "merge", actor_ref: "ci-bot")` without setting [Guard Satisfied] → `rejected(guard-not-satisfied)`. The engine checks whether two approvals have been recorded by the composing Approval Step layer, records both, and retries: `fire("wf-cr-0055", action: "merge", actor_ref: "ci-bot", guard_satisfied: true)` → `new_state: "merged"`. The history entry records `guard_satisfied: true`. The atom does not re-verify the two-approver condition; the engine's assertion is the gate.

### Rejection path — invalid declaration (duplicate from-action pair)

A deployment attempts to declare a non-deterministic state machine: the declaration includes both `{from: pending, action: decide, to: approved}` and `{from: pending, action: decide, to: rejected}`. `instantiate(declaration)` → `rejected(invalid-declaration)`. The `(from_state: "pending", action: "decide")` pair is declared twice; the declaration is non-deterministic and the atom will not instantiate it. The deployer must model the decision through distinct action names (`decide-approve` and `decide-reject`) or through a branching state that uses different action names for each branch.

### Rejection path — fire with whitespace-only action

`fire("wf-batch-0044", action: "   ")` → `rejected(invalid-request)`. Whitespace-only [Action] is malformed. No store lookup is performed; no state changes.

### Multi-instance independence

Two instances `"wf-batch-0044"` and `"wf-batch-0045"` are both instantiated with the same batch-qualification declaration. Firing a transition on `"wf-batch-0044"` has no effect on `"wf-batch-0045"`. Each instance has its own [Current State], its own [Transition History], and its own [Next Sequence Number]. `history("wf-batch-0044")` returns only the transitions fired on that instance; `history("wf-batch-0045")` returns only the transitions fired on that instance.

---

## Regulated adversarial scenarios

### Regulator audit — FDA 21 CFR Part 11 / ISO 9001 §8.5.1: declared-transition compliance

An FDA (US Food and Drug Administration) inspector auditing a pharmaceutical manufacturer's batch release process under 21 CFR Part 11 and ISO 9001 §8.5.1 demands evidence that batch `BR-2026-0412` moved only through the manufacturer's declared quality-control states in the declared order, and that the qualified-person sign-off gate was enforced before the release transition fired.

The inspector queries `history("wf-batch-BR-2026-0412")` and receives the full transition history in [Sequence Number] order. Invariant 5 (history append-only and complete) guarantees every transition that fired is recorded. The inspector then queries `read_declaration("wf-batch-BR-2026-0412")` to recover the immutable [Declaration]. Invariant 1 (declaration immutability) guarantees this declaration is exactly as declared at instantiation — the manufacturer cannot have added or removed states after the fact. The inspector cross-references each history entry against the declaration: every `{from_state, action, to_state}` triple in the history must correspond to a declared transition (Invariant 3 — only-declared-transitions). The release entry carries `guard_satisfied: true`, confirming the qualified-person sign-off gate was asserted (Invariant 8 — guard-gating without evaluation). The forensic question of whether the qualified person actually signed off is answered by composition with [Actor Identity](./actor-identity.md); the State Machine records that the gate was asserted satisfied.

The inspector's structural questions — *did the batch move only through declared states?* and *was the release gate enforced?* — are answered from the records alone, with no recourse to source code, runbooks, or developer narration.

### Disputed transition — external party claims the workflow skipped a required state

A contract manufacturer disputes that purchase order `PO-2026-0551` was properly processed: they claim the order moved directly from `submitted` to `fulfilled` without passing through `approved`, bypassing the required approval gate. The composing system queries `history("wf-po-PO-2026-0551")` and returns the full transition history in sequence order.

The history shows three entries: (1) `{from: draft, to: submitted, seq: 1}`; (2) `{from: submitted, to: approved, seq: 2}`; (3) `{from: approved, to: fulfilled, seq: 3}`. The declaration (returned by [Read Declaration]) has no declared transition from `submitted` directly to `fulfilled`; such a [Fire] call would have been rejected [Invalid Transition] and produced no entry. Invariants 3 (only-declared-transitions) and 7 (replay determinism) together constitute the structural rebuttal: no transition fires without a corresponding declared transition from the current state, and the history is the complete record of every transition that fired. The dispute cannot be sustained against the structural record: if the `submitted → approved` step had not occurred, no `approved → fulfilled` step would have been reachable.

The question of whether the actor who fired the `approved → fulfilled` transition was authorized to do so is answered by composition with [Permissions](./permissions.md) and [Actor Identity](./actor-identity.md); this atom records that the transition fired and who asserted it.

### Breach or incident investigation — reconstructing the anomaly window

During a security incident investigation, the incident response team needs to determine whether any workflow instances in the order-management system were driven through unauthorized state transitions during a suspected credential-compromise window (2026-05-01T00:00:00Z through 2026-05-03T23:59:59Z). The team queries [History] for all relevant instances with a [Fired At] range filter: `history("wf-po-{id}", query: {fired_at: {after: "2026-05-01T00:00:00Z", before: "2026-05-03T23:59:59Z"}})` for each instance of interest.

For each transition entry in the window, the team cross-references the entry's `{from_state, action, to_state}` against the instance's declaration ([Read Declaration]) to confirm the transition was declared. Invariant 3 guarantees every entry in the history corresponds to a declared transition — the history cannot contain an undeclared transition, because undeclared [Fire] calls are rejected and produce no entries. The team then inspects [Actor Ref] values in the window entries and routes suspicious actor references to the composing [Actor Identity](./actor-identity.md) investigation to determine whether the referenced actors' credentials were compromised.

Invariant 6 (history total order, strictly increasing [Sequence Number]) gives the team a clock-independent ordering of every transition within each instance, bounding the anomaly window precisely. The forensic question — *which transitions fired, in what order, by which asserted actors, during the window?* — is answered from the records alone.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Declaration immutability check.** For a known [Instance Id], call [Read Declaration] at time `t1` and record the returned declaration. Fire one or more transitions on the instance. Call [Read Declaration] again at `t2 > t1`. Confirm the two declarations are identical in every field ([States], [Transitions], [Initial State], [Terminal States]). Any difference between the two declarations is a conformance failure under Invariant 1. This check must be run after at least one [Fire] call has succeeded, to confirm that transitions do not mutate the declaration.

2. **Only-declared-transitions check.** For a known [Instance Id] with a known declaration, attempt a [Fire] call with an [Action] that has no declared transition from the instance's current state. Confirm the call returns `rejected(invalid-transition)` and that `current(instance_id)` returns the same state as before the call. Then attempt a [Fire] call with a declared transition's [Action] from the current state. Confirm the call returns `new_state` equal to the declared transition's [To State]. Confirm `current(instance_id)` returns that [To State]. Invariant 3 guarantees this behavior; the check verifies it.

3. **Terminal absorption check.** Drive a workflow instance to a terminal state. Confirm `current(instance_id)` returns a state in [Terminal States]. Attempt [Fire] with any action (including actions that were valid from prior non-terminal states). All calls must return `rejected(terminal)`. Confirm `current(instance_id)` is unchanged after each attempted transition. Confirm `history(instance_id)` shows no new entry was appended. Invariant 4 guarantees absorption; this check verifies it. The check must cover at least one declared terminal state; in deployments with multiple terminal states, at least one instance should be driven to each terminal state and checked.

4. **History append-only and replay-determinism check.** For a known [Instance Id] with N fired transitions, call `history(instance_id)` (unfiltered) and confirm: (a) exactly N entries are returned; (b) entries are in strictly increasing [Sequence Number] order with no gaps (sequence numbers 1 through N); (c) replaying the entries in [Sequence Number] order — starting at [Initial State], applying each [To State] in sequence — produces the same [Current State] as returned by `current(instance_id)`. A history with missing entries, a non-monotone [Sequence Number], or a replay that does not arrive at [Current State] is a conformance failure under Invariants 5, 6, and 7. In a test environment where all [Fire] calls are observable, confirm the entry count equals the number of successful [Fire] calls.

5. **Guard-gating check.** For a known [Instance Id] currently in a state with a guarded outgoing declared transition, call [Fire] with the guarded transition's [Action] but without setting `guard_satisfied = true`. Confirm the call returns `rejected(guard-not-satisfied)`. Confirm no history entry was appended. Then call [Fire] with `guard_satisfied = true`. Confirm the call returns the declared `new_state`. Confirm the history entry for this transition carries `guard_satisfied: true`. Invariant 8 guarantees this behavior; the check verifies it. For unguarded transitions, confirm that omitting [Guard Satisfied] does not trigger a [Guard Not Satisfied] rejection.

6. **Every history entry corresponds to a declared transition check.** For a known [Instance Id], call `history(instance_id)` (unfiltered) and `read_declaration(instance_id)`. For every entry in the history, confirm that the `{from_state, action, to_state}` triple is present as a declared transition in the declaration. An entry with a `{from_state, action, to_state}` triple that is not present in the declaration is a conformance failure under Invariant 3. This check verifies the declared-transition enforcement at the record level: if any undeclared transition entry exists, the implementation has violated the atom's core contract.

---

## Edge cases and explicit non-goals

- **Guard evaluation is the caller's responsibility.** The atom enforces that the caller must assert `guard_satisfied = true` before a guarded transition fires. It does not evaluate whether the guard condition is true in the external world. A caller that asserts `guard_satisfied = true` without actually evaluating the guard predicate is violating the declared process semantics; the atom records the assertion faithfully regardless. Guard evaluation — checking the external condition (two approvals recorded, a quorum reached, a threshold exceeded) — belongs to the calling system or to a composing Rules Engine pattern.

- **Approval gates within a workflow.** When a workflow transition requires a formal approval by a named actor before it may fire, the [Guard] label on the declared transition is the gate enforcement point, and the composing system is responsible for evaluating the guard (i.e., checking that an [Approval Step](./approval-step.md) for the relevant subject, approver, and scope is in state Approved). The [Fire] call is the point at which the caller asserts the gate has been cleared; the Approval Step record is the evidence. This composition is [Execute Gated Workflow](../compositions/execute-gated-workflow.md) (`grounded` 2026-06-04) — the layer where this atom's approval-type guards are actually evaluated (the composition reads the bound Approval Step's state and asserts [Guard Satisfied] only when it is Approved).

- **Parallel / concurrent active states and fork-join.** This atom has exactly one [Current State] at all times (Invariant 2). Parallel workflows — where an instance may be in multiple active states simultaneously, and where a join transition fires only when all parallel branches have completed — are out of scope. A Parallel Workflow / fork-join pattern (a composing or sibling pattern) handles this concept; this atom is the single-active-state primitive.

- **Sub-workflows and hierarchical states.** UML statecharts and Harel statecharts allow states to contain nested sub-state machines (composite states). This atom does not model nesting; its [States] are flat names. A calling system that needs hierarchical state behavior must model it explicitly in the declaration (naming composite states as distinct flat states with transitions between them) or compose with a sub-workflow pattern.

- **Declaration versioning and sharing one declaration across many instances.** This atom takes the [Declaration] at instantiation and fixes it immutably per instance. If the deployer needs to share one canonical declaration template across many instances — so that changing the template updates all new instances instantiated from it — that belongs to a Definition Registry, not this atom. The Definition Registry would hold the template; the calling system would retrieve the current template and supply it at [Instantiate]. This atom receives the [Declaration] as a value at instantiation; it does not know or care whether two instances received the same template or different ones.

- **Non-repudiable transition attribution.** The atom records [Actor Ref] as an opaque reference on each history entry. It enforces that, if supplied, [Actor Ref] is non-whitespace. It does not cryptographically bind the actor to the transition in a way that survives disputed-authorship challenges. For non-repudiable transition attribution — required in FDA 21 CFR Part 11 and SOX (Sarbanes-Oxley Act) §404 regulated contexts — compose with [Actor Identity](./actor-identity.md). The State Machine record is the transition history; Actor Identity is the non-repudiation layer.

- **Tamper-evidence of the history.** The atom guarantees immutability by specification. It does not cryptographically prevent a store administrator with write access from altering history entries. For court-admissible evidence under SOX §404 and FDA Part 11, compose with [Tamper Evidence](./tamper-evidence.md), which provides cryptographic sealing of the transition history.

- **Retention of the transition history.** The atom keeps every instance and every history entry for the lifetime of the store instance. Time-bounded retention under regulatory obligation — GDPR (General Data Protection Regulation — the European Union's data protection law) Article 17, HIPAA (Health Insurance Portability and Accountability Act — the US law governing protected health information) §164.530(j), FRCP (Federal Rules of Civil Procedure — the procedural rules governing US federal civil litigation) Rule 37(e) — belongs to a composing [Retention Window](./retention-window.md) pattern.

- **Which workflow state an entity "should" be in.** The atom records the declared states and the transitions that have fired. It does not declare what the subject's state *should* be — that is the calling system's business-rule layer. An auditor asking "show me every batch that never reached `released`" cannot answer that question from this atom alone without also having the set of all batches that were instantiated (which [History] or [Current] can supply) and knowing the expected terminal state for the batch type (which the [Declaration] can supply). The composing system must drive that analysis.

- **Subject validity.** [Subject Ref] is opaque. The atom does not validate it against any external record, database, or workflow engine. Instantiating a workflow for a [Subject Ref] that does not correspond to any real entity creates a valid workflow instance governing a nonexistent subject. The calling system is responsible for ensuring [Subject Ref] values are valid before calling [Instantiate].

- **Concurrency on the same instance.** Two systems concurrently calling [Fire] on the same [Instance Id] must be serialized. The first succeeds; the second will observe the [Current State] left by the first and may succeed (if the resulting state has a matching declared transition) or fail ([Terminal], [Invalid Transition], or succeed with a different result depending on the declaration). Implementations must serialize state transitions on a given [Instance Id]. This is identical to Approval Step's concurrency discipline.

- **Atomicity and crash semantics.** Each [Fire] call writes multiple fields simultaneously (appends a history entry with multiple sub-fields, updates [Current State], increments [Next Sequence Number]). A crash mid-write that sets some fields without others would violate Invariants 5, 6, and 7. The implementor is responsible for the transactional boundary that makes all field changes in a single [Fire] call change atomically. [Storage Failure] is the observable signal of an aborted transition; it leaves the instance in its prior state with no partial entry written and [Next Sequence Number] unchanged.

- **[Fire] is not idempotent.** See Behavior section. A calling system that needs at-most-once semantics under retry conditions must supply its own idempotency key at the orchestration layer; this atom does not provide one.

- **Clock semantics.** [Instantiated At] defaults to the receiving node's wall clock when not supplied; must not be in the future. [Fired At] defaults to the receiving node's wall clock when not supplied; must not be in the future; the resolved value must be ≥ the instance's [Instantiated At] (a transition cannot predate instantiation). Backdated [Fired At] values are accepted when ≥ `instantiated_at` (documenting a transition recognized at an earlier time is valid). [Fired At] is **not** required to be monotonic across history entries — under a skewing clock a later transition may carry an earlier [Fired At]; [Sequence Number] is the clock-independent, authoritative order source for the transition history. Clock skew, timezone normalization, and wall-clock monotonicity are handled at the deployment layer.

- **Distinct from Approval Step.** Approval Step is a specific state machine whose states, transitions, and semantics are fixed at the atom level. State Machine is the general case whose states and transitions are declared by the deployment. Approval Step is appropriate when the approval-gate semantics (exactly one named approver, approval-specific decision record, required-reason-on-rejection, etc.) are needed and the state machine is not configurable by the deployment. State Machine is appropriate when the process states and transitions are deployment-specific and must be declared at instantiation time. Both atoms compose into Execute Gated Workflow.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Instantiate

The behavior that validates a caller-supplied [Declaration] and creates a new workflow instance in its [Initial State], assigning a fresh [Instance Id], recording [Instance Metadata], [Actor Ref], and [Instantiated At], and starting an empty [Transition History]. Rejected [Invalid Declaration] for any declaration defect, [Invalid Request] for a bad [Actor Ref] or [Instantiated At], or [Storage Failure].

Kind: Operation

#### Fire

The behavior that advances an instance along a declared transition: it looks up the unique transition matching the current state and the supplied [Action], gates on [Guard] / [Guard Satisfied], appends one immutable history entry, and sets [Current State] to the transition's [To State]. Rejected [Not Known], [Terminal], [Invalid Transition], [Guard Not Satisfied], [Invalid Request], or [Storage Failure].

Kind: Operation

#### Current

The read-only query returning an instance's [Current State] name. Rejected [Not Known] or [Invalid Request].

Kind: Operation

#### History

The read-only query returning an instance's [Transition History] in [Sequence Number] ascending order, filterable by [Transition Id], [Sequence Number], [From State], [To State], [Action], [Actor Ref], or a [Fired At] range. Rejected [Not Known], [Invalid Query], or [Invalid Request].

Kind: Operation

#### Read Declaration

The read-only query returning the instance's immutable [Declaration] exactly as supplied at [Instantiate]. Rejected [Not Known] or [Invalid Request].

Kind: Operation

#### Instance Id

The opaque, immutable, system-generated identity of a workflow instance — assigned on [Instantiate], never reused, byte-order sortable for deterministic [History] ordering. It is the instance's identity; the [Declaration], [Current State], and [Transition History] are properties.

Kind:     Field
Field of: the workflow instance
Projects: instance_id

#### Subject Ref

The optional opaque reference to the entity whose lifecycle the workflow governs (a batch id, document id, work item id). Set on [Instantiate], immutable; the atom does not validate it, and its absence is valid.

Kind:     Field
Field of: the workflow instance
Projects: subject_ref

#### Instance Metadata

The optional opaque deployment-context payload supplied at [Instantiate], immutable; recorded as an auditable field, never interpreted.

Kind:     Field
Field of: the workflow instance
Projects: instance_metadata

#### Current State

The instance's current state — a member of the declared [States] (Invariant 2). Set to [Initial State] on [Instantiate]; updated to the fired transition's [To State] on each [Fire]. Always replay-derivable from the [Transition History] (Invariant 7).

Kind:     Field
Field of: the workflow instance
Projects: current_state

#### Transition History

The ordered, append-only sequence of transition history entries for an instance (Invariant 5). Begins empty; each [Fire] appends exactly one entry; never shrinks; total-ordered by [Sequence Number] (Invariant 6).

Kind:     Field
Field of: the workflow instance
Projects: transition_history

#### Next Sequence Number

The [Sequence Number] the next [Fire] will assign. Begins at 1; increments by one per successful [Fire]. Persistent instance state that must survive restarts, or Invariant 6 breaks.

Kind:     Field
Field of: the workflow instance
Projects: next_sequence_number

#### Declaration

The immutable map supplied at [Instantiate] that governs an instance — its [States], [Transitions], [Initial State], and [Terminal States]. Every enforcement decision derives from it; it never changes (Invariant 1) and is returned verbatim by [Read Declaration].

Kind:     Field
Field of: the workflow instance
Projects: declaration

#### Instantiated At

The wall-time the instance was created, stamped at [Instantiate] (or caller-supplied; not in the future). The lower bound for every [Fired At] — a transition cannot predate instantiation.

Kind:     Field
Field of: the workflow instance
Projects: instantiated_at

#### States

The non-empty set of named states in a [Declaration]. Each name is non-whitespace and unique within the declaration; [Current State], [Initial State], [From State], and [To State] are all drawn from it.

Kind:     Field
Field of: the declaration
Projects: states

#### Transitions

The set of declared transitions in a [Declaration], each a `{from_state, action, to_state, guard?}` tuple. At most one transition per `(from_state, action)` pair (determinism); none may originate from a [Terminal States] member.

Kind:     Field
Field of: the declaration
Projects: transitions

#### Initial State

The [Declaration]'s starting state — a member of [States], never a [Terminal States] member. It is the instance's [Current State] at [Instantiate] and the replay origin (Invariant 7).

Kind:     Field
Field of: the declaration
Projects: initial_state

#### Terminal States

The subset of [States] that is absorbing (Invariant 4): once [Current State] is one of them, no [Fire] succeeds. No declared transition may originate from one (enforced at [Instantiate]).

Kind:     Field
Field of: the declaration
Projects: terminal_states

#### From State

The state a declared transition (and the history entry it produces) departs from — a member of [States]. On a [Fire], it must equal the instance's [Current State].

Kind:     Field
Field of: a declared transition
Projects: from_state

#### To State

The state a declared transition (and the history entry it produces) arrives at — a member of [States]. On success it becomes the instance's new [Current State] and the returned `new_state`.

Kind:     Field
Field of: a declared transition
Projects: to_state

#### Action

The named trigger of a declared transition — a non-whitespace string. Supplied on [Fire] to select the unique transition from the [Current State]; recorded on the history entry.

Kind:     Field
Field of: a declared transition
Projects: action

#### Guard

The optional opaque label on a declared transition naming a condition the caller must assert satisfied before the transition fires. The atom gates on it but never evaluates the predicate (Invariant 8); guard evaluation is the caller's obligation.

Kind:     Field
Field of: a declared transition
Projects: guard

#### Transition Id

The opaque, immutable, system-generated identity of a transition history entry — assigned by [Fire], never reused within the instance.

Kind:     Field
Field of: the history entry
Projects: transition_id

#### Sequence Number

The strictly increasing integer assigned to a history entry from [Next Sequence Number] at [Fire]. The clock-independent total-order source for the [Transition History] (Invariant 6); [Fired At] is not.

Kind:     Field
Field of: the history entry
Projects: sequence_number

#### Fired At

The best-effort wall-time a transition was recorded, stamped at [Fire] (or caller-supplied; not in the future; ≥ [Instantiated At]). Not required to be monotonic across entries — [Sequence Number] is the order source.

Kind:     Field
Field of: the history entry
Projects: fired_at

#### Actor Ref

The optional opaque reference to the actor who fired a transition, recorded on the history entry (and on the genesis at [Instantiate]). If supplied, non-whitespace; its presence is deployment policy, not an atom mandate (Invariant 9).

Kind:     Field
Field of: the history entry
Projects: actor_ref

#### Guard Satisfied

The caller-asserted flag that a guarded transition's [Guard] condition is met — a [Fire] on a guarded transition fires only if it is `true`, and the history entry then records `guard_satisfied: true` (Invariant 8). Absent for unguarded transitions.

Kind:     Field
Field of: the history entry
Projects: guard_satisfied

#### Invalid Declaration

The rejection [Instantiate] returns for any declaration defect — an empty or duplicate-named [States] set, an [Initial State] that is missing or in [Terminal States], a transition referencing an undeclared state or leaving a terminal state, a duplicate `(from_state, action)` pair, or a blank [Action] or [Guard].

Kind:      Member
Member of: the Instantiate rejection
Role:      Outcome
Projects:  invalid-declaration

#### Invalid Request

The rejection an action returns for a malformed argument — a null or whitespace-only [Instance Id] or [Action], a bad [Actor Ref], or an [Instantiated At] / [Fired At] that is in the future or (for [Fired At]) before [Instantiated At].

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Storage Failure

The rejection any write action returns when the store write fails after all preconditions pass; guarantees no partial record and an unchanged [Current State] / [Next Sequence Number] (Invariant 10).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Not Known

The rejection [Fire], [Current], [History], or [Read Declaration] returns when the [Instance Id] references no instance in the store.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Terminal

The rejection [Fire] returns when the instance's [Current State] is a [Terminal States] member — terminal states are absorbing (Invariant 4).

Kind:      Member
Member of: the Fire rejection
Role:      Outcome
Projects:  terminal

#### Invalid Transition

The rejection [Fire] returns when no declared transition matches the [Current State] and the supplied [Action] — only declared transitions fire (Invariant 3).

Kind:      Member
Member of: the Fire rejection
Role:      Outcome
Projects:  invalid-transition

#### Guard Not Satisfied

The rejection [Fire] returns when the matched transition carries a [Guard] but the caller did not assert [Guard Satisfied] = `true` (Invariant 8).

Kind:      Member
Member of: the Fire rejection
Role:      Outcome
Projects:  guard-not-satisfied

#### Invalid Query

The rejection [History] returns for a malformed filter — a null or whitespace-only [Transition Id], [From State], [To State], [Action], or [Actor Ref]; a reversed [Sequence Number] or [Fired At] range; or an unrecognized filter key.

Kind:      Member
Member of: the History rejection
Role:      Outcome
Projects:  invalid-query

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Instantiate]: #instantiate
[Fire]: #fire
[Current]: #current
[History]: #history
[Read Declaration]: #read-declaration
[Instance Id]: #instance-id
[Subject Ref]: #subject-ref
[Instance Metadata]: #instance-metadata
[Current State]: #current-state
[Transition History]: #transition-history
[Next Sequence Number]: #next-sequence-number
[Declaration]: #declaration
[Instantiated At]: #instantiated-at
[States]: #states
[Transitions]: #transitions
[Initial State]: #initial-state
[Terminal States]: #terminal-states
[From State]: #from-state
[To State]: #to-state
[Action]: #action
[Guard]: #guard
[Transition Id]: #transition-id
[Sequence Number]: #sequence-number
[Fired At]: #fired-at
[Actor Ref]: #actor-ref
[Guard Satisfied]: #guard-satisfied
[Invalid Declaration]: #invalid-declaration
[Invalid Request]: #invalid-request
[Storage Failure]: #storage-failure
[Not Known]: #not-known
[Terminal]: #terminal
[Invalid Transition]: #invalid-transition
[Guard Not Satisfied]: #guard-not-satisfied
[Invalid Query]: #invalid-query

---

## Composition notes

State Machine is the general-purpose declared-state-machine primitive that Execute Gated Workflow and other multi-actor workflow compositions build on:

- **[Approval Step](./approval-step.md)** — the fixed-state sibling. Approval Step is a specific state machine (Pending / Approved / Rejected / Withdrawn) with approval-specific semantics (approver exclusivity, decision attribution, required reason on rejection). State Machine is the general declared case. A State Machine instance governing a multi-step process may have individual gate transitions guarded by Approval Step records; the guard evaluation and Approval Step consultation are the calling system's or the Execute Gated Workflow composition's responsibility.
- **[Actor Identity](./actor-identity.md)** — provides the non-repudiable attestation that binds the actor named in [Actor Ref] to the transition. [Actor Ref] in the history entry is an opaque reference; Actor Identity is the contract that makes that reference non-repudiable under FDA Part 11 and SOX §404. Required for regulated deployments where the transition-by-actor record must survive an authorship challenge.
- **[Tamper Evidence](./tamper-evidence.md)** — seals transition history entries against post-hoc modification. Court-admissible workflow history requires cryptographic integrity guarantees beyond this atom's spec-level immutability. Required under FDA 21 CFR Part 11.
- **[Retention Window](./retention-window.md)** — governs how long workflow instances and their transition histories are retained. This atom keeps everything for the lifetime of the store instance; time-bounded retention under GDPR Article 17, HIPAA §164.530(j), FRCP Rule 37(e), or SOX §802 is the Retention Window composition's obligation.
- **[Event Log](./event-log.md)** — the transition history within this atom has structural parallels to an Event Log (append-only, total-ordered by sequence number, [Fired At] best-effort), but Event Log has no notion of declared transitions, current state, or transition-validity enforcement. They are distinct freestanding atoms. The [Audit Trail](../compositions/audit-trail.md) composition (Event Log + Actor Identity + Retention Window + Tamper Evidence) can be layered alongside State Machine instances to provide a tamper-evident, attributed, retention-governed audit substrate; that layering belongs to the Execute Gated Workflow composition.
- **[Permissions](./permissions.md)** — governs which actors may call [Fire] for which workflow instances and which actions. This atom does not check permissions on [Fire] calls; access control is a composing concept.
- **[Audit Trail](../compositions/audit-trail.md)** — the canonical regulated-audit stack. In regulated deployments, each successful [Fire] is an auditable event; Audit Trail provides the tamper-evident, attributed, retention-governed substrate the regulators require. This atom produces the process-state record; Audit Trail produces the regulatory evidence layer.
- **[Execute Gated Workflow](../compositions/execute-gated-workflow.md)** (`grounded` 2026-06-04) — wires State Machine + Approval Step + Permissions + Assignment + Audit Trail (substrate) into multi-actor gated workflows with tamper-evident transition histories. This atom is the declared-state-machine primitive whose lifecycle Execute Gated Workflow manages, and it is where this atom's approval-type guard *evaluation* re-converges.

This atom resolves the `workflow` category's one-atom open question by landing as the second workflow atom, establishing the category on the basis of two present atoms rather than one present atom and one planned atom.

---

## Standards references

- **FDA 21 CFR Part 11 (Electronic Records; Electronic Signatures)** — for FDA-regulated contexts: each declared state transition constitutes a regulated electronic record; the transition history is the audit trail that Part 11 §11.50 (attributability) and Part 11 §11.70 (record linking to prevent removal, substitution, or falsification) require. Composition with [Actor Identity](./actor-identity.md) provides the §11.50 attributability; composition with [Tamper Evidence](./tamper-evidence.md) provides the §11.70 non-falsifiability. Invariants 3 (only-declared-transitions), 5 (history append-only and complete), and 7 (replay determinism) are the atom-level guarantees the regulated record depends on.
- **ISO 9001:2015 §8.5.1 (Control of production and service provision)** — requires that production and service provision activities be controlled by documented procedures, including controlled transitions at defined points in the process lifecycle. A State Machine instance governing a production process is the documented process record §8.5.1 anticipates; the declaration is the procedure map; the transition history is the per-instance proof of execution.
- **BPMN 2.0 (Business Process Model and Notation 2.0 — an international standard for modeling business processes, published by the Object Management Group)** — this atom is the primitive behind a BPMN state diagram. A BPMN process model's states and sequence flows map directly to this atom's [States] and [Transitions]; a BPMN lane actor maps to an [Actor Ref] on [Fire] calls; a BPMN gateway condition maps to a [Guard] label on a declared transition.
- **HL7 FHIR Task resource** — the HL7 FHIR Task resource uses a declared workflow state machine (`Task.status`) with a defined lifecycle (`requested → accepted → in-progress → completed | failed | cancelled | rejected`). This atom is the general primitive the FHIR Task lifecycle is an instance of. A conforming FHIR Task implementation may derive its state enforcement from this atom's declared-transition model.
- **UML (Unified Modeling Language — the standard object-oriented modeling language published by the Object Management Group) statecharts and Harel statecharts** — the conceptual core of this atom. A UML statechart's states, transitions, events, and guards map directly to this atom's [States], [Transitions], [Action]s, and [Guard] labels. This atom is a flat (non-hierarchical, single-active-state) Mealy / Moore finite-state-machine (a finite state machine is a computational model with a finite set of states, a start state, a set of transitions, and one active state at a time) instance; Harel nesting and parallel regions are out of scope (see Edge cases).
- **SOX (Sarbanes-Oxley Act — US law on corporate financial reporting and records integrity) §404** — internal control over financial reporting. For financial process workflows (approval chains, journal entry processing, purchase order lifecycle), State Machine instances are the process-control records SOX auditors query to verify that required control steps occurred in the declared order.
- **HIPAA §164.530(j)** — documentation requirements for covered entities: policies and procedures must be documented. Workflow instances governing patient-care or administrative processes under HIPAA may use this atom's transition history as the documentation of process execution.

Guard evaluation, non-repudiable attribution, tamper-evidence, and retention are explicitly composing-pattern obligations, not this atom's own standards obligations.

---

## Status

`grounded on Final Critique 4 — 2026-06-04` (formal layer complete 2026-06-04 — Alloy model [`state-machine.als`](./state-machine.als) + buggy twin verified in `tools/harness/`; see Lineage §Formal model). Sonnet-drafted against an Opus plan, then Opus-gated through Pass 1 (GRID), Pass 2 (EOS — the boundaries against Approval Step and Event Log hold; guard *evaluation* and the Definition Registry are extracted), Pass 3 (Linus), and a Final Critique round: one foundational finding and one refining finding, closed in-pattern (see Lineage notes). Regulated-pattern conventions baked in from the first draft. This atom **resolves the `workflow` one-atom open question** (it is the second workflow atom). The formal-layer vote was YES; the derived Alloy model (only-declared-transitions, terminal absorption, replay determinism over a declared transition relation + linear history chain, mirroring `clinical-observation.als` / `provenance.als`) verifies green — ten checks hold, four non-vacuity runs satisfiable — with a buggy twin the checker rejects on three checks. The English cleared the 92%-good threshold (foundational findings at zero) and the formal layer is discharged, so the atom is unqualified `grounded`. Under the unified methodology (3×3 baseline rounds with per-round Pass 1/2/3 numbering + Final Critique starting at Round 4), this pattern's Opus-led gating review (Pass 1/2/3 + Final Critique round) is retro-labeled Final Critique 4; the original round-naming in the Lineage notes below is preserved as historical record.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

Regulated atom. Conventions — *Regulated adversarial scenarios* and *Generation acceptance* — inherited from the methodology directly ([`pressure-testing.md`](../pressure-testing.md)), baked in from the first draft. [Approval Step](./approval-step.md) is the primary structural reference for this draft; its store-instance model, identity-model conventions, action-signature discipline (explicit rejection reasons, explicit rejection priority, explicit rejection-return-token collision resolution), invariant format, regulated adversarial scenarios structure, and Generation acceptance structure are all mirrored here. [Event Log](./event-log.md) is the clock-independent ordering reference: `sequence_number` as the total-order source, `fired_at` as best-effort wall time, and `next_sequence_number` as a durable counter that must survive restarts are all inherited from Event Log's discipline.

**EOS Pass-2 boundary argument (initial, author-led).**

*vs. Approval Step.* Approval Step is a specific state machine whose states (Pending, Approved, Rejected, Withdrawn), transitions (submit → Pending, approve → Approved, reject → Rejected, withdraw → Withdrawn), and semantics (exactly one named approver, submitter exclusivity on withdrawal, decision-completeness as a compliance invariant, required reason on rejection) are fixed at the atom level. External evaluators — FDA auditors, SOX auditors — know the states and their semantics without consulting any deployment configuration. State Machine is the general case: the states and transitions are declared by the deployment at instantiation; an external evaluator must read the declaration to know the valid states and transitions for a given instance. The specificity axis is the load-bearing distinction: Approval Step is specification-level; State Machine is instance-level. They do not overlap. Both are freestanding. They compose into Execute Gated Workflow (`grounded` 2026-06-04).

*vs. Event Log.* The transition history in this atom is structurally append-only and total-ordered by sequence number, mirroring Event Log's discipline. But the load-bearing concern here is different: declared-transition enforcement (only declared transitions fire), current-state tracking (exactly one `current_state` at all times; must be a member of the declared `states`), terminal absorption (no transition out of a terminal state), and replay determinism (`current_state` derivable by replaying the history). Event Log has none of these — it has no declared transitions, no current state, no terminal states, and no transition-validity enforcement. Event Log is an append-only journal; this atom is a declared state machine that happens to maintain an append-only history. The two atoms are freestanding, do not name each other, and compose via the Execute Gated Workflow / Audit Trail layering rather than by direct reference. The clock-independent ordering discipline (`sequence_number` as order source, `fired_at` best-effort, `next_sequence_number` durable across restarts) is borrowed from Event Log's model and stated explicitly in this atom's own State and Invariant 6, not referenced by name.

*Guard evaluation extraction.* Guard evaluation — checking whether the external condition named in the guard label is actually satisfied — is kept out of this atom. The atom enforces the gate (a guarded transition fires only if the caller asserts `guard_satisfied = true`) but does not evaluate the predicate. Guard evaluation is the caller's obligation. This is the correct EOS boundary: guard predicates recur across many domains, have their own state (rule definitions, eligibility criteria, quorum counts), and may be evaluated by a Rules Engine pattern, a composing Approval Step, a Permissions check, or the host system layer. Absorbing guard evaluation would make this atom depend on calling-system business logic, breaking freestanding status.

*Declaration Registry extraction.* Sharing one canonical declaration template across many instances — a Definition Registry concern — is kept out of this atom. The atom takes the declaration as a value at instantiation and fixes it immutably per instance. A calling system that wants template sharing retrieves the template from a registry and supplies it at `instantiate`; this atom receives a value declaration and does not know or care about registry existence. Absorbing this would introduce a separate registry concept with its own state machine (template versioning, update propagation) into this atom, breaking freestanding status.

**Formal-layer vote (initial, author-led): YES.** The load-bearing claims of this atom — only-declared-transitions (Invariant 3), exactly-one-current-state (Invariant 2), terminal-absorption (Invariant 4), and replay-determinism (Invariant 7) — are structural and relational claims over a declared transition relation (the set of `{from_state, action, to_state}` triples) and a linear history chain (strictly increasing `sequence_number`, total-ordered, append-only). These are the class of claim that Alloy's bounded exhaustive search is well-suited to verify: the declared-transition relation is a static relational structure; the history chain is a linear prefix structure of the kind verified in `event-log.tla` and `clinical-observation.als`; the combination (a relational guard on each history append) is the structural-plus-linear claim. A formal model should check: (1) every history entry corresponds to a declared transition; (2) no history entry has `from_state = to_state` of the prior entry violated (i.e., consecutive entries are consistent: `entry[n].to_state = entry[n+1].from_state`); (3) terminal absorption (no entry appended when `current_state ∈ terminal_states`); (4) replay determinism (`current_state = entry[N].to_state` or `initial_state` if N = 0). Model pending; Opus authors during gating.

**Opus-led gating review — 2026-06-04 (Pass 1 GRID / Pass 2 EOS / Pass 3 Linus + Final Critique).** Sonnet drafted against the Opus plan; Opus gated. One foundational finding and one refining finding, closed in-pattern:

- *F1 — `fired_at` cross-entry monotonicity contradicted the best-effort clock claim — foundational (Pass 3).* The `fire` rule required the resolved `fired_at` to be ≥ the prior history entry's `fired_at`, but Invariant 6 declares `fired_at` best-effort and `sequence_number` the authoritative order source. Cross-entry monotonicity on a skewing clock would wrongly reject a legitimate transition — exactly the enforcement Event Log refuses. → Dropped the cross-entry bound; kept the within-instance bounds (`fired_at` not in the future and ≥ `instantiated_at`, a transition cannot predate instantiation — analogous to Approval Step's `decided_at ≥ submitted_at`). `sequence_number` alone carries order; the spec is now internally consistent with Invariant 6 (`fire` Actions, Decision points, and the Clock-semantics edge case all updated).
- *F2 — Flow example tone — refining (Pass 3 rhetorical).* The inline `invalid-declaration` illustration opened with a casual "Wait —"; smoothed to the canonical register.

Pass 1 GRID clean (all sections present; reference graph intact — Approval Step, Actor Identity, Tamper Evidence, Retention Window, Event Log, Permissions, Audit Trail all exist). Pass 2 EOS clean: guard *evaluation* is extracted (the atom gates on a caller-asserted `guard_satisfied`; the caller or a Rules Engine evaluates the predicate), the declaration is single-level (Definition Registry named as a composing/deployment concern), and non-repudiation / tamper-evidence / retention are composing-pattern obligations — no over-absorption survives. Deliberate choices recorded: no genesis entry in the history (replay determinism, Invariant 7, handles the empty-history case via `initial_state`); `initial_state ∈ terminal_states` rejected at `instantiate` as a declaration smell (the rare born-terminal record is out of scope). The English clears the 92%-good threshold (foundational findings at zero); the Alloy declared-transition model is the remaining grounding prerequisite per the YES vote.

**Formal model — 2026-06-04: Alloy authored and verified; pattern promoted to `grounded`.** Derived model [`state-machine.als`](./state-machine.als) + buggy twin [`state-machine-buggy.als`](./state-machine-buggy.als), checked via `tools/harness/check.mjs` (Alloy headless). *What it checks:* one workflow instance modeled as a declared transition relation (`Trans` triples + `Config.initial`/`terminal`) plus a linear history chain of `Entry` records (relations named `successor`/`predecessor` — `succ`/`pred` are Alloy built-ins). Ten `check`s, all UNSAT: the linear backbone (at-most-one successor/predecessor, no branching, acyclic), **Invariant 3** (`A_Inv3_OnlyDeclaredTransitions` — every history entry corresponds to a declared transition), declaration determinism (at most one transition per `(from, action)`), **Invariant 4** (`A_Inv4_TerminalAbsorption` — no entry fires from a terminal state), chain consistency (consecutive entries agree: `entry[n].to = entry[n+1].from`), and **Invariant 7** replay determinism (`A_Inv7_ReplayUniqueTail` — a single linear chain has a unique tail, so `current_state` is uniquely determined; `A_Inv7_HeadFromInitial` — the head starts at the declared initial state). Four non-vacuity `run`s all SAT (empty history → current = initial; a single transition; a two-step chain; a chain reaching a terminal state). *Out of model scope:* guard-gating (Invariant 8) is an action-enablement property, not a static state predicate (cf. Medication Order Inv 9), and clock/`fired_at` ordering (`sequence_number` is the order source). *Buggy twin:* drops `EveryEntryDeclared` (an undeclared transition in the history), `TerminalNoOutgoingDecl` (a transition firing from a terminal state), and `ChainConsistency` (a broken replay). The checker rejects it: `A_Inv3_OnlyDeclaredTransitions`, `A_Inv4_TerminalAbsorption`, and `A_ChainConsistency` all find counterexamples, confirming those checks have teeth. *Scope/saturation:* scope 7; the properties are local/relational (per-entry declared-match, per-link consistency, single-chain tail), insensitive to scope beyond a few entries. *Conflict-protocol outcome:* none — the model corroborates the English; canonical English unchanged. Reproduce: `cd tools/harness && node check.mjs ../../atoms/state-machine.als` (and `… state-machine-buggy.als --buggy`).

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, or rejection taxonomy changed. (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added before Composition notes (34 terms): 5 Operations ([Instantiate], [Fire], [Current], [History], [Read Declaration]); 0 Types (the workflow instance, the declaration, a declared transition, and a history entry are ambient plain-noun / structured referents used as "Field of:" strings — mirroring notification); 21 Fields — 8 on the workflow instance ([Instance Id], [Subject Ref], [Instance Metadata], [Current State], [Transition History], [Next Sequence Number], [Declaration], [Instantiated At]), 4 on the declaration ([States], [Transitions], [Initial State], [Terminal States]), 4 on a declared transition ([From State], [To State], [Action], [Guard]), and 5 on the history entry ([Transition Id], [Sequence Number], [Fired At], [Actor Ref], [Guard Satisfied]); 0 Parameters (every input is stored as-itself; the clock is a wall clock, not a seam-injected parameter); and 8 rejection Members ([Invalid Declaration], [Invalid Request], [Storage Failure], [Not Known], [Terminal], [Invalid Transition], [Guard Not Satisfied], [Invalid Query]). Survivors left backticked: the one labeled projected-contract signature per Operation; the `new_state` return alias; the `{from_state, action, to_state, guard?}` transition-struct and `(from_state, action)` determinism-pair literals; the `guard_satisfied = true` / `guard_satisfied: true` assertion predicates and the `sequence_number = 1` / `≥ instantiated_at` bound literals; the fenced example declaration blocks and concrete example calls, ids, state-names, and timestamps; the `store_name` and store-level `instances` structural tokens; and external standard tokens (`Task.status` and the FHIR lifecycle). Because the state Members are declaration-parameterized (opaque per-instance strings, not a fixed enum), there are no state-Member cards; and the wall clock stamps [Instantiated At] / [Fired At] under a future / ≥-instantiated-at validation guard but drives no status — [Current State] is set by [Fire], not the clock — so there is no `[Now]` term (mirrors legal-hold). (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), the descriptive top blockquote folded out after confirming each claim is carried by Summary/Intent/State/Invariants 2, 3, 5, and 7; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #1** — the single-paragraph Summary split into one-idea-per-sentence paragraphs, lossless. (e) **prose cut #5 — skipped (with reason):** this atom's state machine is declaration-parameterized — its states and transitions are supplied per-instance and opaque to the atom, so there is no fixed transition set to tabulate (that is the atom's entire thesis, distinguishing it from Approval Step); the [Fire] and [Instantiate] decisions are linear rejection ladders already stated crisply in Actions and Decision points, and neither sharpens as a fixed state or decision table. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-06-04`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (34 terms); 10 invariants preserved; `.als` untouched — harness re-run green: `state-machine.als` PASS + `state-machine-buggy.als --buggy` rejected.

</details>
