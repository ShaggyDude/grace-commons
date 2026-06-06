"use client";
// components/LoginForm.tsx — the sign-in form (render 1's login form fields,
// unchanged classes). A 'use client' island only so it can show an inline error
// via useActionState; it still works without JS (the server action runs on a
// plain POST and the page re-renders with the returned state).
import { useActionState } from "react";
import { login, type LoginState } from "../app/login/actions.ts";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <>
      {state.error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border rounded px-3 py-2">
          {state.error}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="Email"
            className="border rounded px-3 py-2 text-sm focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="border rounded px-3 py-2 text-sm focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inks-gray-1000 mt-2 w-full rounded px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
