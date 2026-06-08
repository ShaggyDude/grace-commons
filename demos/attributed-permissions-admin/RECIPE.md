# attributed-permissions-admin - Composition Recipe

_Generated 2026-05-30 by `tools/recipe/generate_recipe.py`. Do not hand-edit - regenerate._

**App:** `demos/attributed-permissions-admin`   |   **Lineage source:** spec-derived (demo declares no `// Atom:` headers - add them)

## Atoms
_(derived from the matching composition spec; the demo's code does not yet declare `// Atom:` headers, so this is what it SHOULD contain, not what it proves)_

- **Actor Identity** - `atoms/actor-identity.md` (grounded)
- **Permissions** - `atoms/permissions.md` (grounded)

## Compositions present (inferred - all constituent atoms available)

_Capability upper bound, not proof of wiring; add `// Composition:` headers to make authoritative._

- **Attributed Permissions Admin** - `compositions/attributed-permissions-admin.md`  [actor-identity, permissions]

## Compositions NOT present (named so claims stay honest)

- **Audit Trail** - missing atom(s): retention-window, tamper-evidence, event-log
- **Defensible Retention** - missing atom(s): legal-hold, retention-window, tamper-evidence, event-log
- **External Onboarding** - missing atom(s): credential, invitation, party-identity, retention-window, tamper-evidence, event-log
- **Login** - missing atom(s): credential, retention-window, session, tamper-evidence, event-log
- **Multi-Party Approval** - missing atom(s): retention-window, tamper-evidence, assignment, event-log, approval-step
- **Privileged Access Provisioning** - missing atom(s): capability, credential, retention-window, session, tamper-evidence, assignment, event-log, approval-step
- **Session-Gated Authorization** - missing atom(s): session
- **Shared Todo** - missing atom(s): assignment, personal-todo

## Validation

- Spec-path references resolve to a library file: ALL OK
