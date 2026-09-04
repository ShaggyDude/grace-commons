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

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes — SUPERSEDED by the Ledger and Decisions above; deleted with every other Lineage in the migration's closing commit</h2>
</summary>

Regulated atom. Conventions — *Regulated adversarial scenarios* and *Generation acceptance* — inherited from the methodology directly ([`pressure-testing.md`](../pressure-testing.md)), baked in from the first draft. Legal Hold is the reference shape for regulated atoms with two-terminal-to-three-terminal state machine expansion; Provisional Commitment is the reference for multi-terminal-state lifecycle specification. Category `workflow` is new; this atom opens it.

**Pass 1 — Structural completeness (GRID).** Five findings, all closed in-pattern.

- *Store instance model absent.* Initial draft referenced "the approval store" without defining instance topology. Parallel finding to Legal Hold and every atom composing against a store. Fixed: *Store instance model* subsection added, mirroring Legal Hold. `step_id` uniqueness scoped to instance; `subject_ref` noted as scoped to the host system; instance selection named as deployment-routing concern.

- *`reject` action return token collision.* The initial draft returned `rejected` from a successful `reject` action — the same token used by all actions' error paths. A caller could not distinguish "the step was rejected (by the approver)" from "the `reject` call itself was rejected (e.g., `not-known`)." Fixed: the successful `reject` return is renamed `rejected_outcome` throughout. Decision points and Outputs updated to reflect the distinction.

- *`read` ordering and filter semantics not defined.* The initial `read` action had no stated ordering, no specification of which filter axes are supported, no `invalid-query` conditions, and no statement for an empty result. Fixed: `read` action description updated to specify `submitted_at` ascending ordering with `step_id` as tiebreaker, enumerate valid filter axes, name `invalid-query` conditions, state that a well-formed query matching no steps returns an empty sequence, and generalize the timestamp-absent-field rule for all filter axes rather than enumerating individual combinations.

- *Outputs section under-specified.* Initial draft listed only the action return tokens without enumerating which fields are present on which state of step record. Fixed: Outputs now explicitly names core fields present on every step, optional field `reason` as independent of state, and state-specific fields for each terminal state, parallel to Legal Hold's field listing.

- *`withdraw` action absent from Inputs and Action signatures.* The initial intent named Withdrawn as a state but no action signature for `withdraw` appeared in Inputs. Fixed: `withdraw` added to Inputs and Actions with full signature, Decision point, and rejection priority.

All nine GRID nodes resolved.

**Pass 2 — Conceptual independence (EOS).** Clean. Four extraction candidates evaluated; all kept in-pattern.

- *`scope` as over-absorption candidate.* Could `scope` imply that scope-type classification or policy management belongs in-atom? Evaluated: `scope` is an opaque string — the atom does not interpret it, does not import scope semantics, and does not name any scope-management pattern in its specification. Parallel to `case_ref` in Legal Hold and `policy_ref` in Retention Window. The atom records that an approval step covers a named scope; it does not model the scope taxonomy. Clean.

- *Delegation as a hidden state.* Could the need for delegation mean the atom is missing a Delegated state where a different actor is authorized to decide? Evaluated: delegation is a composing concern. Adding a Delegated state would require the atom to model delegation authority, delegation scope, delegation duration, and possibly nested delegation — concerns that belong to a delegation pattern composing with Permissions, not to this atom. The two-actor model (approver-decides, submitter-withdraws) is the correct EOS design for this atom. Clean.

- *Notification as an absorbed trigger.* Could the atom absorb a notification trigger on `submit` to alert the named approver? Evaluated: notification delivery belongs to the Notification atom. Absorbing it would make this atom depend on a messaging concern, breaking freestanding status. The atom records that a step is Pending; any notification of the pending step is the composing layer's responsibility. Clean.

- *Quorum logic as a hidden multi-party mechanism.* Could tracking multiple steps against the same subject imply the atom should enforce quorum? Evaluated: no. The atom records individual steps; whether a set of approved steps constitutes sufficient authorization for a multi-party requirement is the composing layer's concern (Multi-Party Approval). The atom does not count approvals or evaluate quorum. Clean.

**Pass 3 — Adversarial scrutiny (Linus mode).** Twelve findings, all closed in-pattern.

- *Identity model implicit on `approver_ref` and `submitter_ref` authorization checks.* The initial draft named `decided_by` and `withdrawn_by` as attribution fields without specifying that these must match the immutable `approver_ref` and `submitter_ref` respectively, or what happens when they don't. An implementor could have accepted any well-formed actor reference. Fixed: `unauthorized` added as an explicit rejection reason on `approve`, `reject`, and `withdraw`; Invariants 4 and 5 named descriptively and explicitly; Decision points updated with rejection priority placing the identity check after the attribution/temporal checks but before `storage-failure`.

- *Rejection priority absent from all action Decision points.* Initial Decision points described checks but did not state the order in which multiple failing conditions are evaluated. A caller receiving one rejection reason when multiple conditions fail cannot know which condition to fix first. Fixed: explicit rejection priority added to `approve`, `reject`, `withdraw`, and `read` decision points, mirroring Legal Hold's pattern. Priority: malformed `step_id` → `not-known` → `not-pending` → attribution/temporal → `unauthorized` → `storage-failure`.

- *"Supplied" semantics undefined for optional parameters.* `submitted_at?`, `decided_at?`, and `withdrawn_at?` said "wall clock if not supplied" but did not define what counts as "not supplied." Fixed: a definition statement added before the action list, mirroring Legal Hold. For optional parameters, "supplied" means provided as a parseable value of the declared type; null, missing, and empty (or whitespace-only) are equivalent to "not supplied" and the default applies.

- *Resolved-timestamp enforcement qualified as "if supplied."* The initial draft checked temporal ordering only on caller-supplied timestamp values. A wall-clock-defaulted `decided_at` on a clock-skewed node could yield a value < `submitted_at`, writing a decided step that violates Invariant 7 while the action accepts it. Fixed: `approve`, `reject`, and `withdraw` action descriptions and Decision points now require the ordering bound be enforced against the **resolved** value, regardless of whether it was caller-supplied or wall-clock-defaulted. Invariant 7 statement specifies that constraints apply to persisted values and that enforcement is at the Decision point against the resolved value.

- *"Non-empty" and "set" terminology drift.* Initial invariants used "non-empty" for both string fields and timestamp fields. Fixed: invariants split by field type — string fields require "at least one non-whitespace character"; timestamp fields require "set." This matches the Decision point and action signature wording throughout.

- *`reject` success token collision with action rejection.* Described above as a Pass 1 finding. Surfaced again adversarially: a reader of the `reject` action signature `reject(...) → rejected | rejected(...)` cannot distinguish the two `rejected` tokens from the action description alone. Pass 1 fix confirmed correct; Pass 3 verified the rename to `rejected_outcome` resolves the ambiguity cleanly.

- *Decision reason optionality inconsistency.* The initial draft made `reason` optional on both `approve` and `reject`. A Rejected step without a stated reason is an auditable record gap — the named approver decided negatively but left no explanation, defeating the corrective action audit trail and the Part 11 requirement for signature meaning. Fixed: `reason` is optional on `approve` (an approval can be self-evident from the record), required on `reject`. Invariant 6 reflects the distinction; the `reject` action signature and Decision point state it explicitly.

- *Intent over-claimed "from the records alone" without naming Tamper Evidence.* The initial Intent paragraphs asserted that approval records could be audited from the records alone, without qualifying that cryptographic protection against post-hoc modification requires Tamper Evidence composition. Fixed: Intent paragraph updated to claim immutability by specification and to name Tamper Evidence as the composition that adds cryptographic protection for court-admissible evidence, parallel to Legal Hold's Intent.

- *`read` unknown filter key behavior unstated.* The initial `read` description listed supported filter axes but did not say what happened if a caller passed an unknown axis. Fixed: `read` action and Decision point now state explicitly that unknown filter keys are `invalid-query` rather than silently ignored, and state the rationale (silent ignore would return a result set inconsistent with the caller's intent). Mirroring Legal Hold.

- *`read` timestamp-absent-field rule enumerated for one case only.* The initial draft stated the rule for `decided_at` filtering but not for `withdrawn_at` filtering. Fixed: `read` action now states the general rule — a time range filter on a timestamp field implicitly excludes states that do not carry that field — rather than enumerating individual combinations, then gives `decided_at` and `withdrawn_at` as examples. The Decision point mirrors this generalization.

- *Concurrency on the same `step_id` not addressed.* Two systems concurrently calling `approve` on the same Pending `step_id` could race; without serialization, both might succeed, producing two Approved records for one step. Fixed: Edge case *Concurrency* added, naming that implementations must serialize state transitions on a given `step_id`.

- *Three terminal states not explicitly named as absorbing in a single invariant.* Initial draft's Invariant 3 said "terminal" without enumerating all three terminal states. Fixed: Invariant 3 rewritten to explicitly name all three terminal states (Approved, Rejected, Withdrawn) as absorbing, mirroring Legal Hold's Invariant 3 structure.

**Round 2 — AI-conducted adversarial round (claude-sonnet-4-6, independent re-run). 2026-05-13.** Four findings, all closed in-pattern. Round 2 re-ran all three passes with no authoring bias and no recourse to the foundation round's rationales beyond what the spec itself states.

**Pass 1 — GRID structural.** All nine GRID nodes verified against the written spec. No new structural gaps found. All cross-references within nodes are intact and consistent. The State section enumerates all four states with correct transition semantics; the Proof (Generation acceptance) section has six numbered checks.

**Pass 2 — EOS conceptual independence.** All four extraction candidates from the foundation round re-evaluated independently. All conclusions confirmed: delegation, notification, quorum, and scope taxonomy are correctly excluded as composing concerns. No new extraction candidates identified.

**Pass 3 — Adversarial scrutiny (Linus mode).** Four findings, all closed in-pattern.

- *Generation acceptance check 3 did not cover Withdrawn step attribution.* The check was titled "Decision attribution check — Approved and Rejected steps" and verified `decided_by`, `decided_at`, and `decided_at ≥ submitted_at` for Approved and Rejected steps, and `decision_reason` for Rejected steps. Invariant 6's third sub-clause — Withdrawn steps must carry `withdrawn_by` (at least one non-whitespace character), `withdrawal_reason` (at least one non-whitespace character), and `withdrawn_at` (set) — was tested by no generation acceptance check. An auditor running all six checks against a conforming implementation would verify submission attribution for all states and decision attribution for Approved and Rejected steps, but would leave Withdrawn step attribution unverified. Fixed: check 3 renamed to "Terminal attribution check — Approved, Rejected, and Withdrawn steps" and extended to include the Withdrawn case: `withdrawn_by` non-whitespace, `withdrawal_reason` non-whitespace, `withdrawn_at` set. The closing sentence of the check explicitly names the asymmetric failure mode — an implementation that correctly attributes decided steps but leaves Withdrawn steps unattributed.

- *Generation acceptance check 3 verified Invariant 7 for decided steps only.* Invariant 7 covers two bounds: `decided_at ≥ submitted_at` for Approved and Rejected steps, and `withdrawn_at ≥ submitted_at` for Withdrawn steps. The prior check 3 verified only the first bound; the `withdrawn_at ≥ submitted_at` bound was tested by no check. Fixed: check 3 (now the terminal attribution check) includes `withdrawn_at ≥ submitted_at` for every Withdrawn step. Both sub-clauses of Invariant 7 are now auditor-clearable from the records alone.

- *Regulated adversarial scenario 1 asserted a Pending-step check without showing the query.* The scenario stated "The auditor also checks for any steps in Pending that fall within the scope and period, verifying no steps were left unresolved" — but did not show the query form that performs this check. An external auditor following the scenario as a procedural script would know a check is expected but not how to execute it. Fixed: the query `read({scope: "financial:journal-entry:post", state: Pending, submitted_at: {after: ..., before: ...}})` added inline, with a statement of what a non-empty result signifies (at least one gate submitted but never decided — a control gap the auditor would surface).

- *`submit` Decision point used implicit rather than explicit rejection priority.* All three mutating actions — `approve`, `reject`, `withdraw` — end their Decision point entries with an explicit "Rejection priority: X → Y → Z" statement. `submit` stated preconditions inline and named `storage-failure` as the last-resort rejection, but did not carry the explicit rejection-priority line the other actions do. An implementor reading across all four Decision points would see inconsistent format. Fixed: `submit` Decision point updated to add "Rejection priority: field-validation (`invalid-request`) → `storage-failure`" and to qualify the `submitted_at` future-timestamp violation explicitly as `invalid-request`, consistent with the other actions.

**Round 3 — AI-conducted adversarial round (claude-opus-4-7, Torvalds posture, independent re-run). 2026-05-13.** Six findings, all closed in-pattern. Round 3 re-ran all three passes with fresh-reader discipline and no authoring sentiment toward the atom.

**Pass 1 — GRID structural.** One finding, closed in-pattern.

- *TLDR state count off-by-one.* The opening paragraph said "Three states — Pending, Approved, Rejected, Withdrawn." Four states are listed; the sentence claims three. The downstream sentence ("All three terminal states are absorbing") is correct under the interpretation that "Three" was meant to qualify "terminal," but as written the count is wrong and any reader new to the atom hits a contradiction in the first paragraph. Round 1 and Round 2 Pass 1 both missed it. Fixed: TLDR rewritten to name the four states explicitly — Pending (the initial state) plus three terminal states (Approved, Rejected, Withdrawn) — and to add the corresponding statement that the submitter is the sole actor authorized to transition Pending to Withdrawn (previously stated only in Invariant 5 and Decision points, not in the TLDR). The "Three terminal states absorbing" claim is preserved unchanged.

**Pass 2 — EOS conceptual independence.** Clean. The four foundation extraction candidates (delegation, notification, quorum, scope taxonomy) re-evaluated without recourse to prior conclusions; all four conclusions confirmed. Two new candidates considered and excluded:

- *Required-gate mapping as an absorbed concern.* Could the atom absorb a declaration of which subjects require approval gates? Evaluated: no. A required-gate mapping is a policy concept tied to subject types, materiality thresholds, and regulatory regimes; it has its own state (which subjects-by-attribute must produce gates), its own update lifecycle, and it composes with this atom rather than belonging to it. Pass 3 below names the mapping as an explicit out-of-scope.
- *Segregation-of-duties enforcement as an absorbed concern.* Could the atom enforce that `submitter_ref` and `approver_ref` are distinct? Evaluated: no. SoD is a policy declaration whose granularity (same actor, same role, same department, same legal-entity-of-record) is calling-system-specific and cannot be settled at atom level. It is named below as a composing concern; the atom's job is to record what was submitted, not to police the actor pairing.

**Pass 3 — Adversarial scrutiny (Linus mode).** Five findings, all closed in-pattern.

- *Generation acceptance check 1 overclaimed "from records alone."* Check 1 required an auditor to verify that every issued `step_id` is present in the store. In production, an auditor reading only the records cannot enumerate all issued `step_id` values without the original `submit` responses. The check is valid in test and audit-with-runtime environments but not in pure records-alone production audit contexts. Selective Disclosure's Round 2 Pass 3 closed the parallel finding on its own check 1; Approval Step had not been updated. Fixed: check 1 now scopes itself to test and audit-with-runtime environments where `submit` return values are observable, and directs production audit to check 6 (store monotonicity) for the records-alone equivalent assurance covering Invariant 10.

- *`read` time-range sub-keys `after` and `before` used in scenarios without formal definition.* Regulated adversarial scenarios used `submitted_at: {after: ..., before: ...}` query forms and `decided_at: {after: ..., before: ...}` query forms as if `after` and `before` were formally defined sub-keys of the time-range filter. They were not defined anywhere in the action description. Selective Disclosure's Round 2 Pass 3 closed the parallel finding; Approval Step had not been updated. Fixed: `read` action description formally specifies `after` and `before` as optional sub-keys of any time-range filter (`submitted_at`, `decided_at`, `withdrawn_at`), with closed-interval (inclusive) semantics on both bounds, and names that filter keys are flat strings, not dot-notation paths.

- *Self-approval and segregation of duties unaddressed.* The atom places no constraint on the relationship between `submitter_ref` and `approver_ref`. A self-approval — same actor as both submitter and approver — is structurally accepted. SOX §404 segregation-of-duties controls and Part 11 expectations about signer independence are violated by self-approval in many regulated contexts. The atom never named this as a composing concern, leaving an implementor without guidance on where the enforcement belongs. Fixed: an Edge case added naming self-approval as accepted by the atom and segregation-of-duties enforcement as a composing concern belonging to Permissions (actor-pairing rejection at submit/approve time) and to Multi-Party Approval (requiring a second step with a different approver). The atom's role — record what the calling system submits — is preserved as the load-bearing boundary.

- *Required-approvals-per-subject mapping not named as out-of-scope.* The Regulated adversarial scenarios suggested an SOX auditor could query *"every journal entry above the materiality threshold during Q1 that was approved"* — but never said what the auditor cannot answer from this atom: *"every journal entry above the materiality threshold that did not receive controller approval."* The atom records steps that were submitted; subjects that should have had a step but never did are invisible to the atom. The mapping from subject/scope/transaction-type to required-gate set is the calling system's business rule layer, not the atom's. Fixed: an Edge case added naming the required-gate mapping as an integration obligation, drawing an explicit parallel to Selective Disclosure's Invariant 5 (no-disclosure-unrecorded) so the boundary is named once and re-cited. Generation acceptance is unaffected — it never claimed to cover this surface — but the gap is now named where an auditor or implementor will see it.

- *Lineage entries to date did not address whether check 4 and check 5 require runtime exercise versus records-alone reading.* Both checks ("Approver exclusivity check" and "Terminal absorption check") read as records-alone audits but in fact require the auditor to issue `approve` / `reject` / `withdraw` calls against the runtime and observe the rejection outcomes. This is consistent with the convention in Generation acceptance across the library — *"any code generated from this atom must produce records and a runtime surface that pass the following checks"* — but a Linus-posture reader might flag the inconsistency between "from the records alone" and tests that require operating on the runtime. Round 3 confirms the convention is held correctly: the records-alone framing applies to read-driven checks (2, 3, 6) while operational checks (1 in its test-environment form, 4, 5) exercise the runtime surface that the records are produced by. No fix required; the convention is sound. Recorded here so that future Round-N reviewers do not re-surface it as a finding.

**Scheduled rescan: 2026-05-20.** One refining finding; closed in-pattern.

- *Terminal transition crash atomicity unnamed (Pass 3).* `approve`, `reject`, and `withdraw` each write multiple fields simultaneously (state, attribution field, timestamp, and for reject/withdraw a reason field). A crash mid-transition violates Invariant 6. Clinical Observation and Notification both carry explicit atomicity edge cases; Approval Step had a Concurrency edge case (serialization) but no crash-semantics edge case. Resolved: Edge case *Atomicity and crash semantics* added, naming the multi-field write requirement and the implementation obligation for transactional atomicity or crash-recovery logic. `storage-failure` is identified as the signal of an aborted transition that leaves the step in Pending with no partial attribution written.

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 4 (approver exclusivity), Invariant 5 (submitter exclusivity), and Invariant 9 (concurrent step independence) are authorization-under-concurrency / interleaving-safety claims. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`approval-step.tla`](./approval-step.tla) + config [`approval-step.cfg`](./approval-step.cfg), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* two steps with fixed approver/submitter bindings and a set of candidate actors; every decision action quantifies over ALL actors so the model would expose any actor able to decide who should not be. The load-bearing **Invariant 4** (approver exclusivity — only `approver_ref` may approve/reject) and **Invariant 5** (submitter exclusivity — only `submitter_ref` may withdraw) under every interleaving. Exhaustive: 16 states, hold. **Invariant 3** (terminal absorption) is enforced by construction (every action guards `state[s] = Pending`); **Invariant 9** (concurrent step independence) is modeled by the frame — each action's `EXCEPT` touches only its own step, so the other step is unchanged. *Buggy twin* [`approval-step-buggy.tla`](./approval-step-buggy.tla) drops the `actor = approver[s]` guard ("any actor may approve"); rejected at 4 states (a2 approves s1: `decidedBy[s1] = a2 ≠ approver[s1] = a1`). *Out of model scope:* id immutability/no-reuse, store durability, timestamp ordering (Invariants 1,6–8,10 — structural/clock). *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

---

**Showcase pass — 2026-06-29.** This atom was brought to the full showcase standard **from scratch** in a single pass — the from-scratch full-showcase conversion (annotation + Summary/blockquote merge + Lineage collapse + the prose.md cuts) — having carried no `[Term]` annotation before. It now matches the [`duplicate-prevention.md`](./duplicate-prevention.md) exemplar and mirrors the [`provisional-commitment.md`](./provisional-commitment.md) and [`session.md`](./session.md) lifecycle passes.

*Annotation (the resolved four-kind ontology — **Type**, **Operation**, **Field** (a datum a Type carries — *what does it carry?*), **Parameter** (a value an Operation needs — *what does it need?*), and **Member**).* Every concept reference in the live body became a `[Term]` marker, and a per-page `## Terms` registry was added (after Edge cases, before Composition notes). **Kind inventory — 31 Terms:** one **Type** ([Approval Step], whose `state` state-field name is carried by the [State] Field); five **Operations** — [Submit], [Approve], [Reject], [Withdraw], [Read]; fourteen **Fields** stored on the step record — [Step Id], [Subject Ref], [Approver Ref], [Submitter Ref], [Scope], [Reason] (the submission-context field, stored under its own name), [Submitted At], [State], and the state-specific [Decided By], [Decision Reason], [Decided At], [Withdrawn By], [Withdrawal Reason], [Withdrawn At] (all stored-as-themselves, exactly as provisional-commitment's timestamp Fields); one **Parameter** consumed but never stored under its own name — [Query] (the [Read] filter argument, mirroring session's [Filter](./session.md#filter)); and ten **Members** — the four states [Pending], [Approved], [Rejected], [Withdrawn] and the six rejection reasons [Invalid Request], [Not Known], [Not Pending], [Unauthorized], [Storage Failure], [Invalid Query]. The discriminator (*stored-as-itself → Field, consumed/supplied-but-not-stored → Parameter*) placed every action argument that is written into a same-named field as a Field, and the [Read] query as the lone Parameter. The submission `reason` ([Reason] Field, stored as `reason`) is kept distinct from the [Decision Reason] (`decision_reason`) and [Withdrawal Reason] (`withdrawal_reason`) Fields the resolving actions write — three separate stored fields, not one. Casing left the prose into each card's `Projects:` line; every target's lowering is derived by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs). The five Operation contracts (`submit(subject_ref, approver_ref, submitter_ref, scope, reason?, submitted_at?) → …`, `approve(step_id, decided_by, reason?, decided_at?) → …`, `reject(…) → rejected_outcome | …`, `withdraw(…) → …`, `read(query) → …`) are kept once each in Inputs as the labeled *projected contract*; the concrete example invocations in Examples/Flow (e.g. `submit(subject_ref: "je-2026-0441", …) → step_id: "step-001"`, `approve("step-001", …) → approved`) and their literal returns (`approved`, `rejected_outcome`, `withdrawn`, `rejected(unauthorized)`, `rejected(not-pending)`, `rejected(invalid-request)`), the auditor `read({…})` query forms, and the `state:` filter literals stay verbatim as illustrative wire-level calls. `rejected_outcome` stays backticked **by design** — it is the [Reject] success token shown in the projected contract, a pinned projection, not a kind ("Literal is not a kind"); the [Rejected] card notes it. Cross-page references became full links to owner cards already carrying registries: Permissions' `permitted` → `[Permitted](./permissions.md#permitted)`; Actor Identity's attestation → `[Attestation](./actor-identity.md#attestation)`. The deployment-routing `store_name` and the hypothetical non-existent `un-approve`/`un-reject`/`un-withdraw` actions stay verbatim. Anchor-collision watch is clean: the [Approve] Operation (`#approve`) and the [Approved] Member (`#approved`) are distinct, as are [Reject]/[Rejected], [Withdraw]/[Withdrawn], and [Reason]/[Decision Reason]/[Withdrawal Reason].

*Showcase disciplines.* (1) **Summary/blockquote merge** — the plain Tier-1 [`prose.md`](../working-ideas/prose.md) cut-#4 Summary moved to the very top (before Intent); the descriptive top blockquote folded out as redundant after confirming every claim it carried (opaque immutable id; submission-field immutability; four states with three absorbing terminals; approver-only Approve/Reject, submitter-only Withdraw; delegation composing) is now carried by the Summary, Intent, State, and Invariants; an *also-known-as* italic line added. (2) **Lineage collapse** — the Lineage notes wrapped in the collapsed `<details markdown="block">` block, byte-mirroring the exemplars, `---` kept before it; existing Lineage text unaltered. (3) **prose.md cut #1 (one idea per sentence)** — the densest run-ons in the new Summary split into short declaratives, lossless. (4) **prose.md cut #5 (prose→structure)** — the State section's "Valid transitions" prose list rendered as a **transition table** (action · from · to · actor guard · result · rejections), with three cell-resistant semantics kept in prose *beside* it per the cut-#5 caveat: the exclusive actor-identity guard with its *writes-nothing-on-failure* fail-closed behavior (Invariants 4/5), terminal absorption ([Not Pending], Invariant 3), and the fixed rejection priority (cross-referenced to Decision points, where the full per-action preconditions stay). cuts #2 (glossary) and #3 (cross-ref footer) were assessed and **skipped**: acronyms are spelled-out-once inline per the corpus convention here, and provenance already lives in the invariants' supporting prose and Composition notes rather than being re-cited mid-sentence.

Expression only — every invariant and its number (the set holds at **10**, numbering untouched), every action signature / projected contract, the `decided_at ≥ submitted_at` / `withdrawn_at ≥ submitted_at` temporal-ordering relations (Invariant 7), the rejection-priority orderings, and every guarantee and rejection reason are unchanged in force; every `[Term]` marker resolves to its card and every card is used. **Re-verified, not re-grounded:** Status stays at `grounded on Final Critique 4 — 2026-05-20`. Gates: linter 0 (incl. the O-term resolver — all 31 of this page's Terms resolve their markers against the registry); the `.tla` model `approval-step.tla` and its buggy twin `approval-step-buggy.tla` are **UNTOUCHED** and still **PASS** / correctly **rejected** (no `.tla`/`.cfg` changed); the derived manifest projects an identifier kind (Field) and an enumerated kind (Member) cleanly; `git status` shows only `atoms/approval-step.md` modified; diff read line-by-line against the same-claim-or-weaker test.

---

**Final Critique 5 — scheduled rescan, 2026-07-12 (AI-conducted, fresh-reader discipline; claude-fable-5).** Seven findings; all closed in-pattern or at the owning document. Round conducted cold against the full spec plus the pass question sets; formal-layer portion re-ran the harness and the coverage cross-check. Per-finding record:

- *F1 — Invariant 9 formal coverage GAP — foundational (formal surface) →* the formal-layer vote names Invariant 9 (concurrent step independence) load-bearing, but the model enforced it only by construction (the frame: each action's `EXCEPT` touches its own step) — an assumption, not a verified property, per the coverage cross-check verdicts. Promoted to an explicit checked predicate `Inv9_StepIndependence` via a frame-witness: each action records the step it did *not* act on and snapshots that step's pre-action `state`/`decidedBy` from unprimed variables; the invariant asserts in the post-state that the untouched step still carries its snapshot (derived from actual history — not question-begging). Model and twin both carry the machinery, staying identical except the twin's dropped guard. Correct model holds, 25 states (was 16); twin still rejected via Invariant 4. Non-vacuity of the new check was demonstrated with a round-local frame-clobber variant (Approve also stamping the other step's `decidedBy`) rejected at 2 states — a state where only Inv9 is violable, since the clobber variant retains all actor guards; the variant was not committed. Party Identity's Invariant-6 promotion is the precedent.
- *F2 — temporal guards had no legitimate clock access — foundational, owned by `execution-contract.md` →* the Contract read the clock at the top of Step 3, *after* guards, while this atom's Decision points reject future and mis-ordered timestamps at guard time — and a pure G may not invoke a direct effect, leaving the temporal guards uncompilable as specified. Fixed at the owner (placement revision, 2026-07-12): the clock read moves to the top of Step 2, G's signature gains `clock_t`, and the single reading is shared by G and T (also removing guard/stamp skew). This atom's Clock semantics edge case now names the injected reading explicitly.
- *F3 — stale references — refining →* two `[Multi-Party Approval]` links pointed at `roadmap.md` though the composition landed 2026-05-20 (Edge cases §Self-approval and segregation of duties; §Multi-party approval and quorum); Edge case §Notification called Notification Fanout "forthcoming" and left it unlinked though it landed 2026-05-20. All re-pointed; Notification also linked.
- *F4 — reference-equality semantics unstated — refining →* "matches [Approver Ref] exactly" and the exact-match [Read] filters never pinned the comparison, so one implementation could Unicode-normalize or trim while another byte-compares — a determinism leak on the authorization anchors. Byte-for-byte equality (no normalization, case folding, or trimming) defined in Identity model; cross-referenced from the [Approve] and [Withdraw] Decision points and the [Read] filter rules.
- *F5 — Invariant 9 narrower in English than in force — refining →* independence was quantified over other steps "on the same subject X" only; rewritten universal (no field of any other step, same subject or not), matching the frame the model checks.
- *F6 — storage-failure read as caller-side certainty — refining →* Invariant 10's no-partial-write guarantee is store-side truth, but a lost response leaves the caller unable to distinguish rejection from success. New Edge case *Indeterminate storage outcomes* names the case, the re-query-before-retry discipline, [Duplicate Prevention](./duplicate-prevention.md) for submit retries, and the self-detecting property of resolving-action retries ([Not Pending]).
- *F7 — acronyms, mirrors, placement — refining/rhetorical →* ULID, UUID, ICH, IRB, and GCP glossed at first use; PI bound in Intent. Peer grounding-status parentheticals ("atom #9, `grounded` 2026-06-04" on State Machine; "`grounded` 2026-06-04" on Execute Gated Workflow) removed — ROADMAP is the status SSOT and in-prose mirrors drift. Regulated adversarial scenarios demoted from a top-level section to an Examples subsection per `spec-format.md` §Regulated overlay placement. Backdated [Submitted At] acceptance given its in-line defense (the future bound rejects the always-fabrication direction; creation-order evidence is the Audit Trail / Tamper Evidence layer's contribution). Intent's Execute Gated Workflow mention linked.

Gates after fixes: harness green (`approval-step.tla` PASS at 25 states; `approval-step-buggy.tla` correctly rejected); linter clean on the touched files. Pass 2 (EOS) re-confirmed the foundation round's four extraction declines plus Round 3's two; no new candidates. Status advanced to `grounded on Final Critique 5 — 2026-07-12`; ROADMAP status mirror updated in the same change.

</details>
