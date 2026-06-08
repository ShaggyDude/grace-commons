# Beacon — Render 3 (Go, headless)

The **third render** of the Grace Commons clinical-trial-portal specs, in Go — and
deliberately **headless**. Renders 1 ([Deno/HTMX/SQLite](../clinical-trial-portal/))
and 2 ([Next.js/RSC/Postgres](../clinical-trial-portal-next/)) are both full UIs,
and both TypeScript. This render skips the UI on purpose — the presentation layer
is the disposable part — and exists to test the one dimension the first two don't
cover: **a different language.** The canonical-JSON serializer, the SHA-256 hash
chain, and the `composition.ts` transaction shape have only ever been expressed in
TypeScript; this re-expresses the spec-derived core in Go and proves a Go-produced
audit chain verifies under the *TypeScript* contract (BUILD_PLAN §6.3, made literal
across a language boundary).

## What's here

```
canonical.go     canonicalize() — byte-identical port of lib/canonical.ts
hash.go          sha256hex()
eventlog.go      EventRow, appendEvent (serialized by sync.Mutex), verifyChain
composition.go   issueInvitation (C16) — the one composition vertical; in-memory atoms
main.go          a fixed, deterministic 3-event lifecycle slice; emits the chain as JSONL
verify.mjs       the JS verifier (canonical contract identical to render 2); recomputes the chain
twin.py          the Python twin — same chain, used to verify the contract in the build sandbox
expected-chain.jsonl   the golden chain (3 languages must reproduce it byte-for-byte)
```

## Run it

```bash
# Go (your machine — Go isn't installable in the build sandbox; see note below):
go run . > out.jsonl
node verify.mjs out.jsonl          # ✓ Verified 3 events under the JS canonical contract
diff out.jsonl expected-chain.jsonl   # byte-identical to the Python/JS golden → no output

# Python twin (proves the contract anywhere, no Go needed):
python3 twin.py | node verify.mjs /dev/stdin
```

`verify.mjs`'s `canonicalize` + hashed-event shape are byte-identical to render 2's
`lib/canonical.ts` and `domain/event_log.ts`. "Verifies under `verify.mjs`" therefore
means "verifies under the TypeScript canonical contract" — a Go (or Python) chain
re-walking clean under the JS rules is the cross-language portability claim.

## The serialization mechanism — a third conforming mechanism

The Event Log atom requires that *"the underlying implementation must serialize
[appends]"* (Invariant 3, total order). This render satisfies that clause with a
`sync.Mutex` held for the whole transaction body (`withTx` in `eventlog.go`).
That makes **three** renders, **three** mechanisms, **one** already-stated spec
invariant:

| Render | Serialization mechanism |
|---|---|
| 1 — SQLite | single-writer lock (free) |
| 2 — Postgres | `pg_advisory_xact_lock` |
| 3 — Go | `sync.Mutex` |

(See `../../DISCOVERIES.md`, 2026-06-06: the mechanism is non-portable; the invariant is not.)

## Notes

- **Headless, in-memory.** The point is the chain contract + the language boundary,
  not the database. `pglite` (render 2's zero-setup embedded Postgres) is JS/WASM
  only — a Go render can't use it — so a full Go render would back the atoms with
  `pgx`/Postgres or pure-Go `modernc.org/sqlite`. That storage adapter is the
  non-portable seam; the spec-derived core above is not.
- **Deterministic inputs.** Timestamps and the invitation token are pinned so the
  three languages produce a byte-identical chain to diff. Live renders use
  wall-clock `occurred_at` and random tokens — which is *why* two live renders'
  hashes differ while both still verify (BUILD_PLAN §6.3).
- **Go was not compiled in the build sandbox.** The proxy blocks `go.dev` and the
  Google mirrors and there's no root for `apt`, so the in-sandbox verification ran
  through the Python twin + `verify.mjs` (the committed golden). The Go is written
  to mirror the twin line-for-line; compile it on your machine.

## Port report — what ported mechanically vs. needed language idiom

The signal a generator/projector needs. **Ported mechanically** (structure
identical, only syntax differs): the canonicalize algorithm, the hashed-event field
set, `appendEvent` (tail read → `MAX(id)+1` → hash → append), `verifyChain`, and the
composition's "atom writes + audit event in one locked transaction" shape.

**Needed language idiom — and what the canonical-JSON spec must pin for *any*
target language:**

1. **No HTML escaping.** Go's `encoding/json` escapes `<`, `>`, `&` by default;
   JS `JSON.stringify` and Python `json.dumps` do not. Go needed `SetEscapeHTML(false)`.
   → The canonical-JSON rule must state "no HTML escaping" normatively.
2. **Non-ASCII emitted raw.** JS emits raw UTF-8; Python needs `ensure_ascii=False`;
   Go (escape off) emits raw. → Pin "non-ASCII is not `\u`-escaped."
3. **Numbers are integers only.** Float formatting diverges across languages
   (`1.0` vs `1`, exponent rules); this port *panics* on non-integer numbers rather
   than hash divergent bytes. → Forbid non-integer numbers in hashed payloads, or
   pin a single float format.
4. **Key sort = code-point order.** Byte sort (Go) equals UTF-16 sort (JS) for ASCII
   keys but diverges for non-ASCII. → Pin "sort by Unicode code point."
5. **Nullable columns need pointer types in Go.** `actor_id`/`session_id`/`target_id`
   are `*int`, with a `nil`-guard (`ptrToAny`) to dodge Go's typed-nil-in-`interface`
   trap. A generator targeting Go must emit pointers + nil-guards where TS/Python use
   plain `null`.
6. **Serialization primitive is per-runtime** (`sync.Mutex` here) and **storage is the
   non-portable seam** (no `pglite` outside JS).

Items 1–4 are the high-value finding: the spec's *canonical-JSON definition* is the
real cross-language contract, and these four rules are what a non-TS target must be
told. Render 2's `lib/canonical.ts` satisfies them implicitly because JS happens to;
a generator can't rely on "happens to."

## See also

- [`../clinical-trial-portal`](../clinical-trial-portal/) — render 1 (Deno/HTMX/SQLite)
- [`../clinical-trial-portal-next`](../clinical-trial-portal-next/) — render 2 (Next.js/RSC/Postgres)
- [`../../compositions/external-onboarding.md`](../../compositions/external-onboarding.md) · [`../../atoms/event-log.md`](../../atoms/event-log.md) — the specs
- [`../../DISCOVERIES.md`](../../DISCOVERIES.md) — the re-render-as-conformance findings
