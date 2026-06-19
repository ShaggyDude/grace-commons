# Assurance Direction

**Status:** Direction — enforced at the codebase level.
**Covers:** the assurance level every invariant carries, how the top level (mechanized proof) relates to versioning, and how the audit keeps it honest.

## Principles

1. **Assurance is a level, not a checkbox.** Every invariant sits at one named level on a fixed ladder (§1). "Verified" alone is not a status — the level is.
2. **The top level is value-gated, not cost-gated.** Mechanized proof is reserved for invariants where bounded ≠ general: the genuinely inductive subset (§6). Cheap proof removes the *cost* reason to abstain; it does not create a *value* reason to proceed. Proving a non-inductive invariant re-derives what bounded checking already established completely, and earns nothing.
3. **The level is derived; the change is canonical.** An invariant's assurance level is an output of the audit, recomputed on every version bump (§2, §4) — never a label applied by hand. (Mirrors Versioning, Principle 2.)
4. **Invent as little as possible.** This document adds no versioning mechanism. The proof level rides the existing pre-release/grounding axis; invalidation rides the existing MAJOR/MINOR/PATCH classifier.

## 1. The assurance ladder

Every invariant carries exactly one level.

| Level | Meaning | How reached |
|---|---|---|
| **L0** | Stated | Written in the canonical structured-English layer. |
| **L1** | Bounded-checked | The TLA+/Alloy model holds at the configured bound **and** the buggy twin fails as expected. The launch grade — most of the corpus is here. |
| **L2** | Proved | Mechanically proved for all N (Isabelle/HOL), modulo the named assumptions carried with the proof (§5). |

L2 is a **grounding-maturity** state. It is carried on the Version field's pre-release axis — the same axis grounding maturity already lives on in Versioning — **not** in the MAJOR.MINOR.PATCH numbers. The numbers say what the behavior is; the grounding state says how far that behavior has been verified. The two are orthogonal: an invariant can be L1 at a fully grounded `1.2.0`, or L2 at the same number.

## 2. Invalidation: assurance follows the bump

A proof is sound only against the behavior it was proved over. When a spec bumps, the existing classifier decides what happens to its L2 invariants:

| Bump | Effect on L2 |
|---|---|
| **PATCH** | **Auto-survives.** Versioning already defines PATCH as no behavioral change, machine-checkable by formal-layer diff. If the formal layer is unchanged, the proof applies verbatim. No re-run. |
| **MINOR / MAJOR** | **Re-run required.** The proof is re-checked against the changed spec. Passes → stays L2. Fails → drops to L1 until re-cleared. |

No proof's L2 status persists across a MINOR/MAJOR bump on faith. Until the re-run passes, the invariant is L1. A `.thy` whose source has bumped above PATCH without a passing re-run is not L2 — **false assurance is worse than none.**

## 3. The proof decides the boundary it depends on

MINOR means *additive, conservative*. "Conservative" — that the change weakens no precondition and admits no behavior a proved invariant relied on excluding — is precisely a proof-preservation question, and one SemVer's prose cannot decide. The re-run decides it:

- Re-run **passes** → the change was genuinely conservative → legitimately MINOR.
- Re-run **fails** → the change was not conservative → it is **MAJOR**, mis-classified, and the proof failure is the evidence.

So on proved invariants, the proof is the decision procedure for the MAJOR/MINOR boundary — the one boundary the classifier is otherwise weakest on. Verification does not merely depend on versioning here; it adjudicates it.

## 4. Blast-radius is the re-run worklist

The audit already enumerates blast-radius dependents on every bump (Versioning §5). That enumeration **is** the set of proofs to re-run:

- An **atom** bump enumerates its dependent compositions; their proofs re-run even though their version numbers do not propagate. Proof-dependency follows the composition graph, not the version graph.
- A **substrate** bump (e.g. Tamper Evidence under Audit Trail) enumerates every composition on that substrate; one bump fans the re-run across all of them — and, conversely, one proof of the substrate raises their assurance the same way.

The drift guard is therefore not new machinery. It is the audit's existing dependent enumeration, extended to emit proof re-runs alongside changelog entries and version bumps.

## 5. Scope of L2, and the floor it rests on

Stated honestly, so the claim survives an adversarial reader:

- **What L2 buys.** On the inductive subset it closes the deep, unbounded tail that bounded checking structurally cannot reach — the region a motivated adversary probes — and supplies the categorical *tested → proved* standard a regulator distinguishes. On everything else it buys ~nothing, which is why Principle 2 holds.
- **What L2 never means.** Zero-trust. Every proof is **proved modulo named assumptions** — cryptographic hardness (e.g. collision-resistance of the chosen hash) and deployment obligations (e.g. integrity of a committed/anchored root, key custody). These assumptions are part of the L2 record, not omitted from it. Broad proof coverage *concentrates* residual risk into this small, named set; it does not eliminate it.

The tracked metric is the percent of the **load-bearing surface** — the set of invariants other patterns depend on, each weighted by how many compositions inherit it (**fanout-weighted**) — that sits at each level. This is the defensibility axis, distinct from correctness (which spec review and bounded checking carry); it parallels the falsifiability axis defined in [`falsifiability-metric.md`](./falsifiability-metric.md). Proving the substrate moves it far more than one increment does.

## 6. Selection and sequencing

- **In scope for L2:** the genuinely inductive invariants — chain integrity, allocation coherence over unbounded sequences, ordered-history reconstruction, completeness over unbounded sets. After fanout, this is a small set of distinct substrate/accumulation proofs, not a per-invariant program.
- **Out of scope for L2:** atomicity, gating, namespace-bijection, per-record, and snapshot-completeness invariants. For these, bounded checking is *complete up to a cutoff* — each has a small-model bound beyond which a larger instance exhibits no new behavior, so checking at the bound decides the property for all N. That cutoff argument is owed per class, and is the one thing this exclusion rests on: where it cannot be made, the invariant is not actually out of scope. Given the cutoff, an L2 proof adds drift surface for no certainty gain and signals mis-targeted effort.
- **Order by** fanout × inductiveness × compliance-load.

### First steps

1. **Classification pass.** Tag every invariant inductive / non-inductive. Converts the metric from estimate to measured and produces the L2 worklist. Precondition for everything else.
2. **First proof: `verifyChain`** (Tamper Evidence / Audit Trail substrate) — highest fanout in the corpus; one proof raises assurance across every composition on the substrate.
3. **Wire the audit** to emit proof re-runs from blast-radius (§4) and to refuse L2 on any invariant whose source has bumped above PATCH without a passing re-run.

---

*Bounded-strong everywhere; proof-grade where it is promoted. The level is derived, the assumptions are named, and the audit keeps both current.*
