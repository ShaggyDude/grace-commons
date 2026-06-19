---
title: Undo History
parent: Compositions
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


> An application: every Personal Todo action is reversible. Composes Personal Todo with Event Log to give the user a familiar Cmd+Z experience without modifying either constituent atom.

---

## Intent

The user expects a familiar undo capability — the ability to take back the last thing they did. Personal Todo on its own does not provide this: each action is committed and there is no native "undo" surface. Event Log on its own provides a faithful record of what happened but does not act on it.

This application composes the two. Every action the user takes against Personal Todo is recorded in an Event Log instance owned by the application. An additional `undo` action consults the log, identifies the most recent forward action not already undone, and adjusts the application's derived Personal Todo state to be equivalent to the state had that action never occurred.

The application is event-sourced (state is derived by replaying a log of recorded events rather than storing the current state directly). Personal Todo state at any moment is defined as the result of replaying the log's non-undone events from the beginning. Forward actions append events; undo appends compensating events; replay produces the current state. Personal Todo's atom spec is unchanged. Event Log's atom spec is unchanged. The application is the wiring.

---

## Summary

Undo History combines two simpler patterns — a single-user task list (Personal Todo) and an add-only record of everything that happens (Event Log) — to give the task list a familiar undo (Cmd+Z) capability that neither part has on its own. The trick is that the list's current state is not stored directly; it is recomputed by replaying the recorded history of actions, skipping any that have been undone. Every action a user takes adds an entry to the history; undoing adds an entry that marks the most recent action as skipped; replaying the adjusted history produces exactly the state the user expects. Combining the two patterns produces guarantees neither has alone — chiefly that undoing a deletion brings the task back with its original identifier, timestamps, and description intact, rather than as a brand-new task. (A property that appears only when patterns are combined is called an emergent guarantee.) This is the building block for any single-user surface where people expect undo to work and a recoverable history is wanted as a side effect.

---

## Composes

- **[Personal Todo](../atoms/personal-todo.md)** — provides the substrate state machine, transition rules, and all its invariants. The application maintains a Personal Todo–shaped state derived from the Event Log.
- **[Event Log](../atoms/event-log.md)** — provides the durable, append-only record of every action. The application owns one Event Log instance for each Personal Todo it operates on.

---

## Composition logic

### Event schemas

The application writes five event types into its Event Log instance:

```
{type: "add",      event_id, recorded_at, id, description}
{type: "edit",     event_id, recorded_at, id, prior_description, new_description}
{type: "complete", event_id, recorded_at, id}
{type: "delete",   event_id, recorded_at, id, snapshot}
{type: "undo",     event_id, recorded_at, undone_event_id, undone_event_type}
```

`event_id` and `recorded_at` are supplied by Event Log's `append` (per its event-immutability invariant). `id` is the Personal Todo unit identifier (per Personal Todo's identity model). `snapshot` for delete events captures the unit's full state — `description`, current state (Pending or Done), and all defined timestamps — sufficient for replay to reconstruct the unit faithfully.

### Action wiring

The application replaces Personal Todo's direct API surface. Users call the application's actions; the application updates both the Event Log and the derived state.

- **`add(description) → id | rejected(invalid-description | duplicate-active | storage-failure)`** — Validate against Personal Todo's `add` precondition (description policy + active-set uniqueness against the *current derived state*); reject with `invalid-description` or `duplicate-active` if the precondition fails. On success, the host allocates the new unit `id` at the composition's I/O seam (injected before the action's transition; not generated inside it), append `{type: "add", id, description}` to the Event Log. If the append returns `rejected(storage-failure)`, return `storage-failure` to the caller without updating the derived state — the action did not happen. On successful append, update the derived state, return `id`.
- **`edit(id, newDescription) → ok | rejected(not-known | not-editable | invalid-description | duplicate-active | storage-failure)`** — Validate against Personal Todo's `edit` precondition; reject with `not-known`, `not-editable`, `invalid-description`, or `duplicate-active` if the precondition fails. On success, capture the unit's current description as `prior_description`, append `{type: "edit", id, prior_description, new_description}`. If the append returns `rejected(storage-failure)`, return `storage-failure` without updating the derived state. On successful append, update the derived state, return `ok`.
- **`complete(id) → ok | rejected(not-known | not-pending | storage-failure)`** — Validate against Personal Todo's `complete` precondition; reject with `not-known` or `not-pending` if the precondition fails. On success, append `{type: "complete", id}`. If the append returns `rejected(storage-failure)`, return `storage-failure` without updating the derived state. On successful append, update the derived state, return `ok`.
- **`delete(id) → ok | rejected(not-known | storage-failure)`** — Validate against Personal Todo's `delete` precondition; reject with `not-known` if the precondition fails. On success, capture the unit's full state as `snapshot`, append `{type: "delete", id, snapshot}`. If the append returns `rejected(storage-failure)`, return `storage-failure` without updating the derived state. On successful append, update the derived state, return `ok`.
- **`undo() → undone_event_type | rejected(nothing-to-undo | storage-failure)`** — Identify the most recent forward event (type ∈ {add, edit, complete, delete}) whose `event_id` is not already in the undone set. If none, reject as `nothing-to-undo`. Otherwise, append `{type: "undo", undone_event_id, undone_event_type}` to the Event Log. If the append returns `rejected(storage-failure)`, return `storage-failure` without recomputing the derived state — the undo did not happen. On successful append, recompute the derived state per the Replay semantics section below (replaying the Event Log and skipping events whose `event_id` is now in the undone set), return the type of the undone action. **The undone action is reversed by *re-derivation*, not by any reversing call to Personal Todo:** the constituent is never asked to undo a transition (e.g. to move a unit from Done back to Pending). The recomputed state is simply one in which the skipped event never occurred, so Personal Todo's persistence-of-completion invariant is never challenged — the composition operates at the log level, the atom only ever sees forward, valid actions during replay (Invariant 4).
- **`read_history(query) → ordered_sequence_of_events | rejected(invalid-query)`** — Pass through to Event Log's `read`. The user can inspect their history at any time.

### Replay semantics

The derived Personal Todo state at any moment is computed as follows:

1. Read all events from the Event Log in `sequence_number` order.
2. Build the **undone set**: the set of `undone_event_id` values from all `undo` events.
3. For each event in order:
   - If the event's type is `undo`, skip (already accounted for in the undone set).
   - If the event's `event_id` is in the undone set, skip.
   - Otherwise, apply the event to a Personal Todo–shaped state under construction:
     - `add` → introduce a unit at the recorded `id` in Pending, with `added_at = recorded_at` and the recorded `description`.
     - `edit` → replace the unit's `description` with `new_description`; set `last_edited_at = recorded_at`.
     - `complete` → move the unit at `id` from Pending to Done with `completed_at = recorded_at`.
     - `delete` → remove the unit at `id` from the state.

Replay assumes events were recorded only on successful actions, which guarantees Personal Todo's preconditions hold at every replay step. (This is the set of events Event Log Invariant 5 — read consistency over successfully-appended events — bounds the replay to.)

### The load-bearing wiring decision

The decision the composition exists to enforce: **identity preservation across delete and undo is achieved through replay of the original event sequence rather than through state restoration from a snapshot**.

*Principle.* When a user undoes a `delete`, the deleted unit must be restored at its original `id`, with its original `added_at`, `last_edited_at` (if any), and state intact — not as a fresh unit with a new id and reset timestamps. This identity preservation is the property users expect from undo and the property that makes the composition useful as a building block for audit-trail-adjacent applications.

*Likely objection.* "Couldn't the `delete` action save a snapshot and `undo` restore from it?" Per-action snapshots (the Memento pattern) restore state but produce a new copy of the unit — a fresh `add` against Personal Todo would issue a new id, resetting timestamps and losing the unit's historical identity.

*Mechanism.* The composition makes Personal Todo event-sourced: it never calls Personal Todo's native `delete` directly on state and stores no separate state. The Event Log is the source of truth; the derived state is a projection. Undoing a delete appends a compensating event and rereplays the log skipping that event — the original `add` event is still in the log, so the unit is reconstructed at its original `id` with its original timestamps. Personal Todo's own `delete` is terminal and irreversible; the composition circumvents this by operating at the log level rather than the state level.

*Result.* Identity preservation across delete/undo (Invariant 6) falls out of the replay mechanism as an emergent property — it is not designed in as a special case. The constituent atoms are unchanged; the composition is entirely in the wiring.

---

## Composition-level invariants

These invariants emerge from the composition. None of them belong to a single constituent atom; each requires both atoms working together to hold.

- **Invariant 1 — Log faithfulness.** Every successful user action (forward or undo) appends exactly one event to the Event Log. No event appears in the log without a corresponding user action; no user action goes unrecorded.
- **Invariant 2 — State equivalence.** At any time, the application's exposed Personal Todo state equals the result of replaying the Event Log's non-undone events from the beginning under the replay semantics above. The state is not stored separately; it is *defined* by the log.
- **Invariant 3 — Undo targets the most recent forward event.** Each `undo` event's `undone_event_id` references the most recent forward event whose `event_id` was not already in the undone set at the time the undo was issued.
- **Invariant 4 — Personal Todo's invariants are preserved.** All invariants from Personal Todo hold over the derived state at every moment. Replay never produces an invalid Personal Todo state, because every recorded forward event was a successful action against a then-valid state.
- **Invariant 5 — Event Log's invariants are preserved.** All invariants from Event Log hold. The application never deletes or rewrites events; undo is implemented via compensating appends (new events that logically cancel a prior event, leaving the original record intact), not via mutation.
- **Invariant 6 — Identity preservation across delete/undo.** Undoing a `delete` restores the unit at its original `id` with its original `added_at`, `last_edited_at` (if any), and prior state (Pending or Done). The original `add` event remains in the log; replay skipping the `delete` reconstructs the unit faithfully. Personal Todo on its own cannot do this — its `delete` is terminal and a fresh `add` produces a new id. The composition with Event Log buys back identity preservation as an emergent property.
- **Invariant 7 — Reachability of prior states.** From any point in the user's history, the user can return to any prior application-visible state via a finite sequence of `undo` calls — provided no further forward actions intervene. After any forward action following undos, the previously-undone events remain in the log but cannot be reached via `undo` (that would require a separate Redo pattern).

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
7. `add("walk dog")` → returns `t3`. State: `t1`, `t2`, `t3` Pending. The previously-undone events (`complete(t1)`, `delete(t1)`) remain in the log but are unreachable via further `undo` (that would require Redo).

### Identity preservation across delete/undo

A user adds *"buy milk"* (id `m1`), completes `m1`, deletes `m1`. The Event Log holds the full trail. The user undoes the delete; replay skips `delete(m1)` and `m1` returns to the derived state as Done — same id, same `added_at`, same `completed_at`, same description. Identity is preserved across the delete-undo cycle. Personal Todo's atom on its own cannot do this; its `delete` is terminal and restoration via `add` would produce a new id with reset timestamps. The composition with Event Log produces identity preservation as an *emergent property* of replay.

### Audit-as-side-effect

A user later asks *"what did I do this week?"* The application calls `read_history({recorded_at: last_7_days})` and returns the full sequence including undos. Same Event Log instance, no additional atoms required. If the user later wants the history protected for compliance, composing this application's Event Log with [Audit Trail](./audit-trail.md) adds attribution, retention, and tamper-evidence without changing the composition above.

### Rejection paths

A user starts fresh:

1. `add("buy milk")` → `t1`. State: `t1` Pending.
2. `undo()` → returns `"add"`. Log appends `undo(add(t1))`. State: empty.
3. `undo()` → `rejected(nothing-to-undo)`. The log has one forward event (`add(t1)`) and one undo event referencing it. Every forward event is already in the undone set; there is nothing left to undo. Log and state are unchanged.

Storage failure path: the user calls `add("walk dog")` and Event Log's `append` returns `rejected(storage-failure)`. The composition returns `storage-failure` to the caller; the derived state is not updated. No partial state is visible; the action did not happen. The same pattern applies for `undo`: if the compensating-event append fails, `undo` returns `storage-failure` and the derived state is not recomputed.

---

## Edge cases and explicit non-goals

What this application does not cover:

- **Redo.** Once an action is undone and a new forward action is taken, the undone action cannot be re-applied via this application. Redo requires a Redo Stack pattern that interprets a different class of compensating events. The current application's `undo` is one-directional.
- **Branching history.** No support for "go back in time and take a different action." The log is linear; alternate timelines are out of scope.
- **Selective undo.** `undo` always targets the most recent non-undone forward event. Undoing a specific earlier action while preserving more recent actions ("undo my edit from twenty minutes ago, keep everything since") is not supported — it would require event-dependency analysis and is a separate pattern.
- **Undo of undo.** Forward events can be undone; undo events cannot. Reversing an undo is the redo operation, out of scope.
- **Persistence across restarts.** The application assumes the Event Log is durable across application restarts (a deployment property of the Event Log instance). If the log is volatile, the undo history resets at restart, which most users will not expect.
- **Initialization from an existing log.** The application assumes its Event Log instance is either fresh (no events) at start, or an existing log whose events represent the prior history of the same Personal Todo. Inheriting an Event Log from a different application or substrate, or merging logs across substrates, is out of scope — that is an Import or Migration pattern.
- **Concurrent actors.** Single-actor only, inherited from Personal Todo. Multi-actor undo (one user undoes another user's action) requires composing Shared Todo + Event Log + a Concurrency Resolution pattern.
- **Long-history performance.** Replay from the beginning of the log is O(n) in log size. For systems with millions of events, compose with a Snapshot pattern (forthcoming) that periodically captures the derived state and lets replay start from the most recent snapshot.
- **User expectation of undo scope.** The application's rule — *"most recent forward event not already undone"* — is unambiguous, but in long sequences with multiple undos the rule may not match user intuition (which often imagines undo as walking back through *visible* history rather than *unredacted* history). The mapping between this rule and the surface UX is a presentation-layer concern, not a spec concern.

Where the composition breaks down: when the underlying Event Log cannot guarantee durability or total order; when Personal Todo is replaced with a substrate whose actions are not all reversible by replay (actions with external side effects — sending emails, charging cards — where the side effect is not reversible by skipping the event).

---

## Standards references

This composition draws on:

- **Event sourcing** (Greg Young, Martin Fowler) — the architectural pattern of deriving state from an append-only log of events. Undo via compensating events is a classical event-sourcing technique.
- **Memento pattern** (GoF) — the object-oriented antecedent: capture state before each action, restore on undo. Memento is per-object and ephemeral; event-sourcing generalizes it across the whole application and persists it.
- **Command pattern** (GoF) — actions as first-class objects. Each forward event in the log is essentially a serialized command.
- **Vim's undo tree, Emacs's undo ring** — practical implementations of linear and branching undo in editor history. Linear undo is the closest analogue to this application; branching is out of scope.

The two atoms it composes carry their own standards inheritance — Personal Todo (Jackson / EOS — the Essence of Software, Daniel Jackson's concept framework; Eiffel design-by-contract; LTL — linear temporal logic, a formal notation for reasoning about sequences of states) and Event Log (ISO/IEC 27001 — the International Organization for Standardization / International Electrotechnical Commission information-security standard; NIST SP 800-92 — National Institute of Standards and Technology log-management guidance; W3C — World Wide Web Consortium — Activity Streams 2.0; write-ahead logging literature).

---

## Status

`grounded on Final Critique 4 — 2026-06-18` (Final Critique 4 — the first AI-conducted adversarial round, fresh-reader Opus, 2026-06-18 — closed two foundational findings — a propagated unreachable `not-pending` and the composition minting a unit id inside its own `add` logic; caller signatures unchanged; see Lineage. Formal-layer vote stands YES (Tier A+B TLA+ model with three buggy twins); the id-allocation site and rejection arms are out of model scope, so the fixes do not reopen it. The composition was grandfathered at the legacy `grounded — 2026-05-20` token until this round.) — composition logic specified, seven application-level invariants stated and justified, walkthrough example exercises the full action surface including delete/undo identity preservation, edge cases identify deferred concerns and the substrate's natural breakdown points. First entry in `compositions/`. Demonstrates that two existing atoms compose into a useful application without modifying either constituent.

---

## Lineage notes

This application survived all three pressure-testing passes (see [`pressure-testing.md`](../pressure-testing.md)) on its first revision.

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Clean. The user-level Flow is captured in the Walkthrough example rather than as a dedicated Flow subsection — acceptable for an application, where the per-action wiring in Composition logic is the substantive structure and a separate flow would duplicate it.

**Pass 2 — Conceptual independence (EOS).** Clean. The application is properly scoped: it composes Personal Todo + Event Log without absorbing concerns that belong to additional atoms. Redo, branching history, snapshots, concurrency resolution, import/migration are all named as future composing patterns rather than folded into Undo History.

**Pass 3 — Adversarial scrutiny (Linus mode).** Two findings, both fixed:

- *"Session" undefined.* The first draft said "the application owns one Event Log instance per Personal Todo session" without defining what a session is. Fixed: replaced with "instance" throughout, removing the under-specified term. Composes section now reads "one Event Log instance for each Personal Todo it operates on"; the corresponding Edge cases entry was renamed "Persistence across restarts" with cleaner language.
- *Initialization from an existing log not addressed.* The first draft assumed the log starts empty. Fixed: Edge cases now names log initialization explicitly as a deployment-shaped concern — fresh or existing logs are both supported, but cross-substrate import or merge is out of scope and belongs to an Import or Migration pattern.

The composition's most architecturally interesting result — **identity preservation across delete/undo** (Invariant 6) — survived all three passes unchanged. It remains the showcase emergent property: neither Personal Todo nor Event Log carries it alone, and it falls out of the wiring rather than being designed in.

The application is `grounded — 2026-05-13` after one round.

**Refinement round 1.** Three findings, all closed in-pattern. Conventions inherited from the methodology directly.

- *Action signatures used `rejected(reason)` placeholders; `storage-failure` absent from all five.* All five actions had placeholder rejection forms. Resolved: forward action signatures expanded with named reason taxonomies sourced from Personal Todo's precondition rejections (`not-known`, `not-pending`, `invalid-request`, `duplicate-active`) plus `storage-failure` from Event Log's `append`; `undo` signature expanded to `rejected(nothing-to-undo | storage-failure)`. The full Personal Todo rejection taxonomy will be confirmed against Personal Todo's own refinement round.
- *`read_history` omitted its rejection form.* The signature showed only the success path. `read_history` is a passthrough to Event Log's `read`, which carries `rejected(invalid-query)`. Resolved: signature updated to `read_history(query) → ordered_sequence_of_events | rejected(invalid-query)`.
- *Action wiring missing the `append` storage-failure path.* Every action appends to the Event Log; none of the wiring descriptions specified what happens if `append` returns `rejected(storage-failure)`. This is load-bearing for Invariant 1 (Log faithfulness): the converse of "every successful action appends an event" is "if the append fails, the action is not successful." Without the failure path, an implementation might update the derived state even when the event didn't land, violating State equivalence (Invariant 2). Resolved: each action's wiring extended — if the `append` returns `rejected(storage-failure)`, the caller receives `storage-failure` and the derived state is not updated.

**Scheduled rescan: 2026-05-20.** Pass 1 GRID clean — constituent API spot-check confirmed: Personal Todo retains eight invariants and the `not-editable` rejection in `edit`; Event Log retains seven invariants. Pass 2 EOS clean. Pass 3 Linus (fresh-reader) — two refining findings, both closed in-pattern.

- *No "load-bearing wiring decision" subsection (refining).* The canonical composition shape (spec-format.md) requires a named subsection defending the key architectural decision in-line with the four-part rubric. The decision — identity preservation via replay rather than per-action snapshot — was implicit across the Replay semantics section and Invariant 6, but not stated and defended as a standalone subsection. Resolved: "The load-bearing wiring decision" subsection added to Composition logic, defending event-sourced replay as the structural mechanism that makes identity preservation an emergent property rather than a special case.
- *No rejection-path example for `nothing-to-undo` (refining).* The Examples section covered the happy path and delete/undo identity preservation; `undo()` returning `rejected(nothing-to-undo)` was not exercised. The storage-failure path was similarly unexercised with concrete values. Resolved: "Rejection paths" example added walking both `nothing-to-undo` (all forward events already undone) and the `storage-failure` propagation pattern. Round closes clean.

**Formal-layer vote — 2026-06-03: YES (model pending).** State-equivalence (Inv 2 — visible state is the replay of non-undone Event Log events) and undo-targeting (Inv 3) are temporal-ordering claims sensitive to concurrent undo calls. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`undo-history.tla`](./undo-history.tla) + config [`undo-history.cfg`](./undo-history.cfg), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* `N = 3` forward events; `undone[i]` marks event i undone; `topNonUndone` is the most-recent non-undone index. The load-bearing **Invariant 3** (undo targets the most recent non-undone forward event) — which underpins **Invariant 2** (visible state = replay of non-undone events) — is checked via the top-suffix property `Inv_MostRecentTargeting == ∀ i<j ≤ added : undone[i] ⇒ undone[j]`: correct most-recent targeting peels events off in reverse order, so the undone set is always a top-suffix. Exhaustive: 10 states, holds. *Buggy twin* [`undo-history-buggy.tla`](./undo-history-buggy.tla) targets the *oldest* non-undone event instead; rejected at 6 states (add, add, undo-oldest → `undone[1]` true while `undone[2]` false). *Scope:* forward-then-undo (forward-after-undo is Invariant 7's redo-unreachability concern, out of model scope). *Out of model scope:* the Personal Todo / Event Log constituent invariants (Invariants 4–5; see `atoms/event-log.tla`), identity preservation across delete/undo (Invariant 6 — a replay-content property). *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

**Formal model extended (Tier A + Tier B) — 2026-06-14: the load-bearing claims are now machine-checked, not asserted.** A coverage cross-check found that the 2026-06-03 model checked only undo-targeting (Invariant 3) over an *integer abstraction* — `undone[i]` over `1..N` with no Personal Todo state and no replay. It did **not** machine-check the claims a skeptic actually presses on (the Jackson hold — does event-sourced undo work without the Event Log / execution boundary blurring): **Inv 2** (visible state = replay of non-undone events), **Inv 4** (Personal Todo's invariants preserved under replay), or **Inv 1** (the action↔append contract). The model now models the actual event-sourcing mechanism — a real Personal Todo status per id (`derived`) plus a from-scratch replay (`StatusOf`) derived from the log — and machine-checks all four.

- *What it checks now.* Derived model [`undo-history.tla`](./undo-history.tla) + [`undo-history.cfg`](./undo-history.cfg), `tla-checker` via `tools/harness/check.mjs`. The forward log is an insertion-ordered pair of functions `ltype`/`lid` over `1..MaxEvents` (`len` filled), `undone[i]` marks forward event i undone, `derived : Ids → Status` is the exposed state the wiring maintains incrementally. Four invariants:
  - **Inv 1 — Log faithfulness** (`Inv1_LogFaithfulness == didChange ⇒ didAppend`). Each action has a success branch (append **and** state-update together) and an explicit **storage-failure branch** (`ForwardFail` / `UndoFail`: append rejected ⇒ *nothing* domain-visible changes — "the action did not happen", §Action wiring); ghost flags `didAppend`/`didChange` record what each step did, and the invariant is the action↔append coupling. The "exactly one append per successful action" half is by-construction (one slot written per `Do*`).
  - **Inv 2 — State equivalence** (`Inv2_StateEquivalence == ∀ x : derived[x] = StatusOf(ltype, lid, len, undone, x)`). `derived` is maintained incrementally by the forward wiring; `StatusOf` is the *independent* from-scratch replay (the effect of the most-recent non-undone forward event per id); the check is that the two never diverge. Not a tautology — the forward path maintains `derived` by increments, the replay recomputes it from the log, and the stale-undo twin makes them diverge.
  - **Inv 3 — Undo targeting** (`Inv3_TopSuffix == ∀ i<j : undone[i] ⇒ undone[j]`). Undo marks the most-recent non-undone forward event, so the undone set is a top-suffix. (Carried forward from the integer model, now over the real log.)
  - **Inv 4 — Replay validity** (`Inv4_ReplayValid`): every non-undone forward event's Personal Todo precondition holds against the replay of `1..i-1` (add on absent, complete on pending, delete on present). This is the claim that replay never produces an invalid Personal Todo state.
- *Encoding fix (this is why it now verifies).* The first draft of the richer model **stack-overflowed the WASM checker at minimal scale** (`MaxEvents=2, Ids={1}`) — a dialect/encoding issue, not state-space size. The derived-property operators read `ltype`/`lid` as *free state variables* inside `CHOOSE`-bearing operators with nested set-comprehensions, which the WASM evaluator recurses into until its stack overflows. Fix: mirror the proven idiom in [`atoms/party-identity.tla`](../atoms/party-identity.tla) — the operators are now **pure functions of their arguments** (the log is passed in, never read free), "most-recent non-undone forward event for id x" is a flat `∃ i . IsLastFwd(…) ∧ …` with `IsLastFwd` an `∃/∀`-over-`1..n` predicate, and **`CHOOSE` is gone**. With that single change the model checks clean.
**Three buggy twins — one vacuity guard per checked invariant.** The per-invariant teeth were confirmed by checking each twin against each invariant individually (not just the `Safety` conjunction):

| Twin | Inv 1 | Inv 2 | Inv 3 | Inv 4 | the hazard it re-introduces |
|---|---|---|---|---|---|
| [`undo-history-buggy.tla`](./undo-history-buggy.tla) | hold | hold | **VIOL** | **VIOL** | undo targets the *oldest* non-undone event (wrong-direction targeting) |
| [`undo-history-stale-buggy.tla`](./undo-history-stale-buggy.tla) | hold | **VIOL** | hold | hold | undo targets correctly but fails to recompute `derived` (stale state) |
| [`undo-history-phantom-buggy.tla`](./undo-history-phantom-buggy.tla) | **VIOL** | **VIOL** | hold | (VIOL) | storage-failure branch commits a `derived` change with no append (phantom state) |

Every invariant has at least one twin the checker rejects on *that* invariant: Inv 1 ← phantom (its unique witness), Inv 2 ← stale (clean, Inv 2 only), Inv 3 ← oldest, Inv 4 ← oldest (and phantom, where phantom state lets a `complete` get appended on an id with no `add` in the log — the blur cascading into replay-invalidity). The phantom twin breaking Inv 1 *and* Inv 2 together is faithful to the spec's own Refinement-round-1 finding (the storage-failure path is load-bearing for Inv 1, and updating `derived` when the append did not land also violates Inv 2).

**Bounds.** Committed bound `MaxEvents=4, Ids={1,2}` → **563 states, holds**. This model has no absorbing terminal to cap log length (unlike party-identity's `Closed`), so the explored-state count **grows monotonically** rather than plateauing; it was confirmed holding at every bound checked — `Ids={1}`: 14 / 28 / 55 / 99 / 164 states at `MaxEvents` 2→6; `Ids={1,2}`: 37 / 149 / 563 at `MaxEvents` 2→4 — so the bound is deliberate (rich enough for cross-id replay, all three forward types, and multi-step undo suffixes), with the larger `Ids={1}` runs confirming continued holding, all well under `max_states=200000`. The honest saturation note: monotone growth, no truncation hiding a bug (every bump still holds), not a constant-count plateau.

**Coverage cross-check matrix (Tier A+B)**, per [`pressure-testing.md`](../pressure-testing.md) §The coverage cross-check:

| Spec invariant | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| **1 — Log faithfulness** | yes (the alignment "sync" — prong 2, the adjective) | **covered** | `Inv1_LogFaithfulness` + storage-failure branches + twin `-phantom-buggy`. *Was out-of-scope (Tier B) → now covered.* "Exactly one append per success" is by-construction (one slot per `Do*`). |
| **2 — State equivalence** | yes (named load-bearing by the vote) | **covered** | `Inv2_StateEquivalence` (`derived = StatusOf` replay) + twin `-stale-buggy`. *Was GAP (only underpinned Inv 3 in the integer model) → now covered.* |
| **3 — Undo targets most recent** | yes (named load-bearing by the vote) | **covered** | `Inv3_TopSuffix` + twin `-buggy`. Carried forward, now over the real log. |
| **4 — Personal Todo invariants preserved** | yes | **covered** | `Inv4_ReplayValid` + twins `-buggy`, `-phantom-buggy`. *Was out-of-scope → now covered.* |
| 5 — Event Log invariants preserved | no | by-construction / out-of-scope (constituent) | undo is a compensating marker (`undone[i]`), never mutation; the log is append-only with no remove action. Event Log's own surface is its atom model. |
| 6 — Identity preservation across delete/undo | no (Tier C) | out-of-scope (named: content/field-level) | the model tracks *status*, not id/timestamp content; a replay-content property — Tier C, deliberately not attempted. |
| 7 — Reachability of prior states | no | out-of-scope (named: forward-then-undo scope) | redo-unreachability after a forward-following-undo; a reachability/liveness claim, not a safety interleaving in this scope. |

No GAP rows remain. The three invariants the 2026-06-03 entry listed as out-of-model-scope or merely underpinning (Inv 1, 2, 4) are now **covered** with their own twins.

**Conflict-protocol outcome:** none — the extended model **corroborates** the English (the replay-recompute-on-undo wiring, the storage-failure "action did not happen" branch, and Inv 1–4 all hold as written); canonical English unchanged. Tier C (Invariant 6 identity-preservation content) remains the next formal increment.

**AI adversarial round — Final Critique 4 (first real AI round) — 2026-06-18.** This composition grounded 2026-05-20 under the early process — foundation plus refinement, no fresh-reader AI adversarial round — and carried the legacy grandfathered token; its constituent atoms were re-grounded at Final Critique 4 on 2026-06-18. This round is that missing AI-conducted adversarial round (fresh-reader Opus, Happy-Torvalds-X2); it is the composition's Final Critique 4 (Rounds 1–3 the foundation/refinement baseline, per pressure-testing.md §Round structure). Two foundational findings closed: F1 — the unreachable `not-pending` rejection (propagated from Personal Todo) dropped from `edit` (`complete`'s reachable `not-pending` preserved); F2 — Logic Confinement on the composition's own `add`: because Undo History replaces Personal Todo's API surface (it is event-sourced; the atom is not called at the live edge), it is the host layer for `add`, so the unit `id` is now host-allocated at the composition's I/O seam and injected, not minted inside the action (`event_id`/`recorded_at` remain sourced from Event Log's `append`). Refining: a cross-reference to Event Log's re-scoped Invariant 5 (read consistency over successfully-appended events) added in Replay semantics.. Caller signatures unchanged and the invariant set held at 7 (read the actual count from the spec and confirm no change), so the fixes are additive with no constituent-change cascade. Formal-layer vote stands YES (Tier A+B TLA+ model with three buggy twins); the id-allocation site and rejection arms are out of model scope, so the fixes do not reopen it. Confirming fresh-reader Opus clearance gate (2026-06-18): CLEAR, 0 foundational, no new surface. It has no compositional dependents (leaf); it is the replay-skip sibling of Saga. Grounds at Final Critique 4.
