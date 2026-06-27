# Prose — Direction

**Status:** Direction — drafted, not yet ground; stays in `working-ideas/` and does not yet bind (advisory). The promotion gate had two bars, both now met. **Bar 1 — convert the corpus's hardest gate and show every guarantee survives:** met in §Worked example (the step-5 notification shaping gate, all four touched invariants still derivable). **Bar 2 — exercise the discipline on a live prose pass and confirm it holds:** met 2026-06-26 — the step-5 shaping gate of [`preference-aware-notification-fanout.md`](../compositions/preference-aware-notification-fanout.md) was converted in place to the table + edge-prose form, with Invariants 2, 3, 4, and 7 re-confirmed derivable by an adversarial fresh reader, the linter clean, and the formal model and its buggy twin untouched and still passing (recorded in that pattern's Lineage notes, *Prose-simplification pass — 2026-06-26*). With both bars met, promotion into [`spec-format.md`](../spec-format.md) — beside the three-reading-tiers rule — is the next step.
**Covers:** how a spec carries its full depth without carrying needless prose density — the editing discipline for simplifying spec text without weakening a single guarantee.
**Scope.** This governs *expression*, never *guarantees*. It applies to the prose body of any atom or composition. It does not touch the invariants, the action wiring, the precedence order, the configuration knobs, or the `Rests on:` provenance lines — those are load-bearing precision (see §Leave it alone).

## The principle

Depth and density are not the same thing. The whole discipline turns on keeping them apart.

**Depth is the guarantee.** The ten invariants, the TOCTOU race, the fail-closed gate, the capability provenance — the hard, necessarily detailed content a spec exists to pin down. You never cut this.

**Density is the prose overhead.** Long sentences that nest the exception inside the rule inside the caveat. Acronyms spelled out mid-sentence. Cross-references re-cited defensively. The same rule restated at five altitudes. None of this is a guarantee, and most of it can go without the spec losing anything it promises.

[`the-spec-layer.md`](../the-spec-layer.md) already states the governing principle for code: *"If the code is clever, the spec has failed."* The same applies to the spec's own prose. The artifact is supposed to be structured natural language a domain expert can verify; when it reads like a regulatory standard instead, it has drifted from its own purpose. Clever prose is a failure exactly as clever code is.

**The one test for every edit:** am I making the same claim in fewer or clearer words, or a weaker claim? Simplify the *expression*, never the *guarantee*. If a sentence got shorter because a caveat was dropped, that is not simplification — it is breakage.

## Leave it alone — this density is load-bearing

The invariants. The action-wiring steps. The precedence order. The configuration knobs. The `Rests on:` provenance lines. Each is precision the spec is accountable for, and shortening it loses depth rather than density. Leave it.

## Cut it — this density is overhead

In order of payoff:

**1. One idea per sentence.** This is the highest-leverage move and most of the felt difficulty. A single spec sentence often carries the rule, a precedence interaction, the recorded-reason consequence, and the firing condition all at once, with two em-dash asides folding more in. The depth is in the four ideas; the density is in the cramming. Split it into four short declarative sentences and you lose zero precision and gain a reader.

**2. Keep the glossary out of the body.** Inline expansions — *"SMS (Short Message Service — text messaging)"* — make the spec carry the dictionary on its back. [`spec-format.md`](../spec-format.md) already mandates a glossary and per-scope definitions, so the expansion belongs there, linked, defined once. What the term *requires* stays in the prose; spelling the term out mid-sentence goes.

**3. Move cross-references to a footer, not mid-sentence.** Provenance belongs in the invariants' `Rests on:` lines and stays there. But in the prose body, re-citing *"per execution-contract.md §X"* on every claim reads anxious — the spec showing its work mid-sentence. Collect those into one "Rests on / inherits from" footer per section and let the prose just say the thing.

**4. Make the Summary genuinely plain.** The three reading tiers exist so each can speak at its own altitude: a skimmer reads the Summary, an implementer reads the wiring. The Summary (Tier 1) should be readable cold by a domain expert who never opens the action wiring — and *less* precise on purpose, because precision is the wiring's job. Bloat is the Summary creeping toward the wiring's altitude. *"Everyone subscribed gets exactly one recorded outcome — delivered, failed, or suppressed-with-a-reason — and nothing is silently dropped"* is a Summary doing its job.

**5. Turn prose into structure where structure is sharper.** A precedence-ordered gate is a decision table's home turf, and [`the-spec-layer.md`](../the-spec-layer.md) endorses decision tables as inline constructs self-evident enough to need no prose gloss. A gate narrated as a long step paragraph —

> Suspended → No-record → Quiet-window → Frequency-cap → Channel-selection, each raised at the point its input is first consulted, firing only if no earlier rule has already suppressed…

— reads cleaner, and *more* precisely, as a glanceable grid:

| Order | Rule | Fires when | Outcome |
|---|---|---|---|
| i | Suspended | principal suspended | suppress (reason: suspended) |
| ii | No record | no preference record | deliver-unshaped (or fail-closed) |
| … | … | … | … |

The same applies to configuration knobs: a column each for default, required, and fails-closed behavior beats a run of dense prose bullets, and it surfaces a missing cell the prose would have hidden.

**Caveat — this is the one cut that can silently lose depth.** The other four are pure render changes; this one is not. A table earns its glanceability precisely by leaving out the conditions that do not fit a cell — and in a regulated spec those omitted conditions are often the fail-closed semantics and the edge cases, the very content the spec exists to pin down. So the rule for cut #5 is narrower than for the others: the table carries the common path, and the edge conditions and fail-closed semantics stay in prose *beside* it — never dropped into it, never dropped at all. The §Worked example below proves the point: the notification gate converts cleanly and keeps every invariant, but only because three semantics that do not fit a cell are written out next to the grid.

## The caution

Some of what looks like density is the spec *earning* a hard claim. The TOCTOU race, the best-effort-versus-serialized distinction, the fail-closed precedence — these are hard and necessarily detailed. The failure mode is simplifying by deleting the earning instead of clarifying the prose. Apply the test from §The principle to every edit: same claim in clearer words, never a weaker claim. A shorter sentence that dropped a caveat is broken, not simplified.

## Worked example — the proof

This is the doc's own promotion gate: convert the densest gate in the corpus and check that every guarantee survives. Source: the step-5 shaping gate in [`compositions/preference-aware-notification-fanout.md`](../compositions/preference-aware-notification-fanout.md), narrated there across a ~120-word fail-closed sentence and five sub-bullets.

**The gate as a decision table.** Precedence is top-to-bottom: the first rule whose input is present and whose condition holds fires, and its reason is the recorded reason. A rule whose input is absent is skipped.

| # | Rule | Fires when | Interpretation undeclared → | Verdict |
|---|------|-----------|------------------------------|---------|
| i | Suspended | record status = Suspended | (no interpretation needed) | `suppress(suspended)` |
| ii | No record | `current_for` returns `none` | default shape absent → fails at rule v | `suppress(no-record)`, or fall to rule v with the default shape (per `no_record_policy`) |
| iii | Quiet window | record carries `quiet_hours`, injected `now` inside it | `fail(interpretation-undeclared)` | `suppress(quiet-window)` |
| iv | Frequency cap | record carries `frequency_limit`, in-window count ≥ cap | `fail(interpretation-undeclared)`; history unavailable → `fail(accounting-unreadable)` | `suppress(frequency-cap)` |
| v | Channel selection | reached when no earlier rule fired | `fail(interpretation-undeclared)` | `deliver(channels, format)`, else `suppress` (see edge prose) |

The table is sharper than the paragraph it replaces: the precedence is glanceable, and the per-rule fail-closed raising — which the original buried mid-sentence — is now a column.

**What stays in prose beside the table** (the semantics a cell cannot hold):

- *The pre-gate guard.* A failed Preference *read* (infrastructure failure, not `none`) is `fail(preference-unreadable)`, raised by the orchestration **before** the gate is invoked — so it is deliberately not a row. An outage degrades to a named failure, never a silent unshaped deliver to a suspended or quiet-houred principal.
- *Rule v's empty-set disambiguation.* An emptied channel set suppresses as `channel-opt-out` if preference values emptied it, but as `quiet-window` if the declared `statutory_quiet_window` exclusion emptied it — two reasons from one row.
- *The observation anchor.* Every verdict is against the record *as the gate observed it* at evaluation time; a `set` or `suspend` committing after the read is the named staleness window, not a violation.

**Invariant survival check:**

- **Invariant 2** (precedence; recorded reason = first rule fired) *is* the table's top-to-bottom first-match rule. ✓
- **Invariant 3** (quiet-window safety): rule iii precedes channel selection, and the statutory exclusion lives in rule v plus the empty-set prose. ✓ *(table + prose, not table alone)*
- **Invariant 4** (frequency-cap safety): rule iv carries the gate's part (suppress at count ≥ cap); the per-commit anchor, the best-effort race, and serialization are commit-time semantics that were never the gate's prose — they stay in the Invariant 4 statement. ✓ *(the table does not claim them)*
- **Invariant 7** (replayability): rests on the gate being a pure function of its inputs, which a decision table makes *more* evident, not less. ✓

**Verdict: depth survives — and so does the caveat.** All four invariants remain derivable and the table is a net gain in both clarity and precision. But the proof also confirms cut #5's specific risk: three semantics do not fit a cell, and had the table *replaced* the prose rather than sitting beside a trimmed remainder, all three would have been lost. That is the line between cut #5 and the four safe cuts — and the evidence that the discipline holds on the hardest case in the corpus, so the lighter specs will too.

## Relation to the other directions

This is the prose-level companion to [`naming.md`](./naming.md): naming governs the one word a term carries, this governs the sentences around it. Both serve the same end — the spec stays the human-readable canonical artifact the thesis requires — and both simplify the *render* while leaving the *referent* (the guarantee, the identity) untouched.
