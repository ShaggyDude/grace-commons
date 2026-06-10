# Coverage matrix — `capability`

- **Pattern:** `atoms/capability.md`
- **Model:** `capability.als` (Alloy structural) + buggy twin `capability-buggy.als`
- **Reviewer / date:** Claude Fable 5 (council-run scheduled rescan) — 2026-06-10. First matrix for this pattern; emitted by the rescan's formal-layer portion (the A4 proof batch).
- **Formal-layer vote load-bearing claims:** the structural invariant set verified at Final Critique 4 — counter/status consistency (Invariants 2, 4 structural half), revocation attribution (Invariant 9), terminal-mode distinguishability (Invariant 6), token uniqueness within a store snapshot (Invariant 12), and the two emergent properties (zero-counter ⇒ Redeemed; Revoked ⇒ remaining > 0).

## Step 0 — model-present bar finding (closed in-round)

The rescan surfaced a **model-present bar violation** before any council pass ran: `capability.als` shipped **no committed buggy twin** — the only Alloy model in the corpus without one. The 2026-06-03 vacuity fix had verified the checks' teeth via an ad-hoc injected `cap_scope` mutation that was never committed, which is the "ran once" class criterion 2 of the bar exists to forbid. Closed 2026-06-10: `capability-buggy.als` authored — the injected defect drops the exhaustion transition (`redeem_success` decrements but always leaves `status = Allocated`, the "implementation forgot the terminal write" hazard Invariant 4 forbids), with the two guarding facts (`CounterStatusConsistency`'s Allocated arm; `ZeroCounterImpliesRedeemed`) weakened to match, so the hazard is constructible rather than vacuously blocked.

## Step 1 — harness run (must pass)

- Correct model: `node check.mjs ../../atoms/capability.als` → `PASS` ✓ (all 22 `check`s UNSAT, all 10 `run`s satisfiable)
- Buggy twin: `node check.mjs ../../atoms/capability-buggy.als --buggy` → `PASS` (rejected) ✓ — counterexamples on exactly the three expected checks: `A_AllocatedHasRemaining`, `A_ZeroCounterMeansRedeemed`, `A_ExhaustionSetsRedeemed`; the twin's `ShowBuggyExhaustion` run demonstrates the violating instance is real, not an artifact.

## Step 2 — coverage matrix

| Spec invariant (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Allocation provenance immutability | no | covered (transition layer) | `A_RedeemPreservesImmutable`, `A_RevokePreservesImmutable`, `A_ExpirePreservesImmutable` assert token/allocator/scope/maxRed preservation across every transition. |
| Invariant 2 — Redemption counter monotonic | yes | **covered** | `A_RedeemDecrementsCounterByOne`, `A_CounterNotExceedsMax`, `A_CounterNonNegative`, `A_CounterNeverNegativeAfterRedeem`; `fact CounterBounds`. |
| Invariant 3 — Bearer redemption | no | by-construction | No redeemer field exists in the `CapabilityRecord` sig; `A_NoRedeemerField` records the design choice (a schema-level tautology, flagged as such in the model). A regression adding the field is not catchable by a check — recorded as an assumption. |
| Invariant 4 — Exhaustion atomicity | yes | **covered** (structural half) | `A_ExhaustionSetsRedeemed` + `A_PartialRedeemStaysAllocated` + `fact CounterStatusConsistency`; the dedicated twin breaks exactly this. The *interleaving* half (two concurrent redeems at `remaining = 1`) is out-of-scope for a static Alloy model — named below. |
| Invariant 5 — Audit asymmetry | no | by-construction | Same schema fact as Invariant 3: allocator is a `one` field, redeemer is structurally absent. Assumption, not asserted property. |
| Invariant 6 — Three structurally distinct terminal modes | yes | **covered** | `A_TerminalModesDistinguishable` + `A_RedeemedIsExhausted` + `A_RevokedHasAttribution` / `A_NonRevokedNoAttribution` jointly pin the distinguishing field patterns. |
| Invariant 7 — Terminal state absorbing | no | covered | `A_TerminalAbsorbing` — no transition predicate fires from a non-Allocated pre-state. |
| Invariant 8 — Scope immutability | no | covered | The immutability asserts above include `cap_scope` preservation on every transition. |
| Invariant 9 — Revocation attribution completeness | yes | **covered** | `A_RevokedHasAttribution` / `A_NonRevokedNoAttribution` + `fact RevocationAttribution`; `A_RevokeSetAttribution` on the transition. |
| Invariant 10 — Finite lifetime (`expires_at` never null) | no | out-of-scope (named reason) | Time is not first-class in this snapshot model (noted in the model header); the no-early/no-late expiry semantics are Decision-points clock rules, records-alone checkable. |
| Invariant 11 — Capability durability | no | out-of-scope (named reason) | Storage durability is not a structural-configuration property; host obligation. |
| Invariant 12 — Token uniqueness | yes | **covered** | `A_TokenUniqueness` over store snapshots + `fact StoreTokenUniqueness` (store-scoped per the 2026-06-03 vacuity fix). Lifetime-uniqueness beyond co-existing records is out-of-scope for a snapshot model; the spec's 2026-06-10 revision scopes the claim to retained records (Edge cases — External purge and retention). |
| Emergent — zero counter ⇒ Redeemed | yes | **covered** | `A_ZeroCounterMeansRedeemed` + `fact ZeroCounterImpliesRedeemed`; twin breaks it. |
| Emergent — Revoked ⇒ remaining > 0 | yes | **covered** | `A_RevokedHasPositiveRemaining` on the revoke transition. |

Out-of-scope residual, named: the **concurrent-redeem interleaving** (Invariant 4's two-callers-at-`remaining = 1` race) is a TLC-class question a static Alloy model cannot ask. It is exercised operationally where it is load-bearing at the composition layer — `capability-backed-sharing.tla` (C15) models the redemption-decrement inside its binding-bijection transaction, and `privilegedAccessProvisioning.tla` exercises redeem under interleaving. Not a GAP: deliberate tool-split, reason recorded.

## Step 3 — bound saturation (scope bump)

- All `check`s re-run at scope `for 7` (from `for 6`; transition checks at `for 5 but 4 Int` similarly exercised at the bumped universe): all hold, all runs satisfiable ✓. Alloy's bounded-exhaustive search at the larger universe confirms the `for 6` scope was not hiding small-scope-only truths.

## Outcome

- GAP rows: none. The model-present bar violation (missing twin) was the rescan's finding; closed in-round with `capability-buggy.als`.
- by-construction flags on load-bearing invariants: none (Invariants 3 and 5 are by-construction but voted structural-design properties, not temporal claims; recorded as assumptions above).
- Result: **all load-bearing formal-layer claims covered; twin discipline now satisfied.** — First coverage cross-check for this pattern, 2026-06-10 (council-run rescan).
