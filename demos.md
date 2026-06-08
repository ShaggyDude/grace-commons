---
title: Demos
nav_order: 5
has_toc: false
---

# Demos

> Live reference implementations — real, deployed software that faithfully renders the grounded specifications in this library. The spec is the canonical artifact; the renders honor it (hand-written today, with mechanical generation the direction we're building toward). Each demo's **RECIPE** is generated from its own code by [`tools/recipe/generate_recipe.py`](https://github.com/scottromack/grace-commons/blob/main/tools/recipe/generate_recipe.py), so a demo's *description* can't drift from what the code actually contains. Click any demo, then read its RECIPE to see the exact tree of atoms and compositions it is built from.

| Demo | What it demonstrates | Tests | Live | Built from |
|---|---|---|---|---|
| **Beacon Clinical Research Portal** | External onboarding (invitation → party → credential), login, session-gated authorization, and subject / study / visit management — over an HMAC-attested, hash-chained, tamper-evident audit trail. | 107 | [beacon-clinical.fly.dev](https://beacon-clinical.fly.dev/) | [RECIPE](https://github.com/scottromack/grace-commons/blob/main/demos/clinical-trial-portal/RECIPE.md) |
| **Multi-Party Approval** | N-approver approval chains with all-of-N / M-of-N / one-of-N quorum rules and trailing-decision semantics, an approver in-tray, and a tamper-evident audit log. | 67 | [grace-commons-mpa.fly.dev](https://grace-commons-mpa.fly.dev/) | [RECIPE](https://github.com/scottromack/grace-commons/blob/main/demos/multi-party-approval/RECIPE.md) |
| **Attributed Permissions Admin** | Attributed grant / revoke administration pairing Permissions with Actor Identity; ships a dynamic Alloy model verifying its load-bearing temporal claims. | 35 | [grace-commons-alloy.fly.dev](https://grace-commons-alloy.fly.dev/) | [RECIPE](https://github.com/scottromack/grace-commons/blob/main/demos/attributed-permissions-admin/RECIPE.md) |

The Multi-Party Approval and Attributed Permissions Admin demos run on a minimal Deno / Hono / SQLite stack. The Beacon portal goes further: the *same* specs are rendered on four very different stacks — the sharpest evidence that the meaning lives in the spec, not in any one implementation. See **Beacon — one spec, four renders** below.

The **RECIPE** beside each demo is the authoritative answer to *"what is this built from?"* — generated from the code and validated against the library, so any claim about a demo (which atoms, which compositions) is falsifiable against its tree rather than taken on trust. None of these demos contains a capability its RECIPE does not list; a demo's RECIPE also names, explicitly, the compositions it does **not** contain.

---

## Beacon — one spec, four renders

The Beacon Clinical Research Portal is rendered four ways from the *same* Grace Commons specs — same compositions, same action codes, same hash-chain contract. Only the stack changes:

| Render | Stack | Status |
|---|---|---|
| 1 | Deno · Hono · SQLite · HTMX | **Live** — [beacon-clinical.fly.dev](https://beacon-clinical.fly.dev/) |
| 2 | Next.js 15 · PostgreSQL · React Server Components | [source](https://github.com/scottromack/grace-commons/tree/main/demos/clinical-trial-portal-next) — live demo pending deploy |
| 3 | Go (headless) · Python verification twin | [source](https://github.com/scottromack/grace-commons/tree/main/demos/clinical-trial-portal-go) — cross-language chain proof |
| 4 | MongoDB (headless) · mongodb-memory-server | [source](https://github.com/scottromack/grace-commons/tree/main/demos/clinical-trial-portal-mongo) — document-store proof: where Postgres-carried invariants go when the declarative layer disappears |

The payoff is the part with no shared code: a Go-produced audit chain verifies **byte-for-byte** under render 2's TypeScript canonical contract. Three languages, one canonical contract — and render 4 shows the same chain surviving an engine swap in the other direction: stored in BSON documents, re-keyed, it re-verifies under the same verifier. The total ordering that chain requires is satisfied four different ways — SQLite's single-writer lock, PostgreSQL's advisory lock, a Go mutex, and a MongoDB replica-set transaction with a unique-index fork guard — for the one invariant the [Event Log](https://github.com/scottromack/grace-commons/blob/main/atoms/temporal/event-log.md) spec already states: the mechanism is per-stack, the invariant is canonical. Render 4 also carries the sharpest enforcement question — MongoDB has no foreign keys, no CHECKs, no schema-level delete discipline — and answers it with an explicit invariant → enforcer table in its [README](https://github.com/scottromack/grace-commons/blob/main/demos/clinical-trial-portal-mongo/README.md): every spec invariant survived; only the enforcement locus moved.

That byte-for-byte result is reproducible from the Go render's own verifier ([`verify.mjs`](https://github.com/scottromack/grace-commons/blob/main/demos/clinical-trial-portal-go/verify.mjs)); a separate, broader agreement check across the library's conformance renders — the Mongo render included — is a re-runnable number in [`tools/conformance`](https://github.com/scottromack/grace-commons/tree/main/tools/conformance). Both are written up in [DISCOVERIES](https://github.com/scottromack/grace-commons/blob/main/DISCOVERIES.md).
