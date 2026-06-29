---
title: Event Log
parent: Atomic Concepts
has_toc: true
toc: true
---

# Event Log

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Event Log is an append-only record. Anything written to it stays, in the order it arrived, unchanged, for as long as the log exists. It is the foundation that audit trails, undo histories, activity feeds, transaction journals, and replay systems are all built on. It offers just two operations. One adds an event to the end and returns an identifier for it; the other reads events back in order. There is no way to edit or delete, by design. Every event gets a strictly increasing sequence number that fixes its place in line. That number is kept separate from the human-readable timestamp on purpose: clocks can drift or jump, but the sequence number never does, so the log can always be replayed faithfully even on a machine with a bad clock. The log itself takes no position on how long to keep events, how to prove they have not been tampered with, who wrote them, or how to search them. All of these are handled by separate patterns layered on top, which is why the same simple log can sit under a personal task history, a medical chart, a bank ledger, and a regulated audit trail.

---

## Intent

A composing pattern records facts about state changes. The Event Log preserves those facts as an append-only sequence — each event immutable once recorded, ordered by append, queryable but never editable.

The pattern addresses a class of needs that recur across virtually every system that mutates state: audit trails, undo histories, activity feeds, event sourcing, write-ahead logs, replication journals, version-control logs, replay buffers. The shape is constant — a stream of facts, recorded in order, never altered after the fact, available for retrospective query.

This is a freestanding (can be specified without naming any other pattern) concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It carries its own state (the sequence), its own actions ([Append], [Read]), and its own operational principles (append-only — records can be added but never changed or deleted, total order, immutability — unchangeable once written). Composing patterns wrap it with retention policies, tamper-evidence, actor identity, reverse-lookup indices, and so on. The Event Log itself imposes no semantics on what an event *means*; it imposes only the structural guarantee that the sequence is faithful to what was recorded.

---

## Structure

### Identity model

Each [Event] recorded in an [Event Log] has an opaque, immutable [Event Id] — allocated by the host-injected id source at the I/O seam on [Append] (not generated inside the core transition; see Inputs and the Logic Confinement Principle in [`execution-contract.md`](../execution-contract.md)), never reused, never reassigned. [Event Id]s support equality comparison (Invariant 6 depends on it) but carry no ordering semantics — ordering is [Sequence Number]'s job alone. The id is the [Event]'s identity; [Data] is a property of the [Event], not its identity.

Each [Event Log] is itself a named instance. Multiple instances coexist in real systems (one per audited subsystem, one per user history, one per replication stream). The atom specifies what *one* instance is and how it behaves; composing patterns decide how many instances to instantiate and with what configuration.

### Inputs

- A sequence of [Append] calls from composing patterns.
- A [Read] surface for retrospective query.
- A clock providing wall-time (clock time as a human would read it, not an internal counter) timestamps, and an id source for [Event Id] allocation — both injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the [Event Id] at the seam, *before* the transition runs; the pure transition receives [Recorded At] and [Event Id] as inputs. Neither is read or generated inside the core transition, and neither is supplied by the business caller — which keeps the transition deterministic and forecloses caller-supplied timestamp or id lying.

### Actions

- [Append] — record a new [Event] at the tail. (Projected contract: `append(data) → event_id | rejected(invalid-payload | storage-failure)`.)
- [Read] — return events matching the [Query], ordered by [Sequence Number] ascending. (Projected contract: `read(query) → ordered_sequence_of_events | rejected(invalid-query)`.)

A [Query] may name a sequence-number range, a wall-time range, a payload predicate, or a combination. The exact query shape is implementation policy; the atom requires only that any valid [Query] returns events in [Sequence Number] order.

### Outputs

- For [Append]: a fresh [Event Id], or a rejection naming the failed precondition.
- For [Read]: a (possibly empty) ordered sequence of events. Each [Event] carries its [Event Id], [Sequence Number], [Recorded At], and [Data].

### State

The log is a totally ordered sequence of events. Each [Event] has:

- **[Event Id]** — opaque, immutable, unique within the log.
- **[Sequence Number]** — strictly increasing integer assigned at append. Determines total order.
- **[Recorded At]** — wall-time when the [Event] was appended (a UTC instant; resolution is implementation-defined). Annotates time but is not the source of total order.
- **[Data]** — opaque payload supplied by the composing pattern. The Event Log does not interpret it.

The log itself has:

- **[Log Name]** — identifies the log instance among co-existing logs.
- **[Next Sequence Number]** — the sequence number that the next appended [Event] will receive. Begins at 1 for a fresh log instance and increments by 1 on each append. Part of the log instance's persistent state — durable implementations must preserve it across restarts to maintain sequence-number monotonicity. Volatile implementations that reset to 1 on restart violate this invariant across the lifetime of the log instance.

There is no `delete` or `edit` surface. Once recorded, events remain; the log only grows.

### Flow

The Event Log has no user-driven flow of its own; it is invoked by composing patterns.

1. **Composing pattern observes a state change.** It calls [Append] with a [Data] payload describing what happened.
2. **Event Log records the event.** The host reads the clock and allocates the [Event Id] at the seam; the transition then writes the [Event] with that [Event Id], [Sequence Number] = [Next Sequence Number], and [Recorded At] stamped from the injected clock. Increments [Next Sequence Number]. Returns [Event Id].
3. **Time passes; more appends happen.** Each receives a fresh, strictly larger [Sequence Number].
4. **A composing pattern queries the log.** Calls [Read] with a [Query]. Receives an ordered sequence of matching events.

### Decision points

- **At [Append]** — [Data] must satisfy the configured payload constraints (default: max 64 KB, opaque bytes; configurable per instance). Empty [Data] (zero bytes) is a valid payload — the atom records it; rejecting meaningless events is the composing pattern's job. Otherwise rejected as [Invalid Payload]. There are no other preconditions; appends never fail for ordering or contention reasons. **A single Event Log instance serializes all appends — this is the load-bearing precondition for Invariants 3 and 4 (total order and monotonicity); neither holds without it.** If the store write fails after all preconditions are satisfied, the atom returns [Storage Failure]. The [Event Id] is not returned; the caller must treat [Storage Failure] as definitive — the [Event] did not land. A sequence number may have been allocated and consumed; see Edge cases.
- **At [Read]** — [Query] parameters must be well-formed (sequence-number range valid, time range valid, predicate parseable). Otherwise rejected as [Invalid Query]. A well-formed [Query] that matches no events returns an empty sequence, not a rejection.

### Behavior

How the concept appears to composing patterns:

- **Append is durable on success** *to the extent the deployment supplies durability* (see Edge cases — *Durability across crashes*). Once the caller receives an [Event Id], the [Event] is in the log and will appear in subsequent reads.
- **Reads are repeatable and monotonic.** Reading the same [Query] at two different times returns at least the events from the earlier read, plus any events appended in between. The log only grows.
- **Order is total.** Any two distinct events have a defined relative position via [Sequence Number]. Ties never occur, even for events appended in the same wall-time instant.
- **Wall-time is best-effort.** [Recorded At] is non-decreasing under a well-behaved clock. Under an unreliable or adversarial clock, [Recorded At] may not be monotonic; [Sequence Number] remains the source of truth for ordering.
- **The log is unbounded by this atom alone.** Retention, archival, and compaction belong to composing patterns; the bare Event Log keeps everything for the lifetime of the log instance.

### Feedback

- After [Append] — a new [Event] exists in the log with a fresh [Event Id], [Sequence Number] = the prior [Next Sequence Number], and [Recorded At] stamped from the injected clock. [Next Sequence Number] increments by 1. The [Event] is immediately visible to subsequent reads.
- After [Read] — a sequence of matching events in ascending [Sequence Number] order. The state of the log is unchanged.

Each rejected action produces an observable refusal naming the failed precondition ([Invalid Payload], [Invalid Query], or [Storage Failure]).

### Invariants

- **Invariant 1 — Append-only.** Once an [Event] is in the log, it remains in the log for the lifetime of the log instance. No action removes events.
- **Invariant 2 — Event immutability.** After a successful [Append], the [Event]'s [Event Id], [Sequence Number], [Recorded At], and [Data] never change.
- **Invariant 3 — Total order.** For any two distinct events `e1` and `e2`, exactly one of `e1`.[Sequence Number] < `e2`.[Sequence Number] or `e1`.[Sequence Number] > `e2`.[Sequence Number] holds.
- **Invariant 4 — Sequence-number monotonicity.** If `e1` was appended before `e2`, then `e1`.[Sequence Number] < `e2`.[Sequence Number].
- **Invariant 5 — Read consistency.** A [Read] issued at time `t` returns every *successfully-appended* [Event] whose [Data] matches the [Query], ordered by [Sequence Number] ascending. The bound is the set of landed events, not the allocator value: an allocated-but-unlanded [Sequence Number] (a [Storage Failure] gap; see Edge cases) corresponds to no returned [Event]. (Like Invariant 4, this holds over successfully appended events only.)
- **Invariant 6 — No id reuse.** No two events in the log share an [Event Id].
- **Invariant 7 — Wall-time best-effort monotonicity.** Under a non-decreasing clock, [Recorded At] is non-decreasing in append order. Under an unreliable clock, this is best-effort and [Sequence Number] is the authoritative order.

Append-only and event immutability together give the *immutable journal* property — the property that distinguishes an Event Log from a mutable record set. Total order and sequence-number monotonicity give the *replay* property. Read consistency gives the *durable visibility* property. No id reuse prevents identity collisions across time.

---

## Examples

The same pattern, four domains, identical mechanic.

### Personal Todo activity log

A composing system wraps each Personal Todo action as an event: `{type: "add", id: "t1", description: "buy milk"}`, `{type: "complete", id: "t1"}`, `{type: "delete", id: "t1"}`. The log records them in order, never alters them. The user can later query the log to see what they did this week, restore deleted tasks (compose with Reverse Index + Restore — see Undo History), or reason about completion patterns. The Personal Todo pattern itself is unchanged; the log is a side stream the composing pattern maintains.

### Compliance audit log

A regulated system records every state-changing action: `{type: "patient_record_accessed", patient_id: "p123", actor: "dr_smith", reason: "treatment", at: "2026-05-07T14:32:11Z"}`. The log is append-only by definition. The [Audit Trail](../compositions/audit-trail.md) composition composes this atom with [Retention Window](./retention-window.md), [Tamper Evidence](./tamper-evidence.md), and [Actor Identity](./actor-identity.md) to add policy-bounded retention, integrity proof, and verifiable attribution. The Event Log itself doesn't know what compliance means; it preserves the sequence faithfully and lets compliance be layered on.

### Patient medical record (clinical history)

Each clinical observation, prescription, lab result, and vital sign is appended as an event with structured data. The clinical record *is* an Event Log; the patient chart is a *view* over it (latest values per field). Mistakes are corrected by appending a *correction event*, never by editing the original — the record must show what was originally recorded and when it was corrected. ICD (International Classification of Diseases — the World Health Organization's standard diagnostic coding system) coding, billing extraction, and longitudinal analytics all read the same log.

### Bank transaction journal

Every credit, debit, transfer, and adjustment is appended as an event in the journal. Account balances are derived by replaying the journal up to a point in time. Reversals are appended as new events (a refund event referencing the original charge), never as edits. The journal is the source of truth; the balance display is a projection. Reconciliation, fraud detection, and regulatory reporting all read the same log.

The mechanic is identical across all four. What differs: payload schema, query patterns, and the composing patterns that derive views (current todo list, audit report, current chart, current balance) from the underlying log.

### Rejection paths

A single sequence exercising all three rejection reasons:

- `append(65_000_bytes_of_data)` → rejected `invalid-payload` (payload exceeds the default 64 KB cap; configurable per instance).
- `append({type: "deposit", amount: 500})` → accepted; returns `event_id e1` with `sequence_number 1`.
- `read({sequence_range: [-1, 5]})` → rejected `invalid-query` (negative sequence number is not a well-formed range parameter).
- `read({sequence_range: [1, 1]})` → returns `[e1]`; `sequence_number 1` matches, ordered ascending.
- Underlying store becomes temporarily unavailable. `append({type: "withdrawal", amount: 100})` → rejected `storage-failure`; event does not land; caller must treat the rejection as definitive. A sequence number may have been consumed; subsequent successful appends receive a strictly higher number, producing a gap in the dense sequence (see Edge cases — *Sequence-number gaps on storage failure*).
- Store recovers. `append({type: "withdrawal", amount: 100})` → accepted; returns `event_id e2` with a sequence number strictly greater than 1.

All three rejection reasons ([Invalid Payload], [Invalid Query], [Storage Failure]) exercised in one thread.

---

## Edge cases and explicit non-goals

What this pattern does not cover:

- **Retention and archival.** The bare Event Log keeps everything forever. Compose with [Retention Window](./retention-window.md) for time-based pruning under regulatory obligation, and a Storage Tier pattern for active-versus-cold archival (orthogonal axis).
- **Tamper-evidence.** Events are immutable by spec, but nothing in the bare atom prevents an adversary with write access from rewriting the log. Cryptographic hash chains, signed events, and Merkle trees belong to a [Tamper Evidence](./tamper-evidence.md) pattern that composes on top.
- **Actor identity.** The Event Log records what was appended; the composing pattern decides whether the payload includes a `who`. [Actor Identity](./actor-identity.md) standardizes that addition with a verifiable non-repudiation binding.
- **Reverse lookup / indexing.** The Event Log supports forward iteration and queries by sequence-number or time range. Lookup by payload field (find all events of type X, find all events touching id Y) is the job of a separate Reverse Index pattern.
- **Distributed consistency.** A single Event Log instance is a single ordered sequence on one host. Multi-host ordering across instances (causal order, vector clocks, Lamport timestamps) belongs to a Consensus or Causal Ordering pattern.
- **Event schemas and evolution.** The data payload is opaque. Schema definition, validation, and migration belong to a Schema Evolution pattern.
- **Compaction and snapshots.** Some event-sourced systems collapse event sequences into snapshots. The bare Event Log does not; Snapshot is a composing pattern.
- **Subscriptions / change feeds.** A pull-only [Read] surface. Push-based notification of new events belongs to an Observer or Change Feed pattern.
- **Multi-event atomicity.** Each [Append] is atomic. Multi-event transactions ("append A and B together or neither") belong to a Transaction pattern.
- **Durability across crashes.** The atom specifies in-memory semantics. Persistence across process restarts is handled at the deployment layer; durable implementations must provide write-ahead logging or equivalent. Append-only and event immutability are best-effort across crashes unless the implementation supplies durability.
- **Right-to-be-forgotten erasure.** Where law mandates true deletion of recorded events (GDPR — EU General Data Protection Regulation — Article 17, certain healthcare contexts), the architectural answer *append corrections, never edit history* breaks down. A composing pattern (Erasure Tombstone, Cryptographic Shredding) must be designed alongside legal counsel.
- **Sequence-number gaps on storage failure.** If an implementation allocates a sequence number before attempting the write, a [Storage Failure] consumes that sequence number. The next successful append receives a strictly higher sequence number, creating a gap in the sequence. Sequence-number monotonicity (Invariant 4) is not violated — the invariant holds over successfully appended events only — but consumers who assume a dense sequence may misinterpret the gap as missing events. Implementations that want to avoid gaps must allocate sequence numbers only after the write succeeds, or use a rollback mechanism that returns the allocated number to the pool on write failure.

Where the pattern breaks down: when the host environment cannot supply atomic, serialized appends (most adversarially-distributed settings); when events must be edited or deleted in place; when ordering must be derived from something other than append order.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Event Log

The named append-only sequence this atom defines: anything appended stays, in append order, unchanged, for the lifetime of the instance. It is the substrate audit trails, undo histories, activity feeds, and event-sourced systems compose on top of. Multiple instances coexist; this card describes one.

Kind: Type

#### Event

A single recorded fact in an [Event Log] — one entry in the sequence, fixed in place once appended. It carries its [Event Id], [Sequence Number], [Recorded At], and [Data]; nothing about it changes after [Append].

Kind: Type

#### Append

The behavior a composing pattern invokes to record a new [Event] at the tail of the log. It allocates the next [Sequence Number], stamps [Recorded At], and returns the [Event Id]. It is the only way data enters the log.

Kind: Operation

#### Read

The behavior a composing pattern invokes to retrieve events matching a [Query], returned in [Sequence Number] order. It only reads; the log is unchanged.

Kind: Operation

#### Event Id

The opaque, immutable identity of an [Event], allocated by the host at the I/O seam on [Append], never reused. It supports equality but carries no ordering — ordering is [Sequence Number]'s job.

Kind:     Field
Field of: Event
Projects: event_id

#### Sequence Number

The strictly increasing integer assigned to each [Event] at [Append]. It fixes the [Event]'s place in the total order and is the authoritative basis for ordering — kept separate from [Recorded At] on purpose, because a clock can drift but the sequence never does.

Kind:     Field
Field of: Event
Projects: sequence_number

#### Recorded At

The wall-time at which an [Event] was appended — an annotation of when, not the basis of order. Stamped from the host-injected clock on [Append]; best-effort monotonic, with [Sequence Number] authoritative if the clock misbehaves.

Kind:     Field
Field of: Event
Projects: recorded_at

#### Data

The opaque payload a composing pattern supplies on [Append] and the [Event] then carries. The Event Log stores and returns it verbatim and never interprets it.

Kind:     Field
Field of: Event
Projects: data

#### Log Name

The identifier that distinguishes one [Event Log] instance from the others co-existing in a system (one per audited subsystem, one per user history, and so on).

Kind:     Field
Field of: Event Log
Projects: name

#### Next Sequence Number

The [Sequence Number] the next appended [Event] will receive. It begins at 1 for a fresh instance and increments on each [Append]; durable implementations preserve it across restarts, or sequence-number monotonicity breaks over the instance's lifetime.

Kind:     Field
Field of: Event Log
Projects: next_sequence_number

#### Query

The selection a caller passes to [Read] — a sequence-number range, a wall-time range, a payload predicate, or a combination. Its exact shape is implementation policy; the only requirement is that a valid [Query] returns events in [Sequence Number] order.

Kind:         Parameter
Parameter of: Read
Projects:     query

#### Invalid Payload

The refusal [Append] returns when the supplied [Data] violates the configured payload constraints (for example, exceeding the size cap). The [Event] does not land.

Kind:      Member
Member of: the Append rejection
Role:      Outcome
Projects:  invalid-payload

#### Invalid Query

The refusal [Read] returns when the [Query] is malformed — an invalid range, an unparseable predicate. No events are returned.

Kind:      Member
Member of: the Read rejection
Role:      Outcome
Projects:  invalid-query

#### Storage Failure

The refusal [Append] returns when the underlying store write fails after all preconditions pass. The caller must treat it as definitive — the [Event] did not land — though a [Sequence Number] may have been consumed (see Edge cases).

Kind:      Member
Member of: the Append rejection
Role:      Outcome
Projects:  storage-failure

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Event Log]: #event-log
[Event]: #event
[Append]: #append
[Read]: #read
[Event Id]: #event-id
[Sequence Number]: #sequence-number
[Recorded At]: #recorded-at
[Data]: #data
[Log Name]: #log-name
[Next Sequence Number]: #next-sequence-number
[Query]: #query
[Invalid Payload]: #invalid-payload
[Invalid Query]: #invalid-query
[Storage Failure]: #storage-failure

---

## Composition notes

Patterns compose with Event Log through one of two contracts, often both:

1. **Append on every state change.** The composing pattern emits an event to the log on every state transition. Personal Todo's `add` / `edit` / `complete` / `delete` would each produce events. The Event Log is the durable record from which the composing pattern's history can be reconstructed.
2. **Replay to derive state.** The composing pattern derives its current state by reading the log from the beginning (or from the most recent snapshot). This is the *event-sourcing* style — the log is the source of truth, current state is a projection.

Forthcoming compositions in `compositions/`:

- **Undo History** — Event Log + Reverse Index + Restore action.
- **[Audit Trail](../compositions/audit-trail.md)** — Event Log + Actor Identity + Retention Window + Tamper Evidence. The canonical regulated-audit primitive; landed.
- **Activity Feed** — Event Log + Subscriber pattern + Filter.
- **Event-Sourced Reservation** — Event Log + Snapshot + Reservation atom.

In all four, Event Log is the substrate; the composing pattern adds the policy.

**The invariant set is a frozen contract surface.** Undo History, Audit Trail, Compensable Workflow, and Reserve from Pool cite Event Log's invariants wholesale (e.g. Compensable Workflow Invariant 9 cites "Event Log Invariants 1–7"; Reserve from Pool cites the full constituent set). Additive growth — a new invariant — is forward-compatible via the `all invariants from [Atom]` citation form, but any *renumber* or content change to an existing invariant is a breaking cascade that re-passes those compositions. Treat the numbering as stable.

---

## Standards references

Event Log is a foundational primitive with deep standards backing:

- **ISO/IEC 27001** (International Organization for Standardization / International Electrotechnical Commission — joint information-security management standard) — mandates event logging for security-relevant actions.
- **NIST SP 800-92** (National Institute of Standards and Technology — US federal standards body) — *Guide to Computer Security Log Management*; describes log lifecycle, integrity, retention requirements.
- **W3C (World Wide Web Consortium — the web standards body) Activity Streams 2.0** — JSON (JavaScript Object Notation — a lightweight text format for structured data) format for activity feeds; treats activities as events with actor / verb / object structure.
- **Event Sourcing literature** — Greg Young's early write-ups; Martin Fowler's *Event Sourcing*; foundational pattern in domain-driven design.
- **Database write-ahead logging (WAL)** — the same primitive at the storage layer; ARIES (Algorithms for Recovery and Isolation Exploiting Semantics — a classic database crash-recovery method) recovery, PostgreSQL WAL, MySQL binlog.
- **Distributed-systems replication logs** — Kafka topics, Raft logs, Paxos value logs.
- **Version control** — Git's commit log is an Event Log with cryptographic tamper-evidence (a Merkle DAG — a directed acyclic graph whose nodes are linked by cryptographic hashes, so any change to history is detectable) layered on top.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the conception of a freestanding concept with state, actions, and operational principles.
- **Eiffel's design-by-contract** — preconditions on [Append] and [Read].
- **Linear temporal logic** (a formal notation for reasoning about sequences of states over time) — append-only, event immutability, and sequence-number monotonicity expressed as temporal properties (`always`, `until`).

---

## Status

`grounded on Final Critique 4 — 2026-06-18` (Final Critique 4 — the first AI-conducted adversarial round, fresh-reader Opus, 2026-06-18 — closed two foundational findings: F-1 logic-confinement and F-2 read-consistency scope; see Lineage. Formal layer landed 2026-06-03 — TLA+ model `event-log.tla` + a buggy twin the checker rejects, see Lineage §Formal model. The pattern was grandfathered at the legacy `grounded — 2026-05-20` token until this round.) — concept is freestanding, composable, has a verifiable invariant set, and four cross-domain examples spanning productivity, compliance, healthcare, and finance. Ready for composition with Undo History, Audit Trail, Activity Feed, and event-sourced systems.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

This pattern survived all three pressure-testing passes (see [`pressure-testing.md`](../pressure-testing.md)) on its first revision.

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Clean. All nine nodes addressed; the Edge cases section enumerates eleven explicit out-of-scope concerns, each pointing at a composing pattern that handles it (Retention Window, Tamper Evidence, Actor Identity, Reverse Index, Consensus, Schema Evolution, Snapshot, Observer, Transaction, durability, Erasure Tombstone).

**Pass 2 — Conceptual independence (EOS).** Clean. Event Log is itself a foundational primitive that other concepts compose on top of. The concerns most often candidates for extraction (retention, tamper-evidence, actor identity, indexing) are already correctly named as composing patterns rather than absorbed into the atom.

**Pass 3 — Adversarial scrutiny (Linus mode).** Three findings, one fixed in-pattern, two already adequately addressed:

- *`next_sequence_number` behavior across restarts.* The first draft said "begins at 1 and increments by 1 on each append" without addressing what happens if the log instance is durable and survives a restart. Fixed: the State section now specifies the counter is part of the log instance's persistent state and that durable implementations must preserve it across restarts to maintain sequence-number monotonicity.
- *Query DSL ambiguity.* Already named explicitly as implementation policy. The atom guarantees only that any well-formed query returns events in `sequence_number` order; the predicate language is intentionally deferred to composing patterns and implementations.
- *Append/read concurrency.* Already addressed under Decision points (appends serialized by the underlying implementation) and under durability in Edge cases.

The pattern is `grounded — 2026-05-13` after one round.

**Refinement round 1.** Five findings, all closed in-pattern. Conventions inherited from the methodology directly.

- *`append` signature used `rejected(reason)` placeholder.* The actual reason was `invalid-payload`; `storage-failure` was absent entirely. Resolved: signature expanded to `rejected(invalid-payload | storage-failure)`. Decision points updated — if the store write fails after all preconditions pass, the atom returns `rejected(storage-failure)`; the `event_id` is not returned; the caller must treat the rejection as definitive. The Behavior section's "append is durable on success" guarantee has a converse: if the caller receives `storage-failure`, the event did not land.
- *`read` signature omitted its rejection form entirely.* The signature showed only `ordered_sequence_of_events`; Decision points and Feedback both named `invalid-query` as a rejection but it was absent from the signature. Resolved: signature updated to `read(query) → ordered_sequence_of_events | rejected(invalid-query)`.
- *Feedback section missing `storage-failure`.* The enumeration of rejection reasons listed `invalid-payload` and `invalid-query` only. Resolved: `storage-failure` added to the enumeration.
- *Storage-failure not addressed in Decision points.* Resolved: `append` Decision point extended — storage-failure path, the consequence (event did not land), and the sequence-number allocation note added.
- *Sequence-number gap on storage failure not addressed.* Implementations that allocate a sequence number before the write attempt may consume that number on `storage-failure`, creating a gap in the sequence. Invariant 4 is not violated (it holds over successfully appended events only), but consumers expecting a dense sequence may misinterpret the gap. Resolved: new Edge case — *Sequence-number gaps on storage failure* — added with guidance for gap-free implementations.

**Scheduled rescan: 2026-05-20.** Pass 1 clean. Pass 2 clean. Pass 3 — one refining finding: examples covered only happy-path append sequences across four domains; no example exercised the rejection paths (`invalid-payload`, `invalid-query`, `storage-failure`). All three rejection reasons were named in Decision points and Feedback but not demonstrated with concrete values. Resolved: fifth example — *Rejection paths* — added, walking all three rejection reasons in a single thread including the sequence-number gap consequence of a `storage-failure`. Round closes clean.

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 4 (sequence-number monotonicity — earlier append ⇒ smaller sequence_number) and Invariant 1 (append-only, no removal) define the replay/ordering property a formal model verifies. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** The derived model is [`event-log.tla`](./event-log.tla) with config [`event-log.cfg`](./event-log.cfg), checked by the repo's `tla-checker` WASM model checker via `tools/harness/check.mjs`.

*What it checks.* The log is modeled as an insertion-ordered function `1..MaxLen -> {eid, seq}` with `len` landed events and monotonic allocators `next_seq`/`next_eid` (the Sequences module is avoided to stay within the checker's supported fragment). Two append modes are modeled: `AppendOk` (allocate `seq = next_seq`, land at the tail) and `AppendStorageFail` (a sequence number is allocated and consumed but no event lands — the *Sequence-number gaps on storage failure* edge case). Three named safety invariants are checked under every interleaving: the load-bearing **Invariant 4** (sequence-number monotonicity — earlier insertion position ⇒ strictly smaller `sequence_number`), **Invariant 3** (total order — distinct landed events have distinct `sequence_number`s), and **Invariant 6** (no `event_id` reuse). The model confronts the subtle claim directly: monotonicity holds over *successfully appended* events even when storage-failure gaps the dense sequence.

*Bounds and scope.* `MaxLen = 4`, `MaxSeq = 6` (room for gaps). Exhaustive: 119 reachable states, all invariants hold. **Invariant 1** (append-only) and **Invariant 2** (event immutability) are enforced by construction (no action removes a landed event or rewrites a filled slot — `AppendOk` only writes position `len+1`) rather than asserted as state predicates. Deliberately **out of model scope**: payload/query validation guards (`invalid-payload`, `invalid-query` — input checks, not ordering); read consistency (Invariant 5 — relies on exactly the ordering checked here); wall-time best-effort monotonicity (Invariant 7 — explicitly best-effort, with `sequence_number` authoritative).

**AI adversarial round — Final Critique 4 (first real AI round) — 2026-06-18.** This pattern grounded 2026-05-20 under the early process — foundation plus refinement passes, with Pass 3 "Linus mode" author-conducted and no fresh-reader AI adversarial round — and carried the legacy `grounded — 2026-05-20` token (grandfathered). This round is that missing AI-conducted adversarial round, run by a fresh-reader Opus (Happy-Torvalds-X2); it is the pattern's Final Critique 4 (Rounds 1–3 being the foundation/refinement baseline, per `pressure-testing.md` §Round structure). Two foundational findings, both closed in-pattern:

- *F-1 — Logic Confinement.* The atom read the clock (`recorded_at = now`) and generated `event_id` inside the `append` transition (an "implicit clock"), violating the Logic Confinement Principle (`execution-contract.md` §3) that Pass 3 checks. Fixed by adopting the corpus-canonical host-injected-at-seam formulation (as in Session, Capability, Message Preference): the host reads the clock and allocates `event_id` at the I/O seam before the transition; the pure transition receives both as inputs; the caller signature `append(data)` is unchanged — timestamps and ids are never caller-supplied. Inputs, Identity model, Flow step 2, and Feedback updated.
- *F-2 — Read consistency (Invariant 5).* Invariant 5 was stated over `next_sequence_number − 1` (the allocator high-water mark), which the atom's own storage-failure gap edge case makes a non-corresponding term. Re-scoped to successfully-appended events, mirroring Invariant 4; now internally consistent with the gap edge case, and the formal model's Invariant-5-out-of-scope note is unaffected.

Four refining findings folded: empty `data` is a valid payload (rejecting meaningless events is the composing pattern's job); `event_id` supports equality but carries no ordering; the single-instance-serialization precondition for Invariants 3/4 was promoted to load-bearing (bolded in Decision points); a Composition note records that the invariant set is a frozen contract surface dependents cite wholesale. Two rhetorical: the durability guarantee was qualified; the Status token migrated to the canonical Final Critique form. GRID Friction and System are discharged within Intent and Structure (noted here per the round; no restructure needed).

Confirming fresh-reader Opus clearance gate (2026-06-18): **CLEAR, 0 foundational** — both foundational fixes verified genuinely closed against the canonical reference atoms, the execution-contract pipeline, the TLA+ model + buggy twin + coverage matrix, and all four dependents; the folds opened no new surface. **Compositions affected — confirming check only, NOT a re-pass** (caller signature and invariant numbering stable; no dependent relies on Invariant 5's prior content; the F-1 fold actively corroborates Undo History's existing composition text): Undo History, Audit Trail, Compensable Workflow, Reserve from Pool. Grounds at Final Critique 4.

*Buggy twin (vacuity guard).* [`event-log-buggy.tla`](./event-log-buggy.tla) adds the `VolatileRestart` action the English explicitly warns against (State §`next_sequence_number`: "Volatile implementations that reset to 1 on restart violate this invariant across the lifetime of the log instance"). The checker rejects it at 14 states with the counterexample `AppendOk → VolatileRestart → AppendOk`: position 1 and position 2 both carry `seq = 1`, so `log[1].seq < log[2].seq` fails. The twin's rejection confirms the correct model's clean pass is non-vacuous and turns the spec's prose warning into a mechanical regression guard.

*Conflict-protocol outcome.* None triggered. The model **corroborates** the English — sequence-number monotonicity holds under every reachable interleaving including storage-failure gaps — so no counterexample flowed back and the canonical English is unchanged. Reproduce with `cd tools/harness && bash bootstrap.sh && node check.mjs ../../atoms/event-log.tla` (and `… event-log-buggy.tla --buggy`).

**Annotation conversion (all four kinds + manifest) — 2026-06-29 (annotation.md first-batch rollout, with Duplicate Prevention and Personal Todo).** Converted every concept reference to a `[Term]` marker and added the per-page Terms registry, applying the resolved fourth-kind decision — **Field** (a datum a Type carries — *what does it carry?*) and **Parameter** (a value an Operation needs — *what does it need?*). This atom was chosen for the carry-kind stress test: the discriminator is *stored-as-itself → Field, consumed-not-stored → Parameter*, and it lands cleanly — [Event Id], [Sequence Number], [Recorded At], [Data], [Log Name], [Next Sequence Number] are Fields (stored on the [Event] or the [Event Log]); [Query] is the one Parameter (consumed by [Read], never stored). The three rejection reasons became Members — [Invalid Payload], [Invalid Query], [Storage Failure] — exercising the enumerated kind the manifest must project. Casing left the prose into each card's `Projects:` line; every target's lowering is derived by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs). The two Operation contracts (`append(data) → event_id | …`, `read(query) → …`) are kept once each in Actions as the labeled *projected contract*; the concrete example calls in Examples (e.g. `append({type: "deposit", …})`) are left verbatim as illustrative wire-level invocations. Personal Todo's `add` / `edit` / `complete` / `delete` in Composition notes stay backticked: they are *that* page's Operations — a cross-page reference becomes a full link (`[Add](./personal-todo.md#…)`), not a page-local shortcut marker, once both registries are ratified. Expression only — the frozen-invariant-contract surface is untouched: all seven invariants hold their exact relations (`e1`.[Sequence Number] < `e2`.[Sequence Number] is the same claim as before), the numbering is stable, and the dependents that cite "Event Log Invariants 1–7" are unaffected. **Re-verified, not re-grounded:** Status stays at Final Critique 4. Gates: linter 0 (incl. the new O-term-resolver, resolving all 14 of this page's markers); the TLA+ model and its buggy twin **untouched** and still PASS / rejected; the manifest projects an identifier kind (Field) and an enumerated kind (Member); diff read line-by-line against the same-claim-or-weaker test.

**Showcase pass — 2026-06-29.** Brought to the full showcase standard, matching the [`duplicate-prevention.md`](./duplicate-prevention.md) and [`provisional-commitment.md`](./provisional-commitment.md) exemplars, on top of the already-applied annotation conversion. Changes are representational only: (1) **Summary/blockquote merge** — the plain Tier-1 [`prose.md`](../working-ideas/prose.md) cut-#4 Summary moved to the very top (immediately after the TOC, before Intent), and the descriptive top blockquote (*"A temporal primitive: an append-only sequence of immutable, time-ordered events…"*) folded out as redundant: its two claims — the append-only/immutable/time-ordered framing and the "substrate every audit/history/replay/event-sourcing pattern composes on" framing — are already carried by the Summary ("anything written to it stays, in the order it arrived, unchanged… the foundation that audit trails, undo histories, activity feeds, transaction journals, and replay systems are all built on") and by Intent ("audit trails, undo histories, activity feeds, event sourcing, write-ahead logs, replication journals…"), so nothing was lost. This atom has **no** prior *also-known-as* line, and none was invented — the italic aliases line is omitted (unlike the two exemplars, which carry one). (2) **Lineage collapse** — the Lineage notes wrapped in the collapsed `<details>` block mirroring the exemplars, the `---` separator kept before it; no Lineage text altered. (3) **prose.md cut #1 (one idea per sentence)** — the Summary, previously a single very long run-on sentence, split into short declaratives (the two-operations clause, the no-edit-no-delete clause, the sequence-number/clock-drift clause, and the separation-of-concerns clause each became their own sentence), lossless; Intent, Behavior, and Decision points were scanned and left as-is — their sentences already carry one idea each, and the dense `[Append]` Decision-point bullet is load-bearing precision (the bolded single-instance-serialization precondition, the storage-failure gap semantics) that the prose.md §Leave it alone rule keeps intact. (4) **prose.md cut #5 (prose→structure) — assessed and SKIPPED.** Event Log has **no state machine** (it is a single append-only sequence — no states, no transitions) and its two actions ([Append], [Read]) have simple preconditions, **not** a precedence-ordered gate (there is no ranked rejection priority of the provisional-commitment kind to tabulate). A 2-action decision table would merely restate the Decision-points prose without adding glanceable precedence, and would risk dropping into a cell the load-bearing serialization precondition and the storage-failure/sequence-gap semantics — exactly the cut-#5 caveat hazard. No structure genuinely sharpens the prose here, so cut #5 is skipped (the exemplars likewise skip cuts that do not apply). (5) **cut #4** — the Summary is kept plain Tier-1, readable cold by a domain expert who never opens the action wiring. Cuts #2 (glossary) and #3 (cross-ref footer) were assessed and **skipped**: acronyms are already spelled-out-once inline per the corpus convention here, and provenance already lives in the invariants' supporting prose and Composition notes rather than being re-cited mid-sentence. Expression only — every invariant and its number, the frozen `e1`.[Sequence Number] < `e2`.[Sequence Number] total-order relation and all of Invariants 1–7, both projected-contract signatures (`append(data) → event_id | …`, `read(query) → …`), every guarantee, and the "Event Log Invariants 1–7" frozen contract surface dependents cite wholesale are unchanged in force; every `[Term]` marker still resolves to its card and the Terms registry is intact. **Re-verified, not re-grounded:** Status stays at `grounded on Final Critique 4 — 2026-06-18`. Gates: linter 0 (incl. the O-term resolver — all 14 markers resolve against the registry); the TLA+ model `event-log.tla` and its buggy twin `event-log-buggy.tla` are **UNTOUCHED** and still PASS / correctly-rejected; the derived manifest projects an identifier kind (Field) and an enumerated kind (Member) cleanly; `git status` shows no `.tla`/`.cfg` modified; diff read line-by-line against the same-claim-or-weaker test.

</details>
