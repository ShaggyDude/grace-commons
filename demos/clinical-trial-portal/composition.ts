// composition.ts
//
// The ONLY mutation surface. Every function here:
//   • runs inside a transaction
//   • writes atom rows
//   • emits one or more audit events
// If any step throws, the whole transaction rolls back — atom rows AND audit
// rows alike. This invariant is enforced by tests/composition.test.ts.
//
// TODO: Phase 2 — Implement all nine composition functions:
//   - issueInvitation, acceptInvitation, revokeInvitation
//   - login, logout
//   - grantPermission, revokeGrant
//   - enrollSubject, recordVisit
