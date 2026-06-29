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

> A general-purpose workflow primitive: a named instance moving through a deployment-declared finite set of states via deployment-declared transitions, with the full transition history append-only and auditable. The atom does not know what the governed entity is — it knows the instance's current state, the set of transitions declared valid at instantiation, and every transition that has fired. The declaration (states, transitions, initial state, terminal states, optional per-transition guard labels) is supplied at instantiation and is immutable thereafter. The atom enforces: only declared transitions fire; exactly one current state at all times; the full transition history is append-only, total-ordered by sequence number, and replays deterministically to current state. This is the general case of which Approval Step is one fixed instance.

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

## Summary

State Machine records a single named process instance — think of it as a token moving through a flowchart — where the flowchart (the set of valid states and the transitions between them) is declared by the system deploying it rather than fixed by this atom. When the instance is created, the deployer provides the complete map: every state, every allowed move between states (each move is a named action, optionally gated by a condition the calling system must assert is satisfied), the starting state, and any states that are permanent endpoints. From that moment forward the map is frozen — it cannot be changed for this instance. The atom then enforces three guarantees for the lifetime of the instance: only declared moves are allowed (an undeclared move is refused); exactly one current state exists at all times; and every move that succeeds is recorded permanently, in order, with enough context to replay the full history and arrive at the current state. These guarantees make the system useful for regulated processes (a pharmaceutical batch that must prove it moved only through the approved sequence of quality-control states) and for any process where you need an unambiguous, auditable record of what happened and in what order. This atom is the general pattern; [Approval Step](./approval-step.md) is one specific kind of state machine with its states and rules fixed in advance, whose instances do not need their own declaration.

---

## Structure

### Store instance model

The State Machine atom operates against a named store instance. A `store_name` identifies the instance; multiple store instances coexist in real systems — one per organizational domain, one per regulated process type, one per deployment environment, depending on topology. `instance_id` values are unique within a store instance; uniqueness across store instances is a composing concept. The same `subject_ref` (an opaque reference to the entity whose lifecycle this workflow governs) may appear in multiple simultaneous workflow instances within the same store — one per distinct workflow process. Calls implicitly target a single routed store instance; instance selection is handled at the deployment-routing layer, not defined by this atom.

### Identity model

Each workflow instance has an opaque, immutable, system-generated `instance_id` — assigned on `instantiate`, never reused, never reassigned within the store instance. It must be a non-empty string sortable in lexicographic byte-order; this property is required for deterministic `history` ordering. The `instance_id` is the workflow instance's identity; the declaration, the `current_state`, and the transition history are properties of the instance, not its identity.

Each entry in a workflow instance's transition history has an opaque, immutable, system-generated `transition_id` — assigned when `fire` records the transition, never reused, never reassigned within the instance. It must be a non-empty string. The `transition_id` is the history entry's identity.

`subject_ref` is an optional opaque reference to the entity whose lifecycle this workflow governs — a batch id, a document id, a transaction id, a work item id. Set on `instantiate`, immutable. The atom does not validate that the subject exists or is in any particular state; `subject_ref` is the caller's responsibility. Its absence is valid; if supplied, it must contain at least one non-whitespace character.

`instance_metadata` is an optional opaque payload (caller-supplied at `instantiate`) providing deployment context. Set on `instantiate`, immutable. The atom does not interpret it; it records it as an auditable field. If supplied, it must be non-null and non-empty.

### The declaration

The declaration is the immutable map that governs a workflow instance. It is supplied in full at `instantiate` and never changes thereafter. Every enforcement decision the atom makes — whether a transition is valid, whether a terminal state blocks a `fire`, whether a guard must be asserted — is derived from this declaration.

The declaration contains the following fields:

- **`states`** — a non-empty set of named states. Each state name must contain at least one non-whitespace character. State names within the declaration must be unique (no duplicate names within the same declaration).
- **`transitions`** — a set of declared transitions, each carrying `{from_state, action, to_state, guard?}` where `from_state` and `to_state` must both be members of `states`, `action` is a non-empty-string named trigger, and `guard` is an optional opaque guard label (a non-empty string naming the condition the caller must assert is satisfied before this transition fires; the atom does not evaluate the guard predicate — guard evaluation is the caller's obligation). At most one declared transition may share the same `(from_state, action)` pair; duplicate `(from_state, action)` pairs are rejected at `instantiate` as an invalid declaration. This is the determinism constraint: given the current state and a named action, at most one declared transition matches.
- **`initial_state`** — a member of `states`. The instance's current state on creation. Must be a non-terminal state — an instance whose initial state is already terminal would accept no transitions and is rejected at `instantiate` as an invalid declaration.
- **`terminal_states`** — a subset of `states` (possibly empty). States in this set are absorbing: once the instance's current state is a terminal state, no `fire` succeeds. No declared transition may have a `from_state` in `terminal_states`; any such declaration is rejected at `instantiate` as an invalid declaration.

### Inputs and Outputs

**Inputs:**

- `instantiate` calls from deployers and process-orchestration systems, each carrying a complete declaration, an optional `actor_ref`, optional `instance_metadata`, and an optional `instantiated_at` timestamp.
- `fire` calls from process actors, automated workflow engines, and orchestration systems, each carrying an `instance_id`, an `action` name, an optional `actor_ref`, an optional `guard_satisfied` flag, and an optional `fired_at` timestamp.
- `current` queries from process actors and dashboards, carrying an `instance_id`.
- `history` queries from auditors, investigators, and composing systems, carrying an `instance_id` and an optional query filter.
- `read_declaration` queries from deployers, auditors, and composing systems, carrying an `instance_id`.

**Outputs:**

- For `instantiate`: a fresh `instance_id`, or a rejection naming the failed precondition.
- For `fire`: the `new_state` the instance has transitioned to, or a rejection naming the failed precondition.
- For `current`: the current state name as a string, or a rejection.
- For `history`: a (possibly empty) ordered sequence of transition history entries. Each entry carries: `transition_id`, `sequence_number`, `from_state`, `to_state`, `action`, `actor_ref` (if supplied at the firing `fire` call), `fired_at`, and `guard_satisfied` (true if the transition carried a `guard` label and the caller asserted `guard_satisfied = true`; absent if the transition had no guard).
- For `read_declaration`: the immutable declaration as supplied at `instantiate`, or a rejection.

### State

Each workflow instance is in exactly one state drawn from its declared `states` at all times.

**Instance-level state per workflow instance:**

- **`current_state`** — the current state name; a member of the instance's declared `states`. Set to `initial_state` on `instantiate`. Updated to the `to_state` of the most recently fired declared transition on each successful `fire`. Invariant: exactly one value; always a member of `states`.
- **`transition_history`** — the ordered append-only sequence of transition history entries for this instance. Begins empty at `instantiate`. Each successful `fire` appends exactly one entry. Never shrinks.
- **`next_sequence_number`** — the sequence number the next `fire` will assign to its history entry. Begins at 1 for a fresh instance. Increments by 1 on each successful `fire`. Part of the instance's persistent state — durable implementations must preserve it across restarts to maintain sequence-number monotonicity (see Event Log's discipline, mirrored here). Volatile implementations that reset to 1 on restart violate this atom's History total-order invariant across the lifetime of the instance.

**Store-level state:**

- **`instances`** — the set of all known `instance_id`s and their associated declarations, current states, transition histories, and `next_sequence_number` counters. Append-only at the instance granularity: no instance is removed. Transition history within each instance is also append-only. Instance state (`current_state`) changes on successful `fire`.

There is no delete or edit surface. Once an instance is created, it remains. Once a history entry is written, it remains.

### Actions

For optional parameters in all actions, "supplied" means provided as a parseable value of the declared type. Null, missing, and empty (or whitespace-only) values are equivalent to "not supplied," and the action's documented default applies.

- **`instantiate(declaration, [actor_ref], [instance_metadata], [instantiated_at]) → instance_id | rejected(invalid-declaration | invalid-request | storage-failure)`** — validate the declaration's well-formedness, create a new workflow instance in `initial_state`, and record the genesis.

  Declaration validation checks (all failures are `invalid-declaration`):
  - `states` is non-empty.
  - Every state name in `states` contains at least one non-whitespace character.
  - State names within `states` are unique (no duplicates).
  - `initial_state` is a member of `states`.
  - `initial_state` is not a member of `terminal_states`.
  - Every declared transition's `from_state` and `to_state` are members of `states`.
  - No declared transition has a `from_state` in `terminal_states`.
  - No two declared transitions share the same `(from_state, action)` pair.
  - Every declared transition's `action` contains at least one non-whitespace character.
  - Every declared transition's `guard` label, if present, contains at least one non-whitespace character.

  If the declaration is well-formed: assigns a fresh `instance_id` and `next_sequence_number = 1`; records `current_state = initial_state`; records `instance_metadata` (if supplied); records `instantiated_at` (wall clock if not supplied; must not be in the future — an instance cannot be declared in the future; violation is `invalid-request`); records `actor_ref` (if supplied; must contain at least one non-whitespace character — violation is `invalid-request`); sets `transition_history = []`.

  `storage-failure` if the store write fails after all preconditions pass; no `instance_id` is issued and no record enters the store. Rejection priority: `invalid-declaration` on any declaration defect → `invalid-request` on `actor_ref` or `instantiated_at` violations → `storage-failure`.

- **`fire(instance_id, action, [actor_ref], [guard_satisfied], [fired_at]) → new_state | rejected(not-known | terminal | invalid-transition | guard-not-satisfied | invalid-request | storage-failure)`** — look up the unique declared transition from the instance's current state matching `action`; if found and all preconditions are met, append one immutable history entry and advance `current_state` to the transition's `to_state`.

  The `instance_id` and `action` parameters must each contain at least one non-whitespace character (`invalid-request`); a null, empty, or whitespace-only value for either is malformed and rejected before any existence check is performed.

  `actor_ref`, if supplied, must contain at least one non-whitespace character (`invalid-request`). `fired_at`, if supplied, must not be in the future (`invalid-request`). The resolved `fired_at` — whether caller-supplied or wall-clock-defaulted — must be ≥ the instance's `instantiated_at`; a value that is less is `invalid-request` (a transition cannot be recorded as occurring before the instance existed — the within-instance bound analogous to Approval Step's `decided_at ≥ submitted_at`). The atom does **not** enforce monotonicity of `fired_at` across history entries: under a skewing or non-monotonic clock a later transition may legitimately carry an earlier `fired_at` than its predecessor. `sequence_number`, not `fired_at`, is the authoritative order source, mirroring Event Log's best-effort wall-time discipline (Invariant 6).

  If all parameter checks pass: look up the instance (`not-known` if no instance with this `instance_id` exists). Check whether `current_state` is a terminal state (`terminal` if yes — no transition out of a terminal state is permitted). Look up the declared transition matching `(current_state, action)` (`invalid-transition` if no such transition is declared). If the matched transition carries a `guard` label: the transition fires only if `guard_satisfied` is supplied as `true` (`guard-not-satisfied` if `guard_satisfied` is absent or not `true`).

  On success: increment `next_sequence_number`; append one immutable history entry with fields `transition_id` (fresh opaque id), `sequence_number` (the prior `next_sequence_number` — i.e., the value before incrementing), `from_state` (prior `current_state`), `to_state` (the transition's `to_state`), `action` (the named trigger), `actor_ref` (as supplied, or absent if not supplied), `fired_at` (resolved value), `guard_satisfied` (true if the transition carried a `guard` and the caller asserted it — absent if the transition had no guard); set `current_state = to_state`. Return `new_state = to_state`.

  Rejection priority: malformed `instance_id` or `action` (`invalid-request`) → `not-known` → `terminal` → `invalid-transition` → `guard-not-satisfied` → attribution/temporal (`invalid-request`) → `storage-failure`.

  `storage-failure` leaves the instance in its prior state with no history entry written and `next_sequence_number` unchanged; the caller must retry.

- **`current(instance_id) → current_state | rejected(not-known | invalid-request)`** — return the instance's current state name. The `instance_id` parameter must contain at least one non-whitespace character (`invalid-request`). `not-known` if no instance with this `instance_id` exists. Returns the `current_state` string.

- **`history(instance_id, [query]) → ordered_sequence_of_transitions | rejected(not-known | invalid-query | invalid-request)`** — return the instance's transition history matching the query, ordered by `sequence_number` ascending.

  The `instance_id` parameter must contain at least one non-whitespace character (`invalid-request`). `not-known` if no instance with this `instance_id` exists.

  The supported filter axes are exactly: `transition_id`, `sequence_number` (range), `from_state`, `to_state`, `action`, `actor_ref`, and time ranges on `fired_at`. A time range filter on `fired_at` takes the form `{after: <timestamp>, before: <timestamp>}` with both sub-keys optional; `after` is an inclusive lower bound and `before` is an inclusive upper bound. Filter keys are flat strings, not dot-notation paths. Any combination of supported axes is valid.

  A `from_state`, `to_state`, `action`, or `actor_ref` filter value that is null, empty, or whitespace-only is `invalid-query`. A `sequence_number` range with end before start is `invalid-query`. A `fired_at` time range with end before start is `invalid-query`. A `transition_id` filter value that is null, empty, or whitespace-only is `invalid-query`. A query carrying an unrecognized filter key — any key outside the supported axes named above — is `invalid-query`; an unrecognized key is rejected rather than silently ignored, because silent ignore would return a result set inconsistent with the caller's intent.

  A well-formed query matching no transitions returns an empty sequence, not a rejection. A query with no filters returns the full history in `sequence_number` ascending order.

- **`read_declaration(instance_id) → declaration | rejected(not-known | invalid-request)`** — return the immutable declaration as supplied at `instantiate`. The `instance_id` parameter must contain at least one non-whitespace character (`invalid-request`). `not-known` if no instance with this `instance_id` exists. The returned declaration is the exact declaration as supplied; no fields are normalized or reordered.

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

Note that the `rejected` state appears as a transition target but was not listed in `states`; the `instantiate` call therefore returns `rejected(invalid-declaration)`. The declaration is corrected:

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

- **At `instantiate`** — declaration validation runs first and is comprehensive (see Actions above); any defect is `invalid-declaration`. If the declaration is valid, `actor_ref` and `instantiated_at` are checked (`invalid-request` on violations). `storage-failure` on store-write failure with no `instance_id` issued. Rejection priority: `invalid-declaration` → `invalid-request` → `storage-failure`.

- **At `fire`** — `instance_id` and `action` are checked first for well-formedness (null, empty, or whitespace-only is `invalid-request` before any store lookup). The store is consulted: `not-known` if the instance does not exist. The `current_state` is checked against `terminal_states`: `terminal` if the current state is terminal. The declared transitions for `current_state` are scanned for a transition matching `action`: `invalid-transition` if no match. If the matched transition carries a `guard` label: the transition fires only if `guard_satisfied = true` is asserted by the caller (`guard-not-satisfied` if not). Attribution and temporal checks follow: `actor_ref` (if supplied) must contain at least one non-whitespace character; `fired_at` (resolved) must not be in the future and must be ≥ the instance's `instantiated_at` (a transition cannot predate instantiation). `fired_at` is not required to be monotonic across entries — `sequence_number` is the order source. `storage-failure` on store-write failure; no entry written; no state change. Rejection priority: malformed `instance_id` or `action` (`invalid-request`) → `not-known` → `terminal` → `invalid-transition` → `guard-not-satisfied` → attribution/temporal (`invalid-request`) → `storage-failure`.

- **At `current`** — `instance_id` must be non-whitespace (`invalid-request`). `not-known` if the instance does not exist. Returns `current_state`.

- **At `history`** — `instance_id` must be non-whitespace (`invalid-request`). `not-known` if the instance does not exist. Filter values are checked for well-formedness (empty/whitespace-only values for string axes are `invalid-query`; malformed ranges are `invalid-query`; unrecognized keys are `invalid-query`). A well-formed query matching no transitions returns an empty sequence.

- **At `read_declaration`** — `instance_id` must be non-whitespace (`invalid-request`). `not-known` if the instance does not exist.

### Behavior

- **Instances are durable on success.** Once `instantiate` returns an `instance_id`, the instance is in the store, its declaration is set and immutable, and it will appear in subsequent `current` and `history` queries.

- **`fire` is not idempotent.** Two `fire` calls with the same `(instance_id, action)` pair (where both are otherwise valid) will both succeed if the declared transition is still available — the first advances `current_state` to `to_state`, and the second will look up the declared transitions from `to_state`. A second call with the same `action` from a different state may succeed, fail with `invalid-transition`, or fail with `terminal`, depending on the declaration. For at-most-once semantics under retry conditions, the calling system must supply its own idempotency key; this atom does not provide one.

- **Guard enforcement is a gate, not an evaluation.** When a declared transition carries a `guard` label, the atom enforces that the caller must assert `guard_satisfied = true` before the transition fires. The atom does not evaluate whether the guard condition is actually true in the external world — that is the caller's obligation. The history records that the guard was asserted satisfied (`guard_satisfied: true` in the entry), not that the underlying predicate was evaluated by the atom. A caller that asserts `guard_satisfied = true` without actually evaluating the predicate is violating the declared process semantics; the atom records the assertion faithfully regardless. Guard evaluation correctness is a calling-system obligation.

- **Declared-transition enforcement is strict.** A `fire` call with an `action` that has no declared transition from the current state is always `invalid-transition`. There is no fallback, no wildcard transition, and no "any action" surface. The atom enforces exactly what was declared at instantiation.

- **Terminal states are absorbing.** A `fire` call on an instance whose `current_state` is in `terminal_states` is always `terminal`. There is no re-open, re-activate, or post-terminal transition surface. The declaration may not name transitions out of terminal states (enforced at `instantiate`). A process that requires post-terminal behavior must model that behavior in the declaration as a non-terminal state, or the calling system must instantiate a new workflow instance.

- **History is append-only.** The transition history only grows. Each successful `fire` appends one entry. No history entry is ever removed or modified. An unfiltered `history` query at time `t2 > t1` returns every entry visible at `t1` plus any added between `t1` and `t2`.

- **`current_state` is replay-deterministic.** The `current_state` at any moment equals the `to_state` of the history entry with the highest `sequence_number`, or `initial_state` if no entry exists. Any implementation that correctly replays the history in `sequence_number` order will arrive at the correct `current_state`.

### Feedback

- After `instantiate` — a new instance exists; `instance_id`, `current_state` (= `initial_state`), the immutable declaration, and `next_sequence_number = 1` are set.
- After `fire` — the instance's `current_state` is updated to `new_state`; one history entry is appended with the full transition record; `next_sequence_number` is incremented.
- After `current` — the current state string is returned; no state changes.
- After `history` — an ordered sequence of transition history entries matching the query is returned; no state changes.
- After `read_declaration` — the immutable declaration is returned; no state changes.

Each rejected action produces an observable refusal naming the failed precondition.

### Invariants

- **Invariant 1 — Declaration immutability.** After a successful `instantiate`, the fields `states`, `transitions`, `initial_state`, and `terminal_states` comprising the declaration never change, regardless of any subsequent action on the instance. `read_declaration` returns the exact declaration as supplied at `instantiate` at any point in the instance's lifetime.

- **Invariant 2 — Exactly one current state.** At all times, every known workflow instance has a `current_state` that is exactly one member of its declared `states`. The `current_state` is never absent, never null, and never a value not in the instance's declared `states`.

- **Invariant 3 — Only-declared-transitions fire.** Every successful `fire` corresponds to exactly one declared transition `{from_state = prior current_state, action = the named trigger, to_state = new_state}` that is present in the instance's declaration. A `fire` call whose `action` has no declared transition from the current state is rejected `invalid-transition` and changes no state and produces no history entry. The determinism constraint (at most one declared transition per `(from_state, action)` pair, enforced at `instantiate`) ensures the matched transition, if any, is unique.

- **Invariant 4 — Terminal absorption.** Once `current_state` is a member of `terminal_states`, no `fire` succeeds; the instance remains in that terminal state permanently. No declared transition may have a `from_state` in `terminal_states` (enforced at `instantiate`). Terminal states are absorbing: they have no outgoing transitions by construction and by enforcement.

- **Invariant 5 — History append-only and complete.** Every successful `fire` appends exactly one immutable history entry to the instance's `transition_history`. No history entry is ever removed or modified. The count of history entries is monotonically non-decreasing. An instance with no successful `fire` calls has an empty history; an instance with N successful `fire` calls has exactly N history entries.

- **Invariant 6 — History total order.** History entries within an instance have strictly increasing `sequence_number` values. No two entries share a `sequence_number`. The `sequence_number` is the total-order source for the history; `fired_at` is best-effort wall time only. An implementation that resets `next_sequence_number` to 1 on restart without persisting the counter violates this invariant across the lifetime of the instance, producing two entries with `sequence_number = 1`. The `next_sequence_number` counter is part of the instance's persistent state and must survive restarts.

- **Invariant 7 — Replay determinism.** The `current_state` of an instance equals the `to_state` of the history entry with the highest `sequence_number`, or `initial_state` if no entry exists. Replaying the history in `sequence_number` order from the beginning — starting at `initial_state`, applying each entry's `to_state` in sequence — produces the `current_state`. The history is a gap-free record from which `current_state` is always derivable without consulting any mutable field.

- **Invariant 8 — Guard-gating without evaluation.** A declared transition carrying a `guard` label fires only if the caller asserts `guard_satisfied = true`; the atom enforces the gate but does not evaluate the guard predicate. The history entry for a guarded transition records `guard_satisfied: true`, attesting that the caller asserted the guard was satisfied at the time of the `fire` call. A `fire` call on a guarded transition that does not assert `guard_satisfied = true` is rejected `guard-not-satisfied` and produces no history entry. The atom does not check whether the asserted guard condition is actually satisfied in the external world; that is the caller's obligation.

- **Invariant 9 — Transition attribution completeness.** Every history entry carries `transition_id`, `sequence_number`, `from_state`, `to_state`, `action`, and `fired_at` — each set and non-null. `actor_ref`, if supplied on the `fire` call, is present in the entry and contains at least one non-whitespace character; `actor_ref` is absent from the entry if not supplied on the `fire` call. The entry is complete for forensic replay regardless of whether `actor_ref` was supplied; `actor_ref` presence is deployment policy, not atom-level mandate.

- **Invariant 10 — Instance store durability.** No workflow instance or history entry is removed from the store. The total instance count is monotonically non-decreasing. A `storage-failure` response on `fire` guarantees that no partial history entry was written and that the instance's `current_state` and `next_sequence_number` are unchanged. A `storage-failure` response on `instantiate` guarantees that no partial instance record was written and no `instance_id` was issued.

---

## Examples

### Happy path — ISO 9001 batch qualification

See Flow section. A complete two-transition arc is walked there: instantiation with a declaration validation failure (to illustrate `invalid-declaration`), re-instantiation with the corrected declaration, `begin-testing` firing, a `release` rejection due to unasserted guard, a `release` success with guard asserted, a `terminal` rejection on post-terminal `fire`, and a final audit `history` query.

### Rejection path — undeclared transition

A workflow instance `"wf-po-0199"` is currently in state `"draft"`. The declaration for this instance does not include a transition from `draft` with action `"approve"` (approval happens only from `"submitted"`, not `"draft"`). A workflow engine with a routing bug calls `fire("wf-po-0199", action: "approve")` → `rejected(invalid-transition)`. No history entry is written; `current_state` remains `"draft"`. The workflow engine logs the rejection and routes to the correct action (`"submit"` from `"draft"` before `"approve"` from `"submitted"`).

### Rejection path — guard not asserted

A workflow instance `"wf-cr-0055"` has a declared transition `{from: in-review, action: merge, to: merged, guard: "two-approver-sign-off"}`. The automation engine calls `fire("wf-cr-0055", action: "merge", actor_ref: "ci-bot")` without setting `guard_satisfied` → `rejected(guard-not-satisfied)`. The engine checks whether two approvals have been recorded by the composing Approval Step layer, records both, and retries: `fire("wf-cr-0055", action: "merge", actor_ref: "ci-bot", guard_satisfied: true)` → `new_state: "merged"`. The history entry records `guard_satisfied: true`. The atom does not re-verify the two-approver condition; the engine's assertion is the gate.

### Rejection path — invalid declaration (duplicate from-action pair)

A deployment attempts to declare a non-deterministic state machine: the declaration includes both `{from: pending, action: decide, to: approved}` and `{from: pending, action: decide, to: rejected}`. `instantiate(declaration)` → `rejected(invalid-declaration)`. The `(from_state: "pending", action: "decide")` pair is declared twice; the declaration is non-deterministic and the atom will not instantiate it. The deployer must model the decision through distinct action names (`decide-approve` and `decide-reject`) or through a branching state that uses different action names for each branch.

### Rejection path — fire with whitespace-only action

`fire("wf-batch-0044", action: "   ")` → `rejected(invalid-request)`. Whitespace-only `action` is malformed. No store lookup is performed; no state changes.

### Multi-instance independence

Two instances `"wf-batch-0044"` and `"wf-batch-0045"` are both instantiated with the same batch-qualification declaration. Firing a transition on `"wf-batch-0044"` has no effect on `"wf-batch-0045"`. Each instance has its own `current_state`, its own `transition_history`, and its own `next_sequence_number`. `history("wf-batch-0044")` returns only the transitions fired on that instance; `history("wf-batch-0045")` returns only the transitions fired on that instance.

---

## Regulated adversarial scenarios

### Regulator audit — FDA 21 CFR Part 11 / ISO 9001 §8.5.1: declared-transition compliance

An FDA (US Food and Drug Administration) inspector auditing a pharmaceutical manufacturer's batch release process under 21 CFR Part 11 and ISO 9001 §8.5.1 demands evidence that batch `BR-2026-0412` moved only through the manufacturer's declared quality-control states in the declared order, and that the qualified-person sign-off gate was enforced before the release transition fired.

The inspector queries `history("wf-batch-BR-2026-0412")` and receives the full transition history in `sequence_number` order. Invariant 5 (history append-only and complete) guarantees every transition that fired is recorded. The inspector then queries `read_declaration("wf-batch-BR-2026-0412")` to recover the immutable declaration. Invariant 1 (declaration immutability) guarantees this declaration is exactly as declared at instantiation — the manufacturer cannot have added or removed states after the fact. The inspector cross-references each history entry against the declaration: every `{from_state, action, to_state}` triple in the history must correspond to a declared transition (Invariant 3 — only-declared-transitions). The release entry carries `guard_satisfied: true`, confirming the qualified-person sign-off gate was asserted (Invariant 8 — guard-gating without evaluation). The forensic question of whether the qualified person actually signed off is answered by composition with [Actor Identity](./actor-identity.md); the State Machine records that the gate was asserted satisfied.

The inspector's structural questions — *did the batch move only through declared states?* and *was the release gate enforced?* — are answered from the records alone, with no recourse to source code, runbooks, or developer narration.

### Disputed transition — external party claims the workflow skipped a required state

A contract manufacturer disputes that purchase order `PO-2026-0551` was properly processed: they claim the order moved directly from `submitted` to `fulfilled` without passing through `approved`, bypassing the required approval gate. The composing system queries `history("wf-po-PO-2026-0551")` and returns the full transition history in sequence order.

The history shows three entries: (1) `{from: draft, to: submitted, seq: 1}`; (2) `{from: submitted, to: approved, seq: 2}`; (3) `{from: approved, to: fulfilled, seq: 3}`. The declaration (returned by `read_declaration`) has no declared transition from `submitted` directly to `fulfilled`; such a `fire` call would have been rejected `invalid-transition` and produced no entry. Invariants 3 (only-declared-transitions) and 7 (replay determinism) together constitute the structural rebuttal: no transition fires without a corresponding declared transition from the current state, and the history is the complete record of every transition that fired. The dispute cannot be sustained against the structural record: if the `submitted → approved` step had not occurred, no `approved → fulfilled` step would have been reachable.

The question of whether the actor who fired the `approved → fulfilled` transition was authorized to do so is answered by composition with [Permissions](./permissions.md) and [Actor Identity](./actor-identity.md); this atom records that the transition fired and who asserted it.

### Breach or incident investigation — reconstructing the anomaly window

During a security incident investigation, the incident response team needs to determine whether any workflow instances in the order-management system were driven through unauthorized state transitions during a suspected credential-compromise window (2026-05-01T00:00:00Z through 2026-05-03T23:59:59Z). The team queries `history` for all relevant instances with a `fired_at` range filter: `history("wf-po-{id}", query: {fired_at: {after: "2026-05-01T00:00:00Z", before: "2026-05-03T23:59:59Z"}})` for each instance of interest.

For each transition entry in the window, the team cross-references the entry's `{from_state, action, to_state}` against the instance's declaration (`read_declaration`) to confirm the transition was declared. Invariant 3 guarantees every entry in the history corresponds to a declared transition — the history cannot contain an undeclared transition, because undeclared `fire` calls are rejected and produce no entries. The team then inspects `actor_ref` values in the window entries and routes suspicious actor references to the composing [Actor Identity](./actor-identity.md) investigation to determine whether the referenced actors' credentials were compromised.

Invariant 6 (history total order, strictly increasing `sequence_number`) gives the team a clock-independent ordering of every transition within each instance, bounding the anomaly window precisely. The forensic question — *which transitions fired, in what order, by which asserted actors, during the window?* — is answered from the records alone.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Declaration immutability check.** For a known `instance_id`, call `read_declaration` at time `t1` and record the returned declaration. Fire one or more transitions on the instance. Call `read_declaration` again at `t2 > t1`. Confirm the two declarations are identical in every field (`states`, `transitions`, `initial_state`, `terminal_states`). Any difference between the two declarations is a conformance failure under Invariant 1. This check must be run after at least one `fire` call has succeeded, to confirm that transitions do not mutate the declaration.

2. **Only-declared-transitions check.** For a known `instance_id` with a known declaration, attempt a `fire` call with an `action` that has no declared transition from the instance's current state. Confirm the call returns `rejected(invalid-transition)` and that `current(instance_id)` returns the same state as before the call. Then attempt a `fire` call with a declared transition's `action` from the current state. Confirm the call returns `new_state` equal to the declared transition's `to_state`. Confirm `current(instance_id)` returns that `to_state`. Invariant 3 guarantees this behavior; the check verifies it.

3. **Terminal absorption check.** Drive a workflow instance to a terminal state. Confirm `current(instance_id)` returns a state in `terminal_states`. Attempt `fire` with any action (including actions that were valid from prior non-terminal states). All calls must return `rejected(terminal)`. Confirm `current(instance_id)` is unchanged after each attempted transition. Confirm `history(instance_id)` shows no new entry was appended. Invariant 4 guarantees absorption; this check verifies it. The check must cover at least one declared terminal state; in deployments with multiple terminal states, at least one instance should be driven to each terminal state and checked.

4. **History append-only and replay-determinism check.** For a known `instance_id` with N fired transitions, call `history(instance_id)` (unfiltered) and confirm: (a) exactly N entries are returned; (b) entries are in strictly increasing `sequence_number` order with no gaps (sequence numbers 1 through N); (c) replaying the entries in `sequence_number` order — starting at `initial_state`, applying each `to_state` in sequence — produces the same `current_state` as returned by `current(instance_id)`. A history with missing entries, a non-monotone `sequence_number`, or a replay that does not arrive at `current_state` is a conformance failure under Invariants 5, 6, and 7. In a test environment where all `fire` calls are observable, confirm the entry count equals the number of successful `fire` calls.

5. **Guard-gating check.** For a known `instance_id` currently in a state with a guarded outgoing declared transition, call `fire` with the guarded transition's `action` but without setting `guard_satisfied = true`. Confirm the call returns `rejected(guard-not-satisfied)`. Confirm no history entry was appended. Then call `fire` with `guard_satisfied = true`. Confirm the call returns the declared `new_state`. Confirm the history entry for this transition carries `guard_satisfied: true`. Invariant 8 guarantees this behavior; the check verifies it. For unguarded transitions, confirm that omitting `guard_satisfied` does not trigger a `guard-not-satisfied` rejection.

6. **Every history entry corresponds to a declared transition check.** For a known `instance_id`, call `history(instance_id)` (unfiltered) and `read_declaration(instance_id)`. For every entry in the history, confirm that the `{from_state, action, to_state}` triple is present as a declared transition in the declaration. An entry with a `{from_state, action, to_state}` triple that is not present in the declaration is a conformance failure under Invariant 3. This check verifies the declared-transition enforcement at the record level: if any undeclared transition entry exists, the implementation has violated the atom's core contract.

---

## Edge cases and explicit non-goals

- **Guard evaluation is the caller's responsibility.** The atom enforces that the caller must assert `guard_satisfied = true` before a guarded transition fires. It does not evaluate whether the guard condition is true in the external world. A caller that asserts `guard_satisfied = true` without actually evaluating the guard predicate is violating the declared process semantics; the atom records the assertion faithfully regardless. Guard evaluation — checking the external condition (two approvals recorded, a quorum reached, a threshold exceeded) — belongs to the calling system or to a composing Rules Engine pattern.

- **Approval gates within a workflow.** When a workflow transition requires a formal approval by a named actor before it may fire, the guard label on the declared transition is the gate enforcement point, and the composing system is responsible for evaluating the guard (i.e., checking that an [Approval Step](./approval-step.md) for the relevant subject, approver, and scope is in state Approved). The `fire` call is the point at which the caller asserts the gate has been cleared; the Approval Step record is the evidence. This composition is [Execute Gated Workflow](../compositions/execute-gated-workflow.md) (`grounded` 2026-06-04) — the layer where this atom's approval-type guards are actually evaluated (the composition reads the bound Approval Step's state and asserts `guard_satisfied` only when it is Approved).

- **Parallel / concurrent active states and fork-join.** This atom has exactly one `current_state` at all times (Invariant 2). Parallel workflows — where an instance may be in multiple active states simultaneously, and where a join transition fires only when all parallel branches have completed — are out of scope. A Parallel Workflow / fork-join pattern (a composing or sibling pattern) handles this concept; this atom is the single-active-state primitive.

- **Sub-workflows and hierarchical states.** UML statecharts and Harel statecharts allow states to contain nested sub-state machines (composite states). This atom does not model nesting; its `states` are flat names. A calling system that needs hierarchical state behavior must model it explicitly in the declaration (naming composite states as distinct flat states with transitions between them) or compose with a sub-workflow pattern.

- **Declaration versioning and sharing one declaration across many instances.** This atom takes the declaration at instantiation and fixes it immutably per instance. If the deployer needs to share one canonical declaration template across many instances — so that changing the template updates all new instances instantiated from it — that belongs to a Definition Registry, not this atom. The Definition Registry would hold the template; the calling system would retrieve the current template and supply it at `instantiate`. This atom receives the declaration as a value at instantiation; it does not know or care whether two instances received the same template or different ones.

- **Non-repudiable transition attribution.** The atom records `actor_ref` as an opaque reference on each history entry. It enforces that, if supplied, `actor_ref` is non-whitespace. It does not cryptographically bind the actor to the transition in a way that survives disputed-authorship challenges. For non-repudiable transition attribution — required in FDA 21 CFR Part 11 and SOX (Sarbanes-Oxley Act) §404 regulated contexts — compose with [Actor Identity](./actor-identity.md). The State Machine record is the transition history; Actor Identity is the non-repudiation layer.

- **Tamper-evidence of the history.** The atom guarantees immutability by specification. It does not cryptographically prevent a store administrator with write access from altering history entries. For court-admissible evidence under SOX §404 and FDA Part 11, compose with [Tamper Evidence](./tamper-evidence.md), which provides cryptographic sealing of the transition history.

- **Retention of the transition history.** The atom keeps every instance and every history entry for the lifetime of the store instance. Time-bounded retention under regulatory obligation — GDPR (General Data Protection Regulation — the European Union's data protection law) Article 17, HIPAA (Health Insurance Portability and Accountability Act — the US law governing protected health information) §164.530(j), FRCP (Federal Rules of Civil Procedure — the procedural rules governing US federal civil litigation) Rule 37(e) — belongs to a composing [Retention Window](./retention-window.md) pattern.

- **Which workflow state an entity "should" be in.** The atom records the declared states and the transitions that have fired. It does not declare what the subject's state *should* be — that is the calling system's business-rule layer. An auditor asking "show me every batch that never reached `released`" cannot answer that question from this atom alone without also having the set of all batches that were instantiated (which `history` or `current` can supply) and knowing the expected terminal state for the batch type (which the declaration can supply). The composing system must drive that analysis.

- **Subject validity.** `subject_ref` is opaque. The atom does not validate it against any external record, database, or workflow engine. Instantiating a workflow for a `subject_ref` that does not correspond to any real entity creates a valid workflow instance governing a nonexistent subject. The calling system is responsible for ensuring `subject_ref` values are valid before calling `instantiate`.

- **Concurrency on the same instance.** Two systems concurrently calling `fire` on the same `instance_id` must be serialized. The first succeeds; the second will observe the `current_state` left by the first and may succeed (if the resulting state has a matching declared transition) or fail (`terminal`, `invalid-transition`, or succeed with a different result depending on the declaration). Implementations must serialize state transitions on a given `instance_id`. This is identical to Approval Step's concurrency discipline.

- **Atomicity and crash semantics.** Each `fire` call writes multiple fields simultaneously (appends a history entry with multiple sub-fields, updates `current_state`, increments `next_sequence_number`). A crash mid-write that sets some fields without others would violate Invariants 5, 6, and 7. The implementor is responsible for the transactional boundary that makes all field changes in a single `fire` call change atomically. `storage-failure` is the observable signal of an aborted transition; it leaves the instance in its prior state with no partial entry written and `next_sequence_number` unchanged.

- **`fire` is not idempotent.** See Behavior section. A calling system that needs at-most-once semantics under retry conditions must supply its own idempotency key at the orchestration layer; this atom does not provide one.

- **Clock semantics.** `instantiated_at` defaults to the receiving node's wall clock when not supplied; must not be in the future. `fired_at` defaults to the receiving node's wall clock when not supplied; must not be in the future; the resolved value must be ≥ the instance's `instantiated_at` (a transition cannot predate instantiation). Backdated `fired_at` values are accepted when ≥ `instantiated_at` (documenting a transition recognized at an earlier time is valid). `fired_at` is **not** required to be monotonic across history entries — under a skewing clock a later transition may carry an earlier `fired_at`; `sequence_number` is the clock-independent, authoritative order source for the transition history. Clock skew, timezone normalization, and wall-clock monotonicity are handled at the deployment layer.

- **Distinct from Approval Step.** Approval Step is a specific state machine whose states, transitions, and semantics are fixed at the atom level. State Machine is the general case whose states and transitions are declared by the deployment. Approval Step is appropriate when the approval-gate semantics (exactly one named approver, approval-specific decision record, required-reason-on-rejection, etc.) are needed and the state machine is not configurable by the deployment. State Machine is appropriate when the process states and transitions are deployment-specific and must be declared at instantiation time. Both atoms compose into Execute Gated Workflow.

---

## Composition notes

State Machine is the general-purpose declared-state-machine primitive that Execute Gated Workflow and other multi-actor workflow compositions build on:

- **[Approval Step](./approval-step.md)** — the fixed-state sibling. Approval Step is a specific state machine (Pending / Approved / Rejected / Withdrawn) with approval-specific semantics (approver exclusivity, decision attribution, required reason on rejection). State Machine is the general declared case. A State Machine instance governing a multi-step process may have individual gate transitions guarded by Approval Step records; the guard evaluation and Approval Step consultation are the calling system's or the Execute Gated Workflow composition's responsibility.
- **[Actor Identity](./actor-identity.md)** — provides the non-repudiable attestation that binds the actor named in `actor_ref` to the transition. `actor_ref` in the history entry is an opaque reference; Actor Identity is the contract that makes that reference non-repudiable under FDA Part 11 and SOX §404. Required for regulated deployments where the transition-by-actor record must survive an authorship challenge.
- **[Tamper Evidence](./tamper-evidence.md)** — seals transition history entries against post-hoc modification. Court-admissible workflow history requires cryptographic integrity guarantees beyond this atom's spec-level immutability. Required under FDA 21 CFR Part 11.
- **[Retention Window](./retention-window.md)** — governs how long workflow instances and their transition histories are retained. This atom keeps everything for the lifetime of the store instance; time-bounded retention under GDPR Article 17, HIPAA §164.530(j), FRCP Rule 37(e), or SOX §802 is the Retention Window composition's obligation.
- **[Event Log](./event-log.md)** — the transition history within this atom has structural parallels to an Event Log (append-only, total-ordered by sequence number, `fired_at` best-effort), but Event Log has no notion of declared transitions, current state, or transition-validity enforcement. They are distinct freestanding atoms. The [Audit Trail](../compositions/audit-trail.md) composition (Event Log + Actor Identity + Retention Window + Tamper Evidence) can be layered alongside State Machine instances to provide a tamper-evident, attributed, retention-governed audit substrate; that layering belongs to the Execute Gated Workflow composition.
- **[Permissions](./permissions.md)** — governs which actors may call `fire` for which workflow instances and which actions. This atom does not check permissions on `fire` calls; access control is a composing concept.
- **[Audit Trail](../compositions/audit-trail.md)** — the canonical regulated-audit stack. In regulated deployments, each successful `fire` is an auditable event; Audit Trail provides the tamper-evident, attributed, retention-governed substrate the regulators require. This atom produces the process-state record; Audit Trail produces the regulatory evidence layer.
- **[Execute Gated Workflow](../compositions/execute-gated-workflow.md)** (`grounded` 2026-06-04) — wires State Machine + Approval Step + Permissions + Assignment + Audit Trail (substrate) into multi-actor gated workflows with tamper-evident transition histories. This atom is the declared-state-machine primitive whose lifecycle Execute Gated Workflow manages, and it is where this atom's approval-type guard *evaluation* re-converges.

This atom resolves the `workflow` category's one-atom open question by landing as the second workflow atom, establishing the category on the basis of two present atoms rather than one present atom and one planned atom.

---

## Standards references

- **FDA 21 CFR Part 11 (Electronic Records; Electronic Signatures)** — for FDA-regulated contexts: each declared state transition constitutes a regulated electronic record; the transition history is the audit trail that Part 11 §11.50 (attributability) and Part 11 §11.70 (record linking to prevent removal, substitution, or falsification) require. Composition with [Actor Identity](./actor-identity.md) provides the §11.50 attributability; composition with [Tamper Evidence](./tamper-evidence.md) provides the §11.70 non-falsifiability. Invariants 3 (only-declared-transitions), 5 (history append-only and complete), and 7 (replay determinism) are the atom-level guarantees the regulated record depends on.
- **ISO 9001:2015 §8.5.1 (Control of production and service provision)** — requires that production and service provision activities be controlled by documented procedures, including controlled transitions at defined points in the process lifecycle. A State Machine instance governing a production process is the documented process record §8.5.1 anticipates; the declaration is the procedure map; the transition history is the per-instance proof of execution.
- **BPMN 2.0 (Business Process Model and Notation 2.0 — an international standard for modeling business processes, published by the Object Management Group)** — this atom is the primitive behind a BPMN state diagram. A BPMN process model's states and sequence flows map directly to this atom's `states` and `transitions`; a BPMN lane actor maps to an `actor_ref` on `fire` calls; a BPMN gateway condition maps to a `guard` label on a declared transition.
- **HL7 FHIR Task resource** — the HL7 FHIR Task resource uses a declared workflow state machine (`Task.status`) with a defined lifecycle (`requested → accepted → in-progress → completed | failed | cancelled | rejected`). This atom is the general primitive the FHIR Task lifecycle is an instance of. A conforming FHIR Task implementation may derive its state enforcement from this atom's declared-transition model.
- **UML (Unified Modeling Language — the standard object-oriented modeling language published by the Object Management Group) statecharts and Harel statecharts** — the conceptual core of this atom. A UML statechart's states, transitions, events, and guards map directly to this atom's `states`, `transitions`, `actions`, and `guard` labels. This atom is a flat (non-hierarchical, single-active-state) Mealy / Moore finite-state-machine (a finite state machine is a computational model with a finite set of states, a start state, a set of transitions, and one active state at a time) instance; Harel nesting and parallel regions are out of scope (see Edge cases).
- **SOX (Sarbanes-Oxley Act — US law on corporate financial reporting and records integrity) §404** — internal control over financial reporting. For financial process workflows (approval chains, journal entry processing, purchase order lifecycle), State Machine instances are the process-control records SOX auditors query to verify that required control steps occurred in the declared order.
- **HIPAA §164.530(j)** — documentation requirements for covered entities: policies and procedures must be documented. Workflow instances governing patient-care or administrative processes under HIPAA may use this atom's transition history as the documentation of process execution.

Guard evaluation, non-repudiable attribution, tamper-evidence, and retention are explicitly composing-pattern obligations, not this atom's own standards obligations.

---

## Status

`grounded on Final Critique 4 — 2026-06-04` (formal layer complete 2026-06-04 — Alloy model [`state-machine.als`](./state-machine.als) + buggy twin verified in `tools/harness/`; see Lineage §Formal model). Sonnet-drafted against an Opus plan, then Opus-gated through Pass 1 (GRID), Pass 2 (EOS — the boundaries against Approval Step and Event Log hold; guard *evaluation* and the Definition Registry are extracted), Pass 3 (Linus), and a Final Critique round: one foundational finding and one refining finding, closed in-pattern (see Lineage notes). Regulated-pattern conventions baked in from the first draft. This atom **resolves the `workflow` one-atom open question** (it is the second workflow atom). The formal-layer vote was YES; the derived Alloy model (only-declared-transitions, terminal absorption, replay determinism over a declared transition relation + linear history chain, mirroring `clinical-observation.als` / `provenance.als`) verifies green — ten checks hold, four non-vacuity runs satisfiable — with a buggy twin the checker rejects on three checks. The English cleared the 92%-good threshold (foundational findings at zero) and the formal layer is discharged, so the atom is unqualified `grounded`. Under the unified methodology (3×3 baseline rounds with per-round Pass 1/2/3 numbering + Final Critique starting at Round 4), this pattern's Opus-led gating review (Pass 1/2/3 + Final Critique round) is retro-labeled Final Critique 4; the original round-naming in the Lineage notes below is preserved as historical record.

---

## Lineage notes

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
