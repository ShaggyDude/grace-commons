// tests/atoms/invitations.test.ts — Atom: Invitation
// Ported from render 1 (Deno→node:test, sync→async, ctx.db→module db).
//
// Single-resolution lifecycle: Issued/Pending → Accepted | Revoked | Expired.
// The token is identity + bearer credential. markAccepted / revoke succeed only
// while the invitation is still pending; render 2 enforces this with a guarded
// UPDATE (`accepted_at IS NULL AND revoked_at IS NULL`) that throws when no row
// matches — so "already resolved" surfaces as a rejected promise.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as invitations from "../../domain/invitations.ts";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";
import type { Queryable } from "../../lib/db.ts";

async function seedIssuerAndParty(db: Queryable) {
  const issuerParty = await parties.create(db, "issuer@x.com", "Issuer");
  const issuer = await actors.create(db, issuerParty.id);
  const inviteeParty = await parties.create(db, "invitee@x.com", "Invitee");
  return { issuer, inviteeParty };
}

function futureTs(days = 7): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

test("invitations.create writes row and returns it", async () => {
  await withTestDb(async (_ctx, db) => {
    const { issuer, inviteeParty } = await seedIssuerAndParty(db);
    const inv = await invitations.create(db, {
      party_id: inviteeParty.id,
      intended_role: "study_coordinator",
      token: "tok-abc123",
      issued_by_actor_id: issuer.id,
      expires_at: futureTs(),
    });
    assert.equal(inv.party_id, inviteeParty.id);
    assert.equal(inv.token, "tok-abc123");
    assert.equal(inv.accepted_at, null);
    assert.equal(inv.revoked_at, null);
  });
});

test("invitations.getByToken finds invitation by token", async () => {
  await withTestDb(async (_ctx, db) => {
    const { issuer, inviteeParty } = await seedIssuerAndParty(db);
    await invitations.create(db, {
      party_id: inviteeParty.id,
      intended_role: "study_coordinator",
      token: "find-me",
      issued_by_actor_id: issuer.id,
      expires_at: futureTs(),
    });
    const found = await invitations.getByToken(db, "find-me");
    assert.equal(found?.party_id, inviteeParty.id);
  });
});

test("invitations.getByToken returns null for unknown token", async () => {
  await withTestDb(async (_ctx, db) => {
    assert.equal(await invitations.getByToken(db, "no-such-token"), null);
  });
});

test("invitations.listPending returns only pending invitations", async () => {
  await withTestDb(async (_ctx, db) => {
    const { issuer, inviteeParty } = await seedIssuerAndParty(db);
    const p2 = await parties.create(db, "other@x.com", "Other");
    await invitations.create(db, { party_id: inviteeParty.id, intended_role: "sc", token: "tok-1", issued_by_actor_id: issuer.id, expires_at: futureTs() });
    const inv2 = await invitations.create(db, { party_id: p2.id, intended_role: "sc", token: "tok-2", issued_by_actor_id: issuer.id, expires_at: futureTs() });
    await invitations.revoke(db, inv2.id);
    assert.equal((await invitations.listPending(db)).length, 1);
  });
});

test("invitations.markAccepted sets accepted fields", async () => {
  await withTestDb(async (_ctx, db) => {
    const { issuer, inviteeParty } = await seedIssuerAndParty(db);
    const inv = await invitations.create(db, { party_id: inviteeParty.id, intended_role: "sc", token: "tok-x", issued_by_actor_id: issuer.id, expires_at: futureTs() });
    // Create an actor for the invitee
    const acceptor = await actors.create(db, inviteeParty.id);
    await invitations.markAccepted(db, inv.id, acceptor.id);
    const row = await invitations.getById(db, inv.id);
    assert.equal(row?.accepted_by_actor_id, acceptor.id);
  });
});

test("invitations.markAccepted throws when already resolved", async () => {
  await withTestDb(async (_ctx, db) => {
    const { issuer, inviteeParty } = await seedIssuerAndParty(db);
    const inv = await invitations.create(db, { party_id: inviteeParty.id, intended_role: "sc", token: "tok-y", issued_by_actor_id: issuer.id, expires_at: futureTs() });
    await invitations.revoke(db, inv.id);
    await assert.rejects(() => invitations.markAccepted(db, inv.id, 1));
  });
});

test("invitations.revoke throws when already revoked", async () => {
  await withTestDb(async (_ctx, db) => {
    const { issuer, inviteeParty } = await seedIssuerAndParty(db);
    const inv = await invitations.create(db, { party_id: inviteeParty.id, intended_role: "sc", token: "tok-z", issued_by_actor_id: issuer.id, expires_at: futureTs() });
    await invitations.revoke(db, inv.id);
    await assert.rejects(() => invitations.revoke(db, inv.id));
  });
});
