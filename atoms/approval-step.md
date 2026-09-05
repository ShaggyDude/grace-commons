---
title: Approval Step
parent: Atomic Concepts
has_toc: true
toc: true
---

# Approval Step

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>

## Summary

Approval Step records a single authorization gate. A specific thing was submitted for approval, presented to one named approver, and ended in a decision — approved, rejected, or withdrawn — with who decided, when, and why. Each step has exactly one [Approver Ref] (the only person who may approve or reject it), one [Submitter Ref] (the only person who may withdraw it before a decision), one [Subject Ref] (the thing being approved), and one [Scope] (the kind of approval being requested). Each step also has an opaque, immutable [Step Id]; the subject, approver, scope, submitter, and timestamps are immutable properties set at submission. A step has four states: [Pending] (the initial state) plus three terminal states — [Approved], [Rejected] (with a required reason), and [Withdrawn] (the submitter pulled it back). All three terminal states are absorbing; there is no re-open and no decision reversal. The core guarantee is that every decision is fully attributed. An anonymous decision, a rejection with no reason, or a missing timestamp is a failure. So the record alone proves a required control existed and operated, which is exactly what an auditor or investigator asks for. This is distinct from a permission (which is standing, reusable authority to do a class of things) and from an assignment (which is about who owns a task, not who approved it). A controller may be *permitted* to approve journal entries, but each entry still needs an Approval Step proving they *did* approve that one. Delegation — binding a different actor to stand in for the named approver — is a composing concept, not a property of this atom. It underlies financial control gates, regulated electronic-signature approvals, clinical-trial oversight, and engineering change control.

*Also known as: an approval gate, a sign-off, an authorization step, a review gate.*

---

## Intent

Many actions in regulated systems require explicit human authorization before they may proceed. A financial journal entry exceeding a materiality threshold must be approved by a controller before it posts. A clinical trial protocol deviation must be approved by the principal investigator (PI) before the deviant procedure occurs. A pharmaceutical batch release must be approved by a qualified person under 21 CFR (Code of Federal Regulations — the codification of US federal agency rules) Part 211. An engineering change order must be approved through a release chain before it reaches production. In every case, the structure is the same: something is submitted for approval, a named actor reviews it, and the outcome — approved, rejected, or withdrawn by the submitter — is an auditable record that external evaluators rely on as evidence that the required control existed and operated.

Approval Step is the specification of that structure. It records the gate. It records who the gate was for. It records the outcome, the actor who decided it, and when. It guarantees these records are present and immutable. Cryptographic protection of those records against post-hoc modification — the bar for court-admissible evidence of control operation under SOX (Sarbanes-Oxley Act — US law on corporate financial reporting and records integrity) §404 and FDA (US Food and Drug Administration — the federal agency regulating drugs and medical devices) Part 11 — is added by composition with [Tamper Evidence](./tamper-evidence.md); this atom does not provide it alone.

The atom is structurally distinct from three adjacent concepts, and the distinctions are load-bearing:

**Approval Step vs. Permissions.** [Permissions](./permissions.md) governs *standing authorization* — a persistent grant binding a subject to a set of permitted action scopes, checked at every relevant action invocation, active until revoked. An Approval Step governs *transient decision authorization* — a one-time gate applied to a specific subject (a document, a transaction, an action instance) that produces a terminal outcome and is then closed. A Permissions [Permitted](./permissions.md#permitted) check answers "may this actor generally do things of this kind?" An Approval Step answers "has this specific thing been approved by the specifically named actor for this specific scope?" A controller with Permissions to approve journal entries still needs an Approval Step record for each entry that was actually approved — the Permissions grant says they are *allowed* to approve; the Approval Step says they *did* approve this one. Both atoms are present in a conforming SOX deployment; neither replaces the other.

**Approval Step vs. Assignment.** [Assignment](./assignment.md) governs *responsibility binding* — an active binding that a task or work item is the named actor's to work on, with a lifecycle of its own (Pending → Active → Complete | Recalled | Expired). Assignment answers "who is responsible for doing this work?" An Approval Step answers "has this thing been approved by the named actor?" These often coexist without overlapping: a document may be assigned to an author (Assignment) and simultaneously submitted to a reviewer for approval (Approval Step). Assignment does not produce a decision record; Approval Step does not track work ownership. Confusing them produces either a spec that cannot record the approval decision or one that loses track of who owns the work.

**Approval Step vs. the State Machine atom.** The [State Machine](./state-machine.md) atom is the general-purpose state machine engine: a named entity moving through a deployment-declared set of states via deployment-declared transitions, with the full transition history auditable. Approval Step is a *specific kind of state machine* whose states are fixed by this atom (Pending, Approved, Rejected, Withdrawn), whose transitions are approval-specific (submit, approve, reject, withdraw), and whose semantics are approval-specific (exactly one named approver; decision produces a terminal outcome that is itself a compliance record). The distinction matters because Approval Step is fully specified at the atom level — external evaluators know the states and their semantics without consulting a deployment configuration — while State Machine is specified by deployment declaration. Multi-party approval chains that wire multiple Approval Step instances together belong to the [Multi-Party Approval](../compositions/multi-party-approval.md) composition; chains where the approval state logic is itself configurable at deployment time belong to [Execute Gated Workflow](../compositions/execute-gated-workflow.md). This atom's scope is the single gate.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It carries its own state (the [Approval Step] record set), its own actions ([Submit], [Approve], [Reject], [Withdraw], [Read]), and its own invariants (subject immutability, approver exclusivity, terminal absorption, decision completeness, concurrent step independence). Composing patterns add multi-party chains, access control, event logging, tamper evidence, and delegation.

---

## Structure

### Store instance model

The Approval Step atom operates against a named store instance. A `store_name` identifies the instance; multiple instances coexist in real systems — one per organization, department, or regulated domain, depending on deployment topology. [Step Id] values are unique within a store instance; uniqueness across instances is a composing concept. The same [Subject Ref] may appear in multiple simultaneous [Approval Step] records within the same store instance — one per required approval gate. Calls implicitly target a single routed instance; instance selection is resolved at the deployment-routing layer, not defined by this atom.

### Identity model

Each approval step has an opaque, immutable, system-generated [Step Id] — assigned on [Submit], never reused, never reassigned within the store instance. It must be a non-empty string sortable in lexicographic byte-order; this property is required for deterministic [Read] ordering. The id is the step's identity; the subject, approver, scope, submitter, reason, and timestamps are properties of the step, not its identity.

[Subject Ref] is an opaque reference to the thing being approved — a document id, a transaction id, a work item id, a protocol deviation id. Set on [Submit], immutable. The atom does not validate that the subject exists or is in any particular state — [Subject Ref] is the caller's responsibility. Two approval steps covering the same subject have distinct [Step Id]s; each is its own record with its own lifecycle.

[Approver Ref] is an opaque reference to the actor required to approve. Set on [Submit], immutable. It is the authorization anchor: the only actor permitted to call [Approve] or [Reject] on this step is the one whose reference matches [Approver Ref]. Empty or whitespace-only values are rejected at submission. Delegation — binding a different actor to step in for the named approver — is a composing concept, not a property of this atom.

[Submitter Ref] is an opaque reference to the actor submitting the approval request. Set on [Submit], immutable. It is the attribution anchor for the submission decision; empty or whitespace-only values are rejected at submission.

[Scope] is a non-empty string naming the kind of approval being requested — for example, `"financial-journal-entry:post"`, `"clinical-trial:protocol-deviation"`, or `"change-order:release"`. Set on [Submit], immutable. The atom does not interpret scope semantics; it records the scope as an auditable field and uses it as a filter axis for [Read]. Must contain at least one non-whitespace character.

[Reason] is an optional non-empty string providing context for the approval request — a narrative description of what is being approved, a reference to the underlying business rule, or a summary of the deviation. Set on [Submit], immutable. Its absence is valid — some deployment contexts supply all context through [Subject Ref] and [Scope]. If supplied, it must contain at least one non-whitespace character.

**Reference and scope equality is byte-for-byte.** Every equality comparison this atom performs on its string fields — [Decided By] against [Approver Ref] (Invariant 4), [Withdrawn By] against [Submitter Ref] (Invariant 5), and every exact-match [Read] filter ([Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [State]) — is exact byte-sequence equality on the value as supplied: no Unicode normalization, no case folding, no whitespace trimming. Two values that render identically but differ in byte sequence (a precomposed versus decomposed accented character; differing case) are different values. Callers are responsible for supplying references in one canonical byte form consistently; the atom stores and compares what it is given. This is the comparison the exclusivity invariants rest on.

### Inputs

- [Submit] calls from actors requesting approval — business process actors, automated workflow engines, change management integrations — each carrying a subject reference, approver reference, submitter reference, scope, optional reason, and optional explicit timestamp. (Projected contract: `submit(subject_ref, approver_ref, submitter_ref, scope, reason?, submitted_at?) → step_id | rejected(invalid-request | storage-failure)`.)
- [Approve] calls from the named approver, documenting the affirmative decision, carrying the step id, the deciding actor, an optional stated reason, and an optional explicit timestamp. (Projected contract: `approve(step_id, decided_by, reason?, decided_at?) → approved | rejected(invalid-request | not-known | not-pending | unauthorized | storage-failure)`.)
- [Reject] calls from the named approver, documenting the negative decision, carrying the step id, the deciding actor, a required reason, and an optional explicit timestamp. (Projected contract: `reject(step_id, decided_by, reason, decided_at?) → rejected_outcome | rejected(invalid-request | not-known | not-pending | unauthorized | storage-failure)`.)
- [Withdraw] calls from the submitter, documenting that the request has been retracted, carrying the step id, the withdrawing actor (must match [Submitter Ref]), a required reason, and an optional explicit timestamp. (Projected contract: `withdraw(step_id, withdrawn_by, reason, withdrawn_at?) → withdrawn | rejected(invalid-request | not-known | not-pending | unauthorized | storage-failure)`.)
- [Read] queries from auditors, process operators, downstream workflow systems, and approval dashboards. (Projected contract: `read(query) → ordered_sequence_of_steps | rejected(invalid-query)`.)

### Actions

For optional parameters in [Submit], [Approve], [Reject], and [Withdraw], "supplied" means provided as a parseable value of the declared type. Null, missing, and empty (or whitespace-only) values are equivalent to "not supplied," and the action's documented default applies. The labeled projected contract for each Operation is given once in Inputs above.

- **[Submit]** — create a new approval gate. Assigns a fresh [Step Id], records [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [Reason] (if supplied), and [Submitted At] (wall clock if not supplied; must not be in the future — a step cannot be submitted in the future). The step enters [Pending] state. [Subject Ref], [Approver Ref], [Submitter Ref], and [Scope] must each contain at least one non-whitespace character; [Reason], if supplied, must also contain at least one non-whitespace character — any violation is [Invalid Request]. [Storage Failure] if the store write fails after all preconditions pass; no [Step Id] is issued and no record enters the store.

- **[Approve]** — record the affirmative decision and transition the step to [Approved]. Records [Decided By], [Decision Reason] (if supplied; absence is valid for an approval — rejection requires a reason), and [Decided At] (wall clock if not supplied; must not be in the future). All decision fields are immutable after the transition. The supplied [Step Id] must contain at least one non-whitespace character ([Invalid Request]); a null, empty, or whitespace-only [Step Id] is malformed and rejected before any existence check is performed. [Decided By] must contain at least one non-whitespace character ([Invalid Request]). The resolved [Decided At] — whether caller-supplied or wall-clock-defaulted — must be ≥ the step's [Submitted At]; a value less than [Submitted At] is [Invalid Request] regardless of how it was derived (this enforces Invariant 7 against clock-skew artifacts as well as caller-supplied backdated values). [Decided By] must match [Approver Ref] ([Unauthorized]); the atom rejects approval from any actor other than the named approver. [Storage Failure] leaves the step in [Pending]; the caller must retry. Rejection priority: malformed [Step Id] ([Invalid Request]) → [Not Known] → [Not Pending] → attribution/temporal ([Invalid Request]) → [Unauthorized] → [Storage Failure].

- **[Reject]** — record the negative decision and transition the step to [Rejected]. Requires a non-empty reason; a rejection without a stated reason is not operationally meaningful and defeats the audit trail that regulated proceedings depend on. Records [Decided By], [Decision Reason], and [Decided At] (wall clock if not supplied; must not be in the future). All decision fields are immutable after the transition. The supplied [Step Id] must contain at least one non-whitespace character ([Invalid Request]). The resolved [Decided At] must be ≥ the step's [Submitted At]. [Decided By] must match [Approver Ref] ([Unauthorized]). The success token is `rejected_outcome` rather than `rejected` to distinguish the action's success result from the action's own rejection path. [Storage Failure] leaves the step in [Pending]; the caller must retry. Rejection priority mirrors [Approve]: malformed [Step Id] ([Invalid Request]) → [Not Known] → [Not Pending] → attribution/temporal ([Invalid Request]) → [Unauthorized] → [Storage Failure].

- **[Withdraw]** — record the submitter's retraction and transition the step to [Withdrawn]. Requires a non-empty reason. Records [Withdrawn By], [Withdrawal Reason], and [Withdrawn At] (wall clock if not supplied; must not be in the future). All withdrawal fields are immutable after the transition. The supplied [Step Id] must contain at least one non-whitespace character ([Invalid Request]). The resolved [Withdrawn At] must be ≥ the step's [Submitted At]. [Withdrawn By] must match [Submitter Ref] ([Unauthorized]); withdrawal is the submitter's act, not the approver's. [Storage Failure] leaves the step in [Pending]; the caller must retry. Rejection priority: malformed [Step Id] ([Invalid Request]) → [Not Known] → [Not Pending] → attribution/temporal ([Invalid Request]) → [Unauthorized] → [Storage Failure].

- **[Read]** — return steps matching the [Query], ordered by [Submitted At] ascending, then by [Step Id] ascending in lexicographic byte-order as a stable tiebreaker. Implementations must assign [Step Id] values in a format where string byte-order sort produces a total order (e.g., ULID — Universally Unique Lexicographically Sortable Identifier; UUID version 7 — Universally Unique Identifier, the timestamp-ordered variant; or a zero-padded integer string). The supported filter axes are exactly: [Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [State], and time ranges on [Submitted At], [Decided At], or [Withdrawn At]. A time range filter on any of those timestamp fields takes the form `{after: <timestamp>, before: <timestamp>}` with both sub-keys optional; `after` is an inclusive lower bound and `before` is an inclusive upper bound. A range carrying only `after` is unbounded above; a range carrying only `before` is unbounded below; a range carrying both bounds the result inclusively on both ends. Filter keys are flat strings, not dot-notation paths. Any combination of supported axes is valid. A [Query] supplying only a [Step Id] returns at most one step. A well-formed [Query] matching no steps returns an empty sequence, not a rejection. A [Query] with no filters returns every step in the store.

  A time range filter on [Decided At] returns only steps that carry a [Decided At] field — i.e., [Approved] or [Rejected] steps. [Pending] and [Withdrawn] steps carry no [Decided At] field and are implicitly excluded from results whenever a [Decided At] filter is present, regardless of whether a [State] filter is also supplied. A time range filter on [Withdrawn At] returns only [Withdrawn] steps by the same rule. A [Query] filtering on a timestamp field that a given state does not carry returns only steps of states that do carry it; this rule applies to any timestamp-absent-field combination, not only the enumerated examples here. A [Scope] filter value matches only steps where [Scope] equals the value exactly (byte-for-byte, per the reference-equality rule in Identity model — as with every exact-match filter axis). The query `{subject_ref: X, state: Pending}` returns every [Pending] step covering a given subject — this is the operational check for whether a subject has an outstanding approval gate.

  **Malformed-query rules ([Invalid Query]):** a [Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], or [Scope] filter value that is null, empty, or whitespace-only is [Invalid Query]. A [State] filter value that is not one of `Pending`, `Approved`, `Rejected`, `Withdrawn` is [Invalid Query]. A time range with end before start is [Invalid Query]. A [Query] carrying an unrecognized filter key — any key outside the supported axes named above — is [Invalid Query]; an unrecognized key is rejected rather than silently ignored, because silent ignore would return a result set inconsistent with the caller's intent.

### Outputs

- For [Submit]: a fresh [Step Id], or a rejection.
- For [Approve]: the outcome token `approved`, or a rejection.
- For [Reject]: the outcome token `rejected_outcome`, or a rejection.
- For [Withdraw]: the outcome token `withdrawn`, or a rejection.
- For [Read]: a (possibly empty) ordered sequence of steps. Each step carries its full field set. Fields present on every step (any state): [Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [Submitted At], [State]. Optional field set at submission (independent of state): [Reason] (present if supplied at [Submit], absent otherwise; immutable thereafter). State-specific fields: [Decided By], [Decision Reason], [Decided At] are present on [Approved] and [Rejected] steps only; [Withdrawn By], [Withdrawal Reason], [Withdrawn At] are present on [Withdrawn] steps only. An [Approved] or [Rejected] step carries all submission fields (including [Reason] if it was supplied) and all decision fields simultaneously. A [Withdrawn] step carries all submission fields and all withdrawal fields.

### State

Each approval step is in exactly one state:

- **[Pending]** — the approval gate (a named checkpoint that must be cleared before a workflow can advance) is open; no terminal decision has been made. Carries [Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [Submitted At], and [Reason] (if supplied). May be transitioned to [Approved] (by the named approver), [Rejected] (by the named approver), or [Withdrawn] (by the submitter). No other transitions are valid.
- **[Approved]** — the named approver has affirmatively decided. Carries all submission fields plus [Decided By], [Decision Reason] (if supplied), and [Decided At] (all immutable from the moment [Approve] completes). Terminal; no further transitions.
- **[Rejected]** — the named approver has negatively decided. Carries all submission fields plus [Decided By], [Decision Reason], and [Decided At] (all immutable from the moment [Reject] completes). Terminal; no further transitions. [Decision Reason] is required on [Rejected] steps; it is optional on [Approved] steps.
- **[Withdrawn]** — the submitter has retracted the request. Carries all submission fields plus [Withdrawn By], [Withdrawal Reason], and [Withdrawn At] (all immutable from the moment [Withdraw] completes). Terminal; no further transitions.

Valid transitions — every transition records its outcome from the action's inputs; an action whose actor-identity guard fails writes nothing and leaves the step [Pending]:

| action | from | to | actor guard | result | rejections |
|--------|------|----|-------------|--------|-----------|
| [Submit] | *(no record)* | **[Pending]** | — | fresh [Step Id] | [Invalid Request]; [Storage Failure] |
| [Approve] | [Pending] | **[Approved]** | [Decided By] = [Approver Ref] | `approved` | [Invalid Request]; [Not Known]; [Not Pending]; [Unauthorized]; [Storage Failure] |
| [Reject] | [Pending] | **[Rejected]** | [Decided By] = [Approver Ref] | `rejected_outcome` | [Invalid Request]; [Not Known]; [Not Pending]; [Unauthorized]; [Storage Failure] |
| [Withdraw] | [Pending] | **[Withdrawn]** | [Withdrawn By] = [Submitter Ref] | `withdrawn` | [Invalid Request]; [Not Known]; [Not Pending]; [Unauthorized]; [Storage Failure] |

Three semantics the cells cannot hold:

- *The actor-identity guard is exclusive, and a failed guard writes nothing.* Only [Approver Ref] may [Approve] or [Reject]; only [Submitter Ref] may [Withdraw]. A call whose [Decided By] / [Withdrawn By] does not match is rejected [Unauthorized]; the record is left [Pending] and nothing is written (Invariants 4 and 5).
- *The three terminal states are absorbing.* There are no transitions out of [Approved], [Rejected], or [Withdrawn]; the atom has no re-open, re-activate, or decision-reversal surface. A resolving action on an already-terminal step is rejected [Not Pending] (Invariant 3). A [Pending] step cannot be re-submitted as a new version; a fresh approval need requires a new [Submit] call producing a new [Step Id].
- *Rejection priority is fixed.* For each resolving action the order is malformed [Step Id] ([Invalid Request]) → [Not Known] → [Not Pending] → attribution/temporal ([Invalid Request]) → [Unauthorized] → [Storage Failure]; for [Submit] it is field-validation ([Invalid Request]) → [Storage Failure]. The full per-action preconditions are in Decision points.

### Flow

1. **Submission.** A controller determines that posting journal entry JE-2026-0441 requires senior finance approval under SOX §404 controls. Calls `submit(subject_ref: "je-2026-0441", approver_ref: "finance_director_chen", submitter_ref: "controller_morgan", scope: "financial:journal-entry:post")` → `step_id: "step-001"`. The step enters [Pending].
2. **Review.** The finance director receives notification (via a composing notification workflow; out of scope here) and reviews the journal entry.
3. **Approval.** The finance director approves: `approve("step-001", decided_by: "finance_director_chen", reason: "Reviewed and approved — posting authorized")` → `approved`. The step is now [Approved]. The composing workflow system releases the journal entry for posting.
4. **Audit query.** A SOX auditor later queries `read({subject_ref: "je-2026-0441", state: Approved})` and sees the step with full attribution: who submitted, who approved, when, and the stated reason. The control evidence is present in the records without recourse to developer testimony.

Alternatively, at step 3: the finance director finds a misclassification and rejects: `reject("step-001", decided_by: "finance_director_chen", reason: "GL account 4120 is incorrect — should be 4130 per revenue recognition policy")` → `rejected_outcome`. The step is now [Rejected]. The composing workflow routes the entry back to the controller for correction, who must [Submit] a new approval step for the corrected entry.

Or: before step 3, the controller discovers the entry was submitted to the wrong approver and withdraws it: `withdraw("step-001", withdrawn_by: "controller_morgan", reason: "Submitted to wrong approver — should route to tax_director for cross-border entries")` → `withdrawn`. A new [Submit] call creates `step-002` with the correct [Approver Ref].

### Decision points

- **At [Submit]** — [Subject Ref], [Approver Ref], [Submitter Ref], and [Scope] must each contain at least one non-whitespace character; [Reason], if supplied, must also contain at least one non-whitespace character — any violation is [Invalid Request]. [Submitted At], if supplied, must not be in the future (checked against the receiving node's wall clock); a violation is [Invalid Request]. [Storage Failure] if the store write fails after all preconditions pass; no [Step Id] is issued, no record enters the store. Rejection priority: field-validation ([Invalid Request]) → [Storage Failure].

- **At [Approve]** — the [Step Id] parameter is checked first: if null, empty, or whitespace-only, the call is [Invalid Request] (the caller passed garbage, not a reference to a missing step). If [Step Id] is well-formed, the store is consulted: [Not Known] if no step with this id exists; [Not Pending] if the step is in [Approved], [Rejected], or [Withdrawn] state. If neither, attribution and temporal checks apply: [Decided By] must contain at least one non-whitespace character ([Invalid Request]); the resolved [Decided At] — caller-supplied or wall-clock-defaulted — must not be in the future (the future-bound applies when caller-supplied; a wall-clock default is "now" by construction) and must be ≥ the step's [Submitted At]. The `≥ submitted_at` bound applies to the resolved [Decided At] regardless of how it was derived; this enforces Invariant 7 against clock-skew artifacts and caller-supplied backdated values. A violation is [Invalid Request]. Then identity check: [Decided By] must match [Approver Ref] exactly — byte-for-byte, per the reference-equality rule in Identity model ([Unauthorized]). [Storage Failure] leaves the step in [Pending]; the caller must retry. Rejection priority: malformed [Step Id] ([Invalid Request]) → [Not Known] → [Not Pending] → attribution/temporal ([Invalid Request]) → [Unauthorized] → [Storage Failure].

- **At [Reject]** — identical to [Approve] in structure, with one addition: a reason is required for [Reject] (not optional as in [Approve]); a null, empty, or whitespace-only reason is [Invalid Request]. All other checks and rejection priorities are identical to [Approve].

- **At [Withdraw]** — the [Step Id] parameter is checked first as above. The store is consulted: [Not Known]; [Not Pending]. Attribution and temporal checks: [Withdrawn By] must contain at least one non-whitespace character ([Invalid Request]); the resolved [Withdrawn At] must not be in the future and must be ≥ the step's [Submitted At] ([Invalid Request]). Then identity check: [Withdrawn By] must match [Submitter Ref] exactly — byte-for-byte, per the reference-equality rule in Identity model ([Unauthorized]). [Storage Failure] leaves the step in [Pending]; the caller must retry. Rejection priority: malformed [Step Id] ([Invalid Request]) → [Not Known] → [Not Pending] → attribution/temporal ([Invalid Request]) → [Unauthorized] → [Storage Failure].

- **At [Read]** — every supplied filter value must be well-formed for its axis. A [Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], or [Scope] filter value that is null, empty, or whitespace-only is [Invalid Query]. A [State] filter value not in `Pending`, `Approved`, `Rejected`, `Withdrawn` is [Invalid Query]. A time range with end before start is [Invalid Query]. An unrecognized filter key — any key outside the supported axes — is [Invalid Query]; the spec rejects rather than ignores unknown keys. A time range filter on a timestamp field implicitly excludes states that do not carry that field, regardless of whether a [State] filter is also present. A well-formed [Query] matching no steps returns an empty sequence.

### Behavior

- **Steps are durable on success.** Once [Submit] returns a [Step Id], the step is in the store and will appear in subsequent reads.
- **Step submission is not idempotent.** Two [Submit] calls for the same [Subject Ref], [Approver Ref], and [Scope] create two independent steps with distinct [Step Id]s. For at-most-once semantics on submission, compose with [Duplicate Prevention](./duplicate-prevention.md).
- **The named approver is the only actor who may decide.** [Approve] and [Reject] are rejected as [Unauthorized] if [Decided By] does not match [Approver Ref]. There is no fallback approver, no escalation path, and no "any authorized actor" surface in this atom. These are composing concepts.
- **The submitter is the only actor who may withdraw.** [Withdraw] is rejected as [Unauthorized] if [Withdrawn By] does not match [Submitter Ref].
- **Terminal states are absorbing.** A step in [Approved], [Rejected], or [Withdrawn] state accepts no further transitions. There is no re-open, no re-activate, and no decision reversal surface. A fresh approval need requires a new [Submit] call producing a new [Step Id].
- **Multiple concurrent approval steps on the same subject are independent.** A subject with two outstanding [Pending] steps requires two decisions. Deciding on step A (via [Approve], [Reject], or [Withdraw]) does not affect step B. Whether a subject has any outstanding approval gates is answered by `read({subject_ref: X, state: Pending})`; if the result is non-empty, at least one gate is open.
- **Reads are repeatable; the step store is monotonic.** The step store only grows — [Submit] adds records; [Approve], [Reject], and [Withdraw] transition them. An unfiltered read at `t2 > t1` returns every step visible at `t1` plus any added in between. State-filtered reads are not monotonic: a step visible under `state: Pending` at `t1` may appear under a terminal state at `t2` if decided in between.

### Feedback

- After [Submit] — a new [Pending] step exists; [Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [Submitted At], and [Reason] (if supplied) are set and immutable.
- After [Approve] — the step is now [Approved]; [Decided By], [Decision Reason] (if supplied), and [Decided At] are set and immutable. All submission fields are unchanged.
- After [Reject] — the step is now [Rejected]; [Decided By], [Decision Reason], and [Decided At] are set and immutable. All submission fields are unchanged.
- After [Withdraw] — the step is now [Withdrawn]; [Withdrawn By], [Withdrawal Reason], and [Withdrawn At] are set and immutable. All submission fields are unchanged.

Each rejected action produces an observable refusal naming the failed precondition: [Invalid Request], [Not Known], [Not Pending], [Unauthorized], [Storage Failure], or [Invalid Query].

### Invariants

- **Invariant 1 — Submission immutability.** After a successful [Submit], the fields [Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [Submitted At], and [Reason] never change, regardless of any subsequent action.

- **Invariant 2 — Membership exclusivity.** Every step known to the store is in exactly one of {[Pending], [Approved], [Rejected], [Withdrawn]} at all times.

- **Invariant 3 — Terminal absorption.** Once a step transitions to [Approved], [Rejected], or [Withdrawn], no action transitions it further. All three terminal states are absorbing. The atom has no re-activate, re-open, or decision-reversal surface; a fresh approval need requires a new [Submit].

- **Invariant 4 — Approver exclusivity.** Only the actor whose opaque reference matches [Approver Ref] may transition a step from [Pending] to [Approved] or [Rejected]. Any call to [Approve] or [Reject] where [Decided By] does not match [Approver Ref] is rejected as [Unauthorized]. Delegation — binding a different actor to step in for the named approver — is not a property of this atom; it belongs to a composing delegation pattern.

- **Invariant 5 — Submitter exclusivity.** Only the actor whose opaque reference matches [Submitter Ref] may transition a step from [Pending] to [Withdrawn]. Any call to [Withdraw] where [Withdrawn By] does not match [Submitter Ref] is rejected as [Unauthorized].

- **Invariant 6 — Decision attribution is complete for terminal steps.** Every [Approved] or [Rejected] step carries [Decided By] containing at least one non-whitespace character and a [Decided At] timestamp that is set. Every [Rejected] step additionally carries [Decision Reason] containing at least one non-whitespace character. Every [Withdrawn] step carries [Withdrawn By] containing at least one non-whitespace character, [Withdrawal Reason] containing at least one non-whitespace character, and a [Withdrawn At] timestamp that is set. An anonymous decision, a whitespace-only attribution string, a missing timestamp, or a [Rejected] step without a stated reason is a conformance failure — each defeats the audit trail that SOX control evidence and FDA Part 11 electronic signature requirements depend on.

- **Invariant 7 — Temporal ordering.** For every [Approved] or [Rejected] step, [Decided At] ≥ [Submitted At]. For every [Withdrawn] step, [Withdrawn At] ≥ [Submitted At]. A step cannot be documented as decided or withdrawn before it was submitted. These constraints apply to the values persisted in the record, regardless of whether the timestamps were caller-supplied or wall-clock-defaulted; the Decision points for [Approve], [Reject], and [Withdraw] enforce the bounds against the resolved values before any transition is committed.

- **Invariant 8 — Submission attribution is complete.** Every step, in any state, carries [Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], and [Scope] each containing at least one non-whitespace character, and a [Submitted At] timestamp that is set. Invariant 1 guarantees these fields are immutable; this invariant guarantees they are never blank or unset. An anonymous submission, a whitespace-only scope, or a missing timestamp is a conformance failure — it defeats the chain of custody that an external evaluator needs to reconstruct who requested the approval and what it covered.

- **Invariant 9 — Concurrent step independence.** Transitioning step S changes no field of any other step S′ — whether S′ covers the same subject or a different one. The same-subject case is the operationally interesting one (a subject with two outstanding gates requires two independent decisions), but the independence is universal, not scoped to shared subjects. The active/terminal state of each step is determined solely by whether [Approve], [Reject], or [Withdraw] has been called on that specific [Step Id].

- **Invariant 10 — Step store durability.** No step record is removed from the store. The total step count is monotonically non-decreasing. A [Step Id] returned by a successful [Submit] is durably persisted; a [Storage Failure] rejection guarantees no partial record was written. Terminal steps are retained as audit evidence; deleting a terminal step would destroy the proof that the required approval gate was reached and resolved.

---

## Examples

### Happy path — SOX journal entry approval

See Flow section. A complete approval arc is walked there: submission by a controller, review by the finance director, approval, and a later audit query recovering the full decision record. The rejection variant and the withdrawal variant are also walked in the Flow section.

### Rejection path — approver not the named actor

A workflow automation engine has a bug and routes the `approve` call for `step-001` to a different finance director: `approve("step-001", decided_by: "finance_director_patel", reason: "Looks fine")` → `rejected(unauthorized)`. The step remains [Pending]. The named approver on `step-001` is `finance_director_chen`; `finance_director_patel` is not authorized to decide on it. The system logs the unauthorized attempt and alerts the process owner.

### Rejection path — decision attempted on a terminal step

After `step-001` has been [Approved], the submitting system retries due to a network glitch: `approve("step-001", decided_by: "finance_director_chen", reason: "retry")` → `rejected(not-pending)`. The step record is unchanged. The retry system detects the rejection and suppresses further retries.

### Rejection path — submit with whitespace-only scope

`submit(subject_ref: "po-2026-0099", approver_ref: "procurement_lead", submitter_ref: "buyer_jones", scope: "   ")` → `rejected(invalid-request)`. Whitespace-only [Scope] is treated as empty. No step is created.

### Rejection path — approve with backdated timestamp before submission

`approve("step-007", decided_by: "qa_director_kim", decided_at: "2026-01-01T00:00:00Z")` where `step-007` has `submitted_at: "2026-05-01T09:00:00Z"` → `rejected(invalid-request)`. The resolved [Decided At] is 2026-01-01, which is less than [Submitted At] 2026-05-01; the temporal ordering is violated. The atom rejects regardless of whether [Decided At] was caller-supplied or would have been wall-clock-defaulted — the enforcement is against the resolved value.

### Regulated adversarial scenarios

#### Regulator audit — SOX §404 control evidence query

A SOX auditor requests evidence that financial journal entries above a materiality threshold were approved by the appropriate controller during Q1 2026. The compliance team queries `read({scope: "financial:journal-entry:post", state: Approved, submitted_at: {after: "2026-01-01T00:00:00Z", before: "2026-03-31T23:59:59Z"}})`. The result is every [Approved] step in scope during Q1. Every step carries [Approver Ref], [Decided By], [Submitted At], [Decided At], and [Scope] — each with at least one non-whitespace character and with timestamps set — immutable by Invariants 1 and 6. The auditor confirms that [Decided By] matches [Approver Ref] on each step (Invariant 4 makes this structurally enforced, not procedurally promised). The auditor also checks for any steps in [Pending] that fall within the scope and period, verifying no steps were left unresolved: `read({scope: "financial:journal-entry:post", state: Pending, submitted_at: {after: "2026-01-01T00:00:00Z", before: "2026-03-31T23:59:59Z"}})`. A non-empty result indicates at least one gate was submitted during Q1 but never decided — a control gap the auditor would surface. The covered entity has documentable, auditable control evidence; no recourse to developer testimony or source code is needed.

#### Disputed approval — FDA 21 CFR Part 11 electronic signature challenge

An FDA investigator reviewing a pharmaceutical batch release challenges the authenticity of an approval: the actor named in [Decided By] on step `step-batchrel-0412` claims they did not approve batch BR-2026-0412. The investigator queries `read({step_id: "step-batchrel-0412"})` and retrieves the step record. The record shows `submitted_at: 2026-04-15T14:22:00Z`, `decided_at: 2026-04-15T16:04:00Z`, `decided_by: "qp_director_santos"`, `decision_reason: "Batch release authorized — COA reviewed, specification limits met"`, `state: Approved`. Invariant 4 guarantees that [Decided By] matching [Approver Ref] was enforced at the time of the [Approve] call — no other actor could have produced this record. The investigator then invokes [Actor Identity](./actor-identity.md) to verify the [Attestation](./actor-identity.md#attestation) that binds `qp_director_santos` to the action at [Decided At] — that is the electronic signature in the Part 11 sense. The Approval Step record is the gate; Actor Identity is the signature. The denied-approval claim cannot be sustained against the structural record without claiming that `qp_director_santos`'s credentials were compromised — an out-of-band investigation the Part 11 framework also addresses.

#### Breach or incident forensics — unauthorized approval attempt investigation

During a security incident review, the incident response team needs to determine whether any approval steps were decided by actors other than the named approver during a window of suspected credential compromise (2026-05-01T00:00:00Z through 2026-05-03T23:59:59Z). The team queries `read({decided_at: {after: "2026-05-01T00:00:00Z", before: "2026-05-03T23:59:59Z"}, state: Approved})` and `read({decided_at: {after: ...}, state: Rejected})` to get all decided steps in the window. Because Invariant 4 is enforced at the action level — any [Approve] or [Reject] where [Decided By] does not match [Approver Ref] is rejected as [Unauthorized] and produces no record — every step in the decided result set has [Decided By] = [Approver Ref] by construction. The forensic question is whether the [Approver Ref] actor's credentials were used legitimately; that question is answered by [Actor Identity](./actor-identity.md) and the composing credential-compromise investigation, not by this atom. The atom's records faithfully document every gate and outcome; neither gaps nor fabrications are possible within the atom's own invariants.

---

## Generation acceptance

Any implementation derived from this atom must produce records and a runtime surface that pass the following checks from the records alone, without recourse to source code, runbooks, or developer narration:

1. **Step completeness check.** In test and audit environments where the [Step Id] values returned by [Submit] calls are observable, confirm for the set of known-issued [Step Id]s that `read({step_id: X})` returns each of them across all states. No issued [Step Id] may be absent from the store. In production audit contexts where the auditor does not have the original [Submit] responses, this exact check is unavailable from the records alone; the equivalent assurance for production audit comes from check 6 (store monotonicity), which detects post-creation deletion without requiring the auditor to enumerate the full set of issued ids. Both checks together constitute the records-alone clearance for Invariant 10 (step store durability).

2. **Submission attribution check — all states.** For every step in the store, in any state: confirm [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], and [Step Id] each contain at least one non-whitespace character, and confirm [Submitted At] is set (present, not null). This applies equally to [Pending], [Approved], [Rejected], and [Withdrawn] steps — Invariant 8 covers all states. A step in any state with a blank attribution string or a missing [Submitted At] is a conformance failure under Invariant 8.

3. **Terminal attribution check — Approved, Rejected, and Withdrawn steps.** For every [Approved] step: confirm [Decided By] contains at least one non-whitespace character, confirm [Decided At] is set, and confirm [Decided At] ≥ [Submitted At] (Invariants 6 and 7). For every [Rejected] step: additionally confirm [Decision Reason] contains at least one non-whitespace character (required for [Rejected]; optional for [Approved]). For every [Withdrawn] step: confirm [Withdrawn By] contains at least one non-whitespace character, confirm [Withdrawal Reason] contains at least one non-whitespace character, confirm [Withdrawn At] is set, and confirm [Withdrawn At] ≥ [Submitted At] (Invariants 6 and 7). A terminal step with a blank attribution string, a missing timestamp, an inverted temporal ordering, or a [Rejected] step without a [Decision Reason] is a conformance failure under Invariants 6 and 7. The check covers all three terminal states; an implementation that correctly attributes [Approved] and [Rejected] steps but leaves [Withdrawn] steps without required attribution fields fails this check.

4. **Approver exclusivity check.** Submit a step naming approver A. Attempt [Approve] with [Decided By] set to a different actor B. Confirm the call returns `rejected(unauthorized)`. Confirm the step remains in [Pending] state. Then attempt [Approve] with `decided_by: A`. Confirm the call returns `approved` and the step transitions to [Approved]. Invariant 4 guarantees this; the check verifies it.

5. **Terminal absorption check.** Transition a step to each terminal state ([Approved], [Rejected], [Withdrawn]). Attempt [Approve], [Reject], and [Withdraw] on each terminal step. All calls must return `rejected(not-pending)`. Confirm the step's fields are unchanged after each attempted transition. Invariant 3 guarantees absorption; this check verifies all three terminal states.

6. **Store monotonicity check.** At time `t1`, issue `read({})` (unfiltered) and record the result set S1. Submit one new step and confirm the [Submit] call returned a [Step Id]. At time `t2 > t1`, issue `read({})` again and record result set S2. Confirm every step in S1 appears in S2 by [Step Id] (no step is removed). For each step present in both S1 and S2, confirm the submission fields ([Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [Submitted At], and [Reason] if it was set in S1) are unchanged in S2 — submission fields are immutable per Invariant 1. Decision fields ([Decided By], [Decision Reason], [Decided At]) and withdrawal fields ([Withdrawn By], [Withdrawal Reason], [Withdrawn At]) may newly appear on steps transitioned between t1 and t2; their appearance is conformant with the state machine and is not a monotonicity violation. The state of any step in both sets may legitimately have transitioned from [Pending] to a terminal state; the reverse transition is a conformance failure. The total step count in S2 is ≥ the count in S1.

---

## Edge cases and explicit non-goals

- **Approval Step is not idempotent.** Two [Submit] calls for the same [Subject Ref], [Approver Ref], and [Scope] create two independent steps with distinct [Step Id]s and independent lifecycles. For at-most-once semantics on submission under retry conditions, compose with [Duplicate Prevention](./duplicate-prevention.md).

- **Multiple concurrent steps on the same subject.** A subject may have multiple simultaneous [Pending] steps — one per approval gate. Each is independent; deciding on one does not affect the others (Invariant 9). Whether a multi-gate requirement is satisfied — e.g., both the finance director and the legal director must approve — is a composing concept belonging to the [Multi-Party Approval](../compositions/multi-party-approval.md) composition, not to this atom.

- **Delegation.** The atom enforces that [Decided By] matches [Approver Ref] (Invariant 4). It provides no mechanism for the named approver to delegate their authority to another actor for a bounded period or scope. Delegation is a composing concept: a delegation pattern would produce a new Approval Step with a different [Approver Ref] naming the delegate, or would intercept the [Approve] call with a composing authorization check that permits the delegate to act on behalf of the original approver. Either way, the delegation logic is not in this atom.

- **Decision reversal.** Once a step reaches [Approved], [Rejected], or [Withdrawn], there is no `un-approve`, `un-reject`, or `un-withdraw` action. Terminal absorption is invariant (Invariant 3). If a decision was made in error — the wrong approver, an incomplete review, a subsequently discovered misclassification — the correct response is to [Submit] a new step for the same [Subject Ref] with an explicit reason documenting the relationship to the original step. The original step's record remains in its terminal state as evidence of what happened; the new step produces the corrected decision. This produces a more complete audit trail than reversal would; an auditor can see both the original decision and the correction.

- **Subject validity.** [Subject Ref] is opaque; the atom does not validate it against any external system, document store, or workflow engine. Submitting an approval step for a [Subject Ref] that does not correspond to any real subject creates a step record that names a nonexistent thing. The composing system is responsible for ensuring [Subject Ref] values are valid before calling [Submit].

- **Decision semantics.** The atom records that the named approver approved or rejected the named subject under the named scope. It does not interpret what [Approved] means for the subject — whether the subject may now proceed, what downstream action is triggered, or what the rejection implies for the subject's lifecycle. Those are composing-layer and host-system semantics. An [Approved] step is a fact in the record; what the host system does with that fact belongs to the host system.

- **Access control.** Who may submit steps, who receives notification of pending steps, and who may read them is not defined by this atom. That is the obligation of a composing [Permissions](./permissions.md) pattern. In regulated deployments, submission of approval steps for high-value actions is restricted to authorized process roles; unauthorized submission is a process failure that Permissions governs.

- **Notification.** The atom does not notify the named approver that a step is pending. Notification — delivery of the pending-approval signal to the approver's attention — is a composing concept belonging to the [Notification](./notification.md) atom and the [Notification Fanout](../compositions/notification-fanout.md) composition.

- **Approval of a subject that is in a non-approvable state.** The atom does not validate that the subject is in a state that makes approval meaningful — for example, approving a document that has already been superseded, or approving a transaction that has already been cancelled. [Subject Ref] is opaque; the composing system is responsible for checking subject state before invoking [Approve] or before acting on the approval.

- **Self-approval and segregation of duties.** The atom does not constrain the relationship between [Submitter Ref] and [Approver Ref]. A [Submit] call where both fields name the same actor is accepted; the resulting step is a self-approval where the same actor will be permitted to call [Approve] or [Reject] on the step they themselves submitted. The atom does not reject self-approval at the structural level; enforcement belongs to the policy layer, not to this atom's structure. Segregation-of-duties enforcement — the SOX §404 control that requires the submitter and approver of a financial action to be distinct actors, or the FDA Part 11 expectation that an electronic signature attests to a decision the signer did not also originate — belongs to a composing [Permissions](./permissions.md) pattern (which can reject the [Submit] or [Approve] call when the actor pairing violates a declared segregation policy) and to the [Multi-Party Approval](../compositions/multi-party-approval.md) composition (which can require a second Approval Step with a different [Approver Ref]). The atom records what the calling system submits; the calling system is responsible for the segregation policy.

- **Which approvals are required for a given subject.** The atom records the approval steps that were submitted; it does not declare which steps *should* have been submitted for a given subject, scope, or transaction type. The mapping from a transaction or document type to the set of required approval gates — *"every journal entry above $10K materiality requires a controller approval and a CFO approval"*, *"every protocol deviation requires a PI approval"* — is the calling system's business-rule layer. An SOX or GCP (Good Clinical Practice) auditor asking *"show me every journal entry above the materiality threshold that did not receive controller approval"* cannot answer that question from this atom's records alone: the atom can show every submitted Approval Step and its outcome, but it cannot show subjects for which no step was ever submitted. The composing system must supply the transaction set and the required-gate mapping; this atom supplies the gate records that the composition compares against. This is the same boundary as Invariant 5 in [Selective Disclosure](./selective-disclosure.md): completeness with respect to all events the calling system *should* have produced is an integration obligation, not an atom-level enforcement.

- **Tamper-evidence.** The atom guarantees immutability by specification; it does not cryptographically prevent a store administrator from altering step records. For court-admissible evidence of control operation — the bar under SOX §404 and FDA 21 CFR Part 11 — compose with [Tamper Evidence](./tamper-evidence.md), which provides cryptographic sealing of the step records. Tamper-evident approval records are required in several regulated contexts.

- **Non-repudiation.** The atom records [Decided By] as an opaque reference and enforces that it matches [Approver Ref], but it does not cryptographically bind the deciding actor to the decision in a way that survives disputed-authorship challenges. For non-repudiable approval decisions — the requirement under FDA 21 CFR Part 11 that electronic signatures be uniquely attributable and verifiable — compose with [Actor Identity](./actor-identity.md). The Approval Step is the gate record; Actor Identity provides the electronic signature that binds the named actor to the decision.

- **Clock semantics.** [Submitted At], [Decided At], and [Withdrawn At] default to the receiving node's wall clock when not supplied. [Submitted At] must not be in the future. Backdated [Submitted At] values are accepted — an approval gate is routinely recorded by a workflow bridge after the request was actually made through another channel (email, a meeting, a paper form), and refusing the earlier timestamp would force the record to misstate when the request happened; the future bound rejects the one direction that is always fabrication (a submission claimed for a time that has not yet occurred), while assurance that the record's *creation order* is itself evident — the defense against back-inserted steps — is the contribution of the composing [Audit Trail](../compositions/audit-trail.md) and [Tamper Evidence](./tamper-evidence.md) layer. [Decided At] and [Withdrawn At] must not be in the future and must be ≥ [Submitted At] (enforced at the respective Decision points). Backdated [Decided At] and [Withdrawn At] values are accepted when ≥ [Submitted At] — documenting a decision or withdrawal that was communicated or recognized at an earlier time is valid. Clock skew, timezone normalization, and monotonicity are handled at the deployment layer. Under the Execution Contract's pipeline, the wall-clock reading these defaults and bounds use is the injected `clock_t`, read once at the top of the guard step and shared with the transition ([`execution-contract.md`](../execution-contract.md) §The execution pipeline); "the receiving node's wall clock" names the deployment source of that reading, not an internal clock call inside the guard or transition.

- **Concurrency.** Two systems concurrently calling [Approve] or [Reject] on the same [Step Id] must be serialized. The first succeeds; the second receives [Not Pending]. Similarly, concurrent calls to [Withdraw] on the same [Step Id] are serialized. Implementations must serialize state transitions on a given [Step Id].

- **Atomicity and crash semantics.** Each terminal transition ([Approve], [Reject], [Withdraw]) writes multiple fields simultaneously: [State], an attribution field ([Decided By] or [Withdrawn By]), a timestamp ([Decided At] or [Withdrawn At]), and for [Reject] and [Withdraw] a reason field. A crash mid-transition that sets some fields without others would violate Invariant 6 (decision attribution is complete for terminal steps). The implementor is responsible for the transactional boundary that makes all fields in a single terminal transition change together. The spec does not define recovery semantics for partial writes; implementations must provide atomic transaction support or a crash-recovery scan that detects and repairs partial transitions on restart. [Storage Failure] is the observable signal of an aborted transition; per the step store durability guarantee, a [Storage Failure] response leaves the step in its prior state ([Pending]) with no partial attribution written.

- **Indeterminate storage outcomes.** The [Storage Failure] guarantees above are store-side: the store either committed a transition or it did not, and a [Storage Failure] response means it did not. The *caller's* knowledge can be weaker — a transport failure after the store committed (a lost response) leaves the caller unable to distinguish "rejected, nothing written" from "succeeded, response lost." A caller that receives no response, or a transport-level error rather than this atom's [Storage Failure] token, must treat the outcome as indeterminate and re-query before retrying. Retrying [Submit] after an indeterminate outcome can create a duplicate step (submission is not idempotent); compose with [Duplicate Prevention](./duplicate-prevention.md) for at-most-once submission under retry. Retrying a resolving action is self-detecting: if the original call actually committed, the retry is rejected [Not Pending] and `read({step_id: X})` shows the landed decision.

- **Multi-party approval and quorum.** When an action requires N approvals from a designated set of approvers — all-of-N, threshold-of-N, one-of-N — each required approval is modeled as a separate Approval Step instance. The quorum (the minimum number of approvals required for a decision to be valid) rule (how many [Approved] steps constitute sufficient authorization) belongs to the [Multi-Party Approval](../compositions/multi-party-approval.md) composition. This atom specifies the single gate; the composition specifies the chain.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Approval Step

The record this atom defines: a single authorization gate binding a required approval to one named approver, for a specified subject and scope, with a lifecycle from submission through one terminal decision. It carries its [Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [Submitted At], [Reason], the [State] field, and the state-specific decision/withdrawal fields; the submission fields are immutable from creation. A fresh approval need is a new Approval Step, never a re-opened one.

Kind: Type

#### Submit

The behavior that records a new approval gate. It assigns a fresh [Step Id], records [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [Reason] (if supplied), and [Submitted At], enters the step in [Pending], and returns the [Step Id] (or a rejection naming the failed precondition).

Kind: Operation

#### Approve

The resolving behavior the named approver invokes to record the affirmative decision and move a [Pending] step to [Approved]. Permitted only when [Decided By] matches [Approver Ref]; it stamps [Decided By], [Decision Reason] (optional for an approval), and [Decided At]. On an already-terminal step it is rejected [Not Pending]; from any other actor it is rejected [Unauthorized].

Kind: Operation

#### Reject

The resolving behavior the named approver invokes to record the negative decision and move a [Pending] step to [Rejected]. Requires a stated reason. Permitted only when [Decided By] matches [Approver Ref]; it stamps [Decided By], [Decision Reason], and [Decided At]. Its success token is `rejected_outcome`, distinct from the action's own rejection path. On an already-terminal step it is rejected [Not Pending]; from any other actor it is rejected [Unauthorized].

Kind: Operation

#### Withdraw

The resolving behavior the submitter invokes to retract a request and move a [Pending] step to [Withdrawn]. Requires a stated reason. Permitted only when [Withdrawn By] matches [Submitter Ref]; it stamps [Withdrawn By], [Withdrawal Reason], and [Withdrawn At]. On an already-terminal step it is rejected [Not Pending]; from any actor other than the submitter it is rejected [Unauthorized].

Kind: Operation

#### Read

The read-only behavior that returns the steps matching a [Query], ordered by [Submitted At] ascending with [Step Id] as a lexicographic-byte-order tiebreaker. A well-formed [Query] matching no steps returns an empty sequence; a malformed one is rejected [Invalid Query]. It changes nothing.

Kind: Operation

#### Step Id

The opaque, immutable, system-generated identity of an approval step, assigned on [Submit], never reused or reassigned within the store instance. It must be a non-empty string sortable in lexicographic byte-order (for deterministic [Read] ordering). The subject, approver, scope, submitter, reason, and timestamps are properties of the step, not its identity.

Kind:     Field
Field of: Approval Step
Projects: step_id

#### Subject Ref

The opaque reference to the thing being approved — a document, transaction, work item, or protocol-deviation id. Set on [Submit], immutable thereafter. The atom does not validate that the subject exists or is in any particular state; that is the caller's responsibility.

Kind:     Field
Field of: Approval Step
Projects: subject_ref

#### Approver Ref

The opaque reference to the actor required to approve. Set on [Submit], immutable. It is the authorization anchor: only the actor whose reference matches it may [Approve] or [Reject] the step (Invariant 4). Delegation is a composing concept, not a property of this atom.

Kind:     Field
Field of: Approval Step
Projects: approver_ref

#### Submitter Ref

The opaque reference to the actor submitting the approval request. Set on [Submit], immutable. It is the attribution anchor for the submission and the authorization anchor for [Withdraw]: only the actor whose reference matches it may withdraw the step (Invariant 5).

Kind:     Field
Field of: Approval Step
Projects: submitter_ref

#### Scope

The non-empty string naming the kind of approval being requested (for example `"financial:journal-entry:post"`). Set on [Submit], immutable. The atom does not interpret scope semantics; it records the scope as an auditable field and uses it as an exact-match filter axis for [Read].

Kind:     Field
Field of: Approval Step
Projects: scope

#### Reason

The optional submission-context string supplied at [Submit] — a description of what is being approved, the underlying business rule, or a summary of the deviation. Stored under its own name; immutable thereafter. Its absence is valid; if supplied it must contain at least one non-whitespace character. (Distinct from the [Decision Reason] and [Withdrawal Reason] fields the resolving actions write.)

Kind:     Field
Field of: Approval Step
Projects: reason

#### Submitted At

The timestamp at which the step was submitted, set on [Submit] (caller-supplied or wall-clock-defaulted; must not be in the future). Immutable. It is the lower bound the temporal-ordering invariant measures decision and withdrawal timestamps against (Invariant 7).

Kind:     Field
Field of: Approval Step
Projects: submitted_at

#### State

The field holding the step's current state — one of [Pending], [Approved], [Rejected], or [Withdrawn]. Set to [Pending] on [Submit]; transitions once to a terminal via [Approve], [Reject], or [Withdraw], then never changes (Invariants 2 and 3).

Kind:     Field
Field of: Approval Step
Projects: state

#### Decided By

The opaque reference to the actor who decided, stamped on [Approve] or [Reject]. Present on [Approved] and [Rejected] steps; immutable once set. It must match [Approver Ref] for the decision to be accepted (Invariant 4) and must contain at least one non-whitespace character (Invariant 6).

Kind:     Field
Field of: Approval Step
Projects: decided_by

#### Decision Reason

The stated reason recorded with a decision, stamped on [Approve] or [Reject]. Required on a [Rejected] step (Invariant 6); optional on an [Approved] step. Present on [Approved] and [Rejected] steps only; immutable once set.

Kind:     Field
Field of: Approval Step
Projects: decision_reason

#### Decided At

The timestamp at which the decision was recorded, stamped on [Approve] or [Reject] (caller-supplied or wall-clock-defaulted; must not be in the future). Present on [Approved] and [Rejected] steps; immutable once set. [Decided At] ≥ [Submitted At] always holds (Invariant 7).

Kind:     Field
Field of: Approval Step
Projects: decided_at

#### Withdrawn By

The opaque reference to the actor who withdrew the request, stamped on [Withdraw]. Present on [Withdrawn] steps; immutable once set. It must match [Submitter Ref] for the withdrawal to be accepted (Invariant 5) and must contain at least one non-whitespace character (Invariant 6).

Kind:     Field
Field of: Approval Step
Projects: withdrawn_by

#### Withdrawal Reason

The stated reason recorded with a withdrawal, stamped on [Withdraw]. Required (Invariant 6). Present on [Withdrawn] steps only; immutable once set.

Kind:     Field
Field of: Approval Step
Projects: withdrawal_reason

#### Withdrawn At

The timestamp at which the withdrawal was recorded, stamped on [Withdraw] (caller-supplied or wall-clock-defaulted; must not be in the future). Present on [Withdrawn] steps; immutable once set. [Withdrawn At] ≥ [Submitted At] always holds (Invariant 7).

Kind:     Field
Field of: Approval Step
Projects: withdrawn_at

#### Query

The selection a caller passes to [Read] to scope which steps are returned — any combination of the supported filter axes ([Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [State], and time ranges on the timestamp fields). Consumed per call; never stored.

Kind:         Parameter
Parameter of: Read
Projects:     query

#### Pending

The single non-terminal state: the approval gate is open and no terminal decision has been made. The lifecycle proceeds [Pending] → one of {[Approved], [Rejected], [Withdrawn]}. It is also the `state` filter value queried for outstanding gates on a subject.

Kind:      Member
Member of: the step state
Role:      Outcome
Projects:  pending

#### Approved

The terminal state a step reaches when the named approver affirmatively decided within [Approve]. Carries all submission fields plus [Decided By], [Decision Reason] (if supplied), and [Decided At]. Absorbing: no action transitions it elsewhere. It is also the [Approve] success token and a `state` filter value.

Kind:      Member
Member of: the step state
Role:      Outcome
Projects:  approved

#### Rejected

The terminal state a step reaches when the named approver negatively decided within [Reject]. Carries all submission fields plus [Decided By], [Decision Reason] (required), and [Decided At]. Absorbing. As a `state` filter value its wire form is `rejected`; the [Reject] success token is the distinct `rejected_outcome`, kept verbatim in the projected contract.

Kind:      Member
Member of: the step state
Role:      Outcome
Projects:  rejected

#### Withdrawn

The terminal state a step reaches when the submitter retracted the request within [Withdraw]. Carries all submission fields plus [Withdrawn By], [Withdrawal Reason], and [Withdrawn At]. Absorbing. It is also the [Withdraw] success token and a `state` filter value.

Kind:      Member
Member of: the step state
Role:      Outcome
Projects:  withdrawn

#### Invalid Request

The rejection a write action ([Submit], [Approve], [Reject], [Withdraw]) returns when an input is malformed — a blank required field, a malformed [Step Id], a missing-reason [Reject]/[Withdraw], a future or backdated-before-[Submitted At] timestamp. A guard rejection that writes nothing.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-request

#### Not Known

The rejection a resolving action ([Approve], [Reject], [Withdraw]) returns when the supplied [Step Id] is well-formed but references no step in the store. Checked after the malformed-[Step Id] guard and before the state check.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Not Pending

The rejection a resolving action returns when the referenced step is already terminal — [Approved], [Rejected], or [Withdrawn]. It is the structural expression of terminal absorption (Invariant 3): no further transition is admitted.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-pending

#### Unauthorized

The rejection a resolving action returns when the deciding actor is not the authorized one — [Decided By] not matching [Approver Ref] on [Approve]/[Reject], or [Withdrawn By] not matching [Submitter Ref] on [Withdraw]. The record is left [Pending] and nothing is written (Invariants 4 and 5).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  unauthorized

#### Storage Failure

The rejection any write action returns when the underlying store write fails after all preconditions pass. No [Step Id] is issued on [Submit]; a resolving action leaves the step in [Pending]. The caller must retry.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Invalid Query

The rejection [Read] returns when a filter is malformed — a blank string-axis value, a [State] value outside the four states, a time range with end before start, or an unrecognized filter key (rejected rather than silently ignored).

Kind:      Member
Member of: the Read rejection
Role:      Outcome
Projects:  invalid-query

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Approval Step]: #approval-step
[Submit]: #submit
[Approve]: #approve
[Reject]: #reject
[Withdraw]: #withdraw
[Read]: #read
[Step Id]: #step-id
[Subject Ref]: #subject-ref
[Approver Ref]: #approver-ref
[Submitter Ref]: #submitter-ref
[Scope]: #scope
[Reason]: #reason
[Submitted At]: #submitted-at
[State]: #state
[Decided By]: #decided-by
[Decision Reason]: #decision-reason
[Decided At]: #decided-at
[Withdrawn By]: #withdrawn-by
[Withdrawal Reason]: #withdrawal-reason
[Withdrawn At]: #withdrawn-at
[Query]: #query
[Pending]: #pending
[Approved]: #approved
[Rejected]: #rejected
[Withdrawn]: #withdrawn
[Invalid Request]: #invalid-request
[Not Known]: #not-known
[Not Pending]: #not-pending
[Unauthorized]: #unauthorized
[Storage Failure]: #storage-failure
[Invalid Query]: #invalid-query

---

## Composition notes

Approval Step is the approval-gate primitive that Multi-Party Approval and Execute Gated Workflow compose from:

- **[Permissions](./permissions.md)** — governs who may submit approval steps, who may read them, and (in conjunction with Actor Identity) who is authorized to hold the [Approver Ref] role for a given scope. In a conforming SOX deployment, the Permissions atom confirms that the actor calling [Submit] holds the required permission to initiate approval gates for the given scope, and that the named [Approver Ref] holds the permission to approve that scope.
- **[Assignment](./assignment.md)** — Approval Step and Assignment are composing peers, not overlapping concepts. Assignment tracks who owns the work; Approval Step records the gate decision. In multi-actor workflows, an assigned actor may produce the artifact that is then submitted for approval. The two atoms often appear together in the same workflow step.
- **[Actor Identity](./actor-identity.md)** — provides the electronic signature that binds the named approver to the decision. [Decided By] in the Approval Step record is an opaque reference; Actor Identity is the contract that makes that reference non-repudiable. For FDA 21 CFR Part 11 and SOX §404, the Actor Identity attestation is the signature event; the Approval Step is the gate record the signature attaches to.
- **[Event Log](./event-log.md)** — every [Submit], [Approve], [Reject], and [Withdraw] action is an auditable event. Event Log provides the full state-transition journal; the Approval Step record is the current-state projection. The composing [Audit Trail](../compositions/audit-trail.md) wires Event Log with Actor Identity, Retention Window, and Tamper Evidence into the structure SOX and Part 11 require.
- **[Audit Trail](../compositions/audit-trail.md)** — the canonical regulated-audit stack that provides tamper-evident, attributed, retention-governed records of every approval step lifecycle event.
- **[Tamper Evidence](./tamper-evidence.md)** — seals approval step records against post-hoc modification. Court-admissible approval records require cryptographic integrity guarantees beyond this atom's spec-level immutability. Required under FDA 21 CFR Part 11 for electronic signature records.
- **[Duplicate Prevention](./duplicate-prevention.md)** — for at-most-once semantics on step submission under retry conditions.
- **[Multi-Party Approval](../compositions/multi-party-approval.md)** — wires N Approval Step instances under a named quorum rule (all-of-N, M-of-N, one-of-N) into a single auditable chain, layered on Permissions (chain-level authorization), Assignment (in-tray binding per pending step), and Audit Trail (regulated-audit substrate). This atom is the per-gate primitive; the composition is the chain. The composition's quorum-evaluation rule is the load-bearing wiring decision; the composition's Generation acceptance names what an auditor can and cannot clear from the chain records alone.
- **[State Machine](./state-machine.md)** — the general-purpose state machine engine. Approval Step is a specific kind of state machine with fixed states and approval-specific semantics; State Machine is the general case with deployment-declared states and transitions. The two are the fixed-state and general-declared poles of the `workflow/` category and compose into Execute Gated Workflow.
- **[Execute Gated Workflow](../compositions/execute-gated-workflow.md)** — wires State Machine + Approval Step + Permissions + Assignment + Audit Trail (substrate) into multi-actor gated workflows with tamper-evident transition histories. This is the composition where Approval Steps gate declared workflow transitions: a guarded transition fires only when its bound Approval Step is in Approved.

---

## Standards references

- **Sarbanes-Oxley §404 (17 U.S.C. §7262)** — internal control over financial reporting. The approval step is the structural form of a financial reporting control: a gate that must be cleared before a material action proceeds, with an auditable record of who cleared it. SOX auditors reviewing control evidence query approval step records directly; Invariants 4, 6, and 8 are the structural guarantees the evidence must carry.
- **FDA 21 CFR Part 11 (Electronic Records; Electronic Signatures)** — for FDA-regulated contexts (pharmaceutical manufacturing, clinical trials, medical device quality systems): each approval step by a named actor constitutes an electronic signature on the action. Part 11 §11.50 requires that electronic signatures are attributable to one individual and §11.70 requires that they are linked to their respective records to prevent removal, substitution, or falsification. Composition with [Actor Identity](./actor-identity.md) provides the cryptographic binding; composition with [Tamper Evidence](./tamper-evidence.md) provides the linking and non-falsifiability. The Approval Step record is the gate; the composition is the compliant electronic signature system.
- **ICH (International Council for Harmonisation of Technical Requirements for Pharmaceuticals for Human Use) E6(R3) Good Clinical Practice — Guideline** — the international standard for clinical trial conduct. Section 4 (Investigator's Responsibilities) and Section 5 (Sponsor's Responsibilities) require documented approval steps at multiple points in the trial lifecycle: investigator approval of protocol deviations, IRB (Institutional Review Board) approval of informed consent amendments, sponsor approval of site qualification assessments. Each maps to an Approval Step record whose [Scope] identifies the specific GCP obligation.
- **ISO 9001:2015 §8.5.1 (Control of production and service provision)** — the International Organization for Standardization's quality-management standard; requires that production and service provision activities be controlled by documented procedures including approval of documents, products, and services at defined points. Approval steps are the documented approval records §8.5.1 anticipates; the atom's immutability invariants satisfy the document control requirements.
- **ISO 13485:2016 §4.2 (Documentation requirements)** — for medical device manufacturers: records of approval activities must be maintained. Approval Step records are the compliant implementation surface.

---

## Status

`grounded on Final Critique 5 — 2026-07-12` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 5 — 2026-07-12
formal: verified — approval-step.tla + 1 twin, 2026-06-03
last gate: 2026-07-12 — Final Critique 5, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/approval-step.md`.
