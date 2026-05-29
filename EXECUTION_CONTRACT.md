---
title: Execution Contract
nav_order: 9
has_toc: true
toc: true
---

# Execution Contract

<details markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>


> The deterministic compilation target for Grace Commons atoms and compositions. Every atom is a state machine whose transitions execute via a fixed four-step pipeline over two effect channels and two pure-function boundaries. Nothing else is permitted at runtime.

This document is the contract between the Grace Commons spec layer and any runtime that claims to implement it. It names the three primitives, defines the pipeline, specifies the mapping from atom spec sections to compilation targets, and defines what conformance means. A-stack — the reference implementation in Deno + PostgreSQL + JSX — is the worked instantiation of the contract, not the contract itself. Any runtime that satisfies the contract is a conforming implementation.

---

## Core claim

Every Grace Commons atom compiles into a single explicit state machine. Every transition of that state machine executes through the same four-step pipeline — read current state, evaluate guards, write new state, project output — in that order, with no deviations and no additional steps. No runtime behavior exists outside this pipeline. That is the entire system.

---

## Logic Confinement Principle

The overwhelming majority of async, consistency, timing, and correctness problems in software originate from behavioral logic leaking into the wrong layers. Grace Commons enforces a strict confinement discipline across all conforming implementations. The three primitives and the four-step pipeline below are its concrete expression.

**1. Core is pure.** All atom and composition logic is synchronous, deterministic, and side-effect-free. No IO, no time sources, no randomness, no cryptography inside core logic. If it feels like it should be async, it belongs outside core.

**2. Single seam rule.** Every mutation crosses exactly one transactional boundary. No business logic is permitted in route handlers, middleware, or adapters. The composition layer is the seam; handlers are plumbing.

**3. Explicit inputs only.** Time (`clock_t`), identifiers (`id_t`), and cryptographic material are injected as explicit inputs — never generated inside T. A transition function that calls `Date.now()` or `crypto.randomUUID()` internally is non-deterministic by construction. The pipeline makes both reads explicit direct effects at the top of Step 3, before T runs.

**4. Behavior as data transformation.** Prefer explicit construction over hidden work inside transactional functions. The pattern is: construct the value outside the boundary, pass it in, append it. Hidden side effects inside transactions are where correctness guarantees degrade silently.

**5. Local, checkable invariants.** Every critical rule is asserted in the smallest possible scope. Distributed or implicit assumptions — "appendEvent always ensures X" — are replaced with named invariants in the spec and named assertions in the compiled test suite.

**6. Async at the edge only.** All asynchronous, network, storage, and external concerns are confined to adapters. The pipeline itself — Steps 1 through 4 — is synchronous. Async enters core and complexity grows nonlinearly; Grace Commons eliminates the category by construction.

**Current status.** The Beacon reference implementation satisfies rules 1, 2, 3, and 6 fully. Rule 4 (explicit construction / `createEvent` before `appendEvent`) and rule 5 (compiler-emitted invariant assertions) are targeted for the projector build phase — the gap is documented in the implementation's `CORNERS.md`. The principle is stated here as a first-class commitment, not a retrospective description of the demo.

---

## The three primitives

### State Machine (SM)

A state machine is defined as a six-tuple:

```
SM = (S, E, T, G, I, Q)
```

- **S** — the finite set of named states. Maps to the atom's State section (state names only).
- **E** — the set of typed events, one per action. Maps to the atom's action signatures.
- **T** — the transition function: `S × E × Params × clock_t × id_t → S`. The body of T is a direct effect (a database write); T itself is deterministic given its inputs. `clock_t` and `id_t` are injected — see Pipeline below.
- **G** — the guard function: `S × E × Params → pass | typed_failure(reason)`. G is a pure function. It takes `state_t` (read in Step 1) and the event parameters; it returns either pass or a typed rejection. The typed failure space is exactly the set of rejection reasons named in the atom's Decision points.
- **I** — the invariant set. Each named invariant in the atom's Invariants section maps to a member of I. Invariants are not assertions run on every read; they are correctness conditions the compiler must prove T preserves. Two classes: *single-state invariants* (hold over the new state after each write — assertable as a post-write pure function) and *sequence-safety invariants* (hold over any history of states — the compiler must prove T never produces a violating state, not assert at runtime).
- **Q** — the query surface: the named read queries the SM exposes without triggering a transition. Maps to the atom's Outputs section (read surfaces only). Each query is a direct effect (DB read) followed by a pure projection. Q does not modify state.

Action return values — the `id` returned by `assign`, the `ok` returned by `confirm` — are a separate concern **R**: a pure projection function over `state_{t+1}` and the event, emitted as part of Step 4. R is not part of the SM tuple; it is generated from the atom's Outputs section (action return specifications).

**Key rule.** A state machine is the only construct permitted to mutate persistent state. All mutation happens inside T, expressed as a database write. Pure functions and queries never mutate state.

---

### Pure Function (PF)

A pure function takes typed inputs and returns typed outputs with no IO, no state mutation, and no side effects. Pure functions are deterministic: same input, same output, always. They are used for guard evaluation, input validation, description normalization (as in Personal Todo's description policy — NFC normalization, trim, length check), invariant assertion, and projection formatting. A pure function may not invoke a direct effect.

---

### Direct Effect (DE)

A direct effect is an explicit, observable IO operation: a database read, a database write, a clock read, an entropy read (for ID generation), or an external API call. Direct effects are never hidden inside pure functions or inside the SM definition. Every direct effect is named at its call site and appears in exactly one step of the pipeline.

---

## The execution pipeline

Every state machine transition executes this exact sequence. No deviations. No additional steps.

```
Step 1.  READ STATE          DE   state_t  = store.read(entity_id)
Step 2.  EVALUATE GUARDS     PF   result   = G(state_t, event, params)
         if typed_failure:        return typed_failure(reason)   → caller
Step 3.  TRANSITION + WRITE  DE   if pass:
                                    clock_t     = clock.now()          (DE)
                                    id_t        = entropy.generate()   (DE, if needed)
                                    state_{t+1} = T(state_t, event, params, clock_t, id_t)
                                    store.write(state_{t+1})
Step 4.  PROJECT OUTPUT      PF   output = R(state_{t+1}, event)
                                  return output   → caller
```

**Clock and ID are injected at Step 3, not called from within T.** T receives `clock_t` and `id_t` as parameters; it does not read the clock or generate IDs internally. A T that calls `now()` or `uuid()` inside itself is non-deterministic — it cannot be given fixed inputs to produce a predictable output, which means it cannot be tested deterministically and cannot be treated as a compilation target. Injection discipline is what makes T a deterministic function of its inputs. The clock read and entropy read are explicit direct effects at the top of Step 3, before T runs.

**ID generation is conditional.** `id_t` is generated only for transitions that create new records — `place_hold` in Provisional Commitment, `assign` in Assignment, `add` in Personal Todo. Transitions that mutate existing records (confirm, release, expire, recall, edit, complete) do not generate an id.

---

### Step 1 failure

If the store read fails, the pipeline aborts before Step 2. The guard never evaluates; no transition fires. The caller receives `state-unavailable`. This is an infrastructure failure, not a guard failure.

---

### Step 3 failure

If the store write fails after Step 2 returns pass, the pipeline aborts. The caller receives `storage-failure`. The state at `entity_id` is unchanged — `state_t` remains the durable state. This is a critical distinction from Step 1 failure: in Step 3, the guard already passed. A caller who retries on `storage-failure` must understand that the transition may have partially executed — and whether partial execution is recoverable depends on the atom. (In Permissions, a `storage-failure` on `revoke` means the grant remains Active; the caller must not assume it is revoked and must retry. This is documented in that atom's Decision points as a security-critical failure mode.)

---

### Multi-write atomicity

Some transitions write to two stores (reassign in Assignment: mark old assignment Transferred, create new Active assignment; cascade-recall in Shared Todo's delete_task: recall the active assignment, then delete the task). Both writes are part of a single Step 3. The atomicity contract: both writes commit or both are rolled back. A partial state — one write committed, the other not — violates the atom's or composition's invariants and must not be observable. The implementation provides the transactional boundary; the spec names the atomicity requirement explicitly in each affected atom's Decision points.

---

## Atom compilation rules

The Grace Commons atom spec maps to the execution model through a direct section-to-target mapping:

| Atom section | Compilation target |
|---|---|
| State (state names) | S — the named state set |
| State (transition descriptions) | T — transition function body (DB write per transition) |
| Inputs (action signatures) | E — typed event set per action |
| Inputs (rejection reasons in signatures) | Typed failure space of G |
| Decision points | G — guard function per event, evaluating over state_t |
| Invariants (single-state) | Post-write PF assertions; compiler emits checks after store.write |
| Invariants (sequence-safety) | Compiler correctness obligations on T; runtime serialization guarantees |
| Outputs (read surfaces) | Q — named read queries; DE reads + PF projection |
| Outputs (action returns) | R — per-event return projection; PF over state_{t+1} |
| Description / validation rules | PF normalization functions, called inside G before guard evaluation |
| Identity model | id_t injection rule: generate once per creation event, inject into T |

**Invariant classes matter for code generation.** Single-state invariants (Invariant 8 timestamp ordering in Personal Todo, Invariant 2 event immutability in Event Log) compile to post-write assertions — pure functions the compiler emits immediately after `store.write` to check the new state satisfies the invariant before returning. Sequence-safety invariants (Invariant 1 membership exclusivity in Personal Todo, Invariant 7 reassign atomicity in Assignment) cannot be checked in isolation after a single write; the compiler must prove that no execution of T starting from a valid state can produce an invalid state, and the runtime must serialize transitions to prevent concurrent races from bypassing this guarantee.

---

### Regulated atoms

Atoms in `atoms/compliance/`, and any atom whose examples invoke regulated domains, compile with two additional outputs beyond the standard set:

**Generation acceptance checks.** Each check in the atom's Generation acceptance section compiles to a named read query over the record set — a SQL query an external auditor can run to verify the invariant holds without recourse to source code. These checks are first-class outputs of the compiler, not tests.

**Regulated adversarial scenario tests.** Each of the three canonical adversarial scenarios (regulator audit, disputed transaction or data-subject request, breach investigation) compiles to a named test that seeds the record set to a known state, runs the adversarial query, and asserts the expected result. These tests are executable specifications of the invariants the atom claims to provide to an external evaluator.

---

## Composition model

A composition is not a merged state machine. It is not a higher-order state machine with its own persistent state. It is a **stateless interpreter of a directed invocation graph over stateful atoms** — a function-level orchestration that sequences constituent SM transitions within the scope of a single action invocation. "Directed invocation graph" names what the composition structurally is: a graph of atom calls with explicit directed edges (sequential, conditional, or parallel — see Composition types below). The graph is a first-class compilation artifact, not prose description; the compiler reads the graph to emit the wiring code, not the other way around.

The distinction is load-bearing. A formalization that gives the composition its own state set S introduces a state artifact that has no atom spec, no identity model, no durability contract, and no invariants. The question "where does the composition's orchestration state live?" has no answer within the model — and that is the model's fault, not the implementor's. Grace Commons eliminates the question by construction: **compositions have no persistent state of their own beyond their constituents' stores.** What looks like "orchestration state" — the intermediate result of a constituent call, the branch taken, the flag set mid-sequence — is ephemeral local state within a single action invocation. It lives on the call stack. When the action returns, it is gone.

If a composition needs to record that a multi-step sequence occurred — coordination history, execution progress, ordered event trace — it does so by composing Event Log. The history belongs to Event Log's store and is governed by Event Log's invariants. The composition does not grow a second record store to hold what an atom already owns.

---

### What the wiring layer does

The wiring layer has three jobs:

1. **Defines the composition's action surface** — the named actions in Shared Todo (`add_task`, `assign_task`, etc.), the named actions in Idempotent Reservation (`place_hold`, `confirm`, etc.).
2. **Sequences constituent SM transitions in declared order** — `Permissions.permitted` before `PersonalTodo.add`, `DuplicatePrevention.check` before `ProvisionalCommitment.place_hold`.
3. **Enforces application-level invariants that no constituent atom can enforce alone** — cascade-on-delete in Shared Todo (Assignment.recall before PersonalTodo.delete), exactly-once-in-window in Idempotent Reservation (the token-result cache that makes retries return the prior result).

---

### Composition types

Three wiring patterns cover the full space of Grace Commons compositions:

**Sequential.** The output projection of atom A is used as input to atom B, which runs after A completes. `DuplicatePrevention.check → ProvisionalCommitment.place_hold` in Idempotent Reservation is sequential: the check must pass before the hold is attempted. Sequential composition does not introduce shared state; the intermediate result is a local value passed as an argument.

**Conditional.** A pure function over current constituent state selects which atom to call, or whether to call the next atom at all. `Permissions.permitted(actor, task, write)` in Shared Todo is a conditional gate: if G returns `typed_failure`, the composition aborts without touching Personal Todo. The branch selection is a pure function — no runtime ambiguity, no stored routing decision.

**Parallel.** Two or more atoms are called independently, with no output of one serving as input to the other. The composition's action surface may derive a joint projection from both results — a read query that joins constituent Q surfaces — but neither atom's transition depends on the other's. No shared state mediates the parallel calls. All current Grace Commons compositions are sequential or conditional; parallel is the anticipated pattern for notification fanout (Subscription × Notification) and similar fan-out actions, but the wiring rule is the same: independence means no shared persistent state, only a joint projection.

---

### The atom interface contract

A composition interacts with each constituent atom through a fixed interface: **accept an event, receive a projection.** Nothing more.

```
AtomInterface = {
  accept(event, params) → output | typed_failure(reason)
  query(name, params)   → result_set
}
```

The composition does not read the constituent atom's internal state directly. It does not perform DB joins against the atom's table outside the atom's declared Q surface. It does not inspect the atom's state schema (S). It does not call T or G directly — those are invoked by the atom's own pipeline when `accept` is called. The interface is opaque by design: a composition that reaches past it is not wiring atoms, it is coupling to implementation details and will break when the atom changes.

**No cross-atom DB joins.** The prohibition follows from the interface contract. If two atoms' stores are joined outside their Q surfaces — a raw SQL join across their tables — the join logic is not governed by either atom's spec. It has no invariants, no guard semantics, no rejection reasons. When either atom's schema changes, the join breaks silently. Derived queries that need data from two atoms compose their Q surfaces in a pure function: `join(AtomA.query(name), AtomB.query(name))`. The pure join function has no IO; the two Q calls are the direct effects.

---

### The pipeline applies to composition actions

A composition action that sequences two constituent SM transitions still executes the full four-step pipeline at the composition level — with Step 3 containing the sequenced constituent calls and the multi-write atomicity obligation applying across constituent store boundaries. The wiring layer is itself subject to the pipeline; it is not an exception to it.

Derived queries (`responsible_actor`, `visible_tasks` in Shared Todo) are pure joins over constituent Q surfaces — direct effects (reads from constituent stores) followed by a pure join function. The composition does not own a separate record store; it derives.

---

### Boundary rules

These are the hard limits where the composition model either holds or silently reintroduces hidden machinery. All four are variants of the same pressure: coordination complexity trying to migrate into the composition layer. The composition layer must not absorb it.

**Fan-out is a decomposition boundary, not a transition.** No atom produces non-atomic fan-out side effects. An action that triggers delivery to N recipients is not a single transition — it is two concerns that belong to two atoms: recording the intent (one write, fully atomic, one atom) and executing per-recipient delivery (N independent state machines, one per recipient, each retryable independently). Fan-out that is modeled as a single transition with N side effects has introduced partial-write ambiguity — some recipients receive, others do not, and the atom's consistency domain is undefined. The correct decomposition: Intent atom records the trigger; Fanout composition creates N Delivery Task atoms from the intent; each Delivery Task atom owns its own state, retry, and failure. This is the Notification Fanout pattern in the roadmap.

**Parallel composition carries no rollback guarantee.** If A succeeds and B fails in a parallel composition, A's write stands. The composition does not roll back A. If the system requires A to be undone when B fails — if atomicity across parallel branches is a correctness requirement — that is not a composition problem. It is a new atom: a compensating state machine that must be explicitly defined, with its own states (Pending, Compensated, Unrecoverable), its own guard logic, and its own invariants. The composition invokes it. If rollback is needed, you are defining a new atom, not composing.

**Atoms may carry opaque references to entities they do not own.** An Approval Step carries a `target_id` for the thing awaiting approval; it does not own that thing's state machine. The invariant rule: an atom's correctness conditions may never depend on the continued existence of the referenced entity. A dangling reference — a `target_id` whose target has been deleted — must produce a typed guard failure (`target-not-found` or equivalent), not an invariant violation. The decision state machine remains in a valid state regardless of whether its target still exists. This separates the lifecycle of the decision from the lifecycle of the thing decided about, which is the correct boundary: Approval Step owns the state of a decision about a reference, not the state of the referenced thing.

**Composition queries are best-effort projections over independent consistency domains.** No cross-atom transactional read guarantee exists or can be provided without reintroducing a hidden consistency layer. A join across two constituent Q surfaces is two sequential direct-effect reads; between those reads, another writer may commit a transition to either store. This is not a defect — it is the correct behavior of a system where each atom owns its own consistency boundary. If the system requires consistent cross-atom reads — a query surface that must reflect all in-flight writes atomically — that derived state becomes its own atom: its own store, its own state machine, its own invariants. A materialized projection atom is a first-class atom, not a cache. A cache's consistency depends on invalidation strategy; an atom's correctness holds by invariant.

**The meta-rule.** Anything that requires coordination, consistency, fan-out, or lifecycle guarantees is not a composition concern. It is either an atom or a decomposition into multiple atoms. Composition is not a system of control. It is a system of invocation.

---

### Three-way taxonomy

The model has exactly three kinds of runtime entity. No fourth kind is permitted.

| Entity | Kind | Owns state? | Owns history? |
|---|---|---|---|
| **Atom** | Persistent state machine | Yes — its own store | Only its own record set |
| **Composition** | Stateless orchestration function | No — call-stack only | No |
| **Event Log** | Atom (temporal) | Yes — its own store | Yes — the only legitimate history store |

If a composition seems to need persistent state, the answer is not to give the composition a store — it is to compose Event Log. The composition's "memory" of what happened is the Event Log's record set, governed by Event Log's invariants and Q surface. The composition remains stateless; the history remains auditable and spec-governed.

---

## UI projection contract

```
UI = render(Q(state))
```

The UI is a pure function of projected state. Q is the query surface — the named read queries that execute as direct effects and return typed result sets. `render` is a pure function from typed result sets to UI elements. In A-stack, `render` is a JSX component function: `(result: ProjectionResult) => JSX.Element`.

Rules:
- UI components have no direct store access. All data arrives through Q.
- UI components have no local state that is not derivable from Q. Hidden component state is a violation of the contract.
- Subscriptions, reactive bindings, and implicit update triggers are not permitted. When state changes (after a successful Step 3), Q is re-invoked and render is called with the new result. The mechanism that re-invokes Q is explicit and named — it is not a framework lifecycle.
- A UI component that caches a result and displays stale state after a transition has violated the contract.

---

## Data layer contract

The schema is derived from the SM definition. Specifically:
- One table per atom (or per distinct record type in atoms with multiple stores — Idempotent Reservation's `token_results` is a second table).
- One column per field named in the atom's State section.
- One enum (or constrained varchar) per S for the status column.
- Timestamp columns are nullable where the atom's spec says the field is absent until a specific transition.
- No column exists in the schema that does not correspond to a field named in the atom's spec.

**Permitted tooling.** Explicit parameterized SQL; a query builder that compiles to visible, predictable SQL (Drizzle in query-builder mode). Schema declarations (table and column definitions). Explicit migration scripts.

**Not permitted.** ORM relations that trigger implicit joins or lazy loading. Active Record patterns that embed guard or projection logic in model objects. Any tool that generates SQL at runtime through reflection, magic method dispatch, or relationship traversal.

The `next_sequence_number` counter in Event Log requires atomic increment-and-append semantics — the counter increment and the event record write are a single Step 3 operation committed atomically. This is not two writes; it is a database operation that atomically increments the counter and inserts the row in one transaction.

---

## Error model

Three failure classes. No others.

**Guard failure.** G returns `typed_failure(reason)` in Step 2. The reason is one of the named rejection reasons in the atom's Decision points. The store is unchanged. The caller receives the typed rejection. Guard failures are the normal operational outcome of preconditions not being met — they are not error conditions and must not be logged as errors. Every named rejection reason must be reachable by a conforming caller in a well-specified scenario.

**Effect failure.** The store read fails (Step 1) or the store write fails (Step 3). These are infrastructure failures.
- Step 1: the caller receives `state-unavailable`. No guard ran. No transition fired. Retry is safe.
- Step 3: the caller receives `storage-failure`. The guard passed. The store write failed. The state is unchanged. Retry may be safe depending on the atom — but the caller must not assume the transition did not fire. Where partial execution is security-critical (Permissions `revoke`), the atom's spec says so explicitly.

**Invariant violation.** An illegal state is produced that violates a member of I. This condition has three causes: a compiler bug (T was generated incorrectly), a spec violation (T was implemented in deviation from the spec), or a serialization failure (two concurrent transitions both passed their guards against the same `state_t` before either write committed). None of these is a recoverable caller error. The implementation must surface this as a fatal condition for investigation, not as a typed rejection the caller handles.

---

## Testing model

Testing in Grace Commons is not a separate layer. It is a second view over the same state machine semantics — state machine replays with assertions over projection functions, compiled from the spec rather than authored independently. The Examples section of every atom is already a test specification; the Regulated adversarial scenarios are already acceptance tests; the Decision points are already guard test specifications. The compiler emits the test suite; there is no test authoring step.

**The core rule.** Every test is a declared traversal of the state machine graph. Not unit tests, integration tests, or mocks as separate concepts — just state transitions and assertions over projections. Same pipeline. Different inputs.

---

### Test types

**Guard test.** Exercises G directly — no store, no pipeline, no IO. Inputs: a known `state_t` and event parameters. Execution: call `G(state_t, event, params)` as a pure function. Assertion: result is the expected `pass` or `typed_failure(reason)`. One guard test per named rejection reason in the atom's Decision points, plus one for the pass case per transition. These are the fastest tests in the suite and the ones that cover the entire guard logic surface in isolation.

**Transition test.** Runs the full four-step pipeline against a real store seeded to a known state. Inputs: seed data in store (derived from the atom's Examples section) + event + params. Execution: full pipeline (Read → Guard → Transition+Write → Project). Assertions: (a) R returns the expected output; (b) Q returns results consistent with the new state; (c) single-state invariants hold over `state_{t+1}`. One transition test per named transition in the atom's State section, covering both the happy path and each guard-failure path.

**Sequence test.** Runs multiple pipeline steps in sequence from a known starting state. Inputs: starting state in store + ordered event sequence. Execution: N pipeline runs, one per event. Assertions: (a) intermediate states match expected; (b) final state matches expected; (c) sequence-safety invariants hold over the full history. Compiles from the atom's Examples (walkthrough scenarios) and from the sequence-safety invariant class. The rejection-path example in Personal Todo (eight events, five rejection reasons, one sequence) is a sequence test.

**Composition test.** Runs a composition action — which sequences constituent SM transitions through the wiring layer — against all constituent stores seeded to a known joint state. Assertions: (a) all constituent stores are in the expected state after the action; (b) application-level invariants hold over the joint record set. Compiles from the composition's action wiring and application-level invariants. One composition test per named composition action, plus tests for cascade behaviors (cascade-on-delete in Shared Todo, storage-failure cascade-abort).

**Acceptance test (regulated atoms only).** Seeds the record set to a state matching a regulated adversarial scenario, runs the Generation acceptance checks as read queries, and asserts the expected results. Compiles from the Generation acceptance section (the check queries) and the Regulated adversarial scenarios (the seed data and expected outcomes). These tests are the machine-executable form of "what an external auditor can verify from the records alone."

---

### The seeding rule — not mocking

Tests that need a store do not use mocks. They use a real in-memory store (or a test transaction rolled back after each test) seeded with concrete data derived from the atom's Examples section. The distinction matters: mocks replace a dependency with a fake implementation and introduce divergence between what the test exercises and what production executes. Seeding populates the real implementation — the same store, the same SQL, the same schema — with known state before the test runs. If a transition test passes against a seeded in-memory store, it will pass against a production store given identical initial state. This is the determinism guarantee; mocking destroys it.

The seed data is not authored separately. It is derived from the atom's Examples section — the concrete values the spec already provides. Personal Todo's rejection-path example seeds: one unit in Pending with description "buy milk." The test sequence follows the example exactly. If the spec changes the example, the seed data changes with it; there is no diverging test fixture to maintain.

---

### Spec section to test type mapping

| Spec section | Test type compiled |
|---|---|
| Decision points (each rejection reason) | Guard test — one per named reason, plus pass case |
| State (transitions, happy path) | Transition test — one per named transition |
| Invariants (single-state class) | Post-write assertions within each Transition test |
| Invariants (sequence-safety class) | Sequence tests targeting each invariant's boundary conditions |
| Examples (happy-path scenarios) | Seed data + expected outcomes for Transition and Sequence tests |
| Examples (rejection-path scenarios) | Seed data + expected guard-failure outcomes |
| Composition wiring (each action) | Composition test — one per named composition action |
| Application-level invariants | Post-wiring assertions within each Composition test |
| Generation acceptance (regulated) | Acceptance test check queries |
| Regulated adversarial scenarios | Acceptance test seed data + expected query results |

Every row in the table is a compilation rule. No test is authored that does not correspond to a row. No spec section exists that does not compile to at least one test type. The test suite is a complete projection of the spec — and if the spec is complete (all three pressure-testing passes clean), the test suite is complete by construction.

---

### What this removes

There is no separate testing infrastructure. There is no mocking framework. There is no test-doubles ontology. There is no CI configuration that encodes test semantics not present in the spec. The test runner executes the same pipeline the production runtime executes. The only difference between a test run and a production run is the store — in-memory and seeded vs. durable and production.

There is also no divergence path. A test cannot encode behavior the spec does not declare, because the test is compiled from the spec. A spec change propagates to the test suite at compile time, not at the next test-authoring session. The spec is the single source of truth for both production behavior and test expectations.

---

## Conformance

A runtime implementation of a Grace Commons atom is conforming when all of the following hold:

1. Every transition executes the four-step pipeline in order (Read → Guard → Transition+Write → Project) with no additional steps and no reordering.
2. `clock_t` and `id_t` are read as direct effects and injected into T as parameters. T does not call the clock or entropy source internally.
3. No persistent state mutation occurs outside Step 3's `store.write`.
4. Every rejection reason named in the atom's Decision points is reachable and typed. No rejection reason exists that is not named in the spec.
5. Every named invariant in I holds over the record set after any valid sequence of transitions, including sequences interleaved by other conforming callers under the implementation's serialization guarantees.
6. Q returns results consistent with the record set produced by the state machine's transition history. A query that disagrees with the durable record set is a conformance failure.
7. For regulated atoms: the Generation acceptance checks pass against the record set produced by any conforming run.

A composition is conforming when all constituent atoms are conforming and the application-level invariants hold over the joint record set produced by the wiring layer.

The A-stack reference implementation is a conforming implementation. It is not the only conforming implementation. Any runtime that satisfies these seven conditions against the Grace Commons atom specs is conforming, regardless of language, database, or UI technology.

---

## A-stack reference implementation

A-stack is the reference runtime. It is the minimal conforming implementation — the smallest stack that exercises the full contract against real atoms without introducing abstractions the contract does not require.

| Layer | Technology | Rule |
|---|---|---|
| Runtime | Deno | Permission-explicit; TypeScript-first; no build ceremony |
| UI | JSX → pure functions | `(props: ProjectionResult) => JSX.Element`; no framework lifecycle |
| Data | PostgreSQL | Explicit parameterized SQL or Drizzle query-builder mode only |
| State machines | TypeScript discriminated unions | One union type per S; one typed function per event in E |
| Pipeline | Explicit per-transition | Steps 1–4 written out explicitly; no framework interpolates them |

The first two A-stack examples, in dependency order: **Personal Todo** (simplest atom — four actions, no regulated sections, covers the full pipeline with the description policy as a PF normalization example) and **Idempotent Reservation** (first composition — demonstrates the token-result cache, multi-write atomicity in `place_hold`, and the exactly-once emergent invariant).

---

*The Execution Contract is a methodology document. It is subject to the same three-pass review as any Grace Commons pattern: structural completeness (all nine MUSE nodes have a corresponding contract clause), conceptual independence (no primitive absorbs another primitive's concern), and adversarial scrutiny (no hidden runtime behavior exists that the contract does not name). The contract itself is pressure-testable. If a conforming implementation exhibits behavior this document does not predict, that is a Pass 3 finding against the contract.*
