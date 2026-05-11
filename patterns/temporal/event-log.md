---
title: Event Log
parent: Temporal
grand_parent: Patterns
nav_order: 2
---

# Event Log

> A temporal primitive: an append-only sequence of immutable, time-ordered events. The substrate every audit, history, replay, and event-sourcing pattern composes on top of.

---

## Intent

A composing pattern records facts about state changes. The Event Log preserves those facts as an append-only sequence — each event immutable once recorded, ordered by append, queryable but never editable.

The pattern addresses a class of needs that recur across virtually every system that mutates state: audit trails, undo histories, activity feeds, event sourcing, write-ahead logs, replication journals, version-control logs, replay buffers. The shape is constant — a stream of facts, recorded in order, never altered after the fact, available for retrospective query.

This is a freestanding concept in the EOS sense. It carries its own state (the sequence), its own actions (`append`, `read`), and its own operational principles (append-only, total order, immutability). Composing patterns wrap it with retention policies, tamper-evidence, actor identity, reverse-lookup indices, and so on. The Event Log itself imposes no semantics on what an event *means*; it imposes only the structural guarantee that the sequence is faithful to what was recorded.

---

## Structure

### Identity model

Each event recorded in an Event Log has an opaque, immutable, system-generated `event_id` — assigned on `append`, never reused, never reassigned. The id is the event's identity; data is a property of the event, not its identity.

Each Event Log is itself a named instance. Multiple instances coexist in real systems (one per audited subsystem, one per user history, one per replication stream). The atom specifies what *one* instance is and how it behaves; composing patterns decide how many instances to instantiate and with what configuration.

### Inputs

- A sequence of `append` calls from composing patterns.
- A `read` API for retrospective query.
- An implicit clock providing wall-time timestamps.

### Actions

- `append(data) → event_id | rejected(reason)` — record a new event at the tail.
- `read(query) → ordered_sequence_of_events` — return events matching the query, ordered by `sequence_number` ascending.

A `query` may name a sequence-number range, a wall-time range, a payload predicate, or a combination. The exact query shape is implementation policy; the atom requires only that any valid query returns events in `sequence_number` order.

### Outputs

- For `append`: a fresh `event_id`, or a rejection naming the failed precondition.
- For `read`: a (possibly empty) ordered sequence of events. Each event carries its `event_id`, `sequence_number`, `recorded_at`, and `data`.

### State

The log is a totally ordered sequence of events. Each event has:

- **`event_id`** — opaque, immutable, unique within the log.
- **`sequence_number`** — strictly increasing integer assigned at append. Determines total order.
- **`recorded_at`** — wall-time when the event was appended. Annotates time but is not the source of total order.
- **`data`** — opaque payload supplied by the composing pattern. The Event Log does not interpret it.

The log itself has:

- **`name`** — identifies the log instance among co-existing logs.
- **`next_sequence_number`** — the sequence number that the next appended event will receive. Begins at 1 for a fresh log instance and increments by 1 on each append. Part of the log instance's persistent state — durable implementations must preserve it across restarts to maintain sequence-number monotonicity. Volatile implementations that reset to 1 on restart violate this invariant across the lifetime of the log instance.

There is no `delete` or `edit` surface. Once recorded, events remain; the log only grows.

### Flow

The Event Log has no user-driven flow of its own; it is invoked by composing patterns.

1. **Composing pattern observes a state change.** It calls `append(data)` with a payload describing what happened.
2. **Event Log records the event.** Assigns `event_id`, `sequence_number = next_sequence_number`, `recorded_at = now`. Increments `next_sequence_number`. Returns `event_id`.
3. **Time passes; more appends happen.** Each receives a fresh, strictly larger `sequence_number`.
4. **A composing pattern queries the log.** Calls `read(query)`. Receives an ordered sequence of matching events.

### Decision points

- **At `append(data)`** — `data` must satisfy the configured payload constraints (default: max 64 KB, opaque bytes; configurable per instance). Otherwise rejected as `invalid-payload`. There are no other preconditions; appends never fail for ordering or contention reasons — the underlying implementation must serialize them.
- **At `read(query)`** — `query` parameters must be well-formed (sequence-number range valid, time range valid, predicate parseable). Otherwise rejected as `invalid-query`. A well-formed query that matches no events returns an empty sequence, not a rejection.

### Behavior

How the concept appears to composing patterns:

- **Append is durable on success.** Once the caller receives an `event_id`, the event is in the log and will appear in subsequent reads.
- **Reads are repeatable and monotonic.** Reading the same query at two different times returns at least the events from the earlier read, plus any events appended in between. The log only grows.
- **Order is total.** Any two distinct events have a defined relative position via `sequence_number`. Ties never occur, even for events appended in the same wall-time instant.
- **Wall-time is best-effort.** `recorded_at` is non-decreasing under a well-behaved clock. Under an unreliable or adversarial clock, `recorded_at` may not be monotonic; `sequence_number` remains the source of truth for ordering.
- **The log is unbounded by this atom alone.** Retention, archival, and compaction belong to composing patterns; the bare Event Log keeps everything for the lifetime of the log instance.

### Feedback

- After `append(data)` — a new event exists in the log with a fresh `event_id`, `sequence_number = previous_next`, `recorded_at = now`. `next_sequence_number` increments by 1. The event is immediately visible to subsequent reads.
- After `read(query)` — a sequence of matching events in ascending `sequence_number` order. The state of the log is unchanged.

Each rejected action produces an observable refusal naming the failed precondition (`invalid-payload`, `invalid-query`).

### Invariants

- **Invariant 1 — Append-only.** Once an event is in the log, it remains in the log for the lifetime of the log instance. No action removes events.
- **Invariant 2 — Event immutability.** After a successful `append`, the event's `event_id`, `sequence_number`, `recorded_at`, and `data` never change.
- **Invariant 3 — Total order.** For any two distinct events `e1` and `e2`, exactly one of `e1.sequence_number < e2.sequence_number` or `e1.sequence_number > e2.sequence_number` holds.
- **Invariant 4 — Sequence-number monotonicity.** If `e1` was appended before `e2`, then `e1.sequence_number < e2.sequence_number`.
- **Invariant 5 — Read consistency.** A `read` issued at time `t` returns every event with `sequence_number ≤ next_sequence_number − 1` whose data matches the query, ordered by `sequence_number` ascending.
- **Invariant 6 — No id reuse.** No two events in the log share an `event_id`.
- **Invariant 7 — Wall-time best-effort monotonicity.** Under a non-decreasing clock, `recorded_at` is non-decreasing in append order. Under an unreliable clock, this is best-effort and `sequence_number` is the authoritative order.

Append-only and event immutability together give the *immutable journal* property — the property that distinguishes an Event Log from a mutable record set. Total order and sequence-number monotonicity give the *replay* property. Read consistency gives the *durable visibility* property. No id reuse prevents identity collisions across time.

---

## Examples

The same pattern, four domains, identical mechanic.

### Personal Todo activity log

A composing system wraps each Personal Todo action as an event: `{type: "add", id: "t1", description: "buy milk"}`, `{type: "complete", id: "t1"}`, `{type: "delete", id: "t1"}`. The log records them in order, never alters them. The user can later query the log to see what they did this week, restore deleted tasks (compose with Reverse Index + Restore — see Undo History), or reason about completion patterns. The Personal Todo pattern itself is unchanged; the log is a side stream the composing application maintains.

### Compliance audit log

A regulated system records every state-changing action: `{type: "patient_record_accessed", patient_id: "p123", actor: "dr_smith", reason: "treatment", at: "2026-05-07T14:32:11Z"}`. The log is append-only by definition. A separate Audit Trail composing pattern adds retention rules, tamper-evidence (hash chain), and actor-identity verification. The Event Log itself doesn't know what compliance means; it preserves the sequence faithfully and lets compliance be layered on.

### Patient medical record (clinical history)

Each clinical observation, prescription, lab result, and vital sign is appended as an event with structured data. The clinical record *is* an Event Log; the patient chart is a *view* over it (latest values per field). Mistakes are corrected by appending a *correction event*, never by editing the original — the record must show what was originally recorded and when it was corrected. ICD coding, billing extraction, and longitudinal analytics all read the same log.

### Bank transaction journal

Every credit, debit, transfer, and adjustment is appended as an event in the journal. Account balances are derived by replaying the journal up to a point in time. Reversals are appended as new events (a refund event referencing the original charge), never as edits. The journal is the source of truth; the balance display is a projection. Reconciliation, fraud detection, and regulatory reporting all read the same log.

The mechanic is identical across all four. What differs: payload schema, query patterns, and the composing patterns that derive views (current todo list, audit report, current chart, current balance) from the underlying log.

---

## Edge cases and explicit non-goals

What this pattern does not cover:

- **Retention and archival.** The bare Event Log keeps everything forever. Compose with [Retention Window](../compliance/retention-window.md) for time-based pruning under regulatory obligation, and a Storage Tier pattern for active-versus-cold archival (orthogonal axis).
- **Tamper-evidence.** Events are immutable by spec, but nothing in the bare atom prevents an adversary with write access from rewriting the log. Cryptographic hash chains, signed events, and Merkle trees belong to a Tamper Evidence pattern that composes on top.
- **Actor identity.** The Event Log records what was appended; the composing pattern decides whether the payload includes a `who`. [Actor Identity](../compliance/actor-identity.md) standardizes that addition with a verifiable non-repudiation binding.
- **Reverse lookup / indexing.** The Event Log supports forward iteration and queries by sequence-number or time range. Lookup by payload field (find all events of type X, find all events touching id Y) is the job of a separate Reverse Index pattern.
- **Distributed consistency.** A single Event Log instance is a single ordered sequence on one host. Multi-host ordering across instances (causal order, vector clocks, Lamport timestamps) belongs to a Consensus or Causal Ordering pattern.
- **Event schemas and evolution.** The data payload is opaque. Schema definition, validation, and migration belong to a Schema Evolution pattern.
- **Compaction and snapshots.** Some event-sourced systems collapse event sequences into snapshots. The bare Event Log does not; Snapshot is a composing pattern.
- **Subscriptions / change feeds.** A pull-only `read` API. Push-based notification of new events belongs to an Observer or Change Feed pattern.
- **Multi-event atomicity.** Each `append` is atomic. Multi-event transactions ("append A and B together or neither") belong to a Transaction pattern.
- **Durability across crashes.** The atom specifies in-memory semantics. Persistence across process restarts is a deployment concern; durable implementations must provide write-ahead logging or equivalent. Append-only and event immutability are best-effort across crashes unless the implementation supplies durability.
- **Right-to-be-forgotten erasure.** Where law mandates true deletion of recorded events (GDPR Article 17, certain healthcare contexts), the architectural answer *append corrections, never edit history* breaks down. A composing pattern (Erasure Tombstone, Cryptographic Shredding) must be designed alongside legal counsel.

Where the pattern breaks down: when the host environment cannot supply atomic, serialized appends (most adversarially-distributed settings); when events must be edited or deleted in place; when ordering must be derived from something other than append order.

---

## Composition notes

Patterns compose with Event Log through one of two contracts, often both:

1. **Append on every state change.** The composing pattern emits an event to the log on every state transition. Personal Todo's `add` / `edit` / `complete` / `delete` would each produce events. The Event Log is the durable record from which the composing pattern's history can be reconstructed.
2. **Replay to derive state.** The composing pattern derives its current state by reading the log from the beginning (or from the most recent snapshot). This is the *event-sourcing* style — the log is the source of truth, current state is a projection.

Forthcoming compositions in `applications/`:

- **Undo History** — Event Log + Reverse Index + Restore action.
- **Audit Trail** — Event Log + Retention + Tamper Evidence + Actor Identity.
- **Activity Feed** — Event Log + Subscriber pattern + Filter.
- **Event-Sourced Reservation** — Event Log + Snapshot + Reservation atom.

In all four, Event Log is the substrate; the application adds the policy.

---

## Standards references

Event Log is a foundational primitive with deep standards backing:

- **ISO/IEC 27001** — information security management; mandates event logging for security-relevant actions.
- **NIST SP 800-92** — *Guide to Computer Security Log Management*; describes log lifecycle, integrity, retention requirements.
- **W3C Activity Streams 2.0** — JSON format for activity feeds; treats activities as events with actor / verb / object structure.
- **Event Sourcing literature** — Greg Young's early write-ups; Martin Fowler's *Event Sourcing*; foundational pattern in domain-driven design.
- **Database write-ahead logging (WAL)** — the same primitive at the storage layer; ARIES recovery, PostgreSQL WAL, MySQL binlog.
- **Distributed-systems replication logs** — Kafka topics, Raft logs, Paxos value logs.
- **Version control** — Git's commit log is an Event Log with cryptographic tamper-evidence (Merkle DAG) layered on top.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the conception of a freestanding concept with state, actions, and operational principles.
- **Eiffel's design-by-contract** — preconditions on `append` and `read`.
- **Linear temporal logic** — append-only, event immutability, and sequence-number monotonicity expressed as temporal properties (`always`, `until`).

---

## Status

`grounded` — concept is freestanding, composable, has a verifiable invariant set, and four cross-domain examples spanning productivity, compliance, healthcare, and finance. Ready for composition with Undo History, Audit Trail, Activity Feed, and event-sourced applications.

---

## Lineage notes

This pattern survived all three pressure-testing passes (see [`PRESSURE_TESTING.md`](../../PRESSURE_TESTING.md)) on its first revision.

**Pass 1 — Structural completeness (GRID).** Clean. All nine nodes addressed; the Edge cases section enumerates eleven explicit out-of-scope concerns, each pointing at a composing pattern that handles it (Retention Window, Tamper Evidence, Actor Identity, Reverse Index, Consensus, Schema Evolution, Snapshot, Observer, Transaction, durability, Erasure Tombstone).

**Pass 2 — Conceptual independence (EOS).** Clean. Event Log is itself a foundational primitive that other concepts compose on top of. The concerns most often candidates for extraction (retention, tamper-evidence, actor identity, indexing) are already correctly named as composing patterns rather than absorbed into the atom.

**Pass 3 — Adversarial scrutiny (Linus mode).** Three findings, one fixed in-pattern, two already adequately addressed:

- *`next_sequence_number` behavior across restarts.* The first draft said "begins at 1 and increments by 1 on each append" without addressing what happens if the log instance is durable and survives a restart. Fixed: the State section now specifies the counter is part of the log instance's persistent state and that durable implementations must preserve it across restarts to maintain sequence-number monotonicity.
- *Query DSL ambiguity.* Already named explicitly as implementation policy. The atom guarantees only that any well-formed query returns events in `sequence_number` order; the predicate language is intentionally deferred to composing patterns and implementations.
- *Append/read concurrency.* Already addressed under Decision points (appends serialized by the underlying implementation) and under durability in Edge cases.

The pattern is `grounded` after one round.
