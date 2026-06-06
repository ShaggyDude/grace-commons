"use client";
// components/AcceptForm.tsx — set-password form for invitation acceptance.
// 'use client' only for the inline error via useActionState; works without JS.
// The token rides in a hidden input so the plain POST carries it.
import { useActionState } from "react";
import { acceptInvitation, type AcceptState } from "@/app/invitations/accept/[token]/actions.ts";

export function AcceptForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<AcceptState, FormData>(acceptInvitation, {});

  return (
    <>
      {state.error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {state.error}
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            minLength={8}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="confirm">
            Confirm password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inks-gray-1000 w-full px-4 py-2 rounded text-sm font-medium hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Create account & log in"}
        </button>
      </form>
    </>
  );
}
