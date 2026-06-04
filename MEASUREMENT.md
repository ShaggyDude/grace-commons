# MEASUREMENT.md — tokens per pattern

Companion to [`PRESSURE_TESTING.md`](./PRESSURE_TESTING.md): that's the quality
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

(`tokens/atom` and `tokens/comp` are the chunk total apportioned across the two
buckets — rough is fine; this is a trend line, not an audit.)

## Baseline (the one claim worth making)

The number that sells is the leverage ratio: tokens + human-minutes per grounded
pattern **vs. the time a formal-methods engineer would take to produce and verify
the same by hand**. That baseline is an estimate — label it as one.

That's the whole protocol. No per-pattern isolation, no realtime graph, no
stratification beyond atom-vs-composition. Keep it a trend line.
