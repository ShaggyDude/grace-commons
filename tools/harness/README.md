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
node check.mjs ../../atoms/compliance/party-identity.tla
node check.mjs ../../compositions/session-gated-authorization.als

# A buggy twin must be REJECTED (the vacuity guard):
node check.mjs ../../atoms/compliance/party-identity-buggy.tla --buggy

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
