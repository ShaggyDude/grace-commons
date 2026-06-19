# Naming — Direction

**Status:** Direction — drafted, not yet ground; stays in `working-ideas/` and does not yet bind (this tier is excluded from the published site). Promotes to a canonical home — a root `naming.md`, or folded into [`spec-format.md`](../spec-format.md) — once the open items close: the `formal_description` field name needs reconciling with the actual spec front-matter, and the five composition-name corrections from the scan are not yet applied (each a MAJOR bump per [`versioning.md`](./versioning.md)). Until then, advisory only.
**Covers:** how every atom and composition — the lattice terms — is named, what the name is responsible for, and what it must never carry.
**Scope.** The lint in this direction governs **terms** — the lattice positions (atoms and compositions) whose name classifies a *class* of behavior. It does **not** govern **proper names**: singular referents like the library (*Grace Commons*), the project, or a specific deployment, which denote one thing, not a class. Stated explicitly because the lint, left unscoped, would wrongly bind them — it would try to lint *Grace Commons* itself. A proper name classifies nothing, so word-function and the contraction-as-overload test do not apply; only taste and stability do — no glyphs, nothing unsayable, which is why *Grace φ Commons* still fails, on taste rather than on the lint. The same boundary decides category: an assembly with no clean classifying name (§1 — a head, optionally narrowed) is almost certainly a *deployment* — a proper-named referent — not a composition, and sits outside the lint.

## Principles

1. **One name.** Each term has exactly one name, and it is for speech. Precision lives in the description; identity lives in the ID; the name carries neither. A scientific/common split — a precise name plus a separate sayable one — concedes the precise name is unusable in conversation. Biology had to concede that: *Panthera leo* was never built to be spoken. Grace has no such constraint and makes no such concession.
2. **The name is a render; the ID is the referent.** Stability is the ID's job (§2). A precise name commits to a term's *current* defining mechanism, which makes it *less* durable under change, not more — and nothing should depend on it being permanent. (Even binomials get reclassified: *Felis leo* became *Panthera leo*.) The name is free to change; the ID never does.
3. **Every word narrows the class; no word explains.** This is the gate — word count is only its proxy. A word that restates what another word already presupposes carries no classifying weight; cut it, and let the description hold it. Three meaningful words is the ceiling, because past three, words start explaining instead of classifying.
4. **Invent as little as possible.** Do not coin a new word; do not settle for a generic phrase. A healthy name is a *rare pairing of ordinary words* — each word common enough to say and to search as a phrase, the pairing distinctive enough to be unique. *Soft Delete*, *Legal Hold*, *Selective Disclosure*, *Multi-Party Approval*: plain words, rare together. (Same governing principle as Versioning.)

## 1. Shape

**A head, optionally narrowed.** One head word names the act or the thing; up to two words in front of it each cut the class *further*, never restate it. Never more than three meaningful words.

The head carries the concept — *Delete, Hold, Log, Approval, Disclosure, Identity, Suspension, Retention, Authorization* — and every word before it must narrow: *Soft* Delete, *Legal* Hold, *Multi-Party* Approval, *Selective* Disclosure, *Event* Log, *Session* Authorization. Whether the narrowing word reads as a subject (*Event*, *Actor*) or a qualifier (*Soft*, *Legal*, *Multi-Party*) does not matter, and neither is mandatory — *Soft Delete* and *Legal Hold* carry no subject at all. What matters is that every non-head word classifies. The target shape is nearly a species name: short enough to say, precise enough to classify, no contraction pressure.

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

- at most three meaningful words (the proxy);
- no word that narrows nothing (the word-function test, the real gate);
- no name equal to an existing atom or composition name — the *Permissions* trap: the atom owns the bare noun, so its composition cannot take it;
- flag any name found contracted to initials anywhere in the corpus — **except initialisms on the cited-standard whitelist below**, which are external proper nouns, not contracted Grace names.

**Cited-standard whitelist.** An initialism is exempt from the contraction flag only when it is the proper name of an external standard, statute, or regulatory body whose expansion is bureaucratic and rarely spoken — *HIPAA, GDPR, SOX, PCI DSS, CFR, NIST, FHIR, FRCP, TCPA, FDA, AML*. Same mechanism as the linter's existing standards-proper-noun scrub. The test bites on ordinary sayable phrases: **KYC is not on the whitelist** — "Know Your Customer" is three plain words, so KYC is a contraction to be spoken in full or the pattern renamed (correction 2, §4), not an exempt proper noun; *DSAR* ("Data Subject Access Request") fails identically. A whitelisted initialism may be *cited inside* a spec; it may never *be, or appear in,* a pattern name.

---

*One name, for speech — precision in the description, identity in the ID. If it contracts to initials, it was carrying too much.*
