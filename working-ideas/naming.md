# Naming — Direction

**Status:** Direction — drafted, not yet ground; stays in `working-ideas/` and does not yet bind (this tier is excluded from the published site). Promotes to a canonical home — a root `naming.md`, or folded into [`spec-format.md`](../spec-format.md) — once the open items close: the `formal_description` field name needs reconciling with the actual spec front-matter, and the five composition-name corrections from the scan are not yet applied (each a MAJOR bump per [`versioning.md`](./versioning.md)). Until then, advisory only.
**Covers:** how every atom and composition — the lattice terms — is named, what the name is responsible for, and what it must never carry.
**Scope.** The lint in this direction governs **terms** — the lattice positions (atoms and compositions) whose name classifies a *class* of behavior. It does **not** govern **proper names**: singular referents like the library (*Grace Commons*), the project, or a specific deployment, which denote one thing, not a class. Stated explicitly because the lint, left unscoped, would wrongly bind them — it would try to lint *Grace Commons* itself. A proper name classifies nothing, so word-function and the contraction-as-overload test do not apply; only taste and stability do — no glyphs, nothing unsayable, which is why *Grace φ Commons* still fails, on taste rather than on the lint. The same boundary decides category: an assembly with no clean classifying name (§1 — a behavior core, optionally narrowed) is almost certainly a *deployment* — a proper-named referent — not a composition, and sits outside the lint.

## Principles

1. **One name.** Each term has exactly one name, and it is for speech. Precision lives in the description; identity lives in the ID; the name carries neither. A scientific/common split — a precise name plus a separate sayable one — concedes the precise name is unusable in conversation. Biology had to concede that: *Panthera leo* was never built to be spoken. Grace has no such constraint and makes no such concession.
2. **The name is a render; the ID is the referent.** Stability is the ID's job (§2). A precise name commits to a term's *current* defining mechanism, which makes it *less* durable under change, not more — and nothing should depend on it being permanent. (Even binomials get reclassified: *Felis leo* became *Panthera leo*.) The name is free to change; the ID never does.
3. **Every word narrows the class; no word explains.** This is the gate — word count is only its proxy. A word that restates what another word already presupposes carries no classifying weight; cut it, and let the description hold it. Three classifying *roles* is the ceiling — behavior, subject, modifier (§1); past them, words start explaining instead of classifying. Word count tracks roles only loosely: a tight noun-phrase subject (*a Person's Data Rights*) runs long without adding a role.
4. **Invent as little as possible.** Do not coin a new word; do not settle for a generic phrase. A healthy name is a *rare pairing of ordinary words* — each word common enough to say and to search as a phrase, the pairing distinctive enough to be unique. *Soft Delete*, *Legal Hold*, *Selective Disclosure*, *Multi-Party Approval*: plain words, rare together. (Same governing principle as Versioning.)

## 1. Shape

**A behavior core, a recoverable subject, an optional modifier.** A term names a *reconstructable referent* and nothing else, in at most three roles — only one of which is always written.

**Behavior core (the head) — always present.** The head names what the term *does*, in one of two licensed shapes, each gated by the same reconstruction test:

- an **act** — name it by its behavior *and the state-transition it drives* (*Delete, Approve, Onboard, Reserve, Disclose*); or
- an **artifact** — name it by its concrete structure *and the invariant that holds over it* (*Log* — append-only order; *Window* — bounded interval; *Ledger, Chain of Custody*).

The test is **reconstruction, not grammar**: you must be able to state the transition the act drives, or the invariant the artifact holds. A head that reconstructs to neither — a category or process-shape noun (*Lifecycle, Management, Orchestration, Handling*) — is banned: it names a *kind of work*, not a work, and classifies where a name should denote. Morphology is not the criterion — *Onboarding* and *Management* are both deverbal; only the first reconstructs to a bounded act.

**Subject — present, or recoverable.** A behavior always has a state-bearing subject; there is no concept without one. The *written* subject may be dropped only when **recoverable, never when merely guessable**, and recoverability is namespace-relative:

- a composition **title** keeps its subject — a catalog has no namespace to refund it (*Customer Onboarding*, not bare *Onboarding*);
- an **in-spec action** may elide it, because the spec's namespace carries it (`initiate` inside Customer Onboarding recovers "a case"; `verify` recovers the compound person-or-entity subject the verb and body already fix).

A head whose behavior fixes a *universal* subject carries it implicitly: *Soft Delete* and *Legal Hold* name no separate subject because the act recovers it — you delete *a record*, you hold *a record*; the subject is elided as recoverable, not absent.

**Modifier — optional, load-bearing when present.** Spend a modifier only when disambiguation earns it, and make it carry *the thing that distinguishes this concept from its siblings* — the load-bearing emergent property, never a feature: *Multi-Party* Approval, Propagate Consent Revocation *Downstream*, Reserve *from Pool*. A decorative modifier is a finding (the word-function test, §3).

**Three roles, not three words — bounded by contraction pressure.** The cap is roles, not tokens: a subject may be a tight noun phrase, which is why *Resolve a Person's Data Rights* is well-formed at four words and three roles. The operative bound is the **contraction test (§3)** applied to roles — a name carries too many roles when it generates *pressure to contract to initials in use*, not when it merely *could* be initialised. Every multi-word name can be initialised; *Multi-Party Approval* is two roles and fine. *Customer Due Diligence Verification Gate* fails because no one says it in full and reaches for CDDVG — the symptom is observed in usage (sharpest on acronym collision), never read off the string. The target is nearly a species name — short enough to say, precise enough to classify, no contraction pressure.

**Compositions lean behavior-first.** An atom often rests on an artifact head (*Identity, Window, Ledger*); a composition is usually best named by the *act it performs across its constituents*, because that act is exactly what no single constituent supplies — and naming it forces the term to denote behavior instead of dissolving into a category noun. *Resolve a Person's Data Rights, Reserve from Pool, Propagate Consent Revocation Downstream* lead with the act; *Customer Onboarding* with a deverbal act-head. The **artifact-led** shape (*Immutable Transaction Ledger, Chain of Custody, Audit Trail*) is co-equal, not an exception — legitimate wherever the durable structure, not the act, is the concept — but it passes the same reconstruction test: name the invariant the structure holds.

**Shedding under pressure.** When a name fights you, shed from the right: drop the **modifier** first (optional), then elide the **subject** token (only if the namespace refunds it), and **never shed the behavior**. The behavior's *token* may migrate — into a deverbal head, or an artifact head whose invariant is recoverable — but the behavior *referent* is the one thing a name can never lose. This is why bare `initiate` is valid and bare *Onboarding* as a title is not: tokens shed leftward only as far as the namespace will refund them; the behavior is never on the table.

**Passing the shape is a necessary screen, not a sufficient one** (the mechanical lint is §6). A well-formed name has cheaply cleared a shadow of Pass 2 — reconstructable head ⇒ a real act or artifact; present-or-recoverable subject ⇒ a genuine state-bearing referent; load-bearing modifier ⇒ the distinguishing invariant surfaced. But the implication runs hard in **one direction only**: *fail the shape and the concept is almost certainly unsound* — the workhorse. *Pass it and the signal is necessary, not sufficient*: *Reserve from Pool* is well-formed yet says nothing about whether pool-coherence is genuinely emergent or quietly owned by Capacity Constraint Enforcement — the very question Pass 2 exists to answer. The shape catches the unsound cheaply; it is never a check you can pass your way into soundness.

## 2. The record

Three roles, three fields, no overlap:

```yaml
id: C019                       # stable referent — never reused, survives every rename
name: Attributed Permissions   # one human name, for speech
formal_description: >          # canonical precision lives here, in full
  Administration of permissions through attributed authority — every grant
  and revocation bound atomically to a verifiable attestation under the
  issuing actor's credential.
```

The name stays human, the description carries the precision, the ID carries identity. No Latin layer; no common layer.

## 3. The tests

- **Conversational.** A healthy name drops into a sentence unaltered: *"This composition uses Selective Disclosure." "We already have Multi-Party Approval." "That's really a Soft Delete problem."*
- **Contraction — the failure signal.** If a name contracts to initials in use, and someone has to *look the initials up*, the name is carrying too much information. The acronym is the symptom; overloading is the disease. The sharpest tell is collision: when the initials land on an unrelated household acronym first — *KYC* reads as *KFC* long before it reads as "Know Your Customer" — the letters point at nothing on their own, and the reader is forced to look them up. This is observed in usage, not read off the string: a contraction appearing anywhere in the corpus, the issues, or discussion is the evidence.
- **Word-function.** Strike each word in turn. If the class does not widen, that word was explaining, not narrowing — remove it from the name; the description already carries it.

## 4. Existing names, and the corrections from the scan

Most existing names pass all three: *Soft Delete*, *Legal Hold*, *Event Log*, *Actor Identity*, *Multi-Party Approval*, *Selective Disclosure*, *Actor Suspension*, *Session Authorization* all speak plainly and resist contraction.

The scan surfaced **five composition names** that fail — each a MAJOR bump with a migration note (§5), none yet applied. The candidates below are proposals, not yet ground.

1. **Attributed Permissions Admin → Attributed Permissions** — the name that triggered this direction. "Admin" fails the word-function test: you do not attribute a *read*, so the attributed acts are already the administrative ones; "Admin" restates what "Attributed" presupposes and narrows nothing. Dropping it keeps the one word doing the classifying — *Attributed*, the attestation binding — and kills the contraction that surfaced the problem.
2. **KYC (Know Your Customer) / Customer Onboarding with Ongoing Monitoring → *(candidate)* Customer Onboarding** — fails almost every test at once: an initialism that is *not* on the cited-standard whitelist (§6 — "Know Your Customer" is three plain words), a parenthetical gloss, a slash (two names where Principle 1 demands one), and a "with…" tail past three words. *Ongoing Monitoring* is a distinct concept that belongs to a composed pattern, not the name.
3. **Consent & Preference Management with Revocation Propagation → *(candidate)* Consent & Preference Management** — five meaningful words joined by "&" and "with". *Revocation Propagation* is the emergent behavior the composition delivers, not part of its name; let the description carry it.
4. **Immutable Transaction Ledger with Selective Disclosure → *(candidate)* Immutable Transaction Ledger** — "with Selective Disclosure" names a composed atom inside the name. Drop it; a constituent is not a name component.
5. **Saga / Compensable Workflow → *(candidate)* Compensable Workflow** — a slash is two names (Principle 1 again), and "Saga" is jargon that must be looked up. Keep the one sayable head.

One atom carries the same one-name defect and belongs on the atom-side scan: **Workflow / State Machine** (slash, two names). *Preference-Aware Notification Fanout* is a borderline sixth — four meaningful words extending the *Notification Fanout* composition — and is a watch item, not yet a correction.

## 5. Renaming

A name change is a shift in a term's defining character surfacing, and is handled as a MAJOR bump with a migration note, like any breaking change (Versioning). The ID does not change; dependents repoint by ID, never by name. Renaming is audited and versioned — never a silent hand-edit.

## 6. Lint

Enforced at the codebase level:

- at most three classifying roles — behavior, subject, modifier (§1) — with word count only the proxy (a tight noun-phrase subject may run longer without adding a role, so the bound is contraction pressure, not token count);
- no word that narrows nothing (the word-function test, the real gate);
- no name equal to an existing atom or composition name — the *Permissions* trap: the atom owns the bare noun, so its composition cannot take it;
- flag any name found contracted to initials anywhere in the corpus — **except initialisms on the cited-standard whitelist below**, which are external proper nouns, not contracted Grace names.

**Cited-standard whitelist.** An initialism is exempt from the contraction flag only when it is the proper name of an external standard, statute, or regulatory body whose expansion is bureaucratic and rarely spoken — *HIPAA, GDPR, SOX, PCI DSS, CFR, NIST, FHIR, FRCP, TCPA, FDA, AML*. Same mechanism as the linter's existing standards-proper-noun scrub. The test bites on ordinary sayable phrases: **KYC is not on the whitelist** — "Know Your Customer" is three plain words, so KYC is a contraction to be spoken in full or the pattern renamed (correction 2, §4), not an exempt proper noun; *DSAR* ("Data Subject Access Request") fails identically. A whitelisted initialism may be *cited inside* a spec; it may never *be, or appear in,* a pattern name.

---

*One name, for speech — precision in the description, identity in the ID. If it contracts to initials, it was carrying too much.*
