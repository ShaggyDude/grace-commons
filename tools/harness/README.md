# Formal-model harness

One reproducible checker for both formal-model flavors in the library:

- **TLA+** (`.tla` + `.cfg`) via the [`tla-checker`](https://www.npmjs.com/package/tla-checker) WASM model checker.
- **Alloy** (`.als`) via the `org.alloytools.alloy.dist` jar running headless (`exec`) under a JRE 17.

Both checkers are provisioned **from the npm registry only** — no Adoptium / GitHub / Maven downloads, which are blocked in the sandbox. The Alloy jar at `tools/alloy/alloy.jar` is extracted from `Alloy.app/Contents/Resources/`, not downloaded.

## Setup (once per session)

```bash
cd tools/harness
bash bootstrap.sh
```

This installs `tla-checker` into `tools/harness/node_modules` and the JRE 17 into `/tmp/javajre`. The JRE must live on the native `/tmp` FS: unpacking it into the mounted repo drops `libjli.so` and the launcher dies with exit 127. `node_modules` is git-ignored; the jar and JRE are never committed.

## Use

```bash
# A correct model must hold (TLA+) / have all checks UNSAT and all runs SAT (Alloy):
node check.mjs ../../atoms/party-identity.tla
node check.mjs ../../compositions/session-gated-authorization.als

# A buggy twin must be REJECTED (the vacuity guard):
node check.mjs ../../atoms/party-identity-buggy.tla --buggy

# Run every model in the repo:
node audit.mjs
```

Exit code `0` = the twin behaved as its role requires; `1` = it did not.

## Conventions

- **TLA+ constants** come from a sibling `<base>.constants.json` (e.g. `{ "Actors": ["a1","a2","a3"], "K": 2 }`) when the `.cfg` does not inline them.
- **Buggy twins** are deliberately-wrong variants the checker *must* reject — the guard against a vacuously-passing model. A buggy `.tla` must produce an invariant violation; a buggy `.als` must produce at least one `check` counterexample (SAT).
- **A model that does not typecheck is a HARD FAIL.** An assertion that never typechecks was never actually checked — see the `capability.als` finding (a `no (boolean)` type error that hid an unchecked assertion behind a `grounded` status).

## What the harness checks (Alloy)

- `check C` → **UNSAT** means the asserted guarantee `C` holds (no counterexample in scope).
- `run P` → **SAT** means `P`'s configuration space is non-empty (the predicate is not vacuously satisfied).

A correct model needs every `check` UNSAT and every `run` SAT. A vacuous `run` (UNSAT) is a finding: the example demonstrates nothing.

## Pitfalls & checker dialect

The *authoring* pitfalls — vacuity, store-scoping transitions, deriving idealizations instead of lagging them with a flag, saturating the bound, and the "model present" bar — are methodology and live in [`pressure-testing.md`](../../pressure-testing.md) §"Formal-model authoring pitfalls" and §"The formal-layer vote → the model-present bar". Read those before authoring. What follows is purely operational — the harness/checker quirks that cost real time:

**Checker dialect (the WASM `tla-checker`).** Mirror the idiom already proven in the repo, not generic TLA+:

- **Junction lists must be column-aligned.** Every `/\` (or `\/`) in a bulleted conjunction/disjunction list must start at the same column, or the parser errors. A multi-line `Next == A \/ B` continued on the next line at a different indent will fail (caught on `medication-order.tla`). Write each disjunct on its own line, all `\/` aligned.
- **Avoid the `Sequences` module.** The checker handles `Naturals` / `FiniteSets` / functions reliably; the existing models avoid `Sequences`. Model an ordered log as an indexed function `1..MaxLen -> Elem` with a `len` counter, not a sequence.
- **`ACTION_CONSTRAINT` is supported**, but a non-deterministic *function choice* in `Init` (`f \in [D -> R]`) and empty-set assignments are also fine — if you get `NoInitialStates`, suspect a **variable declared in `vars` but never assigned in `Init`** before blaming a construct (that was the real cause of the `privileged-access-provisioning.tla` `NoInitialStates`, not the `ACTION_CONSTRAINT` it superficially resembled).

**`NoInitialStates` / typecheck errors are HARD FAILS, not skips.** A TLA+ model the checker can't find an initial state for, or an Alloy model that doesn't typecheck, has verified *nothing*. `check.mjs` treats both as failures; never wave one past as "the checker doesn't support this." Diagnose it.

**Operational gotchas in this sandbox.**

- **Provision from npm only.** apt (no sudo), Maven, Adoptium, and GitHub release downloads are all blocked; the npm registry is the one reachable source. The JRE comes from the `javajre-linux-64` npm package, the Alloy jar is extracted from the `Alloy.app` bundle (`Contents/Resources/org.alloytools.alloy.dist.jar`), not downloaded.
- **The JRE must live on native `/tmp`, not the mounted repo FS.** Unpacking it into the mount drops `libjli.so` and the launcher dies with exit 127 (`bootstrap.sh` installs it to `/tmp/javajre`).
- **Alloy writes its per-command `SAT`/`UNSAT` results to stderr**, not stdout — capture both streams (`check.mjs` uses `spawnSync` for this reason).
- **Background jobs don't survive across independent shell calls.** A long `node audit.mjs &` started in one shell invocation is killed before the next; run long jobs inline and poll, or break the audit into per-model calls.
