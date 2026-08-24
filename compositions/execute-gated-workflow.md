---
title: Execute Gated Workflow
parent: Conceptual Compositions
nav_order: 10
has_toc: true
toc: true
---

# Execute Gated Workflow

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Execute Gated Workflow freezes a declared process map (states, allowed transitions, and which transitions require human approval) and enforces permissions on who may start or advance it.

A guarded transition is gated by an Approval Step that an authorized actor opens on demand and assigns to the named approver's in-tray; the transition cannot fire until that step is Approved.

The Audit Trail substrate attributes every transition and gate decision to the acting actor's identity, governs retention, and seals the record tamper-evident — a records-alone forensic proof.

Together these produce what no constituent provides alone: the process followed only its declared path, every gate was cleared by a real human decision (not a bare assertion), and the full history is attributed, sealed, and reconstructible.

This composition is the structural form of FDA (US Food and Drug Administration) 21 CFR (Code of Federal Regulations) Part 11 electronic records workflows, SOX (Sarbanes-Oxley Act — US law on corporate financial reporting and records integrity) §404 process-control records, ISO (International Organization for Standardization) 9001 §8.5.1 production-process documentation, and any regulated domain that must prove compliant execution from records alone.

---

## Intent

Multi-step regulated processes share a common structure: an entity moves through a declared sequence of states, some transitions require explicit human approval before they may fire, every transition must be attributed and tamper-evidenced, and the entire history must be reconstructible from the records alone. A pharmaceutical batch-release process requires declared quality-control steps with a qualified-person approval gate before release. A financial journal-entry promotion requires controller sign-off at the booking gate. A clinical-trial protocol change requires investigator and sponsor approvals before the change may proceed. A software change request requires a review approval before it can be merged to production. In every case the structure is the same: a declared state machine governing the process instance, a set of gates (transitions that may not fire until a named approver has actually decided), an authorization surface governing who may advance the process at all, a work-tracking surface that keeps each pending gate in the right person's in-tray, and a regulated-audit substrate that makes every advancement and every gate decision attributed, sealed, and retention-governed.

The constituent atoms address each of these concepts freestanding. [State Machine](../atoms/state-machine.md) enforces declared-transition discipline — only declared transitions fire, exactly one current state at all times, the full transition history is append-only, total-ordered, and replay-deterministic. [Approval Step](../atoms/approval-step.md) is the per-gate primitive — one named approver, one subject, one scope, one outcome (Pending → Approved | Rejected | Withdrawn), with approver exclusivity enforced by its Invariant 4. [Permissions](../atoms/permissions.md) governs standing authorization — who holds the `workflows:start` and `workflows:fire` grants that permit process-level actions. [Assignment](../atoms/assignment.md) binds each open gate to the named approver's in-tray and recalls the binding when the gate is decided. [Audit Trail](./audit-trail.md) is the regulated-audit substrate that supplies Event Log, Actor Identity, Retention Window, and Tamper Evidence as a single composition.

What the constituent atoms cannot answer alone is the central regulated question: *did this guarded transition fire only after its named approval was genuinely recorded?* State Machine's guard model (Invariant 8 — guard-gating without evaluation) deliberately does not evaluate guard predicates; it trusts a caller-asserted `guard_satisfied = true` and records the assertion. Its Edge cases name this as a calling-system obligation and explicitly flag approval-gate evaluation as the concept this composition re-converges. This composition is where that re-convergence happens: it binds each guarded transition to an Approval Step (`gate_binding`), reads the bound step's state before any `fire` call, and asserts `guard_satisfied = true` to `WorkflowStateMachine.fire` only when the bound step is in Approved. The caller of this composition never supplies `guard_satisfied` directly for a guarded transition; the composition derives it from the gate's actual approval record.

This is not a new primitive. The five constituent atoms (and the Audit Trail substrate) are unchanged. The composition is the wiring that makes their concepts coherent — one consolidated multi-actor regulated-workflow surface rather than five parallel record stores the auditor must correlate by hand.

The composition addresses what State Machine's EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) extraction correctly deferred: guard evaluation, non-repudiable attribution, retention governance, Permissions gating, and the in-tray binding for pending approvals. The composition resolves those deferred obligations without re-deriving the underlying primitives.

---

## Composes

- **[State Machine](../atoms/state-machine.md)** — the orchestrating spine. Provides the declared-state-machine enforcement: only declared transitions fire; exactly one current state at all times; the full transition history is append-only, total-ordered by sequence number, and replay-deterministic. The composition instantiates one State Machine instance per workflow run, supplies it the deployment-declared process declaration, and calls `fire` on it as the sole write path — the composition never bypasses `fire`.

- **[Approval Step](../atoms/approval-step.md)** — the per-gate human-approval primitive. Provides the gate record: one Approval Step per guarded transition that becomes relevant, each carrying its own `step_id`, `subject_ref`, `approver_ref`, `submitter_ref`, `scope`, lifecycle (Pending → Approved | Rejected | Withdrawn), and Invariant 4 enforcement that only the named `approver_ref` may transition to Approved or Rejected. The composition submits one Approval Step when a gate is opened, reads its state when the corresponding transition is to be fired, and supplies `guard_satisfied = true` to `WorkflowStateMachine.fire` only when the step is in Approved.

- **[Permissions](../atoms/permissions.md)** — the authorization surface for workflow-level actions. Provides `grant`, `revoke`, and `permitted`. Every workflow-level state-changing action ([Start Workflow], [Fire Transition]) and every workflow-level read query ([Read Workflow]) is gated by a `permitted` check before reaching any constituent store. Step-level gate decisions ([Decide Gate]) are enforced by Approval Step's Invariant 4 (named-approver exclusivity) directly — no redundant chain-layer permission check, mirroring Multi-Party Approval's scope-vocabulary discipline.

- **[Assignment](../atoms/assignment.md)** — the in-tray binding for open gates. On gate opening, one Assignment record is created (`task_ref = step_id`, `assignee_ref = approver_ref` from the `gate_spec`) so the named approver can query *"which approval gates are currently in my in-tray?"* via Assignment's query surface. When the gate is decided (Approved, Rejected, or Withdrawn), the corresponding Assignment is recalled — the responsibility is discharged.

- **[Audit Trail](./audit-trail.md)** — the regulated-audit substrate. Every workflow-level action (`workflow_started`, `gate_opened`, `gate_decided`, `transition_fired`) is recorded as one `record_action` call on the Audit Trail instance, producing an Event Log entry, an Actor Identity attestation, a Retention Window record, and (per the deployment's seal cadence) a Tamper Evidence seal. The composition maintains exactly one Audit Trail instance configured with the deployment's regulatory retention policy. The Event Log and Actor Identity atoms that the roadmap entry for this composition listed as prerequisites are reached transitively through Audit Trail; the composition does not maintain separate Event Log or Actor Identity instances.

---

## Composition logic

### Composition state

The composition owns emergent state — the workflow store, the gate binding maps, and the cross-atom traversal maps — that wires the constituent atoms into one queryable regulated-workflow surface. None of these state elements belongs to any single constituent atom.

- **`workflow_store`** — the set of workflow instance records. Each record carries: `instance_id` (the State Machine instance id, assigned by the constituent at [Start Workflow]), `subject_ref` (an opaque reference to the entity whose lifecycle this workflow governs), `initiator_ref` (the actor who started the workflow), `declaration_ref` (an opaque reference identifying the deployment's declared process definition — the exact declaration supplied at [Start Workflow]), [Gate Spec] (the map from each guarded transition's guard label to `{approver_ref, scope}` naming the approval required for that gate; set at [Start Workflow], immutable), and `started_at`. The workflow record is immutable on every field from the moment [Start Workflow] returns; the State Machine constituent owns `current_state` and the transition history.

- **`gate_binding`** — map from `(instance_id, guarded transition action name)` to the `step_id` of the Approval Step that gates it. Set when [Open Gate] opens a gate for a given `(instance_id, action)` pair. This is the load-bearing traversal from a guarded transition to its approval record: at [Fire Transition], the composition reads `gate_binding[(instance_id, action)]` to find the step, then reads the step's state to determine whether `guard_satisfied` may be asserted. Keys are immutable from the moment [Open Gate] returns for a given pair; no re-binding of a guarded transition to a different step under the same `(instance_id, action)` pair is permitted in the same workflow instance.

- **`gate_to_assignment`** — map from `step_id` (a gate's Approval Step id) to the `assignment_id` of its in-tray binding. Set when [Open Gate] creates the Assignment. Used at [Decide Gate] to recall the in-tray binding when the gate is decided, and during moot-gate cascade when the workflow leaves a transition's `from_state` by firing a different transition out of it.

- **`transition_to_event`** — map from a fired transition's `transition_id` (the State Machine history entry id) to the Audit Trail `event_id` that attributes and seals the firing. Set at [Fire Transition] after `WorkflowStateMachine.fire` succeeds and `AuditTrail.record_action` returns an `event_id`. The traversal backbone for the forensic query: from a transition in the State Machine history to its Audit Trail attestation.

### Configuration

- **`audit_trail_retention_policy`** — the policy reference passed to the Audit Trail instance at each `record_action` call. Typically a regulatory policy id (`sox_7_year`, `fda_part_11_predicate_rule`, `hipaa_6_year`, `ich_e6_tmf`). The choice is deployment policy; the composition surfaces the configuration knob but does not enforce a default. Regulated deployments must configure this explicitly; a deployment silent on retention policy accepts the Audit Trail instance's own default, which is a deployment-policy choice the composition cannot evaluate.

- **`application_actor_ref` and `application_credential`** — the deployment-provisioned actor reference and credential the composition uses when emitting composition-internal Audit Trail entries that have no direct human-actor origin: specifically, the `moot_gate_recalled` event produced when the composition cascade-recalls a gate that has become unreachable because the workflow left its `from_state` by firing a different transition. The composition actor is a first-class registered actor in the Audit Trail's underlying Actor Identity registry — not a special-cased nil — and its attestations verify under the same rules as human-actor attestations. The deployment is responsible for issuing, rotating, and retiring this credential under the same Permissions and operational discipline applied to any privileged service identity. An auditor querying the Audit Trail sees `moot_gate_recalled` events attributed to the composition actor and can verify them against the registry's public material exactly as for human-actor events. The forgery defense for composition-actor events rests on the composition's own structural records: a forged `moot_gate_recalled` event claiming a gate was recalled for a transition that the State Machine history shows was actually fired (rather than superseded by an alternate transition) is detectable by cross-referencing the event against the transition history. The distinguishing rule: `moot_gate_recalled` is the sole event emitted with `actor_ref = application_actor_ref`; all other workflow events use the human actor's reference.

### Scope vocabulary

Permissions treats action scopes as opaque. This composition defines the canonical scope vocabulary for its Permissions instance:

| Scope | Permits |
|-------|---------|
| [Workflows Start] | Call [Start Workflow] to instantiate a new workflow run |
| [Workflows Open Gate] | Call [Open Gate] to open an approval gate for a guarded transition |
| [Workflows Fire] | Call [Fire Transition] to advance the workflow through a transition |
| [Workflows Read] | Read workflow records and their composed gate, assignment, and attestation surface |

Gate decisions ([Decide Gate], which wraps Approval Step's `approve`/`reject`/`withdraw`) are *not* additionally permission-gated at the workflow layer: Approval Step's Invariant 4 (only the named `approver_ref` may transition Pending to Approved or Rejected) and Invariant 5 (only the named `submitter_ref` may transition Pending to Withdrawn) are the structural enforcement for who may decide each gate. Adding a second permission check at the workflow layer would be redundant and risks the two checks drifting out of sync. The workflow composition relies on Approval Step's enforcement and surfaces an `unauthorized` rejection from the underlying atom unchanged, mirroring Multi-Party Approval's scope-vocabulary discipline.

The vocabulary is deployment-configurable. A deployment that distinguishes initiator roles (e.g., `workflows:start:pharma-batch`, `workflows:start:financial-journal`) introduces finer-grained scopes and adjusts the wiring accordingly; the canonical vocabulary above is the minimum useful set.

### Primitive policies

These input-validation rules apply at the composition boundary before any constituent atom is invoked. They close the *"but what does X mean exactly?"* class of Pass 3 findings up front.

- **`actor_ref`, `subject_ref`, `initiator_ref`, `approver_ref`, `submitter_ref`** — must each contain at least one non-whitespace character. Null, empty, or whitespace-only values are `invalid-request` at the composition boundary before any Permissions or constituent call.
- **`credential`** — must be a parseable, non-null value of the deployment's declared credential type. Malformed credentials are `invalid-request` before any constituent call.
- **`reason`** — optional on [Start Workflow], [Open Gate], [Fire Transition]. Required as the `reason` argument passed into [Decide Gate] for gate decisions of type Rejected or Withdrawn (propagated from Approval Step's `reject`/`withdraw` mandatory-reason rule). If supplied in any action, must contain at least one non-whitespace character.
- **`gate_spec`** — at [Start Workflow], the composition validates that `gate_spec` covers exactly the set of guarded transitions in the supplied declaration: for every transition in the declaration carrying a `guard` label, `gate_spec` must contain an entry keyed by that guard label, and each entry must carry a non-whitespace `approver_ref` and a non-whitespace `scope`. A `gate_spec` with entries for guard labels not present in the declaration is `invalid-request` (the deployment named a gate that will never be used). A declaration with guarded transitions for which `gate_spec` has no entry is `invalid-request` (a guarded transition with no named approver cannot be governed). The `gate_spec` validation is part of [Start Workflow] step 2; no `WorkflowStateMachine.instantiate` call is made until `gate_spec` passes.
- **`instance_id`** — must contain at least one non-whitespace character for all actions that take it. Non-whitespace enforcement follows State Machine's own `instance_id` rule.
- **`decision`** — at [Decide Gate], must be one of the string literals `"approve"`, `"reject"`, or `"withdraw"`; any other value is `invalid-request`.

### Logic confinement (clock and id)

The clock is an **injected input at the composition's single I/O seam**, never read inside a guard or a transition and never threaded through a caller signature. Per the Logic Confinement Principle ([`execution-contract.md`](../execution-contract.md)), the host reads the clock once per invocation and injects `now` (`clock_t`) at the seam before the orchestration runs; the actions below are pure functions of their inputs, the constituent records, and that injected `now`. Because the clock enters at the seam rather than as a parameter, the action signatures below carry **no** `now` argument. Where a constituent's own contract accepts an explicit timestamp — `instantiated_at` on `WorkflowStateMachine.instantiate`, `fired_at` on `WorkflowStateMachine.fire`, `decided_at` / `withdrawn_at` on Approval Step's decisions — the composition passes that seam-injected reading rather than leaving the constituent to take a second, independent clock reading.

`now` is consumed for exactly one purpose at this layer: **stamping timestamps on committed writes.** There are no derived deadlines — the composition computes no TTL, expiry, or due date — and **no clock-bearing guard**: the load-bearing gate in [Fire Transition] is *state*-valued, not time-valued (it reads whether the bound Approval Step is in Approved), so no guard in this composition consults the clock at all. The stamps are:

- `instantiated_at` on `WorkflowStateMachine.instantiate` and `started_at` on the `workflow_store` record, at [Start Workflow];
- `submitted_at` on `ApprovalStep.submit`, at [Open Gate];
- `decided_at` on `ApprovalStep.approve` / `ApprovalStep.reject` and `withdrawn_at` on `ApprovalStep.withdraw`, at [Decide Gate] and on the moot-gate cascade;
- `fired_at` on `WorkflowStateMachine.fire`, at [Fire Transition].

Ordering is never derived from those stamps: the State Machine's `sequence_number` is the authoritative order of the transition history and the Audit Trail's own sequence is the authoritative order of the event record (Edge cases — *Clock source for `fired_at` and `decided_at`*). Nor is any eligibility, expired, or overdue flag stored anywhere in the composition's emergent state — `workflow_store`, `gate_binding`, `gate_to_assignment`, and `transition_to_event` carry identity, binding, and immutable stamps only — so nothing at this layer can lag the clock.

**One injected `now` per invocation, shared.** Within a single [Start Workflow] the same reading is both `instantiated_at` and `started_at`, so the constituent's instance record and the composition's workflow record name one instant rather than two adjacent ones. Within a single [Open Gate] the same reading is the Approval Step's `submitted_at` and the `gate_opened` event — passed explicitly so the gate's submission stamp and this layer's record cannot straddle two seams, which matters because Approval Step's Invariant 7 (`decided_at ≥ submitted_at`) is enforced before commit and a cross-seam skew could otherwise reject a legitimate approval. Within a single [Decide Gate] the same reading is the Approval Step's `decided_at` / `withdrawn_at` and the `gate_decided` event. Within a single [Fire Transition] the same reading is `fired_at`, the `transition_fired` event, and the moot-gate cascade the firing triggers (step 7) — the cascade is part of that invocation, not a second one with a clock read of its own. Ids are allocated by the constituents at their own seams: `instance_id` by State Machine's `instantiate`, `step_id` by Approval Step's `submit`, `assignment_id` by Assignment's `assign`, `transition_id` by the appended State Machine history entry, and `event_id` by Audit Trail's `record_action`. This composition mints no id inside a transition and generates no cryptographic material — attestations and seals belong to the Audit Trail substrate, produced at its own seam through Actor Identity and Tamper Evidence.

### Action wiring

Every workflow-level action follows the same three-step shape: Permissions check first, constituent atom call(s) second, Audit Trail record third. Gate-decision actions delegate structural authorization to Approval Step and record second. Each action lists the full rejection taxonomy; every constituent rejection is either propagated, renamed, or surfaced as a new code at the composition boundary.

---

#### `start_workflow(actor_ref, declaration, subject_ref, gate_spec, credential, [reason]) → {instance_id} | rejected(permission-denied | invalid-declaration | invalid-request | recording-failure)`

1. `Permissions.permitted(actor_ref, workflows:start)` → if `denied`, return `rejected(permission-denied)`.
2. Validate `gate_spec` against `declaration` per Primitive policies: every guarded transition in the declaration has a matching entry in `gate_spec`; every `gate_spec` entry names a real guard label; every entry carries non-whitespace `approver_ref` and `scope`. Validate `subject_ref` per Primitive policies (non-whitespace). Any violation is `rejected(invalid-request)`. No State Machine call is made until this passes.
3. Call `WorkflowStateMachine.instantiate(declaration, actor_ref, instance_metadata={subject_ref, gate_spec_labels}, instantiated_at=now)` → `instance_id | rejected(invalid-declaration)`, where `instantiated_at` is the **seam-injected `now`** for this invocation (see *Logic confinement*). Propagate `invalid-declaration` unchanged. `storage-failure` from the constituent surfaces as `recording-failure`.
4. Write the `workflow_store` record: `{instance_id, subject_ref, initiator_ref=actor_ref, gate_spec, started_at=now}`, where `started_at` is stamped from the **same** seam-injected `now` step 3 passed as `instantiated_at` — one reading, not two, so the two records name the same instant. `storage-failure` here is `recording-failure`.
5. Call `AuditTrail.record_action(action_ref=workflow_started, actor_ref, credential, data={instance_id, subject_ref, gate_spec_labels, reason?}, retention_policy=audit_trail_retention_policy)` → `event_id | rejected(...)`. Any Audit Trail failure surfaces as `recording-failure`. (Note: gates are opened lazily — see [Open Gate] — not at start. The `started_at` record and the Audit Trail event together prove the workflow began and under which actor's authority.)
6. Return `{instance_id}`.

**Partial-failure recovery.** If step 3 succeeds but step 4 or step 5 fails, the State Machine instance exists in its constituent store but the composition's `workflow_store` has no record. The recovery path: the composition does not issue the `instance_id` to the caller and surfaces `recording-failure`; the orphaned State Machine instance is quarantined (it will never be referenced by this composition's `workflow_store`) and may be cleaned up by the deployment's store-maintenance process. The caller must retry [Start Workflow] from scratch, producing a new `instance_id`.

---

#### `open_gate(actor_ref, instance_id, action, credential) → {step_id, assignment_id} | rejected(permission-denied | not-known | invalid-transition | not-guarded | gate-not-available | already-open | recording-failure)`

This action opens an approval gate for a guarded transition whose `from_state` equals the workflow instance's current state. Gates are opened lazily — the composition does not open all gates at start, only when the workflow has reached the state from which the guarded transition departs and an actor with `workflows:open-gate` authority decides to open it.

1. `Permissions.permitted(actor_ref, workflows:open-gate)` → if `denied`, return `rejected(permission-denied)`.
2. Look up `workflow_store[instance_id]` → `not-known` if absent.
3. Call `WorkflowStateMachine.read_declaration(instance_id)` to retrieve the immutable declaration. Identify the declared transition matching `(current_state, action)`: call `WorkflowStateMachine.current(instance_id)` → `current_state`. If no declared transition has `(from_state = current_state, action = action)`, return `invalid-transition`. If the matched transition has no `guard` label, return [Not Guarded] (unguarded transitions are fired directly without opening a gate).
4. Check `gate-not-available`: if `current_state` ≠ the matched transition's `from_state` the check is definitionally satisfied by step 3 (we derived `current_state` there); the secondary case is that the workflow is in a terminal state — `WorkflowStateMachine.fire` would return `terminal` — confirmed by checking whether `current_state ∈ terminal_states` in the declaration. If terminal, return [Gate Not Available] (a terminal instance cannot have gates opened).
5. Check `already-open`: if `gate_binding[(instance_id, action)]` already exists, return [Already Open] (a gate is already bound for this `(instance_id, action)` pair; call [Decide Gate] to resolve the existing gate before opening a replacement).
6. Call `ApprovalStep.submit(subject_ref=workflow_store[instance_id].subject_ref + ":" + action, approver_ref=gate_spec[guard_label].approver_ref, submitter_ref=workflow_store[instance_id].initiator_ref, scope=gate_spec[guard_label].scope, submitted_at=now)` → `step_id | rejected(invalid-request | storage-failure)`. Propagate failures as `recording-failure`. **The gate's `submitter_ref` is the workflow's `initiator_ref`, not the [Open Gate] caller** — so the withdrawal authority over the gate (Approval Step Invariant 5: only the submitter may withdraw) belongs to the workflow initiator, which is what makes both `decide_gate(withdraw)` and the composition's moot-gate cascade (which withdraw with `withdrawn_by = initiator_ref`) authorized. The [Open Gate] caller is recorded as the actor on the `gate_opened` Audit Trail event (step 9), preserving the attribution of who opened the gate; the *withdrawal* authority is the initiator's, mirroring Multi-Party Approval's initiator-owns-withdrawal discipline.
7. Call `Assignment.assign(task_ref=step_id, assignee_ref=gate_spec[guard_label].approver_ref)` → `assignment_id | rejected(...)`. Propagate failures as `recording-failure`.
8. Write: `gate_binding[(instance_id, action)] = step_id`; `gate_to_assignment[step_id] = assignment_id`. `storage-failure` is `recording-failure`.
9. Call `AuditTrail.record_action(action_ref=gate_opened, actor_ref, credential, data={instance_id, action, step_id, assignment_id, approver_ref, scope}, retention_policy=audit_trail_retention_policy)`. Failure is `recording-failure`.
10. Return `{step_id, assignment_id}`.

**Partial-failure recovery.** If step 6 or 7 succeeds but subsequent writes fail: the composition surfaces `recording-failure`; the orphaned Approval Step or Assignment must be withdrawn/recalled by the deployment's store-maintenance process before retry. A partial `gate_binding` write (step 8 fails) leaves no binding in the composition's emergent state; the constituent records are present but un-traversable from the composition layer. Recovery: clean the orphan constituent records and retry [Open Gate].

---

#### `decide_gate(actor_ref, instance_id, action, decision, reason, credential) → approved | rejected_outcome | withdrawn | rejected(not-known | gate-not-open | not-pending | unauthorized | invalid-request | recording-failure)`

This action wraps the Approval Step's `approve`/`reject`/`withdraw` on the bound gate for `(instance_id, action)`. Structural authorization (only the named `approver_ref` may approve or reject; only `submitter_ref` may withdraw) is enforced by Approval Step's Invariant 4 and Invariant 5 directly; no redundant Permissions check is added.

1. Look up `workflow_store[instance_id]` → `not-known` if absent.
2. Look up `gate_binding[(instance_id, action)]` → `step_id`. If no binding exists, return [Gate Not Open] (there is no Approval Step open for this transition; call [Open Gate] first).
3. Validate `decision` is one of `{"approve", "reject", "withdraw"}` → `invalid-request` otherwise.
4. Dispatch on `decision` — each constituent call below carries its `decided_at` / `withdrawn_at` stamped from the **seam-injected `now`** for this invocation, the same reading step 6's `gate_decided` event records (see *Logic confinement*):
   - `"approve"`: call `ApprovalStep.approve(step_id, decided_by=actor_ref, reason?, decided_at=now)` → `approved | rejected(invalid-request | not-known | not-pending | unauthorized | storage-failure)`. Propagate `not-pending` and `unauthorized` unchanged; map `storage-failure` to `recording-failure`.
   - `"reject"`: call `ApprovalStep.reject(step_id, decided_by=actor_ref, reason, decided_at=now)` → `rejected_outcome | rejected(...)`. `reason` is required; a null or whitespace-only `reason` is caught at the Primitive policies layer and returned as `invalid-request` before this call is made. Propagate rejections as above.
   - `"withdraw"`: call `ApprovalStep.withdraw(step_id, withdrawn_by=actor_ref, reason, withdrawn_at=now)` → `withdrawn | rejected(...)`. `reason` is required. Gate withdrawal is the workflow initiator's act: because the gate's Approval Step carries `submitter_ref = initiator_ref` (set at [Open Gate] step 6), Approval Step Invariant 5 admits a withdrawal only when `actor_ref` is the workflow initiator; a non-initiator withdrawal attempt surfaces `unauthorized` unchanged. Propagate rejections as above.
5. On atom-level success, recall the in-tray binding: `Assignment.recall(gate_to_assignment[step_id])`. If the assignment is already in Recalled state (idempotent recall — a moot-gate cascade has already discharged it), treat `not-active` as no-op success.
6. Call `AuditTrail.record_action(action_ref=gate_decided, actor_ref, credential, data={instance_id, action, step_id, decision, reason?}, retention_policy=audit_trail_retention_policy)`. Failure is `recording-failure`. If this `record_action` fails after the Approval Step transition succeeded, the recovery path in Edge cases *Cross-store consistency under failure* applies.
7. Return the outcome token from step 4 (`approved`, `rejected_outcome`, or `withdrawn`).

---

#### `fire_transition(actor_ref, instance_id, action, credential) → new_state | rejected(permission-denied | not-known | terminal | invalid-transition | gate-not-cleared | recording-failure)`

This is the composition's load-bearing wiring action. For unguarded transitions, it calls `WorkflowStateMachine.fire` directly. For guarded transitions, it reads the bound gate's Approval Step state and asserts `guard_satisfied = true` only when the step is in Approved.

1. `Permissions.permitted(actor_ref, workflows:fire)` → if `denied`, return `rejected(permission-denied)`.
2. Look up `workflow_store[instance_id]` → `not-known` if absent.
3. Call `WorkflowStateMachine.read_declaration(instance_id)` and `WorkflowStateMachine.current(instance_id)` to determine the matched transition and whether it is guarded. If no declared transition matches `(current_state, action)`, `WorkflowStateMachine.fire` would return `invalid-transition`; return `invalid-transition`. If `current_state ∈ terminal_states`, return `terminal`.
4. **For an unguarded transition** (the matched transition has no `guard` label):
   a. Call `WorkflowStateMachine.fire(instance_id, action, actor_ref, fired_at=now)` → `new_state | rejected(...)`, where `fired_at` is the **seam-injected `now`** for this invocation (see *Logic confinement*). Propagate constituent rejections: `not-known` → `not-known`; `terminal` → `terminal`; `invalid-transition` → `invalid-transition`; `storage-failure` → `recording-failure`. (The `guard-not-satisfied` rejection from the constituent is not reachable here because the transition is unguarded and the composition does not pass `guard_satisfied`.)
   b. On constituent success, write `transition_to_event` at step 4c below.

5. **For a guarded transition** (the matched transition carries a `guard` label):
   a. Look up `gate_binding[(instance_id, action)]` to find the bound `step_id`. If no binding exists, the gate has not been opened — the composition refuses to fire: return [Gate Not Cleared] (the guarded transition cannot be asserted until its gate is opened and resolved).
   b. Read the Approval Step state for `step_id` via `ApprovalStep.read({step_id})`. If the step is not in Approved state, return `gate-not-cleared`. The composition evaluates the guard by reading the gate state; it does not delegate this check to the caller. A gate in Pending, Rejected, or Withdrawn state prevents the guarded transition from firing. The caller cannot override this: there is no surface by which the caller supplies `guard_satisfied` for a guarded transition in this composition.
   c. The step is in Approved. Call `WorkflowStateMachine.fire(instance_id, action, actor_ref, guard_satisfied=true, fired_at=now)` → `new_state | rejected(...)`, where `fired_at` is the **seam-injected `now`** for this invocation (see *Logic confinement*). The composition asserts `guard_satisfied = true` here because it has just verified, from the bound Approval Step's actual state, that the named approver approved — a *state*-valued check, not a timestamp comparison, so the gate evaluation itself consults no clock. Propagate constituent rejections as in step 4a.
   d. On constituent success, proceed to step 4b (writing `transition_to_event`).

6. On constituent `fire` success (either path): call `AuditTrail.record_action(action_ref=transition_fired, actor_ref, credential, data={instance_id, action, from_state=prior current_state, new_state, transition_id, guarded=<bool>, step_id if guarded}, retention_policy=audit_trail_retention_policy)` → `event_id`, recorded under the **same** seam-injected `now` that step 4a/5c passed as `fired_at`, so the history entry and its attestation name one instant. Write `transition_to_event[transition_id] = event_id`. Failure is `recording-failure`. If `record_action` fails after `WorkflowStateMachine.fire` succeeded, see *Cross-store consistency under failure* in Edge cases; the composition surfaces `recording-failure` but the State Machine transition has committed.

7. **Moot-gate cascade**: after a successful [Fire Transition], check whether the workflow's new `current_state` is different from the `from_state` of any currently open gate (i.e., `gate_binding` entries for this `instance_id` whose associated Approval Step is still in Pending and whose declared transition's `from_state` ≠ `new_state`). Any such gate is now moot — the workflow has left the state from which that guarded transition departs, so the gate will not be evaluated unless the workflow returns to that state (which is only possible if the declaration includes a return path, per the State Machine's declared-transition model). For each moot gate identified:
   - Call `ApprovalStep.withdraw(step_id, withdrawn_by=initiator_ref, reason="Gate moot: workflow left the gate's from_state by firing a different transition", withdrawn_at=now)` — the same injected reading as the firing that mooted it, since the cascade is part of that invocation → if `not-pending`, the gate was already decided — no action needed.
   - Call `Assignment.recall(gate_to_assignment[step_id])` → treat `not-active` as idempotent success.
   - Call `AuditTrail.record_action(action_ref=moot_gate_recalled, actor_ref=application_actor_ref, credential=application_credential, data={instance_id, moot_action=action, step_id, reason="Gate moot: workflow advanced past from_state"}, retention_policy=audit_trail_retention_policy)`.
   - Remove `gate_binding[(instance_id, moot_action)]` and `gate_to_assignment[step_id]` from the composition's maps.

8. Return `new_state`.

---

#### `read_workflow(actor_ref, query) → workflow_view | rejected(permission-denied | invalid-query)`

1. `Permissions.permitted(actor_ref, workflows:read)` → if `denied`, return `rejected(permission-denied)` (or an empty result, per deployment policy).
2. Query `workflow_store` on the supported filter axes: `instance_id`, `subject_ref`, `initiator_ref`, `started_at` range (using `{after: <timestamp>, before: <timestamp>}` sub-key form). An unrecognized filter key is `invalid-query`. An empty result for a well-formed query is an empty list, not a rejection.
3. For each workflow instance in the result set, the response carries a composed view: the workflow record fields (`instance_id`, `subject_ref`, `initiator_ref`, `declaration_ref`, `gate_spec`, `started_at`); the State Machine's `current_state` and `transition_history` (via `WorkflowStateMachine.current` and `WorkflowStateMachine.history`); the full transition history enriched with each transition's Audit Trail `event_id` (via `transition_to_event`); and each gate's Approval Step record (via `gate_binding` joined against the Approval Step store) with its Assignment status (via `gate_to_assignment` joined against the Assignment store). The composition does not surface the underlying Audit Trail event payloads on this query; auditors querying the full audit evidence call `AuditTrail.verify_record` directly with the relevant `event_id`s.

---

### The load-bearing wiring decision — approval-gated transition (guard evaluation via Approval Step)

**Principle.** A regulated multi-actor workflow requires that a guarded transition cannot fire until its named human approval is genuinely recorded (attributed, sealed, and retention-governed) and that the process moved only through declared transitions. These two properties together constitute a records-alone-provable gated process.

**Likely objection.** "State Machine already has a guard-gating mechanism — it accepts `guard_satisfied = true` from the caller. Why not let the caller assert it, or let the composition simply trust the caller's word?"

**Mechanism that resolves it.** State Machine deliberately extracted guard evaluation as an EOS boundary (its Edge cases explicitly name this composition as the re-convergence point): guards recur across many forms — approval records, threshold evaluations, quorum counts, external conditions — and each has its own state machine. The atom correctly does not absorb any of them. For approval-type guards, this composition is the designated evaluation layer. The mechanism: the composition binds each guarded transition to an Approval Step (`gate_binding`) at gate-opening time, and at [Fire Transition] reads the bound step's actual state. `guard_satisfied = true` is asserted to `WorkflowStateMachine.fire` if and only if the bound step is in Approved. The caller of this composition supplies no `guard_satisfied` argument; the composition's own read of the Approval Step state is the evaluation. The gate is structurally closed: an actor with `workflows:fire` and a guarded transition they want to advance cannot assert the guard themselves — the approval record must exist.

**Result.** A records-alone-provable gated workflow: the process moved only through declared transitions (State Machine Invariants 3 and 8, preserved by the composition); each guarded transition cleared its named approval by the authorized actor (Approval Step Invariant 4, enforced at gate-decision time, verified by the composition at fire time); all transition firings and all gate decisions are attributed, sealed, and retention-governed (Audit Trail substrate). An auditor reconstructing the process from the records alone sees: every transition is declared; every guarded transition's history entry corresponds to a bound Approval Step in Approved state; every action is attributed to a real registered actor under Actor Identity attestation. No transition fired on a bare caller assertion.

---

## Composition-level invariants

These invariants (conditions that must always hold) emerge from the composition. None belongs to a single constituent atom; each requires two or more constituents working together to hold. Each invariant names the constituent invariants it depends on and the action wiring step that establishes it.

- **Invariant 1 — Approval-gated transition (load-bearing).** A guarded transition's history entry exists in the State Machine instance only if its bound Approval Step (via `gate_binding[(instance_id, action)]`) is in Approved state at the moment [Fire Transition] called `WorkflowStateMachine.fire` with `guard_satisfied = true`. The composition evaluates the gate (reads the Approval Step state at [Fire Transition] step 5b) and asserts `guard_satisfied = true` only on a confirmed Approved step; a guarded transition never fires on a bare caller assertion. Rests on State Machine Invariants 3 (only-declared-transitions) and 8 (guard-gating without evaluation) plus Approval Step Invariant 4 (approver exclusivity). This invariant is the composition's foundational record-alone-provable claim: a history entry with `guard_satisfied = true` means the composition verified an Approved gate, not merely trusted a caller.

- **Invariant 2 — Permission-gated process advancement.** No transition fires by an actor lacking `workflows:fire`; no workflow is started by an actor lacking `workflows:start`; no gate is opened by an actor lacking `workflows:open-gate`. Gate decisions are enforced by Approval Step Invariants 4 and 5 (named-approver exclusivity and submitter exclusivity) directly — no redundant chain-layer Permissions check for gate decisions. Rests on [Fire Transition] step 1, [Start Workflow] step 1, and [Open Gate] step 1 Permissions checks, plus Approval Step Invariants 4 and 5.

- **Invariant 3 — Attributed and sealed history.** Every fired transition (both guarded and unguarded) and every gate decision (opened, decided) and every workflow start produces exactly one `AuditTrail.record_action` call, each returning an `event_id`. The full workflow and gate lifecycle is reconstructible forward via Audit Trail (ordered by the Audit Trail's sequence) and reverse via the workflow records (via `transition_to_event` and `gate_binding`). Inherits Audit Trail's atomicity surface: `record_action` is treated as atomic from this composition's perspective, modulo Audit Trail's own *Partial attestation on step failure* edge case (Actor Identity.attest succeeds but EventLog.append fails), whose recovery is inherited from the substrate and not re-derived here. Rests on [Start Workflow] step 5, [Open Gate] step 9, [Decide Gate] step 6, [Fire Transition] step 6, and the Audit Trail substrate's composition-level invariants.

- **Invariant 4 — Gate assignment coverage and moot-gate cascade.** Every open gate (a submitted, undecided Approval Step bound via `gate_binding` to a transition reachable from the current state) has exactly one Active Assignment with `task_ref = step_id` and `assignee_ref = approver_ref` from the `gate_spec`. Assignments are recalled in two cases: (a) when the gate is decided ([Decide Gate] step 5), the Assignment is recalled in the same composition-level action; (b) when the workflow fires a transition that leaves the gate's `from_state` by an alternate path (moot-gate cascade in [Fire Transition] step 7), every still-Active Assignment for moot gates is recalled and the bound Approval Steps are withdrawn. After either case, no gate has a lingering Active Assignment. An `ApprovalStep.withdraw` that returns `not-pending` (the gate was already decided) and an `Assignment.recall` that returns `not-active` (the binding was already discharged) are treated as idempotent no-op successes. Rests on [Open Gate] steps 7–8, [Decide Gate] step 5, and [Fire Transition] step 7.

- **Invariant 5 — Only-declared-transitions and replay determinism preserved.** The composition never bypasses `WorkflowStateMachine.fire`; every transition in the State Machine history is a declared transition; `current_state` replays deterministically from the history. This is the constituent invariant of State Machine (Invariants 3, 7) preserved and surfaced at the composition level because it is load-bearing for the audit proof. The composition adds no alternate write path to the State Machine's transition history. Guarded transitions fire through the same `fire` surface as unguarded transitions; the only difference is whether `guard_satisfied` is asserted (and if so, the composition asserts it, not the caller).

- **Invariant 6 — Records-alone process proof (forensic completability).** [Read Workflow] (combined with `AuditTrail.verify_record` on the `event_id`s from `transition_to_event`) lets an auditor prove from the records alone: (a) the process moved only through declared transitions; (b) each guarded transition's history entry corresponds to a bound Approval Step in Approved state (via `gate_binding`); (c) the approving actor on the Approval Step matched `approver_ref` from the `gate_spec` (Approval Step Invariant 4); (d) the `workflows:fire` grant was held by the actor who fired each transition (Audit Trail Actor Identity attestation); (e) the complete history is attributed and sealed. This is the emergent guarantee no single constituent provides: State Machine provides (a); Approval Step provides (b) and (c); Permissions provides (d); Audit Trail provides attribution and sealing for the combined record. The composition provides all five in one queryable surface.

- **Invariant 7 — Constituent invariants preserved.** All invariants of every constituent atom hold over its respective instance. State Machine's invariants (declaration immutability, exactly one current state, only-declared-transitions, terminal absorption, history append-only and complete, history total order, replay determinism, guard-gating without evaluation, transition attribution completeness, instance store durability) hold per workflow instance. Approval Step's invariants hold per gate step. Permissions' invariants hold over the workflow-store-scoped Permissions instance. Assignment's invariants hold over the composition's Assignment instance. Audit Trail's composition-level invariants hold over its instance.

---

## Examples

### Walkthrough — FDA 21 CFR Part 11 / ISO 9001 pharmaceutical batch release

A pharmaceutical manufacturer's batch-release system uses this composition to govern the lifecycle of batch `BR-2026-0412` under FDA 21 CFR Part 211 (Current Good Manufacturing Practice for Finished Pharmaceuticals) and FDA 21 CFR Part 11 (Electronic Records; Electronic Signatures). The deployment configures `audit_trail_retention_policy = fda_part_11_predicate_rule`.

**Declaration.** The deployment declares the following process:

```
states: {sampled, testing, qp-review, released, rejected}
transitions: [
  {from: sampled,    action: begin-testing,  to: testing},
  {from: testing,    action: complete-tests, to: qp-review},
  {from: qp-review,  action: release,        to: released, guard: "QP-sign-off"},
  {from: qp-review,  action: reject-batch,   to: rejected, guard: "QP-rejection"},
  {from: testing,    action: fail-tests,     to: rejected}
]
initial_state: sampled
terminal_states: {released, rejected}
```

The `gate_spec` maps `"QP-sign-off"` to `{approver_ref: "qp_director_santos", scope: "pharma:batch-release:qp-sign-off"}` and `"QP-rejection"` to `{approver_ref: "qp_director_santos", scope: "pharma:batch-release:qp-rejection"}`.

1. **QA manager starts the workflow.** `start_workflow(actor_ref=qa_manager, declaration, subject_ref="br-2026-0412", gate_spec, credential=qa_credential)` → Permissions returns permitted (qa_manager holds `workflows:start`); `gate_spec` validates (two guarded transitions, two matching entries); `WorkflowStateMachine.instantiate(declaration)` → `instance_id="wf-batch-br-2026-0412"`; `workflow_store` record written; Audit Trail records `workflow_started`. Returns `{instance_id="wf-batch-br-2026-0412"}`.

2. **Lab technician begins testing.** `fire_transition(actor_ref=lab_tech_rivera, instance_id, action="begin-testing", credential)` → Permissions permitted; `begin-testing` is an unguarded transition; `WorkflowStateMachine.fire(instance_id, "begin-testing", actor_ref=lab_tech_rivera)` → `new_state="testing"`; Audit Trail records `transition_fired`; `transition_to_event` updated. Returns `"testing"`.

3. **Tests complete; QA manager advances to QP review.** `fire_transition(actor_ref=qa_manager, instance_id, action="complete-tests", credential)` → unguarded; fires; Audit Trail records. `current_state = "qp-review"`.

4. **QA manager opens the release gate.** `open_gate(actor_ref=qa_manager, instance_id, action="release", credential)` → Permissions permitted (qa_manager holds `workflows:open-gate`); matched transition has guard `"QP-sign-off"`; not already open; `ApprovalStep.submit(subject_ref="br-2026-0412:release", approver_ref="qp_director_santos", submitter_ref="qa_manager", scope="pharma:batch-release:qp-sign-off")` → `step_id="step-qp-0412-release"`; `Assignment.assign(task_ref=step_id, assignee_ref="qp_director_santos")` → `assignment_id="asgn-qp-0412"`; maps written; Audit Trail records `gate_opened`. Returns `{step_id, assignment_id}`.

5. **QP Director reviews and approves.** `decide_gate(actor_ref=qp_director_santos, instance_id, action="release", decision="approve", reason="Batch specification limits met; COA reviewed; QP sign-off granted under 21 CFR 211.68", credential=qp_credential)` → no Permissions check (Approval Step Invariant 4 is the enforcement); `gate_binding[(instance_id, "release")]` → `step_id`; `ApprovalStep.approve(step_id, decided_by="qp_director_santos", reason=...)` → `approved`; `Assignment.recall(asgn-qp-0412)`; Audit Trail records `gate_decided`. Returns `approved`.

6. **QA manager fires the release transition.** `fire_transition(actor_ref=qa_manager, instance_id, action="release", credential)` → Permissions permitted; matched transition is guarded; `gate_binding[(instance_id, "release")]` → `step_id="step-qp-0412-release"`; `ApprovalStep.read({step_id})` → step state is Approved; composition asserts `guard_satisfied = true`; `WorkflowStateMachine.fire(instance_id, "release", actor_ref="qa_manager", guard_satisfied=true)` → `new_state="released"`; Audit Trail records `transition_fired` with `guarded=true, step_id`; `transition_to_event` updated. Check moot-gate cascade: `current_state` is now `"released"` (terminal); the `"QP-rejection"` gate was never opened, so no cascade is needed. Returns `"released"`.

7. **Attempt to fire after terminal state.** `fire_transition(actor_ref=qa_manager, instance_id, action="release", credential)` → Permissions permitted; `WorkflowStateMachine.current(instance_id)` → `"released"` ∈ `terminal_states`; returns `terminal`.

8. **Two years later — FDA Part 11 inspection.** Inspector queries `read_workflow({instance_id: "wf-batch-br-2026-0412"})`. The composed view returns: workflow record; State Machine history (5 entries: sampled → testing → qp-review → released, plus terminal); each transition's Audit Trail `event_id`; the `"QP-sign-off"` gate's Approval Step (Approved, `decided_by=qp_director_santos`, `decided_at`, `decision_reason`). The inspector calls `AuditTrail.verify_record(event_id, payload)` for the `transition_fired` event on the release transition and receives `verified`. The inspector confirms: (a) the batch moved only through declared states (Invariant 5); (b) the release transition fired with `guard_satisfied=true` and the bound step is in Approved state (Invariant 1); (c) the QP's identity is attested under Part 11 §11.50 (Audit Trail Actor Identity). Control evidence is complete from the records alone.

---

### Happy path — SOX §404 journal-entry posting workflow

A financial system governs posting of journal entries above the $5M materiality threshold. The declaration has states `{draft, submitted, posted, rejected}` with an unguarded `submit` transition (draft → submitted), a guarded `post` transition (submitted → posted, guard `"controller-sign-off"`), and an unguarded `reject` transition (submitted → rejected). The `gate_spec` binds `"controller-sign-off"` to `{approver_ref: "controller_morgan", scope: "financial:journal-entry:post:materiality-tier-3"}`.

JE-2026-0441: the preparer calls [Start Workflow]; fires `submit`; calls `open_gate(action="post")`; the controller calls `decide_gate(decision="approve")`; the preparer calls `fire_transition(action="post")`. The composition verifies the controller's Approval Step is in Approved, asserts `guard_satisfied=true`, and fires. Audit Trail records each action under `sox_7_year` retention. Seven years later, a SOX §404 audit queries the workflow and confirms Invariants 1, 2, and 6.

---

### Rejection path — guarded transition attempted without open gate

The QA manager in the pharmaceutical scenario, after `current_state = "qp-review"`, calls `fire_transition(action="release")` without having called [Open Gate] first. At step 5a of [Fire Transition]: `gate_binding[(instance_id, "release")]` does not exist; the composition returns `gate-not-cleared`. The State Machine records no transition. No history entry is written. The QA manager must call [Open Gate] first, then wait for the QP's decision, then retry [Fire Transition].

---

### Rejection path — guarded transition attempted with gate in Pending

The QA manager has opened the release gate (`gate_binding` set) but the QP has not yet decided. The QA manager calls `fire_transition(action="release")`. At [Fire Transition] step 5b: `ApprovalStep.read({step_id})` → state is Pending; the composition returns `gate-not-cleared`. No `WorkflowStateMachine.fire` call is made. The gate must reach Approved before the transition can fire.

---

### Rejection path — unauthorized transition attempt

An actor lacking `workflows:fire` calls [Fire Transition]. At step 1, `Permissions.permitted(actor_ref, workflows:fire)` → `denied`; returns [Permission Denied] immediately. No State Machine call is made. No Audit Trail entry is produced for the unauthorized attempt (see Edge cases — *Audit Trail records of failed authorization attempts*).

---

### Moot-gate cascade — alternate transition leaves a gate unreachable

A purchase-order workflow has `current_state = "awaiting-approval"` with a guarded `approve` transition (guard `"finance-sign-off"`) and an unguarded `cancel` transition, both departing from `awaiting-approval`. The finance director's approval gate has been opened (`gate_binding[(instance_id, "approve")]` set, Approval Step in Pending). A process manager calls `fire_transition(action="cancel")`. The `cancel` transition is unguarded and fires successfully; `new_state = "cancelled"`. The moot-gate cascade (step 7): the `"approve"` gate's `from_state = "awaiting-approval"` ≠ `"cancelled"` = `new_state`; the gate is moot. The composition calls `ApprovalStep.withdraw(step_id, withdrawn_by=initiator_ref, reason="Gate moot: ...")`, `Assignment.recall(assignment_id)`, and `AuditTrail.record_action(action_ref=moot_gate_recalled, actor_ref=application_actor_ref, ...)`. The finance director's in-tray no longer shows the approval task. The audit trail records the withdrawal and the reason.

---

### Regulated adversarial scenarios

Three adversarial reads this composition must survive in regulated contexts:

#### Regulator audit — SOX §404 / FDA 21 CFR Part 11: prove declared-path and gate-cleared

An FDA inspector or SOX auditor demands evidence that process instance `wf-batch-br-2026-0412` moved only through its declared states and that the qualified-person gate was genuinely cleared before the release transition fired. The auditor queries `read_workflow({instance_id: "wf-batch-br-2026-0412"})` and receives the composed view. The auditor confirms: (a) every transition in the State Machine history corresponds to a declared transition (`read_declaration` returns the immutable declaration; Invariant 5 — constituent State Machine Invariant 3 — guarantees no undeclared transition could have produced a history entry); (b) the `"release"` history entry carries `guard_satisfied: true` and `step_id` pointing to the bound Approval Step; (c) `ApprovalStep.read({step_id})` returns `state: Approved`, `decided_by: "qp_director_santos"`, `decided_at`, and `decision_reason`; (d) Approval Step Invariant 4 guarantees `decided_by` matched `approver_ref` at the time of the approve call; (e) `AuditTrail.verify_record(event_id, payload)` for the `transition_fired` event returns `verified`. The auditor's structural questions — *did the batch move only through declared states?* and *was the release gate cleared by the named QP?* — are answered from the records alone under Invariants 1, 5, and 6. No recourse to source code, runbooks, or developer narration is needed.

#### Disputed transition — party claims a guarded transition fired without its approval

An external party (an auditor, a counterparty, an investigator) claims that the `"release"` transition fired in instance `wf-batch-br-2026-0412` without QP approval, or that an unauthorized actor advanced the process. The structural rebuttal:

For the "no approval" claim: the State Machine history entry for the release transition carries `guard_satisfied: true` (Invariant 8 of the constituent — the atom records whether the caller asserted the guard). The composition's `gate_binding[(instance_id, "release")]` maps to `step_id="step-qp-0412-release"`. `ApprovalStep.read({step_id})` returns `state: Approved`. Invariant 1 of this composition states that `guard_satisfied = true` was asserted by the composition only because the bound step was in Approved at the time of [Fire Transition] step 5b. A forgery would require either (a) fabricating an Approved Approval Step record for a step whose `approver_ref` is `qp_director_santos` — foreclosed by Approval Step Invariant 4 (only the named approver may decide) and by the Audit Trail's tamper-evident sealing — or (b) fabricating a State Machine history entry with `guard_satisfied: true` — foreclosed by the State Machine's Invariant 5 (history append-only; `storage-failure` is the only non-success path for `fire`) and by Tamper Evidence sealing. Invariants 1, 3, and 5 together constitute the structural rebuttal.

For the "unauthorized actor advanced the process" claim: `AuditTrail.verify_record` for the `transition_fired` event returns the Actor Identity attestation, binding the actor reference to the action at the attested timestamp. Invariant 2 (Permission-gated process advancement) guarantees the firing actor held `workflows:fire` at the time of the Permissions check. An auditor confirms both.

#### Breach or incident investigation — reconstruct transitions and gate decisions during anomaly window

During a security incident (suspected credential compromise from 2026-05-01T00:00:00Z to 2026-05-03T23:59:59Z), the incident response team must determine which workflow transitions fired and which gates were cleared during the window. The team queries `read_workflow({started_at: {after: "2026-04-25T00:00:00Z"}})` for all recently started workflows. For each instance, the team inspects the State Machine history and — via `transition_to_event` — the corresponding Audit Trail `event_id`s. For each `transition_fired` event in the anomaly window, the team calls `AuditTrail.verify_record(event_id, payload)` to confirm integrity. Any `failed-verification(tampered)` response indicates a post-hoc modification — a forensic finding. For guarded transitions in the window, the team cross-references the bound Approval Step via `gate_binding`: `ApprovalStep.read({step_id})` returns `decided_by` and `decided_at`, and the Audit Trail `gate_decided` event confirms the gate decision under the Actor Identity attestation. The team also queries the Permissions store for actors who held `workflows:fire` during the window; any transition fired by an actor whose grant was not active at the firing timestamp is a finding. Invariants 3 and 5 bound the forensic window precisely: the transition history is the complete ordered record of every step that advanced the process; the Audit Trail provides the integrity attestation for each.

---

## Generation acceptance

A derived implementation of this composition is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the composition's emergent state plus the constituent stores, can do all of the following without recourse to source code, runbooks, or developer narration:

### Audit-Trail-traversal-clearable checks

1. **Verify the approval-gated-transition claim.** For every State Machine history entry whose matched declared transition carries a `guard` label (i.e., history entries with `guard_satisfied: true`): follow `transition_to_event[transition_id]` to the Audit Trail `event_id` and confirm it carries `step_id` in its data; follow `gate_binding[(instance_id, action)]` to find the bound `step_id`; confirm `ApprovalStep.read({step_id})` returns `state: Approved`; confirm `decided_by` matches the `gate_spec`'s `approver_ref` for that guard label (Approval Step Invariant 4). A guarded history entry whose bound step is not in Approved, or whose `decided_by` does not match `approver_ref`, is a conformance failure under Invariant 1.

2. **Verify only-declared-transitions and replay determinism.** For every workflow instance: call `WorkflowStateMachine.read_declaration(instance_id)` and `WorkflowStateMachine.history(instance_id)`. Confirm every `{from_state, action, to_state}` triple in the history corresponds to a declared transition. Replay the history in `sequence_number` order from `initial_state` and confirm it arrives at `current_state`. A history entry with a triple not in the declaration, or a replay that does not converge to `current_state`, is a conformance failure under Invariant 5 (constituent State Machine Invariants 3 and 7). Confirm the declaration has not changed since [Start Workflow] (State Machine Invariant 1 — declaration immutability).

3. **Verify audit completeness.** For every workflow start, gate opening, gate decision, and transition firing recorded in the workflow store and Approval Step store: exactly one corresponding `record_action` event exists in the Audit Trail (`action_ref ∈ {workflow_started, gate_opened, gate_decided, transition_fired, moot_gate_recalled}`). The reverse direction also holds: every workflow-related Audit Trail entry corresponds to a record in the workflow store, `gate_binding`, or Approval Step store. No workflow action is invisible to the Audit Trail; no Audit Trail entry refers to an instance or gate that does not exist. Invariant 3 is the contract. Inherits Audit Trail's atomicity surface (modulo the substrate's *Partial attestation on step failure* edge case; the auditor alerts on orphan attestations referencing this composition's `action_ref` values).

4. **Verify gate assignment coverage.** For every `gate_binding` entry whose bound Approval Step is in Pending state: confirm exactly one Active Assignment exists with `task_ref = step_id` and `assignee_ref = approver_ref`. For every `gate_binding` entry whose bound step is in a terminal state: confirm no Active Assignment exists for that step. Confirm moot gates (where the workflow's current state is not the gate's `from_state`) have been withdrawn and their Assignments recalled (or the gate was already decided before the workflow left the state). Invariant 4 is the contract.

5. **Verify permission enforcement.** For every `workflow_started`, `gate_opened`, [Fire Transition] Audit Trail entry: confirm the `actor_ref` held the corresponding scope (`workflows:start`, `workflows:open-gate`, `workflows:fire`) in the Permissions instance at the time of the action, via the Audit Trail's Actor Identity attestation and the Permissions store's grant records. Invariant 2 is the contract.

### Externally-clearable checks

6. **Whether the `gate_spec` correctly maps to the regulatory requirements.** The composition records the `gate_spec` declared at [Start Workflow] and validates it structurally (every guarded transition named; every entry non-whitespace). It does not verify that the declared `approver_ref` for each guard label was the *correct authority* under the deployment's regulatory policy. *"Was `qp_director_santos` the required qualified person for batch `BR-2026-0412` under 21 CFR Part 211?"* is a calling-system policy question; the composition records the answer the calling system declared. Verification of the policy mapping (transition guard → required approver identity) requires the deployment's role-authorization registry — typically a Permissions instance scoped to scope-approval grants, cross-referenced at the `started_at` timestamp. This parallels Multi-Party Approval's *Audit gaps* for approver-set policy.

7. **Whether the declared state machine itself matches the regulation's required process.** The composition records the declaration as supplied and enforces declared-transition discipline. It does not verify that the declared states and transitions are the correct process under the applicable regulation. *"Does this declaration correctly represent the five-step batch-release process required by Part 211?"* is a regulatory-process-design question answered by the deployment's process documentation. Auditors verify this by reading the declaration alongside the relevant regulatory standard.

8. **Whether the named approver was authorized to hold the approver role.** The composition enforces that `decided_by` matched `approver_ref` (Approval Step Invariant 4) and that `approver_ref` was named in the `gate_spec` (checked at [Start Workflow]). It does not verify that the named approver was the *correct authority* for the scope at the time of the gate decision. Cross-referencing `approver_ref` and `scope` against the deployment's standing-authorization registry at `started_at` is an external audit check.

---

## Edge cases and explicit non-goals

- **Multi-approver gates.** A guarded transition requiring N approvers (all-of-N, M-of-N, one-of-N quorum) uses a [Multi-Party Approval](./multi-party-approval.md) chain in place of a single Approval Step as the gate. The composition reads the chain's terminal Approved state the same way it reads a single step's Approved state — via the `gate_binding` pointing to the chain id rather than a `step_id`. The `gate_spec` entry for such a guard label names the chain's `chain_id` (or a stable chain reference) rather than a single `approver_ref`; the [Open Gate] action initiates a Multi-Party Approval chain rather than a single Approval Step. This multi-approver-gate variant is a composing enrichment of this composition, not part of the core single-approver-gate model. Deployments requiring multi-approver gates on any guarded transition should layer [Multi-Party Approval](./multi-party-approval.md) for those gates.

- **Non-approval guard evaluation.** This composition evaluates only approval-type guards — guards whose evaluation consists of checking whether a named actor has approved a specific subject under a specific scope. Guards whose evaluation requires a threshold check (an account balance exceeds a limit), a quorum count (N of M sensors reported above threshold), an external condition (an external service returned a green status), or a rules-engine decision are still the caller's responsibility per State Machine's guard-evaluation edge case. The composition does not provide a generic guard-evaluation surface; it evaluates exactly one class: approval-step-based guards. A deployment that declares a guarded transition with a non-approval guard must supply `guard_satisfied = true` to `WorkflowStateMachine.fire` via a separate orchestration layer that is not this composition. Mixing approval and non-approval guards in the same declaration is a deployment-design choice; the composition owns only the approval-type ones.

- **Parallel / concurrent active states and fork-join.** This composition has exactly one current state at all times, inherited from State Machine's Invariant 2 (exactly one current state). Parallel workflows — where an instance is in multiple active states simultaneously, with fork and join transitions — are out of scope. A Parallel Workflow fork-join composition (not yet in the library) handles that concept; this composition is the single-active-state declared-machine primitive.

- **Declaration versioning and sharing declarations across instances.** The composition takes the declaration as a value at [Start Workflow] and fixes it immutably per instance via State Machine's Invariant 1 (declaration immutability). Sharing one canonical declaration template across many instances — updating the template for new instances without re-supplying it at each `instantiate` — is handled by a Definition Registry (named in State Machine's edge cases). The calling system retrieves the current template from a registry and supplies it at [Start Workflow]; this composition receives a value declaration.

- **Moot-gate cascade and return paths.** The moot-gate cascade (step 7 of [Fire Transition]) withdraws open gates for transitions whose `from_state` the workflow has left. If the declaration includes a return path to that `from_state` (e.g., a transition from `released` back to `qp-review` for a re-review), a gate that was moot when the workflow left may become relevant again. In this case, [Open Gate] must be called again for the re-relevant transition; the prior gate has been withdrawn and cannot be re-used. This is consistent with Approval Step's Invariant 3 (terminal absorption — a withdrawn step cannot be re-opened). The deployment must design its process declaration and gate-opening logic accordingly.

- **Cross-store consistency under partial failure.** [Start Workflow] writes to three stores in sequence (State Machine constituent, `workflow_store`, Audit Trail). [Open Gate] writes to three stores (Approval Step, Assignment, composition maps + Audit Trail). [Decide Gate] writes to two (Approval Step, Audit Trail). [Fire Transition] writes to two or three (State Machine constituent, Audit Trail, optionally `gate_binding` cleanup on moot cascade). A failure mid-sequence leaves partial state. The recovery rules are stated per action under each action's *Partial-failure recovery* note. The general principle: the load-bearing write (the constituent atom transition for [Fire Transition]; the Approval Step submit for [Open Gate]) is the write that determines whether the action semantically committed. Subsequent Audit Trail and map writes are recovery-amenable. An Audit Trail `record_action` failure after a load-bearing write surfaces as [Recording Failure] to the caller and requires retry; the Audit Trail entry will be missing until retry succeeds, a gap in Invariant 3 the implementation must resolve.

- **[Fire Transition] non-idempotency.** `WorkflowStateMachine.fire` is not idempotent (two `fire` calls with the same `(instance_id, action)` both succeed if the transition is still available from the resulting state). Callers requiring at-most-once semantics under retry conditions must supply their own idempotency key at the orchestration layer; this composition does not provide one.

- **Audit Trail records of failed authorization attempts.** A [Fire Transition], [Start Workflow], or [Open Gate] call rejected at the Permissions check (`permission-denied`) leaves no Audit Trail entry by default. High-assurance deployments where failed authorization attempts are themselves auditable compose a Failed-Attempt Log pattern; the canonical composition's audit surface is committed workflow actions, not attempted actions. This parallels Multi-Party Approval's equivalent edge case.

- **Guard evaluation for non-approval guards is still the caller's / Rules Engine's obligation.** Named explicitly in *Non-approval guard evaluation* above and in State Machine's edge cases. The composition evaluates only approval-type guards; all other guard evaluation paths remain the calling system's or a composing Rules Engine's responsibility.

- **Clock source for `fired_at` and `decided_at`.** These stamps — together with `instantiated_at`, `started_at`, and `withdrawn_at` — are set from the injected `clock_t` supplied at the composition's **single I/O seam** (see *Logic confinement*): read once per invocation by the host, shared across that invocation's constituent calls and Audit Trail event, and passed to any constituent whose contract accepts an explicit timestamp rather than left to default to a second reading. No action reads a wall clock internally and no signature carries a `now` parameter. The deployment supplies that reading — typically from the receiving node's wall clock, which names the *source* of the injected value, not a clock call inside a transition. Clock quality therefore remains a deployment matter: the honesty of the injected reading, its monotonicity, and skew across distributed nodes, which can still produce `fired_at` values that are not strictly monotonic across history entries even though each is a single seam reading. This is why ordering never rests on the stamps: `sequence_number` is the authoritative order source (inherited from State Machine's clock-semantics edge case) and `fired_at` is best-effort. For deployments requiring adversarially defensible timestamps on each transition, the Trusted Timestamping composing pattern is the resolution; the residual risk under seam injection is a deployment that injects a dishonest `now`, not an internal race.

- **Concurrent [Fire Transition] calls on the same instance.** Two callers concurrently calling [Fire Transition] on the same `instance_id` must be serialized; the implementation must hold a per-instance mutex at the composition layer as well as at the State Machine constituent layer. A concurrent [Fire Transition] and [Decide Gate] on the same instance must also be serialized to prevent the composition from reading an Approval Step state that changes between the state read and the `WorkflowStateMachine.fire` call.

- **Non-repudiation, tamper-evidence, and retention.** These properties are inherited via the Audit Trail substrate. Non-repudiable attribution is provided by Actor Identity; tamper-evidence of the event log is provided by Tamper Evidence; retention governance is provided by Retention Window. This composition does not re-derive any of these properties; it names them as substrate obligations and inherits the substrate's composition-level invariants.

- **"Which approvals a transition should require" is the deployment's business-rule layer.** The `gate_spec` correctness — whether the declared approver for a guard label is the correct authority under the deployment's regulatory policy — is not this composition's contract to enforce. The composition enforces that `gate_spec` is structurally complete (every guarded transition named; every entry non-whitespace) and that the gate decision is made by the named approver (Approval Step Invariant 4). The policy question — whether the named approver was the right person — is an external audit check (Generation acceptance check 6).

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are: the five workflow-level actions it exposes ([Start Workflow], [Open Gate], [Decide Gate], [Fire Transition], and the read-only [Read Workflow]); the [Gate Spec] it freezes at start (the map from each guarded transition's guard label to its required approver and scope); the four-scope authorization vocabulary it defines for its Permissions instance ([Workflows Start], [Workflows Open Gate], [Workflows Fire], [Workflows Read]); and its own rejection taxonomy ([Permission Denied], [Recording Failure], and the gate-lifecycle rejections [Not Guarded], [Gate Not Available], [Already Open], [Gate Not Open], and the load-bearing [Gate Not Cleared]). Its load-bearing guarantee — a guarded transition fires only after its bound Approval Step is Approved (Invariant 1) — is a structural property, not a datum. Its emergent state (`workflow_store`, `gate_binding`, `gate_to_assignment`, `transition_to_event`) is a composition-introduced set of maps wiring the five constituent stores, left as backticked store tokens; there is no composition-introduced record store to card as a Type. The audit event types it emits (`workflow_started`, `gate_opened`, `gate_decided`, `transition_fired`, `moot_gate_recalled`) stay backticked as wire values, as do the constituent calls and their outcomes — State Machine's `instantiate` / `fire` / `current` / `history` / `read_declaration`, Approval Step's `submit` / `approve` / `reject` / `withdraw` / `read`, Permissions' `permitted` / `grant` / `revoke`, Assignment's `assign` / `recall`, Audit Trail's `record_action` / `verify_record` — the relayed constituent tokens (`instance_id`, `step_id`, `assignment_id`, `transition_id`, `event_id`, `approver_ref`, `submitter_ref`, `subject_ref`, `guard_satisfied`), the constituent states (`Pending` / `Approved` / `Rejected` / `Withdrawn` and the declared workflow states), the inherited/relayed rejections (`invalid-request`, `invalid-declaration`, `invalid-transition`, `terminal`, `not-known`, `not-pending`, `unauthorized`, `invalid-query`), the deployment configuration knobs (`audit_trail_retention_policy`, `application_actor_ref`, `application_credential`), and concrete example ids. Constituent atom names remain the existing full links to `../atoms/*` and `./audit-trail.md`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Start Workflow

The composition's instantiating action: freeze a declared process map and its [Gate Spec] into one new workflow run under an authorized initiator. Validates the [Gate Spec] against the declaration (every guarded transition named), instantiates the State Machine instance, writes the workflow record, and records the `workflow_started` audit event. Returns `{instance_id}` or a rejection.

Kind: Operation

#### Open Gate

Opens an approval gate for a guarded transition whose `from_state` is the instance's current state — lazily, on demand, by an actor holding [Workflows Open Gate]. Submits one Approval Step (with the workflow initiator as submitter), assigns it to the named approver's in-tray, binds it via `gate_binding`, and records `gate_opened`. Returns `{step_id, assignment_id}` or a rejection.

Kind: Operation

#### Decide Gate

Wraps the bound gate's Approval Step `approve` / `reject` / `withdraw` for an `(instance_id, action)` pair. Structural authorization is Approval Step's own (only the named approver may approve or reject; only the submitter — the initiator — may withdraw), so no redundant workflow-layer permission check is added. Recalls the in-tray assignment and records `gate_decided`.

Kind: Operation

#### Fire Transition

The composition's load-bearing action: advance the workflow through a transition. For an unguarded transition it calls `WorkflowStateMachine.fire` directly; for a guarded one it reads the bound Approval Step's state and asserts `guard_satisfied = true` only when that step is Approved — the caller never supplies the guard. On success it records `transition_fired` and runs the moot-gate cascade.

Kind: Operation

#### Read Workflow

The read-only query returning a composed view over the workflow record, the State Machine current state and transition history (each entry enriched with its Audit Trail `event_id`), and each gate's Approval Step and Assignment status. Gated by [Workflows Read]. The records-alone forensic surface (Invariant 6).

Kind: Operation

#### Gate Spec

The map, frozen at [Start Workflow] and immutable thereafter, from each guarded transition's guard label to the `{approver_ref, scope}` naming the approval that gate requires. Structurally validated at start (every guarded transition has an entry; every entry names a real guard label and carries a non-whitespace approver and scope); whether the named approver is the *correct* authority is a deployment policy question the composition records but does not adjudicate.

Kind:      Field
Field of:  the workflow record
Role:      the per-gate approval specification
Projects:  gate_spec

#### Workflows Start

The scope permitting [Start Workflow] — instantiate a new workflow run.

Kind:      Member
Member of: the workflow scope vocabulary
Role:      Scope
Projects:  workflows:start

#### Workflows Open Gate

The scope permitting [Open Gate] — open an approval gate for a guarded transition.

Kind:      Member
Member of: the workflow scope vocabulary
Role:      Scope
Projects:  workflows:open-gate

#### Workflows Fire

The scope permitting [Fire Transition] — advance the workflow through a transition.

Kind:      Member
Member of: the workflow scope vocabulary
Role:      Scope
Projects:  workflows:fire

#### Workflows Read

The scope permitting [Read Workflow] — read workflow records and their composed gate, assignment, and attestation surface.

Kind:      Member
Member of: the workflow scope vocabulary
Role:      Scope
Projects:  workflows:read

#### Permission Denied

The composition's rejection when the acting actor lacks the required workflow scope at the Permissions check that opens [Start Workflow], [Open Gate], [Fire Transition], or [Read Workflow]. (Gate decisions are not permission-gated here — Approval Step's own approver and submitter exclusivity is the enforcement.)

Kind:      Member
Member of: the workflow rejection
Role:      Rejection
Projects:  permission-denied

#### Recording Failure

The composition's uniform rejection for a constituent `storage-failure` or an Audit Trail `record_action` failure surfaced at the composition boundary. After a load-bearing write has committed, a later Audit Trail failure surfaces as this and requires retry (a bounded gap in Invariant 3).

Kind:      Member
Member of: the workflow rejection
Role:      Rejection
Projects:  recording-failure

#### Not Guarded

The [Open Gate] rejection when the matched transition carries no `guard` label — unguarded transitions are fired directly through [Fire Transition] without opening a gate.

Kind:      Member
Member of: the open-gate rejection
Role:      Rejection
Projects:  not-guarded

#### Gate Not Available

The [Open Gate] rejection when the instance is in a terminal state, so no gate can be opened.

Kind:      Member
Member of: the open-gate rejection
Role:      Rejection
Projects:  gate-not-available

#### Already Open

The [Open Gate] rejection when a gate is already bound for the `(instance_id, action)` pair — resolve the existing gate via [Decide Gate] before opening a replacement.

Kind:      Member
Member of: the open-gate rejection
Role:      Rejection
Projects:  already-open

#### Gate Not Open

The [Decide Gate] rejection when no Approval Step is bound for the `(instance_id, action)` pair — call [Open Gate] first.

Kind:      Member
Member of: the decide-gate rejection
Role:      Rejection
Projects:  gate-not-open

#### Gate Not Cleared

The load-bearing [Fire Transition] rejection: a guarded transition whose gate has not been opened, or whose bound Approval Step is not in Approved (Pending, Rejected, or Withdrawn), cannot fire. The structural refusal that makes the gate unbypassable — there is no surface by which the caller can assert the guard themselves.

Kind:      Member
Member of: the fire-transition rejection
Role:      Rejection
Projects:  gate-not-cleared

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Start Workflow]: #start-workflow
[Open Gate]: #open-gate
[Decide Gate]: #decide-gate
[Fire Transition]: #fire-transition
[Read Workflow]: #read-workflow
[Gate Spec]: #gate-spec
[Workflows Start]: #workflows-start
[Workflows Open Gate]: #workflows-open-gate
[Workflows Fire]: #workflows-fire
[Workflows Read]: #workflows-read
[Permission Denied]: #permission-denied
[Recording Failure]: #recording-failure
[Not Guarded]: #not-guarded
[Gate Not Available]: #gate-not-available
[Already Open]: #already-open
[Gate Not Open]: #gate-not-open
[Gate Not Cleared]: #gate-not-cleared

---

## Standards references

This composition is the structural form of what every multi-actor regulated workflow requires:

- **FDA 21 CFR Part 11 (Electronic Records; Electronic Signatures)** — every transition in a Part 11 electronic records system is an electronic record; guarded transitions driven by approval gates constitute electronic signatures. Part 11 §11.50 requires signatures be attributable; §11.70 requires they be linked to records to prevent removal, substitution, or falsification. The composition's Audit Trail substrate (Actor Identity providing cryptographic binding; Tamper Evidence providing the linking) satisfies both. The only-declared-transitions enforcement (Invariant 5) and the approval-gated-transition claim (Invariant 1) are the records-alone proof that §11.10 system access controls and §11.70 record integrity requirements were honored.

- **FDA 21 CFR Part 211 (Current Good Manufacturing Practice for Finished Pharmaceuticals)** — batch release requires authorization by a Qualified Person or equivalent designated authority. A State Machine-governed batch lifecycle with a QP approval gate on the release transition is the structural form of the Part 211 batch-release control. The guarded-transition record (history entry with `guard_satisfied: true` and bound Approved Approval Step) is the per-batch control evidence.

- **SOX (Sarbanes-Oxley Act) §404 (17 U.S.C. §7262) — Internal control over financial reporting.** Process-control records for financial workflows (journal entry posting, purchase order approval, account reconciliation) must demonstrate that the required control steps occurred in the declared order and that each gate was cleared by an authorized actor. The composition's records-alone process proof (Invariant 6) is the structural form of the SOX §404 control evidence requirement. Composes with Audit Trail's SOX §802 retention obligation (7 years).

- **ISO 9001:2015 §8.5.1 (Control of production and service provision)** — production and service provision activities must be controlled by documented procedures with controlled transition points. A State Machine instance governing a production process is the documented procedure record §8.5.1 anticipates; the composition adds the human-gate enforcement and the regulated-audit substrate.

- **BPMN 2.0 (Business Process Model and Notation 2.0 — an international standard for modeling business processes, published by the Object Management Group)** — this composition is the runtime form of a BPMN process diagram with human task gates. BPMN states map to declared State Machine states; BPMN sequence flows map to declared transitions; BPMN human task gates map to the approval-step-gated transitions. The composition enforces the BPMN model's declared process semantics at runtime.

- **ICH E6(R3) GCP (International Council for Harmonisation E6(R3) Good Clinical Practice — the global standard for clinical trial conduct)** — clinical trial lifecycle events (protocol submission, IRB approval, deviation handling, trial closure) require documented approvals at defined points by named authorities. This composition is the structural form of the GCP-required documented approval trail.

- **ISO 13485:2016 §7.3 (Design and development)** — medical device design changes require multi-disciplinary approval (design lead, quality, regulatory affairs, often clinical) at defined process gates. This composition's guarded-transition model is the per-gate enforcement layer; [Multi-Party Approval](./multi-party-approval.md) is the composing enrichment for gates requiring multiple approvers.

It inherits from:

- **The Audit Trail substrate** — SOX §802, HIPAA (Health Insurance Portability and Accountability Act — US law governing protected health information) §164.530(j), PCI DSS (Payment Card Industry Data Security Standard) Requirement 10.5, ISO/IEC 27001:2022 §A.8.15 (logging) retention and integrity obligations, via the Audit Trail composition's own standards inheritance.
- **Daniel Jackson, *The Essence of Software*** — the composition discipline: State Machine and Approval Step are freestanding atoms with orthogonal concepts; this composition is the wiring that makes them coherent in the regulated-workflow context.

---

## Status

`grounded on Final Critique 4 — 2026-06-04` (formal layer complete 2026-06-04 — TLA+ model [`execute-gated-workflow.tla`](./execute-gated-workflow.tla) + buggy twin verified in `tools/harness/`; see Lineage §Formal model). Sonnet-drafted against an Opus plan, then Opus-gated through Pass 1 (GRID), Pass 2 (EOS — the substrate convention holds; the guard-evaluation re-convergence is tightly bounded to approval-type guards; no over-absorption), Pass 3 (Linus), and a Final Critique round: one foundational finding and one refining clarification, closed in-pattern (see Lineage notes). Regulated-pattern conventions (Regulated adversarial scenarios; Generation acceptance two-subsection split) baked in from the first draft. First composition to compose the State Machine atom; the composition where guard *evaluation* re-converges. The formal-layer vote was YES; the derived TLA+ model — the approval-gated-transition claim (a guarded transition fires only when its bound Approval Step is Approved; the fire and audit-binding commit atomically), mirroring `audit-trail.tla` / `chain-of-custody.tla` — verifies green (25 states, all invariants hold) with **two isolated buggy twins**, each dedicated to one load-bearing invariant: [`execute-gated-workflow-buggy.tla`](./execute-gated-workflow-buggy.tla) fires ungated (but audited) → breaks **Invariant 1 (gate clearance)** only, and [`execute-gated-workflow-buggy-unaudited.tla`](./execute-gated-workflow-buggy-unaudited.tla) fires gated (but unaudited) → breaks the **audit-binding atomicity** invariant only. (The twins were split 2026-06-04 after `tools/harness/isolate.mjs` flagged the original single combined twin — which fired both ungated and unaudited — as masking one invariant's rejection behind the other's shorter counterexample; gate clearance and audit atomicity are independent claims, so each earns a dedicated twin, the same discipline applied to Credential.) The English cleared the 92%-good threshold (foundational findings at zero) and the formal layer is discharged, so the composition is unqualified `grounded`.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

Regulated composition. Conventions — *Regulated adversarial scenarios* and *Generation acceptance* (with the two-subsection split: Audit-Trail-traversal-clearable and Externally-clearable) — inherited from the methodology directly ([`pressure-testing.md`](../pressure-testing.md)), baked in from the first draft. [Multi-Party Approval](./multi-party-approval.md) is the primary structural twin: it composes Approval Step + Permissions + Assignment + Audit Trail (as substrate), the same constituent set as this composition minus the State Machine spine. Its substrate convention, three-step chain-action shape, application-state and cross-atom map model, `application_actor_ref`/`application_credential` discipline, load-bearing-wiring-decision subsection style, cascade discipline, GA two-subsection split, and Lineage Structural-milestone paragraph are all mirrored here. [State Machine](../atoms/state-machine.md) is the constituent whose guard-evaluation boundary this composition closes; its EOS Pass-2 boundary argument explicitly deferred guard *evaluation* to this composition as the designated re-convergence point.

**Structural milestone.** This composition retires the `*(forthcoming)*` links naming it in [`atoms/state-machine.md`](../atoms/state-machine.md) and [`atoms/approval-step.md`](../atoms/approval-step.md). It is the **first composition to compose the State Machine atom**, establishing the workflow category's composition surface. It is also the composition where guard *evaluation* re-converges: State Machine deliberately extracted guard evaluation as an EOS boundary (guards recur across many domains; each class has its own state machine); this composition closes the extraction for the approval-type guard class by binding each guarded transition to an Approval Step and asserting `guard_satisfied = true` only when the bound step is in Approved. The `gate_binding` map is the structural artifact that closes this gap — it is the application-layer state that the State Machine atom correctly did not carry.

**Formal-layer vote — initial author (Sonnet draft): YES.** The load-bearing **approval-gated-transition** claim (Invariant 1: a guarded transition fires only when its bound Approval Step is Approved; the `fire` call and the Audit Trail `event_id` binding commit atomically) is an ordering and safety claim across two constituent stores (the State Machine transition history and the Approval Step store) with an atomic audit-binding step. This is a TLA+ claim: the correct model is *fire guarded transition ⟺ gate is in Approved state at the time of `fire` call, and the Audit Trail binding is written atomically with or immediately after the `fire`*. The buggy twin is *fire a guarded transition without reading the gate state (bare `guard_satisfied = true` from the caller), OR fire a guarded transition with the gate in Pending, OR fire the guarded transition but fail to write `transition_to_event` (non-atomic audit binding)*. Mirroring `audit-trail.tla` and `chain-of-custody.tla`. *(Superseded 2026-06-04: the prose passes cleared and the TLA+ model landed and verifies — see the entry immediately below; this paragraph is preserved as the record of the vote as cast.)*

**Formal model — 2026-06-04: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`execute-gated-workflow.tla`](./execute-gated-workflow.tla) + config [`execute-gated-workflow.cfg`](./execute-gated-workflow.cfg), checked via `tools/harness/check.mjs`. *What it checks:* per guarded transition, `gate` (none/pending/approved/rejected — the bound Approval Step state), `fired` (the `WorkflowStateMachine.fire` happened), `audited` (the `transition_to_event` binding written). Two composition-level safety invariants under every interleaving: the load-bearing **Invariant 1** (`Inv1_GateClearance` — `fired ⇒ gate = approved`: a guarded transition fires only when its bound gate is Approved; the composition evaluates the gate, never fires on a bare caller assertion) and `Inv_BindingAtomic` (`fired ⇒ audited`: no fired transition lacks its audit binding). The CORRECT model fires a guarded transition only on `gate = approved` and commits `fired + audited` in one atomic step; 25 reachable states, all invariants hold. *Bounds/saturation:* `Gates = {g1, g2}`; the property is per-gate local, insensitive to gate count. *Buggy twin:* [`execute-gated-workflow-buggy.tla`](./execute-gated-workflow-buggy.tla) replaces the guarded fire with one guarded only on `~fired` (ignores the gate — modelling a composition that trusts a bare caller-asserted `guard_satisfied`) and that sets `fired` without `audited` (non-atomic). From Init, `FireGuardedBuggy(g)` reaches `fired ∧ gate = none ∧ ¬audited`, violating both invariants; the checker rejects it at 3 states. This is the model's load-bearing contribution: it shows mechanically that evaluating the gate (rather than trusting the caller) and committing the audit binding atomically are required, not decorative — a guarded transition firing without its gate cleared, or without its audit record, is reachably unsafe. *Conflict-protocol outcome:* none — the model corroborates the English; canonical English unchanged. Reproduce: `cd tools/harness && node check.mjs ../../compositions/execute-gated-workflow.tla` (and `… execute-gated-workflow-buggy.tla --buggy`).

**Opus-led gating review — 2026-06-04 (Pass 1 GRID / Pass 2 EOS / Pass 3 Linus + Final Critique).** Sonnet drafted against the Opus plan; Opus gated. One foundational finding and one refining clarification, closed in-pattern:

- *F1 — gate withdrawal authority contradicted Approval Step Invariant 5 — foundational (Pass 3).* `open_gate` submitted each gate's Approval Step with `submitter_ref = the open_gate caller`, but the moot-gate cascade (`fire_transition` step 7) and `decide_gate(withdraw)` both withdraw with `withdrawn_by = initiator_ref` — so whenever the gate-opener was not the workflow initiator, Approval Step Invariant 5 (only the submitter may withdraw) would reject the cascade `unauthorized`, leaving a moot gate un-withdrawable (an action wiring contradicting a constituent invariant). → The gate's `submitter_ref` is now pinned to the workflow `initiator_ref` (the `open_gate` caller remains the audit actor on the `gate_opened` event); gate withdrawal — by the initiator via `decide_gate(withdraw)` or by the moot-gate cascade — is now authorized under Approval Step Invariant 5, matching Multi-Party Approval's initiator-owns-withdrawal discipline.
- *F2 — `workflows:open-gate` scope — refining (Pass 3, design clarification).* The draft introduced a dedicated `workflows:open-gate` Permissions scope rather than folding gate-opening into `workflows:fire`. Accepted as the right call and recorded as deliberate: gates open lazily throughout the workflow's life (so binding to `workflows:start` would be wrong), and opening an approval gate is a distinct authority from advancing the process.

Pass 1 GRID clean (all composition sections present; reference graph intact — Workflow/State Machine, Approval Step, Permissions, Assignment, Audit Trail, Multi-Party Approval all exist). Pass 2 EOS clean: the substrate convention keeps Event Log / Actor Identity / Retention Window / Tamper Evidence transitive; non-approval guard evaluation stays the caller's / a Rules Engine's obligation (the composition evaluates only approval-type guards — the precise re-convergence of Workflow/State Machine's deliberate extraction); multi-approver gates are a Multi-Party Approval composing variant, not re-derived quorum. The English clears the 92%-good threshold (foundational findings at zero); the TLA+ approval-gated-transition model is the remaining grounding prerequisite per the YES vote.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, or rejection taxonomy changed (the invariant count held at seven). (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added after Edge cases (17 terms): 5 Operations — the four workflow-level actions ([Start Workflow], [Open Gate], [Decide Gate], [Fire Transition]) plus the read-only [Read Workflow]; 1 Field — the [Gate Spec] the composition freezes at start (guard label → required approver and scope); 4 Members for the Permissions scope vocabulary it defines ([Workflows Start], [Workflows Open Gate], [Workflows Fire], [Workflows Read]); and 7 Members for its own rejection taxonomy ([Permission Denied], [Recording Failure] and the gate-lifecycle rejections [Not Guarded], [Gate Not Available], [Already Open], [Gate Not Open], and the load-bearing [Gate Not Cleared]). Every own-action prose reference is linked; the `#### \`op(args) → …\`` signature headings and example calls, which carry parentheses, stay backticked. The scope and rejection Members are enum values, so their concept references are linked at representative homes (the scope-vocabulary table and the return-site prose) while wire forms stay backticked. **No Type card:** the composition owns no record store — its emergent state (`workflow_store`, `gate_binding`, `gate_to_assignment`, `transition_to_event`) is a set of maps wiring the five constituent stores, left as backticked tokens. Survivors left backticked: the signature headings and example calls; the audit event types (`workflow_started`, `gate_opened`, `gate_decided`, `transition_fired`, `moot_gate_recalled`); every qualified constituent call (State Machine's `instantiate` / `fire` / `current` / `history` / `read_declaration`, Approval Step's `submit` / `approve` / `reject` / `withdraw` / `read`, Permissions' `permitted` / `grant` / `revoke`, Assignment's `assign` / `recall`, Audit Trail's `record_action` / `verify_record`) and their outcomes; the constituent states (`Pending` / `Approved` / `Rejected` / `Withdrawn`); the relayed constituent tokens and inherited rejections (`invalid-request`, `invalid-declaration`, `invalid-transition`, `terminal`, `not-known`, `not-pending`, `unauthorized`, `invalid-query`); the configuration knobs; and concrete example ids. Constituent atom names remain the existing full links to `../atoms/*` and `./audit-trail.md`; constituent operations stay backticked qualified calls, not cross-page links (the decided convention). (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), its single run-on paragraph split one-idea-per-paragraph (cut #1, lossless) with the regulatory-standards list kept intact; the descriptive top blockquote folded out after confirming each claim (the State-Machine spine + Approval-Step gates + Permissions + Assignment + Audit-Trail substrate wiring; the guard-evaluation re-convergence headline) is carried by Summary / Intent / Composes / the load-bearing wiring decision; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #5 — skipped (with reason):** the composition owns no emergent state machine of its own — the workflow lifecycle states are the State Machine constituent's (declared per deployment), the gate lifecycle (Pending → Approved | Rejected | Withdrawn) is Approval Step's, and the composition's own logic is the uniform permission-check → constituent-call → audit-record wiring already stated crisply in Action wiring. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-06-04`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (17 terms); seven composition-level invariants preserved; the `.tla` models untouched — harness re-run green: `execute-gated-workflow.tla` PASS + both buggy twins (`execute-gated-workflow-buggy.tla`, `execute-gated-workflow-buggy-unaudited.tla`) rejected under `--buggy`.

</details>
