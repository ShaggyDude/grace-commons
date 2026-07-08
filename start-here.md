---
title: Start Here
nav_order: 1.5
---

# Start Here

> Fifty-plus specifications, a methodology, formal models, and a verification harness is a lot of surface to land on. This is the short path through it: four stops, about an hour of focused attention, and at the end you will know what this library is, whether its claims hold, and whether it matters to you. Resist the nav sidebar until stop four — it will still be there.

---

## Stop 1 — Read one atom: [Event Log](./atoms/event-log.html) *(~10 minutes)*

An **atom** is a freestanding concept — one recurring piece of business behavior, specified completely, naming no other pattern. Event Log is the best first one: small enough to read in a sitting, load-bearing enough that half the library composes on top of it.

What to notice while you read:

- **The Summary is plain English.** A compliance officer can read it. That is a design rule, not an accident — every spec here is written for three audiences at once.
- **The Invariants are numbered and testable.** "Append-only," "total order," "no id reuse" — each is a property an implementation must produce *records* to prove, not a vibe.
- **Time and identity are injected, not grabbed.** The spec forbids the core logic from reading the clock or generating ids itself — that is what makes the behavior deterministic and checkable. (The rule is the Logic Confinement Principle; you will meet it again.)
- **What it refuses to do.** Retention, tamper-evidence, who-did-it attribution — all explicitly out of scope, each pointing at the pattern that owns it. The discipline of *not* absorbing responsibilities is most of what makes atoms composable.

## Stop 2 — Read one composition: [Audit Trail](./compositions/audit-trail.html) *(~15 minutes)*

A **composition** wires atoms together and is where the payoff lives. Audit Trail composes Event Log with Actor Identity, Tamper Evidence, and Retention Window — and produces guarantees *none of the four carries alone*.

What to notice:

- **The Composes section names constituents by reference.** Nothing is re-specified; the atoms remain unchanged. Compositions are wiring, not new primitives.
- **Emergent invariants.** Attribution coverage, cascade-on-purge, forensic completability — properties that only exist because of how the atoms are wired. This middle layer — guarantees that appear at composition time — is the library's most distinctive idea.
- **Generation acceptance.** The section listing what an external auditor must be able to verify *from the records alone*, with no access to source code. Hold that thought for stop three, because those sentences are about to become executable.

## Stop 3 — Run the evidence: [Verify It Yourself](./verify.html) *(~20 minutes hands-on, or 5 skimming)*

The auditor checks you just read are not aspirational prose — they are the literal source of a conformance validator, and this library's claims are built to be re-run by strangers. The verify page walks you through measuring an implementation (20/20, counted by a program), watching five independent implementations on unrelated storage engines agree identically, injecting a real historical bug and watching the machinery catch and localize it, and running the formal models with their deliberately-sabotaged twins.

If you only have five minutes, read the *negative control* step and the *what each number means* section — the failure behavior is more persuasive than the passes.

## Stop 4 — Read the why: [The Spec Layer](./the-spec-layer.html) *(~25 minutes)*

Now the manifesto will read as a description of things you have touched rather than an ambition. The sections worth the closest read: **The Problem** (why software's truth is scattered across eight artifacts that silently disagree), **The Architecture** (why verbose structured English is the canonical form and code is derived), and **Bridges** (the litmus test every addition here must pass). You have already seen each principle operating — the three-tier Event Log spec, the emergent invariants, the validator.

---

## Where to go next — by who you are

- **Compliance, audit, or regulatory:** browse the regulated patterns from the [atoms catalog](./atoms/) — start with Retention Window, Legal Hold, and the Defensible Retention composition; every regulated pattern carries auditor-facing scenarios and standards anchors (HIPAA, GDPR, SOX, FDA).
- **Engineer wondering how this becomes software:** the [Execution Contract](./execution-contract.html) — the deterministic compilation target: three primitives, a four-step pipeline, and the mapping from spec sections to runtime obligations. Then the live [demos](./demos.html) and their RECIPEs.
- **Formal methods background:** [Pressure Testing](./pressure-testing.html) §Formal models — the vote, the model-present bar, the buggy-twin vacuity guard, the coverage cross-check — then `tools/harness/` for the reproducible checker.
- **Thinking about contributing:** [Contributing](./contributing.html). The cheapest real contribution is reporting an ambiguity you found while reading — a finding routed through review is exactly how this library improves, and its first external issue produced a canonicalized methodology section.
- **Just want the state of things:** the [Roadmap](./roadmap.html) is the single source of truth for what exists, and [Risks & Mitigations](./risks.html) is the library grading itself honestly — including the parts that are not done.
