// tests/atoms/invitations.test.ts — Atom: Invitation

import { assertEquals, assertThrows } from "jsr:@std/assert";
import * as invitations from "../../domain/invitations.ts";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";

function seedIssuerAndParty(ctx: { db: any }) {
  const issuerParty = parties.create(ctx.db, "issuer@x.com", "Issuer");
  const issuer = actors.create(ctx.db, issuerParty.id);
  const inviteeParty = parties.create(ctx.db, "invitee@x.com", "Invitee");
  return { issuer, inviteeParty };
}

function futureTs(days = 7): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

Deno.test("invitations.create writes row and returns it", () => {
  withTestDb((ctx) => {
    const { issuer, inviteeParty } = seedIssuerAndParty(ctx);
    const inv = invitations.create(ctx.db, {
      party_id: inviteeParty.id,
      intended_role: "study_coordinator",
      token: "tok-abc123",
      issued_by_actor_id: issuer.id,
      expires_at: futureTs(),
    });
    assertEquals(inv.party_id, inviteeParty.id);
    assertEquals(inv.token, "tok-abc123");
    assertEquals(inv.accepted_at, null);
    assertEquals(inv.revoked_at, null);
  });
});

Deno.test("invitations.getByToken finds invitation by token", () => {
  withTestDb((ctx) => {
    const { issuer, inviteeParty } = seedIssuerAndParty(ctx);
    invitations.create(ctx.db, {
      party_id: inviteeParty.id,
      intended_role: "study_coordinator",
      token: "find-me",
      issued_by_actor_id: issuer.id,
      expires_at: futureTs(),
    });
    const found = invitations.getByToken(ctx.db, "find-me");
    assertEquals(found?.party_id, inviteeParty.id);
  });
});

Deno.test("invitations.getByToken returns null for unknown token", () => {
  withTestDb((ctx) => {
    assertEquals(invitations.getByToken(ctx.db, "no-such-token"), null);
  });
});

Deno.test("invitations.listPending returns only pending invitations", () => {
  withTestDb((ctx) => {
    const { issuer, inviteeParty } = seedIssuerAndParty(ctx);
    const p2 = parties.create(ctx.db, "other@x.com", "Other");
    invitations.create(ctx.db, { party_id: inviteeParty.id, intended_role: "sc", token: "tok-1", issued_by_actor_id: issuer.id, expires_at: futureTs() });
    const inv2 = invitations.create(ctx.db, { party_id: p2.id, intended_role: "sc", token: "tok-2", issued_by_actor_id: issuer.id, expires_at: futureTs() });
    invitations.revoke(ctx.db, inv2.id);
    assertEquals(invitations.listPending(ctx.db).length, 1);
  });
});

Deno.test("invitations.markAccepted sets accepted fields", () => {
  withTestDb((ctx) => {
    const { issuer, inviteeParty } = seedIssuerAndParty(ctx);
    const inv = invitations.create(ctx.db, { party_id: inviteeParty.id, intended_role: "sc", token: "tok-x", issued_by_actor_id: issuer.id, expires_at: futureTs() });
    // Create an actor for the invitee
    const acceptor = actors.create(ctx.db, inviteeParty.id);
    invitations.markAccepted(ctx.db, inv.id, acceptor.id);
    const row = invitations.getById(ctx.db, inv.id);
    assertEquals(row?.accepted_by_actor_id, acceptor.id);
  });
});

Deno.test("invitations.markAccepted throws when already resolved", () => {
  withTestDb((ctx) => {
    const { issuer, inviteeParty } = seedIssuerAndParty(ctx);
    const inv = invitations.create(ctx.db, { party_id: inviteeParty.id, intended_role: "sc", token: "tok-y", issued_by_actor_id: issuer.id, expires_at: futureTs() });
    invitations.revoke(ctx.db, inv.id);
    assertThrows(() => invitations.markAccepted(ctx.db, inv.id, 1));
  });
});

Deno.test("invitations.revoke throws when already revoked", () => {
  withTestDb((ctx) => {
    const { issuer, inviteeParty } = seedIssuerAndParty(ctx);
    const inv = invitations.create(ctx.db, { party_id: inviteeParty.id, intended_role: "sc", token: "tok-z", issued_by_actor_id: issuer.id, expires_at: futureTs() });
    invitations.revoke(ctx.db, inv.id);
    assertThrows(() => invitations.revoke(ctx.db, inv.id));
  });
});
