# Grace Commons - Demo Recipes (generated 2026-05-30)

_Atoms are authoritative when declared in code; spec-derived where a demo declares none. Compositions are inferred from constituent-atom presence (a capability upper bound, not proof of wiring)._

## attributed-permissions-admin  (spec-derived (demo declares no `// Atom:` headers - add them))
- atoms (2): Actor Identity, Permissions
- compositions present (inferred): Attributed Permissions Admin
- explicitly NOT present: Defensible Retention, Multi-Party Approval, Privileged Access Provisioning
- warnings: none

## clinical-trial-portal  (code-declared)
- atoms (9): Actor Identity, Credential, Invitation, Party Identity, Permissions, Retention Window, Session, Tamper Evidence, Event Log
- compositions present (inferred): Attributed Permissions Admin, Audit Trail, External Onboarding, Login, Session-Gated Authorization
- explicitly NOT present: Defensible Retention, Multi-Party Approval, Privileged Access Provisioning
- warnings: none

## multi-party-approval  (spec-derived (demo declares no `// Atom:` headers - add them))
- atoms (7): Actor Identity, Permissions, Retention Window, Tamper Evidence, Assignment, Event Log, Approval Step
- compositions present (inferred): Attributed Permissions Admin, Audit Trail, Multi-Party Approval
- explicitly NOT present: Defensible Retention, Privileged Access Provisioning
- warnings: none
