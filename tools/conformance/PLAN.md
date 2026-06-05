# Conformance Validator — build plan

> The **level-1 feedback loop** made into an artifact: a validator that takes a
> *render* (a running implementation) plus its *spec* and returns a measured
> `correctness(%)` — the fraction of the spec's checkable claims the render
> provably honors. This is the third checker in the trilogy: the linter guards
> the **prose**, `isolate.mjs` guards the **proofs**, and this guards the
> **behavior**. It is also the projector's acceptance test, the producer of the
> measured grounding number, and the fitness function the regen loop will select
> against. One artifact, all of those roles, because they are all the spec read
> as an oracle.

---

## Why this is cheaper than it sounds

Two things mean we are not starting from zero:

1. **The oracle already exists.** Every grounded spec carries a *Generation
   acceptance* section written in records-alone form — "an auditor, from the
   records alone, can reconstruct X / verify invariant Y / observe rejection Z."
   Those *are* the conformance checks. They were authored to be evaluable without
   seeing the implementation. We are not designing tests; we are lifting checks
   the specs already state.
2. **Render 1 already half-implements them.** The `demos/clinical-trial-portal`
   `tests/` (the hash-chain `verifyChain`, the per-invariant assertions, the
   tamper test, the e2e lifecycle walk) are hand-built conformance checks. Much
   of Day 3 is porting existing logic into a reusable shape, not writing it new.

## The one Day-1 decision

**Hand-author the check manifest now; derive it from spec prose later.** The
purist "spec IS the test" endpoint extracts the checks straight out of the
Generation-acceptance prose (a linter-style parse — tractable, not week-1). Close
the loop first with a hand-authored manifest for one render; automate the
extraction once the loop demonstrably works and we know the manifest shape that
the runner actually needs.

## Architecture (the three pieces)

- **`conformance.manifest`** — the structured oracle. A list of checks, each
  `{ id, claim (quoted spec text), kind: record-clearable | externally-clearable,
  severity }`. Stack-agnostic: it never names a table or an endpoint.
- **Render adapter** — the per-render seam. A small module each render supplies
  that exposes records-alone access (`events()`, `eventsByAction(a)`,
  `record(id)`, …) mapping spec concepts onto *that* render's store/API. This is
  the only genuinely new code, it is the same correspondence the projector would
  use forward, and it is a **trusted component** — a wrong mapping makes a
  conformant render look broken, so it is small, reviewed, and per-render.
- **Runner** — loads the manifest, evaluates each record-clearable check through
  the adapter against the running render, collects pass/fail, and computes the
  number. Numerator = checks passed; denominator = record-clearable checks
  (externally-clearable items reported *separately*, never counted as failures).

The number is **computed, not asserted** — that is the whole point. An author
says "92%-good"; the runner *counts*. Author-proof and reproducible.

---

## The week (each day independently shippable)

### Day 1 — Define the conformance contract (the structured oracle)
- Pick render 1 (`demos/clinical-trial-portal`) as the spike target.
- Hand-author `tools/conformance/manifests/clinical-trial-portal.manifest.json`:
  one entry per Generation-acceptance check across the composition surface
  (C16 / C13 / C14 / APA / C1), each with `{id, claim, kind, severity}`.
- Reuse the spec's own **record-clearable vs externally-clearable** split as the
  `kind` field — it already exists in every Generation-acceptance section.
- Write down the **denominator definition** (equal-weight to start; externally-
  clearable reported separately). Reproducible, documented, not vibes.
- **Done when:** the manifest enumerates the demo's checkable claims and the
  denominator rule is written down.

### Day 2 — Adapter interface + runner skeleton
- Define the minimal **adapter contract** (a TS/JS interface): records-alone
  accessors sufficient to evaluate the manifest's checks. Keep it the smallest
  surface that works.
- Build the **runner** end-to-end with every check **stubbed** ("pending"), so
  the full path — load manifest → call adapter → tally → print `correctness(%)`
  — exists and prints `0% (N pending)`.
- **Done when:** `node validate.mjs <render>` runs, finds the manifest + adapter,
  and prints a real (zero) score with a per-check table.

### Day 3 — Implement the checks against render 1
- Write render 1's **adapter** (a thin query layer over the demo's SQLite store).
- Port the demo's existing `tests/` logic into per-check evaluators; add the
  remaining Generation-acceptance checks.
- Run it: **the first real `correctness(%)` on a live render.**
- **Done when:** every record-clearable check evaluates true/false against the
  running demo and the runner prints a non-trivial number.

### Day 4 — Calibrate; make the number honest
- **Precision pass** (the isolate-tool lesson): a false *fail* destroys trust
  faster than a missed check. Triage every red until each is real.
- Failure output names the **violated spec claim + the offending records**, so a
  red is actionable — and later feedable to the regen step.
- Lock numerator/denominator; report the externally-clearable list **alongside**,
  not counted. Confirm the % is reproducible run-to-run.
- **Done when:** the number is trustworthy and every failure is explained.

### Day 5 — Prove it has teeth + write it up
- **Inject a deliberate defect** into render 1's code (break one invariant —
  e.g., skip an audit append), re-run, confirm the % drops and the right check
  goes red. This is the conformance analog of the buggy twin: proving the
  validator *can* fail is what makes a green run mean something.
- Write **`tools/conformance/README.md`**: the contract, the adapter interface,
  the denominator definition, and **"how to plug in a new render"** (so render 2
  and the Glare demo drop in cleanly).
- **Done when:** the validator catches an injected defect, and a second render
  could be added by writing only an adapter.

### Week-1 definition of done
A validator that returns a **real, reproducible** `correctness(%)` on render 1,
reports its externally-clearable items separately, and **provably catches an
injected defect**. The whole level-1 loop, working, on one render.

---

## Explicitly next-week (keeps scope honest — do NOT pull these into week 1)

- **Derive the manifest from spec prose** automatically — toward "spec IS the
  test" with zero hand-authoring (a linter-class parse of Generation-acceptance).
- **The regen-fix loop** — an agent consumes the failures → fixes the render →
  re-runs to threshold. The validator is the prerequisite; this is the payoff
  ("generate, check, fix, regen, retest until threshold").
- **Render 2** (`clinical-trial-portal-next`, Next.js + Postgres) → the first
  **multi-render agreement** number: a claim counts only if it passes identically
  across both renders. That number measures *spec-carried meaning*, the quantity
  the whole thesis rests on.
- **The two-variant Glare demo** (the ZURB / Bryan proof-of-concept) — render two
  experience variants off one spec, hold every invariant constant by
  construction, run both through Helio/Glare on Success + Intent. Shows the joint
  loop: correctness held by the spec layer, experience varied and measured by
  Glare. Rides on top of the validator.

---

## Where this sits in the stack

```
Level 2 — EXPERIENCE (empirical)   Glare / Helio: does the experience win?  [data]
                                   ▲ fed by trivially-cheap conformant variants
Level 1 — CORRECTNESS (deterministic)  THIS VALIDATOR: does the render honor the spec?  [count]
                                   ▲ renders generated off the canonical spec
Level 0 — SPEC (the source / the oracle)   grounded patterns + Generation acceptance
```

The validator is the hinge: it is the acceptance test for everything below it
(does the render match the spec) and the enabler of everything above it (cheap,
correct variants for Glare to measure). Determinism underneath; empiricism on
top; human attention pooled where it belongs.
