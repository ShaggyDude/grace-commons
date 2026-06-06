package main

// composition.go — the only mutation surface (this render), mirroring
// composition.ts. Each function runs its whole body inside withTx (the global
// audit lock held throughout), writes atom rows, and emits its audit event(s) in
// the same transaction. Atom stores are in-memory maps — the spike's point is the
// chain contract + the serialization mechanism, not the database (a real Go render
// would back these with pgx/Postgres or modernc.org/sqlite; pglite is JS-only).

type Party struct {
	ID          int
	Email       string
	DisplayName string
	CreatedAt   string
}

type Invitation struct {
	ID              int
	PartyID         int
	IntendedRole    string
	Token           string
	IssuedByActorID int
	IssuedAt        string
	ExpiresAt       string
}

var (
	partiesByEmail = map[string]*Party{}
	invitations    []Invitation
	partySeq       int
	invitationSeq  int
)

func getOrCreateParty(email, displayName, now string) *Party {
	if p, ok := partiesByEmail[email]; ok {
		return p
	}
	partySeq++
	p := &Party{ID: partySeq, Email: email, DisplayName: displayName, CreatedAt: now}
	partiesByEmail[email] = p
	return p
}

// issueInvitation — External Onboarding (C16), invite step. Mirrors
// composition.ts issueInvitation: create the Party if new, create the Invitation,
// emit invitation.issued — all in one transaction under the global audit lock.
func issueInvitation(actorID, sessionID *int, email, displayName, role, token, expiresAt, occurredAt, now string) {
	withTx(func() {
		party := getOrCreateParty(email, displayName, now)
		invitationSeq++
		invID := invitationSeq // capture by value — never take the address of the shared seq var
		invitations = append(invitations, Invitation{
			ID: invID, PartyID: party.ID, IntendedRole: role, Token: token,
			IssuedByActorID: deref(actorID), IssuedAt: now, ExpiresAt: expiresAt,
		})
		appendEventLocked(appendInput{
			action:     "invitation.issued",
			targetKind: strPtr("invitation"),
			targetID:   &invID,
			payload: map[string]any{
				"display_name":  displayName,
				"email":         email,
				"intended_role": role,
				"expires_at":    expiresAt,
			},
			occurredAt: occurredAt,
			actorID:    actorID,
			sessionID:  sessionID,
		})
	})
}

func strPtr(s string) *string { return &s }
func deref(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}
