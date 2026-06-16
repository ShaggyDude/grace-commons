# Prior art & positioning — earning "single source of truth" (draft, 2026-06-14)

> **Status: internal staging, not canonical.** Call-prep positioning for the 2026-06-24 Jackson call: where Grace Commons sits in the spec-as-canonical lineage, and the one claim that distinguishes it. If promoted, the positioning framing folds into [`the-spec-layer.md`](../the-spec-layer.md). Supporting evidence already in the repo: [`undo-history.tla`](../compositions/undo-history.tla) (verifiability), [`demos.md`](../demos.md) / the Beacon Mongo render (conformance), [`no-global-services.md`](./no-global-services.md) (the boundary grammar), [`outbound-contract-ports.md`](./outbound-contract-ports.md) (the boundary registry), [`falsifiability-metric.md`](./falsifiability-metric.md) (the experiment).

## The headline: everyone now declares SSOT; almost no one can back the word

There are two senses of *single source of truth*. The **bookkeeping** sense: one canonical place the intent lives, no duplication. The **epistemic** sense: a source whose own correctness can be *shown*, and that *adjudicates* every disagreement. The 2024–26 spec-driven wave reached the first and borrowed the language of the second. Grace Commons is currently the only one of these approaches that can put the word *truth* back in the noun and defend it — and the reason is specific, not rhetorical (see the three conditions below). The bandwagon validated the **premise** (spec-as-source-of-truth) in 2025; the distinguishing work is **earning** it.

"Source of truth" with no way to verify the source is just "the artifact we agreed to treat as primary." Primary is not the same as true.

**The name encodes the claim — IDD: Intent-Driven *Design*.** The 2025–26 movement calls itself Intent-Driven *Development* (intent → AI → code; GitHub Spec Kit et al.) and, confusingly, abbreviates to the same **IDD**. The *Design* is deliberate: in our approach the intent **is the designed artifact** — concepts, invariants, compositions — not the input to a codegen pipeline. (*Design* is also Jackson's word: *The Essence of Software — Why Concepts Matter for Great Design*.) So we are not a rival to the movement; we are its **fulfillment** — it *declares* the intent the single source of truth, and we supply the machinery (invariant-complete concepts, derived verification, the conformance boundary) that makes the declaration *true*. Intent-Driven Development drives the *build* from intent; Intent-Driven Design makes the intent *worth building from* — and you can run the former on top of the latter. (Naming caution: bare "IDD" will be heard as the popular *Development* sense; spell out *Design*, and let the Design-vs-Development contrast be the hook rather than a footnote.)

## What it costs to earn the word — three conditions

1. **All domain meaning lives in the spec, as complete invariant contracts** — invariants that must hold in *every* state, not a sample of behaviors. This is what lets the spec adjudicate ("is this correct?" → "does it preserve the invariants?", answerable from the spec alone). **Jackson's concept design supplies exactly this** — it is the half BDD (examples) and SDD (prose) never had.
2. **The spec's own truth is checkable without an implementation** — a derived formal model establishes the invariants are mutually consistent and preserved under every interleaving, with a buggy twin proving the check has teeth. (This session's [`undo-history.tla`](../compositions/undo-history.tla): Inv 1–4 machine-checked, three twins rejected.) Until this exists, correctness is established by *running code* — which makes the implementation the source and the spec downstream.
3. **Any implementation introduces only meaning-free truth, conformance-enforced** — the obligation/realization boundary keeps the *how* (DB tx vs. saga, Postgres vs. Mongo) below the contract, and conformance checks the observable contract, never the realization. So no un-specified *meaning* leaks into the code. (Beacon Mongo render: engine swapped, every spec invariant survived, seven-render agreement at 100%, 20/20 conformance checks, only the enforcement locus moved.) This is what makes the spec the single source of *meaning*, even though the realization holds its own meaning-free truth (which lock, which index).

BDD has enforcement (executable scenarios) but a *partial* spec — examples under-determine the system, so truth lives in the uncovered space. SDD has the slogan but neither verifiability nor a meaning/mechanism boundary — the moment an agent fills a gap the spec didn't pin (intent drift), truth lives outside the spec, so by definition it is not the single source. Grace Commons is the intersection where all three conditions hold at once.

## The lineage (and where each stops short of earned-SSOT)

| Lineage | What it does at the spec level | Where it stops short |
|---|---|---|
| **Formal methods** — Z, VDM, B / Event-B, TLA+, Alloy, seL4, SCADE | spec canonical, verified, code derived or refined; correct-by-construction (Métro signaling, AWS, avionics kernels) | the canonical artifact is a *formalism*, not readable by the domain expert; aimed at proof / codegen, not a living readable library |
| **Model-driven** — MDA / Executable UML | model canonical, code generated; platform-independent → platform-specific (the "many renders" idea, decades early) | over-promised code-gen and round-trip; under-delivered. Canonical artifact = UML, not prose |
| **BDD** — Behavior-Driven Development (Dan North, ~2006); Gherkin / Cucumber | executable acceptance **scenarios** as the shared spec; tests fail on drift (genuine conformance, years before SDD) | scenarios are *examples*, not invariants — they under-determine the system, so the truth of everything they don't sample lives in the code |
| **Concept design** — Jackson, *The Essence of Software* (2021) | concepts (one purpose; state + actions + invariants) composed by **synchronizations**; proposed a reusable **concept catalog** | it is the framework; Grace Commons is arguably its most concrete instantiation, plus the verification, boundary, and build-artifact layers |
| **AI-era SDD / Intent-Driven *Development*** (2024–26); Spec Kit, Kiro, OpenSpec, Cursor… | specs/intent as source of truth, code derived by agents — BDD's executable-spec idea, generalized and AI-driven | declares SSOT but cannot back it: NL spec/intent isn't invariant-complete or self-verifiable; no meaning/mechanism boundary, so agent gap-filling (intent drift) puts truth outside the spec |
| **Intent-Driven *Design* (this work, "IDD")** | the intent itself is the designed, verifiable artifact — Jackson's concepts + derived formal models + the conformance/obligation boundary | the **fulfillment** position: supplies exactly the invariant-completeness + verifiability + meaning/mechanism boundary the rows above lack, so the SSOT declaration is *backed*, not asserted |

## "Isn't this just …?" — the rebuttals (call-ready)

- **… MDA?** MDA generated *one* implementation and promised round-trip; Grace Commons conformance-checks *many independent* implementations and promises no round-trip — the weaker, honest claim that doesn't hit MDA's wall. (Beacon: seven renders, byte-for-byte, 20/20.)
- **… BDD?** BDD specs are examples (a sample of behaviors); Grace Commons specs are invariants (the whole state space). Examples enforce a sample; invariants adjudicate everything. (BDD got here first — executable scenarios, ~2006 — which is why it's the honest precursor, not a competitor.)
- **… SDD?** SDD *asserts* the spec is the source of truth; Grace Commons *demonstrates* it — invariants machine-checked, derivations conformance-bound. SDD validated the premise; Grace Commons earns the noun.
- **… just Jackson's concept design?** Yes — and that is the point, not a weakness. Grace Commons is the most concrete instantiation of his concept-catalog idea, *plus* spec-as-canonical-build-artifact, derived formal validators, the inbound four-destination / outbound contract-port boundary discipline, and the AI-era readability bet (verbose because AI removes the too-long-to-read barrier). Relative to Jackson it **extends**; it does not depart. The strongest thing to be able to say in his room.

## Honest concessions (so the position survives pressure)

- The 2025 SDD wave means the *stance* (spec-as-source-of-truth) is no longer differentiating. So the rigor — invariant-completeness + verifiability + the conformance/boundary discipline — is now the **whole** moat, not a bonus on top of a novel stance.
- The distinctive bet is the canonical layer in **structured natural language**, not a formalism. That carries a real risk: is structured English rigorous enough to *be* the source of truth? The derived formal model + conformance harness is the answer — and it has to keep being the answer as the library scales (precisely what `falsifiability-metric.md` instruments).
- "Small pieces loosely joined" (Weinberger) and the boundary grammar are *legibility* framing, not proof. They make the position legible; the verification layer makes it true. Keep the two jobs distinct.

## The one-liner for the room

Everyone now declares the spec a source of truth. The hard word is *truth* — a source whose correctness you can show and that settles disagreements. That costs invariant-complete concepts (Jackson), a way to verify the spec without running it (the formal layer), and a boundary that keeps implementation choices meaning-free (conformance). We pay all three. They call it Intent-Driven *Development* and drive the build from intent; we call it Intent-Driven *Design* and make the intent a verifiable artifact. Not ahead of the movement — its **fulfillment**: the rigorous form it has been reaching for.

---

## The business face: kill the ransom, not the service

The earned-SSOT argument has a one-sentence business translation, and it is the actual goal: **kill SaaS ransom — not cloud, not services.** Lock-in works because the vendor owns your logic's *meaning* — your business rules live inside their system, so leaving means rewriting, and the price climbs because they know it. Grace Commons inverts ownership: **you own the meaning (the canonical spec / SSOT); the service is a realization *below the contract*, conformance-checked and swappable.** Rent the mechanism, own the meaning, swap the mechanism without losing the meaning. The Beacon Mongo render is that swap *demonstrated* — same spec, engine swapped, every invariant survived — not promised.

This is downstream of the earned-SSOT differentiator, not a separate claim: you can promise "swap your realization without losing your logic" *only* because the spec is verifiable and conformance-bound. SDD / Intent-Driven Development can't offer anti-lock-in — their "spec" isn't checkable, so a faithful swap can't be proven. The thing that makes the architecture different is the thing that kills the ransom.

The client's choice, concretely (the Saga / Temporal case): take the spec and build the durable execution in-house, *or* tie into Temporal — and if Temporal's pricing turns hostile, swap the realization, conformance guaranteeing faithfulness. The service becomes a utility, not a captor. Not anti-Temporal; anti-*being-held-by*-Temporal.

**The consequence, and the goal:** with lock-in gone, a vendor keeps your business by being *good*, not by holding your logic. **Future SaaS has to be good or die.** Stance, for the record — not anti-cloud, not anti-service: anti-ransom.

*Pitch line:* "We don't kill SaaS by avoiding services — we kill the ransom. You own the spec; the service is a swappable realization you can prove conformant. A vendor keeps your business by being good, not by holding your logic."

---

## Lineage sources

- Behavior-driven development (the precursor, ~2006): Dan North, "Introducing BDD"; Gherkin / Cucumber (Aslak Hellesøy)
- Spec-driven development (2025 practice): [Thoughtworks](https://www.thoughtworks.com/en-us/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices), [InfoQ — When Architecture Becomes Executable](https://www.infoq.com/articles/spec-driven-development/)
- Concept design: Daniel Jackson, *The Essence of Software* (Princeton, 2021) — [overview](https://books.google.com/books/about/The_Essence_of_Software.html?id=ehsuEAAAQBAJ); [Concept design in three easy steps](https://newsletter.squishy.computer/p/concept-design-in-three-easy-steps); legible-software follow-on (2025): [What You See Is What It Does](https://arxiv.org/html/2508.14511v2)
- Model-driven: [Executable UML (Wikipedia)](https://en.wikipedia.org/wiki/Executable_UML); Mellor & Balcer, *Executable UML: A Foundation for Model-Driven Architecture* (2002)
- Loose coupling lineage: David Weinberger, *Small Pieces Loosely Joined* (2002)
- Formal-methods touchstones (training-grounded, not searched this pass): B-Method / Event-B (Abrial), TLA+ (Lamport), Alloy (Jackson), seL4, SCADE
