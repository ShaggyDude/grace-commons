// tests/e2e.test.ts
//
// End-to-end lifecycle test: invite → accept → grant → enroll → visit → audit → verify
//
// Boots the full Hono app against a fresh in-memory DB. Walks the complete user scenario:
//   1. PI logs in
//   2. PI POSTs /invitations
//   3. Capture token from response HTML
//   4. Unauthenticated GET /invitations/accept/:token
//   5. POST password → expect 302 to /dashboard with session cookie
//   6. PI grants enroll_subject on the new actor
//   7. New actor POSTs /subjects → expect subject row + subject.enrolled event
//   8. New actor POSTs /subjects/:id/visits → expect visit.recorded event
//   9. CRA logs in, GET /audit/verify → expect "Verified N events"
//
// TODO: Phase 5 — Implement
