# Coverage matrix — `capability`

- **Pattern:** `atoms/capability.md`
- **Model:** `capability.als` (Alloy structural) + buggy twin `capability-buggy.als`
- **Reviewer / date:** regenerated 2026-06-23 against the post-refactor model (execution/render-time refactor, 2026-06-21; `now`/`id_t` reverted to pipeline-injected, 2026-06-23). Supersedes the 2026-06-10 matrix, which described the pre-refactor model (stored `Expired`, an `expire` transition, four reachable statuses, 22 checks, and the now-deleted `A_ExpirePreservesImmutable` / `A_TerminalAbsorbing` / `A_NoRedeemerField` constructs).
- **Formal-layer vote load-bearing claims:** the structural invariant set — counter/status consistency (Invariants 2, 4 structural half), revocation attribution (Invariant 9), terminal-mode distinguishability (Invariant 6), token uniqueness within a store snapshot (Invariant 12), the derived-expiry coherence and lapsed-cannot-be-redeemed guarantees (Invariant 13), and the two emergent properties (zero-counter ⇒ Redeemed; Revoked ⇒ remaining > 0).

## Step 0 — model shape (post-refactor)

`Expired` is no longer a stored status. The stored `Status` enum is `{Allocated, Redeemed, Revoked}`; `Expired` is a **derived read-time projection** (`Lapsed[r, clock] ≜ r.status = Allocated ∧ gte[clock, r.expiresAt]`, surfaced as `ReadsExpired`) evaluated against the injected clock (`now`) carried on the `Store` snapshot. There is no `expire` transition — lapse never writes. The two stored writes are exhaustion (→ `Redeemed`) and revocation (→ `Revoked`). The clock and token are pipeline-injected at the I/O seam, not action parameters; the model carries the injected clock as `Store.now` (a natural) and reads it in the pure redeem/revoke guards (`lt[clock, pre.expiresAt]`).

## Step 1 — harness run (must pass)

- Correct model: `node tools/harness/check.mjs atoms/capability.als` → `PASS` ✓ (all **24** `check`s hold, all **10** `run`s satisfiable — 34 commands). Verified under JRE 17 on 2026-06-23.
- Buggy twin: `node tools/harness/check.mjs atoms/capability-buggy.als --buggy` → `PASS` (rejected) ✓ (24 checks, 2 runs). The injected defect **drops the expiry guard** in `redeem_success`, so a lapsed capability is redeemable; counterexamples land on exactly the three expected checks — `A_RedeemOnlyWhenNotLapsed` (the render-time defect), plus `A_AllocatedHasRemaining` and `A_ZeroCounterMeansRedeemed` (the belt-and-suspenders exhaustion weakenings). `ShowBuggyRedeemWhileLapsed` is satisfiable — the violating instance is real, not an artifact. Verified under JRE 17 on 2026-06-23.

## Step 2 — coverage matrix

One row per numbered Invariant (1–13) plus the two emergent claims and the load-bearing lapsed-cannot-be-redeemed guarantee.

| Spec claim (no. + name) | Load-bearing (vote)? | Verdict | Model construct / reason |
|---|---|---|---|
| Invariant 1 — Allocation provenance immutability | no | **covered** (transition layer) | `A_RedeemPreservesImmutable` and `A_RevokePreservesImmutable` assert `cap_token`/`allocator`/`cap_scope`/`maxRed`/`expiresAt` carry through unchanged across both stored writes. (Lapse has no transition, so immutability under expiry is vacuous-by-construction — nothing is written.) |
| Invariant 2 — Redemption counter monotonic | yes | **covered** | `A_RedeemDecrementsCounterByOne` (exactly −1 per redeem), `A_CounterNotExceedsMax`, `A_CounterNonNegative`, `A_CounterNeverNegativeAfterRedeem`; `fact CounterBounds`. |
| Invariant 3 — Bearer redemption (no redeemer identity) | no | by-construction | No redeemer field is declared on `CapabilityRecord`; `redeem_success` takes only pre/post + injected `clock`. A schema-level guarantee, not an asserted check — a regression *adding* a redeemer field is not catchable by the current model; recorded as an assumption. |
| Invariant 4 — Exhaustion atomicity | yes | **covered** (structural half) | `A_ExhaustionSetsRedeemed` (redeem to `remRed = 0` sets `Redeemed`) + `A_PartialRedeemStaysAllocated` + `fact CounterStatusConsistency`; the buggy twin breaks exactly this arm. The *interleaving* half (two concurrent redeems at `remRed = 1`) is out-of-scope for a static Alloy model — named in the residual below. |
| Invariant 5 — Audit asymmetry | no | by-construction | Same schema basis as Invariant 3: `allocator` is a `one` field, redeemer is structurally absent. Assumption, not an asserted property. |
| Invariant 6 — Three terminal modes; two stored, one derived | yes | **covered** | `A_TerminalModesDistinguishable` (Redeemed ≠ Revoked; non-Allocated ∈ {Redeemed, Revoked}) + `A_RedeemedIsExhausted` + `A_RevokedHasAttribution` / `A_NonRevokedNoAttribution` pin the stored field patterns; `A_StoredTerminalNeverReadsExpired` and `A_LapsedHasNoTerminalFields` place the derived `Expired` distinctly (a lapsed record is stored-Allocated with no terminal fields). |
| Invariant 7 — Stored terminal state absorbing | no | **covered** | `A_StoredTerminalAbsorbing` — neither `redeem_success` nor `revoke` fires from a non-Allocated pre-state (both predicates require `pre.status = Allocated`). |
| Invariant 8 — Scope immutability | no | **covered** | `cap_scope` preservation is included in `A_RedeemPreservesImmutable` and `A_RevokePreservesImmutable`. |
| Invariant 9 — Revocation attribution completeness | yes | **covered** | `A_RevokedHasAttribution` / `A_NonRevokedNoAttribution` + `fact RevocationAttribution`; `A_RevokeSetAttribution` on the transition. |
| Invariant 10 — Every capability has a finite lifetime (`expires_at` never null) | partial | **covered** (structural half) / out-of-scope (TTL semantics) | `fact PositiveDeadline` (`expiresAt >= 1`) makes the deadline always-present and positive, and `allocate` requires `r.expiresAt >= 1` — so "no null deadline" is structural. `expires_at = allocated_at + ttl` arithmetic and the no-null-TTL deployment rule are Decision-points clock rules, records-alone checkable, not modeled as first-class durations. |
| Invariant 11 — Capability durability | no | out-of-scope (named reason) | Storage durability and the no-partial-record guarantee are not structural-configuration properties; host/store obligation. |
| Invariant 12 — Capability token uniqueness | yes | **covered** (per-snapshot) | `A_TokenUniqueness` over store snapshots + `fact StoreTokenUniqueness` (store-scoped — the fix that keeps the historical transition-vacuity defect closed: pre/post pairs share a token across a step). Lifetime-uniqueness beyond co-existing records is out-of-scope for a snapshot model; the spec scopes the claim to retained records (Edge cases — External purge and retention). |
| Invariant 13 — Expiry is derived, never written | yes | **covered** | `A_NoStoredExpired` (store never holds an Expired value — guards against a future edit re-introducing a stored status); `A_StoredTerminalNeverReadsExpired` and `A_LapsedHasNoTerminalFields` (stored/derived coherence — only a stored-Allocated past its deadline reads Expired, and it carries no terminal fields). The "lapse writes nothing" half is by-construction: there is no expire transition, so no write can fire on lapse. |
| Emergent — zero counter ⇒ Redeemed | yes | **covered** | `A_ZeroCounterMeansRedeemed` + `fact ZeroCounterImpliesRedeemed`; the buggy twin breaks it. |
| Emergent — Revoked ⇒ remaining > 0 | yes | **covered** | `A_RevokedHasPositiveRemaining` on the revoke transition (`revoke` requires `pre.remRed > 0` and preserves the counter). |
| Load-bearing guarantee — a lapsed capability cannot be redeemed or revoked | yes | **covered** | `A_RedeemOnlyWhenNotLapsed` and `A_RevokeOnlyWhenNotLapsed` — both writing transitions require `lt[clock, pre.expiresAt]`, so neither can fire once `now ≥ expires_at`. This is the refactor's load-bearing render-time guarantee and the exact property the buggy twin violates. Reachability of the derived `Expired` read is confirmed by runs `ShowDerivedExpired`, `ShowThreeTerminalModes`, and `ShowLiveAndExpiredCoexist`. |

Out-of-scope residual, named: the **concurrent-redeem interleaving** (Invariant 4's two-callers-at-`remRed = 1` race) is a TLC-class question a static Alloy model cannot ask. It is exercised operationally where it is load-bearing at the composition layer — `capability-backed-sharing.tla` (C15) models the redemption-decrement inside its binding transaction, and `privileged-access-provisioning.tla` exercises redeem under interleaving. Not a GAP: deliberate tool-split, reason recorded.

## Step 3 — bound saturation

- Static `check`s run at scope `for 6` (token uniqueness, counter bounds, attribution, terminal-mode distinguishability, derived-expiry coherence); transition `check`s at `for 5 but 4 Int` (the pre/post pair plus injected `clock`; `4 Int` gives the `[-8, 7]` integer range needed to exercise the deadline/clock comparison and the counter decrement). All 24 checks hold and all 10 runs are satisfiable at these bounds. The transition assertions involve at most two records (pre/post) plus a clock; `for 5` is well above the witness size, so the bounded-exhaustive search is saturated for these claims at the modeled universe.

## Outcome

- GAP rows: none.
- by-construction flags on load-bearing claims: Invariant 13's "lapse writes nothing" half (no expire transition exists) and Invariant 3/5 (no redeemer field). Invariants 3 and 5 are voted structural-design properties, not temporal claims; recorded as assumptions above.
- Result: **all load-bearing formal-layer claims covered; twin discipline satisfied (the buggy twin is rejected on the render-time defect).** Regenerated against the post-refactor model, 2026-06-23.
