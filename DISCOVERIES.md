# Discoveries

Accidental findings during the build. Raw, dated, unpolished. Grant proposals and posts pull from here later.

---

## 2026-05-19 — Readable-first and formally-verifiable are the same discipline

While scoping a TLA+ model of the Attributed Permissions Admin composition, we noticed that the English spec had already done most of the work TLA+ requires: named actions, preconditions, postconditions, named and numbered invariants.

The usual assumption is that human-readable specs and formal verification are two separate concerns — one for people, one for tools. The Grace Commons constraint (English is canonical, everything else is derived) accidentally collapsed that distinction.

The English spec isn't documentation of the formal model. It *is* the formal model, expressed at the level humans can read and argue about. The formal tool (Alloy, TLA+) is a projection target — the same relationship code has to the spec.

A corollary: the invariants coming back from TLC land in a context the team already understands, because the invariants were named in English before the model was written. No translation required between "what the checker found" and "what we meant."

The round-trip (spec → formal model → findings → back into spec) works cleanly because readable-first forced the abstraction that formal verification needs anyway. We didn't plan this. It emerged from the constraint.

**Implication for the methodology:** Writing the English spec is not a prerequisite to formal verification. It *is* formal verification — at the layer where humans operate. The checker is just a second reader that never gets tired and explores every branch.
