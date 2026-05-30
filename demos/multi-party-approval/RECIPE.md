# multi-party-approval - Composition Recipe

_Generated 2026-05-30 by `tools/recipe/generate_recipe.py`. Do not hand-edit - regenerate._

**App:** `demos/multi-party-approval`   |   **Lineage source:** spec-derived (demo declares no `// Atom:` headers - add them)

## Atoms
_(derived from the matching composition spec; the demo's code does not yet declare `// Atom:` headers, so this is what it SHOULD contain, not what it proves)_

- **Actor Identity** - `atoms/compliance/actor-identity.md` (grounded)
- **Permissions** - `atoms/compliance/permissions.md` (grounded)
- **Retention Window** - `atoms/compliance/retention-window.md` (grounded)
- **Tamper Evidence** - `atoms/compliance/tamper-evidence.md` (grounded)
- **Assignment** - `atoms/productivity/assignment.md` (grounded)
- **Event Log** - `atoms/temporal/event-log.md` (grounded)
- **Approval Step** - `atoms/workflow/approval-step.md` (grounded)

## Compositions present (inferred - all constituent atoms available)

_Capability upper bound, not proof of wiring; add `// Composition:` headers to make authoritative._

- **Attributed Permissions Admin** - `compositions/attributed-permissions-admin.md`  [actor-identity, permissions]
- **Audit Trail** - `compositions/audit-trail.md`  [actor-identity, retention-window, tamper-evidence, event-log]
- **Multi-Party Approval** - `compositions/multi-party-approval.md`  [actor-identity, permissions, retention-window, tamper-evidence, assignment, event-log, approval-step]

## Compositions NOT present (named so claims stay honest)

- **Defensible Retention** - missing atom(s): legal-hold
- **External Onboarding** - missing atom(s): credential, invitation, party-identity
- **Login** - missing atom(s): credential, session
- **Privileged Access Provisioning** - missing atom(s): capability, credential, session
- **Session-Gated Authorization** - missing atom(s): session
- **Shared Todo** - missing atom(s): personal-todo
- **Undo History** - missing atom(s): personal-todo

## Validation

- Spec-path references resolve to a library file: ALL OK
