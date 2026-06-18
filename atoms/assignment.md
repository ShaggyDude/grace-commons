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


> A productivity primitive: a binding of a unit of work to the actor responsible for completing it. Each assignment has an opaque immutable id host-allocated at the I/O seam (injected into the transition, not generated inside it); the task reference and assignee reference are immutable properties set at assignment time. An assignment is Active until recalled or transferred. At most one assignment is Active per task at any time.

---

## Intent

Every system that distributes work across multiple actors must answer two questions: *who is responsible for this unit of work right now*, and *what was the history of responsibility*. The first question determines accountability; the second determines auditability. Both require a record, and the record must survive reassignment, withdrawal, and transfer cleanly.

The pattern addresses a class of needs that recurs across virtually every domain where work is delegated: task assignment in project management, ticket routing in support queues, patient-to-nurse assignment in clinical workflows, job allocation in manufacturing, case assignment in legal and government systems. The shape is constant — a unit of work is bound to an actor, the binding may be transferred or recalled, and the full history of who held responsibility and when is a recoverable record.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the assignment record), its own actions (assign, recall, reassign), and its own operational principles (at most one Active assignment per task; both recall and transfer are terminal; the audit history is complete). It does not implement accept/decline workflows, expiry-based auto-recall, assigner authorization rules, or work capacity constraints. Each is a separate composable atom; see Composition notes.

---

## Summary

Assignment records who is responsible for a piece of work and the full history of everyone who has held that responsibility. Each assignment is a record that links a task to the person responsible for it, and it moves through three states: Active (in force), Recalled (withdrawn with no replacement), or Transferred (handed off to a new person). The pattern guarantees that a task can have at most one responsible person at a time, and the handoff action (reassign) does the swap in a single step so the task is never left with no one responsible — and because records are never overwritten or deleted, you can always reconstruct who held a task and when. It deliberately leaves out related questions — whether the person accepts the work, who is allowed to assign it, how much work one person may hold — because those are handled by separate patterns that attach to it. This makes it usable as-is for project boards, support-ticket queues, healthcare shift handoffs, legal case routing, and any other place where accountability for work needs to be tracked.

---

## Structure

### Identity model

Every assignment known to the system has an **`assignment_id`** — an opaque, immutable identifier host-allocated at the I/O seam (injected into the transition, not generated inside it). The id is the assignment's identity; the task reference and assignee reference are immutable *properties* of the assignment, not its identity.

Two assignments for the same task have different ids — a reassignment creates a new record with its own id, its own `assigned_at`, and its own lifecycle. Ids are not reused after an assignment reaches a terminal state.

The opaque-id model is load-bearing. Identifying an assignment by `task_ref` would make reassignments overwrite the previous record, destroying the history of who held responsibility and for how long. Identifying by `(task_ref, assignee_ref)` would collapse re-assignments of the same actor after an intervening recall. Opaque ids preserve the one-assignment-one-id discipline that makes per-task responsibility history recoverable from the records alone.

### Inputs

- A task reference identifying the unit of work being assigned. Opaque — the atom does not know what a task is or how its lifecycle is managed.
- An assignee reference identifying the actor being assigned responsibility. Opaque — the actor registry is a separate concern.
- Actions:
  - `assign(task_ref, assignee_ref) → assignment_id | rejected(invalid-request | already-assigned | storage-failure)`
  - `recall(assignment_id) → ok | rejected(not-known | not-active | storage-failure)`
  - `reassign(assignment_id, new_assignee_ref) → new_assignment_id | rejected(not-known | not-active | invalid-request | storage-failure)`
- A clock providing wall-time timestamps and an id source for `assignment_id` allocation, both injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the `assignment_id` at the seam before the transition runs; the pure transition receives `now` and `assignment_id` as inputs and reads no clock and mints no id internally. Neither is supplied by the business caller — which keeps the transition deterministic.

### Outputs

- The current set of Active assignments.
- The full set of Recalled and Transferred assignments.
- For each assignment: `assignment_id`, `task_ref`, `assignee_ref`, `assigned_at`, `status`, and — where applicable — `recalled_at` or `transferred_at`.
- `assign` returns the new `assignment_id` on success, or a rejection naming the failed precondition.
- `recall` returns `ok` on success, or a rejection.
- `reassign` returns the new `assignment_id` on success, or a rejection.
- Named read queries:
  - `active_for(task_ref) → assignment | none` — returns the at-most-one Active assignment for the given `task_ref`, or `none` if the task is currently unassigned.
  - `history_for(task_ref) → [assignment]` — returns all assignments (Active, Recalled, Transferred) for the given `task_ref`, ordered by `assigned_at`. The complete responsibility history for the task.

### State

An assignment occupies exactly one of three states:

- **Active** — the assignment is in force; the assignee is the current responsible actor for the task.
- **Recalled** — the assignment was withdrawn by the assigner without creating a successor. The task is now unassigned. Terminal.
- **Transferred** — the assignment was superseded by a `reassign` that created a new Active assignment. The task has a new responsible actor. Terminal.

Recalled and Transferred are distinct terminal states because the organizational events they represent are distinct: Recalled means the task is no longer assigned to anyone; Transferred means it has been handed off. Both are terminal, but they answer different audit questions.

Each assignment carries:

- **`assignment_id`** — opaque, immutable, host-allocated at the I/O seam (injected into the transition, not generated inside it). Set on `assign` or the `assign` inside `reassign`. Never changes.
- **`task_ref`** — opaque reference to the unit of work. Set on creation. Never changes.
- **`assignee_ref`** — opaque reference to the responsible actor. Set on creation. Never changes.
- **`assigned_at`** — wall-time (clock time as a human would read it, not an internal counter) when the assignment was created. Set on creation. Never changes.
- **`status`** — `active`, `recalled`, or `transferred`. Set to `active` on creation.
- **`recalled_at`** — wall-time of recall. Present only in Recalled. Set on `recall`. Never changes after set.
- **`transferred_at`** — wall-time of transfer. Present only in Transferred. Set on `reassign`. Never changes after set.

Transitions:

- `assign(task_ref, assignee_ref)` → a new assignment is created in Active with a fresh `assignment_id`, the supplied `task_ref` and `assignee_ref`, and `assigned_at` stamped from the injected `now`. Returns `assignment_id`.
- `recall(assignment_id)` → the assignment at `assignment_id` moves Active → Recalled; `recalled_at` stamped from the injected `now`. Returns `ok`. The task is now unassigned.
- `reassign(assignment_id, new_assignee_ref)` → atomically: the assignment at `assignment_id` moves Active → Transferred (`transferred_at` stamped from the injected `now`); a new assignment is created in Active for the same `task_ref` with `new_assignee_ref` and `assigned_at` stamped from the injected `now`. Returns the new `assignment_id`.

### Flow

1. **Assign.** A work distributor calls `assign(task_ref, assignee_ref)`. The atom confirms no Active assignment already exists for `task_ref`, creates the assignment in Active, and returns the id. *(Start.)*
2. **Active.** The assignee holds responsibility. The task proceeds under their ownership.
3. **Resolve — three branches:**
   - **Recall.** The assigner withdraws the assignment: `recall(assignment_id)`. Active → Recalled. The task is unassigned; the assigner may re-assign separately.
   - **Reassign.** The assigner transfers responsibility: `reassign(assignment_id, new_assignee_ref)`. Active → Transferred; a new Active assignment is created. The task has a new responsible actor without a gap in coverage.
   - **External completion.** The composing system (Personal Todo, or the host task tracker) records the task as complete. The assignment record is not modified by the atom — completion is the task system's event, not the assignment's. The assignment remains Active in the atom's records; the composing system decides whether to trigger a `recall` on completion or let the Active assignment stand as a historical record.
4. **Terminal.** The assignment is in Recalled or Transferred. *(End.)*

### Decision points

- **At `assign(task_ref, assignee_ref)`** — `task_ref` and `assignee_ref` must be well-formed and non-empty; otherwise `invalid-request`. There must be no Active assignment for `task_ref` in the system; otherwise `already-assigned`. The atom enforces the at-most-one invariant at this boundary. If the store write fails, the atom returns `rejected(storage-failure)`; no assignment is created.
- **At `recall(assignment_id)`** — `assignment_id` must reference a known assignment; otherwise `not-known`. The referenced assignment must be in Active; otherwise `not-active`. If the store write fails, the atom returns `rejected(storage-failure)`; the assignment remains Active.
- **At `reassign(assignment_id, new_assignee_ref)`** — `assignment_id` must reference a known assignment; otherwise `not-known`. The referenced assignment must be in Active; otherwise `not-active`. `new_assignee_ref` must be well-formed and non-empty; otherwise `invalid-request`. The transition is atomic: both the Transferred state of the old assignment and the Active state of the new assignment are committed together. If the transactional write fails at any point, the atom returns `rejected(storage-failure)` and both writes must be rolled back — the old assignment remains Active and no new assignment is created. A partial state where the old assignment is Transferred but no new Active assignment exists violates Invariant 7 and must not be observable.

### Behavior

Observed behavior, derived from how work-distribution systems are actually used:

- A task is either unassigned (no Active assignment) or assigned (exactly one Active assignment). There is no in-between, and there is no second assignment that could produce ambiguity about who is responsible.
- Reassign is the preferred mechanism for handing off responsibility. It is atomic — there is no window between the old assignment's Transferred state and the new assignment's Active state where the task is unassigned. Composing systems that implement recall-then-assign introduce a gap during which the task has no responsible actor; reassign eliminates the gap.
- The atom does not model whether the assignee has accepted responsibility. `assign` creates the binding immediately; whether the assignee is notified, whether they must acknowledge, whether they can decline — all are composing concerns. The base atom models the binding as unilateral: the assigner assigns, and the assignment is Active.
- The atom does not model completion. When the task completes (in Personal Todo or the host task system), the assignment record is not automatically resolved. The composing system decides: leave the Active assignment as a record of who completed the task, or call `recall` to close the assignment record. Both are valid operational patterns; the atom supports either.
- An assignee may be assigned multiple tasks simultaneously. The at-most-one invariant is per task, not per assignee. A single actor holding Active assignments on ten tasks is unremarkable; each task's assignment is independent.
- The full assignment history for any task is recoverable from the assignment store: all assignments (Active, Recalled, Transferred) where `assignment.task_ref = task_ref`, ordered by `assigned_at`. The chain of responsibility is complete.
- **Time and id are injected at the seam, not generated inside the transition.** Per the Logic Confinement Principle (`execution-contract.md`), the host reads the clock and allocates the `assignment_id` at the deployment seam before the transition runs; `assigned_at`, `recalled_at`, and `transferred_at` are stamped from the injected `now`, and the core transition reads no wall clock and mints no id internally. This is the determinism the execution contract requires, and it leaves the caller signatures (`assign`, `recall`, `reassign`) unchanged.

### Feedback

Each successful action produces an observable, measurable change:

- After `assign` — a new assignment appears in Active with a fresh `assignment_id`, the supplied `task_ref` and `assignee_ref`, and `assigned_at`. Active count and total count each increase by one. The id is returned.
- After `recall` — the assignment moves Active → Recalled with `recalled_at`. Active count decreases by one; Recalled count increases by one; total count unchanged.
- After `reassign` — the old assignment moves Active → Transferred with `transferred_at`; a new assignment appears in Active with a fresh `assignment_id` and the new `assignee_ref`. Active count unchanged (one removed, one added); Transferred count increases by one; total count increases by one.

Each rejected action produces an observable refusal naming the failed precondition: `invalid-request`, `already-assigned`, `not-known`, `not-active`, or `storage-failure`.

The Active assignment set is queryable. The full assignment store (Active, Recalled, Transferred) is queryable for audit. Per-assignment fields are observable to operators and — where appropriate — to the assignee and assigner.

Named read queries:
- `active_for(task_ref)` — returns the at-most-one Active assignment for `task_ref`, or `none`. The result is consistent with Invariant 1: at most one assignment in Active state per task.
- `history_for(task_ref)` — returns all assignments for `task_ref` ordered by `assigned_at`. The result is the complete responsibility chain required by Invariant 9.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the atom:

- **Invariant 1 — At most one Active assignment per task.** At any time, no task_ref has more than one assignment in Active state.
- **Invariant 2 — Assignment immutability.** Once recorded, an assignment's `assignment_id`, `task_ref`, `assignee_ref`, and `assigned_at` never change.
- **Invariant 3 — Status monotonicity.** An assignment's status transitions only in one direction: Active → Recalled or Active → Transferred. No assignment returns from a terminal state to Active.
- **Invariant 4 — Terminal states are absorbing.** Once an assignment is in Recalled or Transferred, no further transitions occur for that `assignment_id`.
- **Invariant 5 — Id stability.** An assignment's `assignment_id` is set on creation and never changes.
- **Invariant 6 — No id reuse.** No two assignments share an `assignment_id` across the lifetime of the system.
- **Invariant 7 — Reassign atomicity.** After a successful `reassign`, exactly one assignment is Active for the affected `task_ref` — the new one. The old assignment is in Transferred. There is no observable state in which both are Active, or in which neither is Active.
- **Invariant 8 — Timestamp ordering.** For any assignment in Recalled state, `assigned_at ≤ recalled_at`. For any assignment in Transferred state, `assigned_at ≤ transferred_at`. Both are best-effort under non-monotonic clocks; each timestamp is stamped once from the injected `now`, never re-derived from the current clock.
- **Invariant 9 — Complete responsibility history.** For any `task_ref`, the set of all assignments where `assignment.task_ref = task_ref` records the complete chain of responsibility: every actor who held the assignment, when they received it, and when and how it ended.
- **Invariant 10 — Assignment store durability.** Once recorded, an assignment is never deleted from the store. `recall` transitions an assignment from Active to Recalled; `reassign` transitions an assignment from Active to Transferred and creates a new Active assignment. Neither operation removes any record. The total assignment count is monotonically non-decreasing.

At-most-one-Active-per-task and reassign atomicity together give the *unambiguous accountability* property — at any moment, the question "who is responsible for this task?" has exactly one answer or no answer, never two answers. Assignment immutability, complete responsibility history, and assignment store durability together give the *auditability* property — the full chain of responsibility for any task is recoverable from the assignment store alone, and no record is ever silently removed.

---

## Examples

The same atom, four domains, identical mechanic.

### Project management — task handoff mid-sprint

A sprint board has a task *"implement login flow"* (task_ref: `task_t44`). The engineering manager assigns it to a developer: `assign(task_t44, dev_alice) → assignment_id a1`. Alice picks it up. Mid-sprint, Alice is pulled onto a production incident; the manager reassigns: `reassign(a1, dev_bob) → a2`. Alice's assignment (`a1`) moves to Transferred; Bob's (`a2`) is now Active. The sprint retrospective can reconstruct: Alice held the task from day 1 to day 4; Bob held it from day 4 to completion. At no point was the task unassigned.

### Customer support — ticket escalation

A support ticket is auto-assigned to a tier-1 agent: `assign(ticket_t99, agent_tier1_j) → a5`. The agent cannot resolve the issue; they escalate. The supervisor calls `reassign(a5, agent_tier2_k) → a6`. Tier-2 resolves it. The audit log shows: tier-1 held the ticket for 2 hours, tier-2 for 45 minutes. If the customer complains about resolution time, both ownership windows are on record. SLA (Service-Level Agreement — a commitment to a measurable level of service, such as a maximum resolution time) calculations use `assigned_at` and `transferred_at` per assignment record.

### Healthcare — patient-to-nurse assignment on a ward

A patient is admitted and assigned to the on-call nurse: `assign(patient_p31, nurse_n7) → a12`. At shift change, the charge nurse reassigns: `reassign(a12, nurse_n14) → a13`. If a clinical incident occurs overnight, the investigation can determine which nurse held the assignment at what time. The assignment store is the accountability record; the clinical event log (Event Log atom) is the action record; both compose to answer the investigation's questions.

### Rejection paths

A single sequence exercising all rejection reasons:

- `assign(task_t1, dev_a) → a1` — accepted.
- `assign(task_t1, dev_b)` → rejected `already-assigned` (Invariant 1; `task_t1` already has an Active assignment in `a1`).
- `recall(unknown_id)` → rejected `not-known`.
- `recall(a1) → ok` — `a1` moves to Recalled; `task_t1` is now unassigned.
- `recall(a1)` → rejected `not-active` (a1 is already Recalled; terminal).
- `reassign(a1, dev_c)` → rejected `not-active` (a1 is terminal).
- `assign(task_t1, dev_b) → a2` — accepted; `task_t1` is now unassigned so a fresh assignment is allowed.
- `reassign(a2, "")` → rejected `invalid-request` (empty assignee).
- `assign(task_t2, dev_c)` → rejected `storage-failure` (store write fails; no assignment created; `task_t2` remains unassigned).

All five rejection reasons (`invalid-request`, `already-assigned`, `not-known`, `not-active`, `storage-failure`) exercised in one thread.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Accept/decline workflow.** The atom creates the binding immediately; whether the assignee must acknowledge or can decline belongs to a Workflow / Acceptance composing pattern. The base atom models assignment as unilateral.
- **Expiry-based auto-recall.** The atom does not model time-bounded assignments that expire automatically. A deadline-based assignment composes with a Temporal Grant pattern that triggers `recall` at expiry.
- **Assigner authorization.** The atom does not check whether the actor issuing `assign` or `reassign` is permitted to do so. That check belongs to Permissions composing with the `assign` action before it is called.
- **Assigner attribution.** The atom does not record who issued the assignment. Assigner identity — *which actor created this assignment* — belongs to Actor Identity composing with `assign` (recording an attestation alongside the assignment record).
- **Capacity constraints.** The atom does not limit how many Active assignments an assignee may hold simultaneously. A workload cap (e.g., no agent holds more than five tickets) belongs to a Capacity Constraint composing pattern that checks the assignee's Active count before allowing `assign`.
- **Group or team assignment.** The atom binds exactly one `assignee_ref` per Active assignment per task. Assigning to a team (where any team member may act) belongs to a Team Assignment composing pattern.
- **Task lifecycle.** The atom does not know whether a task is open, closed, or deleted. `assign` accepts any well-formed `task_ref`; validating that the task exists and is in an assignable state is the composing system's responsibility.
- **Completion handling.** When a task is completed (in Personal Todo or the host system), the assignment is not automatically recalled. The composing system decides whether to recall the assignment on completion. Both patterns — leaving it Active as a completion-attribution record, or recalling it to close the assignment lifecycle — are valid.
- **Concurrent assign races.** Two simultaneous `assign` calls for the same `task_ref` resolve serially under the host environment's serialization guarantees. The first wins; the second receives `already-assigned`.
- **Reassign atomicity and crash semantics.** `reassign` is specified as atomic. A crash between marking the old assignment Transferred and creating the new Active one would leave the task unassigned and Invariant 1 vacuously satisfied but Invariant 7 violated. The implementor is responsible for the transactional boundary that makes atomicity hold.
- **Reassign storage failure.** A store-write failure during `reassign` is a two-write scenario: the old assignment must be marked Transferred and a new Active assignment must be created. If either write fails, the atom returns `rejected(storage-failure)` and both writes must be rolled back — the old assignment remains Active and no new assignment is created. A partial state where the old assignment is Transferred but no new Active assignment exists violates Invariant 7 (the task is unassigned after a `reassign` call that the caller may believe succeeded). Implementations that cannot provide full transactional rollback must detect and repair this partial state on recovery before accepting new requests. The two-write transactional obligation is the instance of the multi-write atomicity rule described in [`execution-contract.md`](../execution-contract.md) §Multi-write atomicity.
- **Clock semantics.** `assigned_at`, `recalled_at`, and `transferred_at` are wall-time stamped from the injected `now` (see Inputs and Behavior). Skew, monotonicity, and timezone handling are deployment concerns. Invariant 8 is best-effort under non-monotonic clocks.

Where the atom breaks down: when responsibility is genuinely shared simultaneously (requiring group assignment); when assignment must be time-bounded without external revocation (requiring temporal grant); when the assigner must be authorized before assigning (requiring permissions composition); when the assignee must consent (requiring workflow composition).

---

## Composition notes

Assignment is freestanding and is designed as a direct prerequisite for the Shared Todo composition:

- **[Personal Todo](./personal-todo.md)** — the composing system wires Personal Todo's task lifecycle with Assignment's responsibility binding. When a task is added (`add` in Personal Todo), the composing system may immediately assign it. When a task is completed or deleted, the composing system decides whether to `recall` the assignment or leave it as a completion-attribution record.
- **[Permissions](./permissions.md)** — controls which actors may call `assign`, `recall`, and `reassign`. Without Permissions composition, the atom accepts any caller with a well-formed request. In a regulated context (e.g., only a supervisor may assign; only the current assignee may recall their own assignment), Permissions supplies the authorization check.
- **[Actor Identity](./actor-identity.md)** — records who issued the assignment. `attest(assign_action_ref, assigner_ref, credential)` alongside `assign` produces a non-repudiation record for each assignment creation and transfer.
- **[Event Log](./event-log.md)** — records the assignment lifecycle as a stream of events. Each `assign`, `recall`, and `reassign` appends an event; the event log is the time-ordered record of work-distribution decisions.
- **[Shared Todo](../compositions/shared-todo.md)** — [Personal Todo](./personal-todo.md) + Permissions + Assignment. The composition that makes a single-user task list multi-actor: Permissions controls who can see and modify which tasks; Assignment controls who is responsible for which tasks.
- **[Multi-Party Approval](../compositions/multi-party-approval.md)** — uses Assignment to create an in-tray binding for each pending approval step, surfacing the approver's obligation as an active assignment they must act on. The assignment is the work-queue mechanism; the approval decision is the terminal event that resolves it.
- **Workflow / Acceptance** *(forthcoming)* — adds accept/decline to the assignment lifecycle. The assignment moves through Pending → Accepted | Declined rather than becoming Active immediately on `assign`.
- **Capacity Constraint** *(forthcoming)* — limits how many Active assignments an assignee may hold simultaneously. Checks `active_assignments_for(assignee_ref).count < cap` before allowing `assign` or `reassign`.
- **Temporal Grant** *(forthcoming)* — wraps assignment with an expiry deadline, triggering `recall` at the deadline if the assignment has not already resolved.
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

- **Daniel Jackson, *The Essence of Software*** — freestanding-atom posture; the discipline of keeping accept/decline, authorization, capacity, and expiry as composing concerns rather than absorbing them.
- **Eiffel's design-by-contract** — preconditions on `assign`, `recall`, `reassign`; named rejection reasons.

---

## Status

`grounded on Final Critique 4 — 2026-06-18` (Final Critique 4 — the first AI-conducted adversarial round, fresh-reader Opus, 2026-06-18 — closed 3 foundational finding(s): clock + `assignment_id` host-injected at the seam, `storage-failure` rejection example added, named read queries `active_for`/`history_for` declared; caller signatures unchanged; see Lineage. Formal-layer vote stands YES (TLA+ model present); the time/id seam is out of model scope, so F1 does not reopen it. The pattern was grandfathered at the legacy `grounded — 2026-05-20` token until this round.) — all required structural elements resolved; identity model explicit; assign, recall, and reassign preconditions explicit; rejection paths exercised in examples across four domains; deferred concerns (accept/decline, expiry, assigner authorization, assigner attribution, capacity constraints, group assignment, task lifecycle, completion handling, concurrent races, reassign atomicity, clock semantics) named as out-of-scope with composing patterns where applicable. Second entry in `productivity`. Direct prerequisite for the Shared Todo composition.

---

## Lineage notes

Assignment is drafted as the second prerequisite for the Shared Todo composition, following Permissions. Unlike the compliance atoms, Assignment carries no external regulatory acceptance bar, so the regulated-pattern conventions (Regulated adversarial scenarios, Generation acceptance) are not required.

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Clean. All nine MUSE (the framework version, v1.1, that GRID's nodes are drawn from) nodes populated. The `reassign` action is the structural novelty: it is simultaneously a state transition on an existing assignment (Active → Transferred) and the creation of a new assignment (Active). Both halves are captured in State (the Transferred terminal state and the new Active creation), Decision points (the atomicity requirement and the transactional boundary responsibility), and Invariants (Invariant 7 — reassign atomicity). The three-branch Flow (recall, reassign, external-completion-no-action) covers the full lifecycle including the deliberate design decision to leave completion handling to the composing system.

**Pass 2 — Conceptual independence (EOS).** Clean. Eight concerns were candidates for absorption and are all correctly named as composing patterns:

- *Accept/decline* — whether the assignee must consent recurs across approval workflows in many domains. Belongs to a Workflow / Acceptance composing pattern.
- *Expiry-based auto-recall* — time-bounded responsibility appears in on-call rotations, shift assignments, and SLA-governed queues. Belongs to Temporal Grant.
- *Assigner authorization* — who may assign whom recurs across every delegation system. Belongs to Permissions.
- *Assigner attribution* — who created this assignment recurs across every audited system. Belongs to Actor Identity.
- *Capacity constraints* — workload caps recur across scheduling and queue-management systems. Belongs to Capacity Constraint.
- *Group/team assignment* — assigning to a collective recurs across team-based work systems. Belongs to Team Assignment.
- *Task lifecycle validation* — whether a task is assignable (open, not deleted) is the task system's concern.
- *Completion handling* — what happens to the assignment when the task completes is a composing-system policy, not the atom's.

The strongest temptation was absorbing accept/decline — many real systems treat assignment as pending until the assignee acknowledges. Resisted: the base atom models unilateral assignment (assigning creates Active immediately); accept/decline is a workflow layer that some deployments need and others don't. Keeping it out preserves the atom's use in simple systems (project boards, sprint trackers) where acknowledgement is implicit.

**Pass 3 — Adversarial scrutiny (Linus mode).** Four findings, all closed in-pattern:

- *Reassign atomicity not specified.* Early draft described `reassign` as two sequential operations (recall old, assign new) without naming the atomicity requirement or the crash-semantics responsibility. Resolved: Decision points explicitly requires atomic commit of both halves; Edge cases names the crash scenario (task unassigned, Invariant 7 violated) and places the transactional boundary responsibility on the implementor.
- *Completion handling left implicit.* The draft was silent on what happens to an Active assignment when the task is completed in Personal Todo. This is a load-bearing operational decision. Resolved: Flow, Behavior, and Edge cases all name it explicitly — the atom makes no automatic transition on completion; the composing system decides whether to `recall` or leave the assignment Active as a completion-attribution record. Both are valid.
- *Invariant 8 clock-safety.* Timestamp ordering (`assigned_at ≤ recalled_at`, `assigned_at ≤ transferred_at`) assumed a non-decreasing clock. Resolved: qualified as best-effort under non-monotonic clocks; clock semantics added to Edge cases.
- *Rejection-path examples absent.* Initial examples covered only happy-path flows (assign, reassign, recall in smooth sequences). Resolved: fourth example added walking all four rejection reasons (`invalid-request`, `already-assigned`, `not-known`, `not-active`) in a single thread.

**Refinement round 1.** Five findings, all closed in-pattern. Conventions inherited from the methodology directly, not re-derived from predecessor atoms.

- *Action signatures used `rejected(reason)` placeholders.* All three signatures named `rejected(reason)` with the actual reason taxonomy living only in Feedback prose. Resolved: all three signatures expanded — `assign` returns `rejected(invalid-request | already-assigned | storage-failure)`, `recall` returns `rejected(not-known | not-active | storage-failure)`, `reassign` returns `rejected(not-known | not-active | invalid-request | storage-failure)`. Feedback updated to include `storage-failure` in the enumeration.
- *`storage-failure` missing from all three actions.* All three actions write to the store; none named a store-write failure as a rejection reason. Resolved: `storage-failure` added to each signature and to Decision points, with the behavior specified for each: `assign` — no assignment created; `recall` — assignment remains Active; `reassign` — both writes rolled back.
- *`reassign` Decision point ambiguous on `not-active` vs. `not-known`.* The phrasing "otherwise `not-active` or `not-known`" did not specify which condition produces which reason. Resolved: Decision point restructured as two sequential checks — `not-known` if the id is not in the store, `not-active` if it exists but is in a terminal state.
- *No durability invariant.* Nine invariants; none stated that assignments are never deleted. Resolved: Invariant 10 — Assignment store durability — added: assignments are never deleted; `recall` transitions Active → Recalled; `reassign` transitions Active → Transferred and creates a new record; neither removes any record; total count monotonically non-decreasing. The auditability summary paragraph updated to name durability alongside immutability and complete history.
- *Reassign partial-write scenario not framed under storage-failure in Edge cases.* The crash-semantics edge case named the transactional boundary but did not address the storage-failure path (where the atom returns a rejection rather than crashing). The two-write nature of `reassign` makes this the same structural situation as `revoke` in Permissions: a partial write leaves a Transferred assignment with no Active successor, violating Invariant 7. Resolved: new edge case — *Reassign storage failure* — added, requiring rollback of both writes on failure, with recovery guidance for implementations without full transactional support.

**Scheduled rescan: 2026-05-20 — clean.**

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 7 (reassign atomicity — exactly one Active per task, no observable both/neither state) and Invariant 1 (at-most-one-Active) are concurrency/exclusivity claims. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`assignment.tla`](./assignment.tla) + config [`assignment.cfg`](./assignment.cfg), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* a single task with up to `MaxA = 3` assignment slots; the load-bearing **Invariant 1** (at most one Active per task) under every interleaving of `assign`, `recall`, and atomic `reassign`. The correct `reassign` moves old→Transferred and new→Active in one step. Exhaustive: 47 states, holds. *Buggy twin* [`assignment-buggy.tla`](./assignment-buggy.tla) splits `reassign` so the new Active is created before the old is retired — the two-Active window **Invariant 7** (reassign atomicity) forbids; rejected at 6 states. The twin mechanizes why reassign must be atomic: a non-atomic reassign reachably violates at-most-one-Active. *Out of model scope:* multiple tasks (Inv 1 is per-task), id immutability/no-reuse/timestamp ordering (Inv 2,5,6,8 — structural/clock). *Conflict-protocol outcome:* none — the model **corroborates** the English (atomic reassign holds Inv 1 through the handoff); canonical English unchanged.

**AI adversarial round — Final Critique 4 (first real AI round) — 2026-06-18.** This atom grounded 2026-05-20 under the early process — foundation plus refinement, with no fresh-reader AI adversarial round — and carried the legacy grandfathered token. This round is that missing AI-conducted adversarial round (fresh-reader Opus, Happy-Torvalds-X2); it is the atom's Final Critique 4 (Rounds 1–3 the foundation/refinement baseline, per pressure-testing.md §Round structure). Three foundational findings closed: F1 Logic Confinement (clock and `assignment_id` now host-injected at the I/O seam, not generated inside the transitions); F2 the `storage-failure` rejection reason is now exercised in the example thread; F3 the `active_for`/`history_for` read queries the compositions call are now declared in Outputs. Refining: Invariant 8 given clock-safe wording; a cross-reference to execution-contract.md §Multi-write atomicity added for reassign. Caller signatures unchanged and the invariant set held at 10, so the fixes are additive with no constituent-change cascade. Formal-layer vote stands YES (TLA+ model present); the time/id seam is out of model scope, so F1 does not reopen it. Confirming fresh-reader Opus clearance gate (2026-06-18): CLEAR, 0 foundational, no new surface. Compositions affected — confirming check only, NOT a re-pass: Shared Todo, Multi-Party Approval, Stateful Workflow Execution. Grounds at Final Critique 4.
