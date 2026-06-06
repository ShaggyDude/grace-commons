// lib/session.ts — opaque session-cookie helpers (render layer).
//
// The session token itself is the DB-backed opaque string (domain/sessions.ts is
// the source of truth — BUILD_PLAN Decision 5); this module is only the cookie
// transport for it. Reading is allowed anywhere; setting/clearing a cookie is
// only allowed inside a Server Action or Route Handler (Next constraint), which
// is exactly where login/acceptInvitation/logout live.
import { cookies } from "next/headers";

/** Cookie name for the opaque DB-backed session token (.env.example: SESSION_COOKIE). */
export const SESSION_COOKIE = process.env.SESSION_COOKIE ?? "beacon_session";

/** Read the session token from the request cookies (null if absent). */
export async function readSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** Set the HttpOnly session cookie. Server Action / Route Handler only. */
export async function writeSessionCookie(token: string, expires_at: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expires_at),
    secure: process.env.NODE_ENV === "production",
  });
}

/** Clear the session cookie (logout / stale cookie). Server Action / Route Handler only. */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
