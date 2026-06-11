# AGENTS.md — Grace Commons session bootstrap

> Do not cut corners unless you have VERY good reasons and in that case ask.

> Standing instructions for any AI agent session working on Grace Commons, regardless of vendor or tool. (`CLAUDE.md` is a one-line shim pointing here, so Claude tooling and AGENTS.md-reading tools share this single source.) **This file is an agent-operational index and nothing more**: it points at the canonical documents and records environment quirks. It deliberately carries no canonical content — no vocabulary mirrors, no convention restatements, no library-state snapshots. Every rule it once mirrored now lives in exactly one canonical home, linked below. (The lesson that shaped this: every mirrored sentence in this file's CLAUDE.md-era predecessor eventually drifted from its source — stale counts, stale open-question lists, stale convention text. On 2026-06-11 the file was cut to pointers; the sections below that look like content are one-line redirects kept so historical "per CLAUDE.md §…" references in Lineage notes still resolve — via the shim, they land here.)

---

## What Grace Commons is

A public library of **atoms** and **compositions** expressed as structured natural language: the spec is canonical, code is a derived build artifact. The thesis, philosophy, and inheritance are in [`the-spec-layer.md`](./the-spec-layer.md); the architecture overview is in [`readme.md`](./readme.md). Named for Grace Hopper, who first argued that business logic should be readable by the people who understand the business.

---

## Reading order for a fresh session

If you have no prior context, read in this order:

1. **[`readme.md`](./readme.md)** — architecture overview, atoms vs. compositions, the three-layers framing. Brief.
2. **[`the-spec-layer.md`](./the-spec-layer.md)** — the manifesto. *Principles* and *Bridges* anchor the framing.
3. **[`pressure-testing.md`](./pressure-testing.md)** — the three-pass methodology, round structure and grounding semantics, formal-layer machinery, regulated-pattern conventions, capability provenance, the no-snapshot rule.
4. **[`spec-format.md`](./spec-format.md)** — the three spec shapes, required sections in order, and the cross-cutting authoring conventions (owned there as of 2026-06-11).
5. **[`contributing.md`](./contributing.md)** — contribution shape, the three perspectives, quality bar, lifecycle, the workflow for adding a new pattern, and the implementation-discovered-findings discipline.
6. **[`execution-contract.md`](./execution-contract.md)** — the deterministic compilation target: three primitives, four-step pipeline, atom-to-runtime mapping, conformance.
7. **An example atom.** [`atoms/personal-todo.md`](./atoms/personal-todo.md) (simplest shape); [`atoms/actor-identity.md`](./atoms/actor-identity.md) (regulated shape).
8. **An example application.** [`compositions/idempotent-reservation.md`](./compositions/idempotent-reservation.md) (two-atom); [`compositions/audit-trail.md`](./compositions/audit-trail.md) (the canonical regulated-audit stack).

When drafting a new pattern, additionally read the most structurally adjacent existing pattern — mirror its shape.

---

## Canonical documents — where every rule lives

- [`readme.md`](./readme.md) — home page, three-layers framing, atom/composition vocabulary.
- [`the-spec-layer.md`](./the-spec-layer.md) — the architectural manifesto; principles, bridges, tone.
- [`pressure-testing.md`](./pressure-testing.md) — three-pass methodology; round structure and `grounded` semantics; formal models, the formal-layer vote, the coverage cross-check; capability provenance; regulated-pattern conventions; the no-snapshot rule.
- [`spec-format.md`](./spec-format.md) — the three spec shapes, required sections, reading tiers, authoring conventions.
- [`contributing.md`](./contributing.md) — contribution lifecycle; workflow for adding a new pattern; implementation-discovered findings; formal-model artifact conventions.
- [`execution-contract.md`](./execution-contract.md) — runtime semantics; composition state; substrate invocation; testing model; conformance.
- [`roadmap.md`](./roadmap.md) — **single source of truth for library state**: counts, per-pattern status rows (mirroring each pattern file's Status line), sequencing, structural milestones on the pattern rows.
- [`open-questions.md`](./open-questions.md) — SSOT for deliberately-deferred architectural decisions. Read before touching anything it names.
- [`discoveries.md`](./discoveries.md) — dated findings log (the mirror of open-questions: found things vs. open things).
- [`risks.md`](./risks.md) — the risk register and dated maturity estimate; owned, re-assessed on dated markers.
- [`changelog.md`](./changelog.md) — dated change records.
- [`governance.md`](./governance.md) — draft admission/sealing proposal. [`measurement.md`](./measurement.md) — token-cost ledger. [`demos.md`](./demos.md) — live renders. [`glossary.md`](./glossary.md) — strict definitions for load-bearing English. [`ai-usage-log.md`](./ai-usage-log.md) — AI-assistance disclosure.
- [`atoms/index.md`](./atoms/index.md) — generated browse-by-overlay catalog (regenerate via `python3 tools/taxonomy/generate_views.py .`). [`compositions/README.md`](./compositions/README.md) — compositions catalog.

---

## Vocabulary — load-bearing terms

Moved — no mirror kept. Atom, application/composition, freestanding, and emergent invariant are defined in [`readme.md`](./readme.md); GRID, the three passes, `grounded`, and Lineage notes in [`pressure-testing.md`](./pressure-testing.md); the three shapes and regulated overlay in [`spec-format.md`](./spec-format.md); strict spec-language terms in [`glossary.md`](./glossary.md).

## Authoring conventions

Moved — owned by [`spec-format.md`](./spec-format.md) §What's not in this document (as of 2026-06-11). Deviations are review findings, not stylistic choices.

## The three-pass review

Moved — owned by [`pressure-testing.md`](./pressure-testing.md): pass definitions, §Order and iteration (round structure and naming; `grounded on Final Critique N` is the canonical marker), and §What "grounded" means (the formal-layer vote and Opus clearance gate).

## Regulated-pattern conventions

Moved — owned by [`pressure-testing.md`](./pressure-testing.md) §Regulated-pattern conventions (the two required sections and when they apply); section placement by [`spec-format.md`](./spec-format.md) §Regulated overlay.

## Current state of the library

Moved — [`roadmap.md`](./roadmap.md) is the single source of truth for counts, statuses, and sequencing; structural milestones are recorded on each pattern's roadmap row. The no-snapshot rule that used to live here is owned by [`pressure-testing.md`](./pressure-testing.md) §The no-snapshot rule.

## Workflow for adding a new pattern

Moved — owned by [`contributing.md`](./contributing.md) §Workflow for adding a new pattern (as of 2026-06-11).

## Open architectural questions

Moved — [`open-questions.md`](./open-questions.md) is the SSOT. No list is mirrored here: the last mirrored list in this file went stale (it carried two questions as open after they were resolved and executed on 2026-06-08).

## Implementation-discovered findings

Moved — owned by [`contributing.md`](./contributing.md) §Implementation-discovered findings (as of 2026-06-11). The one-line form: a **finding** names a contradiction inside the spec and routes through the review channel; everything else is a **preference** and belongs in the build's own tracker; builds proceed against the spec as written.

## Tone

Moved — the verbosity-preserves-meaning and bridges-over-walls principles are owned by [`the-spec-layer.md`](./the-spec-layer.md) (§The Architecture, §Principles, §Bridges); complete-over-concise and the reading tiers by [`spec-format.md`](./spec-format.md). The litmus test for any addition: *does this build a bridge, or does it build a wall?*

---

## Session hygiene

**Never commit without explicit approval.** When work is ready to commit, write the proposed commit message inline in the chat and stop. Do not run `git commit`. Wait for the user to read the message and say to proceed. This rule has no exceptions — not for trivial fixes, not for "obvious" changes, not when the user says "commit" without first seeing the message.

**Prompts go in chat, not files.** When asked for a prompt — for an AI adversarial review pass, a kickoff, a handoff, a sub-agent brief, anything — write it inline in the chat reply, as short as the task permits. Do **not** create prompt files in the repo. Prompts are ephemeral scaffolding; they carry no review pass, no Lineage notes, no authoring discipline, and they clutter the repo as content structurally indistinguishable from canonical patterns to any future reader (human or AI). Past sessions have written Round 3 / Final Critique review prompts as standalone files at the repo root; that was a mistake. The review's findings land in the pattern's Lineage notes under the appropriate round's Pass 1 / Pass 2 / Pass 3 entries; the prompt that drove the review stays in the chat where it was issued and is not committed.

The same rule applies to review *outputs*: a Round 3 review's findings are folded into Lineage notes, not written as a standalone review file alongside the pattern.

The only prompt-shaped content that belongs in the repo is methodology — the three-pass question sets and authoring rubric in [`pressure-testing.md`](./pressure-testing.md). That content is canonical, reviewed, and edited like any other library document. Everything else is chat.

---

## Cowork sandbox notes (environment-specific — not Grace Commons content)

Operational quirks of running this repo inside the Cowork Linux sandbox. These are environment facts, not canonical content, and do not apply to a local machine / Claude Code. Recorded so a session need not rediscover them.

- **The formal harness needs Java 17, and the bootstrap must finish.** `node tools/harness/audit.mjs` checks `.tla` models with a bundled WASM checker (works out of the box) and `.als` (Alloy) models with `tools/alloy/alloy.jar`, which needs **Java 17** — the sandbox's system Java is 11, too old for Alloy 6. `tools/harness/bootstrap.sh` installs a JRE 17 to `/tmp/javajre` via npm; the unpack is large and **overruns a ~45-second command window**, and if it is cut off it leaves `jre/` without `lib/` (no `libjli.so`), so *every* `.als` fails with `libjli.so: cannot open shared object file` while `.tla` still passes. Fix: re-run the install until `/tmp/javajre/node_modules/javajre-linux-64/jre/lib/libjli.so` exists (it finishes even when the foreground call times out). Each Alloy model takes ~5–40s, so the full 74-model audit will not complete in one window — run `.als` in small batches.

- **Always pass `--no-optional-locks` to git.** Use `git --no-optional-locks status`, `git --no-optional-locks diff`, etc. on *every* git invocation. Any index-refreshing git command otherwise writes `.git/index.lock`, which the mount cannot `unlink` (see below), leaving a stale lock that blocks the user's next `git commit`. `--no-optional-locks` tells git not to take the optional index lock, so none is created in the first place. Prefer the Read/Grep/Glob file tools over git for inspecting changes when you can.

- **The mount blocks `unlink`.** `rm`, `git rm`, and any delete fail with *Operation not permitted* until the cowork delete-permission tool (`allow_cowork_file_delete`) is invoked once for the folder. Do **not** try to move a stuck `.git/index.lock` aside — `rename` "works" but only produces a second orphan you also can't remove, and it does not clear the real `.git/index.lock` (git just recreates it on the next index-touching call). The fix is to not create the lock at all (`--no-optional-locks`, above); if one already exists, clear it with `allow_cowork_file_delete` or have the user `rm` it locally. Separately, every `sed -i` / `perl -i` leaves a `.fuse_hiddenXXXX` orphan of the pre-edit file (these get swept into `git add -A` and corrupt rename detection — delete them before staging). `git mv` (rename) is unaffected.

- **~45 seconds per command, and background work does not reliably survive between calls.** Chunk long operations (npm installs, the full audit) rather than backgrounding them.
