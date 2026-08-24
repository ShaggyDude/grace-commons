---
title: Provenance
parent: Atomic Concepts
has_toc: true
toc: true
---

# Provenance

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>

## Summary

Provenance answers the chain-of-custody question: where did this artifact come from, who has held it, what has been done to it, and who holds it right now? It works by keeping an append-only record — a chain of entries — for a single artifact (a pharmaceutical sample, a digital file, a piece of physical evidence, a legal document) from the moment the artifact enters the system until it reaches a final terminal state called Archived.

Each entry records one custody event: the artifact was originated (created under custody), transferred from one custodian to another, transformed in some way, disclosed to a recipient, or finally archived. Entries can only be added, never removed or changed.

The chain always has exactly one current holder (called the custodian), and the only way to change who that holder is uses a hand-to-hand transfer — the system reads the current holder from its own records and records the transfer as coming from that person, so it is structurally impossible to forge a custody gap or a false predecessor. A transfer, a transformation, and a disclosure can only be recorded by the person the chain currently shows as holding the artifact.

Every entry carries a sequence number that goes up by one for each new entry; this sequence number is the authoritative order source, kept separate from the human-readable timestamp so that the chain can be replayed correctly even when clocks drift. This is the mechanism behind pharmaceutical chain of custody, physical-evidence chains for courts, financial instrument custody records, and controlled-substance tracking.

---

## Intent

Regulated industries demand an unbroken account of every artifact's journey. A pharmaceutical sample must travel from manufacturer to pharmacist without a custody gap; a piece of physical evidence must traverse from crime scene to courtroom without any unattributed hand-off; a financial instrument must carry a ledger of every holder and transformation it has undergone. The shape is constant across domains: something exists, someone holds it, it may change hands, it may be altered, and at every point in its history the answer to "who is holding this right now, and what has been done to it?" must come from the records alone — not from anyone's recollection, and not from the system operator's assertion.

The Provenance atom addresses this requirement. It records the origin, custody history, and transformation history of one artifact as an append-only chain of entries, with a current custodian maintained continuously from genesis to terminal disposition. The fundamental guarantee the atom enforces is **custody continuity**: there is no point in the chain's life at which custody is held by nobody or by two parties simultaneously. Every transfer is hand-to-hand — the outgoing custodian's identity is read from the chain's own state, never supplied by the caller — so no transfer can manufacture a false predecessor. Every transformation and disclosure is guarded: only the current custodian can record them.

This is a freestanding (can be specified without naming any other pattern) atom in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the chain and its entries), its own actions (`originate`, `transfer`, `transform`, `disclose`, `archive`, `read`), and its own operational principles (entries are immutable once recorded; the chain is append-only; custody is continuous and unambiguous at all times).

**The EOS boundary against Event Log.** Provenance is not an Event Log of custody events, and this distinction is load-bearing. Event Log (see [`atoms/event-log.md`](./event-log.md)) is a content-agnostic stream of system events with no subject, no custodian, no continuity guarantee, and no prohibition on sequence gaps. Event Log explicitly *permits* sequence gaps — a `storage-failure` consumes a sequence number and the next successful append receives a strictly higher one; consumers must not assume a dense sequence. Provenance, by contrast, is anchored to one artifact, maintains exactly one current custodian continuously, and its load-bearing Invariant 4 (custody continuity) is a property Event Log cannot express: custody continuity is not a property of a content-agnostic event stream but of a subject-scoped chain where every entry is attributed to the then-current holder. Likely objection: *"Why not just build Provenance as a specialized Event Log with a custodian field?"* The mechanism that resolves it: Provenance's transfer action reads the outgoing custodian from the chain's own state (not from a caller-supplied field), making it structurally impossible to record a transfer from someone who was not the current custodian; Event Log has no subject state, no current-custodian projection, and no such guard. Result: custody continuity is an invariant of the Provenance chain that no amount of Event Log wrapping can provide, because the chain's own state is what enforces it — and that state is Provenance's own, not borrowed from another concept.

The atom does not implement non-repudiable custodian identity, cryptographic chain integrity, retention and defensible disposal, or the full chain-of-custody attribution+tamper+retention surface. Each is a separate composable concept; see Composition notes and Edge cases.

**The linear single-artifact constraint.** This atom is deliberately a linear single-artifact custody chain — one chain tracks one artifact from origin to terminal disposition, with a single current custodian at every point. It does not model artifact splitting (one pharmaceutical sample aliquoted into several), DAG-style derivation (one artifact derived into many related artifacts), W3C PROV (Provenance Data Model — a W3C (World Wide Web Consortium) standard for representing provenance as a directed acyclic graph of entities, activities, and agents) `wasDerivedFrom` relationships, or multi-party simultaneous custody. These are explicit non-goals; see Edge cases. The linearity constraint is what makes custody continuity a tractable invariant — in a DAG model, "current custodian" is not well-defined — and the single-artifact constraint is what makes the chain's subject unambiguous. The design mirrors `atoms/clinical-observation.md`'s explicit scoping of the linear single-chain model and its equally explicit non-goal of branching.

---

## Structure

### Identity model

Each Provenance chain has a **[Chain Id]** — an opaque, immutable, system-generated identifier produced by [Originate]. The [Chain Id] is the chain's identity. The [Artifact Ref] is an opaque, immutable property of the chain set at genesis; it is never the chain's identity. Two chains for different artifacts have different [Chain Id]s; a single artifact has exactly one chain over its lifetime.

The opaque-id model matters here for the same reason it matters throughout the compliance atoms: identifying a chain by [Artifact Ref] would make it impossible to distinguish chains that track different handling episodes of artifacts with the same external identifier (returned-and-reprocessed pharmaceutical batches, reintroduced evidence, reissued instruments), and it would make the chain itself dependent on the semantics of the artifact reference, which belongs to an external layer. [Chain Id] is the atom's own stable identity; [Artifact Ref] is opaque.

Each custody entry has an **[Entry Id]** — opaque, immutable, system-generated, unique within the chain and never reused. Each entry also has a **[Sequence Number]** — a strictly increasing integer assigned at append, the order source within the chain. The [Sequence Number] is clock-independent: even if the wall-time clock skips or moves backward, the sequence is authoritative. This mirrors the discipline of Event Log's `sequence_number` exactly — [Recorded At] is a best-effort wall-time annotation, not the source of ordering.

The chain itself maintains a per-instance **[Next Sequence Number]** counter, beginning at 1 for a fresh chain instance and incrementing by 1 on each successful entry write. This counter is part of the chain's persistent state and must be preserved across restarts by durable implementations. Volatile implementations that reset to 1 on restart violate the strictly-increasing invariant across the lifetime of the chain.

**Store instances.** Each Provenance chain lives in a named store instance; multiple chains coexist in one store (one per artifact), and multiple store instances coexist in real deployments (one per facility, jurisdiction, custody domain, or business unit). [Chain Id] values are unique within a store instance; uniqueness across instances is a composing concept. [Artifact Ref] is scoped to the host system — the same [Artifact Ref] may appear in different store instances for genuinely different artifacts, or for the same artifact tracked in two custody domains. A call implicitly targets a single routed store instance; the mechanism by which a call reaches a specific instance (service binding, namespace prefix, endpoint) is resolved at the deployment-routing layer, not defined by this atom.

### Inputs

- An [Artifact Ref] identifying *what* is being tracked. The atom treats this as opaque — the host system defines what an artifact is and how to reference it.
- [Custodian Ref] values identifying *who* is holding the artifact. Also opaque — the identity registry belongs to a separate layer. Non-repudiable attestation of custodian identity composes with [Actor Identity](./actor-identity.md); the atom records [Custodian Ref] values and enforces structural continuity without itself verifying them.
- Actions:
  - [Originate] — (Projected contract: `originate(artifact_ref, custodian_ref, genesis_type, [metadata]) → chain_id | rejected(invalid-ref | invalid-genesis-type | storage-failure)`)
  - [Transfer] — (Projected contract: `transfer(chain_id, to_custodian_ref) → entry_id | rejected(not-known | archived | invalid-ref | storage-failure)`)
  - [Transform] — (Projected contract: `transform(chain_id, custodian_ref, transformation_descriptor) → entry_id | rejected(not-known | archived | not-current-custodian | invalid-ref | invalid-descriptor | storage-failure)`)
  - [Disclose] — (Projected contract: `disclose(chain_id, custodian_ref, recipient_ref) → entry_id | rejected(not-known | archived | not-current-custodian | invalid-ref | storage-failure)`)
  - [Archive] — (Projected contract: `archive(chain_id, custodian_ref) → entry_id | rejected(not-known | already-archived | not-current-custodian | storage-failure)`)
  - [Read] — (Projected contract: `read(chain_id, [query]) → ordered_sequence_of_entries | rejected(not-known | invalid-query)`)
- A clock providing wall-time timestamps (best-effort; not the order source) and an id source for [Chain Id] and [Entry Id] allocation, both injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the ids at the seam, *before* the transition runs; the pure transition receives the wall-time reading and the fresh ids as injected inputs and reads no clock and mints no id internally. Neither is supplied by the business caller — which keeps the transition deterministic and forecloses caller-supplied timestamp or id lying. The clock enters at that single seam and not as an action parameter, so the projected contracts above carry no `now` argument. The injected reading is consumed for exactly one purpose in this atom — stamping [Recorded At] on the appended entry; ordering comes from [Sequence Number], which is assigned from [Next Sequence Number] and never from the clock.

### Outputs

- For [Originate]: a fresh [Chain Id], or a rejection naming the failed precondition.
- For [Transfer], [Transform], [Disclose], [Archive]: a fresh [Entry Id], or a rejection naming the failed precondition.
- For [Read]: a (possibly empty) ordered sequence of entries for the named chain, in [Sequence Number] ascending order. Each entry carries its [Entry Id], [Sequence Number], [Event Type], [Custodian Ref] (or both [From Custodian Ref] and [To Custodian Ref] for transfers), [Recorded At], and event-type-specific fields. The current-custodian projection is derivable from the entries: it is the [To Custodian Ref] of the latest transfer entry, or the [Custodian Ref] of the genesis entry if no transfer has occurred.
- Rejected actions produce an observable refusal naming the failed precondition.

### State

**Chain state.** A Provenance chain occupies exactly one of two states:

- **[Open]** — the chain is active; entries may be appended; the chain has exactly one current custodian.
- **[Archived]** — the chain is at terminal disposition; no further entries are accepted. Archived is absorbing.

**Chain-level fields:**

- **[Chain Id]** — opaque, immutable, system-generated. Set on [Originate]. Never changes.
- **[Artifact Ref]** — opaque, immutable. Set on [Originate]. Never changes.
- **[Chain State]** — either [Open] or [Archived]. Begins at [Open]; transitions to [Archived] on [Archive]. No further transitions.
- **[Current Custodian]** — the opaque reference of the current custodian. Set on [Originate] to the genesis [Custodian Ref]; updated on each successful [Transfer] to [To Custodian Ref]. Never null while the chain is [Open] or [Archived]. [Current Custodian] is a **derived projection** of the entry chain — equal to the [To Custodian Ref] of the latest `transferred` entry, or the genesis [Custodian Ref] if no transfer has occurred — maintained as cached chain state so the action guards can be evaluated without replaying the whole chain. The entry chain is the authoritative source: if the cached [Current Custodian] ever disagrees with the value obtained by replaying entries in [Sequence Number] order, the replayed value governs and the discrepancy is itself a conformance failure (see Generation acceptance, check 3). No invariant depends on the cache being correct; every invariant is stated over the entry chain.
- **[Next Sequence Number]** — a strictly increasing integer. Begins at 1; increments by 1 on each successfully written entry. Part of the chain's persistent state; must survive restarts.

**Entry-level fields (all entries):**

- **[Entry Id]** — opaque, immutable, system-generated. Set on append. Never reused within the chain.
- **[Sequence Number]** — strictly increasing integer assigned from [Next Sequence Number] at append. The order source.
- **[Event Type]** — one of `{originated, received, transferred, transformed, disclosed, archived}`. Set on append. Never changes.
- **[Custodian Ref]** — the custodian who performed or is affected by this event (see note on transfers below). Non-empty. Set on append. Never changes.
- **[Recorded At]** — wall-time when the entry was appended. Best-effort annotation; not the order source.

**Additional entry fields by [Event Type]:**

- `originated` or `received` (genesis entries): optional [Metadata] (opaque). The genesis entry's [Event Type] is itself `originated` or `received`; the [Genesis Type] argument to [Originate] simply selects which. There is no separate stored [Genesis Type] field — it would duplicate [Event Type] — so [Genesis Type] is an input name only, not an entry field.
- `transferred`: two custodian fields — [From Custodian Ref] (the outgoing custodian, read from [Current Custodian] at transition time — never supplied by the caller) and [To Custodian Ref] (the incoming custodian, supplied by the caller). After this entry, [Current Custodian] becomes [To Custodian Ref].
- `transformed`: [Transformation Descriptor] (an opaque non-empty description of what was done).
- `disclosed`: [Recipient Ref] (opaque reference to the party to whom a view or copy was disclosed; custody is NOT transferred).
- `archived`: no additional fields beyond the common set.

**Transitions.** Each action is fail-closed: a rejected action appends no entry and leaves both [Chain State] and [Current Custodian] unchanged (the rejection vocabulary and its precedence are in Decision points). Every appended entry takes the next [Sequence Number] from [Next Sequence Number], which increments by one. [Transfer] is hand-to-hand — [From Custodian Ref] is read from [Current Custodian] in chain state, never supplied by the caller; for [Transfer] and [Archive] the entry write and the chain-state update are jointly atomic. On [Archive] the [Current Custodian] is unchanged: the archiving custodian remains the chain's last-recorded holder. [Read] never transitions.

| Action | From | Guard | Appends | [Current Custodian] after | [Chain State] after | Returns |
|---|---|---|---|---|---|---|
| [Originate] | — (new) | valid refs + [Genesis Type] | genesis entry (`originated`/`received`), `sequence_number = 1` | = genesis [Custodian Ref] | [Open] | [Chain Id] |
| [Transfer] | [Open] | valid [To Custodian Ref] | `transferred` entry; [From Custodian Ref] = [Current Custodian] | = [To Custodian Ref] | [Open] | [Entry Id] |
| [Transform] | [Open] | [Custodian Ref] = [Current Custodian] | `transformed` entry | unchanged | [Open] | [Entry Id] |
| [Disclose] | [Open] | [Custodian Ref] = [Current Custodian] | `disclosed` entry | unchanged | [Open] | [Entry Id] |
| [Archive] | [Open] | [Custodian Ref] = [Current Custodian] | `archived` entry | unchanged | [Archived] | [Entry Id] |

### Flow

1. **Artifact enters the system.** The host system calls [Originate]. The atom opens a chain with a genesis entry ([Event Type] = `originated` or `received`), sets [Current Custodian] to the genesis [Custodian Ref], assigns [Chain Id]. Returns [Chain Id].
2. **Artifact is transformed.** The current custodian records a transformation via [Transform]. The atom appends a `transformed` entry. [Current Custodian] is unchanged.
3. **Artifact is disclosed to an external party.** The current custodian records a disclosure via [Disclose]. The atom appends a `disclosed` entry. [Current Custodian] is unchanged; the recipient is not a new custodian.
4. **Artifact changes hands.** The host system calls [Transfer]. The atom reads [From Custodian Ref] from [Current Custodian] in chain state, appends a `transferred` entry, and updates [Current Custodian] to [To Custodian Ref]. The caller supplies only the incoming custodian; the outgoing custodian is read from the chain's own state — the hand-to-hand discipline that makes custody continuity structurally enforced rather than procedurally hoped.
5. **Artifact reaches terminal disposition.** The current custodian calls [Archive]. The atom appends an `archived` entry and transitions the chain to [Archived]. No further entries are accepted.
6. **Query.** Any party calls [Read]. The atom returns all entries in [Sequence Number] ascending order. The current-custodian projection is the [To Custodian Ref] of the latest `transferred` entry, or the genesis [Custodian Ref] if no transfer has yet occurred.

A simpler lifecycle — [Originate], [Disclose], [Archive], no transfer or transformation — is also valid. The chain must have a genesis entry and may have zero or more intermediate entries before archive.

### Decision points

**Logic confinement (clock and id).** The clock and the id source are **injected inputs at the I/O seam**, never read or minted inside a transition and never passed as action parameters. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host takes one wall-time reading and allocates the fresh [Chain Id] / [Entry Id] at the seam before the transition runs; the transition consumes them and calls no clock and no id generator of its own. Because the clock enters at the seam rather than through the caller, **no action signature carries a clock (`now`) parameter** — the projected contracts in Inputs are complete as written. In this atom the injected reading is consumed for exactly one purpose: stamping [Recorded At] on the appended entry. Nothing else reads it — no guard, no rejection, and no ordering rule consults wall-time, because [Sequence Number] (taken from [Next Sequence Number], never from the clock) is the authoritative order source. A dishonest or non-monotonic clock therefore degrades only the [Recorded At] annotation; it cannot change which entries are accepted, the order in which they replay, or who the chain's [Current Custodian] is.

- **At [Originate]** — [Artifact Ref] and [Custodian Ref] must each contain at least one non-whitespace character; otherwise [Invalid Ref]. [Genesis Type] must be exactly one of `{originated, received}`; otherwise [Invalid Genesis Type]. If the chain creation or genesis entry write fails after all preconditions are satisfied, the atom returns [Storage Failure] — no chain is created, no [Chain Id] is returned, and the caller must treat the rejection as definitive. The atom does not validate [Artifact Ref] against an external artifact registry; the host system is responsible for ensuring the reference is meaningful.

- **At [Transfer]** — [Chain Id] must reference a known chain; otherwise [Not Known]. The chain must be in [Open] state; otherwise `archived`. [To Custodian Ref] must contain at least one non-whitespace character; otherwise [Invalid Ref]. The [From Custodian Ref] is read from [Current Custodian] in chain state — the caller does not supply it, and no check against a caller-supplied outgoing custodian is needed or performed. If the entry write and [Current Custodian] update fail after all preconditions are satisfied, the atom returns [Storage Failure]. The entry write and the [Current Custodian] update are jointly atomic: either both land or neither is visible. A [Storage Failure] response guarantees the chain state is unchanged — [Current Custodian] retains its prior value.

- **At [Transform]** — [Chain Id] must reference a known chain; otherwise [Not Known]. The chain must be in [Open] state; otherwise `archived`. [Custodian Ref] must equal [Current Custodian] in chain state; otherwise [Not Current Custodian]. [Custodian Ref] must contain at least one non-whitespace character; otherwise [Invalid Ref]. [Transformation Descriptor] must contain at least one non-whitespace character; otherwise [Invalid Descriptor] (a descriptor is not a reference, so it carries its own rejection reason). If the entry write fails, the atom returns [Storage Failure] and the chain state is unchanged.

- **At [Disclose]** — [Chain Id] must reference a known chain; otherwise [Not Known]. The chain must be in [Open] state; otherwise `archived`. [Custodian Ref] must equal [Current Custodian]; otherwise [Not Current Custodian]. [Custodian Ref] and [Recipient Ref] must each contain at least one non-whitespace character; otherwise [Invalid Ref]. If the entry write fails, the atom returns [Storage Failure] and the chain state is unchanged.

- **At [Archive]** — [Chain Id] must reference a known chain; otherwise [Not Known]. The chain must be in [Open] state; otherwise [Already Archived]. [Custodian Ref] must equal [Current Custodian]; otherwise [Not Current Custodian]. If the entry write and chain state update to [Archived] fail, the atom returns [Storage Failure] and the chain remains in [Open] state. The [Archive] entry write and the chain-state transition are jointly atomic.

- **At [Read]** — [Chain Id] must reference a known chain; otherwise [Not Known]. Optional query parameters (sequence-number range, time range, [Event Type] filter) must be well-formed: ranges must have start ≤ end; [Event Type] values must be from `{originated, received, transferred, transformed, disclosed, archived}`. An ill-formed parameter returns [Invalid Query]. A well-formed query matching no entries returns an empty sequence, not a rejection.

**Rejection priority.** When multiple precondition violations exist on the same call, the rejection returned follows a defined priority — cheapest and most-structural checks first, persistence last. For [Originate]: [Invalid Ref] / [Invalid Genesis Type] → [Storage Failure]. For [Transfer]: [Not Known] → `archived` → [Invalid Ref] → [Storage Failure]. For [Transform]: [Not Known] → `archived` → [Not Current Custodian] → [Invalid Ref] → [Invalid Descriptor] → [Storage Failure]. For [Disclose]: [Not Known] → `archived` → [Not Current Custodian] → [Invalid Ref] → [Storage Failure]. For [Archive]: [Not Known] → [Already Archived] → [Not Current Custodian] → [Storage Failure]. For [Read]: [Not Known] → [Invalid Query]. A caller fixing one rejection class may receive a different rejection on retry; this is expected and not a regression.

### Behavior

- **Entries are durable on success.** Once the caller receives an [Entry Id] (or a [Chain Id] from [Originate]), the entry is in the chain and will appear in subsequent reads.
- **The chain is append-only.** Entries accumulate; no entry is removed or altered after it is written. Chain state ([Open]/[Archived]) changes; entry fields never do.
- **Custody is continuous.** At every point from genesis to archive, [Current Custodian] is set, non-null, and names exactly one custodian. It is impossible for the chain to be in a state where custody is held by nobody or by two parties simultaneously. There is no action that sets [Current Custodian] to null, no action that accepts custody transfers without immediately designating a new holder, and no action other than [Transfer] that changes [Current Custodian].
- **Transfers are hand-to-hand.** The [Transfer] action reads [From Custodian Ref] from chain state; the caller supplies only [To Custodian Ref]. This structural choice is load-bearing: it makes it impossible for a `transferred` entry to record a false [From Custodian Ref], because the chain's own state is the authoritative source of who the outgoing custodian is. A caller who is not the current custodian cannot manufacture a transfer from a prior holder; they can only call [Transfer] which will correctly attribute the outgoing side to whoever [Current Custodian] names at that moment.
- **Only the current custodian can transform, disclose, or archive.** The [Not Current Custodian] guard on [Transform], [Disclose], and [Archive] enforces that only the named holder of record can record actions that implicate the artifact while under their custody. A prior custodian who transferred the artifact away has no further write authority over this chain.
- **Archived is terminal and absorbing.** Once the chain enters [Archived], no action will append to it. The chain remains readable indefinitely; it simply accepts no new entries.
- **Wall-time is best-effort.** [Recorded At] is the wall-time reading injected at the seam when the entry is written. Under an unreliable or adversarial clock, [Recorded At] may not be monotonic; [Sequence Number] is the authoritative order source. Callers and auditors must use [Sequence Number] for ordering, not [Recorded At].
- **Medium-agnostic.** [Artifact Ref] is opaque. The chain is structurally identical whether it tracks a physical pharmaceutical vial, a digital file, a legal document, or a forensic specimen. The host system decides what the reference means; the atom enforces custody continuity regardless.
- **Reads do not modify state.** [Read] is a pure query. It returns entries in [Sequence Number] ascending order and leaves the chain unchanged.

### Feedback

- After [Originate] — a new chain is [Open] in the chain store, with a genesis entry at `sequence_number = 1`. [Current Custodian] is set to the genesis custodian. [Chain Id] is returned. Chain count and total entry count each increase.
- After [Transfer] — a new `transferred` entry exists in the chain. [Current Custodian] is updated to [To Custodian Ref]. [Sequence Number] of the new entry is strictly greater than the previous entry's. [Entry Id] is returned.
- After [Transform] — a new `transformed` entry exists in the chain. [Current Custodian] is unchanged. [Entry Id] is returned.
- After [Disclose] — a new `disclosed` entry exists in the chain. [Current Custodian] is unchanged. [Entry Id] is returned.
- After [Archive] — a new `archived` entry exists in the chain. The chain transitions to [Archived]. [Current Custodian] holds the archiving custodian and does not change further. [Entry Id] is returned. No further entries are accepted.
- After a rejected action — an observable refusal with a named reason. No chain state or entry state changes.

Each observable action produces a countable effect: entry count increases; [Current Custodian] changes only on [Transfer]; chain state changes only on [Archive].

### Invariants

The following invariants (conditions that must always hold, regardless of what sequence of actions has occurred) constitute the verification surface of the pattern:

**Invariant 1 — Entry immutability.** Once an entry is recorded in the chain, its [Entry Id], [Sequence Number], [Event Type], [Custodian Ref] (or [From Custodian Ref]/[To Custodian Ref] for transfers), [Recorded At], and all event-type-specific fields never change.

**Invariant 2 — Append-only chain.** No entry is ever removed from the chain and no entry is reordered. The entry set for any chain is monotonically non-decreasing for the lifetime of the chain. The atom provides no deletion or reorder surface.

**Invariant 3 — Single origin.** Every chain has exactly one genesis entry ([Event Type] `originated` or `received`), and it occupies `sequence_number = 1` — the minimum in the chain. No re-origination is possible; [Originate] is only available for a new chain. Every non-genesis entry has a predecessor (a prior entry with a strictly smaller [Sequence Number]).

**Invariant 4 — Custody continuity (no gap).** This is the load-bearing invariant. At every point from genesis until archive:
- The chain has exactly one current custodian ([Current Custodian] is non-null and non-empty).
- Every [Transform], [Disclose], and [Archive] entry is attributed to the then-current custodian — i.e., the [Custodian Ref] on such an entry equals the [Current Custodian] that was in effect when the entry was written.
- Every `transferred` entry records [From Custodian Ref] equal to the [Current Custodian] immediately prior to that entry, and [To Custodian Ref] becomes the new [Current Custodian] immediately after that entry.
- There is no state reachable from any sequence of valid actions in which custody is held by nobody or by two parties simultaneously.

Event Log (see [`atoms/event-log.md`](./event-log.md)) cannot express this invariant. Event Log is a content-agnostic stream with no subject and no custodian; it permits sequence gaps by design. Invariant 4 is what makes Provenance a distinct freestanding concept rather than a configured Event Log.

**Invariant 5 — Total order within chain.** For any two distinct entries `e1` and `e2` in the same chain, exactly one of `e1.sequence_number < e2.sequence_number` or `e1.sequence_number > e2.sequence_number` holds. [Sequence Number] is the authoritative order source; [Recorded At] is best-effort only and may not be monotonic under unreliable clocks.

**Invariant 6 — Archived is terminal and absorbing.** Once a chain enters [Archived], no entry is accepted. The [Archive], [Transfer], [Transform], and [Disclose] actions all reject against an [Archived] chain. The chain is readable; it simply admits no new entries. The [Archived] state is permanent: no action transitions the chain out of [Archived].

**Invariant 7 — Custodian presence.** Every entry carries at least one non-empty, non-whitespace [Custodian Ref]. For `transferred` entries, both [From Custodian Ref] and [To Custodian Ref] are non-empty. For all other entry types, the single [Custodian Ref] is non-empty. There is no entry with an anonymous or unattributed custodian.

**Invariant 8 — Event type validity.** Every entry's [Event Type] is exactly one of `{originated, received, transferred, transformed, disclosed, archived}`. Every genesis entry's [Event Type] is `originated` or `received`, and no non-genesis entry carries [Event Type] `originated` or `received`. The final entry of an [Archived] chain has [Event Type] = `archived`. The [Genesis Type] argument to [Originate] is exactly one of `{originated, received}` and determines the genesis entry's [Event Type]; it is not stored as a field distinct from [Event Type].

**Invariant 9 — No id reuse.** No two entries in the same chain share an [Entry Id]. No two chains in the same store share a [Chain Id]. Once assigned, these identifiers are permanent and stable.

**Invariant 10 — Chain and store durability.** Chain records and entry records are never deleted from the store. The total chain count is monotonically non-decreasing; the total entry count is monotonically non-decreasing. The [Next Sequence Number] counter is part of the chain's persistent state and must survive restarts; a volatile implementation that resets the counter on restart violates Invariant 5 across the lifetime of the chain. A [Storage Failure] rejection guarantees no partial record is observable: the action either makes all its required writes durable (including [Current Custodian] updates for [Transfer] and chain-state updates for [Archive]) or has no observable effect on the chain.

---

## Examples

### Pharmaceutical — drug sample chain of custody

A pharmaceutical manufacturer originates a batch: `originate(artifact_ref: "batch-x91", custodian_ref: "manuf-lab-7", genesis_type: originated)` → `chain_id: "chain-0041"`. The manufacturer ships to a regional distributor: `transfer(chain_id: "chain-0041", to_custodian_ref: "dist-region-3")` → `entry_id: "e2"`. The entry records `from_custodian_ref: "manuf-lab-7"` (read from chain state) and `to_custodian_ref: "dist-region-3"`. The distributor stores, then ships to a hospital pharmacy: `transfer("chain-0041", "pharm-hosp-9")` → `entry_id: "e3"`. The pharmacist dispenses to the dispensing cart: `transform("chain-0041", "pharm-hosp-9", "dispensed 10mg dose into dispensing unit D44")` → `entry_id: "e4"`. The pharmacist archives the chain after the dose is administered: `archive("chain-0041", "pharm-hosp-9")` → `entry_id: "e5"`. Chain is now Archived.

A regulator asks: *"Prove unbroken custody of batch-x91 from manufacture to dispensing."* `read("chain-0041")` → five entries in [Sequence Number] order. The [From Custodian Ref] fields on every `transferred` entry equal the [To Custodian Ref] of the immediately preceding entry (or the genesis [Custodian Ref] for the first transfer). Invariant 4 provides the structural answer.

### Legal evidence — physical exhibit

A detective collects a physical exhibit at the crime scene: `originate(artifact_ref: "exhibit-A", custodian_ref: "det-r.james", genesis_type: originated)` → `chain_id: "chain-0107"`. The detective delivers the exhibit to the evidence room: `transfer("chain-0107", "evid-room-pd")` → `entry_id: "e2"`. The evidence room sends to the forensic lab: `transfer("chain-0107", "forensic-lab-12")` → `entry_id: "e3"`. The lab documents the analysis: `transform("chain-0107", "forensic-lab-12", "fingerprint-lifted; DNA-sample-taken; original-exhibit-intact")` → `entry_id: "e4"`. The exhibit is transferred back to the evidence room: `transfer("chain-0107", "evid-room-pd")` → `entry_id: "e5"`. The chain remains Open pending trial.

At trial, defense counsel challenges: *"Can you prove the exhibit was not tampered with between the detective and the lab?"* `read("chain-0107")` → five entries. Every `transferred` entry's [From Custodian Ref] matches the prior holder; the `transformed` entry is attributed to `forensic-lab-12`, who held it at that time (Invariant 4). Defense counsel's claim — that someone outside the chain handled the exhibit — has no structural basis in the records.

### Rejection paths

**Attempt to transform when not current custodian.** After the pharmaceutical transfer above, the original manufacturer attempts to record a transformation: `transform(chain_id: "chain-0041", custodian_ref: "manuf-lab-7", transformation_descriptor: "added label update")` → `rejected(not-current-custodian)`. [Current Custodian] is `pharm-hosp-9`; `manuf-lab-7` no longer holds the artifact. No entry is written.

**Attempt to append to an Archived chain.** After the pharmaceutical chain is archived, a downstream system attempts another transfer: `transfer(chain_id: "chain-0041", to_custodian_ref: "disposal-unit-1")` → `rejected(archived)`. No entry is written; the chain remains in its terminal state.

**Attempt to originate with an empty [Custodian Ref].** A host system calls `originate(artifact_ref: "sample-99", custodian_ref: "", genesis_type: originated)` → `rejected(invalid-ref)`. No chain is created; no [Chain Id] is returned.

**Attempt to read a non-existent chain.** A query arrives for a `chain_id` that was never issued: `read("chain-9999")` → `rejected(not-known)`. The atom has no chain under that id.

---

## Regulated adversarial scenarios

Three scenarios the atom must survive in regulated contexts:

### Regulator audit — prove unbroken custody of pharmaceutical sample

A pharmaceutical regulator (FDA — US Food and Drug Administration — the federal agency regulating drugs and medical devices) audits an inspected facility and asks: *"Produce the complete chain of custody for sample batch-x91, and prove that custody was unbroken from manufacture to dispensing under 21 CFR (Code of Federal Regulations — the codification of US federal agency rules) Part 211."* The auditor calls `read("chain-0041")` and receives the complete ordered entry sequence. The auditor verifies: (a) exactly one genesis entry at `sequence_number = 1`; (b) for every `transferred` entry, [From Custodian Ref] equals the [To Custodian Ref] of the immediately preceding entry (or the genesis [Custodian Ref]); (c) every [Transform] and [Disclose] entry's [Custodian Ref] equals the [Current Custodian] in effect at that point in the sequence; (d) the final entry is `archived`. All four conditions hold by Invariant 4 (custody continuity). The auditor's answer comes from the records alone — not from the facility's assertion that custody was maintained.

### Disputed transaction — defense claims the artifact passed through an unrecorded handler

Defense counsel in a criminal trial claims that a piece of physical evidence was handled by an undocumented party between the forensic lab and the evidence room, and that the chain was therefore broken. The investigator provides the complete entry sequence from `read("chain-0107")`. For every `transferred` entry, [From Custodian Ref] equals the prior holder; no entry's [From Custodian Ref] names a party who was not the immediately prior [To Custodian Ref]. This structural rebuttal rests on two invariants working together: Invariant 4 (custody continuity — every transfer's [From Custodian Ref] is read from chain state and cannot be forged) and Invariant 7 (custodian presence — every entry names a non-empty custodian). Defense counsel cannot point to a gap in the sequence, because the chain's structure makes a gap impossible: if no entry records a transfer to a hypothetical intermediary, then no intermediary was ever the current custodian, and no intermediary could have recorded a transformation or generated a subsequent transfer.

### Breach or incident investigation — reconstruct who held the artifact during an anomaly window

An internal investigation suspects that a controlled substance was improperly handled between two dates. The investigator calls `read("chain-0041", {recorded_at_range: ["2026-03-01", "2026-03-15"]})` to retrieve entries within the anomaly window. The ordered sequence of entries, with [Sequence Number] as the authoritative order source, reveals: who held the artifact ([Current Custodian] derivable from each point), what transformations were recorded, and to whom disclosures were made. The investigator can determine whether any entry during the window carries an unexpected custodian, an unexplained transformation, or a disclosure to an unauthorized recipient. Invariant 5 (total order) guarantees the sequence can be replayed unambiguously; Invariant 4 (custody continuity) means the reconstructed custodian state at any point in the window is exactly determined by reading the preceding entries — there is no ambiguity about who held the artifact at any moment.

---

## Generation acceptance

A derived implementation of Provenance is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the chain store and its entries, can do all of the following without recourse to source code, runbooks, or developer narration:

1. **Verify every entry is custodian-attributed.** For every entry in every chain, confirm that at least one non-empty [Custodian Ref] is present (both [From Custodian Ref] and [To Custodian Ref] for `transferred` entries). An entry with an empty or absent custodian is a conformance failure (Invariant 7).

2. **Verify single-origin and genesis placement.** For every chain, confirm that exactly one entry has `sequence_number = 1` and `event_type ∈ {originated, received}`. No chain has two genesis entries; no genesis entry has a [Sequence Number] greater than 1. A chain with no genesis entry or with more than one genesis entry is a conformance failure (Invariant 3).

3. **Verify custody continuity.** Replay the entries in [Sequence Number] ascending order and maintain a running [Current Custodian] cursor. For every `transferred` entry, confirm that the recorded [From Custodian Ref] equals the cursor's current value before the entry; update the cursor to [To Custodian Ref]. For every [Transform], [Disclose], and [Archive] entry, confirm that the entry's [Custodian Ref] equals the cursor's current value at that point. A discrepancy at any entry is a conformance failure (Invariant 4).

4. **Verify chain order is reconstructable from [Sequence Number] alone.** Sort the entries for a chain by [Sequence Number] and confirm the result is a strictly increasing sequence with no gaps and no duplicates. The auditor does not rely on [Recorded At] for order. A non-strictly-increasing [Sequence Number] sequence is a conformance failure (Invariant 5).

5. **Verify archived chains accept no later entries.** For every chain in [Archived] state, confirm that no entry has a [Sequence Number] or [Recorded At] later than the `archived` entry. An entry in an [Archived] chain after its `archived` marker is a conformance failure (Invariant 6).

6. **Verify no entry mutated.** For a set of known [Entry Id]s (or [Chain Id]s) previously retrieved, re-query and confirm that all fields match the prior values exactly. A field that changes between reads is a conformance failure (Invariant 1).

This is the generator's contract: any code generated from this atom must produce chains and a read surface that pass all six checks. The bar is the regulator's question — *"can you prove unbroken custody of this artifact from origin to disposition, from the records alone?"* — answered structurally, not procedurally.

---

## Edge cases and explicit non-goals

- **Non-repudiable custodian identity.** The atom records [Custodian Ref] values as opaque references and enforces structural continuity — but it does not verify that the supplied [Custodian Ref] is a real, credentialed party or that the caller is who they claim to be. Non-repudiable identity attestation — a verifiable binding of a [Custodian Ref] to a real actor's credential — composes with [Actor Identity](./actor-identity.md). Without that composition, the chain records structural continuity; with it, the chain is also attributable in the non-repudiation sense.

- **Disclosure scope and authority.** Provenance's [Disclose] records only the custody-timeline fact that a disclosure occurred — which custodian disclosed, to which recipient, at which point in the chain. It does not record *what subset* of the artifact's data was disclosed or *under what authority*. That scope-and-authority record belongs to [Selective Disclosure](./selective-disclosure.md) — a durable, append-only record of what scope of data was shared, to whom, under what authority, and when. The two compose without overlap: Provenance places the disclosure on the artifact's custody timeline; Selective Disclosure records the disclosure's content and legal basis. Provenance deliberately does not duplicate the scope/authority surface, so the [Disclose] event carries only [Recipient Ref] and the custody-position fields — a deployment needing disclosure-scope accounting composes the two atoms.

- **Pre-genesis external custody (`received`).** When a chain opens with `received` genesis type, the artifact had a custody history outside this system before intake. The chain documents custody only from the genesis (intake) entry forward; it makes no claim about — and provides no record of — custody before genesis. Custody continuity (Invariant 4) is a guarantee *from genesis onward*, not an assertion that nothing happened to the artifact beforehand. Pre-intake provenance, where required, is a separate chain or an external record the host links via the genesis [Metadata].

- **Cryptographic tamper-evidence on the chain.** The atom guarantees immutability and continuity by specification; it does not prevent an adversary with write access to the underlying store from rewriting entries. Cryptographic hash chaining, Merkle tree commitment, or external timestamping belonging to [Tamper Evidence](./tamper-evidence.md). SEC Rule 17a-4 (requiring records to be preserved in a non-rewriteable, non-erasable format) is satisfied at the chain-store layer; Tamper Evidence provides the audit proof.

- **Retention and defensible disposal of the chain.** How long the chain must be kept and how it may be destroyed are governed by [Retention Window](./retention-window.md) and [Defensible Retention](../compositions/defensible-retention.md). The atom retains all chains and entries indefinitely from its own perspective; retention policy is the composing concept.

- **The full chain-of-custody surface.** The complete chain-of-custody guarantee — attribution (non-repudiable custodians via Actor Identity), structural continuity (this atom), tamper-evidence (Tamper Evidence), and retention (Retention Window / Defensible Retention) — is the [Chain of Custody composition](../compositions/chain-of-custody.md). Provenance is the core primitive Chain of Custody composes.

- **DAG-style derivation and artifact splitting.** W3C PROV's (Provenance Data Model — W3C's directed-acyclic-graph representation of provenance with `wasDerivedFrom`, `wasGeneratedBy`, and `used` relationships) `wasDerivedFrom` relationship — where one artifact is produced by transforming or combining others — is an explicit non-goal. This atom is a *linear* single-artifact chain; branching and convergence are out of scope. A pharmaceutical sample aliquoted into five sub-samples would require five new chains, each originating with `received` genesis type, each referencing its own [Artifact Ref]; the relationship between the parent chain and the child chains is a composing concept outside this atom. The linearity constraint is what makes custody continuity well-defined; a DAG model does not have a single [Current Custodian].

- **Multi-party simultaneous custody.** Dual-custody (where two parties must jointly hold the artifact), escrow, and similar shared-custody arrangements are out of scope. The atom's state machine has exactly one [Current Custodian] at all times. Composing patterns that require multi-party custody gates (e.g., dual-control access to a safe-deposit box) must model joint custody as a composition above this atom.

- **Physical vs. digital medium.** The atom is medium-agnostic; [Artifact Ref] is opaque. Whether the tracked entity is a physical vial, a digital file, a signed document, or a forensic sample belongs to the host system.

- **Concurrent transfer attempts.** Two callers simultaneously attempting to [Transfer] the same chain must be serialized by the underlying implementation. The first transfer wins; the second will observe a changed [Current Custodian] and should either succeed (if the new custodian is the intended recipient) or fail (if the race was unintentional). The atom does not provide a compare-and-swap surface for conditional transfer; host systems that need optimistic-concurrency transfer semantics must compose with a Transaction or Idempotent Reservation pattern.

- **Transfer `from` field supplied by caller.** The [Transfer] action deliberately does not accept a [From Custodian Ref] parameter. The outgoing custodian is always read from [Current Custodian] in chain state. A caller who supplies their own [From Custodian Ref] — perhaps to pre-validate a transfer before executing it — should read the chain's current state first. The structural constraint is load-bearing: allowing a caller-supplied [From Custodian Ref] would open the door to a false predecessor attack (recording a transfer as coming from a party who was not the current custodian). The hand-to-hand guarantee closes this attack surface structurally.

- **Atomic writes for transfer and archive.** The [Transfer] action requires two durable writes: the new entry and the [Current Custodian] update. The [Archive] action requires two durable writes: the `archived` entry and the chain-state update to [Archived]. A crash between writes leaves the store in an inconsistent state — an entry without a corresponding state update, or a state update without a corresponding entry. Resolving mid-transition crashes is out of scope for this atom; implementations must provide atomic transaction support across both writes, or a crash-recovery scan that detects and repairs dangling transitions on restart. Per the Decision points, a [Storage Failure] response from [Transfer] or [Archive] guarantees no partial write is observable; the chain remains in its prior state.

- **Clock semantics.** Wall-time is supplied as an input injected at the atom's single I/O seam: the host reads the clock and supplies the reading before the transition runs, and it is not threaded through the [Originate] / [Transfer] / [Transform] / [Disclose] / [Archive] signatures — so the core transition stays a pure function of its inputs and reads no clock of its own. [Recorded At] is stamped from that injected reading; it remains a best-effort annotation and is never the order source ([Sequence Number] is). Clock skew, timezone handling, daylight-saving transitions, and monotonicity are handled at the deployment layer. For use cases where custodial timestamps have legal force (chain-of-custody timestamps in court proceedings, pharmaceutical distribution records), the implementation must source time from a trustworthy clock; a Trusted Timestamping composition (per RFC 3161 — the Internet standard defining a trusted time-stamping protocol) provides the verifiable time anchor. The atom's ordering guarantees rest on [Sequence Number], not on [Recorded At]; no invariant is at risk from a bad clock.

- **`artifact_ref` validation.** The atom does not validate [Artifact Ref] against an external artifact registry; it only requires that the reference be non-empty. Whether a given [Artifact Ref] names a real, active artifact in the host system is the host system's responsibility.

- **Empty [Transformation Descriptor].** A [Transformation Descriptor] that consists solely of whitespace is treated as empty and returns [Invalid Descriptor] — a dedicated reason distinct from [Invalid Ref], because a descriptor is content, not a reference. An opaque transformation that cannot be described at all should be treated as a gap in the chain's description — not a valid transformation entry. Implementations must check for visible content before accepting.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Originate

The behavior that opens a new chain for an artifact: it writes the genesis entry (`sequence_number = 1`) with the selected [Genesis Type], records the [Artifact Ref], sets [Current Custodian] to the genesis [Custodian Ref], and returns a fresh [Chain Id]. Rejected for an empty reference ([Invalid Ref]), a bad [Genesis Type] ([Invalid Genesis Type]), or a failed write ([Storage Failure]).

Kind: Operation

#### Transfer

The behavior that records a hand-to-hand change of custody on an [Open] chain: it appends a `transferred` entry whose [From Custodian Ref] is read from [Current Custodian] (never caller-supplied) and whose [To Custodian Ref] is the new holder, then updates [Current Custodian]. Returns an [Entry Id].

Kind: Operation

#### Transform

The behavior by which the current custodian records a transformation of the artifact on an [Open] chain, appending a `transformed` entry that carries a [Transformation Descriptor]. [Current Custodian] is unchanged; guarded by [Not Current Custodian].

Kind: Operation

#### Disclose

The behavior by which the current custodian records that the artifact was disclosed to a [Recipient Ref] on an [Open] chain, appending a `disclosed` entry. Custody is not transferred; [Current Custodian] is unchanged. Records only the custody-timeline fact, not the disclosure's scope or authority (that is Selective Disclosure).

Kind: Operation

#### Archive

The behavior by which the current custodian brings an [Open] chain to terminal disposition, appending an `archived` entry and transitioning [Chain State] to [Archived]. Absorbing thereafter (Invariant 6).

Kind: Operation

#### Read

The read-only query returning a chain's entries in [Sequence Number] ascending order (optionally filtered). Never transitions. Rejected for an unknown chain ([Not Known]) or a malformed query ([Invalid Query]).

Kind: Operation

#### Chain Id

The opaque, immutable, system-generated identity of a chain — produced by [Originate], unique within a store, never reused (Invariant 9). It is the chain's identity; [Artifact Ref] is a property, not the identity.

Kind:     Field
Field of: the chain
Projects: chain_id

#### Artifact Ref

The opaque reference to *what* the chain tracks. Set at genesis, immutable; the atom neither validates nor interprets it. The same reference may recur across store instances for genuinely different artifacts.

Kind:     Field
Field of: the chain
Projects: artifact_ref

#### Chain State

The chain's lifecycle state — [Open] or [Archived]. Begins [Open] on [Originate]; transitions once to [Archived] on [Archive], then never again.

Kind:     Field
Field of: the chain
Projects: chain_state

#### Current Custodian

The opaque reference of the chain's single current holder — a derived projection (cache) of the entry chain: the [To Custodian Ref] of the latest `transferred` entry, or the genesis [Custodian Ref]. Non-null while the chain exists; changes only on [Transfer]. On any disagreement the replayed entry chain is authoritative.

Kind:     Field
Field of: the chain
Projects: current_custodian

#### Next Sequence Number

The chain's per-instance counter, beginning at 1 and incrementing by one per successful entry write. Part of persistent chain state; must survive restarts (Invariant 10).

Kind:     Field
Field of: the chain
Projects: next_sequence_number

#### Entry Id

The opaque, immutable, system-generated identity of a custody entry — assigned at append, unique within the chain, never reused (Invariants 1 and 9).

Kind:     Field
Field of: the entry
Projects: entry_id

#### Sequence Number

The strictly increasing integer assigned to an entry from [Next Sequence Number] at append. The authoritative, clock-independent order source within the chain (Invariant 5); [Recorded At] is not.

Kind:     Field
Field of: the entry
Projects: sequence_number

#### Event Type

The entry's kind — one of `originated`, `received`, `transferred`, `transformed`, `disclosed`, or `archived` (Invariant 8). Set at append, immutable. The [Genesis Type] argument selects the genesis entry's value.

Kind:     Field
Field of: the entry
Projects: event_type

#### Custodian Ref

The custodian who performed or is affected by an entry's event — non-empty (Invariant 7), immutable. For [Transform], [Disclose], and [Archive] it must equal [Current Custodian] (else [Not Current Custodian]).

Kind:     Field
Field of: the entry
Projects: custodian_ref

#### Recorded At

The best-effort wall-time an entry was appended, stamped from the wall-time reading injected at the atom's I/O seam — never read inside a transition and never a caller-supplied argument. An annotation only — never the order source ([Sequence Number] is).

Kind:     Field
Field of: the entry
Projects: recorded_at

#### From Custodian Ref

On a `transferred` entry, the outgoing custodian — read from [Current Custodian] at transition time, never caller-supplied (the hand-to-hand guarantee that forecloses a false predecessor). Non-empty (Invariant 7).

Kind:     Field
Field of: the entry
Projects: from_custodian_ref

#### To Custodian Ref

On a `transferred` entry, the incoming custodian supplied by the caller; it becomes the new [Current Custodian] after the entry. Non-empty (Invariant 7).

Kind:     Field
Field of: the entry
Projects: to_custodian_ref

#### Transformation Descriptor

On a `transformed` entry, the opaque, non-empty description of what was done. An empty or whitespace-only value is [Invalid Descriptor].

Kind:     Field
Field of: the entry
Projects: transformation_descriptor

#### Recipient Ref

On a `disclosed` entry, the opaque reference to the party a view or copy was disclosed to. Custody is not transferred.

Kind:     Field
Field of: the entry
Projects: recipient_ref

#### Metadata

Optional opaque data carried on a genesis (`originated`/`received`) entry — e.g., a link to pre-intake provenance for a `received` artifact.

Kind:     Field
Field of: the entry
Projects: metadata

#### Genesis Type

The [Originate] argument selecting the genesis entry's [Event Type] — exactly `originated` or `received` (else [Invalid Genesis Type]). Consumed at genesis; not stored as a field distinct from [Event Type].

Kind:         Parameter
Parameter of: Originate
Projects:     genesis_type

#### Open

The active state of a chain: entries may be appended and the chain has exactly one [Current Custodian]. The entry state of every chain at [Originate].

Kind:      Member
Member of: the chain state
Role:      Outcome

#### Archived

The terminal, absorbing state of a chain at final disposition (Invariant 6): [Transfer], [Transform], [Disclose], and [Archive] are all rejected, but the chain remains readable. Reached once, via [Archive].

Kind:      Member
Member of: the chain state
Role:      Outcome

#### Invalid Ref

The rejection an action returns when a required reference ([Artifact Ref], [Custodian Ref], [To Custodian Ref], or [Recipient Ref]) is empty or whitespace-only.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  invalid-ref

#### Invalid Genesis Type

The rejection [Originate] returns when [Genesis Type] is not exactly `originated` or `received`.

Kind:      Member
Member of: the Originate rejection
Role:      Outcome
Projects:  invalid-genesis-type

#### Storage Failure

The rejection any action returns when its store write fails after all preconditions pass; guarantees no partial record is observable (Invariant 10).

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Not Known

The rejection [Transfer], [Transform], [Disclose], [Archive], or [Read] returns when the [Chain Id] references no known chain.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Already Archived

The rejection [Archive] returns when the target chain is already [Archived]. (The same condition reaches [Transfer], [Transform], and [Disclose] as the `archived` rejection — kept a distinct token to avoid colliding with the [Archived] state.)

Kind:      Member
Member of: the Archive rejection
Role:      Outcome
Projects:  already-archived

#### Not Current Custodian

The rejection [Transform], [Disclose], or [Archive] returns when the supplied [Custodian Ref] is not the chain's [Current Custodian] — a prior holder has no write authority.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-current-custodian

#### Invalid Descriptor

The rejection [Transform] returns when the [Transformation Descriptor] is empty or whitespace-only — a content field, distinct from [Invalid Ref].

Kind:      Member
Member of: the Transform rejection
Role:      Outcome
Projects:  invalid-descriptor

#### Invalid Query

The rejection [Read] returns when a query parameter is malformed — e.g., a range with start greater than end, or an unknown [Event Type] filter value.

Kind:      Member
Member of: the Read rejection
Role:      Outcome
Projects:  invalid-query

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Originate]: #originate
[Transfer]: #transfer
[Transform]: #transform
[Disclose]: #disclose
[Archive]: #archive
[Read]: #read
[Chain Id]: #chain-id
[Artifact Ref]: #artifact-ref
[Chain State]: #chain-state
[Current Custodian]: #current-custodian
[Next Sequence Number]: #next-sequence-number
[Entry Id]: #entry-id
[Sequence Number]: #sequence-number
[Event Type]: #event-type
[Custodian Ref]: #custodian-ref
[Recorded At]: #recorded-at
[From Custodian Ref]: #from-custodian-ref
[To Custodian Ref]: #to-custodian-ref
[Transformation Descriptor]: #transformation-descriptor
[Recipient Ref]: #recipient-ref
[Metadata]: #metadata
[Genesis Type]: #genesis-type
[Open]: #open
[Archived]: #archived
[Invalid Ref]: #invalid-ref
[Invalid Genesis Type]: #invalid-genesis-type
[Storage Failure]: #storage-failure
[Not Known]: #not-known
[Already Archived]: #already-archived
[Not Current Custodian]: #not-current-custodian
[Invalid Descriptor]: #invalid-descriptor
[Invalid Query]: #invalid-query

---

## Composition notes

Provenance is freestanding and is the single-artifact custody primitive that several composing patterns build on:

- **[Chain of Custody](../compositions/chain-of-custody.md)** — the primary composition naming Provenance. Chain of Custody wires Provenance + [Actor Identity](./actor-identity.md) + [Tamper Evidence](./tamper-evidence.md) + [Retention Window](./retention-window.md) to produce the full attribution-verified, cryptographically-sealed, retention-governed chain-of-custody surface. Provenance is the structural core; the three compliance atoms supply the per-entry attribution attestation, the chain tamper seal, and the retention clock. This composition is the canonical implementation of pharmaceutical chain of custody (21 CFR Part 211 / DEA 21 CFR Part 1304), regulated evidence custody (Federal Rules of Evidence 901(b)(9)), and financial instrument custody records (SEC Rule 17a-4). Chain of Custody is `grounded` (2026-06-04); its grounding resolved the forthcoming-link formerly carried in this Composition notes section.

- **[Immutable Transaction Ledger](../compositions/immutable-transaction-ledger.md)** — `grounded` (2026-06-08). Provenance enriches Immutable Transaction Ledger for ledger entries that represent tracked artifacts; chain-of-custody guarantees on ledger entries compose naturally where the [Artifact Ref] references a financial instrument. Immutable Transaction Ledger names this enrichment in its *Single-artifact financial-instrument custody* edge case.

- **[Resolve a Person's Data Rights](../compositions/resolve-a-persons-data-rights.md)** — a composing peer (not a constituent): where artifacts carry personal data, Provenance's chain-of-custody record is a composing input for demonstrating lawful handling under GDPR (EU General Data Protection Regulation — Europe's data-privacy law) Article 5 data-minimization and Article 30 records-of-processing-activity requirements.

- **[Customer Onboarding](../compositions/customer-onboarding.md)** — chain-of-custody guarantees on identity-verification documents (passports, utility bills, biometric records) are a natural Provenance use case for Know Your Customer workflows; Provenance optionally enriches Customer Onboarding's record surface with document-custody chains.

- **[Actor Identity](./actor-identity.md)** — supplies non-repudiable attestation for [Custodian Ref] values. Without Actor Identity, the chain records structural continuity but not verifiable custodian identity; with it, each [Custodian Ref] has a binding proof.

- **[Tamper Evidence](./tamper-evidence.md)** — cryptographically seals the entry chain so any rewrite is detectable from the records alone.

- **[Retention Window](./retention-window.md)** — governs the minimum and maximum retention period for the chain under applicable regulatory obligations.

- **[Selective Disclosure](./selective-disclosure.md)** — records the scope and legal authority of each disclosure. Provenance's [Disclose] event marks *where on the custody timeline* a disclosure occurred and *to whom*; Selective Disclosure records *what scope* was shared and *under what authority*. The two compose for full disclosure accounting without either duplicating the other.

---

## Standards references

Provenance is an infrastructure primitive with regulatory anchoring across pharmaceutical, legal, and financial domains:

- **ISO 23081 (Information and documentation — Managing metadata for records)** — the International Organization for Standardization's standard on records-management metadata. Provenance is a required element in ISO 23081-compliant records; the atom's chain-of-custody entries map directly to the origin, transfer, and transformation metadata elements ISO 23081 specifies.

- **W3C PROV (Provenance Data Model — W3C's RDF-based standard for representing provenance)** — the atom models the linear single-artifact custody slice of PROV's entity/activity/agent framework. PROV expresses a DAG of provenance relationships; this atom is the linear spine of a single-entity PROV graph — the `wasGeneratedBy`, `used`, and `wasAttributedTo` relationships along a single entity's chain. The deliberate non-goal of `wasDerivedFrom` (DAG derivation) and artifact splitting (one entity split into several) are both out-of-scope relative to the full PROV model.

- **FDA 21 CFR Part 211 (Current Good Manufacturing Practice — Finished Pharmaceuticals)** — US pharmaceutical manufacturing regulations requiring a chain-of-custody record for drug substances and products from manufacture through distribution. The atom's genesis + transfer + transformation + archive lifecycle is the operational form of Part 211's custodial recording requirements.

- **DEA 21 CFR Part 1304 (Controlled Substance Inventory Records)** — US Drug Enforcement Administration (DEA) regulations requiring complete, accurate records of the disposition of controlled substances, including every change of custody. Invariant 4 (custody continuity) is the structural implementation of this requirement.

- **SEC Rule 17a-4 (Records to be preserved by certain exchange members, brokers, and dealers)** — US Securities and Exchange Commission rule requiring records to be preserved as originally created, in a non-rewriteable, non-erasable format. The atom's append-only, entry-immutable chain (Invariants 1 and 2) is the structural form of the preservation-as-originally-created requirement. Tamper Evidence composes to supply the WORM (write-once, read-many) store seal.

- **Federal Rules of Evidence 901(b)(9) (Authenticating or Identifying Evidence — Process or System)** — the US evidentiary rule for authenticating physical or electronic evidence via chain-of-custody records. The atom's custody-continuity invariant is the structural basis for authenticating evidence under 901(b)(9): a chain whose [From Custodian Ref] values match the prior [Current Custodian] at every transfer step produces the unbroken sequence courts require for authentication.

The cross-domain structural identity is the atom's core thesis: the pharmaceutical chain of custody, the legal evidence chain, the financial instrument custody record, and the DEA controlled-substance custody log are all instances of the same primitive — one artifact, one current custodian, append-only entries, custody never gaps. This atom is the core of the Chain of Custody composition, `grounded` 2026-06-04.

It inherits from:

- **Daniel Jackson, *The Essence of Software*** — the freestanding-atom posture; the discipline of composing identity attestation, tamper-evidence, and retention as separate concepts rather than absorbing them.
- **Eiffel's design-by-contract** — preconditions on every action, every rejection reason named.
- **Linear temporal logic** — custody continuity (Invariant 4) and archived-is-terminal (Invariant 6) expressed as temporal properties holding across every reachable state.

---

## Status

`partially resolved` — downgraded 2026-08-24 by a load-bearing touch (the Logic Confinement clock-injection fix, below) whose closing fresh-reader round (Final Critique 5, Opus, Happy-Torvalds-X2) returned **five foundational findings**; the atom holds at `partially resolved` until they are closed and a round returns with zero foundational. The clock fix itself cleared the round. Prior grounding: `grounded on Final Critique 4 — 2026-06-04` (formal layer complete 2026-06-04 — Alloy model [`provenance.als`](./provenance.als) + buggy twin verified in `tools/harness/`; see Lineage §Formal model). Sonnet-drafted against an Opus plan, then Opus-gated through Pass 1 (GRID structural), Pass 2 (EOS conceptual independence — the load-bearing boundary against Event Log, plus the `disclose`-vs-Selective-Disclosure boundary), Pass 3 (Linus adversarial), and a Final Critique round: two foundational findings and four refining findings, all closed in-pattern (see Lineage notes). Regulated-pattern conventions (Regulated adversarial scenarios; Generation acceptance) baked in from the first draft, inherited from the methodology directly per [`pressure-testing.md`](../pressure-testing.md) §Regulated-pattern conventions. The formal-layer vote was YES; the derived Alloy model (custody continuity / single-origin / archived-absorbing on a linear chain, mirroring `clinical-observation.als`) verifies green — twelve checks hold, five non-vacuity runs satisfiable — with a buggy twin the checker rejects on five checks, clearing the "model present" bar. The English cleared the 92%-good threshold (foundational findings at zero) and the formal layer is discharged, so the pattern is unqualified `grounded`. Under the unified methodology (3×3 baseline rounds with per-round Pass 1/2/3 numbering + Final Critique starting at Round 4), this pattern's Opus-led gating review (Pass 1/2/3 + Final Critique round) is retro-labeled Final Critique 4; the original round-naming in the Lineage notes below is preserved as historical record.

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes</h2>
</summary>

**EOS Pass-2 boundary — conceptual independence against Event Log.** The key conceptual-independence record for this atom: Provenance is NOT a configured or specialized Event Log. Event Log (see [`atoms/event-log.md`](./event-log.md)) is a content-agnostic stream with no subject, no custodian, no continuity guarantee, and an explicitly-permitted sequence gap (a `storage-failure` consumes a sequence number; the next successful append receives a strictly higher number). The load-bearing distinction: Provenance maintains a `current_custodian` in chain state, updated atomically with every `transfer` entry, and every `transform`, `disclose`, and `archive` action is guarded against the then-current custodian. This state and these guards are properties of a *subject-scoped* chain; they cannot be expressed as invariants of a content-agnostic stream. The `transfer` action's reading of `from_custodian_ref` from chain state (rather than accepting it as a caller-supplied argument) is the structural mechanism that makes custody continuity an invariant rather than a convention — a convention Event Log could encourage but not enforce. The EOS test: does this concern have its own state machine? Yes: Open → Archived, with `current_custodian` as a state variable that changes only on `transfer`. Does it recur across many domains? Yes: pharmaceuticals, legal evidence, financial instruments, controlled substances, digital files. Could the host concept be specified without this concern, with the concern composed in? No — custody continuity is definitional to Provenance, not an optional additive. Verdict: freestanding atom, not a wrapper around Event Log.

**Seven further concerns named as composing patterns from the first draft.** None absorbed in-pattern:
- Non-repudiable custodian identity → [Actor Identity](./actor-identity.md)
- Cryptographic tamper-evidence on the chain → [Tamper Evidence](./tamper-evidence.md)
- Retention and defensible disposal → [Retention Window](./retention-window.md) / [Defensible Retention](../compositions/defensible-retention.md)
- The full attribution+tamper+retention chain-of-custody surface → [Chain of Custody](../compositions/chain-of-custody.md) (`grounded` 2026-06-04)
- DAG-style derivation / artifact splitting → explicit non-goal (linear chain by design)
- Multi-party simultaneous custody → explicit non-goal (single current custodian by design)
- Trusted timestamping for custodial timestamps → Trusted Timestamping *(forthcoming)*

**Conventions inherited from prior work.** The *Regulated adversarial scenarios* and *Generation acceptance* sections are inherited from the methodology directly per [`pressure-testing.md`](../pressure-testing.md) §Regulated-pattern conventions and [`spec-format.md`](../spec-format.md) §Regulated overlay. Not re-derived from predecessor atoms.

**Formal-layer vote — 2026-06-04: YES (model pending).** Invariant 4 (custody continuity — every transfer's `from_custodian_ref` equals the prior `current_custodian`; every non-transfer action attributed to the then-current holder), Invariant 3 (single origin — exactly one genesis entry at `sequence_number = 1`), and Invariant 6 (archived-is-terminal — no entry accepted after the `archived` marker) are structural/relational claims on a chain with ordered entries and a tracked current-custodian cursor. These are Alloy-class properties: the load-bearing claims are relational (the `from_custodian_ref` of a transfer equals the `to_custodian_ref` of the prior transfer, or the genesis `custodian_ref`; the state after a sequence of entries has a uniquely determined `current_custodian`), and a linear-chain model with a custodian-cursor and hand-to-hand transfer semantics is well-matched to Alloy's bounded exhaustive search over structural states. The model mirrors `clinical-observation.als` (linear chain, successor/predecessor relation, linear-chain fact). Until the model is authored and verifies, the pattern is `draft` (does not yet carry `grounded (English) — formal layer pending` because the prose passes themselves are also pending). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote. *(Superseded 2026-06-04: the prose passes cleared and the Alloy model landed and verifies — see the two entries immediately below; this entry is preserved as the record of the vote as cast.)*

**Opus-led gating review — 2026-06-04 (Pass 1 GRID / Pass 2 EOS / Pass 3 Linus + Final Critique).** Sonnet drafted against the Opus plan; Opus gated. Two foundational findings and four refining findings, all closed in-pattern (compact format: *F-id — name — class → fix*):

- *F1 — `disclose` vs. Selective Disclosure boundary — foundational (Pass 2).* The draft's `disclose` event overlapped the existing [Selective Disclosure](./selective-disclosure.md) atom (which already owns "what scope disclosed, to whom, under what authority") with no boundary drawn — an EOS over-absorption risk. → Scoped Provenance's `disclose` to the custody-timeline fact only (custodian, recipient, sequence position); named Selective Disclosure as the composing pattern for disclosure scope/authority in Edge cases and Composition notes. Provenance records no scope/authority field.
- *F2 — `current_custodian` authoritative source — foundational (Pass 3).* The draft treated `current_custodian` as primary chain state while also calling it derivable, leaving the authoritative source ambiguous on disagreement (store corruption). → `current_custodian` is now stated as a derived projection (cache) of the entry chain; the entry chain is authoritative; on disagreement the replayed value governs and the discrepancy is a conformance failure (Generation acceptance check 3). Every invariant is stated over the entry chain, not the cache.
- *F3 — `genesis_type` redundancy — refining (Pass 3).* The draft carried a stored `genesis_type` entry field duplicating `event_type` for genesis entries. → Removed as a stored field; `genesis_type` is an `originate` argument only, selecting the genesis entry's `event_type`. State and Invariant 8 updated.
- *F4 — `invalid-ref` misused for `transformation_descriptor` — refining (Pass 3).* A whitespace `transformation_descriptor` returned `invalid-ref`, conflating a content field with a reference. → Added a dedicated `invalid-descriptor` rejection on `transform`; signature, decision point, rejection priority, and the edge case updated.
- *F5 — store-instance dimension undescribed — refining (Pass 1 GRID System node).* The draft did not describe the named-store-instance multiplicity (multiple chains per store; cross-store uniqueness a composing concern). → Added a *Store instances* paragraph to the Identity model, mirroring Event Log's discipline.
- *F6 — dangling composition links — refining (Pass 1 reference graph).* Composition notes linked Immutable Transaction Ledger and Resolve a Person's Data Rights as live links, but those files do not exist yet. → Demoted both to `*(forthcoming)*` (no live link); the Customer Onboarding and Defensible Retention links remain live (those files exist).

No EOS over-absorption survives: the load-bearing Event Log boundary holds (Invariant 4 is not expressible on a content-agnostic stream), and the `disclose`/Selective-Disclosure boundary (F1) — the one absorption risk — was extracted. Pass 1 GRID otherwise clean; all nine nodes resolved. The English clears the 92%-good threshold (foundational findings at zero); the Alloy formal model is the remaining grounding prerequisite per the YES vote.

**Formal model — 2026-06-04: Alloy authored and verified; pattern promoted to `grounded`.** Derived model [`provenance.als`](./provenance.als) + buggy twin [`provenance-buggy.als`](./provenance-buggy.als), checked via `tools/harness/check.mjs` (Alloy headless). *What it checks:* the custody chain modeled as a linear entry sequence with a per-entry `holder` (the current custodian in effect after the entry) and hand-to-hand transfer fields (`fromC`/`toC`). Twelve `check`s, all UNSAT: the linear backbone (Invariants 2/5 — at-most-one successor/predecessor, no branching, acyclic), single-origin typing (Invariant 3 — genesis iff genesis-type), the load-bearing **custody continuity** cluster (Invariant 4 — `A_Inv4_CustodyUnbroken`: incoming custody equals the predecessor's outgoing at every link; `A_Inv4_TransferHandToHand`: a transfer's `fromC` equals the prior holder — the false-predecessor attack surface; `A_Inv4_TransferSetsHolder`; `A_Inv4_OnlyHolderActs`: only the current holder may transform/disclose/archive; `A_Inv4_UniqueHolder`: custody is never held by nobody), archived-is-absorbing (Invariant 6), and custodian presence (Invariant 7). Five non-vacuity `run`s all SAT (single genesis, received genesis, transfer chain, the full Originated→Transferred→Transformed→Disclosed→Archived lifecycle, two independent chains). *Buggy twin:* drops the `CustodyContinuity` and `ArchivedTerminal` facts — re-introducing the custody-gap / false-predecessor hazard and the append-after-archive hazard. The checker rejects it: `A_Inv4_CustodyUnbroken`, `A_Inv4_TransferHandToHand`, `A_Inv4_TransferSetsHolder`, `A_Inv4_OnlyHolderActs`, and `A_Inv6_ArchivedTerminal` all find counterexamples, confirming those checks have teeth. *Scope/saturation:* scope 8 (mirrors `clinical-observation.als`); custody continuity is a local per-link relational property, insensitive to scope beyond a few entries — the longest chain in scope 8 is 8 entries, more than enough to exercise transfer→transfer→archive topologies. *Conflict-protocol outcome:* none — the model corroborates the English; canonical English unchanged. Reproduce: `cd tools/harness && node check.mjs ../../atoms/provenance.als` (and `… provenance-buggy.als --buggy`).

**Logic Confinement clock-injection touch + Final Critique 5 — 2026-08-24.** Load-bearing touch: the atom declared an *implicit clock*, inconsistent with [`execution-contract.md`](../execution-contract.md) §Logic Confinement rule 3 and with Retention Window's own Final Critique 5 treatment (2026-06-23). Changes: Inputs bullet rewritten to seam injection; a *Logic confinement (clock and id)* note added to Decision points; *Clock semantics* rewritten. **Caller signatures are UNCHANGED** (the seam, not a parameter, is the contract for clock entry), so the change is additive with no constituent-change cascade. Gates: linter 0 findings; the Alloy models `provenance.als` / `provenance-buggy.als` were untouched — the clock is out of model scope (the model checks the linear entry backbone, custody continuity and archived-absorption; no time sort appears), so the fix does not reopen the formal-layer vote.

*Final Critique 5 — closing fresh-reader round (Opus, Happy-Torvalds-X2, fresh-reader throughout; Lineage withheld from the reviewer until findings were formed). Verdict: **not clean — five foundational findings**; atom downgraded to `partially resolved` pending closure.* The clock work itself cleared the round. Findings recorded as surfaced, **open**:

- *P-F1 — Summary contradicts the Transfer guard — foundational →* Summary says a transfer can only be recorded by the current holder, but `transfer(chain_id, to_custodian_ref)` takes no `custodian_ref` and has no `not-current-custodian` rejection; the transitions table, Decision points, Behavior and the [Custodian Ref] card all agree Transfer is unguarded. Add the guard or strike the Summary claim and defend the asymmetry in-line.
- *P-F2 — authorization concept absent — foundational →* The atom names no owner for who may call an action, and the `not-current-custodian` check is equality on a caller-supplied label. Add a Permissions deferral edge case in the shape Capacity Constraint Enforcement carries.
- *P-F3 — sequence-counter atomicity omitted for three actions — foundational →* Joint atomicity is named only for [Transfer] and [Archive], but every append mutates [Next Sequence Number]; a lost counter update on [Originate]/[Transform]/[Disclose] reuses a sequence number and breaks Invariants 3, 5 and 9. Extend the joint-atomicity clause to every append, or derive the next sequence at write time.
- *P-F4 — sequence density is an unstated invariant — foundational →* Generation acceptance check 4 requires a strictly increasing sequence with no gaps and cites Invariant 5, which asserts only total order. State density as its own invariant or as a clause of 5.
- *P-F5 — [Custodian Ref] comparison semantics unspecified — foundational →* The load-bearing `[Custodian Ref] = [Current Custodian]` guard is equality on an opaque string with no trim/case/normalization policy, and Invariant 4 rests on the choice. Pin it explicitly (Message Preference's exact-equality-no-normalization wording is the in-corpus form).
- *Refining/rhetorical (open):* P-F6 unreachable `invalid-ref` on Transform; P-F7 Generation acceptance check 5 contradicts Invariant 5 on [Recorded At]; P-F8 Invariant 10 unconditional against a composed purge; P-F9 undefined acronyms (DAG, SEC, DEA); P-F10 identity model self-contradiction on artifact-to-chain cardinality; P-F11 `archived`/`already-archived` split undefended and one token uncarded; P-F12 [Read] has no failure surface; P-F13 rejection-path examples miss three reasons; P-F14 breach scenario leans on best-effort [Recorded At]; P-F15 SEC 17a-4 satisfaction overstated.

**Showcase pass — 2026-06-29.** Representational-only annotation/legibility pass; no guarantee, invariant, number, formula, signature, or rejection taxonomy changed. (a) **Four-kind `[Term]` annotation** applied across the body and a `## Terms` registry added before Composition notes (32 terms): 6 Operations ([Originate], [Transfer], [Transform], [Disclose], [Archive], [Read]); 0 Types (the chain and its entries are ambient plain-noun referents — "Field of: the chain" / "the entry" — mirroring notification's no-Type-card record); 15 Fields — 5 on the chain ([Chain Id], [Artifact Ref], [Chain State], [Current Custodian], [Next Sequence Number]) and 10 on the entry ([Entry Id], [Sequence Number], [Event Type], [Custodian Ref], [Recorded At], [From Custodian Ref], [To Custodian Ref], [Transformation Descriptor], [Recipient Ref], [Metadata]); 1 Parameter ([Genesis Type] — selects the genesis [Event Type], not stored under its own name); and 10 Members — the 2 chain states ([Open], [Archived]) plus 8 rejections ([Invalid Ref], [Invalid Genesis Type], [Storage Failure], [Not Known], [Already Archived], [Not Current Custodian], [Invalid Descriptor], [Invalid Query]). Survivors left backticked: the one labeled projected-contract signature per Operation; the `event_type` wire-enum values (`originated`/`received`/`transferred`/`transformed`/`disclosed`/`archived`); the `archived` rejection token (kept backticked to avoid colliding with the [Archived] state anchor — the medication-order `on-hold` precedent); the `e1.sequence_number` order predicate and the `sequence_number = 1` / `event_type ∈ {originated, received}` value literals; concrete example calls, ids, descriptors, and timestamps; and external standard tokens. The implicit clock stamps [Recorded At], but [Sequence Number] (not the clock) is the order source and no status is derived from the clock, so there is no `[Now]` term (mirrors legal-hold). (b) **Summary/blockquote merge** — `## Summary` moved to the top (after TOC, before Intent), the descriptive top blockquote folded out after confirming each claim is carried by Summary/Intent/Identity model/Invariant 4; no *also-known-as* line existed, so none was invented. (c) **Lineage collapsed** into a `<details markdown="block">` block. (d) **prose cut #1** — the single-paragraph Summary split into one-idea-per-sentence paragraphs, lossless. (e) **prose cut #5** — the State "Transitions" list rendered as a transition table (action / from / guard / appends / [Current Custodian] after / [Chain State] after / returns), with the fail-closed, hand-to-hand, joint-atomicity, and sequence-counter semantics kept in the prose beside it. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 4 — 2026-06-04`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (32 terms); 10 invariants preserved; `.als` untouched — harness re-run green: `provenance.als` PASS + `provenance-buggy.als --buggy` rejected.

</details>
