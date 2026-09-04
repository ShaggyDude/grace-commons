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

---

<details markdown="block">
<summary>
    <h2 style="display: inline-block; margin-left: 1.5rem;">Lineage notes — SUPERSEDED by the Ledger and Decisions above; deleted with every other Lineage in the migration's closing commit</h2>
</summary>

This atom is the third entry in the `messaging/` category, drafted after Subscription, Notification, and Notification Fanout had grounded. The conceptual minefield — distinguishing Message Preference from Subscription and from Consent — was the load-bearing authoring challenge; the resolution lives in the Intent paragraphs and the Behavior bullets that name what this atom does not consult or evaluate. Lineage notes name Subscription and Consent by reference where defending the boundary; the specification body uses neutral language (*the topic-subscription concept*, *the legal-permission concept*) per the freestanding discipline.

Regulated-pattern conventions — *Regulated adversarial scenarios* and *Generation acceptance* — inherited from the methodology directly ([`pressure-testing.md`](../pressure-testing.md)), baked in from the first draft because the atom's standards-anchored examples invoke regulated marketing-communication domains (CAN-SPAM, TCPA, GDPR Article 21).

**Pass 1 — Structural completeness (GRID — the nine-node completeness framework: Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof).** Three findings, all closed in-pattern.

- *State node initially had only Active and Deleted, missing Suspended as a first-class state.* The early draft treated Suspended as a transient "Active-with-suppressed-delivery" — losing the load-bearing distinction from "Active-with-empty-channels". Fixed: Suspended elevated to first-class state with its own `suspended_at` timestamp, its own transitions in and out, and its own Decision-point treatment.

- *Decision points did not name what triggers `invalid-request` on `set` specifically.* The early draft said "invalid-request for malformed inputs" without enumerating the cases — empty principal_ref, empty preference field set, undeclared channel reference, undeclared per-channel-preference-value shape. Fixed: Decision point at `set` now enumerates the four cases that produce `invalid-request`.

- *Feedback section did not state falsifiable post-conditions for `set` and `suspend`.* The early draft listed observable changes but did not give the "after action, query X must return Y" form. Fixed: Feedback now names falsifiable post-conditions for each successful action.

**Pass 2 — Conceptual independence (EOS).** Five extraction candidates evaluated; four kept in-pattern, one resolved by changing the action surface.

- *Suspended state — extraction candidate.* Could "suspended" be its own atom (a delivery-suppression concept) composed with this atom? Evaluated: a delivery-suppression atom would need its own identity, its own lifecycle, its own actions — and would couple back to this atom via the suspension-target relationship. The suspension is *of this record*; it does not exist independently. Kept in-pattern as a first-class state of the preference record.

- *`frequency_limit` and `quiet_hours` — extraction candidates.* Rate-limiting and time-windowing recur across many domains (auth retry caps, API rate limits, scheduling windows). Could they be separate atoms? Evaluated: rate-limiting recurs as a class of concern, but the values stored here are deployment-vocabulary parameters with no state machine of their own and no lifecycle independent of the preference record. They are *values the record carries*, not concepts composed in. Kept in-pattern. Defended in-line in Behavior with the four-step rubric.

- *Channel set declaration — extraction candidate.* Could the declared channel set be a separate atom (a "Channel Registry")? Evaluated: the channel set is deployment configuration, not a state-bearing concept — channels are added or removed by deployment-level operations outside any atom's surface. Kept as a Store-instance-model concern, parallel to Consent's `store_name` discipline. A Channel Registry atom is not justified by present library evidence; if the need surfaces (channel governance becomes a domain in its own right), the extraction is straightforward.

- *Resume action — extraction candidate resolved as removal.* The early draft had a `resume(preference_id)` action that returned a Suspended record to Active. Evaluated: a resume action introduces mutability of `status` after the first transition, weakening Invariant 1's audit story (either a third lifecycle timestamp `resumed_at` would be needed, or `suspended_at` would be overwritten — both complications). The same operational outcome is achieved by `set` with the prior record's values (composing system reads suspended record, replays values), at the cost of one extra record in history. Resolved: `resume` removed from the action surface; the supersession-via-set path is the canonical resume mechanism. Defended in-line in Edge cases.

- *Per-topic preference overrides — extraction candidate.* A principal who wants different preferences per topic class (e.g., real-time push for security alerts, daily digest for newsletters) seems like a richer model. Evaluated: per-topic overrides could be implemented as separate preference instances per topic-class with the composing fanout pattern selecting the right instance — that is, the per-topic-ness is composition surface, not atom surface. Kept the atom as one-record-per-principal; named the per-topic concern in Edge cases as a composing-layer extension.

**Pass 3 — Adversarial scrutiny (Linus mode).** Seven foundation findings, all closed in-pattern.

- *Boundary with Subscription not defended in Behavior.* The Intent named the distinction but Behavior was silent on what Subscription does that this atom does not. A reader could plausibly read the atom as a superset that "knows about" subscriptions. Fixed: Behavior bullet added stating the atom does not consult or evaluate topic subscriptions; the composing fanout layer sequences subscription-evaluation alongside preference-reading.

- *Boundary with Consent not defended in Behavior.* Same defect class: Intent named the distinction but Behavior was silent. Fixed: Behavior bullet added stating the atom does not consult or evaluate legal permission; the composing layer sequences permission-evaluation before reading preferences. The atom's commitment is conditional.

- *Suspended-vs-empty-channels distinction not defended in Behavior.* The Intent named the distinction but a reader who skimmed to Behavior to find the operational rule could miss it. Fixed: Behavior bullet added carrying the four-step rubric defense — Suspended preserves preference values; empty channels does not; suspending is cheap to reverse and audit-distinct from preference-modification.

- *Updates-not-retroactive claim was implicit, not defended.* The Intent stated it but no Behavior bullet defended the model — a reader could plausibly believe the atom does push updates into in-flight work. Fixed: Behavior bullet added with the four-step rubric defense — the atom does not modify prior records on `set`; queue-time-capture is the expected fanout policy; the atom records sufficient timestamps for either queue-time or delivery-time policies.

- *Examples were happy-path-only initially.* Onboarding, vacation-suspend, account-closure were all valid happy-path-or-natural-flow examples; there was no explicit rejection-path example. Fixed: three rejection-path examples added (set with no preference fields, set with undeclared channel, suspend a Deleted record).

- *Atomicity and crash semantics absent.* Each transition changes two fields simultaneously; `set` with supersession changes two records. A partial write violates Invariant 1, 4, or 10. Personal Todo, Subscription, and Notification all name this explicitly. Fixed: Edge case added covering each action's atomicity boundary.

- *Regulated adversarial scenarios and generation acceptance missing from initial draft.* The standards-anchored examples invoke regulated marketing-communication domains (CAN-SPAM, TCPA); library rules require both sections for any pattern whose examples invoke regulated contexts. Fixed: both sections added, with three adversarial scenarios covering regulator audit (CAN-SPAM opt-out), disputed delivery (TCPA quiet hours), and breach investigation (store corruption).

**Refinement round 1 — eight additional findings, all closed in-pattern.**

- *Invariant 1 listed `metadata` and other optional fields without distinguishing "supplied" from "absent".* A reader could infer that an absent `metadata` field is a defect rather than a normal state. Fixed: Invariant 1 now distinguishes immutable fields from each-supplied-field; fields not supplied at `set` remain absent for the record's lifetime.

- *Invariant 6 (suspension preserves values) read as redundant with Invariant 1 (immutability).* Both said the preference fields don't change. Distinguished: Invariant 6 reframed as a transition-specific commitment — the `suspend` transition changes only `status` and `suspended_at`, no other field — which is structurally distinct from Invariant 1's general immutability claim. Invariant 6 carries the structural mechanism behind the cheap-resumption property.

- *`set` rejection priority unspecified for multi-condition failures.* When a `set` call violates multiple preconditions (empty principal_ref AND undeclared channel), the spec did not say which rejection wins. Fixed: Decision point at `set` notes that all four cases produce `invalid-request`; the implementation chooses which to report first in telemetry, but the rejection code is invariant — callers branch on the code, not the priority.

- *Consent boundary in Behavior did not say "does not override".* The original wording said the atom does not consult or check legal permission; it did not explicitly say it does not override. A reader could plausibly believe the atom's currently-in-effect record overrides legal permission. Fixed: Behavior bullet expanded to state the atom does not consult, re-check, or override legal permission; revocation of legal permission makes the preference record operationally irrelevant; the composing system is responsible for sequencing; a composing system that reads preferences without first re-checking permission has made a sequencing error.

- *GDPR Article 21 missing from Standards references.* Article 21(2) gives the data subject the right to object to direct marketing — the atom's channel-level opt-out is the structural mechanism. Initial draft cited only Article 7(3) for the "easy update" angle, missing the substantive Article 21 right. Fixed: Article 21(2) added to Standards references with a one-line description of how the atom's records and the composing fanout pattern's enforcement together satisfy the right.

- *Deletion-reason distinction (supersession vs. explicit) not named as out-of-scope.* The audit story relies on the distinction being recoverable from successor records, but this was not made explicit. A reader could believe the atom records a deletion reason directly. Fixed: Edge case added naming the distinction as recoverable-via-successor; deployments needing first-class deletion-reason recording compose with Actor Identity or Audit Trail.

- *Absent preference fields' meaning unclear in Behavior.* A record with `channel_preferences` supplied but `frequency_limit` absent: does that signal no-cap, or default-cap, or what? The early draft was silent. Fixed: Behavior bullet added stating absent fields signal no-preference (the composing fanout pattern applies its deployment default for the absent dimension); this is structurally distinct from an explicit opt-out value.

- *Initial Invariant 8 (Id stability) redundant with Invariant 1.* Invariant 1 already covered immutability of `preference_id`; the separate Invariant 8 added no distinct claim. Same defect class as Subscription's Pass 3 finding 1 ("Invariant 1 and 4 redundant"). Fixed: Invariant 8 removed; subsequent invariants renumbered. No-id-reuse (general claim, system-wide uniqueness) remains as the renumbered Invariant 8.

**Pass 1 / Pass 2 reruns after Refinement round 1: clean.** No new structural or extraction findings surfaced; the Pass 3 refinements were prose-and-precision tightenings that did not introduce new GRID nodes, new actions, or new concerns.

*Library-wide concerns surfaced but not resolved in this round* — recorded here for the next sweep:

- **The "currently-in-effect" concept vs. "Active" alone.** This atom introduces *currently-in-effect* as a derived state (`status ∈ {active, suspended}`) for the at-most-one rule. Subscription has a single Active state for the same purpose. The library may benefit from canonicalizing the term and its predicate form for use across atoms with multi-state currency rules; the canonical statement belongs in a shared document.

- **Channel-set-declared-at-instantiation as a recurring pattern.** Several atoms now have deployment-declared vocabulary at instance-creation time (Consent's `store_name`, Permissions' scope vocabulary, this atom's declared channels). A canonical convention for declaring, evolving, and auditing these vocabularies would reduce per-atom drift. Belongs in `pressure-testing.md` or `contributing.md`.

- **Conditional-atom-commitment framing.** Both Message Preference's Consent-and-Subscription boundary and Notification's "doesn't enforce who may call create" framing express the same structural posture: *the atom's contribution is conditional on the composing layer having done X before calling*. A canonical "conditional-commitment" framing in the methodology would let future atoms declare their conditional posture without re-deriving the defense in-pattern.

**Fresh-reader AI-conducted Phase 3 round — 2026-05-25 (claude-sonnet-4-6).** All three passes run with fresh-reader discipline (no prior-round findings provided before Pass 3). Pass 1 clean; Pass 2 clean. Pass 3 surfaced 10 findings: 2 foundational and 8 refining. All 10 closed in-pattern in the same session. Conventions inherited from the methodology directly.

- *F-P3-A — GDPR Article 7(3) citation scope — refining.* Standards reference attributed Article 7(3) (consent withdrawal) to this atom's `set` action. Article 7(3) is Consent's obligation; Message Preference's obligation is preference-update ease. Fixed: citation narrowed to the analogous preference-update ease principle; note added that Article 7(3) proper belongs to the Consent atom.

- *F-P3-B — GDPR Article 21(2) overstated — refining.* Standards reference described the atom's channel opt-out as "the mechanism for honoring an Article 21 objection," which implies sole sufficiency. Full Article 21 compliance also requires Consent to revoke legal permission. Fixed: reference rewritten to describe this atom's contribution as the durable opt-out-signal record, and to name Consent's legal-permission revocation as the parallel obligation.

- *F-P3-C — Behavioral inconsistency: late `delete` after successful `suspend` — foundational.* Behavior section's concurrent-calls paragraph stated that a late `delete` following a successful `suspend` returns `already-deleted`. Decision points specify that Suspended → Deleted is a valid transition returning `ok`. These directly contradicted each other. Fixed: concurrent-calls paragraph corrected to state that if `suspend` is serialized first (record → Suspended), the late `delete` returns `ok`.

- *F-P3-D — Supersession atomicity tolerance undefined — refining.* Generation acceptance check 4 used "within clock-precision" and "materially distinct" without definition. Fixed: check 4 now requires the deployment to declare its clock tolerance (e.g., transaction timestamp vs. wall-time-at-write, and the expected maximum gap); the declared tolerance is the reference bound for auditors.

- *F-P3-E — False disjunction in no-`resume` defense — refining.* Edge cases defense stated a resume action would "require a third lifecycle timestamp `resumed_at` and complicate the audit story *or* would overwrite `suspended_at` and violate immutability." The second horn was false — a `resume` action would add `resumed_at`, not overwrite `suspended_at`. Fixed: false horn removed; defense rewritten around the actual reasons: reverse status transition breaks Invariant 2's monotonicity, and repeated suspend/resume cycles on a single record complicate the audit trail.

- *F-P3-F — Channel-set history not guaranteed in store — foundational.* Generation acceptance check 5 required the auditor to verify channel-set membership "from the records alone," but the declared channel set was described as deployment configuration — not necessarily a store record. Fixed: Store instance model updated to commit to persisting the declared channel set as an instance configuration record in the store at creation time and on each update. Invariant 5 and Generation acceptance check 5 updated to reference the instance configuration record as the authoritative, store-resident source.

- *F-P3-G — `principal_ref` length cap unstated — refining.* Inputs section did not state a length cap for `principal_ref`. Fixed: explicit disclaimer added that no length cap is enforced by the atom and the deploying system is responsible for bounding `principal_ref` size.

- *F-P3-H — "Malformed" undefined for opaque identifiers — refining.* Decision points for `read` and `current_for` used "malformed" as a category for identifiers without defining what "malformed" means for opaque values. Fixed: "malformed" removed; language revised to describe the result as returning `not-known`/`none` for any value (empty or otherwise) that matches no record, with an explicit note that no format-validation step exists for opaque identifiers.

- *F-P3-I — Invariant 10 misclassified — refining.* Invariant 10's timestamp-ordering inequalities were labeled as invariants but acknowledged as best-effort under non-monotonic clocks — a property that can be violated under achievable deployment conditions is not an invariant under the methodology's definition. Fixed: relabeled "Temporal property 10" with a parenthetical distinguishing it from Invariants 1–9, which are unconditional.

- *F-P3-J — Deletion-reason recovery overstated — refining.* Edge cases claimed the supersession-vs-explicit-deletion distinction is "recoverable from the records" via successor-existence check. The check is only approximately discriminating — explicit-delete-then-recreate produces the same structure as supersession, distinguishable only by timestamp gap. Fixed: rewritten to describe the recovery as a timestamp-gap heuristic approximation, name the discriminating signal (gap relative to the deployment's declared clock tolerance), and distinguish from definitive recovery.

**Pass 1 / Pass 2 reruns after Phase 3 round: clean.** The F-P3-F fix (adding the instance configuration record to the Store instance model) introduces a new store artifact. Pass 1 re-check confirms: the new artifact is referenced in Invariant 5, Generation acceptance check 5, and the Store instance model; the reference graph is intact. No new concerns were introduced that Pass 2 would extract. No new GRID nodes were opened that Pass 3 would find.

**Opus clearance gate — Happy Torvalds X2 — 2026-05-25 (claude-opus-4-7, fresh-reader).** All three passes run with fresh-reader discipline (no prior-round findings provided before Pass 3). Pass 1 clean; Pass 2 clean. Pass 3 at X2 surfaced 13 findings: 3 foundational, 9 refining, 1 rhetorical. All 13 closed in-pattern in the same session. Conventions inherited from the methodology directly. The two foundational clusters were both side effects of the F-P3-F instance-configuration-record fix from the prior round — the new store artifact was added to the audit surface without a complete contract — plus a check-4 circularity inherited from F-P3-D. Status remains `partially resolved` pending the next Phase 4 round confirming the fixes hold.

- *F-P3-1 — Instance configuration record integrity invariants missing — foundational.* Invariant 5 and Generation acceptance check 5 treated the configuration record as the audit-surface source-of-truth but no invariant guaranteed its immutability or durability; a silent post-hoc rewrite would let an undeclared channel retroactively pass check 5. Fixed: new Invariant 10 added covering configuration record immutability and durability, paralleling Invariants 1 and 9 for preference records. Existing Temporal property 10 renumbered to Temporal property 11; the two prior cross-references (Atomicity edge case, CAN-SPAM scenario, plus Clock semantics edge case and Generation acceptance check 2) updated.

- *F-P3-2 — Configuration record write surface unspecified — foundational.* The atom's action surface did not include configuration-record creation; the audit story depended on configuration records existing in well-formed, ordered form with no specified write surface, atomicity, or rejection rules. Fixed: Store instance model expanded with the deployment-owned write contract (append-only, durable, bootstrap-ordered), Invariant 10 binds the first two obligations, Invariant 5 enforces the third indirectly via `set`-time membership; new Edge case bullet "Configuration record management is a deployment obligation" names the contract and the path to positive enforcement via Audit Trail / Actor Identity composition.

- *F-P3-3 — Generation acceptance check 4 qualifier was circular — foundational.* Check 4's "unaccounted for by explicit `delete` or `suspend`" qualifier depended on the same timestamp-gap heuristic the Edge case on deletion-reason recovery explicitly disclaimed as non-deterministic; a real supersession-atomicity violation (large gap from a non-atomic write) would be misattributed to explicit delete and excluded from the check. Fixed: check 4 rewritten to drop the qualifier and frame any out-of-tolerance gap as ambiguous-pending-external-evidence; deterministic discrimination between explicit-delete and atomicity-violation requires composition with Audit Trail or Actor Identity, named explicitly in the check.

- *F-P3-4 — `set` Decision point count mismatch — refining.* "All four rejection cases" claimed a count that did not match the three enumerated cases (empty `principal_ref`, no preference field supplied, undeclared channel key); the stale fourth case ("undeclared per-channel-preference-value shape") was eliminated by the opaque-value posture earlier in the section. Fixed: count corrected to three with the cases enumerated inline.

- *F-P3-5 — Required host serialization model unnamed — refining.* Invariants 3 and 4 depended on "host serialization guarantees" without naming the isolation level required; snapshot isolation could allow two concurrent `set` calls for the same principal to both observe no-currently-in-effect and commit, violating Invariant 3. Fixed: Atomicity edge case now names the minimum required model (linearizable writes per `principal_ref`, or a serializable transaction wrapping each operation) and the failure mode under weaker isolation.

- *F-P3-6 — Read-authorization posture silent — refining.* The capability-based authorization Behavior bullet covered writes (`set`, `suspend`, `delete`) but was silent on reads (`current_for`, `read`); composing systems handling privacy-sensitive preference data could not infer the read posture. Fixed: bullet renamed "Authorization is capability-based across writes and reads alike" and extended to state the read posture explicitly (same capability gating on `principal_ref` / `preference_id`, no role check, no per-action authorization).

- *F-P3-7 — Clock ownership ambiguous — refining.* Inputs section said "an implicit clock providing wall-time timestamps" without saying whether the clock was atom-owned or caller-provided; caller-provided timestamps would allow lying and break the clock-tolerance disclosure mechanism's auditability. Fixed: Inputs section now states timestamps are atom-owned (`set_at`, `suspended_at`, `deleted_at` read from the atom's clock at write time, never caller-supplied), binding the audit story to a single clock the deployment can characterize.

- *F-P3-8 — Length-cap disclaimer asymmetric across opaque inputs — refining.* Inputs section disclaimed length-cap responsibility for `principal_ref` only; per-channel preference values, `frequency_limit`, `quiet_hours`, `format`, and `metadata` carry the same unbounded-size risk with the same delegation-to-deployer answer. Fixed: disclaimer moved into a single "Opaque-input bounds" paragraph covering all opaque inputs and stating the cap (or the choice to leave it unbounded) is deployment policy disclosed alongside fanout-on-no-record and clock-tolerance.

- *F-P3-9 — Terminology drift in regulator-audit scenario — refining.* The CAN-SPAM scenario said "`pref_201` Active with `email: "preferred"` from `2025-08-01` to `2026-03-14`," but `active` is a status state that does not span time intervals; "currently-in-effect" is the temporal predicate the spec uses elsewhere. Fixed: scenario rewritten using "currently-in-effect from X to Y" with the corresponding `set_at` and `deleted_at` values made explicit. The library-wide currently-in-effect-vs-Active concern flagged earlier in Lineage applies here directly; the per-atom fix lands the discipline locally pending the canonical convention.

- *F-P3-10 — `delete` action vs. "deleted from the store" terminology overload — rhetorical.* The Behavior durability bullet used "deleted" in the sense of "removed," distinct from the `delete` action / Deleted state used everywhere else. Fixed: bullet rewritten as "No preference record is removed from the store" with a clarifying sentence that the `delete` action moves a record into the Deleted state without removing it from storage.

- *F-P3-11 — Reconstruction boundary convention unstated — refining.* Generation acceptance check 2's formula used `deleted_at > t` (half-open interval excluding the deletion instant) without naming the convention; an auditor evaluating `t == deleted_at` exactly could compute a different answer than expected. Fixed: half-open interval `[set_at, deleted_at)` convention noted adjacent to the formula, with the supersession-boundary case explained (`t == deleted_at == successor.set_at` makes the successor currently-in-effect).

- *F-P3-12 — Breach-scenario "cannot have been altered" overclaim before the qualifier — refining.* The breach scenario asserted "any record created before the breach window cannot have been altered (immutability holds spec-level)" several sentences before the Tamper Evidence qualifier landed; the initial sentence risked reading as a stronger claim than the spec actually supports. Fixed: claim softened to "*should not* have been altered" and the Tamper Evidence qualifier brought adjacent, with the records-alone forensic reconstruction (which records existed when, which transitioned within the window) named separately from the cryptographic-integrity claim.

- *F-P3-13 — Article 21 standards reference assumed a fixed opt-out vocabulary — refining.* The reference described "a per-channel opt-out value in `channel_preferences`" but per-channel preference values are opaque deployment vocabulary throughout the spec; the atom does not define an "opt-out" sentinel. Fixed: reference rewritten to acknowledge the encoding dependency (the deployment's vocabulary fixes the encoding; the atom stores the value opaquely) and to credit the composing fanout pattern with interpreting the encoding at delivery time.

**Pass 1 / Pass 2 reruns after Phase 4 round.** Pass 1: the new Invariant 10 is referenced from the Store instance model, the new "Configuration record management is a deployment obligation" Edge case, the rewritten Generation acceptance check 4, and the new Phase 4 Lineage entry; Temporal property 11 (formerly Invariant 10) cross-references updated in the Atomicity edge case, the Clock semantics edge case, the CAN-SPAM scenario, and Generation acceptance check 2. Reference graph intact; no orphaned references. Pass 2: the configuration-record contract clarifications keep the artifact in-pattern (no new extraction candidate surfaces) and the host-serialization disclosure stays in-pattern (the atom is the immediate consumer of the guarantee); the library-wide concerns already flagged (currently-in-effect canonicalization, channel-set-declared-at-instantiation, conditional-atom-commitment) are reinforced rather than newly opened. Both reruns clean.

*Library-wide concerns reinforced by this round* — recorded here for the next sweep:

- **Configuration-record-shaped store artifacts as a recurring pattern.** This round's fix (Invariant 10 + the deployment-write contract) is the second instance of the same shape — the first was Consent's `store_name` discipline, and Permissions' scope vocabulary is the same shape under a different name. A canonical "deployment-owned store-resident vocabulary record" convention would foreclose per-atom drift in how integrity invariants are stated and how the deployment's write contract is named. Belongs in `pressure-testing.md`'s methodology section or `spec-format.md`'s atom-shape extras.

- **Host serialization disclosure as a recurring obligation.** This round added explicit serialization-model naming to the Atomicity edge case. Several atoms (Subscription, Notification, Personal Todo) defer concurrency to "host serialization guarantees" without naming the required model. A canonical disclosure convention — name the minimum isolation level required; name the failure mode under weaker isolation — would let composing patterns reason about cross-atom composition under shared host guarantees. Belongs in `pressure-testing.md`.

*Deferred work — formal models.* Phase 4 X2 review flagged this atom as a strong candidate for formal-model siblings (per `pressure-testing.md` §Formal models). The highest-value artifact is a TLA+ model of supersession atomicity (Invariant 4) under interleaved concurrent operations, which would verify the new linearizable-per-`principal_ref` requirement and either confirm or refute the check-4 indistinguishability claim (atomic supersession vs. explicit-delete-then-reset). The natural second artifact is an Alloy model of the records relation (preference records + configuration records, wired through Invariants 5 and 10 plus bootstrap-ordering), following the Attributed Permissions Admin pattern (static structural + dynamic Alloy 6 LTL (Linear Temporal Logic)). Deferred past the grant deadline; pick up after the deadline window closes.

**Final Critique 5 — fresh-reader Phase 3 + Opus Happy Torvalds X2 clearance gate — 2026-05-29.** Two fresh-reader reviews run in parallel with genuinely different priors, each given the spec body only (Intent through Standards references; Status and Lineage withheld to preserve fresh-reader discipline) plus the full pass question sets: a Phase 3 round (claude-sonnet, all three passes) and the Opus Happy Torvalds X2 clearance gate (claude-opus). Pass 1 clean and Pass 2 clean on both reviewers. The Opus gate returned **GATE CLEAN FOR GROUNDING — zero foundational findings** (the grounding-determinative result under the 92%-good threshold); the sonnet Phase 3 surfaced 12 findings (1 GRID, 1 EOS, 8 Linus, 2 regulated-check), which on adjudication against the contradiction-not-preference test and the foundational/refining/rhetorical taxonomy were all refining or rhetorical and heavily overlapped the Opus set. Consolidated across both reviewers: 17 refining, 1 rhetorical, 0 foundational — all closed in-pattern in the same session. The gate explicitly confirmed the spec anticipated its hardest adversarial reads (whitespace `principal_ref` disclaimed-by-design; enumeration-by-principal resolved by the audit-surface/action-surface split; bootstrap-ordering enforced indirectly via Invariant 5; the breach scenario's cryptographic limit honestly routed to Tamper Evidence). Conventions inherited from the methodology directly. This is the clean Final Critique rerun the prior `partially resolved` Status was pending; the atom grounds on Final Critique 5.

- *F-Final Critique 5 — Generation acceptance checks unnumbered — refining.* Cross-references ("check 2", "check 4", "check 5", "check 6") relied on the reader counting bullets. Fixed: the six checks are now explicitly numbered Check 1–Check 6.

- *F-Final Critique 5 — Invariant 4 asserted a timestamp equality unconditionally — refining.* Invariant 4 (a hard, unconditional invariant) carried "the prior record's `deleted_at` equals (or is within clock-precision of) the new record's `set_at`," a timestamp claim that can be violated under non-monotonic clocks. Fixed: the timestamp clause relocated to Temporal property 11 (best-effort); Invariant 4 now asserts only the atomic co-occurrence of the two state changes.

- *F-Final Critique 5 — Cross-record temporal ordering not surfaced in Temporal property 11 — refining.* The supersession-pair ordering (`R_prior.deleted_at ≈ R_next.set_at`) lived only inside Invariant 4, splitting the temporal model across two sections. Fixed: added to Temporal property 11 as the cross-record counterpart, unifying the model in one place (cross-referencing Check 4's clock tolerance).

- *F-Final Critique 5 — `principal_ref` equality/normalization unstated — refining.* The spec said the atom does not normalize `principal_ref` but never stated equality semantics, on which Invariant 3 depends. Fixed: Inputs now states equality is exact with no normalization, and the deployment must canonicalize values before passing them or two references for the same principal will be treated as distinct.

- *F-Final Critique 5 — Empty `channel_preferences` map unaddressed by the at-least-one rule — refining.* `set` requires at least one preference field, but whether an empty `channel_preferences` map (`{}`) counts as "supplied" was undefined. Fixed: `set` Decision point now treats `{}` as not-supplied; a `set` whose only field is an empty map is `invalid-request`.

- *F-Final Critique 5 — `metadata` not flagged as excluded from the at-least-one rule in the Inputs list — refining.* A generator reading the Inputs list in isolation could treat a `metadata`-only `set` as valid. Fixed: the `metadata` Input bullet now states it does not by itself satisfy the at-least-one-preference-field requirement.

- *F-Final Critique 5 — Clock framing not Logic-Confinement-explicit — refining.* The "atom-owned clock, read at write time" framing (from prior finding F-P3-7) read as an internal clock read, in tension with the Logic Confinement Principle's inject-don't-read rule. Fixed: Inputs clock bullet now frames the clock as host-injected at the atom's single I/O seam — received by the pure core, not read internally, not caller-supplied — reconciling the audit-soundness goal with logic confinement.

- *F-Final Critique 5 — `current_for` linearizability vs concurrent `set` unstated — refining.* The concurrency treatment covered concurrent writes but not a `current_for` read concurrent with a `set`. Fixed: concurrent-calls Behavior bullet now states `current_for` observes the serialization order (prior or new record, never torn) and that a just-superseded read is acceptable under the queue-time-capture fanout policy.

- *F-Final Critique 5 — Serialization domain ambiguous (id-keyed vs principal-keyed) — refining.* `suspend`/`delete` take a `preference_id` while `set` takes a `principal_ref`; the required serialization domain was stated only "per `principal_ref`," leaving the cross-action case implicit. Fixed: Atomicity edge case now states the serialization domain is the principal — all operations touching any record of a given principal serialize against one another.

- *F-Final Critique 5 — Crash-recovery conformance unstated — refining.* The spec said recovery semantics are undefined without saying whether a post-crash standing invariant violation is conformant. Fixed: Atomicity edge case now states atomicity under normal operation is a conformance requirement and the post-recovery store must not exhibit a standing Invariant 3/4 violation, while post-crash reconciliation mechanics remain the implementor's concern.

- *F-Final Critique 5 — Invariant 10 atom-enforced vs deployment-contract not distinguished — refining.* Invariant 10 asserted configuration-record integrity but the atom's action surface does not write configuration records. Fixed: Invariant 10 now states it is a deployment-contract property — asserted as required of any conformant store, not runtime-enforced by the atom (unlike Invariants 1–9) — with positive enforcement via Audit Trail / Actor Identity composition.

- *F-Final Critique 5 — `suspend` `not-active` conflates Suspended and Deleted — refining.* A caller receiving `not-active` could not tell whether the record was Suspended or Deleted. Fixed: Decision point now notes the single code covers both states (a Suspended record never returns to Active) and that callers disambiguate via `read`.

- *F-Final Critique 5 — Bootstrap-ordering had no acceptance check — refining.* The deployment's bootstrap-ordering obligation is auditable from the store but no Generation acceptance check named it. Fixed: Check 5 now notes that confirming channel-set membership for every record also confirms bootstrap-ordering (no preference record predates all configuration records).

- *F-Final Critique 5 — Disputed-delivery scenario presumed the in-effect `preference_id` — refining.* The TCPA scenario jumped to `read(pref_id_at_time_of_delivery)` as if the id were known, skipping the reconstruction step. Fixed: the scenario now reconstructs the in-effect record via Check 2 (enumerate by principal, max `set_at ≤ t`) before calling `read`.

- *F-Final Critique 5 — Account-closure DSAR implied a chain of `read` calls with ids from nowhere — refining.* The example described querying each `preference_id` via `read` without saying where the id list came from. Fixed: reframed as an audit-surface enumeration filtering the store on `principal_ref` (Check 1), with `read`'s per-id content noted as equivalent.

- *F-Final Critique 5 — Examples framed as "three domains" but trace one principal — refining.* The intro said "the same atom, three domains" while the three lifecycle scenarios actually chain one principal's records (`pref_001 → pref_088 → pref_141`). Fixed: intro reframed as one principal's lifecycle across operational contexts; rejection-path and regulated scenarios noted as using their own ids.

- *F-Final Critique 5 — Missing `delete(already-deleted)` rejection example — refining.* The `already-deleted` rejection had no worked example though the other rejections did. Fixed: added a `delete(pref_141) → rejected(already-deleted)` example, contrasted with the valid Suspended → Deleted `delete`.

- *F-Final Critique 5 — "The atom records the transition order" overclaim — rhetorical.* Order is witnessed by timestamps, which Temporal property 11 declares best-effort; "records the transition order" overstated the artifact. Fixed: softened to "the host serializes the transitions; the recorded timestamps witness that order subject to Temporal property 11's clock caveat."

*Adjudicated, not actioned this round.* The sonnet review's RC-2 (Generation acceptance Check 4 depends on an externally-disclosed clock tolerance not resident in the store) was considered and classified refining-deferred rather than closed: the clock tolerance is already named as a required deployment disclosure grouped with the fanout-on-no-record disclosure, so Check 4 is records-plus-one-disclosure rather than fully records-internal. Promoting the clock-tolerance value into the instance configuration record (making Check 4 self-contained) is a worthwhile enhancement but touches the configuration-record schema, Invariant 10, and the Store instance model; it is deferred to a future round rather than folded into the grounding round, since the Opus gate found Check 4 adequate and non-circular as written.

**Pass 1 / Pass 2 reruns after Final Critique 5.** Pass 1: the new Check numbering, the Temporal-property-11 cross-record clause, the relocated Invariant 4 clause, the deployment-contract clause on Invariant 10, and the new `delete(already-deleted)` example are all referenced and resolved against the reference graph; no orphaned references introduced. Pass 2: every fix sharpened existing content or tightened a disclosure boundary; no new concern was opened that would extract to a separate atom, and the configuration-record and host-serialization clarifications keep their concerns in-pattern (the atom remains the immediate consumer of both). Both reruns clean. Library-wide concerns previously flagged (currently-in-effect canonicalization; deployment-owned store-resident vocabulary records; host-serialization-disclosure convention) are reinforced, not newly opened.

**Formal-layer vote — 2026-06-03: YES (model pending).** Invariant 4 (supersession atomicity — prior record's Deleted transition and new record's creation are one operation; no observer sees two in-effect) is a concurrency/ordering claim; Invariant 3 at-most-one-in-effect. Load-bearing temporal/ordering/safety claims a derived formal model would verify; none exists yet, so the pattern is downgraded to `grounded (English) — formal layer pending` until the model is authored and verifies (findings flow back into this English spec per the conflict protocol). Vote per [`pressure-testing.md`](../pressure-testing.md) §Formal models — The formal-layer vote.

**Formal model — 2026-06-03: TLA+ authored and verified; pattern promoted to `grounded`.** Derived model [`message-preference.tla`](./message-preference.tla) + config [`message-preference.cfg`](./message-preference.cfg), checked by `tla-checker` via `tools/harness/check.mjs`. *What it checks:* one principal with up to `MaxP = 3` record slots {unused, Active, Suspended, Deleted}; the load-bearing **Invariant 3** (at most one currently-in-effect — Active or Suspended — record per principal) under every interleaving of `set` (fresh and superseding), `suspend`, and `delete`. The correct supersession transitions the prior in-effect record to Deleted and creates the new Active record in one atomic step. Exhaustive: 32 states, holds. *Buggy twin* [`message-preference-buggy.tla`](./message-preference-buggy.tla) splits supersession so the new Active record is created before the prior is retired — the two-in-effect window Invariant 4 (supersession atomicity) forbids; rejected at 5 states. The twin mechanizes why supersession must be atomic: a non-atomic `set` reachably shows two in-effect records, breaking `current_for`'s determinism. *Out of model scope:* id immutability/no-reuse, field retention, timestamp ordering (structural/clock). *Conflict-protocol outcome:* none — the model **corroborates** the English; canonical English unchanged.

**Forthcoming-link resolution — 2026-06-12 (cross-file fix, recorded per workflow step 5).** The Composition notes' Preference-Aware Notification Fanout entry resolved from forthcoming to a live link when the composition landed; the entry's delivery-shaping summary updated to the composition's landed vocabulary (classified suppressions marked held-for-retry or dropped per declared policy; every suppression journaled with reason and this atom's record id). Cross-reference fix only; no invariant, action, or example content touched.

**Prose-simplification pass — 2026-06-26 (second live exercise of `working-ideas/prose.md`).** A density-not-depth pass — the discipline's second sample after Preference-Aware Notification Fanout, chosen to test the cuts on a *different shape*: an atom and a state machine, not a composition and a precedence gate. The State section's `Transitions:` prose list became a transition table (action · from · to · stamps · result · rejections), with three semantics kept as prose beside it — supersession atomicity (Invariant 4), rejections-leave-state-untouched (and the `not-active` Suspended/Deleted conflation, Invariant 2), and queries-never-transition (`current_for` excludes Deleted; `read` returns Deleted in full). Cut #1 split the two densest prose spots: the Behavior *Concurrent calls* wall (into per-case bullets) and an Intent four-clause sentence. Expression only — every transition rule, rejection, timestamp, all ten invariants, Temporal property 11, the Decision points, and the Generation-acceptance checks are unchanged in force; acronyms were already whitelist-clean (HTML/SMS unglossed; EOS/CAN-SPAM/TCPA/GDPR/HIPAA correctly spelled out). **Re-verified, not re-grounded:** a prose render change is not a fresh critique round, so the Status token stands at Final Critique 5. Depth-survival gates: the diff read line-by-line against the same-claim-or-weaker test; the linter clean (0 findings); the TLA+ model and its buggy twin untouched and still PASS / correctly-rejected; and an adversarial fresh reader, given only the rewritten state/transition text plus the invariant list, found Invariants 1–10 and Temporal property 11 each still supported by the new table — the conversion's three highest-risk losses (Invariant 4 atomicity, Invariant 2 no-revival, Invariant 9 delete-as-state) each explicitly rescued in the edge-prose. Second of the two live samples `working-ideas/prose.md`'s promotion gate calls for: with a composition + gate and now an atom + state-machine both holding, the discipline has cleared a structurally diverse pair.

**Summary/blockquote merge + Lineage collapse — 2026-06-26 (piloted spec-format deviations, mirroring Preference-Aware Notification Fanout).** Two structural pilots, applied so this atom carries the same *shape* fanout pilots — not just the same prose cuts — making it the shape experiment's second sample. (1) *Summary/blockquote merge:* the title blockquote and the `## Summary` section were merged into one plain-language `## Summary` at the top, ahead of Intent — a deliberate deviation from [`spec-format.md`](../spec-format.md)'s required-section order (blockquote → Intent → Summary), pending a corpus-wide decision. The two were redundant at the Summary's mandated length; the merged section keeps the jargon-free Tier-1 register (the library's bridge to non-engineers). No unique content was lost — the blockquote's lower-level precision (the opaque immutable id; the create-time-immutable principal reference and preference values) already lives in Structure and the immutability invariants, where that register belongs. (2) *Lineage collapse:* these notes are now wrapped in a `<details markdown="block">` element with an `<h2>` summary, folding the dated history away by default to keep the spec body light — matching fanout. If ratified, both belong in `spec-format.md` (§Required sections for the merge; a rendering convention for the collapse) and roll to the other patterns. Shape-only: no invariant, action, example, or guarantee touched; Status stands at Final Critique 5.

**Logic Confinement clock-injection touch + Final Critique 6 — 2026-08-24.** Load-bearing touch: the atom's *Clock semantics* edge case still declared wall-time from an *implicit clock*, inconsistent with its own already-seam-framed Inputs bullet and with [`execution-contract.md`](../execution-contract.md) §Logic Confinement rule 3 and with Retention Window's own Final Critique 5 treatment (2026-06-23). Changes: *Clock semantics* rewritten to seam injection; a *Logic confinement (clock and id)* note added to Decision points; the id clause added (the Inputs bullet was already seam-framed from this atom's own Final Critique 5 and was left as written). **Caller signatures are UNCHANGED** (the seam, not a parameter, is the contract for clock entry), so the change is additive with no constituent-change cascade. Gates: linter 0 findings; harness re-run green — `message-preference.tla` PASS at 32 states, `message-preference-buggy.tla --buggy` rejected at 5 states; the clock is out of model scope, so the formal-layer vote is unchanged.

*Final Critique 6 — closing fresh-reader round (Opus, Happy-Torvalds-X2, fresh-reader throughout; Lineage withheld from the reviewer until findings were formed). Verdict: **not clean — three foundational findings**; atom downgraded to `partially resolved` pending closure.* The clock work itself cleared the round. Findings recorded as surfaced, open at the time — **all closed 2026-08-25, see the closure entry below**:

- *M-F1 — no write-failure rejection exists anywhere in the atom — foundational →* The projected contracts read `rejected(reason)` without enumeration and the complete vocabulary is {`invalid-request`, `not-known`, `not-active`, `already-deleted`} — there is no `storage-failure`, so the pipeline's Step 3 write failure has no named outcome even though the atomicity edge case reasons about partial writes and Invariant 9 asserts durability. Enumerate the reasons in the signatures and add the failure token.
- *M-F2 — Invariant 5 rests on two unrelated clocks with unstated provenance — foundational →* It resolves the authoritative channel set as the config record with maximum `declared_at` ≤ the preference's [Set At], but [Set At] is seam-stamped while `declared_at` is stamped by provisioning tooling outside the action surface, and Temporal property 11 declares ordering best-effort. State `declared_at`'s provenance and either sequence-order config records or restate Invariant 5 conditionally.
- *M-F3 — the declared-channel registry is absorbed — foundational →* The atom persists instance configuration records and pins Invariant 10 on them, then concedes it cannot enforce or detect violations from its own records — host truth hiding inside the atom. Apply Retention Window's move: take an opaque channel-set reference and have the host resolve it to the declared set at the seam.
- *Refining/rhetorical (open at the time; all closed 2026-08-25 — see the closure entry below):* M-F4 "Invariants 1–10 hold unconditionally" contradicted three ways; M-F5 Invariant 9 and check 1 unconditional against a composed purge; M-F6 undeclared-channel collapsed into `invalid-request`; M-F7 stored form of an empty channel-preferences map unspecified; M-F8 "Temporal property 11" occupies slot 11 of the invariant numbering; M-F9 no rejection-priority ordering stated; M-F10 edge cases name composing patterns without links; M-F11 undefined acronyms; M-F12 Summary says resuming is "one step away" though no `resume` action exists.

**Final Critique 6 findings closure — 2026-08-25 (all three foundational + nine refining/rhetorical folded; gated by Final Critique 7 below).** Implementation pass closing every open Final Critique 6 finding. **Caller signatures are UNCHANGED in their argument lists**; the rejection taxonomy gains two additive tokens — [Storage Failure] (M-F1) and [Undeclared Channel] (M-F6) — now enumerated in the three state-changing projected contracts in place of the bare `rejected(reason)`. *Compositions affected (additive — no cascade downgrade, flagged for the next touch of each):* Preference-Aware Notification Fanout, which relays this atom's rejections. The structural move (M-F3, resolving M-F2 with it): **the declared-channel registry leaves the atom** — Retention Window's host-resolution discipline applied as the finding prescribed. The deployment holds the channel declaration; the host resolves and injects the declared set at the seam per [Set] invocation (beside the clock and the id); the transition validates against the injected set and **stamps it onto the record as [Declared Channels]**. Invariant 5 is now per-record and self-contained (keys ⊆ the record's own stamp — one record, no cross-record join, no second clock, dissolving M-F2's two-clock provenance problem); Invariant 10 is restated as validation-context self-containment (the config-record integrity contract it used to assert is gone with the config records themselves); the Store instance model, the channel-governance edge case, and Generation-acceptance check 5 are rewritten to the seam-injection form, with channel-set governance (who/when/audit) honestly the deployment configuration surface's, composable with Audit Trail where regulators require it. One line each for the rest: M-F1 → [Storage Failure] enumerated on [Set]/[Suspend]/[Delete] with fail-closed semantics stated per action (neither supersession half observable on a failed [Set], per Invariant 4) and carded; the two queries stay storage-arm-free (pure reads); M-F4 → the unconditional-invariants sentence restated over the atom's accepted actions, named host obligations, and own surface; M-F5 → Invariant 9 scoped to this atom's surface with composed lawful disposal named out of scope; M-F6 → [Undeclared Channel] split out of [Invalid Request] with the differing-remedy rationale, carded, and the rejection example updated; M-F7 → a supplied-but-empty [Channel Preferences] map is stored as absent (absence is the one stored form; readers branch on presence); M-F8 → the best-effort ordering property relabeled *Temporal property — Timestamp ordering*, deliberately outside the 1–10 hard-invariant numbering, with every live cross-reference updated; M-F9 → per-action rejection priority declared (shape → vocabulary → storage; existence → state → storage); M-F10 → edge-case pattern references linked; M-F11 → SaaS glossed (the remaining acronyms were already glossed at first use); M-F12 → the Summary's "one step away" claim restated as a fresh `set` replaying the suspended record's values, with the absence of a resume action explicit. *Model impact:* `message-preference.tla` and its buggy twin untouched — the model checks supersession atomicity over the preference records; the channel-set redesign moves host configuration outside the modeled state and the new rejection tokens are outside model scope; harness re-run green; the formal-layer vote is unchanged.

**Final Critique 7 — 2026-08-25: not clean (2 foundational; ROUTED, not folded — closure round ends here).** The closing fresh-reader gate over the Final Critique 6 closure (AI-conducted, claude-fable-5, Happy-Torvalds-X2, fresh-reader discipline throughout — pass question sets and the spec body only; no Lineage, no prior findings). All three Final Critique 6 foundational closures held, the channel-set redesign included; the gate surfaced **two new foundational findings** — one born in the redesign's own seam-injection structure — plus eight refining and one rhetorical. Per the stop rule set before the round (one fix pass, one gate, then ground or route), all are recorded as **open routed findings**; the atom holds at `partially resolved` until they close and a round returns zero foundational. The human triager owns the sequencing. The two foundational:

- *FC7-F1 — degenerate injected channel set undecidable — foundational (OPEN) →* nothing obliges the host-injected declared channel set to be non-empty or well-formed, so a [Set] validated against an empty injected set has no defined outcome — every supplied channel key is undeclared by construction, and Invariants 5 and 10 quantify over a [Declared Channels] stamp that can be vacuous. Fix: name non-empty/well-formed injection as a host obligation conditioning Invariants 5 and 10, or declare a [Set]-time rejection arm for a degenerate injected set.
- *FC7-F2 — NTP and SMTP unglossed — foundational (OPEN) →* both initialisms appear without first-use glosses. Fix: gloss each at first use.

*Refining/rhetorical (open, from Final Critique 7):* the [Invalid Request] card still lists the undeclared-channel case the M-F6 split moved out; the Feedback roster omits the two new rejection tokens; the Summary's cheap-resumption claim overstated modulo channel-set evolution (a replayed `set` can fail against a since-shrunk declared set); the "Channel set evolution" edge case retains pre-redesign phrasing; "named at instance creation" survives where the channel set is now injected per invocation; Generation-acceptance check 3 lacks the clock caveat its reconstruction claim needs; the Summary's "nothing is ever erased" overstates Invariant 9's own-surface scope; the Terms registry's Role/parent lines drifted from the M-F3 redesign. Rhetorical — the doubled "(Timestamp ordering) (timestamp ordering)" parenthetical (a sweep artifact, fixed as an editorial touch in this same commit per [`pressure-testing.md`](../pressure-testing.md) §Editorial touches).

**Final Critique 7 findings closure — 2026-08-26 (both foundational + eight refining folded; gated by Final Critique 8 below).** Implementation pass closing every routed Final Critique 7 finding, per the re-grounding campaign (atoms first). **Caller signatures and the rejection vocabulary are UNCHANGED.** One line each, foundational first: FC7-F1 → the seam injection now carries a **hard host obligation** — the injected declared channel set must be non-empty and well-formed (distinct, non-empty, non-whitespace channel names) — stated in the Store instance model with Invariants 5 and 10 conditioned on it, and the degenerate case given a defined outcome: a [Set] arriving with a degenerate injected set is a deployment configuration fault and **fail-stop** — it does not proceed to validation (every key would be undeclared by construction, misreporting a host fault as a caller error), yields no conforming caller-vocabulary outcome, writes nothing, and surfaces at the deployment's alerting (the [Set] decision point cross-references the obligation); FC7-F2 → SMTP glossed at its Transport-mechanism first use, NTP at its Clock-semantics first use. Refining: the [Invalid Request] card no longer lists the undeclared-channel case — it names [Undeclared Channel] as its own class, matching the M-F6 split; the Feedback rejection roster completed with [Undeclared Channel] and [Storage Failure] on their actions; the Summary's cheap-resumption claim qualified (the replay re-validates against the set declared at the later moment; a since-removed channel key must be dropped) with the same caveat added to Invariant 6's cheap-resumption sentence; the *Channel set evolution* edge case rewritten to the seam-injection form (per-record stamps keep historical records verifiable forever; the change is visible only forward; a resumption replay carrying a removed key meets [Undeclared Channel]); the three surviving "at instance creation" phrasings replaced with per-invocation injection (the Channels-are-deployment-declared Behavior bullet, the Examples preamble, the undeclared-channel rejection example); Generation-acceptance check 3 given the clock caveat its window arithmetic needs (stored-timestamp exactness per Invariants 1 and 4; apparent overlaps resolved against the check-4 clock tolerance before being recorded as Invariant 3 violations); the Summary's "nothing is ever erased" scoped to the atom's own surface with composed retention disposal acknowledged (matching Invariant 9); the Terms registry drift from the M-F3 redesign corrected — [Undeclared Channel] and [Storage Failure] re-carded `Role: Outcome` (registry convention; they carried a drifted `Role: Rejection`), [Undeclared Channel]'s parent capitalized to "the Set rejection", and the [Channel Preferences] card's "the instance's declared channel set" replaced with the record's own [Declared Channels] stamp. Rhetorical: none remained (the doubled Timestamp-ordering parenthetical was fixed as an editorial touch in the routing commit). *Model impact:* `message-preference.tla` and its buggy twin untouched — the host obligation, fail-stop discipline, glosses, and registry corrections are outside the modeled supersession state; the formal-layer vote is unchanged.

**Final Critique 8 — 2026-08-26: CLEAN (0 foundational); atom re-grounded.** The closing fresh-reader gate over the Final Critique 7 findings closure (AI-conducted, claude-fable-5, fresh-reader discipline throughout — pass question sets and the spec body only; no Lineage, no prior findings; an atom, so no constituent files). Both Final Critique 7 foundational closures held, the injection host obligation included. The round returned **zero foundational**, nine refining, and four rhetorical findings; per the campaign stop rule (one fix pass, one gate, ground on clean or route), the atom re-grounds at `grounded on Final Critique 8 — 2026-08-26`, and the residue is recorded here as open routed findings — non-blocking under the 92%-good threshold (foundational at zero). *Refining (routed, open):* the temporal apparatus disagrees with itself on supersession-stamp equality — Decision points stamp both supersession halves from one reading (exact equality, tolerance 0) while the Temporal property and check 4 treat the pair as approximately equal within a possibly nonzero tolerance, and check 2 cites Invariant 4 for a timestamp claim Invariant 4 expressly defers; channel-key membership equality never pinned (exact-match is inferable from the [Principal Ref] rule but unstated for channel names); the read path ([Current For]/[Read]) has no defined behavior for a store that cannot be read — no failure arm, no fail-stop statement, no non-goal; degenerate id injection is asymmetric with the channel-set obligation (no stated host obligation or fail-stop for a colliding/empty injected [Preference Id]; id-freshness absent from the named host-obligation list); the [Not Known] card omits its first-class [Read]-outcome use, contradicting three sections; [Active]/[Suspended]/[Deleted] carry no `Projects:` lines though their lowercase tokens are wire-visible in the falsifiable checks, against the preamble's every-pinned-Member rule; Invariant 8 (no id reuse) has no witnessing Generation-acceptance check; SMS, HTML, UI, API, and I/O unglossed at first use; "preference field" drifts between a four-field extension (Inputs' at-least-one rule) and a five-field extension including [Metadata] (Invariants 1 and 6, check 1). *Rhetorical (routed, open):* the Summary's "keeps one currently-in-effect record per person" overstates at-most-one; the Summary's full-history claim sits beside its own retention concession; Invariant 1's "[Status] is the only mutable field" glosses the absent→set transitions of [Suspended At]/[Deleted At]; the Preference-Aware Notification Fanout note's "end-to-end" wiring list omits Consent, which Behavior sequences ahead of every preference read.

**Showcase pass — 2026-06-29.** Completes this atom's path to the full showcase standard. The Summary/blockquote merge, the Lineage collapse, and the transition-table / prose cuts were already piloted on 2026-06-26 (entries above) and are **preserved unchanged**; this pass adds only the remaining showcase element — **four-kind `[Term]` annotation** across the body plus a `## Terms` registry before Composition notes (25 terms): 5 Operations ([Set], [Suspend], [Delete], [Current For], [Read]); 13 Fields — the 11 preference-record fields ([Preference Id], [Principal Ref], [Channel Preferences], [Frequency Limit], [Quiet Hours], [Format], [Metadata], [Set At], [Status], [Suspended At], [Deleted At]) plus [Store Name] and `declared_at` on the instance configuration record, no separate Type card (plain-noun "preference record" referent); 0 Parameters (every input is stored as-itself); 7 Members ([Active], [Suspended], [Deleted] states + [Invalid Request], [Not Known], [Not Active], [Already Deleted] rejections). Survivors left backticked: the one labeled projected-contract signature per Operation; the `ok` and `none` outcome tokens; the lowercase stored `status` values (`active`/`suspended`/`deleted`); the host-injected clock `now` in `= now` write-stamp formulas (this atom stamps timestamps only — no derived status, so no `[Now]` term, mirroring legal-hold); the non-existent `resume`/`resumed_at`; qualified/interval formula expressions (`R_prior.deleted_at`, `[set_at, deleted_at)`); concrete example calls, ids, and channel values; and external standard tokens. No *also-known-as* line existed, so none was invented. Re-verified, not re-grounded: Status stays at `grounded on Final Critique 5 — 2026-05-29`. Gates: lint clean (O-term resolver — every marker resolves and every card is used); term-adapter derives cleanly (25 terms); 10 invariants + Temporal property 11 preserved; `.tla`/`.cfg` untouched — harness re-run green: `message-preference.tla` PASS, `message-preference-buggy.tla --buggy` rejected.

</details>
