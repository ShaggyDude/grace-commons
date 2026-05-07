# Undo History

> An application: every Personal Todo action is reversible. Composes Personal Todo with Event Log to give the user a familiar Cmd+Z experience without modifying either constituent atom.

---

## Intent

The user expects a familiar undo capability — the ability to take back the last thing they did. Personal Todo on its own does not provide this: each action is committed and there is no native "undo" surface. Event Log on its own provides a faithful record of what happened but does not act on it.

This application composes the two. Every action the user takes against Personal Todo is recorded in an Event Log instance owned by the application. An additional `undo` action consults the log, identifies the most recent forward action not already undone, and adjusts the application's derived Personal Todo state to be equivalent to the state had that action never occurred.

The application is event-sourced. Personal Todo state at any moment is defined as the result of replaying the log's non-undone events from the beginning. Forward actions append events; undo appends compensating events; replay produces the current state. Personal Todo's atom spec is unchanged. Event Log's atom spec is unchanged. The application is the wiring.

---

## Composes

- **[Personal Todo](../patterns/productivity/personal-todo.md)** — provides the substrate state machine, transition rules, and invariants I1–I8. The application maintains a Personal Todo–shaped state derived from the Event Log.
- **[Event Log](../patterns/temporal/event-log.md)** — provides the durable, append-only record of every action. The application owns one Event Log instance per Personal Todo session.

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

`event_id` and `recorded_at` are supplied by Event Log's `append` (per L2). `id` is the Personal Todo unit identifier (per Personal Todo's identity model). `snapshot` for delete events captures the unit's full state — `description`, current state (Pending or Done), and all defined timestamps — sufficient for replay to reconstruct the unit faithfully.

### Action wiring

The application replaces Personal Todo's direct API surface. Users call the application's actions; the application updates both the Event Log and the derived state.

- **`add(description) → id | rejected(reason)`** — Validate against Personal Todo's `add` precondition (description policy + active-set uniqueness against the *current derived state*). On success, generate a new `id`, append `{type: "add", id, description}` to the Event Log, update the derived state, return `id`.
- **`edit(id, newDescription) → ok | rejected(reason)`** — Validate against Personal Todo's `edit` precondition. On success, capture the unit's current description as `prior_description`, append `{type: "edit", id, prior_description, new_description}`, update the derived state.
- **`complete(id) → ok | rejected(reason)`** — Validate against Personal Todo's `complete` precondition. On success, append `{type: "complete", id}`, update the derived state.
- **`delete(id) → ok | rejected(reason)`** — Validate against Personal Todo's `delete` precondition. On success, capture the unit's full state as `snapshot`, append `{type: "delete", id, snapshot}`, update the derived state.
- **`undo() → undone_event_type | rejected(reason)`** — Identify the most recent forward event (type ∈ {add, edit, complete, delete}) whose `event_id` is not already in the undone set. If none, reject as `nothing-to-undo`. Otherwise, append `{type: "undo", undone_event_id, undone_event_type}` to the Event Log, recompute the derived state, return the type of the undone action.
- **`read_history(query) → ordered_sequence_of_events`** — Pass through to Event Log's `read`. The user can inspect their history at any time.

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

Replay assumes events were recorded only on successful actions, which guarantees Personal Todo's preconditions hold at every replay step.

---

## Application-level invariants

These invariants emerge from the composition. None of them belong to a single constituent atom; each requires both atoms working together to hold.

- **U1 — Log faithfulness.** Every successful user action (forward or undo) appends exactly one event to the Event Log. No event appears in the log without a corresponding user action; no user action goes unrecorded.
- **U2 — State equivalence.** At any time, the application's exposed Personal Todo state equals the result of replaying the Event Log's non-undone events from the beginning under the replay semantics above. The state is not stored separately; it is *defined* by the log.
- **U3 — Undo targets the most recent forward event.** Each `undo` event's `undone_event_id` references the most recent forward event whose `event_id` was not already in the undone set at the time the undo was issued.
- **U4 — Personal Todo's invariants are preserved.** I1–I8 from Personal Todo hold over the derived state at every moment. Replay never produces an invalid Personal Todo state, because every recorded forward event was a successful action against a then-valid state.
- **U5 — Event Log's invariants are preserved.** L1–L7 from Event Log hold. The application never deletes or rewrites events; undo is implemented via compensating appends, not via mutation.
- **U6 — Identity preservation across delete/undo.** Undoing a `delete` restores the unit at its original `id` with its original `added_at`, `last_edited_at` (if any), and prior state (Pending or Done). The original `add` event remains in the log; replay skipping the `delete` reconstructs the unit faithfully. Personal Todo on its own cannot do this — its `delete` is terminal and a fresh `add` produces a new id. The composition with Event Log buys back identity preservation as an emergent property.
- **U7 — Reachability of prior states.** From any point in the user's history, the user can return to any prior application-visible state via a finite sequence of `undo` calls — provided no further forward actions intervene. After any forward action following undos, the previously-undone events remain in the log but cannot be reached via `undo` (that would require a separate Redo pattern).

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

A user later asks *"what did I do this week?"* The application calls `read_history({recorded_at: last_7_days})` and returns the full sequence including undos. Same Event Log instance, no additional atoms required. If the user later wants the history protected for compliance, composing this application's Event Log with an Audit Trail (forthcoming) adds retention and tamper-evidence without changing the composition above.

---

## Edge cases and explicit non-goals

What this application does not cover:

- **Redo.** Once an action is undone and a new forward action is taken, the undone action cannot be re-applied via this application. Redo requires a Redo Stack pattern that interprets a different class of compensating events. The current application's `undo` is one-directional.
- **Branching history.** No support for "go back in time and take a different action." The log is linear; alternate timelines are out of scope.
- **Selective undo.** `undo` always targets the most recent non-undone forward event. Undoing a specific earlier action while preserving more recent actions ("undo my edit from twenty minutes ago, keep everything since") is not supported — it would require event-dependency analysis and is a separate pattern.
- **Undo of undo.** Forward events can be undone; undo events cannot. Reversing an undo is the redo operation, out of scope.
- **Cross-session persistence.** The application assumes the Event Log is durable across sessions (a deployment property of the Event Log instance). If the log is volatile, the undo history resets at session start, which most users will not expect.
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

The two atoms it composes carry their own standards inheritance — Personal Todo (Jackson / EOS, Eiffel design-by-contract, LTL) and Event Log (ISO/IEC 27001, NIST SP 800-92, W3C Activity Streams 2.0, write-ahead logging literature).

---

## Status

`grounded` — composition logic specified, seven application-level invariants stated and justified, walkthrough example exercises the full action surface including delete/undo identity preservation, edge cases identify deferred concerns and the substrate's natural breakdown points. First entry in `applications/`. Demonstrates that two existing atoms compose into a useful application without modifying either constituent.
