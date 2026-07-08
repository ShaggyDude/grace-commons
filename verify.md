---
title: Verify It Yourself
nav_order: 9.5
has_toc: true
toc: true
---

# Verify It Yourself

<details markdown="block">
<summary>Table of contents</summary>
{: .text-delta }
1. TOC
{:toc}
</details>


> Every headline claim this library makes is designed to be re-run by a stranger on a cold clone — no accounts, no cloud, no trust required. This page is the trail: about twenty minutes of copy-paste, at the end of which you have measured the claims yourself. The expected outputs shown below are from a verified cold run on 2026-07-06; **your run's output is the authoritative version**, and the tools' own documentation ([`tools/conformance`](https://github.com/scottromack/grace-commons/tree/main/tools/conformance), [`tools/harness`](https://github.com/scottromack/grace-commons/tree/main/tools/harness)) owns the current counts.

---

## What you will verify

1. **Correctness is measured, not asserted.** An implementation of these specs is scored by a validator that counts how many of the spec's checkable claims the implementation's records provably honor.
2. **The meaning lives in the spec, not in any one implementation.** Independent implementations on unrelated storage engines — SQLite, PostgreSQL, a flat JSON-Lines file — pass the *same* checks identically, driven by the same spec-derived manifest. There is no shared code for the behavior to hide in.
3. **The instrument can fail, and failure localizes.** You will inject a real, historical bug into one implementation and watch the agreement machinery catch it, name the exact check, and pin it to the one implementation at fault — out-voted by the others.
4. **The formal models prove something, non-vacuously.** Every machine-checked model in the library ships with a deliberately-wrong twin the checker must *reject*. You will run both and see the correct model hold while the sabotaged one fails — evidence the green checkmark has teeth.

## Prerequisites

- **git** and **Node.js 22 or newer** (the validator uses Node's built-in SQLite; nothing to install for steps 1–3's core path).
- A POSIX shell (macOS, Linux, or Windows via WSL).
- No Docker, no database server, no Java installation (step 4's bootstrap fetches a Java runtime from the npm registry on its own).

```bash
git clone https://github.com/scottromack/grace-commons.git
cd grace-commons
```

---

## Step 1 — Measure one implementation (~2 minutes)

Build the reference store for the clinical-trial-portal surface and point the conformance validator at it. The validator's checks are lifted from the specs' own *Generation acceptance* sections — the records-alone questions an external auditor would ask.

```bash
cd tools/conformance
node fixtures/build-clinical-trial-portal.mjs
node validate.mjs clinical-trial-portal
```

Expected shape of the result (2026-07-06 run):

```
CORRECTNESS: 100.0%   (20/20 passed)
in-scope record-clearable: 20  ·  pass 20 · fail 0 · pending 0 · error 0
critical-fail gate: clean (0 critical fails)
```

Note what the report does *not* do: checks that need evidence outside the records, and checks outside this render's scope, are reported separately — never folded into the percentage. The denominator is honest.

## Step 2 — Multi-render agreement (~5 minutes)

Build four more independent implementations of the same surface and compare them verdict-by-verdict. Renders 1–2 need nothing beyond Node; the PostgreSQL renders fetch `pglite` (real Postgres compiled to WebAssembly — no server) via one `npm install`.

```bash
npm install
node render2/build.mjs
node render3/build.mjs
node render4/build.mjs
node render5/build.mjs

T=$(node -e 'console.log(require("os").tmpdir())')/grace-commons-conformance
node agree.mjs clinical-trial-portal \
  clinical-trial-portal clinical-trial-portal-next \
  "clinical-trial-portal-pg=$T/clinical-trial-portal-pg" \
  "clinical-trial-portal-r4=$T/clinical-trial-portal-r4.jsonl" \
  "clinical-trial-portal-nextjs=$T/clinical-trial-portal-nextjs"
```

Expected shape (2026-07-06 run):

```
multi-render agreement — manifest: clinical-trial-portal   (5 renders)
  clinical-trial-portal          100%
  clinical-trial-portal-next     100%
  clinical-trial-portal-pg       100%
  clinical-trial-portal-r4       100%
  clinical-trial-portal-nextjs   100%
CROSS-RENDER CORRECTNESS: 100%   (20/20 pass on EVERY render)
  agreed-pass 20   ·   agreed-fail 0   ·   DISAGREE 0
```

Two of these renders were authored by agents in isolated context that never saw the other implementations — only the specs and the adapter contract. One is a flat-file log with no database at all. They agree because the behavior comes from the spec; there is nowhere else for it to come from.

## Step 3 — The negative control (~2 minutes)

A harness that only ever says yes proves nothing. Rebuild render 1 with a real bug — the genesis-hash defect the validator caught in the live demo in June 2026, kept as an injectable defect — and re-run the agreement:

```bash
node fixtures/build-clinical-trial-portal.mjs --defect genesis-hash --out "$T/r1-bug.db"
node agree.mjs clinical-trial-portal \
  "clinical-trial-portal=$T/r1-bug.db" clinical-trial-portal-next \
  "clinical-trial-portal-pg=$T/clinical-trial-portal-pg" \
  "clinical-trial-portal-r4=$T/clinical-trial-portal-r4.jsonl"
```

Expected shape (2026-07-06 run):

```
CROSS-RENDER CORRECTNESS: 95%   (19/20 pass on EVERY render)
  agreed-pass 19   ·   agreed-fail 0   ·   DISAGREE 1
disagreements (render-specific):
  C1-2b   clinical-trial-portal=fail   ...next=pass   ...pg=pass   ...r4=pass
```

Read that carefully: the harness did not just go red. It named the exact check (the audit-chain integrity claim), pinned it to the one sabotaged render, and out-voted the defect three-to-one — proving the failure is in that implementation, not in the spec. Disagreement *localizes*. That is what makes the 20/20 in step 2 meaningful.

## Step 4 — Formal models and their buggy twins (~5 minutes)

The specs' load-bearing temporal and structural claims are machine-checked in TLA+ and Alloy (formal model checkers — tools that exhaustively search every reachable state within a bound, rather than testing samples). Every model ships with a **buggy twin**: a deliberately-wrong sibling that re-introduces a real hazard. The checker must reject the twin, or the correct model's pass proves nothing.

```bash
cd ../harness
bash bootstrap.sh      # fetches the checkers from npm; installs a JRE 17 to /tmp — no system Java

# A correct model must hold:
node check.mjs ../../atoms/event-log.tla

# Its sabotaged twin must be REJECTED:
node check.mjs ../../atoms/event-log-buggy.tla --buggy

# Same discipline on the Alloy side:
node check.mjs ../../compositions/session-gated-authorization.als
node check.mjs ../../atoms/permissions-buggy.als --buggy
```

Expected shape (2026-07-06 run):

```
TLA+  event-log.tla  (states: 119)        -> all invariants hold          PASS
TLA+  event-log-buggy.tla  (states: 14)   -> VIOLATION: Invariant 0       PASS  (twin correctly rejected)
ALLOY session-gated-authorization.als     -> all guarantees hold, all runs non-vacuous   PASS
ALLOY permissions-buggy.als               -> 2 checks find COUNTEREXAMPLEs PASS  (twin correctly rejected)
```

To run **every** model in the corpus (several minutes; the tool's output is the authoritative count):

```bash
node audit.mjs
```

## Optional deeper cuts

- **Twin isolation** — one twin can mask another invariant's rejection (the checker reports only the shortest counterexample). `node isolate.mjs credential.tla` re-runs each twin against each invariant in isolation and classifies the coverage.
- **Coverage matrices** — [`tools/harness/coverage/`](https://github.com/scottromack/grace-commons/tree/main/tools/harness/coverage) maps every spec invariant to the model construct that checks it, including the ones honestly marked out-of-scope.
- **The document-store proof** — the MongoDB render (no foreign keys, no CHECK constraints) rebuilds the same surface and its README carries the invariant → enforcer table: every spec invariant survived; only the enforcement locus moved. Requires a mongod binary download; see [`demos/clinical-trial-portal-mongo`](https://github.com/scottromack/grace-commons/tree/main/demos/clinical-trial-portal-mongo).
- **The live demos** — the same specs, deployed: see [Demos](./demos.html).

---

## What each number means

- **20/20** — the fraction of the spec's record-clearable claims this implementation provably honors. Counted by a program, from the records alone; never self-reported.
- **DISAGREE 0** — every checkable claim holds *identically* on independent implementations with no shared code. The meaning is carried by the specification.
- **19/20, localized** — the instrument can fail, fails loudly, and points at the culprit. A measurement you cannot make fail is not a measurement.
- **Twin rejected** — the model checker's pass is non-vacuous: the same harness demonstrably catches the hazard the spec defends against.

## What this does not prove

Honesty about the boundary, in the library's own tradition: the implementations you just measured were **hand-written against the specs** — mechanical generation from specs is the direction of travel ([roadmap](./roadmap.html)), not the shipped reality, and when it ships it will be gated by exactly the validator you just ran. Model checking is exhaustive **within declared bounds**, and each model's bounds and deliberate exclusions are recorded in its pattern's coverage matrix and Lineage notes. Records-alone conformance cannot observe every property class — concurrency behavior, notably, is probed separately where it is load-bearing (see the Mongo render's serialization prover) and is an open expansion area ([open questions](./open-questions.html)).

## If a step goes red

A reproducible failure on this page is a **finding**, and findings are the fuel this methodology runs on — the validator's first-ever run caught a real bug ([discoveries](./discoveries.html), 2026-06-05). Please [open an issue](https://github.com/scottromack/grace-commons/issues) with the command, your platform, and the output. Exit codes are meaningful throughout: `0` clean, non-zero means a check failed or errored — the tools are built to be wired into pipelines, not just read.
