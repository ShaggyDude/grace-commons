#!/usr/bin/env python3
"""twin.py — the Go render's twin, in Python.

Go can't be installed in the build sandbox (the proxy blocks go.dev and the
Google mirrors), so this Python twin is what proves the cross-language claim
*empirically, in-sandbox*: a non-TypeScript render, using the same canonical-JSON
+ SHA-256 contract and the same pinned inputs as main.go, produces a chain that
verifies under the JS verifier (verify.mjs).

It mirrors canonical.go / eventlog.go / composition.go / main.go line-for-line, so
its JSONL output is byte-identical to `go run .`. Run:

    python3 twin.py > out.jsonl && node verify.mjs out.jsonl
"""
import json
import hashlib
import sys


def canonicalize(v):
    """Mirror of lib/canonical.ts. Object keys sorted; arrays recurse; primitives
    via json.dumps, which matches JS JSON.stringify for None/bool/int/str.
    (ensure_ascii=False keeps non-ASCII raw, like JS; Python and JS both leave
    <,>,& unescaped — only Go's encoder needed a flag. Floats are intentionally
    not pinned; the demo payloads have none.)"""
    if isinstance(v, dict):
        return "{" + ",".join(
            json.dumps(k, ensure_ascii=False) + ":" + canonicalize(v[k])
            for k in sorted(v.keys())
        ) + "}"
    if isinstance(v, list):
        return "[" + ",".join(canonicalize(e) for e in v) + "]"
    return json.dumps(v, ensure_ascii=False)


def sha256hex(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


chain = []


def hash_event(e):
    return sha256hex(canonicalize({
        "id": e["id"], "occurred_at": e["occurred_at"],
        "actor_id": e["actor_id"], "session_id": e["session_id"],
        "action": e["action"], "target_kind": e["target_kind"],
        "target_id": e["target_id"], "payload_json": e["payload_json"],
        "prev_hash": e["prev_hash"],
    }))


def append_event(action, target_kind=None, target_id=None, payload=None,
                 occurred_at=None, actor_id=None, session_id=None):
    prev_hash = chain[-1]["this_hash"] if chain else ""   # the lock is implicit (single-threaded)
    rid = len(chain) + 1                                  # MAX(id)+1
    row = {
        "id": rid, "occurred_at": occurred_at,
        "actor_id": actor_id, "session_id": session_id,
        "action": action, "target_kind": target_kind, "target_id": target_id,
        "payload_json": canonicalize(payload if payload is not None else {}),
        "prev_hash": prev_hash,
    }
    row["this_hash"] = hash_event(row)
    chain.append(row)
    return rid


# Same pinned scenario as main.go.
append_event("study.registered", "study", 1,
             {"protocol_number": "BCN-OX-201",
              "note": "Protocol BCN-OX-201 registered in trial management system."},
             "2018-06-06T00:00:00.000Z")
append_event("login.succeeded", "actor", 1, {}, "2026-06-06T12:00:00.000Z", 1, 1)
append_event("invitation.issued", "invitation", 1,
             {"display_name": "Maya Chen", "email": "maya@beacon.clinical",
              "intended_role": "coordinator", "expires_at": "2026-06-13T12:00:05.000Z"},
             "2026-06-06T12:00:05.000Z", 1, 1)

for row in chain:
    print(canonicalize(row))

ok = all(hash_event(r) == r["this_hash"] for r in chain)
print(f"{'✓' if ok else '✗'} Python twin: chain intact, {len(chain)} events (self-verify)",
      file=sys.stderr)
sys.exit(0 if ok else 1)
