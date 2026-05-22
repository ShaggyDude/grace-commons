// tests/tamper.test.ts
//
// Tamper-detection test: mutate payload_json and verify /audit/verify flags the row
//
// Demonstrates the tamper-evidence property: given an append-only event_log and the
// canonical hash construction, any single-row mutation to payload_json causes verifyChain
// to detect divergence in O(N) steps with no false negatives.
//
// TODO: Phase 2 — Implement:
//   - Issue an invitation (writes one event)
//   - Directly mutate payload_json of event #2 in SQL (simulating attacker with DB write access)
//   - Assert verifyChain flags row 2 as the divergence point with expected/found hashes
