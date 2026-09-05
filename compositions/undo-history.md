---
title: Undo History
parent: Conceptual Compositions
nav_order: 1
has_toc: true
toc: true
---

# Undo History

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Undo History combines two simpler patterns — a single-user task list (Personal Todo) and an add-only record of everything that happens (Event Log) — to give the task list a familiar undo (Cmd+Z) capability that neither part has on its own.

The trick is that the list's current state is not stored directly; it is recomputed by replaying the recorded history of actions, skipping any that have been undone. Every action a user takes adds an entry to the history; undoing adds an entry that marks the most recent action as skipped; replaying the adjusted history produces exactly the state the user expects.

Combining the two patterns produces guarantees neither has alone — chiefly that undoing a deletion brings the task back with its original identifier, timestamps, and description intact, rather than as a brand-new task. (A property that appears only when patterns are combined is called an emergent guarantee.)

This is the building block for any single-user surface where people expect undo to work and a recoverable history is wanted as a side effect.

---

## Intent

The user expects a familiar undo capability — the ability to take back the last thing they did. Personal Todo on its own does not provide this: each action is committed and there is no native "undo" surface. Event Log on its own provides a faithful record of what happened but does not act on it.

This composition composes the two. Every action the user takes against Personal Todo is recorded in an Event Log instance owned by the composition. An additional [Undo] action consults the log, identifies the most recent forward action not already undone, and adjusts the composition's derived Personal Todo state to be equivalent to the state had that action never occurred.

The composition is event-sourced (state is derived by replaying a log of recorded events rather than storing the current state directly). Personal Todo state at any moment is defined as the result of replaying the log's non-undone events from the beginning. Forward actions append events; undo appends compensating events; replay produces the current state. Personal Todo's atom spec is unchanged. Event Log's atom spec is unchanged. The composition is the wiring.

---

## Composes

- **[Personal Todo](../atoms/personal-todo.md)** — provides the substrate state machine, transition rules, and all its invariants. The composition maintains a Personal Todo–shaped state derived from the Event Log.
- **[Event Log](../atoms/event-log.md)** — provides the durable, append-only record of every action. The composition owns one Event Log instance for each Personal Todo it operates on.

---

## Composition logic

### Event schemas

The composition writes five event types into its Event Log instance:

```
{type: "add",      event_id, recorded_at, id, description}
{type: "edit",     event_id, recorded_at, id, prior_description, new_description}
{type: "complete", event_id, recorded_at, id}
{type: "delete",   event_id, recorded_at, id, snapshot}
{type: "undo",     event_id, recorded_at, undone_event_id, undone_event_type}
```

`event_id` and `recorded_at` are supplied by Event Log's `append` — the log's own id and timestamp assignment at its seam; Event Log's event-immutability invariant then fixes both once appended. `id` is the Personal Todo unit identifier (per Personal Todo's identity model). `snapshot` for delete events captures the unit's full state — `description`, current state (Pending or Done), and all defined timestamps. **Replay never consumes `snapshot` or `prior_description`:** reconstruction always comes from replaying the surviving events (the load-bearing wiring decision), never from these fields. Both are audit-and-inspection conveniences — what a delete removed and what an edit replaced are readable straight from the log via [Read History], with no replay — kept in the schemas for that reading, not as replay inputs.

### Action wiring

The composition replaces Personal Todo's direct API (Application Programming Interface) surface. Users call the composition's actions; the composition updates both the Event Log and the derived state. Event Log's `append` also declares an `invalid-payload` arm; the composition forecloses it by construction — every payload it appends is one of the five fixed schemas above, machine-built from already-validated inputs — so an `invalid-payload` return is never a caller-visible outcome: it would indicate a composition defect and is surfaced as a deployment fault, not mapped to any caller rejection.

- **[Add]** — (Projected contract: `add(description) → id | rejected(invalid-description | duplicate-active | storage-failure)`) — Validate against Personal Todo's `add` precondition (description policy + active-set uniqueness against the *current derived state*); reject with `invalid-description` or `duplicate-active` if the precondition fails. On success, the host allocates the new unit `id` at the composition's I/O seam (injected before the action's transition; not generated inside it), append `{type: "add", id, description}` to the Event Log. If the append returns `rejected(storage-failure)`, return `storage-failure` to the caller without updating the derived state — the action did not happen. On successful append, update the derived state (per Replay semantics), return `id`.
- **[Edit]** — (Projected contract: `edit(id, newDescription) → ok | rejected(not-known | not-editable | invalid-description | duplicate-active | storage-failure)`) — Validate against Personal Todo's `edit` precondition; reject with `not-known`, `not-editable`, `invalid-description`, or `duplicate-active` if the precondition fails. On success, capture the unit's current description as the [Prior Description], append `{type: "edit", id, prior_description, new_description}`. If the append returns `rejected(storage-failure)`, return `storage-failure` without updating the derived state. On successful append, update the derived state (per Replay semantics), return `ok`. **No-op edit:** when the normalized [New Description] equals the unit's current description, Personal Todo declares the edit an accepted no-op that writes nothing — the composition mirrors the constituent exactly: nothing is appended, no [Prior Description] is captured, the derived state is untouched, `ok` is returned, and `storage-failure` is impossible (there is no append to fail). A no-op edit is therefore never an [Undo] target.
- **[Complete]** — (Projected contract: `complete(id) → ok | rejected(not-known | not-pending | storage-failure)`) — Validate against Personal Todo's `complete` precondition; reject with `not-known` or `not-pending` if the precondition fails. On success, append `{type: "complete", id}`. If the append returns `rejected(storage-failure)`, return `storage-failure` without updating the derived state. On successful append, update the derived state (per Replay semantics), return `ok`.
- **[Delete]** — (Projected contract: `delete(id) → ok | rejected(not-known | storage-failure)`) — Validate against Personal Todo's `delete` precondition; reject with `not-known` if the precondition fails. On success, capture the unit's full state as its [Snapshot], append `{type: "delete", id, snapshot}`. If the append returns `rejected(storage-failure)`, return `storage-failure` without updating the derived state. On successful append, update the derived state (per Replay semantics), return `ok`.
- **[Undo]** — (Projected contract: `undo() → undone_event_type | rejected(nothing-to-undo | storage-failure)`) — Identify the most recent forward event (type ∈ {add, edit, complete, delete}) whose `event_id` is not already in the undone set. If none, reject as [Nothing To Undo]. Otherwise, append `{type: "undo", undone_event_id, undone_event_type}` to the Event Log. If the append returns `rejected(storage-failure)`, return `storage-failure` without recomputing the derived state — the undo did not happen. On successful append, recompute the derived state per the Replay semantics section below (replaying the Event Log and skipping events whose `event_id` is now in the undone set), return the [Undone Event Type] — the type of the undone action. **The undone action is reversed by *re-derivation*, not by any reversing call to Personal Todo:** the constituent is never asked to undo a transition (e.g. to move a unit from Done back to Pending). The recomputed state is simply one in which the skipped event never occurred, so Personal Todo's persistence-of-completion invariant is never challenged — the composition operates at the log level, the atom only ever sees forward, valid actions during replay (Invariant 4).
- **[Read History]** — (Projected contract: `read_history(query) → ordered_sequence_of_events | rejected(invalid-query)`) — Pass through to Event Log's `read`. The user can inspect their history at any time.

### Replay semantics

The derived Personal Todo state at any moment is computed as follows:

1. Read all events from the Event Log in `sequence_number` order.
2. Build the **undone set**: the set of [Undone Event Id] values from all `undo` events.
3. For each event in order:
   - If the event's type is `undo`, skip (already accounted for in the undone set).
   - If the event's `event_id` is in the undone set, skip.
   - Otherwise, apply the event to a Personal Todo–shaped state under construction:
     - `add` → introduce a unit at the recorded `id` in Pending, with `added_at = recorded_at` and the recorded `description`.
     - `edit` → replace the unit's `description` with the [New Description]; set `last_edited_at = recorded_at`.
     - `complete` → move the unit at `id` from Pending to Done with `completed_at = recorded_at`.
     - `delete` → remove the unit at `id` from the state.

Replay assumes events were recorded only on successful actions, which guarantees Personal Todo's preconditions hold at every replay step. (This is the set of events Event Log Invariant 5 — read consistency over successfully-appended events — bounds the replay to.)

**Contract classification** ([`execution-contract.md`](../execution-contract.md) §Composition state): the derived Personal-Todo-shaped state is a **derived index by construction** — the Event Log is the sole truth (the load-bearing wiring decision), the replay above *is* the named rebuild procedure, and the composition stores nothing the replay does not regenerate. The Contract's three obligations hold trivially: the projection sits outside any atomicity surface (there is no second truth-bearing write to coordinate with the append), a lost or stale materialization is a rebuild trigger and never data loss, and no consistency claim attaches beyond replay determinism itself (Invariant 4). An implementation MAY materialize the projection as a cache for read performance; that cache is then an ordinary derived index read with rebuild-on-miss semantics, and no invariant of this composition may be evaluated against the cache in preference to a fresh replay.

### The load-bearing wiring decision

The decision the composition exists to enforce: **identity preservation across delete and undo is achieved through replay of the original event sequence rather than through state restoration from a snapshot**.

*Principle.* When a user undoes a `delete`, the deleted unit must be restored at its original `id`, with its original `added_at`, `last_edited_at` (if any), and state intact — not as a fresh unit with a new id and reset timestamps. This identity preservation is the property users expect from undo and the property that makes the composition useful as a building block for audit-trail-adjacent uses.

*Likely objection.* "Couldn't the `delete` action save a snapshot and [Undo] restore from it?" Per-action snapshots (the Memento pattern) restore state but produce a new copy of the unit — a fresh `add` against Personal Todo would issue a new id, resetting timestamps and losing the unit's historical identity.

*Mechanism.* The composition makes Personal Todo event-sourced: it never calls Personal Todo's native `delete` directly on state and stores no separate state. The Event Log is the source of truth; the derived state is a projection. Undoing a delete appends a compensating event and rereplays the log skipping that event — the original `add` event is still in the log, so the unit is reconstructed at its original `id` with its original timestamps. Personal Todo's own `delete` is terminal and irreversible; the composition circumvents this by operating at the log level rather than the state level.

*Result.* Identity preservation across delete/undo (Invariant 6) falls out of the replay mechanism as an emergent property — it is not designed in as a special case. The constituent atoms are unchanged; the composition is entirely in the wiring.

---

## Composition-level invariants

These invariants emerge from the composition. None of them belong to a single constituent atom; each requires both atoms working together to hold.

- **Invariant 1 — Log faithfulness.** Every successful *state-changing* user action (forward or undo) appends exactly one event to the Event Log. The one accepted action that changes no state — Personal Todo's normalized-equal no-op [Edit] — appends nothing, mirroring the constituent's own no-write contract (Action wiring). No event appears in the log without a corresponding user action; no state-changing user action goes unrecorded.
- **Invariant 2 — State equivalence.** At any time, the composition's exposed Personal Todo state equals the result of replaying the Event Log's non-undone events from the beginning under the replay semantics above. The state is not stored separately; it is *defined* by the log.
- **Invariant 3 — Undo targets the most recent forward event.** Each `undo` event's `undone_event_id` references the most recent forward event whose `event_id` was not already in the undone set at the time the undo was issued.
- **Invariant 4 — Personal Todo's invariants are preserved.** All invariants from Personal Todo hold over the derived state at every moment, **scoped per replay** — the scoping the [Undo] wiring states: within any single replayed state, every Personal Todo invariant, the temporal ones included, holds exactly as it would over a direct forward history, because every surviving event was a successful action against a then-valid state. Across successive replays the exposed timeline may deliberately rewind (an undo removes the newest surviving event), so cross-replay temporal claims — e.g. that a completion once exposed stays exposed — are the composition's designed undo behavior, outside this invariant, not a constituent violation.
- **Invariant 5 — Event Log's invariants are preserved.** All invariants from Event Log hold. The composition never deletes or rewrites events; undo is implemented via compensating appends (new events that logically cancel a prior event, leaving the original record intact), not via mutation.
- **Invariant 6 — Identity preservation across delete/undo.** Undoing a `delete` restores the unit at its original `id` with its original `added_at`, `last_edited_at` (if any), `completed_at` (if Done), and prior state (Pending or Done). The original `add` event remains in the log; replay skipping the `delete` reconstructs the unit faithfully. Personal Todo on its own cannot do this — its `delete` is terminal and a fresh `add` produces a new id. The composition with Event Log buys back identity preservation as an emergent property.
- **Invariant 7 — Reachability of prior states.** From any point in the user's history, a finite sequence of [Undo] calls walks the exposed state back through the states of the **current non-undone event sequence** — after each undo, the exposed state is the replay of that sequence minus its newest event — provided no further forward actions intervene. Two classes of prior composition-visible state are deliberately outside the walk, and reaching either is Redo's territory: the state each undo itself abandons (add → complete → undo leaves the Done state behind; no sequence of further undos revisits it), and states behind events already undone once forward actions resume. In both cases the events remain in the log; only a separate Redo pattern re-applies them.

The verification surface is records-alone: every invariant above is checkable from the composition's Event Log instance by replay — no stored state, runbook, or developer narration is consulted.

---

## Examples

### Walkthrough

A user opens a fresh Personal Todo with Undo History:

1. `add("buy milk")` → returns `t1`. Log: `[add(t1)]`. State: `t1` Pending.
2. `add("renew passport")` → returns `t2`. Log: `[add(t1), add(t2)]`. State: `t1`, `t2` Pending.
3. `complete(t1)` → `ok`. Log: `[add(t1), add(t2), complete(t1)]`. State: `t1` Done, `t2` Pending.
4. `undo()` → returns `"complete"`. Log appends `undo(complete(t1))`. Replay skips `complete(t1)`. State: `t1` Pending, `t2` Pending.
5. `delete(t1)` → `ok`. Log appends `delete(t1, snapshot)`. State: `t2` Pending.
6. `undo()` → returns `"delete"`. Log appends `undo(delete(t1))`. Replay skips `delete(t1)`. State: `t1` Pending, `t2` Pending — `t1` is back with its original id, original `added_at`, and Pending state.
7. `add("walk dog")` → returns `t3`. State: `t1`, `t2`, `t3` Pending. The previously-undone events (`complete(t1)`, `delete(t1)`) remain in the log but are unreachable via further [Undo] (that would require Redo).

### Identity preservation across delete/undo

A user adds *"buy milk"* (id `m1`), completes `m1`, deletes `m1`. The Event Log holds the full trail. The user undoes the delete; replay skips `delete(m1)` and `m1` returns to the derived state as Done — same id, same `added_at`, same `completed_at`, same description. Identity is preserved across the delete-undo cycle. Personal Todo's atom on its own cannot do this; its `delete` is terminal and restoration via `add` would produce a new id with reset timestamps. The composition with Event Log produces identity preservation as an *emergent property* of replay.

### Audit-as-side-effect

A user later asks *"what did I do this week?"* The composition calls `read_history({recorded_at: last_7_days})` and returns the full sequence including undos. Same Event Log instance, no additional atoms required. If the user later wants the history protected for compliance, composing this composition's Event Log with [Audit Trail](./audit-trail.md) adds attribution, retention, and tamper-evidence without changing the composition above.

### Rejection paths

A user starts fresh:

1. `add("buy milk")` → `t1`. State: `t1` Pending.
2. `undo()` → returns `"add"`. Log appends `undo(add(t1))`. State: empty.
3. `undo()` → `rejected(nothing-to-undo)`. The log has one forward event (`add(t1)`) and one undo event referencing it. Every forward event is already in the undone set; there is nothing left to undo. Log and state are unchanged.

Storage failure path: the user calls `add("walk dog")` and Event Log's `append` returns `rejected(storage-failure)`. The composition returns `storage-failure` to the caller; the derived state is not updated. No partial state is visible; the action did not happen. The same pattern applies for [Undo]: if the compensating-event append fails, [Undo] returns `storage-failure` and the derived state is not recomputed.

---

## Edge cases and explicit non-goals

What this composition does not cover:

- **Redo.** Once an action is undone and a new forward action is taken, the undone action cannot be re-applied via this composition. Redo requires a Redo Stack pattern that interprets a different class of compensating events. The current composition's [Undo] is one-directional.
- **Branching history.** No support for "go back in time and take a different action." The log is linear; alternate timelines are out of scope.
- **Selective undo.** [Undo] always targets the most recent non-undone forward event. Undoing a specific earlier action while preserving more recent actions ("undo my edit from twenty minutes ago, keep everything since") is not supported — it would require event-dependency analysis and is a separate pattern.
- **Undo of undo.** Forward events can be undone; undo events cannot. Reversing an undo is the redo operation, out of scope.
- **Persistence across restarts.** The composition assumes the Event Log is durable across composition restarts (a deployment property of the Event Log instance). If the log is volatile, the undo history resets at restart, which most users will not expect.
- **Initialization from an existing log.** The composition assumes its Event Log instance is either fresh (no events) at start, or an existing log whose events represent the prior history of the same Personal Todo. Inheriting an Event Log from a different system or substrate, or merging logs across substrates, is out of scope — that is an Import or Migration pattern.
- **Concurrent actors.** Single-actor only, inherited from Personal Todo. Multi-actor undo (one user undoes another user's action) requires composing Shared Todo + Event Log + a Concurrency Resolution pattern.
- **Long-history performance.** Replay from the beginning of the log is O(n) in log size. For systems with millions of events, compose with a Snapshot pattern (forthcoming) that periodically captures the derived state and lets replay start from the most recent snapshot.
- **User expectation of undo scope.** The composition's rule — *"most recent forward event not already undone"* — is unambiguous, but in long sequences with multiple undos the rule may not match user intuition (which often imagines undo as walking back through *visible* history rather than *unredacted* history). The mapping between this rule and the surface UX (user experience) belongs to the presentation layer, not to this spec.

Where the composition breaks down: when the underlying Event Log cannot guarantee durability or total order; when Personal Todo is replaced with a substrate whose actions are not all reversible by replay (actions with external side effects — sending emails, charging cards — where the side effect is not reversible by skipping the event).

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. This is a composition, so its own concepts are the composed action-wirings it exposes ([Add], [Edit], [Complete], [Delete], [Undo]) and the derived read over its log ([Read History]), plus the fields of the event records it owns ([Snapshot], [Prior Description], [New Description], [Undone Event Id], [Undone Event Type]) and its own [Nothing To Undo] rejection. It defines **no new record type**: its exposed state is a derived projection of [Personal Todo](../atoms/personal-todo.md)'s shape (event-sourced — recomputed by replay, not stored) and its events live in an [Event Log](../atoms/event-log.md) instance, so its Fields are carded against the plain-noun event records (the delete / edit / undo event). References to the constituent atoms and their operations — Personal Todo's `add`/`edit`/`complete`/`delete` preconditions, Event Log's `append`/`read` — remain qualified calls to those atoms. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the composition above.)*

#### Add

The composition action that records a new task: it validates Personal Todo's `add` precondition against the current derived state, has the host allocate the unit `id` at the I/O seam, and appends an `add` event. Returns the new `id`, or a delegated Personal Todo / Event Log rejection.

Kind: Operation

#### Edit

The composition action that changes a task's description: it validates Personal Todo's `edit` precondition, then appends an `edit` event carrying the [Prior Description] and the [New Description]. Returns `ok`, or a delegated rejection.

Kind: Operation

#### Complete

The composition action that marks a task done: it validates Personal Todo's `complete` precondition, then appends a `complete` event. Returns `ok`, or a delegated rejection.

Kind: Operation

#### Delete

The composition action that removes a task: it validates Personal Todo's `delete` precondition, captures the unit's full state as its [Snapshot], then appends a `delete` event. Returns `ok`, or a delegated rejection. The removal is reversible — [Undo] restores the unit by replaying the surviving events.

Kind: Operation

#### Undo

The composition's emergent action: it finds the most recent forward event not already undone, appends an `undo` event naming it (via the [Undone Event Id] and [Undone Event Type]), and recomputes the derived state by replay. Returns the [Undone Event Type], or [Nothing To Undo] when every forward event is already undone. Neither constituent atom offers this alone.

Kind: Operation

#### Read History

The derived read query: a passthrough to the Event Log's `read` that returns the recorded event sequence — forward actions and undos — for a query. Lets the user inspect their history at any time.

Kind: Operation

#### Snapshot

The delete event's captured copy of the unit's full state — its `description`, current Pending/Done state, and all defined timestamps. An audit-and-inspection convenience: what was deleted is readable straight from the log with no replay. Replay itself never consumes it — reconstruction comes from replaying the surviving events (Event schemas).

Kind:      Field
Field of:  the delete event
Role:      the deleted unit's full prior state
Projects:  snapshot

#### Prior Description

The edit event's record of the task description as it stood before the edit.

Kind:      Field
Field of:  the edit event
Role:      the pre-edit description
Projects:  prior_description

#### New Description

The edit event's record of the description the edit sets — applied to the unit on replay.

Kind:      Field
Field of:  the edit event
Role:      the post-edit description
Projects:  new_description

#### Undone Event Id

The undo event's reference to the forward event it cancels — the most recent one not already in the undone set. Replay skips the event bearing this id.

Kind:      Field
Field of:  the undo event
Role:      the target forward event
Projects:  undone_event_id

#### Undone Event Type

The undo event's record of the cancelled forward event's kind (`add`, `edit`, `complete`, or `delete`) — returned to the caller of [Undo].

Kind:      Field
Field of:  the undo event
Role:      the kind of action undone
Projects:  undone_event_type

#### Nothing To Undo

The [Undo] action's own rejection — returned when no forward event remains to reverse: the log is empty, or every forward event in it is already in the undone set. The log and derived state are left unchanged.

Kind:      Member
Member of: the undo rejection
Role:      Outcome
Projects:  nothing-to-undo

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Add]: #add
[Edit]: #edit
[Complete]: #complete
[Delete]: #delete
[Undo]: #undo
[Read History]: #read-history
[Snapshot]: #snapshot
[Prior Description]: #prior-description
[New Description]: #new-description
[Undone Event Id]: #undone-event-id
[Undone Event Type]: #undone-event-type
[Nothing To Undo]: #nothing-to-undo

---

## Standards references

This composition draws on:

- **Event sourcing** (Greg Young, Martin Fowler) — the architectural pattern of deriving state from an append-only log of events. Undo via compensating events is a classical event-sourcing technique.
- **Memento pattern** (GoF — the "Gang of Four", the four authors of *Design Patterns*, 1994) — the object-oriented antecedent: capture state before each action, restore on undo. Memento is per-object and ephemeral; event-sourcing generalizes it across the whole composition and persists it.
- **Command pattern** (GoF) — actions as first-class objects. Each forward event in the log is essentially a serialized command.
- **Vim's undo tree, Emacs's undo ring** — practical implementations of linear and branching undo in editor history. Linear undo is the closest analogue to this composition; branching is out of scope.

The two atoms it composes carry their own standards inheritance — Personal Todo (Jackson / EOS — the Essence of Software, Daniel Jackson's concept framework; Eiffel design-by-contract; LTL — linear temporal logic, a formal notation for reasoning about sequences of states) and Event Log (ISO/IEC 27001 — the International Organization for Standardization / International Electrotechnical Commission information-security standard; NIST SP 800-92 — National Institute of Standards and Technology log-management guidance; W3C — World Wide Web Consortium — Activity Streams 2.0; write-ahead logging literature).

---

## Status

`grounded on Final Critique 6 — 2026-08-26` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 6 — 2026-08-26
formal: verified — undo-history.tla + 3 twins, 2026-06-14
last gate: 2026-08-26 — Final Critique 6, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- compositions/undo-history.md`.
