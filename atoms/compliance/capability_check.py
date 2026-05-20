"""
Bounded model checker for capability.als
Replicates Alloy's check/run semantics in Python:
  - check A_* : assert holds for ALL valid configurations up to bound -> find counterexample or pass
  - run Show* : find at least ONE valid configuration satisfying the predicate -> sat or unsat
"""
from itertools import product
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum

# ── Types ────────────────────────────────────────────────────────────────────

class Status(Enum):
    Allocated = "Allocated"
    Redeemed  = "Redeemed"
    Expired   = "Expired"
    Revoked   = "Revoked"

# Bound: small atoms (Alloy "for 5" generates up to 5 of each abstract sig)
TOKENS    = [f"tok_{i}" for i in range(3)]
ACTORS    = [f"actor_{i}" for i in range(2)]
SCOPES    = [f"scope_{i}" for i in range(2)]
REASONS   = [f"reason_{i}" for i in range(2)]
MAX_REDS  = [1, 2, 3]   # maxRed values to consider
REM_REDS  = [0, 1, 2, 3] # remRed values to consider

@dataclass(frozen=True)
class Cap:
    cap_token  : str
    allocator  : str
    cap_scope  : str
    maxRed     : int
    remRed     : int
    status     : Status
    revokedBy  : Optional[str] = None   # None = absent
    revReason  : Optional[str] = None   # None = absent

# ── Well-formedness facts ────────────────────────────────────────────────────

def is_well_formed(r: Cap) -> bool:
    # CounterBounds: maxRed >= 1, 0 <= remRed <= maxRed
    if r.maxRed < 1:                       return False
    if r.remRed < 0:                       return False
    if r.remRed > r.maxRed:                return False
    # CounterStatusConsistency
    if r.status == Status.Allocated and r.remRed <= 0: return False
    if r.status == Status.Redeemed  and r.remRed != 0: return False
    # RevocationAttribution
    if r.status == Status.Revoked and (r.revokedBy is None or r.revReason is None):
        return False
    if r.status != Status.Revoked and (r.revokedBy is not None or r.revReason is not None):
        return False
    # ZeroCounterImpliesRedeemed
    if r.remRed == 0 and r.status != Status.Redeemed: return False
    return True

def is_well_formed_store(store: list[Cap]) -> bool:
    # TokenUniqueness: all tokens distinct
    tokens = [r.cap_token for r in store]
    return len(tokens) == len(set(tokens))

# ── Generate all single well-formed records ──────────────────────────────────

def all_single_records():
    records = []
    for tok, actor, scope, maxR, remR, status in product(
            TOKENS, ACTORS, SCOPES, MAX_REDS, REM_REDS,
            list(Status)):
        for rby in [None] + ACTORS:
            for rrsn in [None] + REASONS:
                r = Cap(tok, actor, scope, maxR, remR, status, rby, rrsn)
                if is_well_formed(r):
                    records.append(r)
    return records

SINGLE_RECORDS = all_single_records()
print(f"Well-formed single records: {len(SINGLE_RECORDS)}")

# ── Generate multi-record stores (up to N records) ───────────────────────────

def all_stores_up_to(n: int):
    """Generate all stores of 1..n well-formed records with distinct tokens."""
    from itertools import combinations
    stores = []
    # Generate by choosing subsets (each record already has a fixed token)
    # Group records by token so we can pick one per token
    from collections import defaultdict
    by_token = defaultdict(list)
    for r in SINGLE_RECORDS:
        by_token[r.cap_token].append(r)
    
    # For stores of size 1..n, pick from different token groups
    token_groups = list(by_token.values())
    
    def gen(size):
        if size == 0:
            yield []
            return
        for combo in combinations(range(len(token_groups)), size):
            for record_combo in product(*[token_groups[i] for i in combo]):
                yield list(record_combo)
    
    for size in range(1, n + 1):
        for store in gen(size):
            stores.append(store)
    return stores

print("Generating stores up to size 3...")
STORES = all_stores_up_to(3)
print(f"Valid stores (up to 3 records): {len(STORES)}")

# ── Assertions: check A_* ────────────────────────────────────────────────────

def check(name, predicate, stores):
    """Check that predicate holds for ALL records in ALL stores. Return counterexample or None."""
    for store in stores:
        for r in store:
            result = predicate(r, store)
            if not result:
                return (name, r, store)
    return None

results = []

def run_check(name, pred):
    ce = check(name, pred, STORES)
    if ce:
        print(f"  COUNTEREXAMPLE {name}: {ce[1]}")
        results.append((name, "FAIL", ce[1]))
    else:
        print(f"  PASS {name}")
        results.append((name, "PASS", None))

print("\n── Structural assertions (check A_*) ──────────────────────────────")

run_check("A_TokenUniqueness",
    lambda r, store: len([s for s in store if s.cap_token == r.cap_token]) == 1)

run_check("A_CounterNotExceedsMax",
    lambda r, store: r.remRed <= r.maxRed)

run_check("A_CounterNonNegative",
    lambda r, store: r.remRed >= 0)

run_check("A_AllocatedHasRemaining",
    lambda r, store: r.status != Status.Allocated or r.remRed > 0)

run_check("A_RedeemedIsExhausted",
    lambda r, store: r.status != Status.Redeemed or r.remRed == 0)

run_check("A_ZeroCounterMeansRedeemed",
    lambda r, store: r.remRed != 0 or r.status == Status.Redeemed)

run_check("A_RevokedHasAttribution",
    lambda r, store: r.status != Status.Revoked or
        (r.revokedBy is not None and r.revReason is not None))

run_check("A_NonRevokedNoAttribution",
    lambda r, store: r.status == Status.Revoked or
        (r.revokedBy is None and r.revReason is None))

run_check("A_TerminalModesDistinguishable",
    lambda r, store: not (r.status == Status.Redeemed and r.status == Status.Expired))

# ── Transition predicates ────────────────────────────────────────────────────

def redeem_success(pre: Cap, post: Cap) -> bool:
    if pre.status != Status.Allocated: return False
    if pre.remRed <= 0:                return False
    # immutable fields
    if post.cap_token != pre.cap_token:   return False
    if post.allocator != pre.allocator:   return False
    if post.cap_scope != pre.cap_scope:   return False
    if post.maxRed    != pre.maxRed:      return False
    if post.revokedBy != pre.revokedBy:   return False
    if post.revReason != pre.revReason:   return False
    # counter
    if post.remRed != pre.remRed - 1:     return False
    # exhaustion
    if pre.remRed == 1 and post.status != Status.Redeemed:  return False
    if pre.remRed  > 1 and post.status != Status.Allocated: return False
    return True

def revoke_pred(pre: Cap, post: Cap, actor: str, rsn: str) -> bool:
    if pre.status != Status.Allocated:    return False
    if pre.remRed <= 0:                   return False
    if post.cap_token != pre.cap_token:   return False
    if post.allocator != pre.allocator:   return False
    if post.cap_scope != pre.cap_scope:   return False
    if post.maxRed    != pre.maxRed:      return False
    if post.remRed    != pre.remRed:      return False  # counter preserved
    if post.status    != Status.Revoked:  return False
    if post.revokedBy != actor:           return False
    if post.revReason != rsn:             return False
    return True

def expire_pred(pre: Cap, post: Cap) -> bool:
    if pre.status != Status.Allocated:    return False
    if post.cap_token != pre.cap_token:   return False
    if post.allocator != pre.allocator:   return False
    if post.cap_scope != pre.cap_scope:   return False
    if post.maxRed    != pre.maxRed:      return False
    if post.remRed    != pre.remRed:      return False  # counter NOT decremented
    if post.status    != Status.Expired:  return False
    if post.revokedBy is not None:        return False
    if post.revReason is not None:        return False
    return True

print("\n── Transition assertions ───────────────────────────────────────────")

def check_transition(name, pred):
    """Check that pred holds for all valid (pre,post) pairs from SINGLE_RECORDS."""
    fail = None
    for pre in SINGLE_RECORDS:
        for post in SINGLE_RECORDS:
            if pred(pre, post) is False:
                pass  # Not a counterexample — the predicate may not apply
    # We need: "for all pre,post where transition fires, assertion holds"
    # We'll check the assertion inline
    print(f"  (transition checks run inline via specific assertions)")

# Check exhaustion: if redeem_success fires and pre.remRed=1, then post.status=Redeemed
fails = []
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        if redeem_success(pre, post) and pre.remRed == 1:
            if post.status != Status.Redeemed:
                fails.append((pre, post))
if fails:
    print(f"  COUNTEREXAMPLE A_ExhaustionSetsRedeemed: {fails[0]}")
    results.append(("A_ExhaustionSetsRedeemed", "FAIL", fails[0]))
else:
    print(f"  PASS A_ExhaustionSetsRedeemed")
    results.append(("A_ExhaustionSetsRedeemed", "PASS", None))

# Check partial redeem stays Allocated
fails = []
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        if redeem_success(pre, post) and pre.remRed > 1:
            if post.status != Status.Allocated:
                fails.append((pre, post))
if fails:
    print(f"  COUNTEREXAMPLE A_PartialRedeemStaysAllocated: {fails[0]}")
    results.append(("A_PartialRedeemStaysAllocated", "FAIL", fails[0]))
else:
    print(f"  PASS A_PartialRedeemStaysAllocated")
    results.append(("A_PartialRedeemStaysAllocated", "PASS", None))

# Check immutability under redeem
fails = []
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        if redeem_success(pre, post):
            if post.cap_token != pre.cap_token or post.allocator != pre.allocator or \
               post.cap_scope != pre.cap_scope or post.maxRed != pre.maxRed:
                fails.append((pre, post))
if fails:
    print(f"  COUNTEREXAMPLE A_RedeemPreservesImmutable: {fails[0]}")
    results.append(("A_RedeemPreservesImmutable", "FAIL", fails[0]))
else:
    print(f"  PASS A_RedeemPreservesImmutable")
    results.append(("A_RedeemPreservesImmutable", "PASS", None))

# Check counter decrements by exactly 1
fails = []
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        if redeem_success(pre, post):
            if post.remRed != pre.remRed - 1:
                fails.append((pre, post))
if fails:
    print(f"  COUNTEREXAMPLE A_RedeemDecrementsCounterByOne: {fails[0]}")
    results.append(("A_RedeemDecrementsCounterByOne", "FAIL", fails[0]))
else:
    print(f"  PASS A_RedeemDecrementsCounterByOne")
    results.append(("A_RedeemDecrementsCounterByOne", "PASS", None))

# Check counter never negative after redeem
fails = []
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        if redeem_success(pre, post):
            if post.remRed < 0:
                fails.append((pre, post))
if fails:
    print(f"  COUNTEREXAMPLE A_CounterNeverNegativeAfterRedeem: {fails[0]}")
    results.append(("A_CounterNeverNegativeAfterRedeem", "FAIL", fails[0]))
else:
    print(f"  PASS A_CounterNeverNegativeAfterRedeem")
    results.append(("A_CounterNeverNegativeAfterRedeem", "PASS", None))

# Check revoke sets attribution
fails = []
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        for actor in ACTORS:
            for rsn in REASONS:
                if revoke_pred(pre, post, actor, rsn):
                    if post.revokedBy != actor or post.revReason != rsn or post.status != Status.Revoked:
                        fails.append((pre, post, actor, rsn))
if fails:
    print(f"  COUNTEREXAMPLE A_RevokeSetAttribution: {fails[0]}")
    results.append(("A_RevokeSetAttribution", "FAIL", fails[0]))
else:
    print(f"  PASS A_RevokeSetAttribution")
    results.append(("A_RevokeSetAttribution", "PASS", None))

# Check revoke preserves counter
fails = []
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        for actor in ACTORS:
            for rsn in REASONS:
                if revoke_pred(pre, post, actor, rsn):
                    if post.remRed != pre.remRed:
                        fails.append((pre, post))
if fails:
    print(f"  COUNTEREXAMPLE A_RevokePreservesCounter: {fails[0]}")
    results.append(("A_RevokePreservesCounter", "FAIL", fails[0]))
else:
    print(f"  PASS A_RevokePreservesCounter")
    results.append(("A_RevokePreservesCounter", "PASS", None))

# Check revoked records have positive remaining (emergent property)
fails = []
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        for actor in ACTORS:
            for rsn in REASONS:
                if revoke_pred(pre, post, actor, rsn):
                    if post.remRed <= 0:
                        fails.append((pre, post))
if fails:
    print(f"  COUNTEREXAMPLE A_RevokedHasPositiveRemaining: {fails[0]}")
    results.append(("A_RevokedHasPositiveRemaining", "FAIL", fails[0]))
else:
    print(f"  PASS A_RevokedHasPositiveRemaining")
    results.append(("A_RevokedHasPositiveRemaining", "PASS", None))

# Check terminal absorbing (no transition fires from terminal states)
fails = []
for pre in SINGLE_RECORDS:
    if pre.status != Status.Allocated:
        for post in SINGLE_RECORDS:
            if redeem_success(pre, post):
                fails.append(("redeem_from_terminal", pre, post))
            if expire_pred(pre, post):
                fails.append(("expire_from_terminal", pre, post))
            for actor in ACTORS:
                for rsn in REASONS:
                    if revoke_pred(pre, post, actor, rsn):
                        fails.append(("revoke_from_terminal", pre, post))
if fails:
    print(f"  COUNTEREXAMPLE A_TerminalAbsorbing: {fails[0]}")
    results.append(("A_TerminalAbsorbing", "FAIL", fails[0]))
else:
    print(f"  PASS A_TerminalAbsorbing")
    results.append(("A_TerminalAbsorbing", "PASS", None))

# Check expire preserves counter
fails = []
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        if expire_pred(pre, post):
            if post.remRed != pre.remRed:
                fails.append((pre, post))
if fails:
    print(f"  COUNTEREXAMPLE A_ExpirePreservesCounter: {fails[0]}")
    results.append(("A_ExpirePreservesCounter", "FAIL", fails[0]))
else:
    print(f"  PASS A_ExpirePreservesCounter")
    results.append(("A_ExpirePreservesCounter", "PASS", None))

# ── Satisfiability runs (show) ────────────────────────────────────────────────

print("\n── Satisfiability runs (run Show*) ────────────────────────────────")

def find_one(name, pred, universe=None):
    src = universe if universe is not None else SINGLE_RECORDS
    for r in src:
        if pred(r):
            print(f"  SAT {name}: {r}")
            results.append((name, "SAT", r))
            return r
    print(f"  UNSAT {name}: no instance found — PROBLEM (over-constrained?)")
    results.append((name, "UNSAT", None))
    return None

find_one("ShowAllocated", lambda r: r.status == Status.Allocated)
find_one("ShowRedeemed",  lambda r: r.status == Status.Redeemed and r.remRed == 0)
find_one("ShowExpired",   lambda r: r.status == Status.Expired)
find_one("ShowRevoked",   lambda r: r.status == Status.Revoked and r.revokedBy is not None)

# All four statuses in one store
found_all_four = None
for store in STORES:
    statuses = {r.status for r in store}
    if Status.Allocated in statuses and Status.Redeemed in statuses and \
       Status.Expired in statuses and Status.Revoked in statuses:
        found_all_four = store
        break
if found_all_four:
    print(f"  SAT ShowAllFourStatuses: {[r.status.value for r in found_all_four]}")
    results.append(("ShowAllFourStatuses", "SAT", found_all_four))
else:
    print(f"  UNSAT ShowAllFourStatuses")
    results.append(("ShowAllFourStatuses", "UNSAT", None))

# Exhaustion transition
found = None
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        if redeem_success(pre, post) and pre.remRed == 1 and post.status == Status.Redeemed:
            found = (pre, post)
            break
    if found: break
if found:
    print(f"  SAT ShowExhaustionTransition: pre.remRed={found[0].remRed} → post.status={found[1].status.value}")
    results.append(("ShowExhaustionTransition", "SAT", found))
else:
    print(f"  UNSAT ShowExhaustionTransition")
    results.append(("ShowExhaustionTransition", "UNSAT", None))

# Multi-use partial redeem (max=3, redeem once, still Allocated)
found = None
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        if redeem_success(pre, post) and pre.maxRed == 3 and pre.remRed == 3 \
           and post.remRed == 2 and post.status == Status.Allocated:
            found = (pre, post)
            break
    if found: break
if found:
    print(f"  SAT ShowMultiUsePartialRedeem: max={found[0].maxRed} pre.rem={found[0].remRed} → post.rem={found[1].remRed}")
    results.append(("ShowMultiUsePartialRedeem", "SAT", found))
else:
    print(f"  UNSAT ShowMultiUsePartialRedeem")
    results.append(("ShowMultiUsePartialRedeem", "UNSAT", None))

# Revoke transition
found = None
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        for actor in ACTORS:
            for rsn in REASONS:
                if revoke_pred(pre, post, actor, rsn):
                    found = (pre, post, actor, rsn)
                    break
            if found: break
        if found: break
    if found: break
if found:
    print(f"  SAT ShowRevokeTransition: pre.status={found[0].status.value} → post.status={found[1].status.value}")
    results.append(("ShowRevokeTransition", "SAT", found))
else:
    print(f"  UNSAT ShowRevokeTransition")
    results.append(("ShowRevokeTransition", "UNSAT", None))

# Expire transition
found = None
for pre in SINGLE_RECORDS:
    for post in SINGLE_RECORDS:
        if expire_pred(pre, post) and post.remRed == pre.remRed and post.status == Status.Expired:
            found = (pre, post)
            break
    if found: break
if found:
    print(f"  SAT ShowExpireTransition: pre.remRed={found[0].remRed} preserved → post.status={found[1].status.value}")
    results.append(("ShowExpireTransition", "SAT", found))
else:
    print(f"  UNSAT ShowExpireTransition")
    results.append(("ShowExpireTransition", "UNSAT", None))

# ── Summary ──────────────────────────────────────────────────────────────────

print("\n── Summary ─────────────────────────────────────────────────────────")
passes  = [r for r in results if r[1] in ("PASS", "SAT")]
fails   = [r for r in results if r[1] in ("FAIL", "UNSAT")]
print(f"  {len(passes)} checks passed / {len(fails)} failed")
if fails:
    print("  FAILURES:")
    for f in fails:
        print(f"    {f[0]}: {f[1]}")
else:
    print("  All checks passed. No counterexamples found within scope.")
    print("  All satisfiability runs found instances. Model is not over-constrained.")
