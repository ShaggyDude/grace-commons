---
title: Personal Todo
parent: Atomic Concepts
has_toc: true
toc: true
---

# Personal Todo

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Personal Todo is a single-person to-do list: one user records tasks, edits them while they are still open, marks them done, and deletes them. Every task gets a permanent internal identifier that never changes, so editing the wording of a task does not change which task it is. Each task is always in exactly one state — open (Pending) or finished (Done) — until it is deleted. No two active tasks can share the same wording, and the same text typed two different ways still counts as a match. It is built for one person managing their own list — personal tasks, reading lists, grocery lists, goals — not for shared or delegated lists, which are handled by separate patterns that build on this one.

---

## Intent

A single user records discrete units of work they intend to complete. Each unit can be edited while pending, marked done, and removed entirely. At any moment, every known unit is in exactly one logical condition.

---

## Structure

### Identity model

Every unit known to the system has an **[Id]** — an opaque, immutable identifier host-allocated at the I/O seam (injected into the transition, not generated inside it) on [Add]. The id is the unit's identity; [Description] is a mutable property of the unit, not its identity.

- Two units with the same [Description] value have different ids.
- An [Id] is returned to the caller by [Add] and used to reference the unit in [Edit], [Complete], and [Delete].
- Ids are not reused after a unit is deleted.
- The implementation chooses the id scheme (UUID, ULID, autoincrementing integer, opaque string). The spec requires only uniqueness within the system's lifetime and stability across sessions.

This model differs from the Alloy (a formal modeling language for checking structural properties) `todo.als` concept: that version uses fully opaque atoms with no description at all (`var sig Task {}`); this pattern carries a user-visible [Description] as a mutable property under an active-set uniqueness constraint. See the pattern's commit history for the honest framing of how the two concepts relate.

### Description policy

Every [Description] provided to [Add] or [Edit] is normalized before it enters state and before any active-set uniqueness comparison:

- **Trim** leading and trailing whitespace.
- **NFC-normalize** Unicode codepoints (the numeric values that identify individual characters in Unicode). NFC (Normalization Form C — the Unicode standard's canonical composed form, which gives equivalent characters one standard byte sequence) ensures text typed one way and pasted another way compares equal.
- **Reject** if the result is empty (rejection reason: [Invalid Description]).
- **Reject** if the result exceeds the maximum length (default: 1024 codepoints; configurable per implementation; rejection reason: [Invalid Description]).

Internal whitespace is preserved verbatim. Comparison for active-set uniqueness is case-sensitive on the normalized form. Case-insensitive matching is policy and belongs to a wrapping pattern.

The user-facing display preserves the normalized form (post-trim, post-NFC) — what the user typed, modulo trimming and Unicode canonicalization.

### Inputs

- A user-supplied [Description] for each unit of work.
- User-initiated actions ([Add], [Edit], [Complete], [Delete]), with these projected contracts:
  - `add(description) → id | rejected(invalid-description | duplicate-active | storage-failure)`
  - `edit(id, newDescription) → ok | rejected(not-known | not-editable | invalid-description | duplicate-active | storage-failure)`
  - `complete(id) → ok | rejected(not-known | not-pending | storage-failure)`
  - `delete(id) → ok | rejected(not-known | storage-failure)`
- A clock providing wall-time (clock time as a human would read it, not an internal counter) timestamps, and an id source for [Id] allocation — both injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the [Id] at the seam before the transition runs; the pure transition receives [Now] and [Id] as inputs and reads no clock and mints no id internally. Neither is supplied by the business caller — which keeps the transition deterministic.

### Outputs

- The current set of pending units.
- The current set of done units.
- For each unit: [Id], [Description], state, and timestamps.
- Action acknowledgements — success (returning [Id] for [Add], `ok` otherwise) or rejection with a named reason.

### State

A unit of work occupies one of two named conditions while known to the system:

- **[Pending]** — recorded, not yet completed.
- **[Done]** — completed, not yet removed.

A unit leaves the system entirely when deleted. Deletion is terminal within this concept; the id is retired and not reused.

Each unit carries:

- **[Id]** — opaque, immutable, host-allocated at the I/O seam (injected into the transition, not generated inside it). Set on [Add]. Never changes.
- **[Description]** — normalized text. Set on [Add], mutable via [Edit] while in [Pending].
- **[Added At]** — set on [Add], immutable.
- **[Last Edited At]** — set on [Edit], absent if never edited.
- **[Completed At]** — set on [Complete], present only while in [Done].

Transitions — every transition below stamps its timestamp from the injected [Now], and no transition reads the clock internally:

| action | from | to | guard | stamps | result | rejections |
|--------|------|----|-------|--------|--------|-----------|
| [Add] | *(no record)* | **[Pending]** | normalized [Description] valid and not active-duplicate | fresh [Id]; [Added At] = [Now] | the new [Id] | [Invalid Description]; [Duplicate Active]; [Storage Failure] |
| [Edit] | [Pending] | **[Pending]** | normalized [New Description] valid and not active-duplicate (excluding the unit itself) | [Last Edited At] = [Now] | `ok` | [Not Known]; [Not Editable]; [Invalid Description]; [Duplicate Active]; [Storage Failure] |
| [Complete] | [Pending] | **[Done]** | — | [Completed At] = [Now] | `ok` | [Not Known]; [Not Pending]; [Storage Failure] |
| [Delete] | [Pending] or [Done] | *(leaves the system)* | — | — | `ok` | [Not Known]; [Storage Failure] |

Four semantics the cells cannot hold:

- *The [Edit] no-op is a real accepted case that never writes.* A normalized [New Description] equal to the unit's current normalized [Description] is accepted as a no-op: state is unchanged, [Last Edited At] is unchanged, no write occurs, and [Storage Failure] cannot result. Only a non-no-op [Edit] writes and can therefore storage-fail.
- *Active-set uniqueness spans both live states and applies to two actions.* The normalized-[Description] uniqueness check runs across [Pending] ∪ [Done] together — [Done] counts toward it — and guards both [Add] and [Edit] (the [Edit] check excludes the unit being edited). A clash is rejected [Duplicate Active]; no unit is created or changed.
- *A failed guard or store write leaves the prior state intact.* When a precondition fails or the store write fails after all preconditions pass, the atom returns the named rejection and the unit is left exactly as it was — [Add] creates no unit on [Storage Failure], and [Edit]/[Complete]/[Delete] leave their target unchanged.
- *[Delete] is terminal and retires the id.* A unit leaves the system entirely on [Delete]; the [Id] is retired and never reused, and there is no transition back into [Pending] or [Done]. The full per-action preconditions are in Decision points.

### Flow

1. **Add.** The user records a new unit. The host allocates an [Id] and reads the clock at the seam; the transition normalizes the [Description], places the unit in [Pending] with the injected [Id] and [Added At], and returns the id. *(Start.)*
2. **Edit (optional, while Pending).** The user revises the [Description]. The system normalizes the [New Description], replaces the existing one, and updates [Last Edited At]. The unit remains [Pending]. May happen any number of times before completion or deletion.
3. **Complete or abandon.** The user marks it done ([Pending] → [Done] with [Completed At]) or deletes it without completing (abandonment branch).
4. **Delete.** The user removes the unit from the system. Id is retired. *(End.)*

### Decision points

Each action carries an explicit precondition. Violations are rejected, not silently absorbed.

- **At [Add]** — [Description] after normalization must satisfy the description policy (non-empty, within length); otherwise rejected as [Invalid Description]. The normalized [Description] must not match the normalized [Description] of any unit currently in [Pending] or [Done]; otherwise rejected as [Duplicate Active]. If the store write fails, the atom returns [Storage Failure]; no unit is created.
- **At [Edit]** — [Id] must reference a known unit; otherwise [Not Known]. The unit must be in [Pending]; otherwise [Not Editable] (the state model has exactly two live states — [Pending] and [Done] — so a non-[Pending] live unit is necessarily [Done]). [New Description] after normalization must satisfy the description policy and the same active-set uniqueness as [Add], excluding the unit at [Id] itself; otherwise [Invalid Description] or [Duplicate Active]. A normalized [New Description] equal to the unit's current normalized [Description] is accepted as a no-op (state unchanged, [Last Edited At] unchanged; no write occurs and [Storage Failure] cannot result). For non-no-op edits, if the store write fails, the atom returns [Storage Failure]; the unit is unchanged.
- **At [Complete]** — [Id] must reference a known unit; otherwise [Not Known]. The unit must be in [Pending]; otherwise [Not Pending]. If the store write fails, the atom returns [Storage Failure]; the unit remains in [Pending].
- **At [Delete]** — [Id] must reference a known unit in [Pending] or [Done]; otherwise [Not Known]. If the store write fails, the atom returns [Storage Failure]; the unit is unchanged.

### Behavior

Observed behavior, derived from how single-user task systems are actually used:

- The user adds units freely and frequently, often in bursts.
- The user completes some units and deletes others without completing them. Abandonment is common and is not a defect.
- The user edits pending units to correct typos, refine scope, or capture context that arrived after the original add.
- The user does not expect units to move backward from [Done] to [Pending]. Reopening belongs to a separate pattern.
- The user expects timestamps to be visible and uses them to reason about staleness.
- The user occasionally re-adds a unit with the same [Description] as one previously deleted. Personal Todo on its own accepts this — there is no temporal memory of deleted units, and a new id is issued. Containing systems that need recency-based duplicate prevention compose this pattern with [Duplicate Prevention](./duplicate-prevention.md); see Composition notes.
- The user pastes descriptions from external sources. Different sources produce different Unicode normal forms (NFC vs. NFD). The pattern's NFC normalization ensures that *"café"* typed and *"café"* pasted from a different source compare equal under the active-set uniqueness check.
- **Time and [Id] are injected at the seam, not generated inside the transition.** Per the Logic Confinement Principle (`execution-contract.md`), the host reads the clock and allocates the [Id] at the deployment seam before the transition runs; [Added At], [Last Edited At], and [Completed At] are stamped from the injected [Now], and the core transition reads no wall clock and mints no id internally. The caller signatures ([Add], [Edit], [Complete], [Delete]) are unchanged — time and id are host-injected, not caller-supplied — so the fix is additive with no caller-change cascade.

### Feedback

Each successful action produces an observable, measurable change:

- After [Add] — a new unit appears in [Pending] with a fresh [Id] and [Added At]. Pending count and total count each increase by one. The id is returned to the caller.
- After [Edit] — the unit's [Description] and [Last Edited At] update. Counts unchanged.
- After [Complete] — the unit moves from [Pending] to [Done] with [Completed At]. Pending count decreases by one, Done count increases by one; total count unchanged.
- After [Delete] — the unit is removed; the id is retired. Total count decreases by one.

Each rejected action produces an observable refusal naming the failed precondition: [Invalid Description], [Duplicate Active], [Not Pending], [Not Editable], [Not Known], or [Storage Failure].

The Pending and Done sets are queryable — the user can list, filter, and count them at any time. Per-unit fields ([Id], [Description], state, timestamps) are observable to the user.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Membership exclusivity.** For every unit `t` known to the system, `t` is in exactly one of {[Pending], [Done]}, never both, never neither.
- **Invariant 2 — Add-then-Pending persistence.** After a successful [Add], the resulting unit is in [Pending] and remains so until [Complete] or [Delete] is invoked.
- **Invariant 3 — Complete-then-Done persistence.** After a successful [Complete], the unit at [Id] is in [Done] and remains so until [Delete] is invoked.
- **Invariant 4 — Delete is terminal.** After a successful [Delete], no unit with that [Id] is in [Pending] or [Done]. The id is not reused.
- **Invariant 5 — Edit preserves state.** After a successful non-no-op [Edit], the unit at [Id] remains in [Pending]; only its [Description] and [Last Edited At] change.
- **Invariant 6 — Active-set description uniqueness.** At any time, no two distinct units in [Pending] ∪ [Done] share a normalized [Description]. [Description] is a property under uniqueness constraint, not the unit's identity (which is [Id]).
- **Invariant 7 — Timestamp monotonicity.** For any unit:
  - if [Last Edited At] is defined, [Added At] ≤ [Last Edited At].
  - if [Completed At] is defined, [Added At] ≤ [Completed At].
  - if both [Last Edited At] and [Completed At] are defined, [Last Edited At] ≤ [Completed At].
- **Invariant 8 — Id stability.** A unit's [Id] is set on [Add] and never changes. Edits to [Description] do not change [Id].

Add-then-Pending persistence and Complete-then-Done persistence correspond to the linear temporal logic (a formal notation for reasoning about sequences of states over time) `until` assertions in the Alloy `todo.als` specification. The remaining four (edit preserves state, active-set description uniqueness, timestamp monotonicity, id stability) are extensions specific to this pattern; the Alloy version does not carry description, mutability, timestamps, or an explicit identity model.

---

## Examples

The same pattern, three personal-scope domains, identical mechanic. A fourth example walks the rejection paths.

### Personal task management

A user opens a notes app, types *"buy milk."* The system trims, NFC-normalizes, returns id `t1`. The user marks `t1` done after the errand, then deletes `t1`. A week later, types *"buy milk"* again — accepted; new id `t2` is issued (no temporal memory in this pattern). Adds *"renew passport"* (id `t3`), edits it to *"renew passport before Italy trip"* the next day (still `t3`, [Last Edited At] updated), leaves it pending for six weeks, eventually deletes `t3` because they renewed via a different channel.

### Reading list

A user adds *"Essence of Software"* (id `b1`), finishes it three weeks later, marks it done, deletes it from the Done list. Adds *"TLA+ in Action"* (id `b2`), abandons it after fifty pages, deletes `b2`. Two days later, decides to retry — adds *"TLA+ in Action"* again — accepted with new id `b3` (no recency check in this pattern alone).

### Personal goal capture

A user adds *"call mom this week"* on Monday (id `g1`), completes `g1` Friday, deletes `g1`. Adds the same description the following Monday — accepted, id `g2`. Adds *"learn Python"* (id `g3`), edits it the next day to *"learn Python — finish first three Real Python tutorials"* to make the goal concrete. Same id `g3`, updated [Description], updated [Last Edited At].

### Rejection paths

The same user, exercising the rejection surface in one short sequence:

- Adds *"buy milk"* — accepted, id `r1`.
- Tries to add *"buy milk"* again immediately while `r1` is still in [Pending] — rejected as [Duplicate Active] (active-set uniqueness protects this case).
- Marks `r1` done. Tries to add *"buy milk"* once more while `r1` is in [Done] — rejected as [Duplicate Active] ([Done] counts toward active-set uniqueness).
- Tries to edit `r1` (currently in [Done]) — rejected as [Not Editable].
- Tries to add *"   "* (whitespace-only) — rejected as [Invalid Description] (empty after trim).
- Tries to add a 5,000-codepoint description — rejected as [Invalid Description] (exceeds default 1,024 limit).
- Pastes *"café"* in NFD form (`cafe` + combining acute) while `r1`'s description *"café"* in NFC form is in [Done] — rejected as [Duplicate Active] (NFC normalization unifies the two forms).
- Tries to complete an unknown id — rejected as [Not Known].
- Deletes `r1`. Now *"buy milk"* is no longer in the active set; a fresh `add("buy milk")` would succeed with a new id (id `r2`).

This sequence covers four of the rejection reasons ([Invalid Description], [Duplicate Active], [Not Editable], [Not Known]) in a single thread of user action. The fifth reason, [Not Pending], is exercised separately — for example, attempting to [Complete] an id that is already [Done].

---

## Edge cases and explicit non-goals

What this pattern does not cover:

- **Multi-user / shared lists.** Single-actor only. Multi-actor task tracking belongs to a separate Shared Todo pattern.
- **Assignment, delegation, ownership transfer.** No actor concept beyond the implicit single owner.
- **Recency-based duplicate prevention.** Compose with [Duplicate Prevention](./duplicate-prevention.md) if needed (see Composition notes).
- **Restoration of deleted units.** Deletion is terminal. Systems that need restorability compose Personal Todo with an Audit or History pattern.
- **Reopening completed units.** No Done → Pending transition. Reopening is a separate pattern.
- **Recurring units.** Units with scheduled regeneration belong to a Recurring pattern.
- **Priority, ordering, dependencies, due dates.** Each is a distinct pattern that composes with Personal Todo.
- **Description versioning / edit history.** Only [Last Edited At] is retained; prior descriptions are not. Versioning belongs to a separate History pattern.
- **Concurrent action sequences.** The pattern assumes a linear sequence of actions from a single actor. Multiple concurrent clients (two browser tabs, mobile + desktop) producing simultaneous actions on the same unit fall outside this concept; coordination belongs to a Concurrency-Resolution pattern that composes.
- **Atomicity and crash semantics.** State transitions are specified as atomic. A crash mid-transition that leaves a unit in neither [Pending] nor [Done] violates membership exclusivity; the implementor is responsible for the transactional boundary that makes it hold. The spec does not define recovery semantics.
- **Clock semantics.** [Added At], [Last Edited At], and [Completed At] are wall-time stamped from the injected [Now] (see Inputs and Behavior). Clock skew, NTP adjustments, monotonicity, and timezone handling are handled at the deployment layer; the spec does not address them. Invariant 7 (timestamp monotonicity) is best-effort under non-monotonic clocks; a clock that moves backward between transitions can violate the inequalities. Trusted timestamping is a composing pattern that supplies a verifiable time-anchor if the timeline must be adversarially defensible.
- **Case-insensitive matching, fuzzy matching, locale-aware comparison.** The description policy specifies NFC + trim + case-sensitive. Variants belong to wrapping patterns.

Where the pattern breaks down: in any system with multiple actors, where "completion" is not a binary state, where description is not a sufficient property under uniqueness constraint, or where the host environment cannot supply the atomic state transitions membership exclusivity depends on. Each takes a different pattern.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Add

The behavior that records a new unit of work. It allocates a fresh [Id], normalizes the supplied [Description], stamps [Added At], and places the unit in [Pending], returning the [Id].

Kind: Operation

#### Edit

The behavior that revises a [Pending] unit's [Description]. It replaces the value with the normalized [New Description] and stamps [Last Edited At]; the unit's state and [Id] are unchanged.

Kind: Operation

#### Complete

The behavior that marks a [Pending] unit done, moving it [Pending] → [Done] and stamping [Completed At].

Kind: Operation

#### Delete

The behavior that removes a unit from the system entirely. Deletion is terminal; the [Id] is retired and not reused.

Kind: Operation

#### Id

The opaque, immutable identity of a unit, host-allocated at the I/O seam on [Add] and never changed. The unit's [Description] is a property under uniqueness constraint, not its identity — two units with the same [Description] still have different ids.

Kind:     Field
Field of: Personal Todo
Projects: id

#### Description

The user-supplied text of a unit, normalized (trim + NFC) before it enters state. It is mutable via [Edit] while [Pending], unique across the active set ([Pending] ∪ [Done]), and a property of the unit rather than its identity.

Kind:     Field
Field of: Personal Todo
Projects: description

#### Added At

The wall-time a unit was created, stamped from the injected [Now] on [Add]. Immutable thereafter.

Kind:     Field
Field of: Personal Todo
Projects: added_at

#### Last Edited At

The wall-time of a unit's most recent [Edit], stamped from the injected [Now]. Absent on a unit that has never been edited.

Kind:     Field
Field of: Personal Todo
Projects: last_edited_at

#### Completed At

The wall-time a unit was marked done, stamped from the injected [Now] on [Complete]. Present only while the unit is [Done].

Kind:     Field
Field of: Personal Todo
Projects: completed_at

#### New Description

The replacement text [Edit] needs — supplied per call, normalized, and (unless it equals the current [Description], a no-op) written into the unit's [Description]. It is consumed by [Edit], not stored under this name.

Kind:         Parameter
Parameter of: Edit
Projects:     newDescription

#### Now

The current wall-time reading the transitions stamp timestamps from, supplied to the pure transition by the host at the I/O seam (never read inside the transition, never supplied by the business caller).

Kind:         Parameter
Parameter of: Add
Projects:     now

#### Pending

The state of a recorded unit that is not yet completed — the one editable live state. A unit enters [Pending] on [Add] and leaves it on [Complete] (to [Done]) or [Delete].

Kind:      Member
Member of: the unit state
Role:      Outcome

#### Done

The state of a completed unit, not yet removed. A unit enters [Done] on [Complete] and leaves only on [Delete]; there is no [Done] → [Pending] transition.

Kind:      Member
Member of: the unit state
Role:      Outcome

#### Invalid Description

The refusal [Add] or [Edit] returns when the normalized [Description] is empty or exceeds the length cap. No unit is created or changed.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-description

#### Duplicate Active

The refusal [Add] or [Edit] returns when the normalized [Description] already belongs to a unit in [Pending] or [Done] (the active set). No unit is created or changed.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  duplicate-active

#### Not Known

The refusal [Edit], [Complete], or [Delete] returns when the supplied [Id] references no unit the system holds.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Not Pending

The refusal [Complete] returns when the referenced unit is not in [Pending] (it is already [Done]).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-pending

#### Not Editable

The refusal [Edit] returns when the referenced unit is not in [Pending] — necessarily [Done], since those are the only two live states.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-editable

#### Storage Failure

The refusal any writing action returns when the underlying store write fails after all preconditions pass. The unit is left in its prior state; the caller must retry.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Duplicate Recent

The refusal a containing system returns when [Duplicate Prevention](./duplicate-prevention.md) reports the [Description] as recently seen — the *"buy milk twice in the same morning"* rejection. It is *this* pattern's outcome (the bare atom does not raise it; it surfaces only when composed with Duplicate Prevention), and its wire form is **pinned** — frozen because callers switch on the exact string.

Kind:      Member
Member of: the add rejection
Role:      Outcome
Projects:  duplicate-recent
Wire:      pinned

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Add]: #add
[Edit]: #edit
[Complete]: #complete
[Delete]: #delete
[Id]: #id
[Description]: #description
[Added At]: #added-at
[Last Edited At]: #last-edited-at
[Completed At]: #completed-at
[New Description]: #new-description
[Now]: #now
[Pending]: #pending
[Done]: #done
[Invalid Description]: #invalid-description
[Duplicate Active]: #duplicate-active
[Not Known]: #not-known
[Not Pending]: #not-pending
[Not Editable]: #not-editable
[Storage Failure]: #storage-failure
[Duplicate Recent]: #duplicate-recent

---

## Composition notes

Personal Todo is a freestanding concept and is designed to compose with other concepts rather than absorb what belongs to them:

- **[Duplicate Prevention](./duplicate-prevention.md)** — adds a temporally-bounded recency guard against rapid re-adds of recently-deleted descriptions. The container calls Duplicate Prevention's `record` on every successful [Delete] (with the normalized [Description]) and its `check` before every [Add]. If `check` returns `seen`, the add is rejected as [Duplicate Recent]. This produces the *"buy milk twice in the same morning is rejected; twice in the same week is allowed"* user experience. Personal Todo's MVP can ship without this composition; the v1.1 polish brings it in.
- **[Undo History](../compositions/undo-history.md)** — wires Personal Todo with Event Log to preserve each deletion as a recoverable event. The deleted unit's id, description, and timestamps are appended to the Event Log on every successful `delete`, making the full deletion history reconstructable from records alone and enabling restoration by an administrator or the author.
- **[Shared Todo](../compositions/shared-todo.md)** — wires Personal Todo with Permissions and Assignment to make a single-user task list multi-actor: Permissions controls which actors can read and modify which tasks; Assignment binds responsibility for specific tasks to specific actors.
- **Audit / History** *(forthcoming)* — preserves deleted units (id, descriptions, timestamps, edit history) for retrospective inspection and restoration.
- **Priority and Ordering** *(forthcoming)* — adds an ordering relation over Pending units.
- **Task Dependencies** *(forthcoming)* — encodes prerequisite relations between ids.
- **Recurring** *(forthcoming)* — adds scheduled regeneration of units after completion or deletion.
- **Reopen and Revision** *(forthcoming)* — adds Done → Pending transitions.
- **Concurrency Resolution** *(forthcoming)* — handles simultaneous actions from multiple clients on the same id.

---

## Standards references

Personal Todo is a primitive, not a regulated business pattern. It has no direct ISO / IEEE / regulatory anchor. It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the conception of a "concept" as a composable, behavioral, freestanding unit of software design. The discipline of *not* absorbing concepts that belong to other concepts.
- **Eiffel's design-by-contract** — preconditions on `add`, `edit`, `complete`, `delete`.
- **Linear temporal logic** — Add-then-Pending and Complete-then-Done expressed as `until` properties.
- **Unicode Standard Annex #15** — NFC normalization for the description policy.

A formal-methods version of a similar concept exists in [concept-catalog](https://github.com/dpapathanasiou/concept-catalog/blob/main/concepts/todo.als), expressed in Alloy 6. The Alloy version uses fully opaque Task atoms (`var sig Task {}`) with no description, no identity-by-content, no edit, and no duplicate prevention; its operational principles cover `add`, `complete`, and `delete` over those atoms. Personal Todo is *informed by* that structure but is a distinct concept: it adds an `id`-as-identity model with description as a mutable property under uniqueness constraint, an `edit` action, timestamps, normalized comparison rules, and explicit Behavior / Feedback / Examples coverage. Recency-based duplicate prevention, initially absorbed into the spec on the first iteration, was extracted to a separate freestanding concept ([Duplicate Prevention](./duplicate-prevention.md)).

---

## Status

`grounded on Final Critique 4 — 2026-06-18` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 4 — 2026-06-18
formal: not applicable — vote no 2026-06-03
last gate: 2026-06-18 — Final Critique 4, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/personal-todo.md`.
