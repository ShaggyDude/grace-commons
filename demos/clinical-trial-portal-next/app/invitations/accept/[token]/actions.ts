"use server";
// app/invitations/accept/[token]/actions.ts — C16 External Onboarding, onboard
// step. Calls composition.acceptInvitation (the only mutation surface), which —
// in one transaction — creates the Actor + Credential + Session, marks the
// invitation accepted, and emits invitation.accepted / actor.enrolled /
// credential.created / session.opened. On success it logs the invitee straight
// in by setting the session cookie.
import { redirect } from "next/navigation";
import * as composition from "@/composition.ts";
import { writeSessionCookie } from "@/lib/session.ts";

export interface AcceptState {
  error?: string;
}

export async function acceptInvitation(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "Missing invitation token." };
  if (!password) return { error: "Password is required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  try {
    const { session } = await composition.acceptInvitation(
      { actor: null, session: null },
      { token, password },
    );
    await writeSessionCookie(session.token, session.expires_at);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }

  // Outside the try so the NEXT_REDIRECT signal is not swallowed.
  redirect("/dashboard");
}
