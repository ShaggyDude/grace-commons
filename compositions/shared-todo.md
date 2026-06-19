---
title: Shared Todo
parent: Compositions
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


> A multi-actor task composition: a shared list where actors see tasks according to their grants, act on tasks according to their grants, and hold responsibility for tasks according to their assignments. Composes Personal Todo, Permissions, and Assignment — task lifecycle, authorization surface, and responsibility binding — into a single coherent artifact. The emergent guarantee: every mutation is gated by an explicit permission check, and every task has at most one responsible actor at any time.

---

## Intent

Personal Todo is single-actor by design. It has no concept of who is acting, no concept of what different actors are allowed to do, and no concept of one actor being responsible for completing a task someone else created. Those three concepts — task lifecycle, authorization, and responsibility — are each freestanding atoms that compose cleanly. Shared Todo is the composition that wires them.

The pattern addresses the form of multi-actor work that recurs across virtually every collaborative domain: a development team's sprint board where tasks are visible to all but editable only by their owners; a support queue where tickets are assigned to agents with different role-based access; a clinical care plan where nurses and physicians see the same task list but hold different permissions over it; a legal matter where paralegals and partners share a checklist with clear ownership of each item.

The shape is constant across all of them: actors see and act on tasks according to granted scopes (opaque permission tokens, such as `tasks:edit`, that the composition defines and Permissions enforces); one actor is responsible for each task at any given time; the full history of who held what permission and who was responsible for what task is recoverable from the records alone.

This is a composition, not a new primitive. Personal Todo, Permissions, and Assignment are unchanged. The composition is the wiring that makes their three concepts coherent — a single multi-actor task surface rather than three separate record stores the caller has to coordinate by hand.

---

## Summary

Shared Todo turns a single-user task list into a shared, multi-person one where every change is gated by a permission check and every task has at most one person responsible for it at a time. It combines three simpler patterns: a task list (Personal Todo), a grant-based permission system (Permissions), and a responsibility-tracking pattern (Assignment). None of the three knows about the others — the task list has no notion of who is acting, the permission system treats access scopes as meaningless strings until the composition gives them meaning, and the responsibility tracker records who owns a task but does not enforce anything. The composition wires them together so that every action passes a permission check first, deleting a task automatically recalls whoever was responsible for it, and two new queries become possible that no single pattern could answer alone: who is responsible for a task right now, and which tasks a given person is allowed to see. Combining the patterns produces guarantees none has alone — no one can change the list beyond their granted permissions, no responsibility is left dangling against a deleted task, and the full history of who could do what and who owned what is recoverable from the records. This is the standard building block for any collaborative task system where ownership and access control must be auditable.

The most common uses are software development sprint boards with role-based edit and assignment rights, support queue systems where tickets are assigned to agents with different tier-level access, clinical care planning where nurses and physicians share a task list but hold different permissions over it, and legal or compliance workflows where checklist items require clear ownership and an auditable record of who held which permission.

---

## Composes

- **[Personal Todo](../atoms/personal-todo.md)** — provides the task lifecycle: `add`, `edit`, `complete`, `delete`, the state machine (Pending → Done → deleted), all its invariants (identity model, active-set description uniqueness, timestamp monotonicity, and so on). The composition maintains exactly one Personal Todo instance (the shared task store).
- **[Permissions](../atoms/permissions.md)** — provides the authorization surface: `grant`, `revoke`, `permitted`. The composition maintains exactly one Permissions instance scoped to the task list. Every state-changing action and every read query is gated by a `permitted` check before reaching Personal Todo or Assignment.
- **[Assignment](../atoms/assignment.md)** — provides the responsibility binding (the record that names which actor is accountable for a task and tracks transitions — Active, Recalled, Transferred — as accountability changes): `assign`, `recall`, `reassign`. The composition maintains exactly one Assignment instance. At most one actor is responsible for any task at any time; the full responsibility history for every task is recoverable from the assignment store.

---

## Composition logic

### Composition state

The composition owns no emergent record store beyond the three constituent atoms. The join is derived: for any `task_id`, the current responsible actor is `Assignment.active_for(task_id).assignee_ref` (one result or none); the tasks visible to `actor_ref` are the Personal Todo tasks for which `Permissions.permitted(actor_ref, tasks:view)` returns `permitted`.

Two derived queries the composition surfaces that neither constituent answers alone:

- **`responsible_actor(task_id) → assignee_ref | unassigned`** — joins Personal Todo (does the task exist?) and Assignment (who holds the active assignment?).
- **`visible_tasks(actor_ref) → [task_id, ...]`** — joins Personal Todo (the full task set) and Permissions (which tasks the actor may see). In the canonical single-list deployment, `tasks:view` is a list-level grant and returns all tasks or none; finer-grained per-task visibility belongs to a scoped Permissions deployment described in Edge cases.

### Scope vocabulary

Permissions treats action scopes as opaque. Shared Todo defines the canonical scope vocabulary for its Permissions instance:

| Scope | Permits |
|-------|---------|
| `tasks:view` | Read the shared task list — see tasks and their current assignees |
| `tasks:add` | Call `add` on Personal Todo |
| `tasks:edit` | Call `edit` on any pending task |
| `tasks:complete` | Call `complete` on any task |
| `tasks:delete` | Call `delete` on any task |
| `tasks:assign` | Call `assign` and `reassign` on Assignment |
| `tasks:recall` | Call `recall` on Assignment |

The vocabulary is deployment-configurable. A deployment that distinguishes "edit your own tasks" from "edit any task" introduces finer-grained scopes (`tasks:edit:own`, `tasks:edit:any`) and adjusts the wiring accordingly; the canonical vocabulary above is the minimum useful set. The Permissions instance is the single source of truth for what a given actor may do; the scope vocabulary is the contract between the deployment and the composition wiring.

### Action wiring

Every action follows the same two-step shape: Permissions check first, atom call second. A `denied` result from Permissions short-circuits the action and surfaces `permission-denied` to the caller; the constituent atoms are not invoked.

- **`add_task(actor_ref, description) → task_id | rejected(permission-denied | invalid-description | duplicate-active | storage-failure)`**
  1. `Permissions.permitted(actor_ref, tasks:add)` → if `denied`, return `permission-denied`.
  2. `PersonalTodo.add(description)` → `task_id | rejected(invalid-description | duplicate-active | storage-failure)`. Return the result.

- **`edit_task(actor_ref, task_id, new_description) → ok | rejected(permission-denied | not-known | not-editable | invalid-description | duplicate-active | storage-failure)`**
  1. `Permissions.permitted(actor_ref, tasks:edit)` → if `denied`, return `permission-denied`.
  2. `PersonalTodo.edit(task_id, new_description)` → `ok | rejected(not-known | not-editable | invalid-description | duplicate-active | storage-failure)`. Return the result.

- **`complete_task(actor_ref, task_id) → ok | rejected(permission-denied | not-known | not-pending | storage-failure)`**
  1. `Permissions.permitted(actor_ref, tasks:complete)` → if `denied`, return `permission-denied`.
  2. `PersonalTodo.complete(task_id)` → `ok | rejected(not-known | not-pending | storage-failure)`. Return the result. The assignment for `task_id`, if Active, is not automatically recalled; see Edge cases.

- **`delete_task(actor_ref, task_id) → ok | rejected(permission-denied | not-known | storage-failure)`**
  1. `Permissions.permitted(actor_ref, tasks:delete)` → if `denied`, return `permission-denied`.
  2. If `Assignment.active_for(task_id)` returns an active assignment, call `Assignment.recall(assignment_id)` — the cascade-on-delete rule; see Composition-level invariants. If this `recall` returns `rejected(storage-failure)`, return `storage-failure` immediately; do not proceed to step 3.
  3. `PersonalTodo.delete(task_id)` → `ok | rejected(not-known | storage-failure)`. Return the result.

- **`assign_task(actor_ref, task_id, assignee_ref) → assignment_id | rejected(permission-denied | already-assigned | invalid-request | storage-failure)`**
  1. `Permissions.permitted(actor_ref, tasks:assign)` → if `denied`, return `permission-denied`.
  2. `Assignment.assign(task_id, assignee_ref)` → `assignment_id | rejected(invalid-request | already-assigned | storage-failure)`. Return the result.

- **`reassign_task(actor_ref, assignment_id, new_assignee_ref) → new_assignment_id | rejected(permission-denied | not-known | not-active | invalid-request | storage-failure)`**
  1. `Permissions.permitted(actor_ref, tasks:assign)` → if `denied`, return `permission-denied`.
  2. `Assignment.reassign(assignment_id, new_assignee_ref)` → `new_assignment_id | rejected(not-known | not-active | invalid-request | storage-failure)`. Return the result.

- **`recall_assignment(actor_ref, assignment_id) → ok | rejected(permission-denied | not-known | not-active | storage-failure)`**
  1. `Permissions.permitted(actor_ref, tasks:recall)` → if `denied`, return `permission-denied`.
  2. `Assignment.recall(assignment_id)` → `ok | rejected(not-known | not-active | storage-failure)`. Return the result.

Read-only queries (`visible_tasks`, `responsible_actor`, task detail by id) check `tasks:view` before reading from Personal Todo or Assignment. A `denied` on `tasks:view` returns an empty result or `permission-denied`, depending on deployment policy.

### The cascade-on-delete rule

The composition's load-bearing wiring decision: when a task is deleted, any Active assignment for that task is recalled before the deletion proceeds. Neither Personal Todo (which knows nothing about assignments) nor Assignment (which knows nothing about task deletion) enforces this; the composition wiring does. The recall is recorded in the Assignment store — the assignment moves Active → Recalled (Active means one actor currently holds responsibility; Recalled means responsibility was explicitly withdrawn), with `recalled_at` — before the task leaves the Personal Todo store. This preserves the invariant (a condition that must always hold) that no Active assignment references a deleted task.

---

## Composition-level invariants

These invariants emerge from the composition. None belong to a single constituent; each requires two or all three atoms working together to hold.

- **Invariant 1 — Permission enforcement.** No actor performs a state-changing action (add, edit, complete, delete, assign, reassign, recall) without a `permitted` result from the Permissions instance for the corresponding scope. A `denied` result short-circuits the action before any constituent atom is invoked.
- **Invariant 2 — At most one responsible actor per task.** At any time, no task in the shared list has more than one Active assignment. Inherited from Assignment's Invariant 1 and surfaced through the composition's single Assignment instance.
- **Invariant 3 — Cascade-on-delete.** When a task is deleted, any Active assignment for that task is recalled before the deletion completes. After a successful `delete_task`, no Active assignment exists for the deleted `task_id`.
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

- **Per-task visibility scoping.** The canonical scope vocabulary uses `tasks:view` as a list-level grant — an actor either sees all tasks or none. Per-task visibility (actor A can see task 1 but not task 2) requires a finer-grained scope vocabulary (`tasks:view:task_id`) or a separate resource-scoped Permissions instance per task. That is deployment configuration, not part of the canonical composition.
- **Assignment implies view access.** The composition does not automatically grant `tasks:view` to actors who receive an assignment. An actor assigned to a task they cannot see is a valid (if unusual) state. Deployments that want assignment to imply view access should issue a `tasks:view` grant alongside each assignment, or introduce a composing pattern that does so.
- **Self-assignment.** An actor with `tasks:assign` can assign a task to themselves. The composition does not prevent it; if the deployment policy prohibits self-assignment, the composition wiring should add a check that `actor_ref ≠ assignee_ref` before calling `Assignment.assign`.
- **Completion handling for assignments.** When a task is completed, its Active assignment is not automatically recalled. The assignment record remains Active as a completion-attribution record — *who was responsible when this was completed* — unless the deployment policy calls `recall_assignment` on completion. Both patterns are valid; the composition supports either.
- **Deletion of assigned tasks.** The cascade-on-delete rule recalls the Active assignment before deleting the task. Recalled is the correct terminal state for an assignment on a deleted task (the task no longer exists; the actor's responsibility is discharged by the deletion, not by their own action). The assignment history, including the recall, remains in the Assignment store.
- **Undo.** The composition does not include undo. Adding undo requires composing with an Event Log instance (as Undo History demonstrates); the three-atom Shared Todo composition does not absorb it.
- **Audit trail.** The composition does not include tamper-evident audit logging. Deployments with regulated audit obligations compose Shared Todo's action surface with Audit Trail — each `add_task`, `assign_task`, `complete_task` etc. becomes a `record_action` call in the Audit Trail composition. The two compositions are independent; stacking them is the regulated-deployment pattern.
- **Task priorities, dependencies, due dates.** Each is a separate atom composing with Personal Todo. The Shared Todo composition names Personal Todo as its constituent; extending with priority or due-date atoms means composing a richer task atom, not modifying Shared Todo.
- **Concurrent action races.** Two actors simultaneously calling `assign_task` for the same `task_id` resolve serially under the host environment's serialization guarantees; Assignment's `already-assigned` rejection handles the loser. Two actors simultaneously calling `delete_task` for the same `task_id` resolve serially; Personal Todo's `not-known` rejection handles the loser.
- **Revoked grants mid-session.** If an actor's `tasks:edit` grant is revoked while they have an edit in flight, the timing depends on when `permitted` is called. The composition checks `permitted` at action initiation; whether in-flight operations are re-checked mid-execution is handled at the deployment layer.

---

## Status

`grounded on Final Critique 4 — 2026-06-18` (Final Critique 4 — the first AI-conducted adversarial round, fresh-reader Opus, 2026-06-18 — closed the propagated unreachable `not-pending` rejection was dropped from `edit` (its own logic was already logic-confinement-clean); caller signatures unchanged; see Lineage. Formal-layer vote stands YES (model present and verifying); not reopened. The composition was grandfathered at the legacy `grounded — 2026-05-20` token until this round.) — composition logic specified across all three constituent atoms; emergent composition state (the two derived queries) named; cascade-on-delete rule stated as the load-bearing wiring decision; eight composition-level invariants stated and justified; scope vocabulary defined with canonical seven scopes; action wiring covers all state-changing surfaces with permission-check-first discipline; three cross-domain examples (sprint board, support queue, clinical care plan) exercising role-based access and task handoff; edge cases enumerate what is handled at the deployment layer (per-task visibility, self-assignment, completion handling, concurrent races, revoked grants, audit trail, undo). Fourth entry in `compositions/`. The three-atom composition the library has been forecasting since Personal Todo landed.

---

## Lineage notes

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
