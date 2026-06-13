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

## Candidate tooling — SpecGraph discovery (flagged 2026-06-12, not yet evaluated)

`app.specgraph.dev` discovery tool — candidate **stage-1 structural extractor** (the front end of the pipeline). Not yet inspected. Evaluate it against three fit questions before committing: (1) does it emit a *queryable graph*, not just a file/spec tree? (2) does it capture *state and relationships* (the concept skeleton) or only call/structure? (3) can its output be consumed by the stage-3 classification step without manual reshaping? If yes on all three it replaces the Joern/CodeQL stage-1 role; if it also recovers candidate invariants, it reaches into stage 3 and the division of labor with the model shifts accordingly.

## Connections

- This is **concept mining / design recovery** — an established field (software reflexion models, architecture recovery) given a sharp target by the library: recover *concepts* (freestanding, invariant-bearing) and *compositions* (wiring), not generic "modules" or "components."
- Direct bridge to Jackson's program (concept design, the concept catalog) — the reverse direction is a natural research project to raise with his students on 2026-06-24, and a candidate joint experiment: his catalog as one ground-truth target set, this library as another.
