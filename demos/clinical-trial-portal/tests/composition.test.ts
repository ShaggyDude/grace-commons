// tests/composition.test.ts
//
// Composition functions — unit tests with rollback assertions
//
// Critical invariant: if a composition function throws mid-transaction,
// both atom rows AND audit event rows must roll back (zero new rows in either).
//
// TODO: Phase 2 — Implement tests:
//   - issueInvitation: forced audit failure leaves zero atom rows
//   - acceptInvitation: forced audit failure leaves zero atom rows
//   - login: forced audit failure leaves zero rows
//   - (etc. for all nine compositions)
