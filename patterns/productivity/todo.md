# Todo

> A productivity primitive: tracking units of work through pending and done states, with the option to remove them entirely.

---

## Intent

Users record discrete units of work they intend to complete. Each unit can be marked done or removed entirely. At any moment, every known unit is in exactly one logical condition.

The pattern addresses a need that recurs across virtually every domain involving discrete work: personal task management, software issue tracking, service request handling, compliance checklists, editorial workflows, clinical care plans. The underlying mechanic — add, complete, remove — is identical across all of them. Vocabulary, urgency, and consequences differ enormously; the structure does not.

This is the simplest task-tracking concept. Patterns that extend or compose with it (priority, dependencies, assignment, recurrence, reopening) live elsewhere in the library.

---

## Structure

### Inputs

- A user-supplied identifier or description for each unit of work.
- User-initiated actions: `add`, `complete`, `delete`.

### Outputs

- The current set of pending units.
- The current set of done units.
- Action acknowledgements — success, or rejection with a named reason.

### State

A unit of work occupies one of two named conditions while known to the system:

- **Pending** — recorded, not yet completed.
- **Done** — completed, not yet removed.

A unit leaves the system entirely when deleted. Deletion is terminal within this concept; restoration belongs to a separate Audit or History pattern that composes with Todo.

Transitions:

- `add(t)` → `t` enters in Pending.
- `complete(t)` → `t` moves Pending → Done.
- `delete(t)` → `t` leaves the system entirely, from either Pending or Done.

### Flow

1. **Add.** The user records a new unit. It enters Pending. *(Start.)*
2. **Complete or abandon.** The user marks it done (Pending → Done) or deletes it without completing (abandonment branch).
3. **Delete.** The user removes the unit from the system. *(End.)*

### Decision points

Each action carries an explicit precondition. Violations are rejected, not silently absorbed.

- At `add(t)` — `t` must not already be in Pending or Done. Duplicate adds are rejected; they are never silently merged with existing units.
- At `complete(t)` — `t` must currently be in Pending. Completing a done unit, or one not known to the system, is rejected.
- At `delete(t)` — `t` must be in either Pending or Done. Deleting an unknown unit is rejected.

### Behavior

Observed behavior, derived from how task systems are actually used rather than how they are intended to be used:

- Users add units freely and frequently, often in bursts.
- Users complete some units and delete others without completing them. Abandonment is common and is not a defect.
- Users sometimes re-add a unit with the same description as one previously deleted. The re-added unit is treated as a new unit, not the resurrection of the old one.
- Users do not expect units to move backward from Done to Pending. There is no "uncomplete" action in this concept; reopening belongs to an extended pattern.

### Feedback

Each successful action produces an observable, measurable change:

- After `add(t)` — Pending size increases by one; total count increases by one.
- After `complete(t)` — Pending size decreases by one, Done size increases by one; total count is unchanged.
- After `delete(t)` — `t` no longer appears in either set; total count decreases by one.

Each rejected action produces an observable refusal naming which precondition failed (`already-pending`, `not-pending`, `not-known`).

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **I1 — Membership exclusivity.** For every unit `t` known to the system, `t` is in exactly one of {Pending, Done}, never both, never neither.
- **I2 — Add → Pending persistence.** After a successful `add(t)`, `t` is in Pending and remains so until either `complete(t)` or `delete(t)` is invoked.
- **I3 — Complete → Done persistence.** After a successful `complete(t)`, `t` is in Done and remains so until `delete(t)` is invoked.
- **I4 — Delete is terminal.** After a successful `delete(t)`, `t` is in neither set, and remains so unless `add` is invoked again with a new unit.

Each invariant is expressible as a predicate over the system's state and checkable after every action. I2 and I3 correspond directly to the linear-temporal-logic `until` assertions in the equivalent Alloy specification.

---

## Examples

The same pattern, four domains, identical mechanic.

### Personal task management

A user opens a notes app, types *"buy milk,"* marks it done after the errand. Adds *"renew passport,"* leaves it pending for six weeks, eventually deletes it without completing because they renewed via a different channel. Adds *"buy milk"* again the following week — a new unit, unrelated to the first.

### Software issue tracking

A developer files a bug *"login fails for users with apostrophes in email,"* works on it, marks it resolved. The same tracker holds an issue *"add support for Cantonese"* that lingers in pending for two years before being deleted as out of scope. The tracker does not allow re-opening a resolved issue; reopening would require a new ticket — a different pattern.

### IT service request queue

An employee opens a ticket *"laptop won't boot."* Helpdesk resolves it and marks it closed. Another ticket *"install Adobe Suite"* is deleted without action because the employee leaves the company before the request is processed. The same Todo pattern, governed by an SLA pattern that composes on top.

### Compliance checklist

An auditor opens an annual review with twenty-seven items pending. Twenty-five complete normally; one is deleted because the underlying regulation was repealed mid-year; one remains pending past the deadline and triggers an escalation governed by a separate Deadline pattern.

In all four, the underlying mechanic is identical. What differs is vocabulary (task / issue / ticket / control), urgency (none / sprint / SLA / regulatory), and the patterns that compose on top (none / triage / SLA / deadline + escalation).

---

## Edge cases and explicit non-goals

What this pattern does not cover:

- **Restoration of deleted units.** Deletion is terminal. Systems that need restorability compose Todo with an Audit or History pattern.
- **Reopening completed units.** No Done → Pending transition. Reopening is a separate pattern.
- **Recurring units.** Units with scheduled regeneration belong to a Recurring pattern.
- **Priority, ordering, assignment, dependencies, due dates.** Each is a distinct pattern that composes with Todo.
- **Concurrent edits by multiple users.** Coordination semantics belong to a Concurrency pattern.
- **Identity collisions.** Two units may share a user-visible description; the pattern assumes the system supplies sufficient identity to distinguish them. Identity assignment is out of scope.

Where the pattern breaks down: in any system where "completion" is not a binary state. Partial completion, percentage progress, or graduated states (triage levels, severity tiers, multi-stage approvals) require a different pattern — a state machine with more than two terminal-bearing states.

---

## Standards references

Todo is a primitive, not a regulated business pattern. It has no direct ISO / IEEE / regulatory anchor. It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the conception of a "concept" as a composable, behavioral, freestanding unit of software design with state, actions, and operational principles.
- **Eiffel's design-by-contract** — preconditions on each action.
- **Linear temporal logic** — invariants I2 and I3 expressed as `until` properties.

A formal-methods version of the same concept exists in [concept-catalog](https://github.com/dpapathanasiou/concept-catalog/blob/main/concepts/todo.als), expressed in Alloy 6. The two formalisms are equivalent on the four invariants above. This version additionally specifies Behavior, Feedback, cross-domain Examples, and edge-case Friction explicitly — first-class GRID nodes that are not part of the EOS concept model.

---

## Status

`grounded` — all required structural elements resolved, cross-domain examples present, edge cases explicit, standards references named. Ready for composition with other patterns in the library.
