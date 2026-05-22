// tests/atoms/grants.test.ts — Atom: Permissions (grants)

import { assertEquals } from "jsr:@std/assert";
import * as grants from "../../domain/grants.ts";
import * as permissions from "../../domain/permissions.ts";
import * as actors from "../../domain/actors.ts";
import * as parties from "../../domain/parties.ts";
import { withTestDb } from "../_helpers.ts";

function seedActors(ctx: { db: any }) {
  const p1 = parties.create(ctx.db, "grantor@x.com", "Grantor");
  const p2 = parties.create(ctx.db, "grantee@x.com", "Grantee");
  const grantor = actors.create(ctx.db, p1.id);
  const grantee = actors.create(ctx.db, p2.id);
  return { grantor, grantee };
}

Deno.test("grants.create writes row and returns it", () => {
  withTestDb((ctx) => {
    const { grantor, grantee } = seedActors(ctx);
    const perm = permissions.create(ctx.db, "view_data", "View Data");
    const grant = grants.create(ctx.db, {
      grantor_actor_id: grantor.id,
      grantee_actor_id: grantee.id,
      permission_id: perm.id,
      scope: "all",
    });
    assertEquals(grant.grantee_actor_id, grantee.id);
    assertEquals(grant.scope, "all");
    assertEquals(grant.revoked_at, null);
  });
});

Deno.test("grants.findActiveFor finds matching active grant", () => {
  withTestDb((ctx) => {
    const { grantor, grantee } = seedActors(ctx);
    const perm = permissions.create(ctx.db, "do_action", "Do Action");
    grants.create(ctx.db, {
      grantor_actor_id: grantor.id,
      grantee_actor_id: grantee.id,
      permission_id: perm.id,
      scope: "own",
    });
    const found = grants.findActiveFor(ctx.db, grantee.id, ["do_action"]);
    assertEquals(found?.scope, "own");
  });
});

Deno.test("grants.findActiveFor returns null after revocation", () => {
  withTestDb((ctx) => {
    const { grantor, grantee } = seedActors(ctx);
    const perm = permissions.create(ctx.db, "rev_action", "Rev Action");
    const grant = grants.create(ctx.db, {
      grantor_actor_id: grantor.id,
      grantee_actor_id: grantee.id,
      permission_id: perm.id,
      scope: "all",
    });
    grants.revoke(ctx.db, grant.id, "test revocation");
    assertEquals(grants.findActiveFor(ctx.db, grantee.id, ["rev_action"]), null);
  });
});

Deno.test("grants.findActiveFor returns null for empty codes", () => {
  withTestDb((ctx) => {
    const { grantee } = seedActors(ctx);
    assertEquals(grants.findActiveFor(ctx.db, grantee.id, []), null);
  });
});

Deno.test("grants.listForActor returns grants with permission_code", () => {
  withTestDb((ctx) => {
    const { grantor, grantee } = seedActors(ctx);
    const perm = permissions.create(ctx.db, "list_action", "List Action");
    grants.create(ctx.db, {
      grantor_actor_id: grantor.id,
      grantee_actor_id: grantee.id,
      permission_id: perm.id,
      scope: "all",
    });
    const list = grants.listForActor(ctx.db, grantee.id);
    assertEquals(list.length, 1);
    assertEquals(list[0].permission_code, "list_action");
  });
});

Deno.test("grants.listAll returns all grants", () => {
  withTestDb((ctx) => {
    const { grantor, grantee } = seedActors(ctx);
    const p1 = permissions.create(ctx.db, "code_a", "A");
    const p2 = permissions.create(ctx.db, "code_b", "B");
    grants.create(ctx.db, { grantor_actor_id: grantor.id, grantee_actor_id: grantee.id, permission_id: p1.id, scope: "all" });
    grants.create(ctx.db, { grantor_actor_id: grantor.id, grantee_actor_id: grantee.id, permission_id: p2.id, scope: "own" });
    assertEquals(grants.listAll(ctx.db).length, 2);
  });
});

Deno.test("grants.revoke sets revoke_reason", () => {
  withTestDb((ctx) => {
    const { grantor, grantee } = seedActors(ctx);
    const perm = permissions.create(ctx.db, "rsn_action", "Rsn");
    const grant = grants.create(ctx.db, { grantor_actor_id: grantor.id, grantee_actor_id: grantee.id, permission_id: perm.id, scope: "all" });
    grants.revoke(ctx.db, grant.id, "role change");
    const row = grants.getById(ctx.db, grant.id);
    assertEquals(row?.revoke_reason, "role change");
  });
});
