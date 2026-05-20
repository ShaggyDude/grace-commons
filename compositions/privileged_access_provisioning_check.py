"""
privileged_access_provisioning_check.py
Bounded model checker for privileged-access-provisioning.tla — runs without TLC.
BFS over all reachable states within scope. Checks all safety invariants.

Scope: RequestIDs={"r1","r2"}, ApproverIDs={"a1","a2","a3"},
       CapTokens={"cap1","cap2"}, QuorumSize=2

Run: python3 compositions/privileged_access_provisioning_check.py
All invariants should hold. A violation is a spec finding for
compositions/privileged-access-provisioning.md.
"""
from collections import deque

REQUESTS  = ("r1", "r2")
APPROVERS = ("a1", "a2", "a3")
TOKENS    = ("cap1", "cap2")
QUORUM    = 2
TERMINALS = {"Provisioned", "Denied", "Withdrawn", "Revoked", "ProvisioningFailed"}
NEXT_TOKEN = {"r1": "cap1", "r2": "cap2"}

def make_state(rs, cs, ap, rj, r2c, c2r, ca, ce):
    return (
        tuple(rs[r]           for r in REQUESTS),
        tuple(cs[r]           for r in REQUESTS),
        tuple(frozenset(ap[r]) for r in REQUESTS),
        tuple(frozenset(rj[r]) for r in REQUESTS),
        tuple(r2c[r]          for r in REQUESTS),
        tuple(c2r[t]          for t in TOKENS),
        frozenset(ca), frozenset(ce),
    )

def unpack(state):
    rs  = {r: state[0][i] for i, r in enumerate(REQUESTS)}
    cs  = {r: state[1][i] for i, r in enumerate(REQUESTS)}
    ap  = {r: set(state[2][i]) for i, r in enumerate(REQUESTS)}
    rj  = {r: set(state[3][i]) for i, r in enumerate(REQUESTS)}
    r2c = {r: state[4][i] for i, r in enumerate(REQUESTS)}
    c2r = {t: state[5][i] for i, t in enumerate(TOKENS)}
    ca  = set(state[6])
    ce  = set(state[7])
    return rs, cs, ap, rj, r2c, c2r, ca, ce

def init_state():
    return make_state(
        {r: "Pending" for r in REQUESTS},
        {r: "Pending" for r in REQUESTS},
        {r: set() for r in REQUESTS},
        {r: set() for r in REQUESTS},
        {r: "none" for r in REQUESTS},
        {t: "none" for t in TOKENS},
        set(), set()
    )

def successors(state):
    rs, cs, ap, rj, r2c, c2r, ca, ce = unpack(state)
    nexts = []

    def emit(**kw):
        nexts.append(make_state(
            kw.get("rs", rs), kw.get("cs", cs),
            kw.get("ap", ap), kw.get("rj", rj),
            kw.get("r2c", r2c), kw.get("c2r", c2r),
            kw.get("ca", ca), kw.get("ce", ce),
        ))

    for r in REQUESTS:
        # ApproveStep
        if rs[r] in ("Pending", "Approved") and cs[r] == "Pending":
            for a in APPROVERS:
                if a not in ap[r] and a not in rj[r]:
                    new_ap = {x: ap[x].copy() for x in REQUESTS}
                    new_ap[r].add(a)
                    if len(new_ap[r]) >= QUORUM:
                        new_cs = {**cs, r: "Approved"}
                        if rs[r] == "Pending":
                            tok = NEXT_TOKEN[r]
                            emit(rs={**rs, r: "Provisioned"}, cs=new_cs, ap=new_ap,
                                 r2c={**r2c, r: tok}, c2r={**c2r, tok: r},
                                 ca=ca | {tok})
                        else:
                            emit(cs=new_cs, ap=new_ap)
                    else:
                        emit(ap=new_ap)

        # RejectStep
        if rs[r] == "Pending" and cs[r] == "Pending":
            for a in APPROVERS:
                if a not in ap[r] and a not in rj[r]:
                    new_rj = {x: rj[x].copy() for x in REQUESTS}
                    new_rj[r].add(a)
                    emit(rs={**rs, r: "Denied"}, cs={**cs, r: "Rejected"}, rj=new_rj)

        # WithdrawRequest
        if rs[r] == "Pending" and cs[r] == "Pending":
            emit(rs={**rs, r: "Withdrawn"}, cs={**cs, r: "Withdrawn"})

        # ExerciseAccess
        if rs[r] == "Provisioned" and r2c[r] != "none":
            tok = r2c[r]
            if tok in ca and tok not in ce:
                emit(ce=ce | {tok})

        # RevokeAccess
        if rs[r] == "Provisioned":
            emit(rs={**rs, r: "Revoked"})

        # ProvisioningFailed
        if rs[r] == "Pending" and cs[r] == "Approved":
            emit(rs={**rs, r: "ProvisioningFailed"})

    return nexts

def check_invariants(state):
    rs, cs, ap, rj, r2c, c2r, ca, ce = unpack(state)
    fails = []

    for r in REQUESTS:
        if r2c[r] != "none" and cs[r] != "Approved":
            fails.append(f"ApprovalGatesProvisioning: {r} has token but chain={cs[r]}")
        if r2c[r] != "none" and c2r[r2c[r]] != r:
            fails.append(f"MapInverseConsistency: r2c[{r}]={r2c[r]} but c2r[{r2c[r]}]={c2r[r2c[r]]}")
        if rs[r] == "Pending" and r2c[r] != "none":
            fails.append(f"NoPendingRequestHasToken: {r} Pending but has token")

    for t in TOKENS:
        if c2r[t] != "none" and r2c[c2r[t]] != t:
            fails.append(f"MapInverseConsistency: c2r[{t}]={c2r[t]} but r2c[{c2r[t]}]={r2c[c2r[t]]}")

    for t in ca:
        owner = next((r for r in REQUESTS if r2c[r] == t), None)
        if owner is None:
            fails.append(f"AllocatedTokenHasNoOwner: {t}")
        elif rs[owner] not in ("Provisioned", "Revoked"):
            fails.append(f"TokensAllocatedOnlyForProvisioned: {t} owner {owner} is {rs[owner]}")

    if not ce.issubset(ca):
        fails.append(f"ExhaustedSubsetAllocated: {ce - ca} exhausted but not allocated")

    return fails

visited = {init_state()}
queue   = deque([init_state()])
violations = []

while queue and not violations:
    state = queue.popleft()
    fails = check_invariants(state)
    if fails:
        violations.extend(fails)
        rs, cs, ap, rj, r2c, c2r, ca, ce = unpack(state)
        print("VIOLATION:")
        for f in fails: print(f"  {f}")
        print(f"  req_states={dict(zip(REQUESTS, [rs[r] for r in REQUESTS]))}")
        break
    for nxt in successors(state):
        if nxt not in visited:
            visited.add(nxt)
            queue.append(nxt)

print(f"States explored: {len(visited)}")
if violations:
    print(f"VIOLATIONS: {len(violations)}")
else:
    print("All invariants hold. No counterexample found within scope.")
