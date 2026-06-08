# clinical-trial-portal - Composition Recipe

_Generated 2026-05-30 by `tools/recipe/generate_recipe.py`. Do not hand-edit - regenerate._

**App:** `demos/clinical-trial-portal`   |   **Lineage source:** code-declared

## Atoms

- **Actor Identity** - `atoms/actor-identity.md` (grounded) - module(s): actors
- **Credential** - `atoms/credential.md` (grounded) - module(s): credentials
- **Invitation** - `atoms/invitation.md` (grounded) - module(s): invitations
- **Party Identity** - `atoms/party-identity.md` (grounded) - module(s): parties
- **Permissions** - `atoms/permissions.md` (grounded) - module(s): grants, permissions
- **Retention Window** - `atoms/retention-window.md` (grounded) - module(s): retention_policy
- **Session** - `atoms/session.md` (grounded) - module(s): sessions
- **Tamper Evidence** - `atoms/tamper-evidence.md` (grounded) - module(s): event_log
- **Event Log** - `atoms/event-log.md` (grounded) - module(s): event_log

## App-specific entities (NOT library atoms)

- studies, subjects, visits

## Compositions present (inferred - all constituent atoms available)

_Capability upper bound, not proof of wiring; add `// Composition:` headers to make authoritative._

- **Attributed Permissions Admin** - `compositions/attributed-permissions-admin.md`  [actor-identity, permissions]
- **Audit Trail** - `compositions/audit-trail.md`  [actor-identity, retention-window, tamper-evidence, event-log]
- **External Onboarding** - `compositions/external-onboarding.md`  [actor-identity, credential, invitation, party-identity, retention-window, tamper-evidence, event-log]
- **Login** - `compositions/login.md`  [actor-identity, credential, retention-window, session, tamper-evidence, event-log]
- **Session-Gated Authorization** - `compositions/session-gated-authorization.md`  [permissions, session]

## Compositions NOT present (named so claims stay honest)

- **Defensible Retention** - missing atom(s): legal-hold
- **Multi-Party Approval** - missing atom(s): assignment, approval-step
- **Privileged Access Provisioning** - missing atom(s): capability, assignment, approval-step
- **Shared Todo** - missing atom(s): assignment, personal-todo
- **Undo History** - missing atom(s): personal-todo

## Validation

- Spec-path references resolve to a library file: ALL OK
