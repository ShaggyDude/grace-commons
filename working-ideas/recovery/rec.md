# Concept recovery — run 1: `pboyer/rec` (2026-06-13)

> **Status: internal staging, not canonical.** First concept-recovery run under the pipeline in `working-ideas/concept-recovery.md`. Subject: [`github.com/pboyer/rec`](https://github.com/pboyer/rec) (`rec-js`), the phase-1 warm-up target. Stage-1 extraction was direct reading (≤120 LOC; no extractor needed, as planned). Result: one recovered concept, three recovered invariants, a cross-validation against the library's Undo History formal model, and **one latent defect the TypeScript types and the ~1M-trial test suite both miss.**

---

## Subject

`rec.ts` (120 lines incl. types) is a delta/diff algebra over JSON. Four delta types — `Update`, `Insert`, `Delete`, `Compound` — each carrying `path`, a new value `v`, and a captured prior value `old`. Two operations: `Apply(o, d)` mutates an object by a delta (capturing `old`), and `Invert(d)` returns the inverse delta. `stringify.ts` supplies `stringifyStable` (canonical JSON serialization) used as the test equality oracle. The README frames it as "a foundation for undo, redo, diffing, and event systems"; the test suite is ~1M random round-trip trials.

## Stage 3 — classification (routing test + three gates)

**Recovered concept: Invertible Delta (a.k.a. Reversible Change).** A change record — `{ type, path, v, old }` — with two operations:
- `Apply` → a **transition** (state-mutating; `o' = Apply(o, d)`), the execution-contract's T. Note it captures `old` *during* application, which is what makes the change reversible.
- `Invert` → a **pure function** `d ↦ d⁻¹`, no IO, no ambient services.

Routing-test sweep: the delta record is **concept state**; `Apply`/`Invert` are its actions; there are **no values** (no clock, no id — see below), **no callers**, **no obligations**. `stringifyStable` is a secondary pure-function concept (canonicalization / the `equivalent`-under-normalization oracle, glossary sense). `rec` is pure algebra — unusually clean, because it has no runtime surface at all.

**Ground-truth match — the honest result corrects the prediction.** The shortlist predicted `rec` → **Event Log**. It is *not* Event Log. `rec` has no log, no total order, no immutable store, and — tellingly — **no identity** (deltas are anonymous; every library atom gives records an opaque immutable id). The absence of identity is the structural reason it sits *below* Event Log: you cannot reference an anonymous delta, so you cannot log it. What `rec` actually is: the **invertible-delta primitive that Undo History's "compensating events" are instances of** — a sub-atomic concept one layer beneath Event Log + Undo History.

→ **Finding F1 (taxonomy):** the recovery surfaced a concept *below the library's current granularity* — candidate atom **Invertible Delta / Reversible Change** (state: a typed, path-addressed change with captured prior value; actions: apply, invert; invariants below). Not currently in the library. Whether it earns atomhood is a Gate-3 question (does it carry state/behavior no existing atom holds? — yes: reversible-change-with-captured-prior is not Event Log's append, nor Soft Delete's tombstone). Flag for the backlog, not auto-promote.

## Recovered invariants (the load-bearing step)

- **I1 — Round-trip reversibility.** `Apply(Apply(o, d), Invert(d)) ≡ o` for every delta type. Applying a delta then its inverse restores the prior state. (README states it by example; it is the concept's reason to exist.)
- **I2 — Apply-before-Invert precondition.** `Invert` reads `d.old`, which is populated only by `Apply`; inverting an unapplied delta is undefined. A genuine ordering precondition — the same *shape* as the library's attest-before-record ordering rule.
- **I3 — Compound inversion reverses order (LIFO).** `Invert(Compound[d₁…dₙ]) = Compound[Invert(dₙ)…Invert(d₁)]` — map-invert then *reverse*. Getting the order wrong breaks the round trip on any non-commuting pair.

## Stage 4 — verification against the repo's own tests

The suite is the trace source. Two tests, ~1M trials each:
- **Single test** (apply d, apply Invert(d), assert canonical state restored) → **corroborates I1.** ✓
- **Compound test** (apply many deltas, invert as a Compound, assert restored) → **corroborates I3.** ✓
- Both tests run `Apply` then `Invert`, so **I2 is respected** by construction. ✓

All three recovered invariants survive the trace check — the stage-4 success condition. But the more valuable stage-4 output is a failure of a *different* recovered claim:

→ **Finding F2 (latent defect — the headline).** The recovered contract, stated in the README and honored by three of four branches, is *"`Apply` returns the modified `O`."* The **COMPOUND branch violates it** — it returns the delta `d`, not the object `o`:

```ts
case COMPOUND: {
    for (let i = 0, l = d.ds.length; i < l; i++) Apply(o, d.ds[i])
    return d;          // every other branch returns o
}
```

The object is still mutated correctly (by reference), so the bug is invisible *unless a caller uses the return value* — `o = Apply(o, compoundDelta)` silently rebinds `o` to the delta. It is hidden twice over:
- **The TypeScript types miss it** — `Compound` is `{ type, ds }`, structurally assignable to `O = { [k]: any }`, so returning `d` typechecks against the `: O` return.
- **The ~1M-trial test suite misses it** — every test mutates by reference and *ignores the return value* (`rec.Apply(o, d)`, never `o = rec.Apply(...)`), so the wrong COMPOUND return is never observed.

This is the concept-recovery thesis in miniature: **recovering the named contract caught a real defect that both the type system and an extensive randomized test suite let through.** It is exactly the "Fail → a real latent bug in the subject system" branch of the pipeline's conflict protocol.

## Cross-validation with the library

- **I3 (LIFO reversal) is structurally the same property as Undo History's TLA+ `Inv_MostRecentTargeting`** — undo peels events in reverse order so the undone set is a top-suffix. Independent code (a JS diff lib) and the library's formal model encode the *same reversal-order invariant* at different layers. The undo-history buggy twin (targets oldest instead of newest) is the exact analogue of a `rec` bug that forgot to `.reverse()` the compound inverse.
- **I2 mirrors attest-before-record** — a captured-prior-state precondition gating reversibility.

Mild but real evidence the library's invariants track the structure of reversible systems in the wild, rather than being artifacts of its own examples.

## Eval (run 1)

- **Pipeline at small scale works by direct reading** — no extractor, no SpecGraph, minutes of work, exactly as the revised plan predicted.
- **Yield:** 1 candidate atom (Invertible Delta), 3 recovered invariants (all corroborated), 1 cross-validation, 1 latent bug the tests miss.
- **The bug is the proof.** The strongest possible first result is not "the tool drew boxes" but "the lens found a defect 10k tests and the compiler both missed." That is the differentiator over LLM-explains-your-repo, demonstrated on run 1.
- **Caveat on scale:** `rec` is pure algebra with no runtime surface — the easiest possible subject. The four-destination routing did little work here (no values/callers/obligations to sort). The medium target (`asgi-idempotency-header`) is the real test of the *routing* half, since middleware has clocks, stores, and callers to classify. F2-class findings (contract vs. types/tests) are the recurring payoff to watch for.

## Actions

- Backlog (Grace Commons): consider **Invertible Delta / Reversible Change** as a candidate sub-atom; run the three gates properly before any promotion.
- Upstream (optional, courtesy): `rec`'s `Apply` COMPOUND-returns-`d` is a likely one-character bug (`return d` → `return o`); a fresh-reader could file it. Recorded here as the run-1 finding regardless.
- Next run: `asgi-idempotency-header` — the routing-half test; expect Idempotent Reservation / Duplicate Prevention + the `token_results` → Idempotency Result Memo prediction.
