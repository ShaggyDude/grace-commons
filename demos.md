---
title: Demos
nav_order: 5
has_toc: false
---

# Demos

> Live reference implementations. Each is real, deployed software whose behaviour is *derived from* the grounded specifications in this library — not hand-written to match them. Click any demo, then read its **RECIPE** to see the exact tree of atoms and compositions it is built from. Each RECIPE is generated from the demo's own code by [`tools/recipe/generate_recipe.py`](https://github.com/scottromack/grace-commons/blob/main/tools/recipe/generate_recipe.py), so the description of a demo cannot drift from what the code actually contains.

| Demo | What it demonstrates | Tests | Live | Built from |
|---|---|---|---|---|
| **Beacon Clinical Research Portal** | External onboarding (invitation → party → credential), login, session-gated authorization, and subject / study / visit management — over an HMAC-attested, hash-chained, tamper-evident audit trail. | 107 | [beacon-clinical.fly.dev](https://beacon-clinical.fly.dev/) | [RECIPE](https://github.com/scottromack/grace-commons/blob/main/demos/clinical-trial-portal/RECIPE.md) |
| **Multi-Party Approval** | N-approver approval chains with all-of-N / M-of-N / one-of-N quorum rules and trailing-decision semantics, an approver in-tray, and a tamper-evident audit log. | 67 | [grace-commons-mpa.fly.dev](https://grace-commons-mpa.fly.dev/) | [RECIPE](https://github.com/scottromack/grace-commons/blob/main/demos/multi-party-approval/RECIPE.md) |
| **Attributed Permissions Admin** | Attributed grant / revoke administration pairing Permissions with Actor Identity; ships a dynamic Alloy model verifying its load-bearing temporal claims. | 35 | [grace-commons-alloy.fly.dev](https://grace-commons-alloy.fly.dev/) | [RECIPE](https://github.com/scottromack/grace-commons/blob/main/demos/attributed-permissions-admin/RECIPE.md) |

Each demo runs on a minimal Deno / Hono / SQLite stack. The specification is the canonical artifact; the running code is a projection of it.

The **RECIPE** beside each demo is the authoritative answer to *"what is this built from?"* — generated from the code and validated against the library, so any claim about a demo (which atoms, which compositions) is falsifiable against its tree rather than taken on trust. None of these demos contains a capability its RECIPE does not list; a demo's RECIPE also names, explicitly, the compositions it does **not** contain.
