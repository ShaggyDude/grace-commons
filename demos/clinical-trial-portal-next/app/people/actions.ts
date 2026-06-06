"use server";
// app/people/actions.ts — APA (Attributed Permissions Admin) + C16 invite, write
// side. Every action gates with the C14 helpers, then calls composition.ts (the
// only mutation surface), then revalidates /people. No atom is written here.
//
// invitation delivery: SMTP is opt-in and not wired in this render (render 1's
// default is the in-UI link); issueInvitation returns the accept link for the PI
// to copy. Logged in CORNERS.md.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import * as composition from "@/composition.ts";
import { currentCtx } from "@/auth/current.ts";
import { permit } from "@/auth/permit.ts";

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export interface InviteState {
  inviteLink?: string;
  email?: string;
  error?: string;
}

/** Issue an invitation (invitation.issued). Returns the accept link to share. */
export async function issueInvitation(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await currentCtx();
  if (!(await permit(ctx, ["invite_actor"]))) {
    return { error: "You do not have permission to invite people." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const display_name = String(formData.get("display_name") ?? "").trim();
  const intended_role = String(formData.get("intended_role") ?? "").trim();
  if (!email || !display_name || !intended_role) {
    return { error: "Email, display name, and role are all required." };
  }

  let token: string;
  try {
    const inv = await composition.issueInvitation(ctx, { email, display_name, intended_role });
    token = inv.token;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the invitation." };
  }

  revalidatePath("/people");
  return { inviteLink: `${await baseUrl()}/invitations/accept/${token}`, email };
}

/** Revoke a pending invitation (invitation.revoked). */
export async function revokeInvitation(formData: FormData): Promise<void> {
  const ctx = await currentCtx();
  if (!(await permit(ctx, ["invite_actor"]))) return;
  const invitation_id = Number(formData.get("invitation_id"));
  if (Number.isInteger(invitation_id)) {
    try {
      await composition.revokeInvitation(ctx, { invitation_id });
    } catch {
      /* already resolved */
    }
  }
  revalidatePath("/people");
}

/** Issue a grant (grant.issued). */
export async function grant(formData: FormData): Promise<void> {
  const ctx = await currentCtx();
  if (!(await permit(ctx, ["grant_permission"]))) return;
  const grantee_actor_id = Number(formData.get("grantee_actor_id"));
  const permission_id = Number(formData.get("permission_id"));
  const scope = (String(formData.get("scope") ?? "all") === "own" ? "own" : "all") as "all" | "own";
  if (Number.isInteger(grantee_actor_id) && Number.isInteger(permission_id)) {
    try {
      await composition.grantPermission(ctx, { grantee_actor_id, permission_id, scope });
    } catch {
      /* duplicate or invalid */
    }
  }
  revalidatePath("/people");
}

/** Revoke a grant (grant.revoked). */
export async function revokeGrant(formData: FormData): Promise<void> {
  const ctx = await currentCtx();
  if (!(await permit(ctx, ["grant_permission"]))) return;
  const grant_id = Number(formData.get("grant_id"));
  if (Number.isInteger(grant_id)) {
    try {
      await composition.revokeGrant(ctx, { grant_id, reason: "manually revoked by PI" });
    } catch {
      /* already revoked */
    }
  }
  revalidatePath("/people");
}
