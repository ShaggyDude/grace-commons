# No global services? — the four-destination decomposition (2026-06-12)

> **Status: internal staging, not canonical.** Working argument for the 2026-06-24 call (Jackson + students), drilling into the claim that the architecture has no ambient services. Doubles as the skeleton answer to Jackson's "you're pushing the execution framework into explicit concepts — I don't yet see how it can work." If any of this earns canon status it folds into `execution-contract.md` (the routing rule) and `the-spec-layer.md` (the thesis framing); the call-prep framing dies with the call.

---

## The claim, stated carefully

Global services don't get *eliminated* — they get **decomposed into four destinations**, none of which is an ambient API a concept can reach for. The slogan: **ambient mechanism below the contract, zero ambient authority above it.** "Global" survives only as mechanism without meaning: no domain state, no invariants of its own, no callable surface in the spec layer.

**Read one layer down, this is a claim about authority, not services.** The four destinations are an authority taxonomy: values carry *no* authority (they're facts), concepts carry *declared* authority (state with stated invariants), callers carry *external* authority (they act from outside, through declared surfaces), and contract obligations carry *mechanical* authority (domain-blind machinery the runtime provides). The real thesis under the slogan: **the purpose of the decomposition is not to eliminate mechanism — it is to ensure every mechanism has a declared architectural role, so that no domain meaning hides inside unnamed infrastructure.** "No global services" is the surface claim; "nothing in the semantic layer may acquire undeclared authority" is the one that's hard to dismiss. (This is the no-ambient-authority rule, `pressure-testing.md` §Capability provenance, lifted from invariants to the whole execution surface.)

The compression, memorable form — **concepts own meaning, callers own initiative, values own facts, obligations own mechanics.** This is why the framework survives argument: it's a *classification system*, and every objection collapses to "fine — which bucket does this belong in?" — a question with a decidable answer, not a debate. That is exactly where a sharp reader (Jackson) will push, and the right response is to welcome it: hand them a nasty service and route it live.

The test that sorts any conventional global service: ask four questions in order.

1. **Does it answer a question the environment knows?** → it becomes a **value**, injected at the pipeline boundary.
2. **Does it carry domain-visible state someone's invariant rests on?** → it becomes a **concept** (atom), with the invariants stated.
3. **Does it act on its own schedule?** → it becomes a **caller**, outside the spec layer, acting through declared surfaces.
4. **Is it meaning-free mechanism?** → it becomes a **contract obligation** on the projector, checked by conformance — never an actor.

The one sorting criterion that makes this concrete — and the fastest way to demo the test live — is that **the same word often routes to different destinations depending on whether an invariant rests on it.** "Logging" is the canonical case (worked under Destination 2): diagnostic logging is mechanism (destination 4), domain history is a concept (destination 2), and the question that separates them is *does anyone's invariant rest on it?* Run that split on the board first; it converts the test from philosophy to engineering in one example.

---

## Destination 1 — Values

The two most universal ambient services in any stack are already gone: the clock and the ID generator are read as direct effects at Step 3 and injected into the transition as parameters (`execution-contract.md` §The execution pipeline: "T does not call the clock or entropy source internally" — Logic Confinement; `glossary.md` pins `now` as "the injected clock value at action time"). The spec layer sees `clock_t` as a *value*, never time as a *service*.

Generalization: anything whose ambient form is "ask the environment" — current principal, locale, feature decision, random draw — arrives as a parameter at the boundary. The transition stays a pure function of its inputs; the formal layer gets determinism for free, which is precisely what makes the models checkable.

## Destination 2 — Concepts

Anything carrying domain-readable state with must-be-trues becomes an atom: logging→Event Log, attribution→Actor Identity, permission→Permissions, retention→Retention Window, secrecy-of-disclosure→Selective Disclosure. The enforcement mechanism is the **no-ambient-authority rule** (`pressure-testing.md` §Capability provenance): an invariant may rest only on explicitly declared capability. Middleware cannot exist above the contract because middleware is exactly *meaning without a declaration* — an interceptor whose behavior no spec names is an orphaned reference by definition.

**The judo for the call:** this is Jackson's own move. Trash took what operating systems buried as infrastructure — deletion — and made it a user-facing concept with an operational principle. Event Log does to logging what Trash did to deletion; Actor Identity does it to attribution; Retention Window does it to the cleanup job. We are running the concept-design program further down the stack than its author did, and the execution contract is what's left when you run out of concepts.

**The worked split that makes this concrete — "logging" is two different things:**
- *Diagnostic logging* (debug traces, metrics): no domain invariant rests on it → stays below the contract as mechanism. Not a concept, never will be.
- *Domain history* (who did what, what happened): invariants rest on it (replay, audit, undo) → Event Log, an atom with append-only/immutability/total-order invariants.

Same word, two destinations, and the sorting criterion is the question in the test: *does anyone's invariant rest on it?*

## Destination 3 — Callers

The global services that *act* — schedulers, sweepers, retry daemons, escalation timers — leave the spec layer entirely and return as ordinary callers against declared surfaces. Two mechanisms make this possible:

- **Derive, don't lag** (`pressure-testing.md` §Formal-model authoring pitfalls): expiry needs no sweeper because *expired is a predicate computed from state + injected clock*, not a flag something must remember to set. The biggest daemon in most systems dissolves into a derived query.
- **Retry as state + whoever shows up:** the orphan log (attributed-permissions-admin) is the worked example — failed-pairing evidence is durable, attributed state with its own invariant (Invariant 8, append-only), and the retry *worker* is just a caller reading it. The spec obliges the surface, not the actor.

**The honest seam here — liveness.** `glossary.md` defines *eventually* as "guaranteed to occur in finite time." Guaranteed by whom, with no daemon in the spec layer? Answer with the formal layer's own vocabulary: liveness claims are conditional on callers existing, and in TLA+ that conditionality has a name — **fairness assumptions**. A fairness assumption *is* the caller destination in formal clothing. Where a spec says "eventually," it is either (a) actually a derived predicate (no actor needed — the expiry case), or (b) an obligation on the deployment's operational surface, stated as such. We should say this plainly on the call before a student finds it: safety is unconditional in this architecture; liveness is contracted to the deployment.

## Destination 4 — Contract obligations

The irreducible residue: durable store, atomic multi-write at the action grain, the event loop. These stay global — as **mechanism, never meaning**. No domain state, no invariants of their own, no API a concept can call. They are obligations the projector compiles against and conformance checks (`execution-contract.md` §Conformance: pipeline order, injection, no mutation outside Step 3, named rejections, invariants hold, Q-consistency, Generation acceptance).

**The line to hold when Jackson pushes on pairing-write atomicity:** a concept cannot reach for the transaction manager. The wiring *declares* atomicity at the action grain; the projector *realizes* it; conformance *checks* it. Whether the realization is a DB transaction, a saga, or a single-writer queue is below the contract — exactly as a compiler may allocate registers however it likes so long as the calling convention holds. The contract is the *calling convention*; concepts have no `beginTransaction()` in their vocabulary. The question "but who provides the transaction?" has the same answer as "who provides the stack frame?" — the runtime, by contract, invisibly to the semantics.

### The membership rule — what may enter the obligation bucket (closing the escape hatch)

This destination is where skeptics keep digging, and rightly: "the runtime provides it" can absorb *any* uncomfortable global concern unless entry is gated. Durable store, event loop, and atomic multi-write are not small things, and without a qualification test the bucket becomes a place to declare hard problems solved by relabeling them. So the bucket has a membership rule, and it is just the no-ambient-authority rule read as an admission test. A candidate qualifies as a contract obligation **iff it passes all five:**

1. **Domain-blind.** It holds no domain-visible state and understands no domain type. The transaction manager does not know what a `grant` is. *(Fails → it carries meaning → Concept.)*
2. **Encodes no domain meaning / bears no domain invariant of its own.** It may *realize* a behavior the spec depends on, but it carries no invariant of its own and knows nothing about the domain. *(Fails → it carries meaning → Concept.)*
3. **Exposes no callable surface in the spec layer.** No concept can name or invoke it; it is realized by the projector, not handed to the wiring. *(Fails → it's a service with authority → Concept or Caller.)*
4. **Domain-uniform.** It applies identically across every domain; it never needs per-domain specialization. *(Fails → the specialization is the smuggled meaning → Concept.)*
5. **Conformance-checkable.** Its correct provision is verifiable mechanically against the conformance contract (pipeline order, action-grain atomicity), not by domain reasoning. *(Fails → it isn't an obligation, it's an unverified **assumption** — and this is why criterion 5 is not redundant with 2: 2 asks whether it carries meaning; 5 asks whether its provision can be checked. "The network is reliable" passes 1–4 and fails 5 — domain-blind but unverifiable, so an assumption, not an obligation.)*

**The principle criterion 2 turns on — the spec may depend on the behavior, never on the mechanism.** This is the line that answers the strongest objection ("the whole system relies on atomicity, so how can the obligation bear no invariant?"). Resolve it by splitting atomicity in two: the *behavior* (action-grain atomicity — "these writes commit together or neither is visible") is **declared in the wiring** and **conformance-checked**, so the spec legitimately rests on it — it is not ambient, it is named at the composition layer. The *mechanism* (a DB transaction, a saga, a single-writer queue) is the **obligation** — domain-blind, the projector's free choice, bearing no invariant of its own. APA's Invariant 1 *Rests on:* action-grain atomicity (declared behavior); it does **not** rest on transactions (mechanism). The obligation owns the mechanics; the wiring owns the behavior. A concept never holds a `beginTransaction()` handle because the behavior it needs is already declared above it and realized below it.

The one-line form: **the obligation bucket is for mechanism that is domain-blind; the moment a candidate needs to know what the domain means, it has failed and belongs in another destination.** This is why the bucket *can't* swallow every global concern — most uncomfortable global concerns are uncomfortable precisely *because* they carry domain meaning, and domain meaning is disqualifying on 1, 2, and 4. The test turns "the runtime handles it" from a hand-wave into a falsifiable admission test: name the candidate, run the five, and if it passes it is genuinely mechanism; if it fails, the architecture *requires* you to give it a concept or a caller — the opposite of hiding it.

### Routing three nasty services live — the falsification demo (run 2026-06-12)

Jackson's likely next move, anticipated: *"show me three real-world services people think are infrastructure, and route them without special pleading."* Ran his three. The pattern is the punchline: **in every case the part everyone calls "infrastructure" is actually domain meaning the architecture forces into the open, and only a thin genuinely-mechanical residue reaches the obligation bucket — or nothing does.**

- **Distributed cache invalidation.** Splits in two. The cache *store* is domain-blind mechanism. But *invalidation* — knowing what to drop when X changes — is derivation knowledge, which is domain-shaped: it fails criterion 1. So it does **not** enter the obligation bucket. It is the **derived-index** construct the repo already owns (`execution-contract.md` §Composition state): a rebuildable projection with a *named rebuild procedure*, carrying no truth, best-effort-consistent per the boundary rules. The thing teams find hard about cache invalidation is hard *because* it's domain meaning masquerading as infra; the architecture makes the rebuild procedure explicit instead of hiding it behind an eviction policy.
- **Fraud detection.** Fails criterion 1 instantly — fraud scoring is all domain meaning. Routes to **Concept + Caller**: a Risk/Fraud Assessment *concept* (the assessment record, attributed, with its own lifecycle and invariants) written by a *caller* (the scoring engine, acting on its own schedule through the assessment's declared surface). The scoring *math* is below-contract mechanism; the *assessment state* and the *act of assessing* are named. No special pleading.
- **Search indexing.** Like the cache: a **derived index** (a rebuildable projection over the source records, reindex = the named rebuild, best-effort freshness) plus a below-contract search *engine* (inverted-index internals, ranking math) that is genuine domain-blind mechanism. The index *content* is derived; the engine *internals* are obligation-grade mechanics; the "what to index / relevance" judgment is domain meaning that surfaces as the projection's definition, not as hidden infra.

Net: zero of the three land *wholly* in the obligation bucket; each decomposes into (domain meaning → concept/caller/derived-index) + (thin mechanical residue → below the contract). If the test keeps refusing to let domain-flavored "infrastructure" into the bucket across arbitrary ugly examples — and so far it does, without special pleading — then this is less a Grace Commons argument and more a general architectural theorem: **what we call infrastructure is mostly undeclared domain meaning, and a discipline that refuses to hide meaning will always force it back into the open.**

---

## Worked routings (the table to draw on the whiteboard)

| Conventional global service | Destination | Form it takes here |
|---|---|---|
| Clock | Value | `clock_t` injected at Step 3 |
| ID/entropy | Value | `id_t` injected at Step 3 |
| Auth context ("current user") | Value + Concepts | principal injected; Session / Credential / Actor Identity carry the state |
| Audit interceptor | Concept | Audit Trail substrate — declared, composed, invariant-bearing |
| Domain history | Concept | Event Log |
| Diagnostic logger | Contract-side mechanism | below the spec layer; no invariant rests on it |
| Cron / sweeper | Caller (often dissolved) | derived predicates first; else a caller on a declared surface |
| Retry daemon | Caller | orphan log + whoever reads it |
| Transaction manager | Contract obligation | declared action-grain atomicity, compiled + conformance-checked |
| ORM / lazy loading | Forbidden | implicit joins are undeclared meaning (`execution-contract.md` §Not permitted) |
| Cache | Derived index | rebuildable projection, outside the atomicity surface, carries no truth |
| Message bus fan-out | Decomposition boundary | fan-out is a composition property (directed invocation graph), async at the edge only |
| Feature flags / config | Declared knob | the spec's Configuration section — looks ambient, is declared |

---

## "Isn't this just microservices?" — the inversion

A student's likely first reflex, and the precise answer is more flattering than the loose one. An atom *is* a vertical, end-to-end slice — it owns its state, actions, guards, projection, and store, top to bottom. That's the bounded-context discipline microservices aspire to and mostly fail at. The analogy then inverts in three ways, all of which favor the architecture:

- **Microservices are global-services taken to the extreme.** A real deployment runs on service mesh, API gateway, message bus, service discovery, distributed tracing — ambient infrastructure everywhere (Istio/Consul/Kafka). Atoms are microservices with the mesh *deleted* and replaced by the four destinations. This section is the no-global-services thesis restated: the mesh is exactly the ambient authority the four destinations route away.
- **Cut on the right axis.** Microservices are decomposed by team or deploy unit — Parnas's wrong axis — and curdle into distributed monoliths. Atoms are cut by *concept* (one concept, one home), the axis along which meaning actually factors.
- **Contract at the seam, and no distribution tax.** Microservices carry OpenAPI at best and discover their interactions in production; atoms carry named invariants and emergent-invariant accounting *at composition time*. And because an atom is a *spec*, not a process, it compiles to an in-process call or a network service at the deployment's choice — the bounded-context guarantee is enforced at the spec layer, not bought with network hops.

Honest caution: "microservice" is right about the vertical-slice/own-your-state part, wrong about the distribution part — atoms do not require separate processes (async at the edge only; a composition is a stateless interpreter, often in-process). The one-liner: **microservices separate processes and need a mesh to reconnect them; atoms separate concepts and reconnect them by declared wiring — no mesh, because the no-global-services rule killed it.**

## Rendering as a corollary

If every visible state is a projection (Q/R over record sets), rendering is one more projection plus action dispatch back into the pipeline. The scale precedent is the spreadsheet: cells = explicit state, formulas = pure derivation, recalc = replay — the largest no-ambient-services computing tradition in history, running most of the world's business logic. Grace Commons is trying to give *behavior* the property Excel gave *calculation*.

Residue, classified by our own rules: optimistic/in-flight presentation state (focus, pending indicators, render-before-commit) is ephemeral, call-stack-local, carries no truth — the composition-state rule already has a drawer for it. Worth stating as a theorem-shaped claim on the call, not a boast: *rendering is trivial exactly to the degree that no ambient state exists for it to disagree with.*

### The rendering residue, drilled (2026-06-12 follow-up)

Four small problems, not one; three route through existing machinery, one is a genuine boundary.

1. **Optimistic rendering is safe because rejection taxonomies are closed.** The gap between act and commit shows a *prediction*. Conventional optimistic UI is risky because failure is open-ended; here every action carries a named, closed rejection set, so the pending state and every reconciliation path are *generatable from the spec*. The complete error-state inventory exists before anyone designs it.

2. **Realtime mutation splits like logging did.** "The screen refreshes" is mechanism below the contract (no invariant rests on freshness; the recalc trigger is the spreadsheet's dependency graph). "The user is notified" is the Notification concept (delivery is domain truth). Cross-atom screens inherit best-effort read semantics (§Boundary rules) — momentarily torn composite views are a *design surface* (per-region freshness, visible seams), never a promised atomicity. Time-driven truth needs no push at all: the screen is a projection of (records, `now`) — time is an input to the *view*, so countdowns and expiry displays belong to rendering, not state, and even the display layer needs no sweeper.

3. **Selection is a view.** Presentation state that *references* records (multi-select, focus-on-row) can be orphaned by realtime change. Derive-don't-lag applies to UI state verbatim: selection validity is computed (`selection ∩ current records`), never stored. Most collaborative "ghost row" bugs are lagging flags.

4. **The genuine boundary: continuous co-editing.** The architecture's realtime is live multiplayer over *discrete actions* — collisions serialize and lose with named rejections. Character-level convergent co-editing (docs/canvas) is not wiring; it is a missing atom (convergent replicated value, CRDT-shaped), and its load-bearing property — convergence — is invariant-shaped and formally provable. Name it on the call as a known boundary with a known shape; candidate for the dream-atom backlog alongside `working-ideas/dream-compositions.md`.

---

## Answering Jackson's email — the noun / verb / adjective / mechanism grammar (2026-06-13)

Jackson's 2026-06-07 reply put the sharpest version of the hold on the table (paraphrased): *you're admirably trying to push part of the basic execution framework — event logging and execution itself — into explicit concepts, and I don't yet see how it can work.* Three concrete prongs sit under it: (1) shouldn't the action that appends the undo event simply be Event Log's action? (2) what are the *syncs* that keep the actions performed aligned with what's in the log? (3) how does the actual historical trace of everything that happened relate to what's in the Event Log *concept*? The answer is a **grammar** — the generalization of the *"owns non-derivable state?"* blade the concept-recovery exercise hardened (acyclicity → 4th structural-relation invariant template, `spec-format.md` §Structural-relation invariant templates; the blade *refused* concept-hood to a thing recurring across six systems, purely because it owns no state — the demonstration that the test isn't special pleading).

**The grammar.** Every element of a system is exactly one part of speech, sorted by what it owns:

- **Noun = concept (atom).** Owns *non-derivable, truth-bearing state* plus the invariants over it. Event Log is a noun.
- **Verb = action.** Owns no state; acts on a noun. May be *emergent* — introduced at composition, belonging to no single constituent.
- **Adjective = invariant.** Owns no state; constrains a noun, or a relation between nouns. The structural-relation invariant templates (referential integrity, orphan-freedom, inverse consistency, acyclicity) are adjectives.
- **Below the contract = mechanism.** Owns no domain *meaning* at all — durable store, the event loop, diagnostic logging.

"Does it own non-derivable state?" is just "is it a noun?" — the noun-test is the blade, generalized.

**The meta-answer to the hold.** *You don't push execution into concepts — you sort it.* The worry assumes "make logging/execution a concept" is one move that either works or fails. It isn't a move; it's a **parse**. Only the state-owning **noun** becomes a concept — Event Log is the *domain history*, the part invariants rest on. The rest of "execution" sorts elsewhere: the reversal is a **verb**, the alignment is an **adjective**, and the genuinely ambient parts (the event loop, diagnostic logging) stay **below the contract** as mechanism, never concepts. Nothing is smuggled into concept-hood that doesn't own state — and the acyclicity reclassification is the live proof the architecture will actually *refuse* the smuggling when tempted.

**The three prongs, answered in the grammar:**

- *Trace vs. Event Log (prong 3).* Not the same object. Event Log is the **noun** — the subset of everything-that-happened that domain invariants rest on (domain history). The remainder of the real trace (diagnostic, operational) is **mechanism below the contract**: no invariant rests on it, so it is not a concept. Discriminator: *does an invariant rest on it?* — the noun-test. The Event Log concept is a *purposeful projection* of the trace, not a mirror of it.
- *Where the undo-append action lives (prong 1).* The *append* is Event Log's **verb** — conceded, it is Event Log's action. But `undo` is a *different* verb: it appends **and** carries replay-skipping semantics that Event Log, being content-agnostic, cannot hold. `undo` owns no new state (the undone-set is re-derived on replay — a derived index), so it earns no noun of its own; it is an **emergent composition verb** that calls Event Log's append and adds meaning at the wiring layer.
- *The syncs aligning actions with the log (prong 2).* Not hidden glue — a named **adjective**: the log-faithfulness invariant (every performed action ↔ its append). Owns no state; constrains the relation between the composition's actions and Event Log's records. It is exactly the *relation-invariant class* the acyclicity result made first-class — so the "sync" has a name and a canonical home, not ambient coordination.

**The honest residual — and why it's the reason the call matters.** Jackson named prong 1 — *compositions having actions that belong to no atom* — as the thing he most wants to dig into live, and he's right that it is the least-settled. The grammar gives `undo` a home (emergent verb) and a reason (owns no state), but *where an emergent verb lives, and what governs it, when its meaning is composition-level* is a genuine open seam (our own note: "even undo's mutation is just Event Log's append — what's genuinely composition-level is the replay semantics, so where the action lives is a real question"). Do **not** walk in claiming this is closed. Walk in with the grammar as a sharp instrument and invite him to test it on the seam — that adversarial push is precisely what has been hardening the model (the acyclicity reclassification came straight out of this kind of pressure), so the open prong is the most productive item on the agenda, not a liability to hide. He is pushing the hard bits *for* us, and the seams he finds are where the architecture earns its rigor.

---

## Objections to rehearse before the 24th

1. **"Your atomicity obligation is a global transaction service with extra steps."** Hold the compiler analogy: declared at the wiring, realized below the contract, checked by conformance. The architectural content is that *concepts can't reach for it* — authority stays declared. The sharp form: **the contract is the calling convention; concepts have no `beginTransaction()` in their vocabulary.** There is no ambient transaction handle to grab because the wiring declares atomicity and the projector realizes it — the same way a function never allocates its own stack frame.
2. **"Liveness is unguaranteed."** Concede by design, stated as a doublet for the formal-minded: **safety is unconditional; liveness rests on fairness assumptions.** Liveness is contracted to deployment callers, and "fairness assumption" is that contract's formal name. Counter: most systems lie about liveness anyway (the cron job that silently dies); we make the contract explicit instead of implicit.
3. **"Cross-concept queries need a global query planner."** No cross-atom transactional read exists to plan (`execution-contract.md` §Boundary rules: best-effort projections over independent consistency domains). Anything needing more is a materialized-projection atom — named state, named invariants.
4. **"Performance is global by nature."** True and conceded: budgets crosscut module boundaries everywhere; this architecture doesn't claim otherwise. It claims *meaning* doesn't crosscut. Performance lives with the projector and deployment, where it always lived.
5. **"This is just dependency injection."** DI removes the *wiring* of services but keeps them services — callable, stateful, semantic. The four destinations remove the *service-ness*: values aren't callable, concepts are domain state with invariants, callers are outside, obligations aren't APIs. DI is the degenerate single-destination version.
6. **"Feature interaction killed this dream in telecom."** The seams are budgeted: emergent invariants are named, counted per composition, and the library is the experiment — if emergent-invariant count per composition grows with corpus size, the thesis fails. 24 compositions into the measurement, it hasn't. (Counting rule and trip-wires: `working-ideas/falsifiability-metric.md`.)
7. **"The obligation bucket is where you hide the hard parts."** GPT's challenge, and the sharpest one. Answer with the five-part membership rule above: the bucket admits only domain-blind, invariant-free, uncallable, domain-uniform, conformance-checkable mechanism. Name any candidate and run the five live — the uncomfortable global concerns a skeptic has in mind (reconciliation, scoring, entitlement) fail on domain-meaning and route to Concept or Caller, where they get named state and invariants. The rule converts "the runtime handles it" into a falsifiable admission test.

---

## One-page call brief (compression of the above)

**Claim:** no ambient authority above the execution contract; ambient mechanism below it.
**Mechanism:** every conventional global service routes to one of four destinations — value (injected), concept (declared state + invariants), caller (outside, acting through declared surfaces), contract obligation (compiled + conformance-checked mechanism).
**Why it's your program, Daniel:** Trash : deletion :: Event Log : logging — concepts reclaimed from infrastructure, run further down the stack; the execution contract is what remains when you run out of concepts.
**What we concede:** liveness is contracted, not guaranteed; performance crosscuts; the atomicity realization is the runtime's, by contract.
**What's falsifiable:** seam growth. Emergent invariants per composition stay flat as the corpus grows, or the thesis fails. The library is the instrument.

---

## Open items surfaced by external review (2026-06-12, Grok pass — triaged)

Kept the two with teeth; the rest of that review was call-staging advice (lead with the test, table-as-centerpiece, brief-as-handout) and is not repo content. One suggestion **rejected**: coining a noun ("observability substrate") for the below-contract mechanism layer — it cuts against `glossary.md`'s keep-it-small discipline, and the namelessness of that layer is load-bearing (the point is that diagnostic logging is *not* a named architectural citizen). "Mechanism below the contract" stays the term.

Two meta-questions were already answered in canon and need no action: **invariant accounting** has a home (every composition's "Composition-level invariants" section — APA lists eight, Undo History seven), and the `beginTransaction()` / fairness-doublet sharpenings are folded above.

Two are genuinely open:

- **Falsifiability threshold — undefined, and the phrase is mine, not canon.** "Emergent invariants per composition stays flat" is a conversational coinage; the repo has no working definition or trip-wire. Before it can be a real claim it needs: (a) a counting rule for "emergent invariant" that isn't gameable by splitting/merging invariant statements, (b) a normalization (per-composition? per-constituent-pair? per-domain?), and (c) a declared trip-wire ("if the rolling mean of emergent-invariants-per-new-composition exceeds X over the last N groundings, the thesis is in trouble"). Cross-check against `measurement.md` and the no-snapshot rule (`pressure-testing.md`) — the metric must respect both. Until defined, present it on the call as *"the experiment is instrumented in principle; the precise trip-wire is unspecified"* — honest, and stronger than a fake number.

- **Routing test as a review template + a known-boundaries page.** The four-question test (value / concept / caller / contract-obligation) could become a lightweight checklist run against every new atom and every proposed external integration — a fifth gate alongside the three composition gates, scoped to "where does this service-shaped thing go?" And the known architectural boundaries (continuous co-editing / CRDT atom; cross-atom visual atomicity; liveness-by-fairness) want a single staging page rather than being scattered across working-ideas files. Both are working-ideas-tier, not canon — sketch before proposing.

---

## Strange-pattern forecast, run through the grammar (2026-06-14, Grok pass — triaged)

A councilmember Grok pass asked the natural follow-on to the acyclicity result: *after acyclicity, what other "strange" patterns will emerge?* It returned eleven, ranked by maturity priority, clustered around the edges of the existing audit / consent / permissions / retention / reservation coverage (the cluster call is correct — that is where the next hard cases sit). But the forecast's value is not the list. It is what happens when each candidate is run through the **noun / verb / adjective / mechanism grammar** (§Answering Jackson's email): **most of them do not become atoms.** Acyclicity's demotion from "candidate concept" to "structural-relation invariant template" was not a one-off — it is the *common* fate, and the forecast is the demonstration.

The sort, four buckets:

- **Genuine concepts (own non-derivable state) — the short list.**
  - **Conflict Reconciliation** (offline-first / multi-replica merge-repair). Owns the resolution decisions: when a human or a policy picks a winner among diverging replicas, that choice is *new truth*, not derivable from the replicas themselves. This is the genuine frontier — the first candidate that breaks the scope assumption the whole library currently rests on: **single actor, single consistency domain** (`execution-contract.md` §Boundary rules — best-effort projections over independent consistency domains). It is the same boundary already staged above (§Open items → "continuous co-editing / CRDT atom"), now with a name. **Disambiguation — load-bearing:** this is *not* the "Reconciliation / Count-and-Adjust" candidate already in the roadmap backlog (recorded-balance-vs-physical-count; a benign Balance-Ledger + adjusting-entry composition that owns no new boundary). Two different patterns wearing one word; only the replica-merge one is strange. The roadmap row now carries this disambiguation.
  - **Bitemporal / Valid-Time.** Owns valid-time truth distinct from transaction time — the retroactive correction "it was true in the world from March, though we only recorded it in June." Audit Trail tracks transaction time only, so this is genuinely new state. Most likely a **Valid-Time overlay** (cf. the regulated overlay in `spec-format.md`), not a freestanding atom; graduates to the roadmap candidate backlog once it clears the EOS Pass-2 freestanding test.
- **Verbs (own no state) — emergent composition actions, the Undo shape.** Redo, Bulk / Cascading (Archive-All, Purge-Scope), Lineage / Dependency query. Each fans out over the log or a scope and owns no new state; Undo History already established the form (an emergent composition verb that calls a constituent's append and adds meaning at the wiring layer). Redo's only genuinely *new* content is **branching** (redo vs. a new forward action) — which Undo History explicitly scopes out — so Redo is valuable primarily as the forcing function for the branching seam, not as a hard atom. Grok's suggestion to treat Redo as the forcing function for the *Invertible Delta* seam is close but worth sharpening: Redo does not *need* an invertible-delta primitive — un-skipping an event on replay reverses it, the same compensating-events-plus-replay mechanism undo already uses — so Redo **confirms** the 2026-06-13 author exclusion (*Invertible Delta / Reversible Change* ruled sub-atomic, instantiated by Undo History's compensating events) rather than challenging it. Its live seam is branching; its relationship to Invertible Delta is confirmatory.
- **Adjectives (own no state) — structural-relation invariant templates, the acyclicity fate.** Multi-Parent Polymorphic Containment (the DAG sub-form already flagged to carry into acyclicity's Pass 2), Graph Reachability, Mutual Exclusion. These *extend the template set* (`spec-format.md` §Structural-relation invariant templates); they do not add concepts. **Mutual Exclusion / Separation-of-Duty — Grok's "promote it soon, it has already appeared" needs a witness correction before it can be acted on, and the correction is the interesting part.** Run the three cited appearances through the template's own promotion bar (`spec-format.md`: *a relation-wide truth-condition that recurs and owns no state*) and they turn out to be **three different relational shapes, not one recurring template**:
  - *Authorization-exclusivity* — Approval Step Inv 4/5 (only the actor bound to `approver_ref` may approve; only `submitter_ref` may withdraw). This is a role→actor *binding-enforcement* guard, not role-disjointness.
  - *Set-distinctness, as a validation precondition* — Multi-Party Approval requires pairwise-distinct approvers, but it is an `invalid-request` precondition on `initiate_chain` (a within-action check), **not a standing composition-level invariant**, and it constrains distinctness *within the approver set*, not submitter-vs-approver.
  - *Cardinality / at-most-one* — Assignment's "at most one Active assignment per task." A counting constraint, again a different shape.

  None of the three is the classic separation-of-duty relational invariant (*the actor who submits an object cannot be the actor who approves it*) — which, notably, the library does **not** currently enforce as a standing invariant anywhere (Approval Step lets `approver_ref` and `submitter_ref` be independent and says nothing about their equality). So the honest move is **disaggregate, then promote what genuinely recurs** — not count three heterogeneous appearances as one template (the gameable-count failure `pressure-testing.md` warns against). By that test, *cardinality / at-most-one-per-key* is actually the stronger near-term 5th-template candidate — it has a clean standing-invariant witness already (Assignment) and is structurally a relation constraint that owns no state — while *separation-of-duty / disjointness* is shape-valid but witness-thin (only a precondition so far) and wants a genuine standing-invariant occurrence before it earns a template slot. Grok's instinct to name the family is right; the leverage is in splitting it correctly.
- **Mechanism (owns no domain meaning) — below the contract.** Snapshot-as-cache: a cache of derived state is reconstructible from the log, owns no *non-derivable* state, so it is mechanism — and Undo History already names it as the O(n)-replay performance escape (the forthcoming Snapshot pattern). The exception that flips it back to a concept: a *user-named saved version* the user references by name, which carries domain meaning. Grok's "Extension / Specialization Contract" is methodology (`contributing.md` lifecycle + `execution-contract.md` conformance), not a domain pattern.

**Why this is an asset for the 24th.** Of the eleven, roughly eight sorted into verb / adjective / mechanism and only two-to-three are genuine concepts. That is the grammar doing exactly what it claims — *refusing concept-hood to things that own no state* — on a batch an external reviewer generated independently, without being told the test. It is qualitative corroboration of the conjecture that emergent concept (and invariant) count stays roughly flat as the corpus grows. **Honesty guard:** that conjecture is still uninstrumented — the falsifiability threshold is undefined and "stays flat" is a coinage, not canon (§Open items above). Present this on the call as *"the grammar predicted its own application on a fresh external batch,"* not as a closed metric. If anything it sharpens the open metric work: the counting rule wants to count *concepts that survive the blade*, not raw candidate patterns proposed — this forecast is logged as the first data point of that **blade-survival-rate** signal in [`falsifiability-metric.md`](./falsifiability-metric.md) §Blade-survival rate (Grok's "lightweight tracking note for concepts that survived the full blade," routed to the metric's home rather than a fresh list).

**Rejected — Grok's suggested root `strange-patterns.md` / `tricky-cases.md`.** A standalone running list of candidate patterns is exactly the mirror/snapshot file the bootstrap discipline forbids (`AGENTS.md` — every mirrored sentence eventually drifts from its source). It would duplicate, and then diverge from, the roadmap candidate backlog (the SSOT for sequencing) and this working-ideas staging. The grammar-sorted forecast lives here; survivors route to the roadmap backlog when they clear Pass 2. The forcing-function discipline Grok rightly wants — treat each strange case as a possible spec-format / template evolution — is already the methodology (acyclicity → 4th template; the ownership-seam blade); it needs no new home, only continued application.
