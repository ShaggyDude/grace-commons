# The Routing Test — a portable checklist for "where does this service go?"

> **Status: internal staging, not canonical.** A standalone, architecture-agnostic decision procedure for routing any service-shaped concern to a declared home. Extracted from `working-ideas/no-global-services.md` (the full argument and worked defenses live there). Deliberately written to be usable without any Grace Commons vocabulary — the test is portable to microservice meshes, Kubernetes operators, event-driven systems, enterprise integration, and AI-agent architectures. If it earns canon it folds into `execution-contract.md` as a review gate.

---

## The premise

Most "complexity" in a system is *undeclared authority*: behavior that any part can reach for, that no one declared anywhere you can read. The discipline: **every service-shaped thing must have a declared architectural destination, and nothing in the meaning layer may acquire undeclared authority.**

There are exactly four destinations. The mnemonic:

> **Concepts own meaning. Callers own initiative. Values own facts. Obligations own mechanics.**

---

## Step 0 — Decompose first (the step everyone skips)

Most "services" are several things wearing one name. Route the pieces, not the label.

- *Logging* = diagnostic telemetry (mechanism) + domain history (concept).
- *Cache* = a store (mechanism) + invalidation, i.e. derivation knowledge (a rebuildable projection).
- *Fraud detection* = an assessment record (concept) + a scoring engine (caller) + scoring math (mechanism).
- *Auth* = a principal fact (value) + session/credential/permission state (concepts).

**Rule:** if a candidate bundles *meaning + initiative + mechanism*, split it until each piece routes cleanly. A piece that won't decompose is ready to route.

---

## The four questions — ask in order, first match wins

For each piece from Step 0:

1. **Is it a fact the environment supplies?** (clock, fresh id, current principal, locale, a random draw, a feature decision)
   → **VALUE.** Inject it as a parameter at the boundary. The logic never reaches out for it; it is *told*. *(Determinism falls out for free — the reason this is worth doing.)*

2. **Does it carry domain-visible state that someone's invariant depends on?** (history, permission, consent, attribution, retention, an assessment, a balance)
   → **CONCEPT.** Give it explicit state and *named invariants*. This is the bucket the others are tested against — when in doubt, ask "would a person point at this and say *what's true about it?*" If yes, it's a concept.

3. **Does it act on its own initiative or schedule?** (cron, sweeper, retry daemon, escalation timer, a scoring engine, a reconciler)
   → **CALLER.** Push it *outside* the meaning layer; let it act through declared surfaces, like any other client. *(Watch: many dissolve. "Expired" is a predicate computed from state + injected clock, not a flag a sweeper sets. Derive, don't lag — and the biggest daemon disappears.)*

4. **Is it domain-blind mechanism the runtime provides?** (transaction/atomicity, durable store, the event loop, the scheduler itself)
   → **OBLIGATION** — but only if it passes the admission test below. An obligation is compiled against and conformance-checked; it is never an API a concept can call.

**Sub-case — is it a rebuildable projection over other state?** (a cache, a search index, a read model, a denormalized view)
   → **DERIVED INDEX** (a disciplined sub-kind, not an obligation): carries no truth, has a *named rebuild procedure*, best-effort consistency. It's a materialized view, not a service. Most "infrastructure" that feels global lands here once you notice it's just acceleration over truth that lives elsewhere.

---

## The obligation admission test — all five, or it's not an obligation

Destination 4 is the junk-drawer risk. Gate it. A candidate qualifies **iff it passes all five**:

1. **Domain-blind** — holds no domain state, understands no domain type. *(Fail → Concept.)*
2. **Bears no domain invariant of its own** — it may *realize* a behavior the spec depends on, but carries no invariant itself. *(Fail → Concept.)*
3. **No callable surface in the meaning layer** — realized by the runtime, never handed to the logic. *(Fail → Concept or Caller.)*
4. **Domain-uniform** — identical across every domain; never specialized per domain. *(Fail → the specialization is smuggled meaning → Concept.)*
5. **Conformance-checkable** — its correct provision is mechanically verifiable, not argued by domain reasoning. *(Fail → it's an **assumption**, not an obligation. "The network is reliable" passes 1–4 and fails 5.)*

**The one rule that resolves the hardest case — depend on the behavior, never the mechanism.** The system legitimately rests on *action-grain atomicity* (a behavior: "these writes commit together or neither is visible"), declared at the seam and conformance-checked. It does **not** rest on *transactions* (the mechanism: DB txn, saga, single-writer queue — the runtime's free choice). The behavior is declared above the contract; the mechanism is the obligation below it. This is why "the whole system relies on atomicity" is not a counterexample: it relies on the behavior, which is declared, not on any mechanism, which is hidden by design.

---

## Quick-reference routing table

| Conventional "service" | Destination | Form it takes |
|---|---|---|
| Clock, entropy/IDs | Value | injected parameter at the boundary |
| Current user / locale / flag | Value (+ Concept) | principal injected; session/permission state is concept |
| Domain history / audit | Concept | an append-only log concept with invariants |
| Diagnostic logging / metrics | Below-contract mechanism | nothing's invariant rests on it; not a citizen |
| Permission / consent / retention | Concept | state + named invariants |
| Fraud / risk scoring | Concept + Caller | assessment record (concept) written by an engine (caller); math below contract |
| Cron / sweeper / reconciler | Caller (often dissolved) | derive a predicate first; else a caller on a declared surface |
| Retry daemon | Caller | a durable record (concept) + whoever reads it |
| Cache / search index / read model | Derived index | rebuildable projection, named rebuild, best-effort |
| Transaction / atomicity | Obligation | declared behavior at the seam; mechanism compiled + checked |
| Durable store, event loop | Obligation | runtime contract, conformance-checked |
| Service mesh / gateway / discovery | (dissolved) | the wiring *is* the mesh; declared edges replace it |
| ORM lazy-load / implicit join | Forbidden | undeclared meaning — make the edge explicit |

---

## Tells you mis-routed

- A "mechanism" that needs to know domain types → a **concept** in disguise.
- An "obligation" you can't conformance-check → an **assumption**, not an obligation.
- A "value" that has a lifecycle → it's **state**, so a concept, not a fact.
- A background job whose state nobody can read → a **missing concept** (name the state it acts on).
- Two pieces that only stay consistent if one secretly calls the other → **undeclared wiring**; make the edge explicit.
- Everything keeps landing in the obligation bucket → you skipped **Step 0**; decompose harder.

---

## Run it on a candidate in 60 seconds

```
Candidate:        ____________________________
Decompose into:   ____ + ____ + ____           (Step 0)
For each piece:   question that fires → destination → form
Residual claimed
as obligation:    run the 5-point admission test → pass / fail
If any fail:      re-route to Concept / Caller / Value
Result:           every piece has a declared home; zero ambient authority
```

---

## Portability — the test without Grace Commons

The test is architecture-agnostic. The same four questions route the ambient services of any stack:

- **Microservice mesh.** The mesh (discovery, gateway, sidecar, bus) is the ambient-authority layer the test dissolves: edges become declared wiring; cross-cutting policies become concepts or callers; the transport is an obligation. "Is this a mesh feature or a domain concern?" is questions 2–4.
- **Kubernetes operators.** An operator that reconciles domain state is a **caller** acting on a declared surface; the control loop is an **obligation**; the desired-state spec is **values + concepts**. Operators that embed domain meaning in the controller are the mis-route the test catches.
- **Event-driven architecture.** The broker is an **obligation**; event schemas + projections are **concepts + derived indexes**; "eventually consistent" is the liveness concession — a caller/fairness assumption, named, not smuggled.
- **AI-agent systems** (the freshest case). The inference engine is an **obligation** (domain-blind mechanism; the API contract is its conformance surface). Tools are **declared surfaces**; the agent is the **caller** acting through them. Agent *memory* is a **concept** — state with invariants — which is exactly where today's agent frameworks are a mess, because memory is treated as ambient infrastructure instead of named, invariant-bearing state. Clock/context/current-task are **values**, injected. The orchestration loop is an **obligation**. Routing an agent stack with this test is a clean diagnostic for where its undeclared authority lives.

If the test routes arbitrary ugly real-world services without special pleading, the underlying claim is general: **what we call "infrastructure" is mostly undeclared domain meaning, and a discipline that refuses to hide meaning forces it back into the open.**

---

*Source argument and worked defenses: `working-ideas/no-global-services.md`. Falsifiability instrumentation for the broader thesis: `working-ideas/falsifiability-metric.md`.*
