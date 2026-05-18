# Demos

Working implementations of Grace Commons compositions. Each demo is a build artifact derived from a canonical spec under [`../compositions/`](../compositions/). The thesis the library defends — *code is derived, the spec is canonical* — is demonstrated by the demos sitting adjacent to the specs they implement.

## Implementation-discovered findings

Building against a spec sometimes surfaces problems. Two outcomes are recognized, and they route to different places per the discipline in [`../CLAUDE.md`](../CLAUDE.md) §"Implementation-discovered findings":

- A **finding** is a contradiction inside the spec — an action wiring and an invariant disagree, two passages describe different behavior for the same case, an example violates an invariant. Findings are Pass-3-shaped and belong in the pattern's *Lineage notes* under a new pass entry. They route through the standard review channel; the spec does not change mid-build.
- A **preference** is anything else — *"this would be cleaner if…"*, *"I'd rather have one table than four"*, *"the column name is awkward"*. Preferences are implementation choice and belong in the demo's own follow-up tracker, conventionally a `CORNERS.md` alongside the build.

The single distinguishing question: does the observation name a contradiction *inside* the spec, or a preference *outside* it? If the answer is not obviously the first, it is the second.

## Demos in this library

- [`multi-party-approval/`](./multi-party-approval/) — implements the [Multi-Party Approval](../compositions/multi-party-approval.md) composition. Deno + Hono (JSX) + SQLite + HTMX + Tailwind. Originated as a freestanding repo (grace-commons-demo) and was migrated into the spec library so the spec-to-implementation loop is colocated.

*A demo's `README.md` names the spec it implements, the stack it uses, how to run it, and where to find the composition's emergent invariants exercised in tests.*
