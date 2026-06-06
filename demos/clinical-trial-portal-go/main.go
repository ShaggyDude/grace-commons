package main

import (
	"fmt"
	"os"
)

// main runs a fixed, deterministic slice of the clinical-trial-portal lifecycle
// and emits the resulting audit hash chain as JSONL on stdout.
//
// Inputs are PINNED (timestamps, token) so the Go, Python (twin.py), and JS
// renders produce a BYTE-IDENTICAL chain that can be diffed. Real renders use
// wall-clock occurred_at and random tokens — which is exactly why two live
// renders' hashes differ while both still verify (BUILD_PLAN §6.3); here we fix
// them on purpose to demonstrate byte-identity across three languages.
func main() {
	pi := 1   // PI actor id (Anya), seeded
	sess := 1 // PI session id

	// 1) genesis — study.registered, anonymous (actor/session null), backdated.
	withTx(func() {
		studyID := 1
		appendEventLocked(appendInput{
			action: "study.registered", targetKind: strPtr("study"), targetID: &studyID,
			payload: map[string]any{
				"protocol_number": "BCN-OX-201",
				"note":            "Protocol BCN-OX-201 registered in trial management system.",
			},
			occurredAt: "2018-06-06T00:00:00.000Z",
		})
	})

	// 2) login.succeeded — PI, empty payload (matches composition.login).
	withTx(func() {
		appendEventLocked(appendInput{
			action: "login.succeeded", targetKind: strPtr("actor"), targetID: &pi,
			payload:    map[string]any{},
			occurredAt: "2026-06-06T12:00:00.000Z",
			actorID:    &pi, sessionID: &sess,
		})
	})

	// 3) issueInvitation — the C16 composition vertical (party + invitation + event).
	issueInvitation(&pi, &sess,
		"maya@beacon.clinical", "Maya Chen", "coordinator",
		"demo-fixed-token-0001",
		"2026-06-13T12:00:05.000Z", // expires_at
		"2026-06-06T12:00:05.000Z", // occurred_at
		"2026-06-06T12:00:05.000Z", // created_at for party/invitation
	)

	// Emit the chain as JSONL — one canonical (sorted-key, no-whitespace) object
	// per line, so the output is byte-identical to twin.py / the JS render.
	for _, row := range chain {
		fmt.Println(canonicalize(rowToMap(row)))
	}

	// Self-verify and report on stderr (stdout stays pure JSONL).
	ok, at, count := verifyChain()
	if ok {
		fmt.Fprintf(os.Stderr, "✓ Go render: chain intact, %d events (self-verify)\n", count)
	} else {
		fmt.Fprintf(os.Stderr, "✗ Go render: chain broken at #%d\n", at)
		os.Exit(1)
	}
}
