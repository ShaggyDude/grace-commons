# Grace Desk — project brief

> **Status: internal staging, not canonical.** Proposal for the review channel. Drafted 2026-07-10 by AI (Claude Fable 5) for author adjudication; nothing here changes canon. If adopted, this document dies into: one composition proposal routed through review, one deployment design doc, and seed items on the desk itself. Naming throughout is working-name only and rides `working-ideas/naming.md`; *Grace Desk* names a deployment (a proper name, outside the term lint by that document's own scope note).

## What it is

A shared plan board and triage desk for the Grace Commons operation — the drain for the formal-work queue `risks.md` records as designed-but-unbuilt — operated jointly by the author and the agent fleet, and itself derived from the corpus it serves. Record-space is a permissioned, attributed, tamper-evident shared task list. Draft-space is an undo tree: agents work in forked plan branches where no state is ever lost, and the record advances only through `promote` — the human adjudication seam. It ships as the clone-and-go child project: `clone → make up → a city stands up around a desk that already has real work on it`.

## Why it is neither empty nor fake

**Not empty:** seeded on day one from the repo's actual open items (§Seed backlog) — the board starts with ~25 real tasks, several of them years-of-history debts. **Not fake:** it drains a named gap (`risks.md` §Status semantics: "a formal-work queue with no drainer — the same rot, by construction"), it is used daily by the city and the author, and it generates corpus work rather than consuming it — one new composition to ground, one registered candidate concept faced with its first real witness. **Full circle:** the specs derive the app, the conformance validator gates it, the city operates it, and the desk tracks the work of building the desk.

## RECIPE

**Grounded today (composed):**

| Pattern | Role in the desk |
|---|---|
| Shared Todo (Personal Todo + Permissions + Assignment) | Record-space substrate: permission-gated shared tasks, at-most-one-responsible, cascade-on-delete. Its spec's first named use case is this app's shape. |
| Audit Trail (substrate → Event Log + Actor Identity + Tamper Evidence + Retention Window) | Attribution and sealing for record-space — load-bearing once actors include agents. |
| Undo History | Replay-skip undo per timeline; the event-sourced state derivation the desk runs on. |
| Event Log (additional instances) | One instance per draft branch — the decomposition the Branching Undo adversarial pass already proved ("per-branch log instances plus a lineage index"). |

*Named peers, not composed (yet):* Notification Fanout (assignment pings), Approval Step / Multi-Party Approval (a future M-of-N promote gate), Compensable Workflow (compensating reversal where a promoted change has external effects).

**To be grounded (the real spec work):**

1. **Undo Across Actors** *(working name; act head "Undo", modifier carrying the multi-actor distinction)* — retires the named edge case in Undo History §Edge cases ("Multi-actor undo … requires composing Shared Todo + Event Log + a Concurrency Resolution pattern"). Novel surface: the undo-permission scope (who may undo whose action — `undo:own` vs `undo:any` vs per-actor grants, a Permissions scope map); **attributed session-revert** (replay-skip over one actor's contiguous attributed span as a unit — the "decline this agent session" action); undo-of-undo across actors; interaction with Assignment's cascade rules. The "Concurrency Resolution pattern" clause is a triage question, not a presumption — it may route to the Execution Contract's existing runtime-serialization obligation rather than a new pattern.
2. **Scenario Workspace** *(registered candidate, roadmap 2026-07-06)* — fork / explore / compare / promote over draft-space, per-branch Event Log instances + a lineage index (a derived index per Execution Contract §Composition state), `promote` as an ordinary append into record-space carrying the lineage reference. **Recommended route: witness-first, extraction-after** — the Attributed Permissions Admin precedent ("an implementation artifact that earned promotion"), and exactly what the candidate entry says it awaits ("pending witnesses plus the gates"). The desk ships draft-space as deployment behavior under a design doc; the pattern faces the routing test once witness data exists. If it routes to reuse instead of a new composition, the desk is unaffected — the decomposed shape is what gets built either way.

**Deployment configuration (not patterns):** the HITL permission map — agents hold grants in draft-space only; `promote` and record-space writes are the adjudicator's; the grace-city pack (rescan order, grounding formula, desk-triage formula, prompt templates with fresh-reader discipline baked in); the seed import; the bootstrap script.

## The two load-bearing boundaries, stated as spec questions

**Draft/record.** Candidate emergent invariants for the deployment design doc (and eventually the composition): (1) *single seam* — no record-space write except through `promote`; (2) *promote binding bijection* — the plan-apply, the lineage reference, and the sealed `desk.promoted` audit event commit together or not at all (the house TLA+ shape: Chain of Custody / Immutable Transaction Ledger family, model + buggy twin largely liftable); (3) *no timeline lost* — a declined or abandoned branch remains reachable and comparable; (4) *branch provenance* — every branch names the record-state it forked from.

**Undo permissions.** Who undoes whom; whether an agent may undo its own actions inside its branch (yes, freely — that is what draft-space is for) versus in record-space (never directly — record-space reversal is itself a promoted change); how session-revert composes with Assignment (recall semantics on undone assigns). These are the genuinely new invariants Undo Across Actors exists to own.

**SSOT boundary (explicit, to foreclose the status-mirror failure class):** the desk tracks *work items*, never *library state*. Pattern Status lines remain the source of truth; roadmap remains the registry; desk tasks link to them and mirror nothing. A desk task that restates a Status line is the drift `pressure-testing.md`'s no-snapshot rule exists to kill.

## Seed backlog (day one, from the repo's actual open items)

- **Methodology debts** (roadmap §Methodology debts, open as of 2026-07-10): #7 Logic Confinement full application (projector + harness — NLnet deliverable); #8 lineage manifest + generator seam + per-run provenance; #9 composition-state retrofit audit across the pre-rule corpus (pair with the debt-#1 Lineage-format remnants); #10 Tiny Map convention + sweep; #11 (a)–(d) agentic-formalization adoptions; #12 CWE tags on the security overlay; #13 inline generation-provenance marker; #15 broad acronym-whitelist enforcement (deferred half); #16 Augment brownfield adoptions.
- **Open questions** (open-questions.md): guided-process state → phase → action mapping; the readability discipline that sticks; status-line grammar steps 1–3 + the token-taxonomy boundary; canonical-vs-staging labeling hardening; generation coverage matrix (trigger-bound to the first projector deliverable); the generated open-questions index + roadmap dashboard.
- **Standing orders** (become city orders whose outputs land as desk tasks): weekly council rescan (risk-weighted: oldest-rescan-first, fan-in tie-break from `_data/patterns.json`); harness + conformance re-runs; lint-gap additions (status-mirror check, table-duplicate check, dangling-capability check).
- **Pattern work:** Undo Across Actors (this brief); Scenario Workspace witness write-up → routing test; Idempotency Result Memo atom; Subset Proof atom; Completeness Model atom; healthcare backlog triage; second-adjudicator / succession documentation (risks.md §Adjudication bottleneck).

## Delivery phases and effort

*All numbers are estimates, labeled as such per the measurement discipline; token figures are all-in guesses calibrated to the measured 2026-06 baselines (≈270k all-in per net-new grounded pattern; ≈0.5M per clean council rescan; Beacon phases 1–6 in ~2 days of sessions).*

| Phase | Contents | Sessions | Tokens (est.) | Calendar |
|---|---|---|---|---|
| 0 — Spec first | Ground **Undo Across Actors** (full pipeline: plan → draft → rounds → Final Critique → TLA+ model + twins); deployment design doc for draft-space (spec-before-build per risks.md, tooling not exempt) | 2–3 | 0.4–0.8M | 3–5 days |
| 1 — Record-space desk | A-stack render: Shared Todo + Audit Trail substrate + Undo Across Actors; Generation-acceptance-derived manifest; conformance to 20/20-style score; seed import | 3–5 | 1–2M | ~1 week |
| 2 — Draft-space | Branches, lineage index, compare view, `promote` seam; promote-bijection TLA+ model + twins (house shape); session-revert surface | 3–5 | 1–2M | ~1 week |
| 3 — City + clone-and-go | grace-city pack (rescan order, grounding + desk formulas), bootstrap script, first council-run rescan operated *through the desk*; witness write-up folded into the Branching Undo candidate + discoveries | 2–3 | 1–2M | 3–5 days |

**Totals (estimate):** 10–16 working sessions over **3–5 weeks part-time**; **3–7M tokens all-in** (comparable to a few days of the June sprint's burn rate); human attention concentrated in adjudication and triage, **≈ 12–20 hours** — roughly a quarter to a third of one NLnet sprint (60 h). Instrumentation from day one so the 80% question produces data, not anecdotes: tasks closed by agents without human edit; promote acceptance rate; platform-sourced cost per closed task.

**Risks:** gascity velocity (pin versions; budget ~half a session per upgrade; the city pack lives in the child repo, never in grace-commons, per the prompts-out-of-repo rule and the public/private boundary risk); Scenario Workspace routing to reuse (absorbed — deployment shape unchanged); the Concurrency Resolution triage adding one small pattern (absorbed in Phase 0's upper bound); reviewer-vendor dependence unchanged by this project (already on the register).

## Adjudication asks

1. Names: *Grace Desk* (deployment), *Undo Across Actors* (composition working name).
2. Repo placement: new public child repo (recommended) vs. under grace-commons.
3. Stack: Beacon's Deno/SQLite lineage vs. the A-stack Deno/PostgreSQL reference — recommend whichever the projector targets first, since the desk should be projector output as early as possible.
4. Scenario Workspace route: witness-first (recommended, APA precedent) vs. ground-first.
5. Whether Phase 3's first council-run rescan replaces or shadows the current by-hand cadence for one cycle before cutover.
