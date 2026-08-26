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

- **[Personal Todo](../atoms/personal-todo.md)** — provides the task lifecycle: `add`, `edit`, `complete`, `delete`, the state machine (Pending → Done → deleted), all its invariants (identity model, active-set description uniqueness, timestamp monotonicity, and so on). The composition maintains exactly one Personal Todo instance (the shared task store).
- **[Permissions](../atoms/permissions.md)** — provides the authorization surface: `grant`, `revoke`, `permitted`. The composition maintains exactly one Permissions instance scoped to the task list. Every state-changing action and every read query is gated by a `permitted` check before reaching Personal Todo or Assignment.
- **[Assignment](../atoms/assignment.md)** — provides the responsibility binding (the record that names which actor is accountable for a task and tracks transitions — Active, Recalled, Transferred — as accountability changes): `assign`, `recall`, `reassign`. The composition maintains exactly one Assignment instance. At most one actor is responsible for any task at any time; the full responsibility history for every task is recoverable from the assignment store.

---

## Composition logic

### Composition state

The composition owns no emergent record store beyond the three constituent atoms — **Contract classification: conforming, no stored composition state** ([`execution-contract.md`](../execution-contract.md) §Composition state; there is no element to classify, which is the rule's best case). The join is derived: for any `task_id`, the current responsible actor is `Assignment.active_for(task_id).assignee_ref` (one result or none); the tasks visible to `actor_ref` are the Personal Todo tasks for which `Permissions.permitted(actor_ref, tasks:view)` returns `permitted`. Both derived queries are pure joins over the constituents' declared query surfaces, computed at read time and never materialized with a consistency claim — nothing at this layer can go stale, because nothing at this layer is stored.

Two derived queries the composition surfaces that neither constituent answers alone:

- **[Responsible Actor]** — (Projected contract: `responsible_actor(task_id) → assignee_ref | unassigned`) — joins Personal Todo (does the task exist?) and Assignment (who holds the active assignment?).
- **[Visible Tasks]** — (Projected contract: `visible_tasks(actor_ref) → [task_id, ...]`) — joins Personal Todo (the full task set) and Permissions (which tasks the actor may see). In the canonical single-list deployment, [Tasks View] is a list-level grant and returns all tasks or none; finer-grained per-task visibility belongs to a scoped Permissions deployment described in Edge cases.

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

- **[Assign Task]** — (Projected contract: `assign_task(actor_ref, task_id, assignee_ref) → assignment_id | rejected(permission-denied | already-assigned | invalid-request | storage-failure)`)
  1. `Permissions.permitted(actor_ref, tasks:assign)` → if `denied`, return [Permission Denied].
  2. `Assignment.assign(task_id, assignee_ref)` → `assignment_id | rejected(invalid-request | already-assigned | storage-failure)`. Return the result.

- **[Reassign Task]** — (Projected contract: `reassign_task(actor_ref, assignment_id, new_assignee_ref) → new_assignment_id | rejected(permission-denied | not-known | not-active | invalid-request | storage-failure)`)
  1. `Permissions.permitted(actor_ref, tasks:assign)` → if `denied`, return [Permission Denied].
  2. `Assignment.reassign(assignment_id, new_assignee_ref)` → `new_assignment_id | rejected(not-known | not-active | invalid-request | storage-failure)`. Return the result.

- **[Recall Assignment]** — (Projected contract: `recall_assignment(actor_ref, assignment_id) → ok | rejected(permission-denied | not-known | not-active | storage-failure)`)
  1. `Permissions.permitted(actor_ref, tasks:recall)` → if `denied`, return [Permission Denied].
  2. `Assignment.recall(assignment_id)` → `ok | rejected(not-known | not-active | storage-failure)`. Return the result.

Read-only queries (`visible_tasks`, `responsible_actor`, task detail by id) check `tasks:view` before reading from Personal Todo or Assignment. A `denied` on `tasks:view` returns an empty result or `permission-denied`, depending on deployment policy.

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

A four-person team. The engineering manager holds `tasks:assign` and `tasks:delete` grants; developers hold `tasks:add`, `tasks:edit`, `tasks:complete`, and `tasks:view`. No developer holds `tasks:delete` or `tasks:assign`.

- Dev Alice calls `add_task(alice, "implement login flow") → task_t1`. Permitted: `tasks:add`. Task enters Pending.
- Manager calls `assign_task(manager, task_t1, alice) → assignment_a1`. Permitted: `tasks:assign`. Alice is now responsible.
- Alice calls `edit_task(alice, task_t1, "implement login flow — OAuth2 only") → ok`. Permitted: `tasks:edit`.
- Alice gets pulled onto an incident. Manager calls `reassign_task(manager, assignment_a1, bob) → assignment_a2`. Alice's assignment moves to Transferred; Bob is now responsible.
- Bob completes the task: `complete_task(bob, task_t1) → ok`. Assignment a2 remains Active — it becomes the completion-attribution record.
- Dev Carol tries `delete_task(carol, task_t1)` → `permission-denied`. Carol holds no `tasks:delete` grant.
- Manager calls `delete_task(manager, task_t1)`. Assignment a2 is recalled (cascade-on-delete); task_t1 is deleted.

The responsibility history is intact: a1 (Alice, day 1–4, Transferred), a2 (Bob, day 4–completion, Recalled-on-delete).

### Support queue — agent assignment and escalation

A support team has tier-1 agents and a supervisor. Tier-1 agents hold `tasks:complete` and `tasks:view`. The supervisor holds all scopes.

- A new ticket arrives. The supervisor calls `add_task(supervisor, "Customer cannot log in — account locked") → ticket_t22`.
- Supervisor assigns to tier-1 agent: `assign_task(supervisor, ticket_t22, agent_j) → assignment_b5`.
- Agent J investigates but cannot resolve. They have no `tasks:assign` grant, so they cannot reassign directly. They flag the supervisor.
- Supervisor calls `reassign_task(supervisor, assignment_b5, agent_k_tier2) → assignment_b6`. Tier-2 is now responsible.
- Tier-2 resolves: `complete_task(agent_k_tier2, ticket_t22) → ok`.

The assignment store records: agent J held responsibility for 2 hours (Transferred); tier-2 agent K held it for 45 minutes (Active at completion). SLA analysis uses `assigned_at` and `transferred_at` per record.

### Clinical care plan — shared task list with role separation

A ward team: attending physician (all scopes), registered nurses (`tasks:view`, `tasks:complete`, `tasks:add`), orderlies (`tasks:view`, `tasks:complete`).

- Nurse adds a care task: `add_task(nurse_m, "Vitals check q4h — patient p31") → task_c7`. Permitted.
- Physician assigns it: `assign_task(physician, task_c7, nurse_m) → assignment_c1`. Nurse M is responsible.
- At shift change, physician reassigns: `reassign_task(physician, assignment_c1, nurse_n) → assignment_c2`.
- Orderly tries to add a task: `add_task(orderly_o, "Transport to radiology") → permission-denied`. Orderly holds no `tasks:add` grant.
- Nurse N completes the vitals check: `complete_task(nurse_n, task_c7) → ok`.

The accountability record is complete: which nurse held responsibility at each shift, who authorized the reassignment, which role level held which grants. In a regulated clinical environment, Permissions' grant store composes with Audit Trail to make this record tamper-evident and retention-bounded.

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

The composition action that binds responsibility for a task to an actor — gates on [Tasks Assign], then delegates to Assignment's `assign`. Returns the new `assignment_id`, or [Permission Denied] / a delegated rejection.

Kind: Operation

#### Reassign Task

The composition action that moves responsibility to a new actor — gates on [Tasks Assign], then delegates to Assignment's `reassign`. Returns the new `assignment_id`, or [Permission Denied] / a delegated rejection.

Kind: Operation

#### Recall Assignment

The composition action that withdraws responsibility — gates on [Tasks Recall], then delegates to Assignment's `recall`. Rejected [Permission Denied] or a delegated rejection.

Kind: Operation

#### Responsible Actor

The derived read query joining Personal Todo and Assignment — returns the actor holding the active assignment for a task, or `unassigned`. Neither constituent answers it alone.

Kind: Operation

#### Visible Tasks

The derived read query joining Personal Todo and Permissions — returns the tasks an actor may see (those for which [Tasks View] is granted). Neither constituent answers it alone.

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

`partially resolved` — downgraded 2026-08-26 by the batched pre-convention tail's closing fresh-reader gate (Final Critique 5) over the same-day convention fold, which returned **three foundational findings** — all dropped constituent delegations (the assign-side task-existence check Assignment hands to the composing system; the ungoverned grant/revoke surface of the composition's own Permissions instance; the actor-to-authenticated-caller binding Permissions delegates) — plus seven refining and three rhetorical, recorded as open routed findings per the campaign stop rule (see Lineage §Final Critique 5); the composition holds at `partially resolved` until they are closed and a round returns with zero foundational. The fold itself (conforming — no stored composition state; read-time pure joins) was confirmed by the gate, whose Pass 2 returned clean. Prior grounding: `grounded on Final Critique 4 — 2026-06-18`. (Final Critique 4 — the first AI-conducted adversarial round, fresh-reader Opus, 2026-06-18 — closed the propagated unreachable `not-pending` rejection was dropped from `edit` (its own logic was already logic-confinement-clean); caller signatures unchanged; see Lineage. Formal-layer vote stands YES (model present and verifying); not reopened. The composition was grandfathered at the legacy `grounded — 2026-05-20` token until this round.) — composition logic specified across all three constituent atoms; emergent composition state (the two derived queries) named; cascade-on-delete rule stated as the load-bearing wiring decision; eight composition-level invariants stated and justified; scope vocabulary defined with canonical seven scopes; action wiring covers all state-changing surfaces with permission-check-first discipline; three cross-domain examples (sprint board, support queue, clinical care plan) exercising role-based access and task handoff; edge cases enumerate what is handled at the deployment layer (per-task visibility, self-assignment, completion handling, concurrent races, revoked grants, audit trail, undo). Fourth entry in `compositions/`. The three-atom composition the library has been forecasting since Personal Todo landed.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

Shared Todo is the composition that motivated the Permissions and Assignment atoms. Both were drafted as direct prerequisites; this composition is the context that explains why each atom is the shape it is.

**Constituent atoms and their composition roles.** Personal Todo contributes the task lifecycle unchanged — no modification to its eight invariants, no new states, no new actions. The composition wraps its API rather than extending it. Permissions contributes the authorization surface: the scope vocabulary above is the Shared Todo–specific configuration of a generic atom that makes no assumptions about what scopes mean. Assignment contributes the responsibility binding: its at-most-one-Active invariant, its three-state machine (Active → Recalled | Transferred), and its reassign atomicity are all inherited without modification.

**The cascade-on-delete rule is the composition's load-bearing wiring decision.** Early drafts left completion handling and deletion handling symmetric — neither automatically recalled the assignment. Pass 3 (Linus mode) surfaced the deletion case as a hidden decision: a deleted task with a lingering Active assignment leaves the assignment store in a state where the `task_ref` no longer exists in Personal Todo but Assignment still believes it is Active. The `responsible_actor(task_id)` derived query would answer for a task that doesn't exist. Resolved: cascade-on-delete is mandatory (Invariant 3); the application wiring recalls before deleting. Completion handling is deliberately left to deployment policy (both patterns are valid) — this asymmetry between deletion and completion is intentional and explained in Edge cases.

**Scope vocabulary is the second load-bearing decision.** The Permissions atom treats action scopes as opaque; the composition must define what scopes mean. The canonical seven-scope vocabulary above is the minimal useful set for a shared task surface. The decision to keep it list-level (one `tasks:view` covers all tasks, not per-task) is a deliberate simplicity choice; per-task visibility is named as a deployment configuration in Edge cases rather than absorbed into the canonical composition.

**Pass 1 — GRID structural (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Clean. All nine MUSE (the v1.1 completeness framework GRID's nodes are drawn from) nodes populated across the three-atom wiring. The Flow section's three-branch shape (action → permission check → atom call, short-circuit on denied) is uniform across all seven actions; the cascade-on-delete branch in `delete_task` is the only deviation from pure passthrough, and it is explicitly named. The two derived queries (`responsible_actor`, `visible_tasks`) are the composition's read model — not new state, just the natural join that neither constituent can express alone.

**Pass 2 — Conceptual independence (EOS — the Essence of Software, Daniel Jackson's concept framework).** Clean. Five concerns were candidates for absorption and are correctly named as deployment configuration or edge cases rather than folded into the canonical composition:

- *Per-task visibility* — requires a richer Permissions deployment; named in Edge cases.
- *Self-assignment prevention* — a policy check, not a structural invariant of the composition.
- *Completion auto-recall* — deployment policy; both patterns valid.
- *Undo* — Undo History is the composing pattern; not absorbed here.
- *Regulated audit trail* — Audit Trail is the composing composition; stacking Shared Todo with Audit Trail is the regulated deployment pattern, not part of the canonical three-atom composition.

**Pass 3 — Adversarial scrutiny (Linus mode).** Three findings, all closed in-pattern:

- *Cascade-on-delete not specified.* Early draft was silent on what happens to an Active assignment when its task is deleted. A deleted task with a lingering Active assignment is a referential integrity gap — Assignment believes the task is active; Personal Todo says it doesn't exist. Resolved: cascade-on-delete rule specified in Composition logic and elevated to Invariant 3.
- *Scope vocabulary undefined.* The Permissions atom requires the composition to define scope semantics. Early draft said "permission checks happen before atom calls" without naming the scopes. A reader could not implement the composition. Resolved: canonical seven-scope vocabulary defined explicitly; deployment-configurable variants named in Edge cases.
- *Completion handling ambiguous.* Early draft implied completion should also trigger assignment recall. Surfaced as a hidden decision: whether the assignment for a completed task should be recalled depends on whether you want "who completed it" to be queryable from the assignment store. Both patterns are legitimate. Resolved: completion is explicitly left to deployment policy; the asymmetry with deletion is explained in Edge cases.

**Refinement round 1.** Four findings, all closed in-pattern. Conventions inherited from the methodology directly.

- *Composition-level action signatures used `rejected(reason)` placeholders.* All seven composition-level action signatures left rejection taxonomies as placeholders. Resolved: all seven expanded with named reason taxonomies. Personal Todo's rejection reasons sourced from Invariant 6's enumeration (`not-pending`, `not-known`, `duplicate-active`) plus `invalid-request` as the precondition failure; `storage-failure` added as the canonical store-write failure across all constituent atoms. The full Personal Todo rejection taxonomy will be confirmed against the Personal Todo atom's own refinement round.
- *Inline constituent call rejection reasons stale relative to Assignment's refinement round 1.* The wiring steps for `assign_task`, `reassign_task`, and `recall_assignment` referenced Assignment's pre-refinement signatures — `storage-failure` was missing from all three; `not-known` was missing from `reassign_task`. Resolved: all three wiring steps updated to match Assignment's refined signatures.
- *`delete_task` cascade-abort path not specified.* The cascade-on-delete step called `Assignment.recall` but did not state what happens if the recall returns `rejected(storage-failure)`. A cascade recall failure must abort the delete — proceeding to step 3 would delete the task while leaving its Active assignment dangling, violating Invariant 3. Resolved: wiring updated — if cascade recall returns `storage-failure`, `delete_task` returns `storage-failure` immediately without proceeding to `PersonalTodo.delete`.
- *Invariant counts stale.* Invariant 7 referenced "nine Assignment invariants" (Assignment now has ten after refinement round 1 added Invariant 10 — assignment store durability); Invariant 8 referenced "nine Permissions invariants" (Permissions now has ten after refinement round 1 added Invariant 10 — grant store durability). Resolved: both counts updated; durability invariants named in each.

**Scheduled rescan: 2026-05-20 — clean.** Pass 1 GRID confirmed: Personal Todo retains eight invariants with correct signatures (`not-editable` present in `edit`, `invalid-description` as the description-validation rejection); Assignment retains ten invariants; Permissions retains ten invariants; all three invariant counts in the composition's Invariants section are accurate. Pass 2 EOS clean. Pass 3 Linus (fresh-reader) clean.

**Formal-layer vote — 2026-06-03: YES (model pending).** Cascade-on-delete (Inv 3 — assignment recall completes before task deletion under concurrent delete/assign) and at-most-one-responsible-actor (Inv 2) are ordering/exclusivity claims across two constituents. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`shared-todo.tla`](./shared-todo.tla) + config [`shared-todo.cfg`](./shared-todo.cfg), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* one task; `taskExists` (Personal Todo presence) and `assignmentActive` (an Active Assignment). The load-bearing **Invariant 3** (cascade-on-delete) is checked as `Inv_CascadeOnDelete == ~taskExists ⇒ ~assignmentActive` — after a delete, no Active assignment dangles. The correct `delete_task` performs the recall-then-delete cascade atomically. Exhaustive: 3 states, holds. *Buggy twin* [`shared-todo-buggy.tla`](./shared-todo-buggy.tla) deletes the task without recalling its Active assignment first; rejected at 4 states (Assign → DeleteTask → `taskExists = FALSE` while `assignmentActive = TRUE`, a dangling assignment). *Out of model scope:* Permissions enforcement (Invariant 1), at-most-one-responsible (Invariant 2 — inherited from Assignment; see `atoms/assignment.tla`), history queryability. *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

**AI adversarial round — Final Critique 4 (first real AI round) — 2026-06-18.** This composition grounded 2026-05-20 under the early process — foundation plus refinement, no fresh-reader AI adversarial round — and carried the legacy grandfathered token; its constituent atoms were re-grounded at Final Critique 4 on 2026-06-18. This round is that missing AI-conducted adversarial round (fresh-reader Opus, Happy-Torvalds-X2); it is the composition's Final Critique 4 (Rounds 1–3 the foundation/refinement baseline, per pressure-testing.md §Round structure). The composition's own logic (cascade-on-delete and the two derived queries) was already logic-confinement-clean — it delegates all clock and id allocation to its now-grounded constituents (Personal Todo, Permissions, Assignment) — so no foundational finding arose. One refining fix folded: the unreachable `not-pending` rejection propagated from Personal Todo was dropped from `edit_task` and the delegated `edit`; `complete`'s reachable `not-pending` is preserved.. Caller signatures unchanged and the invariant set held at 8 (read the actual count from the spec and confirm no change), so the fixes are additive with no constituent-change cascade. Formal-layer vote stands YES (model present and verifying); not reopened. Confirming fresh-reader Opus clearance gate (2026-06-18): CLEAR, 0 foundational, no new surface. It has no compositional dependents (leaf). Grounds at Final Critique 4.

**Composition-state classification fold — 2026-08-26 (batched pre-convention tail, methodology debt #9; gated by Final Critique 5 below).** Convention retrofit for the composition-state rule adjudicated 2026-06-10, which postdates this composition's grounding. Change: Composition state declared **conforming — no stored composition state**, with the two derived queries ([Responsible Actor], [Visible Tasks]) pinned as read-time pure joins over the constituents' declared query surfaces, never materialized with a consistency claim. The classification confirms what the section already said; the fold makes it the rule's vocabulary and cites the rule. **Caller signatures UNCHANGED**; no invariant number, signature, or rejection taxonomy changed. Gate: closed by Final Critique 5 below.

**Final Critique 5 — 2026-08-26: not clean (3 foundational; ROUTED, not folded — the tail round ends here).** The closing fresh-reader gate over the 2026-08-26 convention fold (AI-conducted, claude-fable-5, Happy-Torvalds-X2, fresh-reader discipline throughout — pass question sets, the spec body, and the three constituent specs for structural checking only; no Lineage, no prior findings). Pass 2 returned clean (the conforming/no-stored-state declaration confirmed; the scope vocabulary correctly composition-owned; every projected contract verified token-for-token), and the gate credited the completion-vs-recall stance, the concurrency loser-rejections, and the recall-ordering inside [Delete Task] as defended. It surfaced **three foundational findings** — all dropped constituent delegations — plus seven refining and three rhetorical. Per the stop rule, all are recorded as **open routed findings**; the composition is downgraded to `partially resolved` until they close and a round returns zero foundational. The three foundational:

- *FC5-F1 — assign-side referential integrity hole falsifies the cascade rule's claimed invariant — foundational (OPEN) →* Assignment explicitly delegates task-existence validation to the composing system, and [Assign Task] never picks it up: assigning a never-existing or deleted `task_id` succeeds (the delete cascade recalled the old assignment, and retired ids never return), leaving a permanent Active assignment against no task — against the cascade rule's "no Active assignment references a deleted task", the Summary's no-dangling claim, and Invariant 3 read as standing. Fix: an existence check (Pending ∪ Done) before `Assignment.assign`, a `not-known` arm on the signature, and a stated position on assigning Done tasks.
- *FC5-F2 — administration of the Permissions instance neither wired nor named out of scope — foundational (OPEN) →* the composition maintains the instance and gates everything on it, but no action wires `grant`/`revoke`, no scope governs them, and Edge cases never names grant administration a non-goal — the one mutation surface controlling all others is silently absent. Fix: an Edge-cases bullet declaring grant/revoke administration out of scope for the canonical composition, with Attributed Permissions Admin named for regulated deployments.
- *FC5-F3 — the actor_ref ↔ authenticated-caller binding delegation dropped — foundational (OPEN) →* Permissions explicitly hands the caller-binding question to "the composing system"; this composition passes caller-supplied `actor_ref` into every check and says nothing about authentication anywhere. Fix: an Edge-cases bullet naming the binding a deployment-seam assumption with the Authentication composing pattern as the supplier.

*Refining/rhetorical (open, from Final Critique 5):* SLA unglossed; the read-query denial semantics (`empty result or permission-denied, depending on deployment policy`) contradicting the projected contracts and leaking determinism; `responsible_actor` on an unknown task undefined (the existence-join's purpose unobservable); [Delete Task]'s recall-committed-then-delete-fails partial named nowhere; the clinical example's who-authorized-reassignment recoverability overstated (no constituent records the acting actor); the support-queue roster never granting tier-2 what the example exercises; the single-instance emergent consequences unstated (global description uniqueness; `duplicate-active` as an existence oracle for actors without `tasks:view`). Rhetorical — the Composes gloss eliding the delete-from-Pending branch; the per-task phrasing of a task-independent view predicate; the sprint manager operating without `tasks:view`.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, or rejection taxonomy changed. First composition converted to the showcase standard; the convention established for compositions: card the composition's *own* concepts and leave constituent references as qualified calls and full atom-links. (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added after Edge cases (17 terms): 9 Operations — the 7 composed action-wirings ([Add Task], [Edit Task], [Complete Task], [Delete Task], [Assign Task], [Reassign Task], [Recall Assignment]) plus the 2 derived queries ([Responsible Actor], [Visible Tasks]); 0 Types / 0 Fields / 0 Parameters (the composition owns no emergent record store — its state is the join of the three constituents); and 8 Members — the 7-scope vocabulary ([Tasks View], [Tasks Add], [Tasks Edit], [Tasks Complete], [Tasks Delete], [Tasks Assign], [Tasks Recall]) it defines for its Permissions instance, plus its own [Permission Denied] rejection. Survivors left backticked: the one labeled projected-contract signature per composed Operation; the qualified constituent calls (`Personal Todo.add`, `Permissions.permitted`, `Assignment.recall`, `Assignment.active_for`, and so on) and their outcomes (`permitted`/`denied`, `ok`, `unassigned`); the inherited constituent rejection tokens that flow through (`not-pending`, `not-known`, `not-editable`, `duplicate-active`, `invalid-description`, `already-assigned`, `not-active`, `invalid-request`, `storage-failure`); constituent field/id tokens (`task_id`, `assignee_ref`, `assignment_id`, `recalled_at`); the hypothetical finer scopes (`tasks:view:task_id`, `tasks:edit:own`); and concrete example calls, ids, and grants. Constituent atom names remain the existing full links to `../atoms/*`. (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), the descriptive top blockquote folded out after confirming each claim is carried by Summary/Intent/Composes/Composition-level invariants; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #1** — the single-paragraph Summary split into one-idea-per-sentence paragraphs, lossless (its second paragraph, on common uses, kept intact). (e) **prose cut #5 — skipped (with reason):** the composition owns no emergent state machine (its lifecycle states live in the constituents — Personal Todo's Pending→Done, Assignment's Active/Recalled/Transferred); its own action wiring is a uniform permission-check-then-delegate shape already listed crisply in Action wiring, with the one cascade-on-delete deviation called out there. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-06-18`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (17 terms); 8 composition-level invariants preserved; `.tla` untouched — harness re-run green: `shared-todo.tla` PASS + `shared-todo-buggy.tla --buggy` rejected.

</details>
