"use server";
// app/login/actions.ts — login (C13) + logout (session.revoked) Server Actions.
//
// Both call composition.ts (the only mutation surface) and never write atoms
// directly. login emits login.failed / login.succeeded inside composition.login;
// logout emits session.revoked inside composition.logout. The session COOKIE is
// the only render-layer state these set, via lib/session.ts.
import { redirect } from "next/navigation";
import * as composition from "../../composition.ts";
import { optionalUser } from "../../auth/current.ts";
import { writeSessionCookie, clearSessionCookie } from "../../lib/session.ts";

export interface LoginState {
  error?: string;
}

/** C13 Login. Returns an inline error, or sets the cookie and redirects. */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  // Anonymous ctx — login.failed/succeeded attribution is handled inside composition.
  const result = await composition.login({ actor: null, session: null }, { email, password });
  if (!result.ok) {
    // The specific reason stays in the audit log; the user sees a generic message.
    return { error: "Invalid email or password." };
  }

  await writeSessionCookie(result.session.token, result.session.expires_at);
  redirect("/dashboard");
}

/** Sign out — revokes the session (session.revoked) and clears the cookie. */
export async function logout(): Promise<void> {
  const user = await optionalUser();
  if (user) {
    try {
      await composition.logout(user.ctx);
    } catch {
      /* best-effort: already revoked/expired */
    }
  }
  await clearSessionCookie();
  redirect("/login");
}
