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


> A productivity primitive: single-user task tracking with pending / done / removed states, edit-while-pending, and timestamps. Each unit has an opaque immutable id host-allocated at the I/O seam; description is a mutable property under explicit normalization rules.

---

## Intent

A single user records discrete units of work they intend to complete. Each unit can be edited while pending, marked done, and removed entirely. At any moment, every known unit is in exactly one logical condition.

---

## Summary

Personal Todo is a single-person to-do list: one user records tasks, edits them while they are still open, marks them done, and deletes them. Every task gets a permanent internal identifier that never changes, so editing the wording of a task does not change which task it is. The pattern guarantees that each task is always in exactly one state — open (Pending) or finished (Done) — until it is deleted, and that no two active tasks can share the same wording (the same text typed two different ways still counts as a match). It is built for one person managing their own list — personal tasks, reading lists, grocery lists, goals — not for shared or delegated lists, which are handled by separate patterns that build on this one.

---

## Structure

### Identity model

Every unit known to the system has an **`id`** — an opaque, immutable identifier host-allocated at the I/O seam (injected into the transition, not generated inside it) on `add`. The id is the unit's identity; description is a mutable property of the unit, not its identity.

- Two units with the same description value have different ids.
- An id is returned to the caller by `add` and used to reference the unit in `edit`, `complete`, and `delete`.
- Ids are not reused after a unit is deleted.
- The implementation chooses the id scheme (UUID, ULID, autoincrementing integer, opaque string). The spec requires only uniqueness within the system's lifetime and stability across sessions.

This model differs from the Alloy (a formal modeling language for checking structural properties) `todo.als` concept: that version uses fully opaque atoms with no description at all (`var sig Task {}`); this pattern carries a user-visible description as a mutable property under an active-set uniqueness constraint. See Lineage notes for the honest framing of how the two concepts relate.

### Description policy

Every description provided to `add` or `edit` is normalized before it enters state and before any active-set uniqueness comparison:

- **Trim** leading and trailing whitespace.
- **NFC-normalize** Unicode codepoints (the numeric values that identify individual characters in Unicode). NFC (Normalization Form C — the Unicode standard's canonical composed form, which gives equivalent characters one standard byte sequence) ensures text typed one way and pasted another way compares equal.
- **Reject** if the result is empty (rejection reason: `invalid-description`).
- **Reject** if the result exceeds the maximum length (default: 1024 codepoints; configurable per implementation; rejection reason: `invalid-description`).

Internal whitespace is preserved verbatim. Comparison for active-set uniqueness is case-sensitive on the normalized form. Case-insensitive matching is policy and belongs to a wrapping pattern.

The user-facing display preserves the normalized form (post-trim, post-NFC) — what the user typed, modulo trimming and Unicode canonicalization.

### Inputs

- A user-supplied description for each unit of work.
- User-initiated actions:
  - `add(description) → id | rejected(invalid-description | duplicate-active | storage-failure)`
  - `edit(id, newDescription) → ok | rejected(not-known | not-editable | invalid-description | duplicate-active | storage-failure)`
  - `complete(id) → ok | rejected(not-known | not-pending | storage-failure)`
  - `delete(id) → ok | rejected(not-known | storage-failure)`
- A clock providing wall-time (clock time as a human would read it, not an internal counter) timestamps, and an id source for `id` allocation — both injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the `id` at the seam before the transition runs; the pure transition receives `now` and `id` as inputs and reads no clock and mints no id internally. Neither is supplied by the business caller — which keeps the transition deterministic.

### Outputs

- The current set of pending units.
- The current set of done units.
- For each unit: `id`, `description`, state, and timestamps.
- Action acknowledgements — success (returning `id` for `add`, `ok` otherwise) or rejection with a named reason.

### State

A unit of work occupies one of two named conditions while known to the system:

- **Pending** — recorded, not yet completed.
- **Done** — completed, not yet removed.

A unit leaves the system entirely when deleted. Deletion is terminal within this concept; the id is retired and not reused.

Each unit carries:

- **`id`** — opaque, immutable, host-allocated at the I/O seam (injected into the transition, not generated inside it). Set on `add`. Never changes.
- **`description`** — normalized text. Set on `add`, mutable via `edit` while in Pending.
- **`added_at`** — set on `add`, immutable.
- **`last_edited_at`** — set on `edit`, absent if never edited.
- **`completed_at`** — set on `complete`, present only while in Done.

Transitions:

- `add(description)` → unit enters Pending with a fresh `id`, normalized `description`, and `added_at` stamped from the injected `now`. Returns `id`.
- `edit(id, newDescription)` → unit's `description` is replaced with the normalized `newDescription`; `last_edited_at` stamped from the injected `now`. State unchanged. Returns `ok`.
- `complete(id)` → unit moves Pending → Done; `completed_at` stamped from the injected `now`. Returns `ok`.
- `delete(id)` → unit leaves the system; id is retired. Returns `ok`.

### Flow

1. **Add.** The user records a new unit. The host allocates an `id` and reads the clock at the seam; the transition normalizes the description, places the unit in Pending with the injected `id` and `added_at`, and returns the id. *(Start.)*
2. **Edit (optional, while Pending).** The user revises the description. The system normalizes the new description, replaces the existing one, and updates `last_edited_at`. The unit remains Pending. May happen any number of times before completion or deletion.
3. **Complete or abandon.** The user marks it done (Pending → Done with `completed_at`) or deletes it without completing (abandonment branch).
4. **Delete.** The user removes the unit from the system. Id is retired. *(End.)*

### Decision points

Each action carries an explicit precondition. Violations are rejected, not silently absorbed.

- **At `add(description)`** — `description` after normalization must satisfy the description policy (non-empty, within length); otherwise rejected as `invalid-description`. The normalized description must not match the normalized description of any unit currently in Pending or Done; otherwise rejected as `duplicate-active`. If the store write fails, the atom returns `rejected(storage-failure)`; no unit is created.
- **At `edit(id, newDescription)`** — `id` must reference a known unit; otherwise `not-known`. The unit must be in Pending; otherwise `not-editable` (the state model has exactly two live states — Pending and Done — so a non-Pending live unit is necessarily Done). `newDescription` after normalization must satisfy the description policy and the same active-set uniqueness as `add`, excluding the unit at `id` itself; otherwise `invalid-description` or `duplicate-active`. A normalized `newDescription` equal to the unit's current normalized description is accepted as a no-op (state unchanged, `last_edited_at` unchanged; no write occurs and `storage-failure` cannot result). For non-no-op edits, if the store write fails, the atom returns `rejected(storage-failure)`; the unit is unchanged.
- **At `complete(id)`** — `id` must reference a known unit; otherwise `not-known`. The unit must be in Pending; otherwise `not-pending`. If the store write fails, the atom returns `rejected(storage-failure)`; the unit remains in Pending.
- **At `delete(id)`** — `id` must reference a known unit in Pending or Done; otherwise `not-known`. If the store write fails, the atom returns `rejected(storage-failure)`; the unit is unchanged.

### Behavior

Observed behavior, derived from how single-user task systems are actually used:

- The user adds units freely and frequently, often in bursts.
- The user completes some units and deletes others without completing them. Abandonment is common and is not a defect.
- The user edits pending units to correct typos, refine scope, or capture context that arrived after the original add.
- The user does not expect units to move backward from Done to Pending. Reopening belongs to a separate pattern.
- The user expects timestamps to be visible and uses them to reason about staleness.
- The user occasionally re-adds a unit with the same description as one previously deleted. Personal Todo on its own accepts this — there is no temporal memory of deleted units, and a new id is issued. Containing systems that need recency-based duplicate prevention compose this pattern with [Duplicate Prevention](./duplicate-prevention.md); see Composition notes.
- The user pastes descriptions from external sources. Different sources produce different Unicode normal forms (NFC vs. NFD). The pattern's NFC normalization ensures that *"café"* typed and *"café"* pasted from a different source compare equal under the active-set uniqueness check.
- **Time and `id` are injected at the seam, not generated inside the transition.** Per the Logic Confinement Principle (`execution-contract.md`), the host reads the clock and allocates the `id` at the deployment seam before the transition runs; `added_at`, `last_edited_at`, and `completed_at` are stamped from the injected `now`, and the core transition reads no wall clock and mints no id internally. The caller signatures (`add`, `edit`, `complete`, `delete`) are unchanged — time and id are host-injected, not caller-supplied — so the fix is additive with no caller-change cascade.

### Feedback

Each successful action produces an observable, measurable change:

- After `add(description)` — a new unit appears in Pending with a fresh `id` and `added_at`. Pending count and total count each increase by one. The id is returned to the caller.
- After `edit(id, newDescription)` — the unit's `description` and `last_edited_at` update. Counts unchanged.
- After `complete(id)` — the unit moves from Pending to Done with `completed_at`. Pending count decreases by one, Done count increases by one; total count unchanged.
- After `delete(id)` — the unit is removed; the id is retired. Total count decreases by one.

Each rejected action produces an observable refusal naming the failed precondition: `invalid-description`, `duplicate-active`, `not-pending`, `not-editable`, `not-known`, or `storage-failure`.

The Pending and Done sets are queryable — the user can list, filter, and count them at any time. Per-unit fields (`id`, `description`, state, timestamps) are observable to the user.

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Membership exclusivity.** For every unit `t` known to the system, `t` is in exactly one of {Pending, Done}, never both, never neither.
- **Invariant 2 — Add-then-Pending persistence.** After a successful `add(description)`, the resulting unit is in Pending and remains so until `complete` or `delete` is invoked.
- **Invariant 3 — Complete-then-Done persistence.** After a successful `complete(id)`, the unit at `id` is in Done and remains so until `delete(id)` is invoked.
- **Invariant 4 — Delete is terminal.** After a successful `delete(id)`, no unit with that `id` is in Pending or Done. The id is not reused.
- **Invariant 5 — Edit preserves state.** After a successful non-no-op `edit(id, newDescription)`, the unit at `id` remains in Pending; only its `description` and `last_edited_at` change.
- **Invariant 6 — Active-set description uniqueness.** At any time, no two distinct units in Pending ∪ Done share a normalized description. Description is a property under uniqueness constraint, not the unit's identity (which is `id`).
- **Invariant 7 — Timestamp monotonicity.** For any unit:
  - if `last_edited_at` is defined, `added_at ≤ last_edited_at`.
  - if `completed_at` is defined, `added_at ≤ completed_at`.
  - if both `last_edited_at` and `completed_at` are defined, `last_edited_at ≤ completed_at`.
- **Invariant 8 — Id stability.** A unit's `id` is set on `add` and never changes. Edits to `description` do not change `id`.

Add-then-Pending persistence and Complete-then-Done persistence correspond to the linear temporal logic (a formal notation for reasoning about sequences of states over time) `until` assertions in the Alloy `todo.als` specification. The remaining four (edit preserves state, active-set description uniqueness, timestamp monotonicity, id stability) are extensions specific to this pattern; the Alloy version does not carry description, mutability, timestamps, or an explicit identity model.

---

## Examples

The same pattern, three personal-scope domains, identical mechanic. A fourth example walks the rejection paths.

### Personal task management

A user opens a notes app, types *"buy milk."* The system trims, NFC-normalizes, returns id `t1`. The user marks `t1` done after the errand, then deletes `t1`. A week later, types *"buy milk"* again — accepted; new id `t2` is issued (no temporal memory in this pattern). Adds *"renew passport"* (id `t3`), edits it to *"renew passport before Italy trip"* the next day (still `t3`, `last_edited_at` updated), leaves it pending for six weeks, eventually deletes `t3` because they renewed via a different channel.

### Reading list

A user adds *"Essence of Software"* (id `b1`), finishes it three weeks later, marks it done, deletes it from the Done list. Adds *"TLA+ in Action"* (id `b2`), abandons it after fifty pages, deletes `b2`. Two days later, decides to retry — adds *"TLA+ in Action"* again — accepted with new id `b3` (no recency check in this pattern alone).

### Personal goal capture

A user adds *"call mom this week"* on Monday (id `g1`), completes `g1` Friday, deletes `g1`. Adds the same description the following Monday — accepted, id `g2`. Adds *"learn Python"* (id `g3`), edits it the next day to *"learn Python — finish first three Real Python tutorials"* to make the goal concrete. Same id `g3`, updated description, updated `last_edited_at`.

### Rejection paths

The same user, exercising the rejection surface in one short sequence:

- Adds *"buy milk"* — accepted, id `r1`.
- Tries to add *"buy milk"* again immediately while `r1` is still in Pending — rejected as `duplicate-active` (active-set uniqueness protects this case).
- Marks `r1` done. Tries to add *"buy milk"* once more while `r1` is in Done — rejected as `duplicate-active` (Done counts toward active-set uniqueness).
- Tries to edit `r1` (currently in Done) — rejected as `not-editable`.
- Tries to add *"   "* (whitespace-only) — rejected as `invalid-description` (empty after trim).
- Tries to add a 5,000-codepoint description — rejected as `invalid-description` (exceeds default 1,024 limit).
- Pastes *"café"* in NFD form (`cafe` + combining acute) while `r1`'s description *"café"* in NFC form is in Done — rejected as `duplicate-active` (NFC normalization unifies the two forms).
- Tries to complete an unknown id — rejected as `not-known`.
- Deletes `r1`. Now *"buy milk"* is no longer in the active set; a fresh `add("buy milk")` would succeed with a new id (id `r2`).

This sequence covers four of the rejection reasons (`invalid-description`, `duplicate-active`, `not-editable`, `not-known`) in a single thread of user action. The fifth reason, `not-pending`, is exercised separately — for example, attempting to `complete` an id that is already Done.

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
- **Description versioning / edit history.** Only `last_edited_at` is retained; prior descriptions are not. Versioning belongs to a separate History pattern.
- **Concurrent action sequences.** The pattern assumes a linear sequence of actions from a single actor. Multiple concurrent clients (two browser tabs, mobile + desktop) producing simultaneous actions on the same unit fall outside this concept; coordination belongs to a Concurrency-Resolution pattern that composes.
- **Atomicity and crash semantics.** State transitions are specified as atomic. A crash mid-transition that leaves a unit in neither Pending nor Done violates membership exclusivity; the implementor is responsible for the transactional boundary that makes it hold. The spec does not define recovery semantics.
- **Clock semantics.** `added_at`, `last_edited_at`, and `completed_at` are wall-time stamped from the injected `now` (see Inputs and Behavior). Clock skew, NTP adjustments, monotonicity, and timezone handling are deployment concerns the spec does not address. Invariant 7 (timestamp monotonicity) is best-effort under non-monotonic clocks; a clock that moves backward between transitions can violate the inequalities. Trusted timestamping is a composing pattern that supplies a verifiable time-anchor if the timeline must be adversarially defensible.
- **Case-insensitive matching, fuzzy matching, locale-aware comparison.** The description policy specifies NFC + trim + case-sensitive. Variants belong to wrapping patterns.

Where the pattern breaks down: in any system with multiple actors, where "completion" is not a binary state, where description is not a sufficient property under uniqueness constraint, or where the host environment cannot supply the atomic state transitions membership exclusivity depends on. Each takes a different pattern.

---

## Composition notes

Personal Todo is a freestanding concept and is designed to compose with other concepts rather than absorb their concerns:

- **[Duplicate Prevention](./duplicate-prevention.md)** — adds a temporally-bounded recency guard against rapid re-adds of recently-deleted descriptions. The container calls `record(normalized_description)` on every successful `delete` and `check(normalized_description)` before every `add`. If `check` returns `seen`, the add is rejected as `duplicate-recent`. This produces the *"buy milk twice in the same morning is rejected; twice in the same week is allowed"* user experience. Personal Todo's MVP can ship without this composition; the v1.1 polish brings it in.
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

- **Daniel Jackson, *The Essence of Software*** — the conception of a "concept" as a composable, behavioral, freestanding unit of software design. The discipline of *not* absorbing concerns that belong to other concepts.
- **Eiffel's design-by-contract** — preconditions on `add`, `edit`, `complete`, `delete`.
- **Linear temporal logic** — Add-then-Pending and Complete-then-Done expressed as `until` properties.
- **Unicode Standard Annex #15** — NFC normalization for the description policy.

A formal-methods version of a similar concept exists in [concept-catalog](https://github.com/dpapathanasiou/concept-catalog/blob/main/concepts/todo.als), expressed in Alloy 6. The Alloy version uses fully opaque Task atoms (`var sig Task {}`) with no description, no identity-by-content, no edit, and no duplicate prevention; its operational principles cover `add`, `complete`, and `delete` over those atoms. Personal Todo is *informed by* that structure but is a distinct concept: it adds an `id`-as-identity model with description as a mutable property under uniqueness constraint, an `edit` action, timestamps, normalized comparison rules, and explicit Behavior / Feedback / Examples coverage. Recency-based duplicate prevention, initially absorbed into the spec on the first iteration, was extracted to a separate freestanding concept ([Duplicate Prevention](./duplicate-prevention.md)).

---

## Status

`grounded on Final Critique 4 — 2026-06-18` (Final Critique 4 — the first AI-conducted adversarial round, fresh-reader Opus, 2026-06-18 — closed 2 foundational finding(s): `id` and clock now host-injected at the I/O seam, and unreachable `not-pending` rejection removed from `edit`; caller signatures unchanged; see Lineage. Formal-layer vote stands NO (English-only, minimum-formalism). The pattern was grandfathered at the legacy `grounded — 2026-05-20` token until this round.) — all required structural elements resolved; identity model explicit; description policy explicit; rejection paths exercised in examples; deferred concerns (concurrency, atomicity, clock semantics) named as out-of-scope. The pattern is freestanding and composable. Extensions (recency guard, history, priority, dependencies, recurrence, reopening, concurrency resolution) are separate concepts, listed in Composition notes.

---

## Lineage notes

This pattern is the result of two iterations of pressure-testing.

**First pass** — node-by-node interrogation of an earlier `todo.md` draft surfaced five gaps:

- *Actor* — pattern scope tightened to single-user; renamed Personal Todo. Multi-user variants will be separate patterns.
- *Description mutability* — `edit` action introduced, allowed on Pending only.
- *Temporal metadata* — timestamps added: `added_at`, `last_edited_at`, `completed_at`.
- *Observability* — Pending and Done sets explicitly queryable; per-unit fields and rejection reasons explicitly user-visible.
- *Identity policy* — initially absorbed into the pattern as a 24-hour deletion record, then extracted to a separate composing concept ([Duplicate Prevention](./duplicate-prevention.md)) on the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) principle that concepts should be freestanding and generic. Recency-based duplicate prevention does not belong inside Personal Todo.

The first four gaps closed in-pattern. The fifth was the most instructive: the spec naturally absorbed it on first pass, then was corrected by re-reading EOS — the concern was generic, applied across many other concepts (comments, payments, form submissions, newsletter signups), and belonged to its own freestanding concept.

**Second pass** — adversarial pressure-test in the Linus Torvalds mode surfaced five further gaps in the simplified version:

- *Identity model muddled.* The active-set uniqueness invariant implied description = identity, but `add(description)` returning what-exactly was unspecified, and `edit` would have changed identity if so. Resolved: explicit `id` model. Description is a property under active-set uniqueness, not identity. A new invariant (id stability) asserts that ids never change once assigned.
- *`add` return value unspecified.* Resolved: `add(description) → id | rejected(reason)`. All other actions take an `id`.
- *Description rules unspecified.* Empty? Whitespace? Unicode normalization? Length? Resolved: explicit Description policy subsection (NFC + trim + non-empty + max-length, configurable, case-sensitive comparison).
- *Timestamp monotonicity malformed.* The chain inequality assumed all terms were defined. Resolved: expressed as three conditional inequalities.
- *Examples were happy-path only.* Resolved: added a fourth Examples entry (Rejection paths) that exercises all five rejection reasons in a single sequence.

Three of the original Linus-pass gaps were marked explicit out-of-scope rather than fixed in-pattern: concurrent action sequences, atomicity / crash semantics, and clock semantics. Each is a deferred concern with a forthcoming composing pattern named in Edge cases and Composition notes.

The two passes together exercise the architecture as designed: GRID's (the nine-node completeness framework — Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof) nine nodes catch completeness gaps; EOS's freestanding-concepts principle catches over-absorption gaps; adversarial pressure-testing catches the load-bearing decisions that hide beneath summary prose. The pattern is stronger because all three checks happened.

**Refinement round 1.** Three findings, all closed in-pattern. Conventions inherited from the methodology directly.

- *Action signatures used `rejected(reason)` placeholders; `storage-failure` absent from all four.* All four signatures named `rejected(reason)` with the reason taxonomy living only in Feedback and Decision points prose. Resolved: signatures expanded — `add` returns `rejected(invalid-description | duplicate-active | storage-failure)`, `edit` returns `rejected(not-known | not-pending | not-editable | invalid-description | duplicate-active | storage-failure)`, `complete` returns `rejected(not-known | not-pending | storage-failure)`, `delete` returns `rejected(not-known | storage-failure)`. Feedback updated to include `storage-failure`.
- *`storage-failure` missing from Decision points.* All four actions write to state; none previously named the write-failure path. Resolved: each Decision point extended. `add` — no unit created on storage-failure. `edit` — unit unchanged; the no-op case (normalized new description equals current) produces no write and cannot storage-fail. `complete` — unit remains in Pending. `delete` — unit unchanged. Decision points for `edit`, `complete`, and `delete` also restructured to separate the `not-known` check as the first gate before state-specific checks.
- *Cross-file consistency gap triggered by this refinement.* Undo History and Shared Todo both used `invalid-request` for Personal Todo's description-validation rejection during their earlier refinement rounds — the correct reason, confirmed here, is `invalid-description`. Undo History's `edit` signature also omitted `not-editable`. Resolved: both files corrected retroactively in the same pass.

**Scheduled rescan: 2026-05-20 — clean.**

**Formal-layer vote — 2026-06-03: NO.** Single-state structural invariants (membership exclusivity, id stability, active-set uniqueness) plus timestamp inequalities, fully exercised by records-alone checks; the methodology's own minimum-formalism reference. Grounds English-only (minimum-formalism). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**AI adversarial round — Final Critique 4 (first real AI round) — 2026-06-18.** This atom grounded 2026-05-20 under the early process — foundation plus refinement, with no fresh-reader AI adversarial round — and carried the legacy grandfathered token. This round is that missing AI-conducted adversarial round (fresh-reader Opus, Happy-Torvalds-X2); it is the atom's Final Critique 4 (Rounds 1–3 the foundation/refinement baseline, per pressure-testing.md §Round structure). Two foundational findings closed: F1 Logic Confinement (`id` and the clock now host-injected at the I/O seam, was 'implicit clock'/'system-generated'); F2 the unreachable `not-pending` rejection removed from `edit` (the two-live-state model makes a non-Pending live unit necessarily Done → `not-editable`); `complete`'s reachable `not-pending` is preserved. Caller signatures unchanged and the invariant set held at 8, so the fixes are additive with no constituent-change cascade. Formal-layer vote stands NO (English-only, minimum-formalism). Confirming fresh-reader Opus clearance gate (2026-06-18): CLEAR, 0 foundational, no new surface. Compositions affected — confirming check only, NOT a re-pass: Shared Todo, Undo History. Note: Shared Todo and Undo History propagated the same `not-pending` into their own `edit` taxonomy; that is flagged for their own re-pass and is non-breaking (an unreachable arm, not a lost outcome). Grounds at Final Critique 4.
