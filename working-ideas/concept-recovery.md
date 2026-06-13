# Concept recovery — running the classification engine in reverse (2026-06-12)

> **Status: internal staging, not canonical.** A research direction: use the routing test (`working-ideas/routing-test-checklist.md`) and the atom/composition taxonomy to reverse-engineer existing software — recover its latent concepts, compositions, and ambient-service map from code. Captured because it extends the thesis (the pipeline runs both ways) and is the most credible adoption on-ramp. Nothing here is built; it proposes a pipeline, names the hard parts honestly, and specifies a falsifiable first experiment.

---

## The claim

The library's pipeline is **English (canonical) → formal model + code (derived)**. The reverse direction — **code → recovered concepts** — is not a different project; it is the same classification engine run backwards. And the routing test is arguably a *better* instrument for reading a codebase than for designing one, because real code is saturated with exactly the ambient services the test exists to classify. Walking a codebase with the test produces two artifacts:

- a **concept map** (candidate atoms + compositions + emergent-invariant seams), and
- a **four-destination audit** — "here is where your undeclared authority lives" (the ambient clocks, the cron daemons, the god-object transaction managers, the caches), each routed to value / concept / caller / obligation.

The audit is valuable on its own, *before* full concept recovery, to any team regardless of whether they adopt the thesis. That makes it a low-bar first deliverable with a high-bar end state.

## Why staged extraction (answering "use another tool first?")

Yes — never let a model read raw source and invent structure. Ground the recovery in three stages so the deterministic parts stay deterministic and the model only does judgment over a real graph:

1. **Structural extraction — deterministic, ground truth.** AST + call graph + type graph + data schema. Tools: tree-sitter, language-server indexes (SCIP/LSIF), CodeQL, and especially **Joern's code property graph** (a queryable graph of exactly the control/data/call edges concept recovery needs). ORM schema introspection and any existing OpenAPI/proto specs come nearly free. Output: the skeleton, hallucination-free.
2. **Dynamic extraction — optional, high-value.** Runtime traces, DB transaction/commit logs, test-execution traces. Reveals what static analysis cannot: which writes actually commit together (the real atomicity boundaries → obligation map) and which invariants actually hold at runtime. "True at runtime" is observable in a way "true by reading" is not.
3. **Classify + synthesize — LLM over the extracted graph, not the source.** A reasoning model applies the routing test (four questions + Step-0 decompose) and the three gates (`pressure-testing.md`) to the *graph* — proposing concepts (state + candidate invariants), compositions (wiring + emergent-invariant seams), and the four-destination map. The model supplies judgment ("emergent invariant or incidental call?"); it must be grounded in extracted structure and forbidden from inventing it.
4. **Verify — the step that makes this recovery, not narration.** Derive a model from each recovered concept and check its invariants against the system's traces (or a generated conformance harness). Hold → recovery corroborated. Fail → either a recovery error *or a real latent bug in the subject system*. The closing loop is the entire difference between this and "AI explains your repo."

## What's recoverable vs. genuinely hard

- **State machines (concepts' skeletons):** largely recoverable — entity models, status enums, DB constraints, validation code give the states and transitions.
- **Wiring (compositions):** recoverable as call/data graphs; distinguishing an *emergent invariant at a seam* from an incidental call needs the gates — this is the judgment step, not extraction.
- **Ambient services (the four destinations):** the test applies directly and mechanically; this is the most reliable output and the basis of the audit deliverable.
- **Named invariants — the hard part.** Code enforces invariants through *dispersed* guards, DB constraints, and convention, never as a named declaration. Reconstructing the named must-be-true is inference with real false-positive/negative risk. This is where stage 2 (traces) and stage 4 (verification) earn their cost — an invariant the model proposes that *fails* against traces is caught, not shipped.

## The deep difficulty — the wrong-axis problem, in reverse

Forward, the architecture's whole win is decomposing on the concept axis (Parnas's right axis). Real codebases are decomposed on the *wrong* axis — by layer, by team, by framework convention — so the concepts are **smeared across the code's actual module boundaries.** You cannot read concepts off the existing folder/package structure; recovery means re-cutting along the concept axis, against the grain of how the code is organized. Entanglement (shared mutable state, ambient services everywhere, god objects) is the default in the wild — the exact thing the architecture eliminates forward is omnipresent in reverse, and recovery is the work of finding the concepts *under* it. This difficulty is also the value: a recovery that surfaces the latent concept structure the code obscures is telling the team something they could not see from their own source tree.

## Strategic payoff

- **Migration on-ramp (the adoption story).** The largest barrier to the thesis is "greenfield only." Code → concept-map → incremental re-grounding answers "what about my legacy system." Even partial recovery + the four-destination audit is actionable.
- **Falsification of the taxonomy (instrumented, like the emergent-invariant metric).** Mine N real OSS projects. If the library's ~27 atoms keep reappearing (auth, audit, retention, reservation, attribution), that is independent evidence the taxonomy cuts at real joints. If real systems are full of concepts *not* in the library, that is a backlog generator. Either outcome is signal, not faith — and it is the reverse-direction twin of the "does the atom taxonomy saturate?" question.

## First experiment — make it falsifiable, not a vibe

Pick an OSS project whose domain the library **already covers**, so recovery has a ground-truth target:

- an auth system → expect to recover Credential / Session / Permissions / Actor Identity;
- an audit/logging library → expect Event Log / Tamper Evidence / Retention Window;
- a booking/reservation system → expect Provisional Commitment / Capacity Constraint / Idempotent Reservation.

Run stages 1–4. The falsifiable question: **does the mined concept match the library's existing atom** — same states, same actions, same invariants? Close match → the recovery pipeline works *and* corroborates the atom. Systematic mismatch → either the pipeline is weak or the library's atom is idealized past what real systems implement (itself a useful finding about the atom). Score it the way the formal layer scores everything: a recovered invariant that survives the trace check is corroborated; one that fails is a finding to triage.

## Guardrail — three-stage grounding against hallucination

The failure mode is an LLM concept-recovery tool that confidently invents architecture. The discipline that prevents it is the same one the forward pipeline uses: **structure is extracted (deterministic), classification is proposed over extracted structure (model), invariants are verified against real behavior (checker).** The model never invents structure and never has the last word on an invariant — the trace check does. Without stage 4 this is just a prettier code-summarizer; with it, it is design recovery with a corroboration signal.

## Candidate target — ERPNext (flagged 2026-06-12, not yet run)

`github.com/frappe/erpnext` (`erpnext/modules.txt` is the module manifest). The strongest *phase-2 saturation* target in the open-source world, for one specific reason: ERPNext sits on **Frappe, which is metadata-driven**. Every business object is a **DocType** — a JSON schema carrying typed fields, link relationships, workflow states, and permission rules — so stage-1 structural extraction is largely *handed over* rather than parsed out of implicit OO structure. Frappe already pre-sorts the four destinations: DocTypes are concept candidates, the framework is the obligation layer, controllers are wiring, scheduler events are callers.

Expected high-density taxonomy hits (the reason it's a real test, not a demo): GL Entry / double-entry → Immutable Transaction Ledger; Stock Ledger Entry + Bin reserved-qty → Capacity Constraint + Provisional Commitment; the Frappe **Workflow** doctype → Workflow State Machine (near 1:1); role permissions → Permissions; naming series → Idempotent Reservation; recurring/subscriptions → Subscription. Sharpest single recovery: Frappe **docstatus** (Draft 0 → Submitted 1 → Cancelled 2, with submitted documents framework-enforced immutable) is a tiny state machine carrying a global immutability-on-submit invariant — a recoverable emergent invariant touching immutable-ledger and soft-delete semantics at once.

Two cautions on record:
- **`modules.txt` is the wrong-axis index, not the concept list.** It manifests Frappe app modules (Accounts, Stock, Selling, HR…) — ERPNext's decomposition by business area. Concepts are smeared across those boundaries (the wrong-axis problem above); the file says *where to point the extractor*, not *what the concepts are*. Do not mistake the module list for the concept inventory.
- **Phase-2, not the first experiment.** ERPNext is large precisely *because* it is juicy. The first run must be small with single-concept ground truth (the experiment above); ERPNext is the saturation test — "does mining a real ERP keep surfacing the ~27 atoms, or expose gaps?" — run only once the pipeline works on something tiny.

## Phase-1 candidate repos (shortlisted 2026-06-12, not yet sized — Scott to run SpecGraph)

The first run is a *pipeline debug*, so the target must be small with single-concept ground truth (an existing atom). Two surfaced from a quick search; sequence them:

- **Warm-up smoke test — `pboyer/rec`** (JS, claimed <100 lines, no deps, "extensively tested"; undo/redo/diffing/event systems). Maps to **Event Log** + undo-via-compensation. Use first, only to prove the four stages run end-to-end on code fully eyeball-able in one sitting. Caveat: generic foundational lib, no domain entity — so it does *not* carry the showcase emergent invariant (identity-preservation-across-undo needs a domain object). Tests Event Log recovery, not the composition seam. That's the right scope for a smoke test.
- **First scored run — `asgi-idempotency-header`** (Python ASGI middleware; PyPI). "Guarantees mutating endpoints execute exactly once by caching responses and returning the saved response on repeats." Maps to **Idempotent Reservation** / **Duplicate Prevention** — at-most-once side effect + same-key→same-result. *The interesting part:* the response cache is exactly the `token_results` structure flagged **extraction-pending → Idempotency Result Memo** in `working-ideas/composition-state-audit.md`. So this run is a falsifiable test of a library prediction: does the proposed-but-unbuilt Memo atom actually appear in real-world code? Confirm → the backlog atom is corroborated in the wild. Absent → the prediction was idealized. Single concept, thin middleware, ships tests (reusable as the stage-4 trace source).

Pre-commit step (when greenlit): open both, verify size + test-suite quality (search claims unverified), and score against the three SpecGraph fit questions below before pointing the extractor at either.

## Candidate tooling — SpecGraph (README reviewed 2026-06-13; recalibrated)

`github.com/specgraph/specgraph` (Go, Apache-2.0; hosted app `app.specgraph.dev` is invite-only, source is open — run locally via `specgraph serve`, Docker + Memgraph). **Recalibration:** SpecGraph is *not* primarily a code extractor. It is a **forward spec-driven-development framework** — "specifications as a queryable graph, not static markdown" — with a spec schema (protobuf), an authoring funnel (Spark→Shape→Specify→Decompose→Approve), a layered **constitution** (User→Org→Project→Domain ground truth), composition/dependency/blocks edges, drift detection, a linter, and an agent execution interface (claim protocol, execution bundles). The **codebase scanner** is Phase 2 ("in progress") — the `discovery` tool is almost certainly that scanner (*inference, unconfirmed*), so for our purposes it is the **stage-1 extractor, but one that emits candidate *spec nodes + edges* (a first-pass decomposition), not a raw code-property graph.**

**Finding (2026-06-13, source reviewed at `/Users/sromack/Develop/specgraph`): the scanner is NOT in the open source.** The full CLI surface of the public checkout is the *forward* framework only — authoring funnel (`spark → shape → specify → decompose → approve`), slices, analytical passes/findings (prompt-passes over *specs*, not code), graph edges + `deps/impact/ready/critical-path`, constitution, claim/bundle/execution, sync, identity/auth, `serve` + Memgraph. There is no `scan` / `discover` / `ingest` / codebase-analysis command. The codebase scanner is README-roadmap Phase 2 ("in progress") and exists only as the invite-only hosted `app.specgraph.dev/discovery`. **Consequence: "extract only the extractor" has nothing to extract; building SpecGraph locally yields the forward authoring tool, not a reverse extractor.** Revised plan below.

Build note: `go.mod` pins `go 1.26.4` (bleeding edge) and `task tools` assumes Homebrew + `buf`/`beads`/`pnpm`; "tasks not running" is most likely the `task` runner not installed or a Go-version mismatch — but fixing the build does not surface the scanner, so it is not worth doing for this purpose.

**Revised tooling plan.** Phase-1 (small/medium, ground-truth) needs *no* extractor: `pboyer/rec` (<100 lines) and `asgi-idempotency-header` (small middleware) are small enough that stage 1 is just *reading the source*; the work is stage-3 classification (routing test + three gates) and stage-4 verification against the repos' own tests. Heavy extraction (Joern/CodeQL — or SpecGraph's scanner if it ever opens) only earns its keep at ERPNext scale. This is cleaner anyway given the decision that the graph is internal tooling, not SSOT — the abstract concept-graph IR is ours, fed by whatever stage-1 is cheapest at the current scale (eyes now; a real extractor later).

Pipeline implication (retained for if/when the scanner opens): SpecGraph would do *more* of stage 1 than Joern/CodeQL — richer start, sharper trap. Its scanner will follow the code's existing module boundaries (the **wrong axis**), so it hands back specs shaped like the codebase, not concepts. **Stage 3 therefore gains an explicit mandate: do not trust the scanner's boundaries — re-cut along the concept axis before classifying.** Expect roughness (Phase 2, in progress). Three fit questions remain, restated: (1) can it ingest *our English* and emit a derived graph, or does it require authoring in its schema? (the canonical-form question below) (2) does each emitted node carry state/relationships, or only structure? (3) is its output consumable by stage-3 classification without manual reshaping?

### Relationship to Grace Commons — convergent substrate, complementary layer

SpecGraph independently built the *substrate* Grace Commons describes in prose, point for point: specs-as-graph-nodes with composition edges (atoms/compositions); constitution as layered ground truth (canonical-docs-own-rules); decisions as first-class nodes with edges to specs (Lineage notes / `discoveries.md`, made addressable); `deps/impact/ready/critical-path` queries (the dependency-ordered refinement sweep and constituent-change cascade, run by hand today); `drift`/`lint` (the no-snapshot rule and touch-triggers-repass). This is convergent evolution and counts as external validation that the spec-as-graph direction is real — usable in the Jackson conversation independent of the recovery experiment.

The division is clean: **SpecGraph is the engine (graph substrate + workflow + agent coordination), agnostic about what is *in* a spec; Grace Commons is the theory of meaning that would run on it** (atom-vs-composition as a *semantic* claim, emergent invariants, the formal-layer vote, the routing test, no-global-services). SpecGraph mechanizes the bookkeeping Grace Commons does by convention; Grace Commons supplies the content discipline and verification SpecGraph has no opinion about. In principle Grace Commons could be *authored on* SpecGraph — each atom a node, each composition a node with composition edges, each formal-layer vote a decision node, the dependency graph it already queries replacing the manual refinement order.

**The one tension that gates any integration — canonical form.** Grace Commons' thesis is that structured English readable by every stakeholder is the source of truth; SpecGraph stores protobuf in Memgraph. These compose cleanly in exactly one direction: the **English stays canonical and SpecGraph's graph is a derived index** over it (Grace Commons' own derived-index construct — a rebuildable projection carrying no truth). If SpecGraph instead treats the graph as canonical and English as a projection, it inverts the SSOT and reintroduces the notation-exclusion the library exists to prevent. Decision point when running it locally: *can it ingest the English and derive the graph, or does it want authoring in its schema?* — the first is a gift, the second is a fork.

## Decisions (2026-06-13)

Three architectural calls, recorded:

1. **The graph is internal analysis tooling, never SSOT.** An abstract graph is permitted insofar as it helps analysis; the canonical source remains the structured English. This puts the graph in the **derived-index drawer** — a rebuildable projection that carries no truth, regenerable from the English at any time, disposable. It is never authored-into or edited as a source of record. This resolves the canonical-form tension above in the one direction that composes: English canonical, graph derived.

2. **Define our own minimal abstract concept-graph as the internal IR — not SpecGraph's schema.** Nodes typed by the routing test (candidate concept / value / caller / obligation / derived-index); edges for wiring, dependency, composition. *Any* extractor feeds into it (SpecGraph scanner now; Joern / CodeQL later), so the extractor stays swappable and we never couple to SpecGraph's protobuf. The routing-test classification (stage 3) runs over this neutral IR rather than over someone else's schema. The IR is itself a derived index — regenerate, never hand-maintain.

3. **Extract only the extractor *if need be* — but run the whole local stack first.** `specgraph serve` brings up Memgraph via Docker Compose itself, so standing the whole thing up locally is cheap; first contact should be the path of least setup, to learn fast whether the scanner output is usable. Carve the extractor out only later, if the full stack becomes a burden or it is wanted in CI. Do not pre-optimize the carve-out.

**Plan:** small → medium → eval. Run the extractor on a small ground-truth repo (`pboyer/rec`), then a medium one (`asgi-idempotency-header`), feed each into the abstract concept-graph IR, classify (routing test + three gates, re-cutting along the concept axis), verify recovered invariants against the repos' own tests, then evaluate before scaling toward the ERPNext saturation target. English canonical throughout.

## The three-tier extraction funnel (2026-06-13, after runs 1–3)

Recovery is not one method; it is a **triage funnel** of three tiers where cost rises, breadth narrows, and rigor increases per tier — and each tier's output is the *promotion list* for the next. (Refines the earlier "two modes": tier 1+2 are the breadth/metadata mode split into corpus-wide vs. sampled; tier 3 is the depth/verification mode.)

1. **Fuzzy high scan** — aggregate metadata over the whole corpus (the ERPNext 527-DocType counts: 82 submit machines, 64 naming series…). Near-free, one script. *Output:* where the mass is; does the taxonomy hold. *Promotes:* both the **center** (high-recurrence primitives — poke one canonical instance to confirm) and the **edges** (concepts that don't fit the dominant shape — where new atoms hide).
2. **Medium pokes** — classify a representative sample at the schema level (the 6 DocTypes). Cheap. *Output:* concepts mapped to atoms; candidate gaps. *Promotes:* strong-recurrence candidates with no library match (Sequential Identifier), or load-bearing invariants that look fragile (where bugs live).
3. **Detailed extraction** — read the logic, recover *actual* invariants, verify against tests (runs 1–2; "read `naming.py`" would be this on ERPNext). Expensive, selective. *Output:* a verified atom draft, or a bug. **Caveat (BOM tier-3, 2026-06-13): on framework-heavy targets this tier needs the *runtime*.** Reading the controller recovers invariants reliably, but *checking* them — reproducing a bug, asgi-style — requires standing up the system (a Frappe bench + DB + the project's own test suite as trace source). Without it, tier-3 degrades from *verified* to *deeply read*, and findings must be labeled "reasoned, not run." Recovered invariants stay solid; candidate bugs become suggestive-not-reproduced.

**The honesty discipline — label provenance by tier:** tier-1 *computed fact*, tier-2 *inferred*, tier-3 *verified*. Never let a cheap tier's confidence wear a higher tier's clothes (the ERPNext report's caveat 2 is this rule applied). Maps onto the library's own grounding levels (English-only vs. formal-verified) — the recovery funnel mirrors the authoring funnel. **Budget inversely to cost:** tier 1 on everything, tier 2 on a sample, tier 3 on a handful; the funnel concentrates the expensive verified work where the cheap scans found value.

## DocTypes are meta-specs, not atoms — the extraction rule (2026-06-13)

Are Frappe DocTypes a pattern to adopt, or meta-specs to decompose? **Meta-specs — decompose every one.** The reason is structural, not stylistic: the DocType abstraction *flattens the concept/composition distinction Grace Commons exists to preserve*. Frappe treats GL Entry (≈ one immutable-ledger concept) and Sales Order (state machine + commitment + fulfillment rollups + line-item children) as the same *kind* of thing — "a DocType" — despite different conceptual altitudes.

- **The DocType abstraction is a container/projection envelope, not a concept** (wrong ontological category — like "a table" or "a class"). It bundles state, identity, lifecycle, links, validation, permissions, children, hooks.
- **A specific DocType is cut on the storage/UI axis** (one DocType = one table = one form = one API resource) — the *wrong axis* for concepts (same as module boundaries). A better *starting unit* for tier-2 than arbitrary OO code (declarative, uniform, legible), but never a trustworthy concept boundary.
- **Even the simplest DocType is a composition, never a clean atom.** GL Entry = immutable-ledger + dimensional links + double-entry binding. DocTypes sit *at or above* the atom level, always — the decompose rule has no exceptions.
- **Extract the concepts embedded in the envelope, not the envelope:** `docstatus` (atom), naming series (candidate atom), Link fields (composition edges), child tables (composition members).
- **What to steal — but note where it goes:** the uniform-declarative-envelope-with-auto-projection (one declaration → schema + API + UI + permissions) is the "one spec, many derivations" thesis working in production. It belongs at the **projection/execution layer, downstream of atoms** — a DocType is "what an atom/composition looks like *after* compilation to a runtime entity." Frappe collapsed concept and projection into one artifact (productive but conceptually muddy); Grace Commons keeps them apart. The DocType is a reference for the *compiled-entity envelope*, not the concept layer.

Practical upshot for tier-2/tier-3: never map DocType → atom 1:1. Read each DocType as a fat composition; recover the embedded atoms and the wiring; treat the envelope as a projection artifact.

## ERPNext as extraction source & the partner thesis (2026-06-13)

`frappe/erpnext` is the strongest extraction-and-validation source found (run 3). The reason is specific and favorable to the thesis: **Frappe independently validated half of it.** DocTypes are declarative metadata above code — they arrived at "metadata canonical, logic derived" on their own. What they lack is the half Grace Commons owns: **invariants/verification** (buried in Python controllers — exactly why the breadth scan couldn't find bugs) and the **freestanding-concept discipline** (DocTypes are fat domain compositions, not reusable atoms). So the complementarity is precise: **Grace Commons is the invariant/verification layer Frappe's metadata is missing**, and could re-cut their DocTypes along the concept axis.

Partner ladder — do not skip rungs:
- **Extraction/validation source (now):** no partnership needed; concepts aren't copyrightable (learning from design, not copying code; ERPNext GPLv3 bites only if their *code* is vendored). A named, well-designed, real-world corpus is the "not just academic" signal the Sloan/Jackson audiences want.
- **Strategic partner (speculative, but testable):** the hook is "we can make your DocTypes provably correct and turn them into verified reusable concepts." That only matters to Frappe if the verification layer demonstrably catches what their controllers miss — i.e., **a tier-3 dive that finds a real invariant violation in an ERPNext controller is the proof-of-value** that makes the conversation concrete rather than aspirational. Test before pitching.

## Connections

- This is **concept mining / design recovery** — an established field (software reflexion models, architecture recovery) given a sharp target by the library: recover *concepts* (freestanding, invariant-bearing) and *compositions* (wiring), not generic "modules" or "components."
- Direct bridge to Jackson's program (concept design, the concept catalog) — the reverse direction is a natural research project to raise with his students on 2026-06-24, and a candidate joint experiment: his catalog as one ground-truth target set, this library as another.
