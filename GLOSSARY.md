# GLOSSARY — load-bearing vocabulary

Strict definitions for the handful of words where English ambiguity actually
leaks into specs. **Keep this small** (target ~20 terms). It is a precision tool,
not a controlled grammar — past ~30 terms you are turning English into a formal
language with keywords and killing the readable-SSOT thesis. When a spec uses one
of these words in a load-bearing way, it means exactly what is below; if it needs
a different sense, it must say so locally.

## Emptiness / presence

- **absent** — the field/value was never supplied; the key does not exist.
- **empty** — the value exists and is the zero-length form (`""`, `[]`, `{}`).
- **null** — an explicit "no value" marker distinct from absent and empty. A spec
  must not use "null" to mean absent or empty without saying which.
- **undefined** — outside the specified domain; behavior is not specified here.
  An `undefined` case is a finding unless named as explicit out-of-scope.
- **invalid** — present and well-typed but failing a stated precondition; produces
  a named rejection, not undefined behavior.

## Time

- **immediately** — within the same atomic action, before it returns. Not "soon."
- **eventually** — guaranteed to occur in finite time, with no stated bound.
- **within X** — at or before X has elapsed, measured by the named monotonic clock.
- **now** — the injected clock value at action time (never read inside the
  transition — see EXECUTION_CONTRACT.md, Logic Confinement).
- **after / before / most-recent** — by *insertion order* unless a spec explicitly
  says wall-clock order (clocks may be non-monotonic; insertion order is authoritative).

## Identity / equality

- **same** — identical opaque identity (same id), not equal content.
- **equivalent** — equal under a stated normalization, not necessarily the same id.
- **matches** — satisfies a stated predicate; the predicate must be named.
- **unique** — no two distinct entities share the value, across the stated scope
  (name the scope: per-instance, per-store, system-wide, for-all-time).

## Modality

- **must** — a hard requirement; violation is a defect.
- **may** — optional; both doing and not doing it are conformant.
- **should** — recommended; a deviation must be justified. (Avoid in invariants —
  an invariant is `must` or it is not an invariant.)

---

*Status: stub, 2026-06-04.* Seeded from the recurring ambiguity classes (emptiness,
time, identity, modality). Add a term only when a real spec ambiguity forced it —
not speculatively.
