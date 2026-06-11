---
title: Measurement
nav_order: 13
---

# Measurement

Companion to [`pressure-testing.md`](./pressure-testing.md): that's the quality
bar, this is the cost. One rule, kept deliberately simple.

## The rule

Work a medium chunk of patterns → commit → log one line. Tokens for a pattern =
**chunk's total session tokens ÷ patterns produced in that chunk**, split into two
buckets because a composition costs more than an atom:

- **atoms** and **compositions** counted separately.
- Only count patterns that reached `grounded` (cost-to-verified, not cost-to-draft).
- Include rework tokens — the whole chunk's spend, not just the clean passes.

Tokens come from the platform `usage` field (per request, or per subagent — e.g.
the `subagent_tokens:` figure on each dispatch), summed for the chunk. Never
self-reported by the model.

## Ledger

One row per committed chunk:

| date | atoms | compositions | total_tokens | tokens/atom | tokens/comp | notes |
|---|---|---|---|---|---|---|
| 2026-06-04 | 5 | 0 | 461,333 (subagent) | ~92,267 | — | Formal-coverage GAP closure, **not** from-scratch grounding — these 5 atoms were already `grounded (English)`; this chunk closed the 6 cross-check GAPs and returned them to unqualified `grounded`. Med Order: new Alloy model; Credential / Legal Hold / Provisional Commitment / Capacity Constraint: TLA+ extensions + isolated twins; Capacity Inv 14 reconsidered out-of-scope. `total_tokens` = platform `subagent_tokens` summed across the 5 Sonnet dispatches (94.0k + 84.7k + 89.5k + 73.3k + 119.8k); Opus gate/orchestration additional, not surfaced as a metered figure. Cost-per-atom here reflects only the formal-layer work, so it is far below a from-scratch atom's cost — flagged so the trend line is not misread. |
| 2026-06-04 | 1 | 0 | 106,002 (subagent) | 106,002 | — | **Provenance** — first net-new pattern of the sprint (regulated compliance atom, full lifecycle to unqualified `grounded`: Opus plan → Sonnet draft → Opus 3-pass + Final Critique gate → Alloy model + buggy twin → catalogs). `total_tokens` = the Sonnet drafter's platform `subagent_tokens` (106.0k). Opus orchestration — planning, the full gating review, authoring the Alloy model and twin, and all catalog/ROADMAP updates — is substantial here and is **not** captured in this figure (not surfaced as a metered number), so the true cost-per-atom is higher; this row is the drafter-side floor, not the all-in cost. Closer to a representative from-scratch atom cost than the 2026-06-04 GAP-closure row above. |
| 2026-06-04 | 0 | 1 | 118,434 (subagent) | — | 118,434 | **Chain of Custody (C12)** — net-new regulated composition, full lifecycle to unqualified `grounded` (Opus plan → Sonnet draft → Opus 3-pass + Final Critique gate → TLA+ binding-bijection model + buggy twin → catalogs + forthcoming-link retirement). `total_tokens` = the Sonnet drafter's platform `subagent_tokens` (118.4k); Opus orchestration (plan, gate, TLA+ model authoring, catalog/ROADMAP updates) substantial and **not** captured here — drafter-side floor, not all-in. First composition to compose the Provenance atom; the cross-domain pharma≡legal-evidence flagship. |
| 2026-06-04 | 1 | 0 | 91,863 (subagent) | 91,863 | — | **Workflow / State Machine** — net-new regulated atom, full lifecycle to unqualified `grounded` (Opus plan → Sonnet draft → Opus 3-pass + Final Critique gate → Alloy declared-transition model + buggy twin → catalogs + forthcoming-link retirement + taxonomy-question resolution). `total_tokens` = the Sonnet drafter's platform `subagent_tokens` (91.9k); Opus orchestration (plan, gate, Alloy model authoring incl. a built-in-name-collision fix, catalog/ROADMAP/CLAUDE updates) not captured — drafter-side floor. Resolves the `workflow` one-atom question; unblocks C10. |
| 2026-06-04 | 0 | 1 | 115,119 (subagent) | — | 115,119 | **Stateful Workflow Execution (C10)** — net-new regulated composition, full lifecycle to unqualified `grounded` (Opus plan → Sonnet draft → Opus 3-pass + Final Critique gate → TLA+ approval-gated-transition model + buggy twin → catalogs + forthcoming-link retirement). `total_tokens` = the Sonnet drafter's platform `subagent_tokens` (115.1k); Opus orchestration (plan, gate incl. the foundational submitter-authority fix, TLA+ model authoring, catalog/ROADMAP updates) not captured — drafter-side floor. First composition to compose the Workflow / State Machine atom; the composition where guard *evaluation* re-converges. |
| 2026-06-04 | 0 | 1 | 111,038 (subagent) | — | 111,038 | **Forensic Recovery (C3)** — net-new regulated composition (deliberately easy, low-compute pick), full lifecycle to unqualified `grounded` (Opus plan → Sonnet draft → Opus 3-pass + Final Critique gate → TLA+ binding-bijection model + buggy twin → catalogs + forthcoming-link retirement). `total_tokens` = the Sonnet drafter's platform `subagent_tokens` (111.0k); Opus orchestration (plan, gate incl. the sole-write-path bijection fix, TLA+ model authoring, catalog/ROADMAP updates) not captured — drafter-side floor. Soft Delete + Audit Trail substrate; one gate finding closed; the most template-driven composition of the session (a clean C12 mirror). |

(`tokens/atom` and `tokens/comp` are the chunk total apportioned across the two
buckets — rough is fine; this is a trend line, not an audit.)

## Baseline (the one claim worth making)

The number that sells is the leverage ratio: tokens + human-minutes per grounded
pattern **vs. the time a formal-methods engineer would take to produce and verify
the same by hand**. That baseline is an estimate — label it as one.

### Session 2026-06-04 — token cost

**Hard floor (platform-sourced).** Sum of the per-chunk `subagent_tokens` in the
ledger above: **1,003,789 drafter tokens ≈ 1.00 M** (461,333 GAP sweep + 106,002
Provenance + 118,434 C12 + 91,863 Workflow/State Machine + 115,119 C10 + 111,038
C3). This is the Sonnet drafters only; it excludes the Opus orchestration —
planning, the full three-pass + Final Critique gating of every pattern,
formal-model authoring + harness runs, and all catalog / ROADMAP edits.

**All-in (estimate).** **≈ 2.5 M tokens.** The Opus side ran roughly 1.5× the
drafter floor on top of it (≈ 2.5× all-in), given the volume of spec reading, the
gating of six large drafts, and the authoring of seven formal models (four net-new
+ the GAP twins) — plus a long accumulating main-thread context. Cross-check: the
session consumed ~76% of the operator's subscription window, consistent with an
all-in in the low millions; the session's token denominator is not published, so
the 2.5 M is an estimate, not a reading.

**Produced.** 5 net-new grounded patterns (Provenance, Chain of Custody C12,
Workflow / State Machine, Stateful Workflow Execution C10, Forensic Recovery C3) +
5 formal-coverage GAP closures (Medication Order, Credential, Legal Hold,
Provisional Commitment, Capacity Constraint), plus a triaged healthcare roadmap
backlog. 10 patterns to unqualified `grounded` total.

*(Correction note, 2026-06-11: a later coverage cross-check (2026-06-10)
re-qualified two of the ten — Chain of Custody (C12) and Forensic Recovery (C3)
now carry `grounded — formal coverage of Invariant 4 pending`. The token figures
stand and the count was accurate when written; the "unqualified" claim no longer
holds for those two until their models are extended.)*

| Per-pattern | Drafter floor (hard) | All-in (est. ≈ 2.5×) |
|---|---|---|
| Per net-new grounded pattern (÷5) | ≈ 108 k | ≈ 270 k |
| Per pattern across all 10 grounded (÷10) | ≈ 100 k | ≈ 250 k |

**Leverage claim (estimate).** Hand-producing one grounded pattern to this bar — a
defended English spec, three adversarial review passes plus a Final Critique, *and*
a machine-checked TLA+/Alloy model shipping with a rejecting twin — is plausibly a
1–3 engineer-day effort for a competent formal-methods engineer (the spec and
review alone a day; the model, twin, and harness another). At ≈ 270 k all-in tokens
per net-new pattern — well under an operator-day of human attention apiece — that is
roughly an **order-of-magnitude** reduction in human-time-to-verified-pattern. The
only hard number is the 1.00 M drafter floor; the 2.5 M all-in and the leverage
ratio are estimates, labeled as such.

That's the whole protocol. No per-pattern isolation, no realtime graph, no
stratification beyond atom-vs-composition. Keep it a trend line.
