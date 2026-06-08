// tests/atoms/grants.test.ts — Atom: Permissions (grants)
// Ported from render 1 (Deno→node:test, sync→async, ctx.db→module db).
//
// Divergence from render 1: render 2's domain/grants.ts has no `listForActor`
// (which in render 1 returned grants joined to their permission_code). The
// "list returns the actor's grant" test is adapted to `listAll` filtered to the
// grantee; the permission_code assertion is re-expressed as the grantee/scope it
// can faithfully assert on render 2's row, plus a `findActiveFor` lookup that
// confirms the grant is discoverable by its permission code — preserving the
// "the grant is listed and resolvable by code" coverage intent. Every other
// function (create / findActiveFor / revoke / getById / listAll) maps 1:1.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as grants from "../../domain/grants.ts";
import * as permissions from "../../domain/permissions.ts";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import type { Ctx, Queryable } from "../../lib/db.ts";
import { withTestDb } from "../_helpers.ts";

async function seedActors(db: Queryable) {
  const p1 = await parties.create(db, "grantor@x.com", "Grantor");
  const p2 = await parties.create(db, "grantee@x.com", "Grantee");
  const grantor = await actors.create(db, p1.id);
  const grantee = await actors.create(db, p2.id);
  return { grantor, grantee };
}

test("grants.create writes row and returns it", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const { grantor, grantee } = await seedActors(db);
    const perm = await permissions.create(db, "view_data", "View Data");
    const grant = await grants.create(db, {
      grantor_actor_id: grantor.id,
      grantee_actor_id: grantee.id,
      permission_id: perm.id,
      scope: "all",
    });
    assert.equal(grant.grantee_actor_id, grantee.id);
    assert.equal(grant.scope, "all");
    assert.equal(grant.revoked_at, null);
  });
});

test("grants.findActiveFor finds matching active grant", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const { grantor, grantee } = await seedActors(db);
    const perm = await permissions.create(db, "do_action", "Do Action");
    await grants.create(db, {
      grantor_actor_id: grantor.id,
      grantee_actor_id: grantee.id,
      permission_id: perm.id,
      scope: "own",
    });
    const found = await grants.findActiveFor(db, grantee.id, ["do_action"]);
    assert.equal(found?.scope, "own");
  });
});

test("grants.findActiveFor returns null after revocation", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const { grantor, grantee } = await seedActors(db);
    const perm = await permissions.create(db, "rev_action", "Rev Action");
    const grant = await grants.create(db, {
      grantor_actor_id: grantor.id,
      grantee_actor_id: grantee.id,
      permission_id: perm.id,
      scope: "all",
    });
    await grants.revoke(db, grant.id, "test revocation");
    assert.equal(await grants.findActiveFor(db, grantee.id, ["rev_action"]), null);
  });
});

test("grants.findActiveFor returns null for empty codes", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const { grantee } = await seedActors(db);
    assert.equal(await grants.findActiveFor(db, grantee.id, []), null);
  });
});

test("grants list surfaces the actor's grant, resolvable by permission code", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const { grantor, grantee } = await seedActors(db);
    const perm = await permissions.create(db, "list_action", "List Action");
    const grant = await grants.create(db, {
      grantor_actor_id: grantor.id,
      grantee_actor_id: grantee.id,
      permission_id: perm.id,
      scope: "all",
    });
    // render 2 has no listForActor — filter listAll to the grantee instead.
    const list = (await grants.listAll(db)).filter(
      (g) => g.grantee_actor_id === grantee.id,
    );
    assert.equal(list.length, 1);
    assert.equal(list[0].id, grant.id);
    assert.equal(list[0].permission_id, perm.id);
    // The permission_code intent: the grant is discoverable by the permission's code.
    const byCode = await grants.findActiveFor(db, grantee.id, ["list_action"]);
    assert.ok(byCode != null);
  });
});

test("grants.listAll returns all grants", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const { grantor, grantee } = await seedActors(db);
    const p1 = await permissions.create(db, "code_a", "A");
    const p2 = await permissions.create(db, "code_b", "B");
    await grants.create(db, { grantor_actor_id: grantor.id, grantee_actor_id: grantee.id, permission_id: p1.id, scope: "all" });
    await grants.create(db, { grantor_actor_id: grantor.id, grantee_actor_id: grantee.id, permission_id: p2.id, scope: "own" });
    assert.equal((await grants.listAll(db)).length, 2);
  });
});

test("grants.revoke sets revoke_reason", async () => {
  await withTestDb(async (_ctx: Ctx, db) => {
    const { grantor, grantee } = await seedActors(db);
    const perm = await permissions.create(db, "rsn_action", "Rsn");
    const grant = await grants.create(db, { grantor_actor_id: grantor.id, grantee_actor_id: grantee.id, permission_id: perm.id, scope: "all" });
    await grants.revoke(db, grant.id, "role change");
    const row = await grants.getById(db, grant.id);
    assert.equal(row?.revoke_reason, "role change");
  });
});
