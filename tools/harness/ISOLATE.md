# Twin-isolation / formal-coverage checker (`isolate.mjs`)

The companion to `audit.mjs`. The base harness confirms each correct model holds
and each buggy twin is rejected. It does **not** confirm that *each load-bearing
invariant* has a twin that demonstrably breaks it — and TLC reports only the
**shortest** counterexample, so one twin carrying two hazards demonstrates only
one; the other's rejection is silently masked. That is exactly the Credential bug
(`Inv 7` at 5 states masked `Inv 2` at 33 states in the combined twin) that had to
be found by hand. This tool mechanizes the search.

## Run

```
node isolate.mjs                 # whole corpus (default: informational, exit 0)
node isolate.mjs credential.tla  # one model
node isolate.mjs --strict        # exit 1 if any un-annotated combined twin remains
```

For every correct TLA+ model with twins, it derives the load-bearing invariant
set (named `INVARIANT`s in the `.cfg`, plus the conjuncts of `Safety` minus
`TypeOK`) and runs **each twin against each invariant in isolation** — synthesizing
a single-invariant `.cfg` per run, in-process, no temp files. Each twin is then
classified:

- **dedicated → X** — breaks exactly one load-bearing invariant (the ideal: each
  invariant has its own reachable, demonstrated counterexample).
- **COMBINED → X + Y** — breaks two or more in isolation. In the committed run the
  shorter masks the rest, so X and Y do not each have a demonstrated rejection.
- **VACUOUS** — breaks none (it is not a real vacuity guard).

## What is and is not a bug — the irreducible judgment

A combined twin is a masking **risk**, not an assertion of a bug. Whether it is a
real defect depends on a question the `.cfg` cannot answer, so the tool hands it
to the reviewer / formal-layer vote:

- **Independent claims → real bug, split it.** If the co-broken invariants are
  genuinely independent (Credential's active-uniqueness vs rotation-chain;
  Stateful Workflow's gate-clearance vs audit-atomicity), a twin *can* break each
  alone — so it *should*. Split into one dedicated twin per invariant.
- **Facets of one claim → benign, declare it.** If the invariants are facets of a
  single claim (a binding bijection `== NoDangling /\ NoOrphan`; a dangling state
  violates both *by definition*), no twin can break one without the other — the
  "dedicated twin" is unsatisfiable. Declare them with an annotation in the `.tla`:

  ```
  \* @isolate-facets Inv4_BindingBijection Inv4_NoDanglingProv Inv4_NoOrphanAudit
  ```

  A combined twin whose broken set is within one declared facet group is then
  reported as expected, not flagged.

This split — the machine *detects* combined twins; the human *judges*
independent-vs-facet — is the design on purpose. It narrows "hand-audit every
twin" down to "judge the handful of combined ones," which is the whole win.

## Status of the corpus (first calibrated run)

22 models with twins checked. One genuine masking bug found and fixed (Stateful
Workflow Execution — split into `…-buggy.tla` for gate-clearance and
`…-buggy-unaudited.tla` for binding-atomicity). Three binding-bijection
compositions declared `@isolate-facets` (chain-of-custody, consent, forensic-
recovery). One borderline item left for the vote: `event-log` (monotonicity +
total-order — split or declare facets per the reviewer's call). `--strict` is
clean except that one deliberate review item.

## Scope

TLA+ only. Alloy reports every `check` independently — there is no shortest-
counterexample masking to guard against — so `audit.mjs` already shows each Alloy
assertion's verdict and `isolate.mjs` does not re-examine `.als` models.
