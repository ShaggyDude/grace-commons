# Beacon Clinical Research — Demo Application

**Thesis:** The spec is canonical. This regulated-grade application is one *render* of structured natural-language compositions from the Grace Commons library into a concrete stack, with every seam observable to an end user.

This demo demonstrates five Grace Commons compositions in a Phase II oncology trial portal under FDA 21 CFR Part 11:

| Composition | Library | Role |
|---|---|---|
| **C16 External Onboarding** | [Grace Commons](https://grace-commons.example) | Invite coordinators by email; coordinate password setup on acceptance |
| **C14 Session-Gated Authorization** | [Grace Commons](https://grace-commons.example) | Enforce session validity and permission grants on every protected route |
| **APA — Attributed Permissions Admin** | [Grace Commons](https://grace-commons.example) | PI manages who can do what: issue and revoke grants |
| **C1 Audit Trail** | [Grace Commons](https://grace-commons.example) | Every action is audited with tamper-evident hash chain. CRA reads and verifies |
| **C13 Login** | [Grace Commons](https://grace-commons.example) | Authenticate with email + password (Argon2id) |

---

## Stack

- **Backend:** Deno + Hono + SQLite
- **Frontend:** Single-file TSX views + HTMX + Tailwind CSS
- **Password:** Argon2id via `@denosaurs/argontwo@^0.2` (RFC 9106 default)
- **Build:** `deno task` commands, Tailwind CSS as single external dependency
- **Test:** Deno test runner, in-memory SQLite per test

---

## Walkthrough

**The scenario:** Anya (PI) invites Maya (Study Coordinator) to the portal, grants her permissions, and Maya enrolls a subject and records a visit. Jordan (Clinical Research Associate / Monitor) walks the audit trail and verifies tamper evidence.

### Screenshot 1: PI invites coordinator
![Invitation](./screenshots/01_invite.png)
*Dr. Anya Okonkwo on `/people` invites a new Study Coordinator by email.*

### Screenshot 2: Coordinator sets password
![Onboarding](./screenshots/02_onboard.png)
*Invitee follows the link to `/invitations/accept/:token` and sets a password.*

### Screenshot 3: Coordinator enrolls subject
![Enrollment](./screenshots/03_enroll.png)
*Maya on `/subjects/new` enrolls subject BCN-014 into the protocol.*

### Screenshot 4: CRA verifies audit trail
![Verification](./screenshots/04_verify.png)
*Jordan on `/audit/verify` recomputes the hash chain: "Verified 47 events."*

---

## Getting Started

### Bootstrap

```bash
deno task migrate    # Create ./data/dev.db with full schema
deno task seed       # Seed PI, CRA, permissions, study (Phase 6)
deno task css        # Build Tailwind CSS to ./static/styles.css (Phase 6)
deno task start      # Boot server on 127.0.0.1:8000
```

Shorthand:
```bash
deno task all
```

### Development

```bash
deno task test       # Run all tests
deno task verify     # CLI: recompute audit hash chain
```

### Logins (seeded at Phase 6)

| Role | Email | Password |
|---|---|---|
| PI | `anya@beacon.clinical` | `demo-pi` |
| CRA | `jordan@beacon.clinical` | `demo-cra` |

---

## Architecture

### State Mutations

**The seam:** All mutations go through `composition.ts`. Every function there:
- Runs inside a transaction
- Writes one or more atom rows
- Emits one or more audit events
- Rolls back entirely if any step fails

Atom files under `domain/` are read/write helpers only—they do not emit audit events, do not start transactions, do not call each other. Cross-atom coordination lives in `composition.ts`.

### Audit Trail Design

Every state change is captured in `event_log` with:
- **Tamper evidence:** SHA-256 hash chain over canonical JSON
- **Attribution:** `actor_id` and `session_id` on every row
- **Immutability:** Append-only by code convention; no UPDATE or DELETE
- **Verification:** CLI (`deno task verify`) and web UI (`/audit/verify`)

### Permissions

Five permission codes, seeded in Phase 6:
- `invite_actor` — Issue invitations
- `grant_permission` — Manage grants on others
- `enroll_subject` — Enroll subjects
- `record_visit` — Record study visits
- `view_audit` — Read audit log (scope: `all` or `own`)

---

## Build Phases

- **Phase 0** — Scaffold: directory layout, migrations, minimal server
- **Phase 1** — Schema + atoms: read/write helpers, unit tests
- **Phase 2** — Composition + audit: transaction boundary, hash chain, CLI
- **Phase 3** — Auth + onboarding: login, accept invitation, grant management
- **Phase 4** — Regulated actions: subject enrollment, visit recording
- **Phase 5** — Audit views: filterable log, verification, CSV export
- **Phase 6** — Seeds, polish, deployment config
- **Phase 7** — Optional: SMTP, multi-study, TOTP, soft revocation

---

## Reading Guide

- **What is this?** See the thesis above and Decision #11 in the plan.
- **How does it work?** Appendix A of the plan shows the reference patterns.
- **Show me the code:** Start at `composition.ts` (mutations), then `domain/` (atoms), then `lib/db.ts` (transaction primitive).
- **Full spec:** See `grace-commons/compositions/Demo2-plan.md` in the repository root.

---

## Legal / Regulatory Notes

This demo is intended for Show HN and regulatory-systems engineers. It does not constitute production clinical research software and has not undergone FDA validation. It is a demonstration of how a spec-driven architecture can map structured natural-language compositions into a regulated system.

Part 11 compliance is a *property* demonstrated by the code, not a *certification*. The audit trail is tamper-evident; the code is observable; the seams are named.

---

*Beacon Clinical Research — Grace Commons Demo 2*
*Phase 0 scaffold ready.*
