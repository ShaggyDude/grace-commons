# Default output stack — the declared deployment baseline (draft, 2026-06-14)

> **Status: internal staging, not canonical.** A **below-the-contract deployment profile**, *not* a spec constraint. The canonical spec stays substrate-independent — the Beacon renders run the *same* spec on Deno/SQLite, Next/Postgres, **headless Go, and headless Mongo** (two with no browser at all). This file makes exactly one assumption explicit: the *default* output stack, so it is **declared rather than smuggled**. Folds into [`execution-contract.md`](../execution-contract.md) §atom-to-runtime mapping if promoted. Cross-refs: [`outbound-contract-ports.md`](./outbound-contract-ports.md) (the runtime handoffs), `pressure-testing.md` §Capability provenance (capabilities are declared, never ambient).

## The declaration

The **default output stack** — the substrate the projector targets unless told otherwise — is the **modern web platform**: the browser / PWA baseline on the client, web-standard APIs (`fetch`, etc.) server-side.

This is a *default*, not a binding. The canon names capabilities **abstractly** (durable storage, total order, network, offline-tolerance, clock); the output stack *realizes* them. Swap the stack and conformance re-checks against the same canonical contract — exactly what the Postgres / Mongo / Go renders demonstrate. So **theoretically the output stack could be anything; the web is the declared default.** Naming it *is* the point: an assumption declared is an assumption moved out of the "hidden" column — which is what the "95%-assumption-free" goal actually needs.

## Why a declaration, not a constraint

The goal is *not* served by enumerating web APIs into the spec — that would couple the canon to one platform, the coupling the headless renders exist to disprove. It is served by making the default-stack assumption **explicit and swappable**:

- the **canon** owns the *abstract capability requirement* (capability provenance — declared, injected, never ambient);
- this **profile** owns the *default realization* of those requirements;
- a behavior needing more than the baseline declares a **named extension**, it does not silently assume one.

## The baseline — abstract capability → default-stack realization

The left column is what the canon may declare it needs (substrate-independent). The middle is how the web default provides it. The right column proves it is swappable — same requirement, other realizations, all conformance-checked against the same contract.

| Abstract capability (canon-side) | Default output stack (web / PWA) | Also realizable as (swappable) |
|---|---|---|
| Durable storage | IndexedDB · Cache Storage · localStorage | Postgres · Mongo · SQLite · a file |
| Total order / single-writer | service worker · single tab | DB advisory lock · Go mutex · replica-set txn |
| Network / transport | `fetch` · WebSocket · SSE · WebRTC | HTTP · server sockets |
| Offline-tolerance | service worker + cache + IndexedDB | (server: N/A — always-on) |
| Clock / time (best-effort) | `Date` · `performance.now` | system clock |
| Compute / rendering | DOM · Canvas · WebGL/WebGPU · SVG | headless (no rendering) |
| Identity / security | secure context · Permissions · WebAuthn | server auth · mTLS · … |

## The extension boundary — NOT in the baseline

Not guaranteed by the default web/PWA stack; a behavior needing any of these must declare an explicit **extension capability** rather than assume it: native filesystem (beyond the sandbox), Bluetooth/BLE, NFC, true background daemons, OS-level notification-delivery guarantees, raw sockets, consistent GPU compute. Declaring the extension keeps the dependency visible — assuming it silently is the failure this profile exists to prevent.

## The rule (corrected from GPT's "web-baseline-only")

> Any behavior in the canonical spec must be realizable on the **declared output stack's baseline**, *or* declare its extra requirement as a named capability / extension. The output stack is swappable; the **requirement** is what the canon owns.

This is deliberately **not** "web baseline only" — that would couple the canon to the web. It is: *the requirement is abstract and declared; the default realization is the web stack; any other realization conforms through the same contract.* Capability provenance up in the canon, output-stack realization down here, conformance binding the two — the same three-layer split as everything else.
