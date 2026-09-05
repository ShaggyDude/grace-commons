---
title: Message Preference
parent: Atomic Concepts
has_toc: true
toc: true
---

# Message Preference

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


## Summary

Message Preference records how each person wants their notifications shaped — which channels they prefer, how often at most, what quiet hours to respect, what format they want. It is strictly about the *envelope*, not about whether the person wants the information (a separate concept) or whether the system is even allowed to contact them (another separate concept); it answers only "given that we are going to deliver, how should it look?" It keeps one currently-in-effect record per person, supports updating preferences (the new record replaces the old, and the old is kept as history), pausing delivery without losing the chosen settings (so resuming is a single fresh `set` call replaying the suspended record's untouched values — there is deliberately no separate resume action; the replay is re-validated against the channel set declared at that later moment, so a channel removed in the meantime must be dropped from it), and deleting them outright. Nothing is erased through the atom's own surface — a composed retention pattern may lawfully dispose on its own declared schedule — so the full history of how someone's preferences changed over time stays queryable. At the moment a notification is being prepared, a delivery system asks for the person's current preferences and shapes the delivery to match. The pattern stores preference values without interpreting them — what "quiet hours" or a frequency cap actually mean is left to the delivery system — and it underlies notification-settings pages, opt-out and frequency compliance, and the audit trail of preference changes.

---

## Intent

Every system that pushes information to people accumulates two kinds of question over time. The first is *should this person receive this class of information at all?* — a topic-subscription question, and separately, a legal-permission question. The second is the question this atom answers: *given that the first kind has resolved in favor of delivery, how should the delivery be shaped?* A principal may want email but not SMS. They may want at most five notifications a day. They may want silence between 10pm and 7am. They may want plain text rather than rich HTML. None of these is a question about whether to deliver; all are questions about how.

Message Preference records the answers. The atom owns the per-principal record of delivery-shaping values — channels, frequency limits, quiet hours, format — and the lifecycle of that record from creation through suspension or deletion. The composing fanout pattern reads the record at the moment a notification is queued and shapes the delivery accordingly. The atom does not deliver, does not consult subscriptions, and does not evaluate legal permission. Nor does it interpret the meaning of any preference value — it enforces only structural constraints: the at-most-one-currently-in-effect-per-principal rule, the channel-must-be-declared rule, and immutability of recorded values.

The atom's three semantic states are distinct because each answers a different operational question. **Active**: *the principal has stated delivery preferences and delivery should proceed under them*. **Suspended**: *the principal has paused delivery without modifying their preferences; subsequent fanout calls observe the suspension and suppress delivery*. **Deleted**: *the principal's preference record is no longer in effect — either because it was superseded by a new `set` call (the principal updated their preferences) or because the principal explicitly deleted it*. Suspended is a first-class state distinct from "Active with empty channel preferences" — suspending a record does not modify any preference value, so a later resumption (via a fresh `set` call carrying the prior values) does not require the principal to re-enter their choices. Deleted is the terminal state; once a record is Deleted, no transition restores it; the principal who wants their preferences back creates a new record.

Updates are not retroactive in the operational sense the atom commits to: a new `set` call produces a new record, the prior record transitions to Deleted, and the prior record's preference values are unchanged. A composing fanout pattern that captured a prior record's values at the moment a notification was queued continues to deliver that notification under the captured values — the atom does not push updates into already-queued work and does not modify any caller's captured copy of a prior record's values. The atom records sufficient timestamps (`set_at` on creation, `deleted_at` on supersession) for any composing pattern to determine which record was currently in effect at any past moment.

This is a freestanding concept in the EOS (Essence of Software — Daniel Jackson's framework for specifying software concepts as freestanding, composable units) sense. It has its own state (the preference record set), its own actions (`set`, `suspend`, `delete`, `current_for`, `read`), and its own operational principles (one currently-in-effect record per principal; immutability of preference values; supersession on update; suspension preserves values; terminal Deleted; no record is ever removed from the store). It does not implement notification routing, subscription evaluation, legal-permission evaluation, delivery transport, or interpretation of preference values' semantics. Each is a separate composable pattern; see Composition notes.

---

## Structure

### Store instance model

The Message Preference atom operates against a named store instance. A [Store Name] identifies the instance; multiple instances coexist in real systems — one per product line, jurisdiction, or principal namespace. [Preference Id] values are unique within an instance; uniqueness across instances is a composing concept. [Principal Ref] uniqueness is enforced within the instance for the at-most-one-currently-in-effect rule; a principal known to two different instances is two distinct principals at the atom level. Calls implicitly target a single routed instance; instance selection is handled at the deployment-routing layer.

Each instance carries a **declared channel set** — the named delivery surfaces that records in this instance may reference (e.g., `["email", "sms", "push", "in-app"]`). **The set is host configuration consumed at the seam, not state this atom persists** — the same move Retention Window makes for policy resolution: the deployment holds the channel-set declaration on its own configuration surface, and at each [Set] invocation the host resolves it and injects the **declared channel set in force** at the atom's single I/O seam, alongside the clock reading and the id (Logic confinement). The transition validates every [Channel Preferences] key against the injected set and **stamps the set it validated against onto the new record as [Declared Channels]** — so every preference record carries its own validation context, immutable from birth. **The injection carries a hard host obligation:** the injected declared channel set must be non-empty and well-formed — distinct channel names, each a non-empty, non-whitespace string. Invariants 5 and 10 are conditioned on this obligation (they quantify over the [Declared Channels] stamp, which is only meaningful when the injection honors it). A [Set] invocation arriving with a degenerate injected set — empty, or malformed — is a deployment configuration fault, and the transition is **fail-stop**: it does not proceed to validation (every supplied key would be undeclared by construction, which would misreport a host fault as a caller error), yields no conforming outcome from the caller vocabulary, writes nothing, and surfaces at the deployment's alerting. Two consequences are the point. First, the audit surface is **self-contained per record**: an auditor confirms any record's keys against that record's own [Declared Channels] — one record, no cross-record join, no second record class in the store, and no external configuration artifact (Invariants 5 and 10; Generation acceptance check 5). Second, the atom absorbs no registry: what channel names are valid, who may change the declared set, when it changed, and the who/when audit of those changes all live with the deployment's configuration surface — a deployment whose regulator audits channel-set governance wraps *that* surface with Audit Trail or Actor Identity; this atom's records prove only, and exactly, what each record was validated against. A channel-set change is therefore visible in this store only forward: records created after the change carry the new [Declared Channels]; historical records keep the set that was in force at their own creation, which is what keeps them verifiable forever (a removed channel appearing in an old record's keys is consistent with that record's own stamped set). The atom does not define what channel names are valid in the abstract, and there is no `declare_channels` action here.

### Identity model

Every preference record known to the system has a **[Preference Id]** — an opaque, immutable identifier host-allocated at the I/O seam (injected into the transition, not generated inside it) and produced by [Set]. The id is the record's identity; the principal reference and the preference values are immutable *properties* of the record, not its identity.

The opaque-id model follows the same discipline used across the library. Identifying a record by [Principal Ref] alone would collapse the principal's update history into a single mutable record, defeating the audit story — a principal who updates their preferences three times has three records, each with its own id, each independently queryable. Identifying by ([Principal Ref], [Set At]) would entangle identity with timestamps, which the at-most-one-currently-in-effect rule (Invariant 3) already polices on a different axis. Opaque ids preserve one-record-one-id discipline.

The atom uses *principal* rather than *recipient* or *subscriber* as the entity term because preferences are recorded against an identity — independent of whether the principal has yet been the target of any notification or has subscribed to any topic. A principal may hold a preference record without ever being subscribed to anything; a principal subscribed to many topics holds at most one currently-in-effect preference record across all of them.

Ids are not reused after a record reaches Deleted.

### Inputs

- A principal reference identifying *who* the preferences belong to. Opaque — the principal registry is a separate concept. The atom requires only that principal references support equality testing (so [Current For] can locate the currently-in-effect record and the at-most-one-currently-in-effect rule can be enforced); it does not parse, normalize, or otherwise interpret their contents. Equality is exact and the atom performs no normalization (no case-folding, whitespace trimming, or Unicode normalization). Because Invariant 3 (at most one currently-in-effect record per principal) depends on consistent equality, the deploying system is responsible for canonicalizing [Principal Ref] values before passing them — two references intended to denote the same principal must compare equal, or the atom will treat them as two distinct principals.
- A [Channel Preferences] value (optional): a map (or equivalent structure) from declared channel name to opaque per-channel preference value. The atom enforces that every key is a member of the declared channel set injected at the seam for that invocation (Store instance model); a violation is its own rejection, [Undeclared Channel]; the per-channel preference value is opaque and is stored unchanged. Whether `"preferred"`, `"backup"`, `"opt-out"`, a numeric priority, or a structured record is the right shape for the preference value is the deployment's vocabulary call.
- A [Frequency Limit] value (optional): an opaque, deployment-shaped value capturing the principal's frequency cap (e.g., `{per_day: 5}`, `{per_hour: 1, per_day: 10}`). The atom does not interpret the shape; the composing fanout pattern does.
- A [Quiet Hours] value (optional): an opaque, deployment-shaped value capturing the windows during which delivery should be suppressed (e.g., `{start: "22:00", end: "07:00", timezone: "America/Los_Angeles"}`). The atom does not interpret the shape.
- A [Format] value (optional): an opaque, deployment-shaped value capturing format preferences (e.g., `"html"` vs `"plain"`, density, locale). The atom does not interpret the shape.
- A [Metadata] value (optional): an opaque payload the atom stores unchanged. Carries deployment-specific context (the form version through which preferences were collected, the user-agent string, the consent-flow identifier). The atom does not parse or validate it. Unlike the four preference fields, [Metadata] does not by itself satisfy the at-least-one-preference-field requirement on [Set]: a [Set] carrying only [Metadata] and no [Channel Preferences], [Frequency Limit], [Quiet Hours], or [Format] is rejected as [Invalid Request].
- *Opaque-input bounds.* All opaque inputs — [Principal Ref], per-channel preference values, [Frequency Limit], [Quiet Hours], [Format], and [Metadata] — are stored as-supplied; the atom enforces no length cap on any of them. The deploying system is responsible for bounding their size to match whatever the underlying store, transport, and equality-check implementations can handle efficiently. The cap (or the choice to leave size unbounded and accept the operational consequences) is deployment policy, disclosed alongside the fanout-on-no-record and clock-tolerance disclosures.
- Actions:
  - [Set] — (Projected contract: `set(principal_ref, channel_preferences?, frequency_limit?, quiet_hours?, format?, metadata?) → preference_id | rejected(invalid-request | undeclared-channel | storage-failure)`)
  - [Suspend] — (Projected contract: `suspend(preference_id) → ok | rejected(not-known | not-active | storage-failure)`)
  - [Delete] — (Projected contract: `delete(preference_id) → ok | rejected(not-known | already-deleted | storage-failure)`)
  - [Current For] — (Projected contract: `current_for(principal_ref) → preference_record | none`)
  - [Read] — (Projected contract: `read(preference_id) → preference_record | not-known`)
- A clock providing wall-time timestamps and an id source for [Preference Id] allocation, both injected at the atom's single I/O seam. Per the Logic Confinement Principle (see [`execution-contract.md`](../execution-contract.md)), the host reads the clock and allocates the [Preference Id] at the seam before the transition runs; the pure transition *receives* the reading (`now`) and the id as injected inputs — it reads no clock and mints no id internally. Neither is supplied by the business caller, which keeps the transition deterministic. The clock enters at that single seam (the execution contract injects `clock_t` there, so the seam is not a signature parameter, and none of the projected contracts above carries a `now` argument); the reading is consumed for exactly one purpose — stamping the immutable write timestamps [Set At], [Suspended At], and [Deleted At] at the moment of the write. No guard consults it. This is both logic-confinement-conformant (no internal clock read in the core) and audit-sound: it forecloses caller-supplied timestamp lying and binds the audit story (the Temporal property — Timestamp ordering — and the clock-tolerance disclosure) to a single clock the deployment can characterize.

### Outputs

- The current set of preference records ([Active], [Suspended], and [Deleted]).
- For each record: [Preference Id], [Principal Ref], [Channel Preferences] (if supplied), [Frequency Limit] (if supplied), [Quiet Hours] (if supplied), [Format] (if supplied), [Metadata] (if supplied), [Set At], [Status], and the applicable lifecycle timestamps ([Suspended At] if the record has ever been [Suspended]; [Deleted At] if [Deleted]).
- [Set] returns the new [Preference Id] on success, or a rejection naming the failed precondition.
- [Suspend] and [Delete] return `ok` on success, or a rejection naming the failed precondition.
- [Current For] returns one of two first-class outcomes: the full preference record (all stored fields for the principal's currently-in-effect record), or `none` if no [Active] or [Suspended] record exists for the principal. Both are answers to the query, not success-failure pairs.
- [Read] returns one of two first-class outcomes: the full preference record for the queried id, or [Not Known] if no record with that id exists. A [Deleted] record is returned in full by [Read]; deletion is a state, not a removal.

### State

A preference record occupies one of three named states:

- **[Active]** — the principal's preferences are in force; the record's values shape any delivery the composing fanout pattern attempts. There is at most one [Active] or [Suspended] record per principal at any time (Invariant 3).
- **[Suspended]** — the principal has paused delivery; the record's preference values are retained unchanged, but a composing fanout pattern observing the [Suspended] state suppresses delivery. There is at most one [Active] or [Suspended] record per principal at any time.
- **[Deleted]** — the record is no longer in effect. Terminal. A record reaches [Deleted] by being superseded (a new [Set] call for the same principal) or by explicit deletion. [Deleted] records are retained in the store as audit evidence; they are returned by `read(preference_id)` but excluded from `current_for(principal_ref)`.

Each record carries:

- **[Preference Id]** — opaque, immutable, host-allocated at the I/O seam (injected into the transition, not generated inside it). Set on [Set]. Never changes.
- **[Principal Ref]** — opaque reference to the principal whose preferences are recorded. Set on [Set]. Never changes.
- **[Channel Preferences]** — map from declared channel name to opaque per-channel preference value. Set on [Set] if supplied. Never changes; absence is also immutable.
- **[Frequency Limit]** — opaque value if supplied. Set on [Set]. Never changes; absence is also immutable.
- **[Quiet Hours]** — opaque value if supplied. Set on [Set]. Never changes; absence is also immutable.
- **[Format]** — opaque value if supplied. Set on [Set]. Never changes; absence is also immutable.
- **[Metadata]** — opaque value if supplied. Set on [Set]. Never changes; absence is also immutable.
- **[Declared Channels]** — the declared channel set injected at the seam for this record's [Set] invocation, stamped at creation (Store instance model). Non-empty. Never changes. The record's own validation context (Invariants 5 and 10).
- **[Set At]** — wall-time when the record was created. Set on [Set]. Never changes.
- **[Status]** — `active`, `suspended`, or `deleted`. Set to `active` on [Set]; transitions per the rules below.
- **[Suspended At]** — wall-time when the record was suspended. Absent on records that have never been [Suspended]; set on the transition to [Suspended]; never changes after set. If a record went [Active] → [Suspended] → [Deleted], [Suspended At] is present and [Deleted At] is also present.
- **[Deleted At]** — wall-time when the record reached [Deleted]. Absent unless status is `deleted`; set on the transition to [Deleted]; never changes after set.

Transitions — the two queries below the rule cause no transition:

| action | from | to | stamps | result | rejections |
|--------|------|----|--------|--------|-----------|
| [Set] | none, or a currently-in-effect prior ([Active]/[Suspended]) | new record **[Active]**; any prior → **[Deleted]** | [Set At] on the new record; [Deleted At] on the prior | the new [Preference Id] | [Invalid Request]; [Undeclared Channel]; [Storage Failure] (per Decision points) |
| `suspend(preference_id)` | [Active] | **[Suspended]** | [Suspended At] | `ok` | [Not Known]; [Not Active] (record is [Suspended] or [Deleted]); [Storage Failure] |
| `delete(preference_id)` | [Active] or [Suspended] | **[Deleted]** | [Deleted At] | `ok` | [Not Known]; [Already Deleted]; [Storage Failure] |
| `current_for(principal_ref)` | read-only | — | — | the currently-in-effect record, or `none` | — |
| `read(preference_id)` | read-only | — | — | the full record in any state, or [Not Known] | — |

Three semantics the cells cannot hold:

- *Supersession is atomic.* When [Set] finds a currently-in-effect prior, the prior's transition to [Deleted] ([Deleted At] = `now`) and the new record's creation ([Set At] = `now`) are one operation — no observer ever sees the principal with two currently-in-effect records (Invariant 4).
- *Rejections leave state untouched.* A rejected [Suspend] or [Delete] changes nothing. ([Not Active] covers both [Suspended] and [Deleted] on [Suspend], since a [Suspended] record never returns to [Active] — Invariant 2; a caller needing to tell them apart calls [Read].)
- *Queries never transition.* [Current For] returns the one record with [Status] ∈ {`active`, `suspended`} — unique by Invariant 3 — and excludes [Deleted]; [Read] returns any record in full, [Deleted] included, because deletion is a state, not a removal.

### Flow

1. **A principal expresses preferences; the composing layer creates a record.** A preferences UI (web settings page, mobile app, API) collects the principal's choices and calls `set(principal_ref, channel_preferences, ...)`. The atom records the preference set in [Active] and returns the id. If a prior record was currently-in-effect, it transitions to [Deleted] atomically with the new record's creation.
2. **The composing fanout pattern reads the record at delivery time.** When a notification is queued for `principal_ref`, the fanout pattern calls `current_for(principal_ref)`. The atom returns the currently-in-effect record ([Active] or [Suspended]) or `none`. The fanout pattern uses the returned record (or its absence) to shape — or suppress — the delivery.
3. **The principal updates, suspends, or deletes their preferences.** Exactly one of three transitions applies at the principal's next action:
   - 3a. The principal updates: `set(principal_ref, new_values)` → a new record is created in [Active]; the prior record transitions to [Deleted] (Invariant 4).
   - 3b. The principal pauses: `suspend(preference_id)` → the record moves [Active] → [Suspended]; subsequent [Current For] queries return the [Suspended] record, and the composing fanout pattern suppresses delivery.
   - 3c. The principal explicitly removes: `delete(preference_id)` → the record moves to [Deleted]; subsequent `current_for(principal_ref)` returns `none` (until a new [Set] is called).
4. **Audit and recovery queries.** An auditor, DSAR (Data Subject Access Request) processor, or compliance review queries `read(preference_id)` for any record ([Active], [Suspended], or [Deleted]) or `current_for(principal_ref)` for the principal's currently-in-effect record. [Deleted] records are returned by [Read] for the lifetime of the store.

### Decision points

**Logic confinement (clock and id).** The clock and the id are **injected inputs at the atom's single I/O seam**, never produced inside a transition and never passed as action parameters. The wall-time reading (`clock_t`) is taken once by the host and injected at the seam before the transition runs; the [Preference Id] is the injected `id_t`, host-allocated at the same seam. Because the clock is injected at the seam rather than threaded through the caller signatures, none of the five projected contracts carries a `now` argument. In this atom the reading is consumed for exactly one purpose — stamping the immutable write timestamps inside a committed transition: [Set At] on [Set] (and, in that same atomic supersession, [Deleted At] on the prior record), [Suspended At] on [Suspend], and [Deleted At] on [Delete]. **No guard reads it.** Every precondition below is a presence check on [Principal Ref] or [Preference Id], a declared-channel-set membership check, or a [Status] check — none is time-gated, so no rejection in this atom's taxonomy ([Invalid Request], [Undeclared Channel], [Not Known], [Not Active], [Already Deleted], [Storage Failure]) depends on the clock reading, and a skewed clock can only make a stored timestamp advisory (the Temporal property (Timestamp ordering)), never admit or refuse a call.

- **At `set(principal_ref, channel_preferences?, frequency_limit?, quiet_hours?, format?, metadata?)`** — [Principal Ref] must be non-empty — specifically, not null, undefined, or the empty string; otherwise [Invalid Request]. The atom does not parse or interpret the opaque value beyond this presence check. At least one of [Channel Preferences], [Frequency Limit], [Quiet Hours], or [Format] must be supplied — a [Set] call carrying no preference field has nothing to record and is rejected as [Invalid Request]. (The atom records the *absence* of preferences as the absence of a record, not as an empty record.) An empty [Channel Preferences] map (`{}`) does not satisfy this requirement: it carries no channel preference and is treated as not-supplied, so a [Set] whose only preference field is an empty [Channel Preferences] map is rejected as [Invalid Request]. A supplied-but-empty map is **stored as absent** where the call succeeds on the strength of other fields — the record never carries an empty [Channel Preferences] map; absence is the one stored form of no-channel-preferences, so readers branch on presence alone. If [Channel Preferences] is supplied, every channel name appearing as a key must be a member of the seam-injected declared channel set — itself required non-empty and well-formed by the injection host obligation (Store instance model); a degenerate injected set is fail-stop, not a caller rejection. A reference to an undeclared channel is **[Undeclared Channel]** — its own reason, not a shape error, because the caller's remedy differs (fix the channel vocabulary, or take the declaration question to the deployment) and a composing fanout surface reports it to the principal differently than a malformed call. The per-channel preference value, the [Frequency Limit] value, the [Quiet Hours] value, the [Format] value, and [Metadata] are opaque — the atom does not parse, validate, or interpret their contents. There is no uniqueness constraint on the preference values themselves: two principals may hold identical preferences. If the supersession write fails after all preconditions pass, the atom returns [Storage Failure] and **neither half of the supersession is observable** — no new record, and the prior record (where one existed) still currently-in-effect, per Invariant 4's atomicity. **Rejection priority:** [Invalid Request] (empty [Principal Ref]; no preference field; empty-map-only) → [Undeclared Channel] → [Storage Failure]; a caller fixing one class may meet the next on retry.

- **At `suspend(preference_id)`** — [Preference Id] must reference a known record; otherwise [Not Known]. The record must be in [Active]; suspending a [Suspended] or [Deleted] record is rejected as [Not Active]. The single [Not Active] code covers both the [Suspended] and [Deleted] cases (a [Suspended] record never returns to [Active], per Invariant 2); a caller that needs to distinguish the two calls `read(preference_id)` to inspect the record's state. If the status write fails after the preconditions pass, [Storage Failure] — nothing changed. Priority: [Not Known] → [Not Active] → [Storage Failure].

- **At `delete(preference_id)`** — [Preference Id] must reference a known record; otherwise [Not Known]. The record must not already be in [Deleted]; deleting an already-[Deleted] record is rejected as [Already Deleted]. A [Suspended] record may be deleted; the transition is [Suspended] → [Deleted]. If the status write fails after the preconditions pass, [Storage Failure] — nothing changed. Priority: [Not Known] → [Already Deleted] → [Storage Failure].

- **At `current_for(principal_ref)`** — no precondition. An empty [Principal Ref] (null, undefined, or empty string) returns `none` — no record has an empty [Principal Ref], so the result is structurally `none`. Any non-empty value that matches no record also returns `none`; since [Principal Ref] is opaque, there is no format-validation step. Both `none` and a returned record are first-class outcomes; neither is a rejection.

- **At `read(preference_id)`** — no precondition. An empty [Preference Id] (null, undefined, or empty string) returns [Not Known] — no record has an empty id, so the result is structurally [Not Known]. Any non-empty value that matches no record also returns [Not Known]; since [Preference Id] is opaque, there is no format-validation step. Both [Not Known] and the full record are first-class outcomes; neither is a rejection.

### Behavior

Observed behavior, derived from how user-preference systems are actually deployed:

- **Suspended is a first-class state, distinct from "channel preferences set to empty."** The likely objection: "if the principal wants no delivery, they can set every channel to `opt-out` — why a separate state?" The mechanism: a [Suspended] record retains the prior preference values unchanged; the principal can return to [Active] delivery by calling [Set] with the same (or any new) values, with no need to remember and re-enter their prior choices. A record with channel preferences set to opt-out, by contrast, loses the prior preferred-channel information — the principal who wants to resume delivery must re-state every channel preference. The audit story is also distinct: a [Suspended] record represents the principal's "pause" intent; a record with all-opt-out channels represents the principal's "modify" intent. Collapsing the two loses recoverable signal about what the principal meant. The result: suspending is cheap to reverse and audit-distinct from preference-modification; the principal's intent (pause vs. modify) is recoverable from the records.

- **Updates are not retroactive.** The likely objection: "shouldn't the most-recent preferences govern all in-flight notifications, including ones already queued under prior preferences?" The mechanism: a new [Set] call does not modify any prior record; it creates a new record in [Active] and transitions the prior record to [Deleted] with a [Deleted At] timestamp. The composing fanout pattern is expected to capture the preference record's values at the moment a notification is queued (its operational read time), not at the moment delivery is attempted. The atom records sufficient timestamps ([Set At], [Deleted At]) for any composing pattern to determine which record was currently in effect at any past moment, supporting both queue-time-capture and delivery-time-re-evaluation policies. The result: a fanout pattern with queue-time-capture semantics delivers already-queued notifications under prior preferences; the next [Set] does not retroactively re-shape them; the audit trail shows which preference record governed each notification.

- **Frequency limits and quiet hours are preference fields, not separate atoms.** The likely objection: "rate-limiting and time-windowing recur across many domains — surely they deserve their own atoms?" The mechanism: rate-limiting recurs in the abstract as a class of concept, but the values stored here as [Frequency Limit] and [Quiet Hours] are *stored preference values* — opaque payloads with no state machine of their own, no lifecycle independent of the preference record that carries them, and no meaning until interpreted by the composing fanout pattern at delivery time. A separate Rate-Limit atom would have its own identity, state, and actions; what this atom carries is a parameter, not a concept. The result: frequency limits and quiet hours stay in the preference record as opaque deployment-vocabulary fields; the composing layer interprets them at delivery time.

- **Channels are deployment-declared, not atom-defined.** The atom does not enumerate valid channel names. The declared channel set lives on the deployment's configuration surface and is resolved by the host and injected at the seam per [Set] invocation (Store instance model). The atom's commitment is structural: a record's [Channel Preferences] keys must be members of the set injected for that record's creation, and the record's [Declared Channels] stamp proves what it was validated against. What channels mean operationally (email transport, SMS gateway, push service) is the composing system's responsibility.

- **At most one currently-in-effect record per principal.** A [Set] call for a principal who has an [Active] or [Suspended] record creates a new record and atomically transitions the prior record to [Deleted]. The two transitions (new record's creation, prior record's transition) are part of the same operation; an external observer never sees a moment in which the principal has two Active-or-Suspended records.

- **Authorization is capability-based across writes and reads alike.** The atom does not enforce who may call any of its actions. Any caller with a [Principal Ref] may [Set] preferences for that principal or call `current_for(principal_ref)`; any caller with a [Preference Id] may [Suspend], [Delete], or [Read] the record. The read posture is the same as the write posture: capability gating on identifiers, no role check, no per-action authorization. Composing systems that need richer authorization — the principal must consent to a third party setting their preferences, the deletion must be co-signed by a privacy admin, only the principal or a privacy admin may read preference history — wrap the bare actions with Permissions or Actor Identity. The bare atom enforces something specific and useful (capability gating on ids) and the layering story for richer models is clean.

- **The atom does not consult, re-check, or override the legality of communicating with the principal.** Whether legal permission exists to deliver any notification to this principal at all is a separate concept, evaluated outside this atom. A composing fanout pattern that finds a currently-in-effect [Active] preference record does not, on the strength of that record alone, possess permission to deliver; the composing layer must sequence permission-evaluation before reading preferences. The atom's commitment is conditional: *given that delivery is permitted, here is the principal's stated shape for it.* A revocation of legal permission, by the separate concept that owns it, makes the preference record operationally irrelevant — the composing layer is responsible for sequencing permission-evaluation before reading preferences. The atom does not detect or react to permission revocation; the records remain unchanged. A composing system that reads preferences without first re-checking permission has made a sequencing error, not an atom-conformance error.

- **The atom does not consult or evaluate topic subscriptions.** Whether this principal is subscribed to the topic of any particular notification is a separate concept. A composing fanout pattern that finds a currently-in-effect record does not, on the strength of that record alone, know that the notification falls within a topic the principal follows. The composing layer must sequence subscription-evaluation alongside preference-reading.

- **Absent preference fields signal no-preference, not opt-in or opt-out.** A record with [Channel Preferences] supplied but [Frequency Limit] absent signals "the principal has stated channel preferences but no frequency cap"; the composing fanout pattern applies its deployment default for the absent dimension. The same holds for each preference field. This is structurally distinct from a [Channel Preferences] that includes a channel with an explicit `"opt-out"` value (or equivalent) — which signals an active opt-out, not an absence.

- **`current_for(principal_ref)` is a deterministic query.** Invariant 3 (at-most-one-currently-in-effect) guarantees the query has a unique answer. The query is answered entirely from the current preference record set; no out-of-band data is consulted.

- **`read(preference_id)` returns the full record in any state.** A [Deleted] record is queryable via [Read] for the lifetime of the store. The audit trail of a principal's preferences over time is recoverable by enumerating records with `record.principal_ref = X` and reading each.

- **Concurrent calls resolve serially under host serialization guarantees.** The host serializes all operations on a given principal (how the composing system handles competing callers is its own responsibility), and the recorded timestamps witness that order — subject to the Temporal property (Timestamp ordering)'s clock caveat. The cases:
  - Two [Set] calls for the same principal — the first creates R1 and supersedes any prior; the second creates R2 and supersedes R1.
  - Two [Suspend] calls on the same id — the first succeeds; the second gets [Not Active].
  - Two [Delete] calls on the same id — the first succeeds; the second gets [Already Deleted].
  - A [Suspend] and a [Delete] on the same [Active] id — whichever serializes first wins: if [Delete] is first, the late [Suspend] gets [Not Active]; if [Suspend] is first, the late [Delete] succeeds ([Suspended] → [Deleted] is permitted, so not [Already Deleted] — the record is [Suspended], not [Deleted]).
  - A [Current For] read concurrent with a [Set] — returns either the prior or the new record, never a torn state; under queue-time-capture fanout, a read returning a just-superseded record is acceptable, because the fanout captured the values at queue time.

- **No preference record is removed from the store.** All records — [Active], [Suspended], [Deleted] — remain queryable via [Read] for the lifetime of the system. The [Delete] action moves a record into the [Deleted] state; it does not remove the record from storage. [Current For] excludes [Deleted] records by design.

- **Re-creating preferences after explicit deletion produces a new record.** A principal who calls [Delete] and then [Set] later has two records: the prior [Deleted] record (carrying the original preference values and a [Deleted At] timestamp) and the new [Active] record (carrying fresh [Preference Id], [Set At], and whatever preference values the principal supplied). The two records have independent ids. The retired id is not reused.

### Feedback

Each successful action produces an observable, measurable change:

- After [Set] — a new record appears in [Active] with a fresh [Preference Id], the supplied [Principal Ref], the supplied preference fields, and [Set At]. Total preference record count increases by one. Active-or-Suspended count for the principal becomes 1 (any prior was transitioned to [Deleted] as part of the operation). The id is returned. Falsifiable: after `set(p, prefs) → n`, `read(n)` must return a record with `status = active` and `principal_ref = p`; `current_for(p)` must return that record.
- After [Suspend] — the record moves to [Suspended] with [Suspended At]. Active count for the principal decreases by 1; Suspended count increases by 1; total count unchanged. Falsifiable: `read(n)` must return `status = suspended` and `suspended_at` set; `current_for(principal_ref)` must still return the record.
- After [Delete] — the record moves to [Deleted] with [Deleted At]. Active-or-Suspended count for the principal decreases by 1; Deleted count increases by 1; total count unchanged. Falsifiable: `read(n)` must return `status = deleted` and `deleted_at` set; `current_for(principal_ref)` must not return the record.
- After [Current For] — no state change. Returns the full preference record or `none`.
- After [Read] — no state change. Returns the full preference record or [Not Known].

[Set] rejections: [Invalid Request], [Undeclared Channel], [Storage Failure]. [Suspend] rejections: [Not Known], [Not Active], [Storage Failure]. [Delete] rejections: [Not Known], [Already Deleted], [Storage Failure].

The full preference set — [Active], [Suspended], [Deleted] — is queryable via [Read] and (for currently-in-effect records only) [Current For].

### Invariants

The following hold across all valid sequences of actions and constitute the verification surface of the pattern:

- **Invariant 1 — Message Preference record immutability.** Once recorded, a preference record's [Preference Id], [Principal Ref], [Set At], and each supplied preference field ([Channel Preferences], [Frequency Limit], [Quiet Hours], [Format], [Metadata]) never change. Fields not supplied at [Set] remain absent for the record's lifetime. Once set, [Suspended At] and [Deleted At] never change. The [Status] field is the only mutable field; it transitions per Invariant 2.

- **Invariant 2 — Status monotonicity.** A record's [Status] transitions only in one direction: [Active] → [Suspended] (via [Suspend]), [Active] → [Deleted] (via [Delete] or supersession), or [Suspended] → [Deleted] (via [Delete] or supersession). No record returns from [Suspended] to [Active] or from [Deleted] to any other state. To return a principal to [Active] delivery from a [Suspended] or [Deleted] state, a fresh [Set] call creates a new record.

- **Invariant 3 — At most one currently-in-effect record per principal.** For any [Principal Ref], at most one preference record is in [Status] ∈ {`active`, `suspended`} at any time. A [Set] call for a principal who has a currently-in-effect record transitions the prior record to [Deleted] as part of the same operation (Invariant 4).

- **Invariant 4 — Supersession atomicity.** When [Set] is called for a principal who has a currently-in-effect record, the prior record's transition to [Deleted] and the new record's creation are part of the same operation. No external observer sees a moment in which the principal has two records in {`active`, `suspended`}. Invariant 4 asserts only the atomic co-occurrence of the two state changes, which holds unconditionally; the *timestamp* relationship between the prior record's [Deleted At] and the new record's [Set At] is a best-effort directional claim deferred to the Temporal property (Timestamp ordering), because it depends on clock monotonicity that Invariants 1–10 do not.

- **Invariant 5 — Channel preferences reference declared channels, and the proof is on the record.** Every channel name appearing as a key in any preference record's [Channel Preferences] is a member of **that record's own [Declared Channels]** — the set injected at the seam and stamped at [Set] time, under the injection host obligation that the set is non-empty and well-formed (Store instance model). The check is per-record and self-contained: one record, one stamped set, no cross-record join and no second clock (the stamp and the record are written in the same transition from the same seam inputs). A later change to the deployment's declared set never invalidates a historical record, whose keys remain valid against its own stamp forever.

- **Invariant 6 — Suspension is value-preserving.** The [Suspend] transition changes only [Status] to `suspended` and sets [Suspended At]; the preference values ([Channel Preferences], [Frequency Limit], [Quiet Hours], [Format], [Metadata] if supplied) and the principal's reference remain as they were at [Set] time. This is the structural mechanism behind the cheap-resumption property: a composing system that wants to resume delivery can read the [Suspended] record's values and replay them in a new [Set] call without any vocabulary loss — subject to re-validation against the declared set injected for that new call, so a channel key removed from the declaration in the meantime must be dropped from the replay (Edge cases — *Channel set evolution*).

- **Invariant 7 — [Current For] determinism.** `current_for(principal_ref)` returns the unique record for the principal with [Status] ∈ {`active`, `suspended`}, or `none` if no such record exists. The query is determined entirely by the preference record set at query time. No out-of-band data is consulted. Invariant 3 guarantees the result is unique when non-`none`.

- **Invariant 8 — No id reuse.** No two preference records share a [Preference Id] across the lifetime of the system. A deleted record's id is not reused even after the record is [Deleted].

- **Invariant 9 — Message Preference store durability (over this atom's own surface).** This atom provides no removal surface, and through it no preference record is ever removed: the total record count is monotonically non-decreasing and [Deleted] records are retained as audit evidence, queryable via [Read]. Lawful disposal under a composed retention pattern ([Retention Window](./retention-window.md) / a deployment's erasure obligations under GDPR (EU General Data Protection Regulation) Article 17) is that pattern's declared, recorded act, outside this invariant's scope — an auditor of a composed deployment reads its retention records alongside this store.

- **Invariant 10 — Validation-context self-containment.** Every preference record carries [Declared Channels] — the declared channel set injected at the seam for its [Set] invocation — stamped at creation, non-empty and well-formed (guaranteed by the injection host obligation, Store instance model), and immutable thereafter, like every other field of the record (Invariant 1's discipline extended to the validation context). The store therefore audits per record with no external configuration artifact and no second record class: what a record was validated against is on the record. What this invariant deliberately does **not** cover is the governance of the declared set itself — who may change the deployment's channel declaration, when it changed, and the audit of those changes live on the deployment's configuration surface, composed with Audit Trail or Actor Identity where a regulator requires them; this atom consumes the resolution and proves the consumption.

- **Temporal property — Timestamp ordering** *(best-effort; deliberately outside the invariant numbering — Invariants 1–10 are the hard set, and giving this best-effort property slot 11 would misread it as their peer).* For any record with [Suspended At] set, [Set At] ≤ [Suspended At]. For any record with [Deleted At] set, [Set At] ≤ [Deleted At]. For any record with both [Suspended At] and [Deleted At] set, [Suspended At] ≤ [Deleted At]. Across a supersession pair `(R_prior, R_next)` for the same principal, `R_prior.deleted_at ≈ R_next.set_at` — equal within the deployment's declared clock tolerance (see Generation acceptance Check 4); this is the cross-record counterpart that, with the within-record inequalities above, constitutes the complete temporal model (the atomic co-occurrence itself is Invariant 4). These inequalities are best-effort under non-monotonic clocks; if the underlying clock moves backward between transitions, an inequality may be violated. Unlike the invariants above — which hold over every state the atom's own accepted actions can reach, given the named host obligations (atomic supersession writes, durable storage) and over this atom's own surface (composed lawful purge is outside them — Invariant 9) — this property holds only when the implementation provides monotonic-clock discipline. The implementor is responsible for that discipline; see Edge cases. The inequalities are labeled separately from the hard invariants because audit reconstructions (Generation acceptance check 2) depend on their directional guarantee; violations are observable and diagnosable rather than silently corrupting.

Message Preference record immutability and store durability together give the *auditability* property — the full history of every principal's preferences is recoverable from the preference store alone, with no gaps. At-most-one-currently-in-effect and supersession atomicity together give the *unambiguous-currency* property — at any moment, every principal has at most one preference record governing delivery, and the moment of transition between records is recorded. Suspension-is-value-preserving gives the *cheap-resumption* property — a principal who suspends and later wants to resume does not lose their prior preference values; the composing system can re-set them from the suspended record's stored fields.

---

## Examples

The three lifecycle scenarios below trace one principal (`user_u`) through onboarding, vacation suspend, and account closure — the record chain `pref_001 → pref_088 → pref_141` — to show the same atom serving each operational context in turn. The rejection-path and regulated scenarios that follow use their own principals and ids. The deployment in each example carries `["email", "sms", "push", "in-app"]` on its configuration surface, injected at the seam for each `set` call, unless otherwise noted.

### Consumer SaaS (software as a service) — onboarding preferences

A new user onboarding to a productivity app picks their notification preferences: email for daily digests, push for real-time mentions, no SMS, no quiet hours, plain-text format. The settings page calls `set(principal_ref: user_u, channel_preferences: {email: "digest", push: "real-time", sms: "opt-out"}, format: "plain")` → `pref_001`. The record enters [Active].

When the composition fires an event for which `user_u` is subscribed, the fanout pattern calls `current_for(user_u)` → returns `pref_001`. The fanout pattern reads the channel preferences and creates one Notification per non-opted-out channel.

Three weeks later, the user adds SMS for urgent items and a frequency cap: `set(principal_ref: user_u, channel_preferences: {email: "digest", push: "real-time", sms: "urgent-only"}, frequency_limit: {per_day: 10}, format: "plain")` → `pref_088`. The prior record `pref_001` transitions to [Deleted] with [Deleted At]; the new record `pref_088` is in [Active]. `current_for(user_u)` now returns `pref_088`. Subsequent notifications are shaped under the new preferences.

### Marketing platform — vacation suspend

A subscriber to a marketing newsletter is going on a two-week vacation and wants to pause all notifications without losing their preferences. The settings page calls `suspend(pref_088)` → `ok`. The record moves [Active] → [Suspended] with [Suspended At]. `current_for(user_u)` returns the record (in [Suspended] state). The fanout pattern observes the [Suspended] state and suppresses delivery.

When the subscriber returns, the settings page reads the suspended record's values (via `current_for(user_u)`) and offers them as defaults; the subscriber confirms and the settings page calls `set(principal_ref: user_u, channel_preferences: {email: "digest", push: "real-time", sms: "urgent-only"}, frequency_limit: {per_day: 10}, format: "plain")` → `pref_141`. The prior record `pref_088` ([Suspended]) transitions to [Deleted] with [Deleted At] (preserving its [Suspended At] and the original [Set At]). `pref_141` is the new [Active] record carrying the previously-stored values. The subscriber is back to full delivery.

### Account closure — explicit deletion

A user closes their account. As part of the closure flow, the account-deletion service calls `delete(pref_141)` → `ok`. The record moves to [Deleted] with [Deleted At]. `current_for(user_u)` returns `none`. The fanout pattern, finding no currently-in-effect record, treats delivery per the deployment's fanout-on-no-record policy (some deployments default to system-default delivery, others suppress entirely; the policy is composing-system configuration).

The prior records (`pref_001`, `pref_088`, `pref_141`) all remain in the store as [Deleted] records. A subsequent DSAR for `user_u`'s preference history enumerates the principal's records from the audit surface (filtering the store on `principal_ref = user_u`, per Generation acceptance Check 1) and returns the full chronological history; each record's content is what `read(preference_id)` would return for it.

### Rejection path — set with no preference fields

A composing system attempts to record a "preference set" carrying nothing: `set(principal_ref: user_u)` → `rejected(invalid-request)`. No [Preference Id] is issued; no record enters the store. The Decision-point rule (at least one of [Channel Preferences], [Frequency Limit], [Quiet Hours], or [Format] must be supplied) is the constraint.

### Rejection path — set with undeclared channel

The deployment's declared channel set, injected at the seam for this call, is `["email", "sms", "push", "in-app"]`. A composing system attempts to record a preference referencing a channel not in it: `set(principal_ref: user_v, channel_preferences: {email: "preferred", carrier-pigeon: "backup"})` → `rejected(undeclared-channel)`. No record enters the store; the reason names the vocabulary error as its own class, so the composing system knows to fix the channel name rather than the call shape.

### Rejection path — suspend a Deleted record

A retry after a network timeout: `suspend(pref_001)` → `rejected(not-active)`. The record `pref_001` is [Deleted]. The caller detects the rejection and suppresses the retry.

### Rejection path — delete an already-Deleted record

A duplicate teardown call: `delete(pref_141)` → `rejected(already-deleted)`. The record `pref_141` already reached [Deleted] in the account-closure flow; the second [Delete] changes nothing and is rejected. (A [Delete] on a *[Suspended]* record, by contrast, succeeds with `ok` — the [Suspended] → [Deleted] transition is valid per the Decision points.)

### Regulated adversarial scenarios

Three scenarios the preference store must survive in regulated contexts:

- **Regulator audit — demonstrate honoring opt-out under CAN-SPAM (the US Controlling the Assault of Non-Solicited Pornography And Marketing Act — the federal commercial-email law).** A regulator investigates whether a marketing platform honored a principal's opt-out for the `email` channel after `2026-03-14`. The investigator queries the audit surface for `principal_ref = user_v`, enumerating the principal's records. The records show: `pref_201` with `email: "preferred"` currently-in-effect from `2025-08-01` to `2026-03-14` (`set_at = 2025-08-01`, `deleted_at = 2026-03-14`); `pref_244` with `email: "opt-out"` currently-in-effect from `2026-03-14` onward (`set_at = 2026-03-14`, `status = active`). For any email delivery alleged to have occurred to `user_v` after `2026-03-14`, the fanout pattern would have called `current_for(user_v)` and read `pref_244`. If a delivery occurred against this record, that is either a fanout-pattern conformance failure (the pattern read the record but delivered anyway) or a separate composing-layer failure — *either way*, the preference record is the structural evidence of the principal's stated intent at the time of delivery. Invariants 1 (immutability) and the Temporal property (Timestamp ordering) are the rebuttal: the record was created at that time with those values; it does not change.

- **Disputed delivery — principal claims their quiet hours were ignored under TCPA (the US Telephone Consumer Protection Act — the federal law restricting unsolicited calls and texts).** A principal complains that they received SMS at 11:30pm despite quiet hours of 10pm-7am. The investigator first reconstructs which record was currently-in-effect at the delivery timestamp — Generation acceptance Check 2: enumerate the principal's records and take the one with the maximum [Set At] ≤ the delivery time whose currently-in-effect window covers it — obtaining its [Preference Id], then queries `read(preference_id)`. The record shows `quiet_hours: {start: "22:00", end: "07:00", timezone: "America/Los_Angeles"}`. The atom's records confirm the principal's stated quiet hours at the moment of delivery; whether the fanout pattern observed them is the composing-layer question. The atom's commitment: the principal's preferences were recorded; the record is the structural evidence; no developer narration is required to confirm what the principal stated.

- **Breach investigation — identify principals whose preferences may have been corrupted during a security incident.** A security incident on `2026-04-01T05:00Z` exposed the preference store to potential unauthorized modification. The investigator queries the audit surface for any record with [Set At], [Suspended At], or [Deleted At] falling within the breach window. Invariant 1 (immutability) and Invariant 9 (durability) are the atom-level rebuttal — but only as a *contract*, not as cryptographic enforcement: any record created before the breach window *should not* have been altered, and the atom's records expose alteration only insofar as the underlying store does. Cryptographic protection against post-hoc tampering belongs to a composing Tamper Evidence pattern; without that composition, the bare atom's records support forensic reconstruction (which records existed when, which transitioned within the window, which principals are affected) but do not, on their own, prove that no out-of-band write occurred. Records with a transition timestamp within the breach window are candidates for forensic review against the composing system's authentication logs; records outside the window are presumed unaltered subject to whatever integrity discipline the underlying store provides.

---

## Edge cases and explicit non-goals

What this atom does not cover:

- **Notification routing and fanout.** This atom records preferences; it does not consult subscriptions, fire events, or create notifications. Those belong to a composing fanout pattern that wires the topic-subscription concept, the legal-permission concept, this atom, and an event source.

- **Whether delivery is legally permitted.** Whether the system has permission to communicate with the principal at all — under GDPR's (EU General Data Protection Regulation — the European Union's data-privacy law) consent requirement, HIPAA's (US Health Insurance Portability and Accountability Act) authorization rule, ePrivacy's opt-in for non-essential communications — is a separate concept evaluated by the composing layer. The atom's commitment is conditional: *given that delivery is permitted, here is the principal's stated shape for it.* The composing layer must sequence permission-evaluation before reading preferences. See the corresponding Behavior bullet.

- **Whether the principal is subscribed to the topic.** Whether this principal follows the topic of any particular notification is a separate concept. The composing layer must sequence subscription-evaluation alongside preference-reading. A principal who has set preferences but is not subscribed to a topic does not receive notifications for that topic, regardless of preference values; conversely, a principal who is subscribed but has no preference record receives notifications under the composing system's default shaping.

- **Transport mechanism.** Whether `email` is delivered via SMTP (Simple Mail Transfer Protocol — the standard email-delivery protocol), a transactional email API, or an internal mail relay is handled at the deployment layer. The atom records the principal's channel-level preference; the composing layer interprets it.

- **Message Preference-value semantics.** What `"preferred"`, `"opt-out"`, `"backup"`, or a numeric priority means at the channel level is the deployment's vocabulary call. The atom stores and returns these values opaque. Similarly for the structure of [Frequency Limit], [Quiet Hours], and [Format] — all opaque.

- **Channel set evolution.** Adding a channel to or removing a channel from the deployment's declared set is a configuration-surface operation outside this atom; the atom sees only the set injected at the seam for each [Set] invocation. Existing records are untouched by the change and remain verifiable forever: each carries its own [Declared Channels] stamp, and Invariant 5 is per-record against that stamp, so a removed channel appearing in a historical record's keys is consistent with the record's own set. The change is visible only forward — a [Set] after the change validates against the newly injected set, so a resumption replay carrying a since-removed channel key meets [Undeclared Channel] and must drop the key (the cheap-resumption caveat in Invariant 6). The composing layer decides how to treat historical records referencing channels no longer declared — typically as default-suppressed on the absent channel.

- **Channel-set governance is a deployment obligation, consumed — not held — here.** The declared channel set is deployment configuration resolved by the host and injected at the seam per [Set] invocation (Store instance model); the atom exposes no action that declares or changes it and persists no configuration records. The deployment owns the declaration's governance — who may change it, its change history, and the who/when audit, composing its configuration surface with [Audit Trail](../compositions/audit-trail.md) or [Actor Identity](./actor-identity.md) where a regulator requires positive attestation. What this store proves is per record: the stamped [Declared Channels] shows exactly what each record was validated against, whatever the declaration has done since. A host that injects a wrong or stale set produces records honestly stamped with the set actually used — a governance failure surfaced by the stamps, not hidden by them.

- **Default preferences for principals without a record.** A principal who has never called [Set] has no record; [Current For] returns `none`. What the composing fanout pattern does in that case — apply system defaults, suppress entirely, prompt the principal — is composing-layer policy and must be disclosed for cross-deployment audit (see Generation acceptance).

- **Resume from Suspended without re-statement.** The atom does not provide a `resume(preference_id)` action that returns a [Suspended] record to [Active]. To resume, a composing system reads the [Suspended] record's values via [Current For] or [Read] and calls [Set] with those values; the new record is in [Active] and the [Suspended] record transitions to [Deleted]. The likely objection: "this is a common user flow — why not a first-class action?" The mechanism: a `resume` action that returned a [Suspended] record to [Active] would introduce a reverse status transition ([Suspended] → [Active]), breaking Invariant 2's monotonicity guarantee ([Active] → [Suspended] → [Deleted] is the only permitted direction). Beyond monotonicity, a principal who suspend-resume-suspends-resumes repeatedly would accumulate all of that history on a single record — each cycle adding a `resumed_at` and a new [Suspended At] — rather than producing distinct records per lifecycle event. The supersession path keeps the audit trail clean: each lifecycle action produces a new record or a monotonic state transition, and the composing-layer ergonomics of reading the [Suspended] record's values and offering them as [Set] defaults are cheap. The result: lifecycle monotonicity and audit-trail clarity win over action-surface convenience.

- **Deletion-reason distinction (supersession vs. explicit).** The atom does not record whether a [Deleted] record was superseded by a new [Set] or explicitly deleted by the principal. Both produce a [Deleted] record with [Deleted At]. The distinction is *approximately* recoverable from the records via a timestamp-gap heuristic: if a successor record exists for the same principal with [Set At] within the deployment's declared clock tolerance of the [Deleted] record's [Deleted At], the deletion was likely atomic supersession (Invariant 4); if the gap is material, the deletion was likely explicit followed by later re-creation. This is a heuristic, not a definitive recovery — explicit-delete-then-recreate and supersession produce the same record structure, distinguishable only by the size of the timestamp gap. Deployments that need first-class deletion-reason recording (e.g., for regulator-facing audit dashboards that must distinguish "principal updated preferences" from "principal closed account") can compose with Actor Identity or Audit Trail to attribute each lifecycle action; the bare atom does not carry a reason field.

- **Conflicting preferences.** Two [Set] calls with different preference values for the same principal in rapid succession produce two records; the second supersedes the first. The atom does not detect or warn about "conflicting" preferences; it records the second as authoritative per Invariant 4. Composing systems that need conflict-detection (e.g., a UI that warns "you just changed this — are you sure?") implement it at the composing layer.

- **Bulk operations.** There is no bulk-set, bulk-suspend, or bulk-delete surface. Operations on multiple principals require iteration at the composing layer.

- **Per-topic preference overrides.** A principal who wants different preferences per topic (e.g., real-time push for security alerts but daily digest for newsletters) needs a richer model than this atom. The atom's record applies to all notifications for the principal uniformly. Per-topic preferences are a composing-layer extension; one approach is to compose a separate preference instance per topic-class, with the composing fanout pattern selecting the right instance per notification.

- **Message Preference attribution.** The atom does not record who called [Set], [Suspend], or [Delete]. Attribution — *the principal set their own preferences via the web UI*, *an admin set preferences on behalf of the principal*, *an automated process suspended preferences in response to bounce-back* — belongs to a composing Actor Identity pattern. The [Preference Id] is the hook: a composing Actor Identity pattern records `attest(preference_id, acted_by_ref, credential)` at action time. No field is added to the preference record itself; the attribution lives in the Actor Identity store.

- **Authorization to set, suspend, or delete.** The atom does not enforce who may call these actions. Authorization — only the principal or an authorized admin may modify preferences — belongs to the composing system.

- **Atomicity and crash semantics.** The [Set] action with supersession changes two records simultaneously: the prior record's [Status] and [Deleted At], and the new record's full creation. A crash mid-[Set] that creates the new record without transitioning the prior, or vice versa, violates Invariant 4 (supersession atomicity). The [Suspend] and [Delete] transitions change two fields on one record ([Status] and a timestamp); a partial write violates Invariant 1 or the Temporal property (Timestamp ordering). The implementor is responsible for the transactional boundary that makes each operation atomic. The atom's invariants additionally presume a host that serializes writes targeting the same [Principal Ref] — at minimum, linearizable writes per [Principal Ref] (or a serializable transaction wrapping each operation). The serialization domain is the principal, not the individual record id: although [Suspend] and [Delete] take a [Preference Id], every record belongs to exactly one [Principal Ref], so all operations touching any record of a given principal — [Set] (keyed by principal) and [Suspend]/[Delete] (keyed by id) alike — must serialize against one another, or a concurrent [Set] and [Suspend]/[Delete] on the same principal can interleave inconsistently. Under weaker isolation (snapshot, read-committed), two concurrent [Set] calls for the same principal can both observe no-currently-in-effect and commit, violating Invariant 3; the deployment is responsible for choosing a host isolation level that forecloses that case. Atomicity under normal operation is a conformance requirement: an implementation whose [Set] can persist a new record without transitioning the prior — leaving the principal with two currently-in-effect records after recovery — is non-conformant, because Invariants 3 and 4 must hold across every reachable state. The spec does not define post-crash reconciliation (how an implementation detects and repairs a partial write belongs to the implementor), but the post-recovery store must not exhibit a standing invariant violation.

- **Message Preference data retention.** The preference store retains all records for the lifetime of the system (Invariant 9). If preference values contain sensitive data — a [Quiet Hours] value naming a timezone tied to physical location, a [Metadata] payload carrying tracking identifiers — the composing system is responsible for the retention and erasure policy. [Retention Window](./retention-window.md) is the composing pattern that bounds how long records must be kept and when they may be purged. The bare atom does not implement preference expiry or redaction.

- **Cryptographic integrity of records.** The atom's immutability is spec-level — the spec says fields never change; it does not seal the records against malicious modification. Court-admissible and regulator-admissible preference records require composition with Tamper Evidence.

- **Clock semantics.** Wall-time is supplied as an input injected at the atom's single I/O seam (the execution contract's `clock_t`; it is not threaded through the [Set] / [Suspend] / [Delete] signatures, none of which carries a `now` argument). The host reads the clock and supplies the reading before the transition runs, so the transition stays a pure function of its inputs and reads no clock internally. That one injected reading is what stamps [Set At], [Suspended At], and [Deleted At] — the atom's only consumers of it; no guard is time-gated. Clock skew, NTP (Network Time Protocol — the standard protocol computers use to synchronize their clocks) adjustments, monotonicity, and timezone handling remain a deployment matter, handled at the deployment layer. Because no precondition consults the reading, a non-monotonic clock degrades only the annotation, never an admission decision: the Temporal property (Timestamp ordering)'s inequalities are best-effort under non-monotonic clocks, and the deployment's declared clock tolerance (Generation acceptance check 4) is what bounds how a supersession gap should be read.

---

## Generation acceptance

The audit surface is the preference store inspected on its stored fields — distinct from and complementary to the action surface ([Set], [Suspend], [Delete], [Current For], [Read]). The action surface answers *what does the atom do at runtime?*; the audit surface answers *what does the atom commit to recording, queryable on stored fields?*. A derived implementation must produce a store that supports the audit-surface queries below, independent of whether the runtime action surface exposes them.

A derived implementation of Message Preference is *acceptable* — in the regulator-acceptance sense — when an external auditor, given the preference store, can do all of the following without recourse to source code, runbooks, or developer narration:

- **Check 1 — Enumerate every preference record with its full lifecycle.** [Preference Id], [Principal Ref], [Set At], [Status], and the applicable lifecycle timestamps ([Suspended At] if the record was ever [Suspended]; [Deleted At] if [Deleted]) are present and queryable for every record ever created. The preference values ([Channel Preferences], [Frequency Limit], [Quiet Hours], [Format], [Metadata]) are present for every record on which they were supplied. No record is missing from the store (Invariant 9).

- **Check 2 — Reconstruct the currently-in-effect record for any principal at any past point in time.** Given a `principal_ref` and a timestamp `t`, the auditor can determine which record was currently-in-effect at `t` by filtering on `set_at ≤ t` and (`status ∈ {active, suspended}` or `deleted_at > t`) — taking the record with the maximum `set_at` ≤ `t` (Invariant 3 guarantees this record is unique). The interval convention is half-open `[set_at, deleted_at)`: at `t == set_at` the record is currently-in-effect; at `t == deleted_at` it is not (a successor created in the same atomic supersession is the one currently-in-effect at `t == deleted_at == successor.set_at`, per Invariant 4). The reconstruction is exact with respect to stored timestamps (Invariants 1 and 4); the wall-clock truth of those timestamps is subject to the Temporal property (Timestamp ordering)'s best-effort clock caveat.

- **Check 3 — Confirm at-most-one-currently-in-effect.** For any [Principal Ref], at most one record is in [Status] ∈ {`active`, `suspended`} at any point in time. The auditor verifies by enumerating the principal's records and confirming no two records have overlapping currently-in-effect windows (Invariants 3 and 4). The window arithmetic is exact with respect to the *stored* timestamps (Invariants 1 and 4); their wall-clock truth carries the Temporal property (Timestamp ordering)'s best-effort caveat, so a non-monotonic clock can make two windows appear to overlap that never co-existed in real time — the auditor resolves an apparent overlap against the deployment's declared clock tolerance (Check 4) before recording it as an Invariant 3 violation.

- **Check 4 — Confirm supersession atomicity at the timestamp level.** For any pair of records `(R_prior, R_next)` for the same principal where `R_next.set_at > R_prior.set_at` and `R_prior.status = deleted`, the auditor inspects the gap `R_next.set_at − R_prior.deleted_at`. A gap within the deployment's declared clock tolerance is consistent with atomic supersession (Invariant 4). A gap materially exceeding the declared tolerance requires investigation: the gap is consistent with either an explicit `delete` issued between the two records (no atomicity violation; the principal was without a currently-in-effect record for the duration of the gap) or an atomicity violation (supersession was non-atomic; an external observer could have seen the principal with zero or two currently-in-effect records during the gap). The atom's records cannot distinguish the two cases on their own — the same record structure is produced by both. Deterministic discrimination requires composition with Audit Trail (which records each action as a discrete event with its own attribution) or Actor Identity (which attests each action's initiator); without such composition, the auditor must flag the gap as ambiguous-pending-external-evidence rather than as a clean pass or a clean failure. The deployment must disclose its clock tolerance (the maximum gap expected between two writes within the same atomic operation, e.g., "writes within the same database transaction share a statement timestamp; tolerance is 0ms" or "wall-time at write time; tolerance is 500ms under NTP"). The clock-tolerance disclosure belongs alongside the fanout-on-no-record policy disclosure required by check 6.

- **Check 5 — Confirm channel-set membership at record creation.** For every preference record's [Channel Preferences] (if present), every key is a member of **that record's own [Declared Channels]** stamp. The check is one record at a time, clearable from the store alone with no configuration artifact, no cross-record join, and no timestamp comparison — the record carries its validation context (Invariants 5 and 10). A record whose keys include a name outside its own stamp, or whose [Declared Channels] is absent or empty, is a conformance failure.

- **Check 6 — Identify composing patterns active in this deployment.** Whether preference attribution (Actor Identity), event firing history against preferences (Event Log), retention (Retention Window), tamper-evidence on the preference store (Tamper Evidence), and the legal-permission and topic-subscription concepts the deployment uses to gate delivery are wired in, and with what configuration. The deployment's **fanout-on-no-record policy** must also be disclosed — when `current_for(principal_ref)` returns `none`, does the fanout pattern apply system defaults, suppress delivery entirely, or prompt for preferences? Without this disclosure, the same operational situation (no preference record) produces different delivery outcomes across deployments and cross-deployment audit cannot interpret records uniformly.

This is the generator's contract: any code generated from this atom must produce a preference store and a query surface that pass the six checks above.

---

## Terms

The canonical concepts this spec refers to. Each `[Term]` marker in the prose above links to its card here. A card states what the concept *is*, in plain English, plus its **Kind** — one of four: **Type** (a thing or category), **Operation** (a behavior), **Member** (a value of an enumerated Type), or, for a named datum, **Field** (a datum a Type carries — *what does it carry?*) or **Parameter** (a value an Operation needs — *what does it need?*). A card also names the Type it is a **Member of** / **Field of**, the Operation it is a **Parameter of**, and its **Role** where the domain assigns one. A card carries one **Projects** line — the concept's single canonical lowering token, the one place the concrete name stays visible on the page — for every Field, Parameter, and pinned/wire Member. Everything else about casing (each target's snake / camel / pascal / const / wire form) is **derived** from that one token by [`tools/harness/term-adapter.mjs`](../tools/harness/term-adapter.mjs), never hand-written. *(annotation.md Terms registry; representational only — it changes no guarantee, invariant, or behavior of the atom above.)*

#### Set

The behavior that records a new preference set for a principal. It assigns a fresh [Preference Id], stamps [Set At], records [Principal Ref] and the supplied preference fields ([Channel Preferences], [Frequency Limit], [Quiet Hours], [Format], [Metadata]), and returns the [Preference Id]. The new record enters [Active]; any currently-in-effect prior transitions to [Deleted] atomically (Invariant 4). At least one preference field is required (else [Invalid Request]).

Kind: Operation

#### Suspend

The behavior that pauses delivery, transitioning an [Active] record to [Suspended] and stamping [Suspended At] without altering any preference value (Invariant 6). Rejected for a non-[Active] record ([Not Active]) or an unknown id ([Not Known]).

Kind: Operation

#### Delete

The behavior that retires a record, transitioning an [Active] or [Suspended] record to terminal [Deleted] and stamping [Deleted At]. Rejected for an already-[Deleted] record ([Already Deleted]) or an unknown id ([Not Known]). The record is retained, not removed (Invariant 9).

Kind: Operation

#### Current For

The read-only query returning the unique currently-in-effect record ([Active] or [Suspended]) for a [Principal Ref], or `none` if there is none (Invariant 7). Excludes [Deleted] records; never transitions.

Kind: Operation

#### Read

The read-only query returning the full record for a [Preference Id] in any state ([Active], [Suspended], or [Deleted]), or [Not Known] if no record has that id. Deletion is a state, not a removal; never transitions.

Kind: Operation

#### Preference Id

The opaque, immutable identity of a preference record, host-allocated at the I/O seam on [Set], never reused (Invariant 8). The principal reference and preference values are properties of the record, not its identity.

Kind:     Field
Field of: the preference record
Projects: preference_id

#### Principal Ref

The opaque reference to the principal whose preferences are recorded. Set on [Set], immutable. Equality is exact (no normalization); the at-most-one-currently-in-effect rule (Invariant 3) ranges over it.

Kind:     Field
Field of: the preference record
Projects: principal_ref

#### Channel Preferences

The optional map from declared channel name to opaque per-channel preference value. Set on [Set] if supplied, immutable. Every key must be a member of the record's own [Declared Channels] stamp — the set injected at the seam for that [Set] invocation (Invariant 5).

Kind:     Field
Field of: the preference record
Projects: channel_preferences

#### Frequency Limit

The optional, opaque deployment-shaped value capturing the principal's frequency cap. Set on [Set] if supplied, immutable; interpreted by the composing fanout pattern, not the atom.

Kind:     Field
Field of: the preference record
Projects: frequency_limit

#### Quiet Hours

The optional, opaque deployment-shaped value capturing windows during which delivery should be suppressed. Set on [Set] if supplied, immutable; interpreted by the composing layer.

Kind:     Field
Field of: the preference record
Projects: quiet_hours

#### Format

The optional, opaque deployment-shaped value capturing format preferences. Set on [Set] if supplied, immutable; interpreted by the composing layer.

Kind:     Field
Field of: the preference record
Projects: format

#### Metadata

The optional opaque payload the atom stores unchanged (form version, user-agent, consent-flow id). Set on [Set] if supplied, immutable. Does not by itself satisfy the at-least-one-preference-field requirement.

Kind:     Field
Field of: the preference record
Projects: metadata

#### Set At

The wall-time the record was created, stamped from the seam-injected clock reading at [Set]. Immutable (Invariant 1). The currency-reconstruction key for [Current For] and audit.

Kind:     Field
Field of: the preference record
Projects: set_at

#### Status

The record's lifecycle state — [Active], [Suspended], or [Deleted]. Set to [Active] on [Set]; the only mutable field, transitioning monotonically (Invariant 2).

Kind:     Field
Field of: the preference record
Projects: status

#### Suspended At

The wall-time the record was suspended, stamped at [Suspend]. Absent until [Suspended]; immutable once set.

Kind:     Field
Field of: the preference record
Projects: suspended_at

#### Deleted At

The wall-time the record reached [Deleted], stamped at [Delete] or supersession. Absent unless [Deleted]; immutable once set.

Kind:     Field
Field of: the preference record
Projects: deleted_at

#### Store Name

The identifier of the store instance; [Preference Id]s are unique within an instance. No action accepts it as a parameter, and no record stores it — instance selection and naming live at the deployment-routing layer (Store instance model).

Kind:     Field
Field of: the store instance
Projects: store_name

#### Declared Channels

The declared channel set injected at the seam for a record's [Set] invocation and stamped onto the record at creation — the record's own validation context (Invariants 5 and 10). Non-empty; immutable. What the deployment's channel declaration has done since never touches it.

Kind:     Field
Field of: the preference record
Projects: declared_channels

#### Undeclared Channel

The [Set] rejection when a supplied [Channel Preferences] key is not a member of the seam-injected declared channel set — a vocabulary error with its own remedy (fix the channel name, or take the declaration question to the deployment), distinct from a malformed call's [Invalid Request].

Kind:      Member
Member of: the Set rejection
Role:      Outcome
Projects:  undeclared-channel

#### Storage Failure

The rejection any state-changing action returns when the write fails after all preconditions pass. Fail-closed: nothing observable was written — for [Set] with supersession, neither half landed (Invariant 4); for [Suspend]/[Delete], no status moved.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  storage-failure

#### Active

The state of a record whose preferences are in force; it shapes any delivery the composing fanout attempts. At most one [Active]-or-[Suspended] record per principal (Invariant 3).

Kind:      Member
Member of: the preference status
Role:      Outcome

#### Suspended

The state of a record whose delivery the principal has paused; preference values are retained unchanged (Invariant 6), so resumption via a fresh [Set] needs no re-statement. Counts toward the at-most-one-currently-in-effect bound.

Kind:      Member
Member of: the preference status
Role:      Outcome

#### Deleted

The terminal state of a record no longer in effect — reached by supersession (a new [Set]) or explicit [Delete]. Retained as audit evidence and returned by [Read], but excluded from [Current For].

Kind:      Member
Member of: the preference status
Role:      Outcome

#### Invalid Request

The refusal [Set] returns when the request's shape fails — an empty [Principal Ref], or no preference field supplied (an empty [Channel Preferences] map does not count). A [Channel Preferences] key referencing an undeclared channel is not this refusal; it is [Undeclared Channel], its own class with its own remedy.

Kind:      Member
Member of: the Set rejection
Role:      Outcome
Projects:  invalid-request

#### Not Known

The refusal [Suspend] or [Delete] returns when the [Preference Id] references no record in the store.

Kind:      Member
Member of: the action rejection
Role:      Outcome
Projects:  not-known

#### Not Active

The refusal [Suspend] returns when the target is not [Active] — i.e., [Suspended] or [Deleted]. The single code covers both ([Suspended] never returns to [Active], Invariant 2); a caller distinguishes them via [Read].

Kind:      Member
Member of: the Suspend rejection
Role:      Outcome
Projects:  not-active

#### Already Deleted

The refusal [Delete] returns when the target is already [Deleted]. A [Suspended] record may still be deleted ([Suspended] → [Deleted]).

Kind:      Member
Member of: the Delete rejection
Role:      Outcome
Projects:  already-deleted

<!-- Term registry — shortcut-reference definitions. These produce no visible
     output; each resolves a [Term] marker to its card heading above (kramdown
     auto-generates the heading anchors on GitHub Pages). Standard CommonMark /
     kramdown; no plugin required. -->

[Set]: #set
[Suspend]: #suspend
[Delete]: #delete
[Current For]: #current-for
[Read]: #read
[Preference Id]: #preference-id
[Principal Ref]: #principal-ref
[Channel Preferences]: #channel-preferences
[Frequency Limit]: #frequency-limit
[Quiet Hours]: #quiet-hours
[Format]: #format
[Metadata]: #metadata
[Set At]: #set-at
[Status]: #status
[Suspended At]: #suspended-at
[Deleted At]: #deleted-at
[Store Name]: #store-name
[Declared Channels]: #declared-channels
[Undeclared Channel]: #undeclared-channel
[Storage Failure]: #storage-failure
[Active]: #active
[Suspended]: #suspended
[Deleted]: #deleted
[Invalid Request]: #invalid-request
[Not Known]: #not-known
[Not Active]: #not-active
[Already Deleted]: #already-deleted

---

## Composition notes

Message Preference is freestanding and is designed to compose with:

- **[Subscription](./subscription.md)** — the topic-interest concept that the composing fanout pattern consults to determine whether a given notification falls within a class the principal follows. Message Preference shapes delivery once Subscription has confirmed the principal follows the topic; the two atoms are sequenced peers in the fanout pipeline.
- **[Consent](./consent.md)** — the legal-permission concept that the composing fanout pattern consults to determine whether the system may communicate with the principal at all. Message Preference shapes delivery once Consent has confirmed legal permission; the two atoms are sequenced peers (Consent first, then Message Preference), not alternatives.
- **[Notification](./notification.md)** — the delivery-record concept. After a fanout pattern reads Message Preference and decides to deliver on a channel, it creates a Notification record on that channel. Message Preference is consulted; Notification is the result.
- **[Preference-Aware Notification Fanout](../compositions/preference-aware-notification-fanout.md)** — the composition that wires Subscription + Notification + Message Preference + Event Log into the end-to-end fanout pipeline that honors per-principal delivery shaping. The composition observes Suspended preferences as delivery-suppress, frequency limits and quiet hours as classified suppressions (marked held-for-retry or dropped per declared policy), and channel preferences as route-or-suppress — every suppression journaled with its reason and this atom's record id.
- **[Notification Fanout](../compositions/notification-fanout.md)** — the existing two-atom fanout composition. Preference-Aware Notification Fanout extends rather than replaces it; deployments that have not yet adopted preference shaping continue to use the base composition.
- **[Event Log](./event-log.md)** — records each preference action ([Set], [Suspend], [Delete]) as an auditable event for replay and investigation when in-record timestamps are insufficient (e.g., when a deployment needs to record the full sequence of suspend-cycles a principal performed, beyond the single [Suspended At] the record retains).
- **[Actor Identity](./actor-identity.md)** — records who initiated each preference action when attribution is required. [Preference Id] is the hook: a composing Actor Identity pattern records `attest(preference_id, acted_by_ref, credential)` at action time.
- **[Retention Window](./retention-window.md)** — the preference store must be retained for whatever regulatory or operational lifetime the deployment requires.
- **[Tamper Evidence](./tamper-evidence.md)** — in regulated contexts, the preference store is a target for after-the-fact manipulation (a record alleging the principal opted out could be rewritten to allege they opted in). Cryptographic commitment makes any rewrite detectable.
- **[Duplicate Prevention](./duplicate-prevention.md)** — for at-most-once semantics on [Set] under retry conditions, where a network-timeout retry should not produce a second supersession.

---

## Standards references

- **CAN-SPAM Act (15 U.S.C. §7701 et seq.)** — requires commercial email senders to honor unsubscribe requests within 10 business days and provide a working opt-out mechanism in every commercial message. The Message Preference atom's [Channel Preferences] with channel-level opt-out values, combined with the composing fanout pattern's enforcement, is the structural mechanism. The atom's immutability and durability guarantees produce the audit record CAN-SPAM enforcement requires.
- **Telephone Consumer Protection Act (TCPA, 47 U.S.C. §227)** — restricts automated and unsolicited calls and SMS, including frequency caps and time-of-day restrictions. The [Frequency Limit] and [Quiet Hours] fields, combined with the composing fanout pattern's enforcement, are the mechanism for honoring these requirements per principal.
- **GDPR Article 7(3)** — withdrawal of consent must be as easy as giving it. Article 7(3) is a *consent* obligation and belongs to the Consent atom, which governs the legal-permission axis. This atom satisfies an analogous *preference-update ease* principle: a principal who wants to change channel preferences, tighten frequency limits, or suspend delivery calls [Set] or [Suspend] — the same surface that established preferences originally. The ease-of-update claim here is scoped to preference shaping, not to consent withdrawal; the Consent atom carries the Article 7(3) obligation proper.
- **GDPR Article 21(2)** — right to object to processing for direct marketing purposes; objection must terminate marketing processing without delay. Full Article 21(2) compliance is a two-atom obligation: this atom records the delivery-preference signal of the objection — encoded as the deployment's per-channel "opt-out" value within [Channel Preferences] (the atom stores the value opaquely; the deployment's vocabulary fixes the encoding) — while the Consent atom must revoke the corresponding legal permission to process. A deployment that records an opt-out in Message Preference without also updating Consent has not fully discharged the Article 21 obligation. The Message Preference atom's contribution is the durable, immutable record of the principal's stated opt-out signal at the moment of objection; combined with the composing fanout pattern's enforcement (which interprets the deployment's opt-out encoding) and Consent's legal-permission revocation, the Article 21 obligation is satisfied.
- **ePrivacy Directive (2002/58/EC, as amended)** — consent and preference requirements for electronic communications in the EU. Cookie consent and marketing communication preferences fall under this directive's surface; the Message Preference atom's record is the artifact preferences-page UIs produce.
- **CASL (Canadian Anti-Spam Legislation)** — analogous to CAN-SPAM with stricter consent requirements; honoring per-principal channel preferences is the mechanism.
- **Daniel Jackson, *The Essence of Software*** — freestanding-atom posture; [Channel Preferences], [Frequency Limit], [Quiet Hours], and [Format] as opaque deployment-vocabulary fields.
- **Eiffel's design-by-contract** — preconditions on [Set], [Suspend], [Delete]; named rejection reasons.

---

## Status

`grounded on Final Critique 8 — 2026-08-26` — see the Ledger.

## Ledger

```
status: grounded on Final Critique 8 — 2026-08-26
formal: verified — message-preference.tla + 1 twin, 2026-06-03
last gate: 2026-08-26 — Final Critique 8, fresh reader — clean

open: none
```

## Decisions

Directional changes only — the turns a future reader must know the pattern took, and why. Everything smaller lives in the commit that made it: `git log -- atoms/message-preference.md`.
