---
title: Discoveries
nav_order: 17
---

# Discoveries

Accidental findings during the build. Raw, dated, unpolished. Grant proposals and posts pull from here later.

---

### 2026-05-19 — Readable-first and formally verifiable are the same discipline

While modeling the Attributed Permissions Admin composition in Alloy and TLA+, we discovered that the English specification had already captured nearly everything the formal models required: named actions, preconditions, postconditions, and explicitly numbered invariants.

This challenged the common assumption that human-readable specifications and formal verification are separate activities—one for people, one for tools.

In practice, they are two expressions of the same underlying discipline: precise thinking.

The canonical English specification is where the difficult work happens:

* Defining system state
* Naming actions
* Stating invariants
* Clarifying assumptions
* Eliminating ambiguity

Once that structure exists, generating Alloy or TLA+ models becomes largely mechanical.

The English specification is not documentation *about* the formal model. It is the canonical source from which both formal models and implementation are derived.

Formal tools act as tireless second readers. They do not create correctness; they systematically test the assumptions already expressed in the specification by exploring states no human would enumerate manually.

A key advantage of this approach is that verification results return in the language the team already understands. Invariants are named in English before the model is written, so counterexamples map directly to concepts already discussed in design reviews.

The feedback loop is straightforward:

**English specification → Formal model → Counterexamples → Refined specification**

Readable-first design forced exactly the level of abstraction that formal verification requires.

### Implication for Grace Commons

Writing a precise English specification is not formal verification itself, but it performs most of the intellectual work that formal verification depends on.

Alloy and TLA+ then provide exhaustive, machine-assisted validation of that specification.

When the specification is precise enough, formal verification becomes an optional, mechanical extension of the same thinking rather than a separate discipline.

---

### 2026-05-20 — Complexity must be reduced to named state and named transitions before advanced tools apply

Discovered while writing the Alloy model for Capability and the TLA+ model for Privileged Access Provisioning. Both models were straightforward to write — not because formal verification is easy, but because the grounded specs had already done the hard work.

The gating condition that made the models tractable: every piece of complexity had already been reduced to named state and named transitions. Status enums, action preconditions, idempotency guards, invariants — all named in the English spec before a single line of Alloy or TLA+ was written.

This suggests a general principle:

> Complexity must be reduced until it is representable as named state and named transitions before advanced logic tools are applied.

That principle is the gating rule between three stages:

1. **Prose design** — where the hard thinking happens; complexity is named and decomposed
2. **Formal verification** — mechanical once stage 1 is complete; Alloy checks snapshots, TLA+ checks traces
3. **Code generation** — also mechanical from the same source; implementation is a translation, not a design activity

The same rule applies to decomposition generally. Complex things become doable when broken down far enough that their pieces can be named. The naming is the work. Everything after naming is translation.

This is the same insight as the 2026-05-19 discovery stated from the other direction: readable-first and formally verifiable are the same discipline because both require the same prior act — reducing complexity to named state.

### Implication for Grace Commons

The three-pass pressure-testing methodology is the mechanism that enforces the gating rule. A pattern that has not survived all three passes has not been reduced far enough. Alloy and TLA+ applied to an ungrounded spec will find noise, not signal — the counterexamples will reflect specification gaps rather than implementation risks.

The correct sequencing is: ground the spec first, then apply formal tools. The formal tools confirm the grounding; they do not substitute for it.

---

### 2026-05-23 — TLA+ filename↔module rule forces a camelCase exception for .tla files

Discovered when the first CLI-driven TLC run hit `login.tla` and SANY rejected it: TLA+ requires every `.tla` file to declare `MODULE <name>` where `<name>` is the file's basename, and TLA+ identifiers cannot contain hyphens (`-` is the subtraction operator). A file named `external-onboarding.tla` cannot declare `MODULE external-onboarding` (lexer error) or any matching-but-hyphen-free module name without violating the filename-must-match rule.

All four `.tla` files in `compositions/` had the same mismatch — kebab-case filename, CamelCase or snake_case module name. The TLA+ Toolbox GUI papers over this via internal resolution; the `tlc` CLI does not. CLI reproducibility is the bar a grant reviewer or external contributor will hit on first try.

### Resolution

Rename the four `.tla` files to lower-camelCase to match their MODULE declarations: `login.tla`, `externalOnboarding.tla`, `attributedPermissionsAdmin.tla`, `privilegedAccessProvisioning.tla`. Paired `.cfg` files follow the same names. Every other file type — `.md`, `.als`, atom names, directory names — stays kebab-case. The exception is scoped narrowly to the file type whose parser refuses to negotiate.

### Future work — adapter

A short build step could restore the kebab-case convention as the canonical surface: a pre-flight script creates a temporary directory of correctly-named symlinks or copies, invokes TLC against the temporary tree, and reports results back through the original kebab-case names. Worth doing once the build pipeline justifies a single canonical adapter location, or once a contributor wants a `.tla` file more readable than camelCase allows.

### Principle

The English spec and the formal-methods sibling are two expressions of the same discipline (2026-05-19 discovery), but the formal tool brings its own constraints. Accept the constraint where it is mechanical and unavoidable; defer the elegance of a unified surface to a build step rather than letting it bleed into the source filenames.

---

### 2026-05-20 — Healthcare application target

A specific healthcare application idea is in view as a future Grace Commons target. Not captured in detail yet at the author's request — noted here so it doesn't get lost. The library already has Clinical Observation and Medication Order as grounded worked examples of the methodology applied to HIPAA / 21 CFR Part 11 domains. The healthcare app would extend into composition territory beyond those two atoms. Detail to be filled in when the idea is ready to specify.

---

### 2026-06-05 — Cross-render agreement is an empirical measure of spec-carried meaning

While building the conformance validator (`tools/conformance/`), we rendered the same composition surface (the clinical-trial-portal: External Onboarding + Login + Session-Gated Authorization + Attributed Permissions Admin + Audit Trail) four separate times, on four genuinely different stacks:

* render 1 — SQLite, Deno, Argon2id
* render 2 — SQLite, pure Node, scrypt
* render 3 — **Postgres** (pglite, in-WASM), pbkdf2
* render 4 — **flat-file JSONL** event log, no SQL at all

The same spec-derived manifest, the same evaluators, and the same user-journey scenario drive all four. Only a small per-render *adapter* differs. Nineteen of the twenty record-clearable checks pass **identically** across all four renders.

The discovery is what the *disagreement* does. The single check the renders split on (the audit hash-chain integrity check) does not indicate a spec gap — it localizes a defect that exists in exactly one render (render 1's genesis-hash bug; see happy_accidents.md). So multi-render agreement is a measurement instrument, not just a test:

> A claim that passes identically across independent renders is *carried by the spec*. A disagreement is either a render-specific defect or a place the spec under-determines behavior — and the divergence points at which render is the outlier.

This is the empirical handle on the project's core thesis (*code is a build artifact; the spec is canonical*). When implementations on SQLite, Postgres, and a flat file all converge on the same behavior, the behavior is coming from the shared spec, not from shared code — because there is no shared code.

### Implication for Grace Commons

The agreement percentage (`tools/conformance/agree.mjs`, N renders) is a number a grant reviewer or skeptic can re-run. It exits non-zero on any disagreement, so it doubles as a CI gate on spec-carried behavior: a future render that diverges from the others is flagged automatically, and the flag names the exact claim and the exact render.

---

### 2026-06-05 — An independently-derived render converged on the same number

Render 4 above was authored by an agent given **isolated context**: only the five composition specs and the validator's integration contract — never the other three renders, never the reference implementation. From that alone it chose a paradigm none of the others used (an append-only JSONL ledger, no relational engine) and produced a render that scores 100% on the shared manifest and agrees with the others on all nineteen spec-carried claims.

The honest scope of the claim: this is *isolated-context* independence, not a different human or a different model family — so it shrinks the "the same author wrote all the renders, maybe they share a blind spot" objection without fully eliminating it. A render authored by a different person or model is the remaining step.

But the signal is real: handed the canonical English and the records-alone contract, an independent implementer reconstructed the same behavior. That is the strongest available evidence that the meaning lives in the specification, not in any one implementation of it.

---

### 2026-06-05 — The Generation-acceptance prose *is* the conformance oracle

Every grounded spec already carries a *Generation acceptance* section written in records-alone form ("an auditor, from the records alone, can verify X"). Building the validator, we did not design conformance tests — we *lifted* the checks the specs already state. A dependency-free, linter-class parser (`extract-manifest.mjs`) pulls `{claim, kind}` straight out of the Generation-acceptance prose; a `--reconcile` pass then proves the hand-authored check manifest is **zero-drift faithful** to the spec: every manifest claim is verbatim-present in the prose, and every spec check is accounted for.

The reconcile earned its keep immediately — it caught the manifest author (us) over-classifying three checks relative to the spec's own framing, and forced the correction. It also enforces that any deliberate deviation carries a written reason, or it fails.

### Implication for Grace Commons

"The spec is the test" is not aspirational here; it is mechanical. The checkable claims are traceable to the canonical English. The only judgment that stays hand-authored is render-specific scoping (which checks a given render's substrate covers, and severity) — and that part is small, explicit, and itself auditable.

---

### 2026-06-05 — Once correctness is measured, it is optimized: the validator is a fitness function

The same number that *measures* a render can *select* among candidate fixes. A regen loop (`regen.mjs`) reads the validator's red checks, proposes a render edit addressing each, re-measures, and keeps the edit only if the measured correctness rose — climbing a deliberately-broken render from 90% to 100% over two fixes, and refusing a regressive patch (it reverts and exits non-zero).

This closes the level-1 feedback loop end to end — generate → check → fix → retest — with the spec as the oracle the whole way down. The validator is simultaneously the acceptance test (does this render honor the spec?) and the fitness function (drive the render toward the spec). The number is computed, never asserted; an author may claim "92%-good," but the runner *counts*.

---

### 2026-06-05 — The validator's first act was catching a real audit bug nobody was looking for *(happy accident)*

We built the conformance validator to *measure* how faithfully a render honors its spec — to produce a number, not to hunt bugs. Pointed at render 1 (the clinical-trial-portal demo), the very first run came back 95%, with exactly one red: the audit hash chain diverges at event #1.

It was not a contrived check failing. It was a genuine, latent defect in the demo: `scripts/seed.ts` hashes the genesis `study.registered` event **without** the `id` field, while `domain/event_log.ts` (`appendEvent` / `verifyChain`) hashes **with** it. The consequence is real and Part-11-relevant: a CRA clicking `/audit/verify` on a **pristine, untampered** database would see *"Tamper detected at event #1."* Worse, because `verifyChain` stops at the first divergence, the genesis break **masks all downstream tamper detection** — the chain is never actually checked past row 1. The demo's own test suite never exercised `verifyChain` over the seeded event, so the bug was invisible to it. The validator surfaced it on contact, and it reproduced on the live Deno render three separate times on fresh data.

Then the accident compounded, twice:

1. **The fixture reproduced the bug by being faithful.** A byte-faithful Node fixture, written to stand in for the Deno render in a sandbox without Deno, reproduced the seed's *exact* stored hash — genesis bug and all. We proved the fixture was a faithful stand-in by accidentally reproducing a defect we already knew was there.
2. **Multi-render agreement triangulated it for free.** As we added renders 2, 3, and 4, cross-render agreement *localized* the bug: render 1 disagrees with the other three on exactly that one check, out-voting the defect 3-to-1 and proving it render-specific, not a property of the spec. No logic was written to find or isolate the bug — the agreement machinery did it as a side effect.

We did **not** patch it (the demo is frozen while funding is pending; the fix re-hashes the whole chain). It is logged for the demo's review channel. The point for the record is the pattern, not the patch: an independent oracle finds what an implementation's own tests cannot, because the tests and the code share blind spots — they were written by the same hand, against the same assumptions. The conformance check, derived from the spec rather than the code, does not share those blind spots. *"We built a tool to measure correctness, and the first thing it did was find a real audit-integrity bug the hand-written tests missed, then localize it across four renders without being told to"* is the cleanest one-sentence case for the approach.

---

### 2026-06-05 — Postgres-in-WASM made "a second full render is hard" answerable in an afternoon *(happy accident)*

The skeptic's specific doubt was that a second *full* render — especially on a real database like Postgres — would be hard. Two unplanned conveniences collapsed that:

* Node 22 ships `node:sqlite` and `node:crypto` as built-ins, so the validator core and two of the renders need **zero** installed dependencies.
* `pglite` runs **real PostgreSQL (18.3), compiled to WASM, in-process** — no server, no `apt`, no Docker. A genuine Postgres render became a single `npm install` and an async adapter.

Render 3 (Postgres) joined the entire pipeline by writing only two small adapters; render 4 (a flat-file JSONL store) was authored independently and dropped in the same way. The "hard" second render turned out to be a contract-shaped seam, not a rebuild — the engine differences (async vs sync, SQL vs flat file) were absorbed by the adapter layer the architecture already had.

---

### 2026-06-06 — Re-render confirmed an existing invariant rather than surfacing a new one

Building the second render of the clinical-trial-portal (Next.js + React Server Components on PostgreSQL), the one genuinely new engineering surface was global serialization of the audit hash chain: every mutation takes a single `pg_advisory_xact_lock` so two concurrent appends cannot read the same tail and fork the chain (BUILD_PLAN §4). The first render got this for free from SQLite's single-writer lock and never had to think about it.

The tempting reading — and the one BUILD_PLAN §4.3 reaches for — is that the swap *surfaced* an under-specified ordering assumption: a spec gap one stack had been hiding, now dragged into the open and worth depositing back into the library as a named invariant.

Checking the canonical source refutes that. The Event Log atom (`atoms/event-log.md`) already carries it:

- **Invariant 3 — Total order.** Any two distinct events have a defined relative position by `sequence_number`; ties never occur, even within a single wall-time instant.
- Operationally: *"appends never fail for ordering or contention reasons — the underlying implementation must serialize them."*

So the requirement that concurrent appends be totally ordered was already in the spec. The swap did not expose a missing invariant — it exercised an existing one. SQLite's single-writer lock and Postgres's `pg_advisory_xact_lock` are two *mechanisms* conforming to the same atom clause. What is non-portable is the mechanism, not the invariant: SQLite satisfies "must serialize them" for free; Postgres satisfies it with an explicit lock. That distinction is a render / EXECUTION_CONTRACT fact, not a spec change.

This is the cleaner result for the thesis, not the weaker one. The 2026-06-05 genesis-hash finding was a real discovery — the validator *localized a defect*. This one localizes nothing, and that is the point: it confirms a canonical invariant holds across two unrelated serialization mechanisms. "The spec already said it" is exactly what *canonical* is supposed to mean.

### Implication for Grace Commons

The meta-lesson is a guardrail on atom count. The pull to "crystallize the §4 invariant into the Audit Trail composition" would have added a fragment the Event Log atom already states — a redundant invariant, an avoidable atom. The smallest-set-of-atoms discipline has a precondition: before crystallizing an apparent finding into a new invariant or atom, check whether the canonical source already carries it. Here it did, twice over (Invariant 3 plus the operational serialize clause).

Two doc-level follow-ups, neither a spec change: (1) the conformance mapping — Event Log's *"the underlying implementation must serialize them"* → SQLite single-writer (render 1) / `pg_advisory_xact_lock` (render 2) — belongs in EXECUTION_CONTRACT (or the render's CORNERS), as a worked instance of one atom clause satisfied by two mechanisms; (2) BUILD_PLAN §4.3/§9's "the English was under-specified about ordering" overstates against the atom and should be reconciled to "the *mechanism* is non-portable; the invariant was already stated." Re-render is a conformance check on spec-carried meaning — agreement across mechanisms confirms completeness, and an exciting narrative is not a reason to grow the atom set.

**Addendum (later, same day) — render 3 lands the third mechanism.** A headless Go render of the same Event Log spec (`demos/clinical-trial-portal-go`) satisfies the serialize clause with a `sync.Mutex`, and a Go-emitted chain verifies byte-for-byte under the JS canonical contract. The mapping is now *three* mechanisms (SQLite single-writer / `pg_advisory_xact_lock` / Go `sync.Mutex`), and follow-up (1) above is done — it is recorded in `execution-contract.md` (Data layer contract). One genuinely new thing the Go port surfaced: the canonical-JSON contract must be pinned *explicitly* for any non-TypeScript target — no HTML escaping, non-ASCII emitted raw, integers-only, key sort by code point. JS satisfied all four implicitly, so renders 1–2 never had to state them; a generator targeting a third language can't rely on "the runtime happens to." That list is the real portable artifact of the third render.

### 2026-06-07 — Fourth engine, same split: the invariants are spec-carried; Postgres carried only the enforcement locus

The Mongo ghost render (`demos/clinical-trial-portal-mongo`) was built to ask the question the first three engines couldn't: what happens to the invariants when the declarative layer disappears entirely? MongoDB has no foreign keys, no CHECK constraints, and no schema-level delete discipline — every guarantee the Postgres schema enforced for free has to go *somewhere*, and the render's job was to say exactly where (the invariant → enforcer table in its README).

The answer splits into three enforcement classes, and the split itself is the finding:

- **Engine-enforced (ports losslessly).** `NOT NULL`, the `CHECK` enums, every `UNIQUE` constraint, and the single-row `CHECK (id = 1)` all re-express as `$jsonSchema` validators and unique indexes — a violating write is rejected by the store, same as Postgres. One pleasant surprise in this class: `bsonType: "string"` on the hashed fields (`occurred_at` / `payload_json` / `prev_hash` / `this_hash`) machine-enforces the opaque-strings rule the hash chain's byte-identity depends on. A BSON `Date` or nested document — the coercion that would silently break cross-render verification — is rejected by the engine. What was a porting *convention* in renders 1–3 is a store-enforced *constraint* in render 4.
- **App-code-enforced (does not port — the class to watch).** FK existence and `ON DELETE RESTRICT` have no Mongo equivalent. They move into portal code paths: explicit existence lookups inside the transaction for externally-supplied references, structural derivation for op-internal ones, and — for delete discipline — the *absence of any delete surface*, which is categorically weaker than Postgres actively refusing the delete no matter which client asks. Same invariants, demoted enforcement: from engine-unconditional to audited-code-paths. The conformance checks still measure the invariants from the records; what's gone is the engine standing between the code and a violation.
- **Runtime-mechanism (the EXECUTION_CONTRACT seam, now four deep).** The Event Log serialize clause gets its fourth conforming mechanism: a replica-set multi-document transaction with the unique `event_log._id` as fork guard and `withTransaction`'s optimistic retry absorbing contention. Two concurrent appends collide on the same `_id`; the engine aborts one as a transient conflict; the retry re-reads the tail and lands after it. A forked append is impossible (it's a conflict, not a fork) and contention never surfaces to the caller — both halves of the clause, and *measured* rather than asserted (`prove-serialization.mjs`: 24 genuinely concurrent ops → no fork, no gap, chain re-verifies). SQLite single-writer / `pg_advisory_xact_lock` / Go `sync.Mutex` / Mongo conflict-retry: one canonical clause, four unrelated mechanisms.

Like 2026-06-06, the no-discovery is the headline: nothing surfaced a missing invariant, no spec contradiction rose to a finding (the deltas that are real but preference-shaped are in the render's CORNERS). The render passes the same 20 conformance checks through the unchanged evaluators, the cross-render agreement holds at 100% with it included, and the mongod-stored chain re-verifies byte-identically under the Go render's `verify.mjs`. The portable artifact of the fourth render is the *table*: a named list of exactly which guarantees a reviewer must re-audit as code whenever a render targets an engine without a declarative layer. That list is what "the spec is canonical, the engine is a mechanism" looks like when the engine gives you nothing for free.

### 2026-06-08 — Classification is computable from the intent graph, and the substrate — not the derivation — is the achievement

The taxonomy dry run (a read-only reverse-index generator over 18 compositions / 27 atoms / 47 composition→atom edges) asked whether an atom's classification could be *derived* from the composition graph instead of *asserted* by a folder. It can, and the result was sharper than the proposal that motivated it predicted:

- The reverse index reproduced 12 of 13 defensible `compliance/` placements, and the 13th (`selective-disclosure`, uncomposed) is exactly the intrinsic-stewardship carve-out — derivation drives navigation; the overlay-authoring obligation travels with the atom.
- It surfaced the real defect the folders hid: **10 regulated-by-usage atoms filed *outside* `compliance/`**, the flagship being Event Log — the single most heavily-regulated atom in the library by usage (14 standards; it is the audit substrate) — filed under `temporal/` because that is its intrinsic *shape*. A folder is a name and a classification at once; an atom has several true classifications; the folder forces a guess about which axis wins, and Event Log is where the guess is most wrong.
- A brand-new overlay (security) dropped in clean on the first try — computed identically to `regulated`, it clustered onto exactly the 7 auth/identity atoms and stayed off every domain-payload atom, with no hand-curation. The one axis that *couldn't* be derived (domain) is precisely the one that needs an intrinsic, EOS-gated tag. The split is load-bearing.

The deeper finding is methodological and generalizes past taxonomy: **the rigor lives in the substrate, not in the derivation.** The generator is ~150 lines of graph inversion; the reason it produces trustworthy classifications is that the expensive part was already done — 27 pressure-tested freestanding concepts, every composition declaring its `## Composes` edges, every standard explicitly anchored. The clean intent graph is the achievement; reading a taxonomy off it is trivial. This is the same shape as the conformance work (the oracle was already in the Generation-acceptance prose) and the RECIPE generator (derived from code): the library keeps finding that its hard-won *canonical substrate* makes downstream derivations fall out for free.

Two corollaries, stated because they bound the claim:

- **Derive over intent, never behavior.** The derivation is rigorous because it reads *declared intent* — the composition graph, reviewed and stable. Reading the same classification off *runtime behavior* (logs, traces, what systems actually do) is a different and far noisier problem — inference, not projection — and it forfeits the trustworthiness the intent substrate provides.
- **Not every axis derives.** Usage-facts (regulated, security, standards) the graph holds; intrinsic judgments (domain) it does not. Letting the intrinsic axis be free-authored rebuilds the committee taxonomy the whole move was escaping. The discipline: derive the usage-facts, gate the irreducible by an existing test (EOS decomposition), never free-author.

**Where this points (implication, not finding).** At organizational scale this is the shape of a *computed* rather than *maintained* ontology — and the dream level now has a name-holder, the **Intent** vocabulary:

| Layer | Preferred term | Full / optional form | Notes |
|---|---|---|---|
| Overall system | **Intent Graph** | (Semantic) Intent Graph | The canonical ground truth. |
| Primitives | **Intent Atoms** | (Semantic) Intent Atoms (concepts) | This library's *atoms*; supersedes the earlier "Intent Atomic." |
| Assemblies | **Intent Compositions** | (Semantic) Intent Compositions | This library's *compositions*. |
| Derived views / filters | **Intent Lens** | (Semantic) Intent Lens | A labeled projection over the graph; singular for the concept. |

The Intent Graph is authority; every Lens is a labeled projection over it — "regulated-scope," "customer-facing," "audit-relevant" as lenses rather than folders ("HIPAA *via* audit-trail," never "regulated: true"). What today demonstrated is the existence proof on a deliberately small, clean Intent Graph. The distance to the org-scale version is *entirely* the substrate discipline — whether Grace-Commons-grade structured intent with explicit composition edges can be imposed across an organization's real artifacts — a people-and-process problem, not a generator. The distinction this file exists to hold: the computed *taxonomy* is the demonstrated result; the computed *organizational Intent Graph* is where it points, gated on a substrate nobody has yet built at scale.
