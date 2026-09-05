---
title: Assignment
parent: Atomic Concepts
has_toc: true
toc: true
---

# Assignment

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Assignment records who is responsible for a piece of work and the full history of everyone who has held that responsibility. Each assignment is a record that links a task to the person responsible for it. It moves through three states: Active (in force), Recalled (withdrawn with no replacement), or Transferred (handed off to a new person). The pattern guarantees that a task can have at most one responsible person at a time. The handoff action (reassign) does the swap in a single step, so the task is never left with no one responsible. And because records are never overwritten or deleted, you can always reconstruct who held a task and when. Each assignment carries an opaque, immutable identifier supplied at the I/O seam; the task it is for and the actor it binds are fixed when the assignment is created and never change. It deliberately leaves out related questions — whether the person accepts the work, who is allowed to assign it, how much work one person may hold — because those are handled by separate patterns that attach to it. This makes it usable as-is for project boards, support-ticket queues, healthcare shift handoffs, legal case routing, and any other place where accountability for work needs to be tracked.

*Also known as: a work assignment, a responsibility binding, a task owner, an owner of record.*

---

## Intent

Every system that distributes work across multiple actors must answer two questions: *who is responsible for this unit of work right now*, and *what was the history of responsibility*. The first question determines accountability; the second determines auditability. Both require a record, and the record must survive reassignment, withdrawal, and transfer cleanly.

The pattern addresses a class of needs that recurs across virtually every domain where work is delegated: task assignment in project management, ticket routing in support queues, patient-to-nurse assignment in clinical workflows, job allocation in manufacturing, case assignment in legal and government systems. The shape is constant — a unit of work is bound to an actor, the binding may be transferred or recalled, and the full history of who held responsibility and when is a recoverable record.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the [Assignment] record), its own actions ([Assign], [Recall], [Reassign]), and its own operational principles (at most one [Active] [Assignment] per task; both recall and transfer are terminal; the audit history is complete). It does not implement accept/decline workflows, expiry-based auto-recall, assigner authorization rules, or work capacity constraints. Each is a separate composable atom; see Composition notes.

---

## Structure

### Identity model

Every [Assignment] known to the system has an **[Assignment Id]** — an opaque, immutable identifier host-allocated at the I/O seam (injected into the transition, not generated inside it). The id is the [Assignment]'s identity; the [Task Ref] and [Assignee Ref] are immutable *properties* of the [Assignment], not its identity.

Two assignments for the same task have different ids — a reassignment creates a new record with its own id, its own [Assigned At], and its own lifecycle. Ids are not reused after an [Assignment] reaches a terminal state.

The opaque-id model is load-bearing. Identifying an [Assignment] by [Task Ref] would make reassignments overwrite the previous record, destroying the history of who held responsibility and for how long. Identifying by the [Task Ref]–[Assignee Ref] pair would collapse re-assignments of the same actor after an intervening recall. Opaque ids preserve the one-assignment-one-id discipline that makes per-task responsibility history recoverable from the records alone.

### Inputs

- A [Task Ref] identifying the unit of work being assigned. Opaque — the atom does not know what a task is or how its lifecycle is managed.
- An [Assignee Ref] identifying the actor being assigned responsibility. Opaque — the actor registry is a separate concept.
- Actions. Every action receives the current clock reading [Now] as a **pipeline-injected input** (the pipeline's `clock_t`, supplied at the I/O seam — not read inside the transition, not trusted from the caller, and not shown as a signature parameter), used to stamp the immutable timestamps on a write. See the Logic-confinement note in Decision points.
  - [Assign] — bind a unit of work to a responsible actor, creating a new [Assignment] in [Active]. (Projected contract: `assign(task_ref, assignee_ref) → assignment_id | rejected(invalid-request | already-assigned | storage-failure)`.)
  - [Recall] — withdraw an [Active] [Assignment] without a successor, leaving the task unassigned. (Projected contract: `recall(assignment_id) → ok | rejected(not-known | not-active | storage-failure)`.)
  - [Reassign] — hand an [Active] [Assignment] off to a new actor atomically — the old [Assignment] becomes [Transferred] and a new [Active] one is created in one step. (Projected contract: `reassign(assignment_id, new_assignee_ref) → new_assignment_id | rejected(not-known | not-active | invalid-request | storage-failure)`.)
- An id source for [Assignment Id] allocation, injected at the atom's single I/O seam alongside [Now]. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the [Assignment Id] at the seam before the transition runs; the pure transition receives [Now] and the [Assignment Id] as inputs and reads no clock and mints no id internally. Neither is supplied by the business caller — which keeps the transition deterministic.

### Outputs

- The current set of [Active] assignments.
- The full set of [Recalled] and [Transferred] assignments.
- For each [Assignment]: [Assignment Id], [Task Ref], [Assignee Ref], [Assigned At], the status ([Active], [Recalled], or [Transferred]), and — where applicable — [Recalled At] or [Transferred At].
- [Assign] returns the new [Assignment Id] on success, or a rejection naming the failed precondition.
- [Recall] returns `ok` on success, or a rejection.
- [Reassign] returns the new [Assignment Id] on success, or a rejection.
- Named read queries:
  - [Active For] — returns the at-most-one [Active] [Assignment] for the given [Task Ref], or `none` if the task is currently unassigned. (Projected contract: `active_for(task_ref) → assignment | none`.)
  - [History For] — returns all assignments ([Active], [Recalled], [Transferred]) for the given [Task Ref], ordered by [Assigned At]. The complete responsibility history for the task. (Projected contract: `history_for(task_ref) → [assignment]`.)

### State

An [Assignment] occupies exactly one of three states:

- **[Active]** — the [Assignment] is in force; the assignee is the current responsible actor for the task. The only non-terminal state.
- **[Recalled]** — the [Assignment] was withdrawn by the assigner without creating a successor. The task is now unassigned. Terminal.
- **[Transferred]** — the [Assignment] was superseded by a [Reassign] that created a new [Active] [Assignment]. The task has a new responsible actor. Terminal.

[Recalled] and [Transferred] are distinct terminal states because the organizational events they represent are distinct: [Recalled] means the task is no longer assigned to anyone; [Transferred] means it has been handed off. Both are terminal, but they answer different audit questions.

Each [Assignment] carries:

- **[Assignment Id]** — opaque, immutable, host-allocated at the I/O seam (injected into the transition, not generated inside it). Set on [Assign] or the [Assign] inside [Reassign]. Never changes.
- **[Task Ref]** — opaque reference to the unit of work. Set on creation. Never changes.
- **[Assignee Ref]** — opaque reference to the responsible actor. Set on creation. Never changes.
- **[Assigned At]** — wall-time (clock time as a human would read it, not an internal counter) when the [Assignment] was created. Set on creation. Never changes.
- **status** — [Active], [Recalled], or [Transferred]. Set to [Active] on creation. (The state-field name; its canonical token is the [Assignment] Type card's `Projects:` line.)
- **[Recalled At]** — wall-time of recall. Present only in [Recalled]. Set on [Recall]. Never changes after set.
- **[Transferred At]** — wall-time of transfer. Present only in [Transferred]. Set on [Reassign]. Never changes after set.

Transitions — every transition below stamps its timestamp from the pipeline-injected [Now], and no transition reads the clock internally:

| action | from | to | guard | stamps | result | rejections |
|--------|------|----|-------|--------|--------|-----------|
| [Assign] | *(no record)* | **[Active]** | no [Active] [Assignment] for [Task Ref] | fresh [Assignment Id]; [Task Ref]; [Assignee Ref]; [Assigned At] = [Now] | the new [Assignment Id] | [Invalid Request]; [Already Assigned]; [Storage Failure] |
| [Recall] | [Active] | **[Recalled]** | [Assignment] is [Active] | [Recalled At] = [Now]; task now unassigned | `ok` | [Not Known]; [Not Active]; [Storage Failure] |
| [Reassign] | [Active] | **[Transferred]** | [Assignment] is [Active] | [Transferred At] = [Now]; **and atomically** a new [Active] [Assignment] for the same [Task Ref] with [New Assignee Ref] and [Assigned At] = [Now] | the new [Assignment Id] | [Not Known]; [Not Active]; [Invalid Request]; [Storage Failure] |

Four semantics the cells cannot hold:

- *[Reassign] is one atomic step, not recall-then-assign.* [Reassign] moves the old [Assignment] [Active] → [Transferred] and creates the new [Active] [Assignment] for the same [Task Ref] in a single committed transition. There is no observable state in which both are [Active], or in which neither is — the handoff never leaves the task with no responsible actor and never with two (Invariant 7). Composing systems that implement recall-then-assign instead introduce a gap during which the task is unassigned; [Reassign] eliminates the gap.
- *A failed guard or write writes nothing.* If [Assign] finds an [Active] [Assignment] already exists for the [Task Ref] it is rejected [Already Assigned] and no record is created. If [Recall] or [Reassign] is attempted on an unknown or already-terminal [Assignment] it is rejected ([Not Known] / [Not Active]) and no record changes. If the store write fails after the preconditions pass, the action is rejected [Storage Failure]: for [Assign] no [Assignment] is created; for [Recall] the [Assignment] remains [Active]; for [Reassign] both writes are rolled back — the old [Assignment] remains [Active] and no new one exists.
- *The two terminal states are absorbing.* There are no transitions out of [Recalled] or [Transferred]; the atom has no `un-recall`, `un-transfer`, or `reactivate` surface. A [Recall] or [Reassign] on an already-terminal [Assignment] is rejected [Not Active] (Invariants 3, 4).
- *Rejection priority is fixed.* For [Recall] and [Reassign] the order is [Not Known] → [Not Active] → ([Invalid Request] for [Reassign]) → [Storage Failure]; for [Assign] it is [Invalid Request] → [Already Assigned] → [Storage Failure]. The full per-action preconditions are in Decision points.

### Flow

1. **Assign.** A work distributor calls [Assign]. The atom confirms no [Active] [Assignment] already exists for the [Task Ref], creates the [Assignment] in [Active], and returns the id. *(Start.)*
2. **Active.** The assignee holds responsibility. The task proceeds under their ownership.
3. **Resolve — three branches:**
   - **Recall.** The assigner withdraws the [Assignment]: [Recall]. [Active] → [Recalled]. The task is unassigned; the assigner may re-assign separately.
   - **Reassign.** The assigner transfers responsibility: [Reassign]. [Active] → [Transferred]; a new [Active] [Assignment] is created. The task has a new responsible actor without a gap in coverage.
   - **External completion.** The composing system (Personal Todo, or the host task tracker) records the task as complete. The [Assignment] record is not modified by the atom — completion is the task system's event, not the [Assignment]'s. The [Assignment] remains [Active] in the atom's records; the composing system decides whether to trigger a [Recall] on completion or let the [Active] [Assignment] stand as a historical record.
4. **Terminal.** The [Assignment] is in [Recalled] or [Transferred]. *(End.)*

### Decision points

Each action carries explicit preconditions. Violations are rejected, not silently absorbed.

**Logic confinement (clock and id).** The clock and the id are **pipeline-injected, supplied at the I/O seam** (Step 3 of the execution contract), never produced inside a transition and not shown as action signature parameters. [Now] (`clock_t`) is read once by the pipeline at the seam and consumed by the action; the [Assignment Id] is assigned from injected `id_t` id material at the seam, not generated internally (per the Logic Confinement Principle, see [`execution-contract.md`](../execution-contract.md)). The clock's only use is the immutable timestamp stamps inside a committed transition — [Assigned At] on [Assign] (and on the [Assign] inside [Reassign]), [Recalled At] on [Recall], [Transferred At] on [Reassign] — each set from the same injected [Now]. Each transition is thereby a pure function of its record state, inputs, [Now], and id material, with both sources auditable at the deployment layer.

- **At [Assign]** — [Task Ref] and [Assignee Ref] must be well-formed and non-empty; otherwise [Invalid Request]. There must be no [Active] [Assignment] for [Task Ref] in the system; otherwise [Already Assigned]. The atom enforces the at-most-one invariant at this boundary. If the store write fails, the atom returns [Storage Failure]; no [Assignment] is created.
- **At [Recall]** — [Assignment Id] must reference a known [Assignment]; otherwise [Not Known]. The referenced [Assignment] must be in [Active]; otherwise [Not Active]. If the store write fails, the atom returns [Storage Failure]; the [Assignment] remains [Active].
- **At [Reassign]** — [Assignment Id] must reference a known [Assignment]; otherwise [Not Known]. The referenced [Assignment] must be in [Active]; otherwise [Not Active]. [New Assignee Ref] must be well-formed and non-empty; otherwise [Invalid Request]. The transition is atomic: both the [Transferred] state of the old [Assignment] and the [Active] state of the new [Assignment] are committed together. If the transactional write fails at any point, the atom returns [Storage Failure] and both writes must be rolled back — the old [Assignment] remains [Active] and no new [Assignment] is created. A partial state where the old [Assignment] is [Transferred] but no new [Active] [Assignment] exists violates Invariant 7 and must not be observable.

### Behavior

Observed behavior, derived from how work-distribution systems are actually used:

- A task is either unassigned (no [Active] [Assignment]) or assigned (exactly one [Active] [Assignment]). There is no in-between, and there is no second [Assignment] that could produce ambiguity about who is responsible.
- [Reassign] is the preferred mechanism for handing off responsibility. It is atomic — there is no window between the old [Assignment]'s [Transferred] state and the new [Assignment]'s [Active] state where the task is unassigned. Composing systems that implement recall-then-assign introduce a gap during which the task has no responsible actor; [Reassign] eliminates the gap.
- The atom does not model whether the assignee has accepted responsibility. [Assign] creates the binding immediately; whether the assignee is notified, whether they must acknowledge, whether they can decline — all are composing concepts. The base atom models the binding as unilateral: the assigner assigns, and the [Assignment] is [Active].
- The atom does not model completion. When the task completes (in Personal Todo or the host task system), the [Assignment] record is not automatically resolved. The composing system decides: leave the [Active] [Assignment] as a record of who completed the task, or call [Recall] to close the [Assignment] record. Both are valid operational patterns; the atom supports either.
- An assignee may be assigned multiple tasks simultaneously. The at-most-one invariant is per task, not per assignee. A single actor holding [Active] assignments on ten tasks is unremarkable; each task's [Assignment] is independent.
- The full assignment history for any task is recoverable from the assignment store: all assignments ([Active], [Recalled], [Transferred]) whose [Task Ref] matches the queried task, ordered by [Assigned At]. The chain of responsibility is complete.
- **Time and id are injected at the seam, not generated inside the transition.** Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the [Assignment Id] at the deployment seam before the transition runs; [Assigned At], [Recalled At], and [Transferred At] are stamped from the injected [Now], and the core transition reads no wall clock and mints no id internally. This is the determinism the execution contract requires, and it leaves the caller signatures ([Assign], [Recall], [Reassign]) unchanged.

### Feedback

Each successful action produces an observable, measurable change:

- After [Assign] — a new [Assignment] appears in [Active] with a fresh [Assignment Id], the supplied [Task Ref] and [Assignee Ref], and [Assigned At]. Active count and total count each increase by one. The id is returned.
- After [Recall] — the [Assignment] moves [Active] → [Recalled] with [Recalled At]. Active count decreases by one; Recalled count increases by one; total count unchanged.
- After [Reassign] — the old [Assignment] moves [Active] → [Transferred] with [Transferred At]; a new [Assignment] appears in [Active] with a fresh [Assignment Id] and the new [Assignee Ref]. Active count unchanged (one removed, one added); Transferred count increases by one; total count increases by one.

Each rejected action produces an observable refusal naming the failed precondition: [Invalid Request], [Already Assigned], [Not Known], [Not Active], or [Storage Failure].

The [Active] assignment set is queryable. The full assignment store ([Active], [Recalled], [Transferred]) is queryable for audit. Per-assignment fields are observable to operators and — where appropriate — to the assignee and assigner.

Named read queries:
- [Active For] — returns the at-most-one [Active] [Assignment] for the given [Task Ref], or `none`. The result is consistent with Invariant 1: at most one [Assignment] in [Active] state per task.
- [History For] — returns all assignments for the given [Task Ref] ordered by [Assigned At]. The result is the complete responsibility chain required by Invariant 9.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the atom:

- **Invariant 1 — At most one Active assignment per task.** At any time, no [Task Ref] has more than one [Assignment] in [Active] state.
- **Invariant 2 — Assignment immutability.** Once recorded, an [Assignment]'s [Assignment Id], [Task Ref], [Assignee Ref], and [Assigned At] never change.
- **Invariant 3 — Status monotonicity.** An [Assignment]'s status transitions only in one direction: [Active] → [Recalled] or [Active] → [Transferred]. No [Assignment] returns from a terminal state to [Active].
- **Invariant 4 — Terminal states are absorbing.** Once an [Assignment] is in [Recalled] or [Transferred], no further transitions occur for that [Assignment Id].
- **Invariant 5 — Id stability.** An [Assignment]'s [Assignment Id] is set on creation and never changes.
- **Invariant 6 — No id reuse.** No two assignments share an [Assignment Id] across the lifetime of the system.
- **Invariant 7 — Reassign atomicity.** After a successful [Reassign], exactly one [Assignment] is [Active] for the affected [Task Ref] — the new one. The old [Assignment] is in [Transferred]. There is no observable state in which both are [Active], or in which neither is [Active].
- **Invariant 8 — Timestamp ordering.** For any [Assignment] in [Recalled] state, [Assigned At] ≤ [Recalled At]. For any [Assignment] in [Transferred] state, [Assigned At] ≤ [Transferred At]. Both are best-effort under non-monotonic clocks; each timestamp is stamped once from the injected [Now], never re-derived from the current clock.
- **Invariant 9 — Complete responsibility history.** For any [Task Ref], the set of all assignments whose [Task Ref] matches it records the complete chain of responsibility: every actor who held the [Assignment], when they received it, and when and how it ended.
- **Invariant 10 — Assignment store durability.** Once recorded, an [Assignment] is never deleted from the store. [Recall] transitions an [Assignment] from [Active] to [Recalled]; [Reassign] transitions an [Assignment] from [Active] to [Transferred] and creates a new [Active] [Assignment]. Neither operation removes any record. The total assignment count is monotonically non-decreasing.

At-most-one-Active-per-task and reassign atomicity together give the *unambiguous accountability* property — at any moment, the question "who is responsible for this task?" has exactly one answer or no answer, never two answers. Assignment immutability, complete responsibility history, and assignment store durability together give the *auditability* property — the full chain of responsibility for any task is recoverable from the assignment store alone, and no record is ever silently removed.

---

## Examples

The same atom, four domains, identical mechanic.

### Project management — task handoff mid-sprint

A sprint board has a task *"implement login flow"* (task_ref: `task_t44`). The engineering manager assigns it to a developer: `assign(task_t44, dev_alice) → assignment_id a1`. Alice picks it up. Mid-sprint, Alice is pulled onto a production incident; the manager reassigns: `reassign(a1, dev_bob) → a2`. Alice's assignment (`a1`) moves to [Transferred]; Bob's (`a2`) is now [Active]. The sprint retrospective can reconstruct: Alice held the task from day 1 to day 4; Bob held it from day 4 to completion. At no point was the task unassigned.

### Customer support — ticket escalation

A support ticket is auto-assigned to a tier-1 agent: `assign(ticket_t99, agent_tier1_j) → a5`. The agent cannot resolve the issue; they escalate. The supervisor calls `reassign(a5, agent_tier2_k) → a6`. Tier-2 resolves it. The audit log shows: tier-1 held the ticket for 2 hours, tier-2 for 45 minutes. If the customer complains about resolution time, both ownership windows are on record. SLA (Service-Level Agreement — a commitment to a measurable level of service, such as a maximum resolution time) calculations use the [Assigned At] and [Transferred At] of each assignment record.

### Healthcare — patient-to-nurse assignment on a ward

A patient is admitted and assigned to the on-call nurse: `assign(patient_p31, nurse_n7) → a12`. At shift change, the charge nurse reassigns: `reassign(a12, nurse_n14) → a13`. If a clinical incident occurs overnight, the investigation can determine which nurse held the assignment at what time. The assignment store is the accountability record; the clinical event log (Event Log atom) is the action record; both compose to answer the investigation's questions.

### Rejection paths

A single sequence exercising all rejection reasons:

- `assign(task_t1, dev_a) → a1` — accepted.
- `assign(task_t1, dev_b)` → rejected `already-assigned` (Invariant 1; `task_t1` already has an [Active] [Assignment] in `a1`).
- `recall(unknown_id)` → rejected `not-known`.
- `recall(a1) → ok` — `a1` moves to [Recalled]; `task_t1` is now unassigned.
- `recall(a1)` → rejected `not-active` (a1 is already [Recalled]; terminal).
- `reassign(a1, dev_c)` → rejected `not-active` (a1 is terminal).
- `assign(task_t1, dev_b) → a2` — accepted; `task_t1` is now unassigned so a fresh [Assignment] is allowed.
- `reassign(a2, "")` → rejected `invalid-request` (empty assignee).
- `assign(task_t2, dev_c)` → rejected `storage-failure` (store write fails; no [Assignment] created; `task_t2` remains unassigned).

All five rejection reasons (`invalid-request`, `already-assigned`, `not-known`, `not-active`, `storage-failure`) exercised in one thread.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Accept/decline workflow.** The atom creates the binding immediately; whether the assignee must acknowledge or can decline belongs to a Workflow / Acceptance composing pattern. The base atom models assignment as unilateral.
- **Expiry-based auto-recall.** The atom does not model time-bounded assignments that expire automatically. A deadline-based [Assignment] composes with a Temporal Grant pattern that triggers [Recall] at expiry.
- **Assigner authorization.** The atom does not check whether the actor issuing [Assign] or [Reassign] is permitted to do so. That check belongs to [Permissions](./permissions.md) composing with the [Assign] action before it is called.
- **Assigner attribution.** The atom does not record who issued the [Assignment]. Assigner identity — *which actor created this [Assignment]* — belongs to [Actor Identity](./actor-identity.md) composing with [Assign] (recording an attestation alongside the [Assignment] record).
- **Capacity constraints.** The atom does not limit how many [Active] assignments an assignee may hold simultaneously. A workload cap (e.g., no agent holds more than five tickets) belongs to a Capacity Constraint composing pattern that checks the assignee's [Active] count before allowing [Assign].
- **Group or team assignment.** The atom binds exactly one [Assignee Ref] per [Active] [Assignment] per task. Assigning to a team (where any team member may act) belongs to a Team Assignment composing pattern.
- **Task lifecycle.** The atom does not know whether a task is open, closed, or deleted. [Assign] accepts any well-formed [Task Ref]; validating that the task exists and is in an assignable state is the composing system's responsibility.
- **Completion handling.** When a task is completed (in Personal Todo or the host system), the [Assignment] is not automatically recalled. The composing system decides whether to [Recall] the [Assignment] on completion. Both patterns — leaving it [Active] as a completion-attribution record, or recalling it to close the [Assignment] lifecycle — are valid.
- **Concurrent assign races.** Two simultaneous [Assign] calls for the same [Task Ref] resolve serially under the host environment's serialization guarantees. The first wins; the second receives [Already Assigned].
- **Reassign atomicity and crash semantics.** [Reassign] is specified as atomic. A crash between marking the old [Assignment] [Transferred] and creating the new [Active] one would leave the task unassigned and Invariant 1 vacuously satisfied but Invariant 7 violated. The implementor is responsible for the transactional boundary that makes atomicity hold.
- **Reassign storage failure.** A store-write failure during [Reassign] is a two-write scenario: the old [Assignment] must be marked [Transferred] and a new [Active] [Assignment] must be created. If either write fails, the atom returns [Storage Failure] and both writes must be rolled back — the old [Assignment] remains [Active] and no new [Assignment] is created. A partial state where the old [Assignment] is [Transferred] but no new [Active] [Assignment] exists violates Invariant 7 (the task is unassigned after a [Reassign] call that the caller may believe succeeded). Implementations that cannot provide full transactional rollback must detect and repair this partial state on recovery before accepting new requests. The two-write transactional obligation is the instance of the multi-write atomicity rule described in [`execution-contract.md`](../execution-contract.md) §Multi-write atomicity.
- **Clock semantics.** [Assigned At], [Recalled At], and [Transferred At] are wall-time stamped from the injected [Now] (see Inputs and Behavior). Skew, monotonicity, and timezone handling are handled at the deployment layer. Invariant 8 is best-effort under non-monotonic clocks.

Where the atom breaks down: when responsibility is genuinely shared simultaneously (requiring group assignment); when assignment must be time-bounded without external revocation (requiring temporal grant); when the assigner must be authorized before assigning (requiring permissions composition); when the assignee must consent (requiring workflow composition).

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Assignment

The record this atom defines: a binding of a unit of work to the actor responsible for completing it. It carries its [Assignment Id], [Task Ref], [Assignee Ref], [Assigned At], the status field below, and — where applicable — [Recalled At] or [Transferred At]. The [Assignment Id], [Task Ref], [Assignee Ref], and [Assigned At] are immutable from creation. Its status field holds one of [Active], [Recalled], or [Transferred]; at most one [Assignment] per task is [Active] at any time.

Kind: Type
Projects: status

#### Assign

The behavior that binds a unit of work to a responsible actor, recording a new [Assignment]. It assigns a fresh [Assignment Id] from injected id material at the seam, sets [Task Ref], [Assignee Ref], and [Assigned At] = [Now], enters the [Assignment] in [Active], and returns the [Assignment Id] (or a rejection naming the failed precondition). It refuses [Already Assigned] if an [Active] [Assignment] already exists for the [Task Ref].

Kind: Operation

#### Recall

The behavior that withdraws an [Active] [Assignment] without a successor, leaving the task unassigned. Permitted only on an [Active] [Assignment]; it moves the [Assignment] [Active] → [Recalled] and stamps [Recalled At]. On an unknown id it is rejected [Not Known]; on an already-terminal [Assignment] it is rejected [Not Active].

Kind: Operation

#### Reassign

The behavior that hands an [Active] [Assignment] off to a new actor atomically. In one committed step it moves the old [Assignment] [Active] → [Transferred] (stamping [Transferred At]) and creates a new [Active] [Assignment] for the same [Task Ref] with the [New Assignee Ref]; it returns the new [Assignment Id]. There is no observable state in which both are [Active] or neither is (Invariant 7).

Kind: Operation

#### Active For

The read query that returns the at-most-one [Active] [Assignment] for a given [Task Ref], or `none` if the task is currently unassigned. Read-only; consistent with Invariant 1.

Kind: Operation

#### History For

The read query that returns all assignments ([Active], [Recalled], [Transferred]) for a given [Task Ref], ordered by [Assigned At] — the complete responsibility chain required by Invariant 9. Read-only.

Kind: Operation

#### Assignment Id

The opaque, immutable identity of an [Assignment], host-allocated from injected id material at the I/O seam and never reused after a terminal state. The [Task Ref] and [Assignee Ref] are properties of the [Assignment], not its identity.

Kind:     Field
Field of: Assignment
Projects: assignment_id

#### Task Ref

The opaque reference identifying the unit of work an [Assignment] is for. The atom does not know what a task is or how its lifecycle is managed. Set on creation, immutable thereafter.

Kind:     Field
Field of: Assignment
Projects: task_ref

#### Assignee Ref

The opaque reference identifying the actor an [Assignment] binds responsibility to. The actor registry is a separate concept. Set on creation, immutable thereafter.

Kind:     Field
Field of: Assignment
Projects: assignee_ref

#### Assigned At

The wall-time the [Assignment] was created, stamped from the injected [Now] on [Assign] (and on the [Assign] inside [Reassign]). Immutable thereafter. [Assigned At] ≤ [Recalled At] and [Assigned At] ≤ [Transferred At] always hold.

Kind:     Field
Field of: Assignment
Projects: assigned_at

#### Recalled At

The wall-time the [Assignment] was recalled, stamped from the injected [Now] on [Recall]. Present only in [Recalled]; immutable once set.

Kind:     Field
Field of: Assignment
Projects: recalled_at

#### Transferred At

The wall-time the [Assignment] was transferred, stamped from the injected [Now] on [Reassign]. Present only in [Transferred]; immutable once set.

Kind:     Field
Field of: Assignment
Projects: transferred_at

#### New Assignee Ref

The reference to the new responsible actor [Reassign] consumes and writes into the new [Active] [Assignment]'s [Assignee Ref]. Required well-formed and non-empty. It is not stored under its own name — only the new [Assignment]'s [Assignee Ref] is stored.

Kind:         Parameter
Parameter of: Reassign
Projects:     new_assignee_ref

#### Now

The current clock reading every action consumes — the pipeline's `clock_t`, supplied at the I/O seam, never read inside the transition and never a signature parameter. Its only use is the immutable timestamp stamps inside committed transitions ([Assigned At], [Recalled At], [Transferred At]).

Kind:         Parameter
Parameter of: Assign
Projects:     now

#### Active

The single non-terminal state: the [Assignment] is in force and the assignee is the current responsible actor for the task. At most one [Assignment] per [Task Ref] is [Active]. The lifecycle proceeds [Active] → one of {[Recalled], [Transferred]}.

Kind:      Member
Member of: the assignment status
Role:      Outcome

#### Recalled

The terminal state an [Assignment] reaches when the assigner withdrew it without a successor — the task is now unassigned. Absorbing: no action transitions it elsewhere.

Kind:      Member
Member of: the assignment status
Role:      Outcome

#### Transferred

The terminal state an [Assignment] reaches when a [Reassign] superseded it with a new [Active] [Assignment] — the task has a new responsible actor. Absorbing: no action transitions it elsewhere.

Kind:      Member
Member of: the assignment status
Role:      Outcome

#### Invalid Request

The refusal [Assign] returns when [Task Ref] or [Assignee Ref] is not well-formed or is empty, and [Reassign] returns when [New Assignee Ref] is not well-formed or is empty. A guard rejection that fails before any store write; no [Assignment] is created or changed.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Already Assigned

The refusal [Assign] returns when an [Active] [Assignment] already exists for the [Task Ref]. The loser of a concurrent assign race for the same [Task Ref] also receives this. No [Assignment] is created. This is the at-most-one-Active guard (Invariant 1) enforced at the [Assign] boundary.

Kind:      Member
Member of: the Assign rejection
Role:      Outcome
Projects:  already-assigned

#### Not Known

The refusal [Recall] or [Reassign] returns when the supplied [Assignment Id] references no known [Assignment]. A lookup miss, distinct from a state rejection.

Kind:      Member
Member of: the resolving-action rejection
Role:      Outcome
Projects:  not-known

#### Not Active

The refusal [Recall] or [Reassign] returns when the referenced [Assignment] is already terminal — [Recalled] or [Transferred]. This is the terminal-absorption guard: a resolving action on an already-resolved [Assignment] is refused without modifying any record.

Kind:      Member
Member of: the resolving-action rejection
Role:      Outcome
Projects:  not-active

#### Storage Failure

The refusal any action returns when the store write fails after the preconditions pass. No [Assignment] is created (for [Assign]), the [Assignment] remains [Active] (for [Recall]), or both [Reassign] writes are rolled back. The caller must treat it as definitive.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Assignment]: #assignment
[Assign]: #assign
[Recall]: #recall
[Reassign]: #reassign
[Active For]: #active-for
[History For]: #history-for
[Assignment Id]: #assignment-id
[Task Ref]: #task-ref
[Assignee Ref]: #assignee-ref
[Assigned At]: #assigned-at
[Recalled At]: #recalled-at
[Transferred At]: #transferred-at
[New Assignee Ref]: #new-assignee-ref
[Now]: #now
[Active]: #active
[Recalled]: #recalled
[Transferred]: #transferred
[Invalid Request]: #invalid-request
[Already Assigned]: #already-assigned
[Not Known]: #not-known
[Not Active]: #not-active
[Storage Failure]: #storage-failure

---

## Composition notes

Assignment is freestanding and is designed as a direct prerequisite for the Shared Todo composition:

- **[Personal Todo](./personal-todo.md)** — the composing system wires Personal Todo's task lifecycle with Assignment's responsibility binding. When a task is added (`add` in Personal Todo), the composing system may immediately assign it. When a task is completed or deleted, the composing system decides whether to [Recall] the [Assignment] or leave it as a completion-attribution record.
- **[Permissions](./permissions.md)** — controls which actors may call [Assign], [Recall], and [Reassign]. Without Permissions composition, the atom accepts any caller with a well-formed request. In a regulated context (e.g., only a supervisor may assign; only the current assignee may recall their own [Assignment]), Permissions supplies the authorization check.
- **[Actor Identity](./actor-identity.md)** — records who issued the [Assignment]. `attest(assign_action_ref, assigner_ref, credential)` alongside [Assign] produces a non-repudiation record for each [Assignment] creation and transfer.
- **[Event Log](./event-log.md)** — records the [Assignment] lifecycle as a stream of events. Each [Assign], [Recall], and [Reassign] appends an event; the event log is the time-ordered record of work-distribution decisions.
- **[Shared Todo](../compositions/shared-todo.md)** — [Personal Todo](./personal-todo.md) + Permissions + Assignment. The composition that makes a single-user task list multi-actor: Permissions controls who can see and modify which tasks; Assignment controls who is responsible for which tasks.
- **[Multi-Party Approval](../compositions/multi-party-approval.md)** — uses Assignment to create an in-tray binding for each pending approval step, surfacing the approver's obligation as an [Active] [Assignment] they must act on. The [Assignment] is the work-queue mechanism; the approval decision is the terminal event that resolves it.
- **Workflow / Acceptance** *(forthcoming)* — adds accept/decline to the [Assignment] lifecycle. The [Assignment] moves through Pending → Accepted | Declined rather than becoming [Active] immediately on [Assign].
- **Capacity Constraint** *(forthcoming)* — limits how many [Active] assignments an assignee may hold simultaneously. Checks `active_assignments_for(assignee_ref).count < cap` before allowing [Assign] or [Reassign].
- **Temporal Grant** *(forthcoming)* — wraps assignment with an expiry deadline, triggering [Recall] at the deadline if the [Assignment] has not already resolved.
- **Team Assignment** *(forthcoming)* — assigns a task to a team rather than an individual; any team member may claim responsibility; the first to claim converts the team assignment to an individual Assignment.

---

## Standards references

Assignment is a productivity primitive with broad operational anchoring and lighter regulatory footprint than the compliance atoms:

- **ITIL (IT Infrastructure Library)** — incident and request management define assignment as the binding of a work item to a responsible individual or group. ITIL's assignment and escalation mechanics are the operational reference for the support-queue examples.
- **ISO/IEC 20000 (IT Service Management)** — formalizes incident assignment and reassignment as required process steps with audit-trail obligations. The assignment store satisfies the audit requirement.
- **HL7 FHIR (Health Level Seven Fast Healthcare Interoperability Resources — the standard for exchanging healthcare data electronically) Task resource** — healthcare task management defines assignment as a `Task.owner` binding, with history of ownership tracked per task. The atom's responsibility-history invariant (Invariant 9) is the FHIR-compatible form.
- **PMI PMBOK (Project Management Body of Knowledge)** — responsibility assignment matrices (RAM / RACI) are the structured form of the same mechanic: binding work packages to responsible individuals. The atom is the dynamic runtime form of a RACI row.
- **GDPR (EU General Data Protection Regulation) Article 5(1)(f) and Article 32** — in systems processing personal data, assignment records establish who had access and responsibility for personal data at what time. The assignment store is part of the accountability trail.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — freestanding-atom posture; the discipline of keeping accept/decline, authorization, capacity, and expiry as composing concepts rather than absorbing them.
- **Eiffel's design-by-contract** — preconditions on [Assign], [Recall], [Reassign]; named rejection reasons.

---

## Status

`grounded on Final Critique 4 — 2026-06-18` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 4 — 2026-06-18
formal: verified — assignment.tla + 1 twin, 2026-06-03
last gate: 2026-06-18 — Final Critique 4, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/assignment.md`.
