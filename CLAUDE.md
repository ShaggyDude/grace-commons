# CLAUDE.md — Grace Commons session bootstrap

> Do not cut corners unless you have VERY good reasons and in that case ask.

> Standing instructions for any Claude session working on Grace Commons. Read this first; it points at the canonical documents, names the vocabulary that is load-bearing, and lists the authoring conventions every pattern follows. The repo's own documents are canonical; this file is the index that gets you to them quickly.

---

## What Grace Commons is

Grace Commons is a public library of **atoms** and **compositions** expressed as structured natural language. The thesis: software's canonical unit should shift from code to structured intent — a single semantic source from which code, tests, diagrams, and contracts are all derived. Code is a build artifact; the spec is canonical.

This is the open-foundation track of a broader architecture (the **Spec Layer**) that synthesizes formal-methods, requirements engineering, BDD, design-by-contract, and Daniel Jackson's *Essence of Software* (EOS) into one canonical English-as-truth representation. The Alloy / concept-catalog track is the formal-methods parallel; Grace Commons is the structured-natural-language parallel. Both extend the same EOS-conceptual core; neither displaces the other.

The methodology, philosophy, and full inheritance are in [`the-spec-layer.md`](./the-spec-layer.md). Grace Commons is named for Grace Hopper, who first argued that business logic should be readable by the people who understand the business.

---

## Reading order for a fresh session

If you have no prior context, read in this order:

1. **[`readme.md`](./readme.md)** — architecture overview, current contents tree, the three-layers framing (atoms, applications, emergent invariants). Brief.
2. **[`the-spec-layer.md`](./the-spec-layer.md)** — the manifesto. The *Principles* section (information-management triad + design-quality inheritances) and *Bridges* section (load-bearing humans↔machines bridge, *does this build a bridge, or build a wall?* litmus test) anchor the framing.
3. **[`pressure-testing.md`](./pressure-testing.md)** — the three-pass methodology (GRID structural, EOS conceptual independence, Linus adversarial), the four-step authoring rubric, and the **Regulated-pattern conventions** section that canonicalizes *Regulated adversarial scenarios* and *Generation acceptance*.
4. **[`spec-format.md`](./spec-format.md)** — the canonical reference for the shape of a Grace Commons spec. Enumerates the three shapes (atom, composition, regulated overlay), the required sections in order, and the canonical examples to mirror. Drafter agents (human or AI) read from here.
5. **[`contributing.md`](./contributing.md)** — contribution shape, the three perspectives (rigor / clarity / implementability), the quality bar, and the contribution lifecycle.
6. **An example atom.** [`atoms/personal-todo.md`](./atoms/personal-todo.md) for the simplest atom shape with a two-iteration Lineage record. [`atoms/actor-identity.md`](./atoms/actor-identity.md) for the regulated-atom shape (carries both regulated-pattern conventions).
7. **An example application.** [`compositions/idempotent-reservation.md`](./compositions/idempotent-reservation.md) for a two-atom composition. [`compositions/audit-trail.md`](./compositions/audit-trail.md) for the four-atom canonical regulated-audit composition.

When drafting a new pattern, additionally read the most structurally adjacent existing pattern — mirror its shape.

---

## Vocabulary — load-bearing terms

| Term | Meaning |
|------|---------|
| **Atom** | A freestanding concept with its own state, actions, invariants. Specification does not name another atom. Stored flat as `atoms/<name>.md` (no category folder; classification is derived — see [`atoms/TAXONOMY.md`](./atoms/TAXONOMY.md)). |
| **Application** | A composition of two or more atoms. Specification names the atoms it composes. Files in `compositions/`. |
| **Freestanding** | EOS-sense: the concept can be specified without naming any other concept. Pass 2 enforces this. |
| **Emergent invariant** | A property that appears only at composition time and belongs to no single constituent atom. Compositions surface these explicitly under *Composition-level invariants*. |
| **Regulated atom** | An atom carrying the regulated overlay, or one whose acceptance bar is set by an external evaluator (regulator, auditor). Carries two extra sections: *Regulated adversarial scenarios* and *Generation acceptance*. |
| **Lineage notes** | The per-pattern record of what each pressure-testing pass surfaced and how it was resolved. Recursive: the notes themselves can be pressure-tested. |
| **GRID** | The nine-node MUSE v1.1 completeness framework (Intent, System, Friction, Flow, Decision, Feedback, State, Behavior, Proof). Pass 1's checklist. |
| **The canonical regulated-audit stack** | Event Log + Actor Identity + Retention Window + Tamper Evidence → Audit Trail. All four atoms grounded; the four-atom application landed. The library's worked example of multi-atom composition under regulated load. |

---

## Authoring conventions

These are conventions every atom and application follows. Deviations are review findings, not stylistic choices.

- **Atoms are freestanding.** The specification does not name another pattern. Directory placement is the operational form; the deeper criterion is EOS Pass 2 — does the concern have its own state machine, recur across many domains, deserve its own atom.
- **Identity model is always explicit.** Opaque system-generated id (immutable); other fields are immutable properties of the record (set on the creating action, never change). Never use a content field as identity.
- **Action signatures are always explicit.** `action(args) → result | rejected(reason)`. Every rejection reason is named. Queries with multiple legitimate outcomes use first-class result tags (e.g., `verified | failed-verification(reason) | not-known`) rather than a success-or-reject pair.
- **Invariants are named descriptively first, then numbered.** Format: `**Invariant N — Descriptive name.** Statement.` Never letter-prefix codes (no Invariant A.1, B.2, etc.).
- **Defended-in-line.** Each architectural claim states principle, likely objection, mechanism that resolves it, result. Authoring well prevents what Pass 3 would otherwise catch.
- **Examples cover happy path and rejection path.** Regulated atoms additionally include a *Regulated adversarial scenarios* subsection walking the three canonical adversarial classes: regulator audit, disputed transaction / data-subject request, breach forensics.
- **Edge cases name composing patterns by link.** Out-of-scope concerns name the atom or application that handles them. Forthcoming-links resolve to real links when the referenced atom lands.
- **Standards inheritance is selective.** Cite only standards that genuinely apply to the atom; frame standards that belong to a composing pattern as the composing pattern's obligation rather than this atom's.
- **Lineage notes record the three-pass arc.** Pass 1 GRID findings, Pass 2 EOS extractions, Pass 3 Linus fixes — what was found, what was closed in-pattern, what was deferred as explicit out-of-scope. Conventions inherited from the canonical methodology are named as such (not re-derived from predecessor atoms).

---

## The three-pass review

Every pattern survives three pressure-testing passes before reaching `grounded`:

- **Pass 1 — GRID structural.** All nine MUSE nodes resolved with their references intact. Mechanical; 15-30 min for an atom.
- **Pass 2 — EOS conceptual independence.** Every concern belongs to *this* concept; over-absorption is extracted as a separate atom. 10-20 min once familiar with the catalog.
- **Pass 3 — Linus adversarial.** Muddled identities, sloppy invariants, hidden decisions, happy-path-only examples — all surfaced and either fixed in-pattern or named as explicit out-of-scope. 30-60 min; most labor-intensive of the three.

Each pass catches a different class of gap. Skipping is not an option. A pattern that has only survived one or two passes declares its actual status (`unresolved`, `partially resolved`) rather than false `grounded`. See [`pressure-testing.md`](./pressure-testing.md) for the full methodology and worked examples.

**Round structure (baseline + Final Critique).** Canonicalized in [`pressure-testing.md`](./pressure-testing.md) §Order and iteration, *Round structure and naming* (landed 2026-06-07; this file no longer carries the standing text). The load-bearing points: 3×3 baseline (three rounds, each running Pass 1 / Pass 2 / Pass 3); pass numbering resets per round so "Pass 3" always means the Linus adversarial pass; Final Critique is the AI-conducted closing round starting at Round 4; `grounded on Final Critique N` is the canonical grounding marker; older cumulative Pass 1–9 numbering carries a retro-mapping note.

---

## Regulated-pattern conventions

Two structural sections are **required** for atoms carrying the regulated overlay, atoms in other categories whose examples invoke regulated domains, and applications composing any of the above:

- **Regulated adversarial scenarios** — an *Examples* subsection walking three canonical adversarial reads: *regulator audit* (a query against records that must return the expected result by virtue of an invariant), *disputed transaction or data-subject request* (an external party challenges the system's claim and the records must answer), *breach or incident investigation* (an investigator queries during or after an anomaly).
- **Generation acceptance** — a standalone section naming what a derived implementation must produce, framed as the bar an external auditor must be able to clear *from the records alone*, with no recourse to source code, runbooks, or developer narration. Typically four-to-six checks.

Both conventions are **inherited from the methodology directly**, not re-derived from predecessor atoms. Lineage notes for new regulated patterns cite the methodology, not earlier worked examples.

---

## Current state of the library

[`roadmap.md`](./roadmap.md) is the **single source of truth** for the library's current state — the grounded counts, the per-category atom and composition lists, and what is in-progress, unblocked, or blocked on remaining atoms. This file deliberately does **not** restate that snapshot: a mirrored count drifts (this section long read "twenty atoms and eight compositions" while ROADMAP had moved well past both), and the library is built on DRY/SSOT — the same discipline applies to its own docs. Read ROADMAP for the current tree, counts, and sequencing.

The structural milestones worth carrying into any session — architectural facts rather than counts — are:

- **Audit Trail** is the canonical regulated-audit stack — Event Log + Actor Identity + Retention Window + Tamper Evidence wired into a single application with attribution coverage, retention coverage, cascade-on-purge, and forensic completability as emergent invariants. The library's worked example of multi-atom composition under regulated load.
- **Notification Fanout** is the first composition to produce a variable number of effects from a single trigger; it completes the messaging atom pair and formalizes the fan-out boundary rule from the Execution Contract.
- **Multi-Party Approval** is the first composition to compose another composition (Audit Trail as substrate), establishing the substrate-composition pattern.
- **Defensible Retention** anchors the FRCP Rule 37(e) / SOX §802 / HIPAA §164.530(j) / SEC Rule 17a-4 / GDPR Article 17 record-retention axis; retires forthcoming-links in Legal Hold, Retention Window, and Audit Trail.
- **Attributed Permissions Admin** is the first composition to pair two compliance-infrastructure atoms (Permissions + Actor Identity) into a single administrative surface, and the first to ship with a dynamic Alloy trace model (Alloy 6 LTL) verifying its load-bearing temporal claims alongside the static structural model.
- **KYC / Customer Onboarding (C8)** is the verification-gates-activity composition — Party Identity + Retention Window + Audit Trail (substrate) — whose gate enforces *verified-through-C8* via the composition's own case index, with a records-alone `trigger_id` lifecycle for adverse monitoring. Grounded on Final Critique 4 (2026-06-03).

---

## Workflow for adding a new pattern

1. **Triage atom vs. application.** Apply the directory-placement test (does the specification name another pattern?) and confirm against EOS Pass 2. The deeper criterion: does the concern have its own state machine, recur across many domains, deserve its own atom?
2. **Identify the closest existing pattern.** Read it carefully; mirror its shape, vocabulary, and conventions. *Actor Identity* and *Retention Window* are the references for new regulated atoms; *Personal Todo* is the reference for productivity primitives; *Idempotent Reservation* and *Audit Trail* are the references for compositions.
3. **Draft.** For regulated atoms or applications composing regulated atoms, bake in *Regulated adversarial scenarios* and *Generation acceptance* from the first draft. Identity model and action signatures explicit. Invariants named descriptively then numbered.
4. **Run all three passes.** GRID first, EOS second, Linus third. Iterate until clean. Lineage notes record what each pass found and how it was resolved.
5. **Resolve forthcoming-links.** Any existing atom whose Composition notes name the new pattern as `*(forthcoming)*` gets the marker removed and the reference linked.
6. **Update catalog files.** Regenerate the browse-by-overlay catalog (`atoms/index.md`, via `python3 tools/taxonomy/generate_views.py .`), the top-level snapshot in `readme.md`, and — for applications — `compositions/README.md`. Add the new pattern with a one-line description and the standards it anchors. (Atom overlays are derived, so the catalog regenerates rather than being hand-maintained.)

---

## Open architectural questions

Moved out of this file — CLAUDE.md stays agent-operational and is not the SSOT for canonical knowledge (the same discipline already applied to library *state*, which defers to ROADMAP). The deferred decisions — taxonomy axes, regulation-as-folder-vs-attribute, the guided-process state→phase→action mapping — and the convention for resolving them now live in [`open-questions.md`](./open-questions.md), the SSOT (the mirror of `discoveries.md`: found things vs. open things). Read it when a session might touch one of them.

---

## Session hygiene

**Never commit without explicit approval.** When work is ready to commit, write the proposed commit message inline in the chat and stop. Do not run `git commit`. Wait for the user to read the message and say to proceed. This rule has no exceptions — not for trivial fixes, not for "obvious" changes, not when the user says "commit" without first seeing the message.

**Prompts go in chat, not files.** When asked for a prompt — for an AI adversarial review pass, a kickoff, a handoff, a sub-agent brief, anything — write it inline in the chat reply, as short as the task permits. Do **not** create prompt files in the repo. Prompts are ephemeral scaffolding; they carry no review pass, no Lineage notes, no authoring discipline, and they clutter the repo as content structurally indistinguishable from canonical patterns to any future reader (human or AI). Past sessions have written Round 3 / Final Critique review prompts as standalone files at the repo root; that was a mistake. The review's findings land in the pattern's Lineage notes under the appropriate round's Pass 1 / Pass 2 / Pass 3 entries; the prompt that drove the review stays in the chat where it was issued and is not committed.

The same rule applies to review *outputs*: a Round 3 review's findings are folded into Lineage notes, not written as a standalone review file alongside the pattern.

The only prompt-shaped content that belongs in the repo is methodology — the three-pass question sets and authoring rubric in [`pressure-testing.md`](./pressure-testing.md). That content is canonical, reviewed, and edited like any other library document. Everything else is chat.

---

## Implementation-discovered findings

Building demos or production systems against a spec sometimes surfaces problems the three-pass review missed. The discipline below keeps the spec-as-canonical story honest without silencing implementation discoveries.

A **finding** is a contradiction *inside* the spec — an action wiring and an invariant disagree, two passages describe different behavior for the same case, a CHECK and a trigger cannot both hold, an example violates an invariant, a forthcoming-link points at something that already landed under a different name. Findings are Pass-3-shaped and belong in the pattern's Lineage notes as a new pass. Log them; route them through the standard review channel; do not modify the spec mid-build.

A **preference** is anything else — *"this would be cleaner if…"*, *"I'd rather have one table than four"*, *"the column name is awkward"*, *"this collapses to a simpler form in my implementation"*. Preferences are implementation choice and belong in the implementation's own follow-up tracker (e.g., a `CORNERS.md` alongside the build), not in the spec.

The single distinguishing question: does the observation name a contradiction *inside* the spec, or a preference *outside* it? If the answer is not obviously the first, it is the second. The bar is "contradiction, not preference" — deliberately not "very wrong," because *very wrong* slides under any sustained effort and *contradiction* does not. A contradiction can be named by pointing at the two passages that disagree; a preference cannot.

Builds proceed against the spec as written. The spec changes only through a review pass, not through a code commit. An agent that rewrites the spec inline during a build has made a process error, regardless of whether the rewrite is correct — the correct path is to log the finding, finish the build against the existing spec, and let the review channel adjudicate.

---

## Canonical documents

- [`readme.md`](./readme.md) — home page, current contents snapshot, three-layers framing.
- [`the-spec-layer.md`](./the-spec-layer.md) — the architectural manifesto.
- [`pressure-testing.md`](./pressure-testing.md) — three-pass methodology, regulated-pattern conventions, multi-file refinement order.
- [`contributing.md`](./contributing.md) — contribution shape, three perspectives, four-step authoring rubric, lifecycle.
- [`spec-format.md`](./spec-format.md) — canonical reference for the three spec shapes (atom, composition, regulated overlay), required sections in order, and the canonical examples to mirror.
- [`roadmap.md`](./roadmap.md) — planned atoms and compositions in dependency order; what each unlocks; what each blocks on.
- [`execution-contract.md`](./execution-contract.md) — the deterministic compilation target: three primitives, four-step pipeline, atom-to-runtime mapping, conformance definition.
- [`atoms/`](./atoms/) — the generated browse-by-overlay catalog (`atoms/index.md`, emitted by `tools/taxonomy/generate_views.py` from the reverse index).
- [`compositions/README.md`](./compositions/README.md) — compositions catalog, vocabulary note.

---

## Tone

Grace Commons authoring is plain, dense, and defended-in-line. The architecture is software engineering one level up; the same principles that discipline good code — DRY, SSOT, explicit-over-implicit, separation of concerns, composition over inheritance, YAGNI, encapsulation, fail-fast, KISS — discipline the canonical spec. The Spec Layer's claimed contribution is the *information-management triad* (DRY/SSOT/explicit) applied at the intent level; the design-quality principles are inherited from existing practice.

When in doubt, say more. Verbosity that preserves meaning is a feature, not a defect. AI summaries can shorten the canonical text for orientation; the canonical text itself stays long because it must be verifiable.

The litmus test for any architectural addition is from the *Bridges* section of the manifesto: *does this build a bridge, or does it build a wall?* Walls exclude an audience to optimize for another; bridges accommodate both. The architecture optimizes for bridges by default.

---

## Cowork sandbox notes (environment-specific — not Grace Commons content)

Operational quirks of running this repo inside the Cowork Linux sandbox. These are environment facts, not canonical content, and do not apply to a local machine / Claude Code. Recorded so a session need not rediscover them.

- **The formal harness needs Java 17, and the bootstrap must finish.** `node tools/harness/audit.mjs` checks `.tla` models with a bundled WASM checker (works out of the box) and `.als` (Alloy) models with `tools/alloy/alloy.jar`, which needs **Java 17** — the sandbox's system Java is 11, too old for Alloy 6. `tools/harness/bootstrap.sh` installs a JRE 17 to `/tmp/javajre` via npm; the unpack is large and **overruns a ~45-second command window**, and if it is cut off it leaves `jre/` without `lib/` (no `libjli.so`), so *every* `.als` fails with `libjli.so: cannot open shared object file` while `.tla` still passes. Fix: re-run the install until `/tmp/javajre/node_modules/javajre-linux-64/jre/lib/libjli.so` exists (it finishes even when the foreground call times out). Each Alloy model takes ~5–40s, so the full 74-model audit will not complete in one window — run `.als` in small batches.

- **Always pass `--no-optional-locks` to git.** Use `git --no-optional-locks status`, `git --no-optional-locks diff`, etc. on *every* git invocation. Any index-refreshing git command otherwise writes `.git/index.lock`, which the mount cannot `unlink` (see below), leaving a stale lock that blocks the user's next `git commit`. `--no-optional-locks` tells git not to take the optional index lock, so none is created in the first place. Prefer the Read/Grep/Glob file tools over git for inspecting changes when you can.

- **The mount blocks `unlink`.** `rm`, `git rm`, and any delete fail with *Operation not permitted* until the cowork delete-permission tool (`allow_cowork_file_delete`) is invoked once for the folder. Do **not** try to move a stuck `.git/index.lock` aside — `rename` "works" but only produces a second orphan you also can't remove, and it does not clear the real `.git/index.lock` (git just recreates it on the next index-touching call). The fix is to not create the lock at all (`--no-optional-locks`, above); if one already exists, clear it with `allow_cowork_file_delete` or have the user `rm` it locally. Separately, every `sed -i` / `perl -i` leaves a `.fuse_hiddenXXXX` orphan of the pre-edit file (these get swept into `git add -A` and corrupt rename detection — delete them before staging). `git mv` (rename) is unaffected.

- **~45 seconds per command, and background work does not reliably survive between calls.** Chunk long operations (npm installs, the full audit) rather than backgrounding them.
