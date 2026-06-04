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

(`tokens/atom` and `tokens/comp` are the chunk total apportioned across the two
buckets — rough is fine; this is a trend line, not an audit.)

## Baseline (the one claim worth making)

The number that sells is the leverage ratio: tokens + human-minutes per grounded
pattern **vs. the time a formal-methods engineer would take to produce and verify
the same by hand**. That baseline is an estimate — label it as one.

That's the whole protocol. No per-pattern isolation, no realtime graph, no
stratification beyond atom-vs-composition. Keep it a trend line.
