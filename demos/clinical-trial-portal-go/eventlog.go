package main

import "sync"

// EventRow mirrors render 1/2's event_log row. ids are *int so they can be null
// (anonymous events like the genesis), matching the nullable BIGINT columns.
type EventRow struct {
	ID          int
	OccurredAt  string
	ActorID     *int
	SessionID   *int
	Action      string
	TargetKind  *string
	TargetID    *int
	PayloadJSON string // canonicalize(payload) — a JSON string, hashed verbatim
	PrevHash    string
	ThisHash    string
}

// ── The single global hash chain + the lock that totally orders appends ───────
//
// chainMu is render 3's mechanism for the Event Log atom's operational clause
// "appends never fail for ordering or contention reasons — the underlying
// implementation must serialize them" (atoms/temporal/event-log.md, Invariant 3).
// SQLite satisfies that clause with its single-writer lock; Postgres with
// pg_advisory_xact_lock; Go with this sync.Mutex. Three renders, three mechanisms,
// one already-stated spec invariant (see DISCOVERIES 2026-06-06). The lock is held
// for the whole transaction body (atom writes + appendEvent) — withTx, below.
var (
	chainMu sync.Mutex
	chain   []EventRow
)

// withTx runs fn while holding the global audit lock — the write-path transaction
// boundary. Equivalent to render 2's withTx taking pg_advisory_xact_lock first.
func withTx(fn func()) {
	chainMu.Lock()
	defer chainMu.Unlock()
	fn()
}

type appendInput struct {
	action     string
	targetKind *string
	targetID   *int
	payload    map[string]any
	occurredAt string
	actorID    *int
	sessionID  *int
}

// hashEvent — the hashed payload shape, IDENTICAL to render 1/2's hashEvent
// (BUILD_PLAN §6.3). canonicalize sorts the keys, so field order here is
// irrelevant; the field SET and values must match exactly.
func hashEvent(e EventRow) string {
	return sha256hex(canonicalize(map[string]any{
		"id":           e.ID,
		"occurred_at":  e.OccurredAt,
		"actor_id":     ptrToAny(e.ActorID),
		"session_id":   ptrToAny(e.SessionID),
		"action":       e.Action,
		"target_kind":  strPtrToAny(e.TargetKind),
		"target_id":    ptrToAny(e.TargetID),
		"payload_json": e.PayloadJSON,
		"prev_hash":    e.PrevHash,
	}))
}

// appendEventLocked appends one event. CALLER MUST HOLD chainMu (via withTx) —
// this reproduces render 2's "appendEvent runs inside withTx, under the lock,"
// so the tail-read + MAX(id)+1 are race-free.
func appendEventLocked(in appendInput) int {
	prevHash := ""
	if len(chain) > 0 {
		prevHash = chain[len(chain)-1].ThisHash
	}
	id := len(chain) + 1 // MAX(id)+1, race-free under the held lock
	row := EventRow{
		ID:          id,
		OccurredAt:  in.occurredAt,
		ActorID:     in.actorID,
		SessionID:   in.sessionID,
		Action:      in.action,
		TargetKind:  in.targetKind,
		TargetID:    in.targetID,
		PayloadJSON: canonicalize(mapOrEmpty(in.payload)),
		PrevHash:    prevHash,
	}
	row.ThisHash = hashEvent(row)
	chain = append(chain, row)
	return id
}

// verifyChain recomputes every row's this_hash from the same shape and returns
// the first divergent id (0 if intact) plus the count.
func verifyChain() (ok bool, at int, count int) {
	for _, row := range chain {
		if hashEvent(row) != row.ThisHash {
			return false, row.ID, len(chain)
		}
	}
	return true, 0, len(chain)
}

func ptrToAny(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}
func strPtrToAny(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}
func mapOrEmpty(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}

// rowToMap renders a chain row for JSONL emit. Emitted via canonicalize (sorted
// keys, no whitespace) so the line is byte-identical across the Go, Python, and
// JS renders and can be diffed directly.
func rowToMap(e EventRow) map[string]any {
	return map[string]any{
		"id":           e.ID,
		"occurred_at":  e.OccurredAt,
		"actor_id":     ptrToAny(e.ActorID),
		"session_id":   ptrToAny(e.SessionID),
		"action":       e.Action,
		"target_kind":  strPtrToAny(e.TargetKind),
		"target_id":    ptrToAny(e.TargetID),
		"payload_json": e.PayloadJSON,
		"prev_hash":    e.PrevHash,
		"this_hash":    e.ThisHash,
	}
}
