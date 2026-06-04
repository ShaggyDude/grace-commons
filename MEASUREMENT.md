# MEASUREMENT.md — measuring pipeline efficiency honestly

> The companion to [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md). Pressure
> Testing defines the *quality* bar a pattern must clear to reach `grounded`.
> This document defines how we measure the *cost* of clearing it — so efficiency
> claims rest on pre-registered, reproducible data rather than recollection, and
> so the protocol itself stakes out an evaluation nobody else has defined.
>
> **Why this exists.** Month 1 produced ~40 patterns *while the system itself was
> being built* — methodology, harness, conventions, and patterns all at once. That
> is a fuzzy datapoint by construction: it conflates building the factory with
> running it. The first clean measurement is the first cohort produced on a
> *stable* system. A cohort is only a clean test if its measurement is designed
> **before** it starts; measured in hindsight it is a better anecdote, not data.

## 1. The unit and the quality gate

The unit is **one pattern taken to `grounded`** — i.e. through the full bar
(3×3 baseline + Final Critique + formal layer where the vote is yes + coverage
cross-check). Cost-to-`plausible` is not measured and not claimed; a pattern that
is cheap but does not reach `grounded` contributes nothing but its wasted cost.
Efficiency is always *cost-to-verified*, never *cost-to-output*.

## 2. Metrics (record all three per pattern)

- **Tokens** — total input + output tokens to `grounded`, **including all rework**
  (every refinement round, every finding, buggy-twin authoring, the formal model,
  the coverage matrix). Counting only the final clean pass understates real cost
  and the number will not survive scrutiny.
- **Human-touch minutes** — wall-time a human spent steering, reviewing, deciding.
  This is half the "human↔AI" claim; do not omit it.
- **Wall-clock** — elapsed time start-to-`grounded` (secondary; useful for the
  consulting story).

The headline figure is the **leverage ratio**: human-minutes + token-cost per
grounded pattern vs. the human-expert-only baseline (§5).

## 3. Stratify — never report one blended mean

A plain atom and a four-atom regulated composition cost wildly different amounts;
averaging them hides the real distribution. Report per tier:

| Tier | Example |
|---|---|
| Atom — plain | Personal Todo |
| Atom — regulated | Actor Identity, Retention Window |
| Composition — 2-atom | Idempotent Reservation |
| Composition — regulated / substrate | Audit Trail, KYC |

Report each tier's median and range, plus n. A single mean over the four tiers is
not a usable number.

## 4. What's in, what's out

- **In:** every token and minute spent producing and verifying the pattern,
  including rework, buggy twin, formal model, coverage matrix.
- **Out (tag separately, do not charge to a pattern):** methodology changes,
  harness/tooling work, convention edits, doc refactors. This is exactly the
  month-1 confound; keeping it in a separate ledger is what makes the cohort a
  production measurement rather than a build measurement.
- **Learning-curve honesty:** later patterns are cheaper partly because the
  conventions have settled and there are more in-context exemplars. Report the
  **trend across the cohort** (is cost still declining, or has it reached steady
  state?), not just the mean — a still-declining curve is a different claim than a
  steady-state cost.

## 5. Baselines — efficiency is relative

- **Primary — human-expert-only (the leverage story).** Estimate the time a
  competent formal-methods / spec engineer would take to produce **and verify** the
  same artifact by hand. The sellable sentence is "*X human-minutes + Y tokens vs.
  Z engineer-days*." This is the number that lands with funders and with a design/
  consulting partner ("we do in hours what takes weeks"). It is an estimate, not a
  controlled trial — say so (see §8).
- **Secondary — naive one-shot LLM (no methodology).** For a sample of patterns,
  prompt a model once for the spec/model with no pressure-testing, and record both
  its cost **and its grounding outcome**. The expected result — cheap output that
  does not clear the bar — is the point: it shows our tokens buy *grounded* where
  the naive baseline buys *guesswork*.

## 6. Pre-registration

Before a cohort starts, commit:

- the **intended pattern list** (so results cannot read as cherry-picked),
- the **protocol version** (a commit hash of this file),
- the **baseline assumptions** (who the hypothetical expert is, what the naive
  prompt is).

After the cohort, report results against the pre-registered set — including any
pattern that was planned but did not reach `grounded`, and why.

## 7. Per-pattern instrumentation ledger

Capture one row per pattern as it lands (a CSV or appended table; mirrors the
spirit of the public AI-Usage-Log):

| pattern | tier | tokens_in | tokens_out | human_min | wallclock | rework_rounds | findings | model(s) | grounded_date | notes |
|---|---|---|---|---|---|---|---|---|---|---|

`rework_rounds` and `findings` are the honesty columns — they explain an
expensive pattern and protect the median from looking artificially low.

## 8. Cohort report shape + threats to validity

A cohort report is: the per-tier table (§3), the leverage headline (§2/§5), the
cost trend (§4), and an explicit threats-to-validity section naming at least:

- **Difficulty heterogeneity** — mitigated by stratification, not eliminated.
- **Learning curve / reuse advantage** — later patterns ride a growing catalog of
  exemplars; the cohort may not be steady state.
- **Baseline is an estimate** — the human-expert figure is judgment, not a measured
  control arm; present it as a range and show the assumptions.
- **Selection** — pre-registration (§6) is the guard; report misses, not just hits.

Honesty here is not a tax — it is the product. The protocol being public and
pre-registered is what makes the resulting number credible, and a credible number
is the asset. (Cf. the prior-art scan: there is no existing benchmark for
"reliable, token-efficient human↔AI spec formalization over a concept commons" —
publishing this protocol is a move to define that ground.)
