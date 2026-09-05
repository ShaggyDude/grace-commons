---
title: Shared Todo
parent: Conceptual Compositions
nav_order: 4
has_toc: true
toc: true
---

# Shared Todo

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>

## Summary

Shared Todo turns a single-user task list into a shared, multi-person one where every change is gated by a permission check and every task has at most one person responsible for it at a time.

It combines three simpler patterns: a task list (Personal Todo), a grant-based permission system (Permissions), and a responsibility-tracking pattern (Assignment). None of the three knows about the others — the task list has no notion of who is acting, the permission system treats access scopes as meaningless strings until the composition gives them meaning, and the responsibility tracker records who owns a task but does not enforce anything.

The composition wires them together so that every action passes a permission check first, deleting a task automatically recalls whoever was responsible for it, and two new queries become possible that no single pattern could answer alone: who is responsible for a task right now, and which tasks a given person is allowed to see.

Combining the patterns produces guarantees none has alone — no one can change the list beyond their granted permissions, no responsibility is left dangling against a deleted task, and the full history of who could do what and who owned what is recoverable from the records. This is the standard building block for any collaborative task system where ownership and access control must be auditable.

The most common uses are software development sprint boards with role-based edit and assignment rights, support queue systems where tickets are assigned to agents with different tier-level access, clinical care planning where nurses and physicians share a task list but hold different permissions over it, and legal or compliance workflows where checklist items require clear ownership and an auditable record of who held which permission.

---

## Intent

Personal Todo is single-actor by design. It has no concept of who is acting, no concept of what different actors are allowed to do, and no concept of one actor being responsible for completing a task someone else created. Those three concepts — task lifecycle, authorization, and responsibility — are each freestanding atoms that compose cleanly. Shared Todo is the composition that wires them.

The pattern addresses the form of multi-actor work that recurs across virtually every collaborative domain: a development team's sprint board where tasks are visible to all but editable only by their owners; a support queue where tickets are assigned to agents with different role-based access; a clinical care plan where nurses and physicians see the same task list but hold different permissions over it; a legal matter where paralegals and partners share a checklist with clear ownership of each item.

The shape is constant across all of them: actors see and act on tasks according to granted scopes (opaque permission tokens, such as `tasks:edit`, that the composition defines and Permissions enforces); one actor is responsible for each task at any given time; the full history of who held what permission and who was responsible for what task is recoverable from the records alone.

This is a composition, not a new primitive. Personal Todo, Permissions, and Assignment are unchanged. The composition is the wiring that makes their three concepts coherent — a single multi-actor task surface rather than three separate record stores the caller has to coordinate by hand.

---

## Composes

- **[Personal Todo](../atoms/personal-todo.md)** — provides the task lifecycle: `add`, `edit`, `complete`, `delete`, the state machine (Pending → Done, with delete available from either state), all its invariants (identity model, active-set description uniqueness, timestamp monotonicity, and so on). The composition maintains exactly one Personal Todo instance (the shared task store).
- **[Permissions](../atoms/permissions.md)** — provides the authorization surface: `grant`, `revoke`, `permitted`. The composition maintains exactly one Permissions instance scoped to the task list. Every state-changing action and every read query is gated by a `permitted` check before reaching Personal Todo or Assignment.
- **[Assignment](../atoms/assignment.md)** — provides the responsibility binding (the record that names which actor is accountable for a task and tracks transitions — Active, Recalled, Transferred — as accountability changes): `assign`, `recall`, `reassign`. The composition maintains exactly one Assignment instance. At most one actor is responsible for any task at any time; the full responsibility history for every task is recoverable from the assignment store.

---

## Composition logic

### Composition state

The composition owns no emergent record store beyond the three constituent atoms — **Contract classification: conforming, no stored composition state** ([`execution-contract.md`](../execution-contract.md) §Composition state; there is no element to classify, which is the rule's best case). The join is derived: for any `task_id`, the current responsible actor is `Assignment.active_for(task_id).assignee_ref` (one result or none); the tasks visible to `actor_ref` are all tasks when `Permissions.permitted(actor_ref, tasks:view)` returns `permitted` and none otherwise — the predicate is per-actor, not per-task, in the canonical list-level deployment. Both derived queries are pure joins over the constituents' declared query surfaces, computed at read time and never materialized with a consistency claim — nothing at this layer can go stale, because nothing at this layer is stored.

Two derived queries the composition surfaces that neither constituent answers alone:

- **[Responsible Actor]** — (Projected contract: `responsible_actor(actor_ref, task_id) → assignee_ref | unassigned | rejected(permission-denied | not-known)`) — gates on [Tasks View], then joins Personal Todo (does the task exist?) and Assignment (who holds the active assignment?). An unknown `task_id` is `rejected(not-known)` — the Personal-Todo side of the join is exactly what distinguishes an existing-but-unassigned task (`unassigned`) from a nonexistent one (`not-known`).
- **[Visible Tasks]** — (Projected contract: `visible_tasks(actor_ref) → [task_id, ...] | rejected(permission-denied)`) — gates on [Tasks View], then joins Personal Todo (the full task set) and Permissions (whether the actor may see the list). In the canonical single-list deployment, [Tasks View] is a list-level grant and returns all tasks or none; finer-grained per-task visibility belongs to a scoped Permissions deployment described in Edge cases.

### Scope vocabulary

Permissions treats action scopes as opaque. Shared Todo defines the canonical scope vocabulary for its Permissions instance:

| Scope | Permits |
|-------|---------|
| [Tasks View] | Read the shared task list — see tasks and their current assignees |
| [Tasks Add] | Call `add` on Personal Todo |
| [Tasks Edit] | Call `edit` on any pending task |
| [Tasks Complete] | Call `complete` on any task |
| [Tasks Delete] | Call `delete` on any task |
| [Tasks Assign] | Call `assign` and `reassign` on Assignment |
| [Tasks Recall] | Call `recall` on Assignment |

The vocabulary is deployment-configurable. A deployment that distinguishes "edit your own tasks" from "edit any task" introduces finer-grained scopes (`tasks:edit:own`, `tasks:edit:any`) and adjusts the wiring accordingly; the canonical vocabulary above is the minimum useful set. The Permissions instance is the single source of truth for what a given actor may do; the scope vocabulary is the contract between the deployment and the composition wiring.

### Action wiring

Every action follows the same two-step shape: Permissions check first, atom call second. A `denied` result from Permissions short-circuits the action and surfaces [Permission Denied] to the caller; the constituent atoms are not invoked.

- **[Add Task]** — (Projected contract: `add_task(actor_ref, description) → task_id | rejected(permission-denied | invalid-description | duplicate-active | storage-failure)`)
  1. `Permissions.permitted(actor_ref, tasks:add)` → if `denied`, return [Permission Denied].
  2. `PersonalTodo.add(description)` → `task_id | rejected(invalid-description | duplicate-active | storage-failure)`. Return the result.

- **[Edit Task]** — (Projected contract: `edit_task(actor_ref, task_id, new_description) → ok | rejected(permission-denied | not-known | not-editable | invalid-description | duplicate-active | storage-failure)`)
  1. `Permissions.permitted(actor_ref, tasks:edit)` → if `denied`, return [Permission Denied].
  2. `PersonalTodo.edit(task_id, new_description)` → `ok | rejected(not-known | not-editable | invalid-description | duplicate-active | storage-failure)`. Return the result.

- **[Complete Task]** — (Projected contract: `complete_task(actor_ref, task_id) → ok | rejected(permission-denied | not-known | not-pending | storage-failure)`)
  1. `Permissions.permitted(actor_ref, tasks:complete)` → if `denied`, return [Permission Denied].
  2. `PersonalTodo.complete(task_id)` → `ok | rejected(not-known | not-pending | storage-failure)`. Return the result. The assignment for `task_id`, if Active, is not automatically recalled; see Edge cases.

- **[Delete Task]** — (Projected contract: `delete_task(actor_ref, task_id) → ok | rejected(permission-denied | not-known | storage-failure)`)
  1. `Permissions.permitted(actor_ref, tasks:delete)` → if `denied`, return [Permission Denied].
  2. If `Assignment.active_for(task_id)` returns an active assignment, call `Assignment.recall(assignment_id)` — the cascade-on-delete rule; see Composition-level invariants. If this `recall` returns `rejected(storage-failure)`, return `storage-failure` immediately; do not proceed to step 3.
  3. `PersonalTodo.delete(task_id)` → `ok | rejected(not-known | storage-failure)`. Return the result.

- **[Assign Task]** — (Projected contract: `assign_task(actor_ref, task_id, assignee_ref) → assignment_id | rejected(permission-denied | not-known | already-assigned | invalid-request | storage-failure)`)
  1. `Permissions.permitted(actor_ref, tasks:assign)` → if `denied`, return [Permission Denied].
  2. **Task-existence check** — the referential-integrity delegation Assignment explicitly hands to its composing system, picked up here: `task_id` must reference a task in the Personal Todo store, in Pending **or** Done state; otherwise return `rejected(not-known)`. Assigning a Done task is deliberately admitted — an Active assignment on a Done task is the completion-attribution pattern the *Completion handling* edge case sanctions. A never-existing or deleted `task_id` never reaches `Assignment.assign` (and Personal Todo retires ids permanently, so a deleted id can never come back to legitimize a dangling assignment) — this check is what makes the cascade rule's *no Active assignment references a deleted task* a standing invariant rather than a delete-time-only one.
  3. `Assignment.assign(task_id, assignee_ref)` → `assignment_id | rejected(invalid-request | already-assigned | storage-failure)`. Return the result.

- **[Reassign Task]** — (Projected contract: `reassign_task(actor_ref, assignment_id, new_assignee_ref) → new_assignment_id | rejected(permission-denied | not-known | not-active | invalid-request | storage-failure)`)
  1. `Permissions.permitted(actor_ref, tasks:assign)` → if `denied`, return [Permission Denied].
  2. `Assignment.reassign(assignment_id, new_assignee_ref)` → `new_assignment_id | rejected(not-known | not-active | invalid-request | storage-failure)`. Return the result.

- **[Recall Assignment]** — (Projected contract: `recall_assignment(actor_ref, assignment_id) → ok | rejected(permission-denied | not-known | not-active | storage-failure)`)
  1. `Permissions.permitted(actor_ref, tasks:recall)` → if `denied`, return [Permission Denied].
  2. `Assignment.recall(assignment_id)` → `ok | rejected(not-known | not-active | storage-failure)`. Return the result.

Read-only queries (`visible_tasks`, `responsible_actor`, task detail by id) take the querying `actor_ref` and check `tasks:view` before reading from Personal Todo or Assignment. A `denied` on `tasks:view` returns [Permission Denied] — deterministically, per the projected contracts above, never a silently empty result: an empty list is an answer about the task set, and conflating it with no-access would make the two indistinguishable to the caller and non-deterministic across deployments.

### The cascade-on-delete rule

The composition's load-bearing wiring decision: when a task is deleted, any Active assignment for that task is recalled before the deletion proceeds. Neither Personal Todo (which knows nothing about assignments) nor Assignment (which knows nothing about task deletion) enforces this; the composition wiring does. The recall is recorded in the Assignment store — the assignment moves Active → Recalled (Active means one actor currently holds responsibility; Recalled means responsibility was explicitly withdrawn), with `recalled_at` — before the task leaves the Personal Todo store. This preserves the invariant (a condition that must always hold) that no Active assignment references a deleted task.

---

## Composition-level invariants

These invariants emerge from the composition. None belong to a single constituent; each requires two or all three atoms working together to hold.

- **Invariant 1 — Permission enforcement.** No actor performs a state-changing action (add, edit, complete, delete, assign, reassign, recall) without a `permitted` result from the Permissions instance for the corresponding scope. A `denied` result short-circuits the action before any constituent atom is invoked.
- **Invariant 2 — At most one responsible actor per task.** At any time, no task in the shared list has more than one Active assignment. Inherited from Assignment's Invariant 1 and surfaced through the composition's single Assignment instance.
- **Invariant 3 — Cascade-on-delete.** When a task is deleted, any Active assignment for that task is recalled before the deletion completes. After a successful [Delete Task], no Active assignment exists for the deleted `task_id`.
- **Invariant 4 — Responsibility queryability.** For any task in the Personal Todo store, the composition can answer *who is responsible right now* and *who has been responsible over time* from the Assignment store alone, without recourse to external records.
- **Invariant 5 — Authorization history completeness.** For any actor and any scope, the full grant history (who was granted what, when, and whether it was revoked) is recoverable from the Permissions store alone. The grant record survives the task it governed.
- **Invariant 6 — Personal Todo's invariants preserved.** All Personal Todo invariants hold over the underlying instance. The composition never bypasses Personal Todo's preconditions; its rejections (`not-pending`, `not-known`, `duplicate-active`, etc.) flow through unchanged to the caller.
- **Invariant 7 — Assignment's invariants preserved.** All Assignment invariants hold over the underlying instance. The at-most-one-Active constraint (Assignment's Invariant 1), reassign atomicity (Assignment's Invariant 7), and assignment store durability (Assignment's Invariant 10) are enforced by the constituent.
- **Invariant 8 — Permissions' invariants preserved.** All Permissions invariants hold. Evaluation self-containment (Permissions' Invariant 6), denial by absence (Invariant 7), and grant store durability (Permissions' Invariant 10) are enforced by the constituent.

Permission enforcement and cascade-on-delete together give the *coherent multi-actor surface* property: no actor can act beyond their grants, and no assignment is left dangling against a deleted task. Responsibility queryability and authorization history completeness together give the *recoverable accountability* property: for any task and any actor, the full picture of what they were allowed to do and who was responsible is readable from the records alone.

---

## Examples

### Sprint board — role-based editing with task handoff

A four-person team. The engineering manager holds `tasks:view`, `tasks:assign`, and `tasks:delete` grants; developers hold `tasks:add`, `tasks:edit`, `tasks:complete`, and `tasks:view`. No developer holds `tasks:delete` or `tasks:assign`.

- Dev Alice calls `add_task(alice, "implement login flow") → task_t1`. Permitted: `tasks:add`. Task enters Pending.
- Manager calls `assign_task(manager, task_t1, alice) → assignment_a1`. Permitted: `tasks:assign`. Alice is now responsible.
- Alice calls `edit_task(alice, task_t1, "implement login flow — OAuth2 only") → ok`. Permitted: `tasks:edit`.
- Alice gets pulled onto an incident. Manager calls `reassign_task(manager, assignment_a1, bob) → assignment_a2`. Alice's assignment moves to Transferred; Bob is now responsible.
- Bob completes the task: `complete_task(bob, task_t1) → ok`. Assignment a2 remains Active — it becomes the completion-attribution record.
- Dev Carol tries `delete_task(carol, task_t1)` → `permission-denied`. Carol holds no `tasks:delete` grant.
- Manager calls `delete_task(manager, task_t1)`. Assignment a2 is recalled (cascade-on-delete); task_t1 is deleted.

The responsibility history is intact: a1 (Alice, day 1–4, Transferred), a2 (Bob, day 4–completion, Recalled-on-delete).

### Support queue — agent assignment and escalation

A support team has tier-1 and tier-2 agents and a supervisor. Agents at both tiers hold `tasks:complete` and `tasks:view`. The supervisor holds all scopes.

- A new ticket arrives. The supervisor calls `add_task(supervisor, "Customer cannot log in — account locked") → ticket_t22`.
- Supervisor assigns to tier-1 agent: `assign_task(supervisor, ticket_t22, agent_j) → assignment_b5`.
- Agent J investigates but cannot resolve. They have no `tasks:assign` grant, so they cannot reassign directly. They flag the supervisor.
- Supervisor calls `reassign_task(supervisor, assignment_b5, agent_k_tier2) → assignment_b6`. Tier-2 is now responsible.
- Tier-2 resolves: `complete_task(agent_k_tier2, ticket_t22) → ok`.

The assignment store records: agent J held responsibility for 2 hours (Transferred); tier-2 agent K held it for 45 minutes (Active at completion). SLA (service-level agreement) analysis uses `assigned_at` and `transferred_at` per record.

### Clinical care plan — shared task list with role separation

A ward team: attending physician (all scopes), registered nurses (`tasks:view`, `tasks:complete`, `tasks:add`), orderlies (`tasks:view`, `tasks:complete`).

- Nurse adds a care task: `add_task(nurse_m, "Vitals check q4h — patient p31") → task_c7`. Permitted.
- Physician assigns it: `assign_task(physician, task_c7, nurse_m) → assignment_c1`. Nurse M is responsible.
- At shift change, physician reassigns: `reassign_task(physician, assignment_c1, nurse_n) → assignment_c2`.
- Orderly tries to add a task: `add_task(orderly_o, "Transport to radiology") → permission-denied`. Orderly holds no `tasks:add` grant.
- Nurse N completes the vitals check: `complete_task(nurse_n, task_c7) → ok`.

The accountability record is complete at the responsibility level: which nurse held responsibility at each shift, and which role level held which grants. Who *invoked* each reassignment is not recorded by any constituent here — Assignment records the responsibility chain, not the acting caller — so a regulated clinical environment needing invocation-level attribution composes the action surface with Audit Trail (which also makes the record tamper-evident and retention-bounded).

---

## Edge cases and explicit non-goals

What this composition does not cover:

- **Per-task visibility scoping.** The canonical scope vocabulary uses [Tasks View] as a list-level grant — an actor either sees all tasks or none. Per-task visibility (actor A can see task 1 but not task 2) requires a finer-grained scope vocabulary (`tasks:view:task_id`) or a separate resource-scoped Permissions instance per task. That is deployment configuration, not part of the canonical composition.
- **Assignment implies view access.** The composition does not automatically grant [Tasks View] to actors who receive an assignment. An actor assigned to a task they cannot see is a valid (if unusual) state. Deployments that want assignment to imply view access should issue a [Tasks View] grant alongside each assignment, or introduce a composing pattern that does so.
- **Self-assignment.** An actor with [Tasks Assign] can assign a task to themselves. The composition does not prevent it; if the deployment policy prohibits self-assignment, the composition wiring should add a check that `actor_ref ≠ assignee_ref` before calling `Assignment.assign`.
- **Completion handling for assignments.** When a task is completed, its Active assignment is not automatically recalled. The assignment record remains Active as a completion-attribution record — *who was responsible when this was completed* — unless the deployment policy calls [Recall Assignment] on completion. Both patterns are valid; the composition supports either.
- **Deletion of assigned tasks.** The cascade-on-delete rule recalls the Active assignment before deleting the task. Recalled is the correct terminal state for an assignment on a deleted task (the task no longer exists; the actor's responsibility is discharged by the deletion, not by their own action). The assignment history, including the recall, remains in the Assignment store.
- **Undo.** The composition does not include undo. Adding undo requires composing with an Event Log instance (as Undo History demonstrates); the three-atom Shared Todo composition does not absorb it.
- **Audit trail.** The composition does not include tamper-evident audit logging. Deployments with regulated audit obligations compose Shared Todo's action surface with Audit Trail — each [Add Task], [Assign Task], [Complete Task] etc. becomes a `record_action` call in the Audit Trail composition. The two compositions are independent; stacking them is the regulated-deployment pattern.
- **Task priorities, dependencies, due dates.** Each is a separate atom composing with Personal Todo. The Shared Todo composition names Personal Todo as its constituent; extending with priority or due-date atoms means composing a richer task atom, not modifying Shared Todo.
- **Concurrent action races.** Two actors simultaneously calling [Assign Task] for the same `task_id` resolve serially under the host environment's serialization guarantees; Assignment's `already-assigned` rejection handles the loser. Two actors simultaneously calling [Delete Task] for the same `task_id` resolve serially; Personal Todo's `not-known` rejection handles the loser.
- **Revoked grants mid-session.** If an actor's [Tasks Edit] grant is revoked while they have an edit in flight, the timing depends on when `permitted` is called. The composition checks `permitted` at action initiation; whether in-flight operations are re-checked mid-execution is handled at the deployment layer.
- **Grant administration is out of scope.** The composition maintains the Permissions instance and gates every action on it, but deliberately wires no action for `grant`/`revoke` and defines no scope governing them — who may administer the grants is a governance surface of its own, outside the canonical composition; the deployment administers grants directly against the Permissions instance under its own controls. Regulated deployments needing administered, attributed, auditable grant changes compose [Attributed Permissions Admin](./attributed-permissions-admin.md) over the same Permissions instance.
- **The `actor_ref` ↔ authenticated-caller binding is a deployment seam.** Permissions explicitly hands the question of binding the checked subject to the real caller to its composing system, and this composition passes the caller-supplied `actor_ref` into every check without authenticating it — an unauthenticated deployment lets any caller act under any actor's grants. The binding is a named deployment-seam assumption: an authentication layer in front of this composition supplies it — [Login](./login.md) with [Session-Gated Authorization](./session-gated-authorization.md) providing the session-extracted principal as the `actor_ref`, or [Authenticated Actor](./authenticated-actor.md) for the credential-bound form. This composition's guarantees are stated over the `actor_ref` values presented to it.
- **Partial [Delete Task] — recall committed, delete failed.** Step 2's recall commits before step 3's delete, so a `storage-failure` (or a concurrent-delete `not-known`) at step 3 leaves the assignment Recalled while the task remains — an over-recall, never a dangling assignment. The state is on the safe side of Invariant 3 (whose direction is one-way: no Active assignment on a deleted task; a Recalled assignment on a live task is a state Assignment admits) and is visible ([Responsible Actor] answers `unassigned`); the remedy is operational — retry the delete, or re-assign if the deletion is abandoned. The composition deliberately wraps no transaction around the two writes; the recall-first ordering is what keeps the failure mode on the safe side.
- **Single-instance consequences — global description uniqueness and the existence oracle.** One shared Personal Todo instance means Personal Todo's active-set description uniqueness holds *globally across all actors*: two actors cannot hold Pending tasks with normalized-equal descriptions, and [Add Task]'s `duplicate-active` therefore tells a caller that *someone's* matching task exists — a deliberate consequence of the shared list, and a mild existence oracle for an actor holding [Tasks Add] but not [Tasks View]. Deployments for which either consequence is unacceptable partition record populations across instances or scope descriptions by convention.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are the composed action-wirings and derived queries plus the scope vocabulary it defines; references to the constituent atoms ([Personal Todo](../atoms/personal-todo.md), [Permissions](../atoms/permissions.md), [Assignment](../atoms/assignment.md)) and their operations remain qualified calls to those atoms. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Add Task

The composition action that adds a task to the shared list — gates on [Tasks Add] via Permissions, then delegates to Personal Todo's `add`. Returns the new `task_id`, or [Permission Denied] before any delegated Personal Todo rejection.

Kind: Operation

#### Edit Task

The composition action that edits a pending task's description — gates on [Tasks Edit], then delegates to Personal Todo's `edit`. Rejected [Permission Denied] or a delegated Personal Todo rejection.

Kind: Operation

#### Complete Task

The composition action that marks a task done — gates on [Tasks Complete], then delegates to Personal Todo's `complete`. Does not auto-recall the task's Active assignment (that is deployment policy). Rejected [Permission Denied] or a delegated rejection.

Kind: Operation

#### Delete Task

The composition action that deletes a task — gates on [Tasks Delete], recalls any Active assignment first (the cascade-on-delete rule, Invariant 3), then delegates to Personal Todo's `delete`. Rejected [Permission Denied] or a delegated rejection.

Kind: Operation

#### Assign Task

The composition action that binds responsibility for a task to an actor — gates on [Tasks Assign], checks the task exists (Pending or Done; else `not-known` — the referential-integrity check Assignment delegates to its composing system), then delegates to Assignment's `assign`. Returns the new `assignment_id`, or [Permission Denied] / `not-known` / a delegated rejection.

Kind: Operation

#### Reassign Task

The composition action that moves responsibility to a new actor — gates on [Tasks Assign], then delegates to Assignment's `reassign`. Returns the new `assignment_id`, or [Permission Denied] / a delegated rejection.

Kind: Operation

#### Recall Assignment

The composition action that withdraws responsibility — gates on [Tasks Recall], then delegates to Assignment's `recall`. Rejected [Permission Denied] or a delegated rejection.

Kind: Operation

#### Responsible Actor

The derived read query joining Personal Todo and Assignment — gates on [Tasks View], then returns the actor holding the active assignment for a task, `unassigned` for an existing task with none, or `not-known` for a task the store never held (the join's existence side). Neither constituent answers it alone.

Kind: Operation

#### Visible Tasks

The derived read query joining Personal Todo and Permissions — returns the tasks an actor may see (all tasks under a [Tasks View] grant in the canonical list-level deployment), or [Permission Denied] without one. Neither constituent answers it alone.

Kind: Operation

#### Tasks View

The scope permitting read of the shared task list (tasks and their assignees). Gates [Visible Tasks] and the other read queries; a list-level grant in the canonical deployment.

Kind:      Member
Member of: the scope vocabulary
Role:      Scope
Projects:  tasks:view

#### Tasks Add

The scope permitting [Add Task] (which delegates to Personal Todo's `add`).

Kind:      Member
Member of: the scope vocabulary
Role:      Scope
Projects:  tasks:add

#### Tasks Edit

The scope permitting [Edit Task] on any pending task.

Kind:      Member
Member of: the scope vocabulary
Role:      Scope
Projects:  tasks:edit

#### Tasks Complete

The scope permitting [Complete Task] on any task.

Kind:      Member
Member of: the scope vocabulary
Role:      Scope
Projects:  tasks:complete

#### Tasks Delete

The scope permitting [Delete Task] on any task.

Kind:      Member
Member of: the scope vocabulary
Role:      Scope
Projects:  tasks:delete

#### Tasks Assign

The scope permitting [Assign Task] and [Reassign Task].

Kind:      Member
Member of: the scope vocabulary
Role:      Scope
Projects:  tasks:assign

#### Tasks Recall

The scope permitting [Recall Assignment].

Kind:      Member
Member of: the scope vocabulary
Role:      Scope
Projects:  tasks:recall

#### Permission Denied

The composition's own rejection — returned by any composition action when the up-front Permissions check yields `denied`; it short-circuits before any constituent atom is invoked (Invariant 1).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  permission-denied

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Add Task]: #add-task
[Edit Task]: #edit-task
[Complete Task]: #complete-task
[Delete Task]: #delete-task
[Assign Task]: #assign-task
[Reassign Task]: #reassign-task
[Recall Assignment]: #recall-assignment
[Responsible Actor]: #responsible-actor
[Visible Tasks]: #visible-tasks
[Tasks View]: #tasks-view
[Tasks Add]: #tasks-add
[Tasks Edit]: #tasks-edit
[Tasks Complete]: #tasks-complete
[Tasks Delete]: #tasks-delete
[Tasks Assign]: #tasks-assign
[Tasks Recall]: #tasks-recall
[Permission Denied]: #permission-denied

---

## Status

`grounded on Final Critique 6 — 2026-08-26` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 6 — 2026-08-26
formal: verified — shared-todo.tla + 1 twin, 2026-06-03
last gate: 2026-08-26 — Final Critique 6, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/shared-todo.md`.
