"use client";
// components/InviteForm.tsx — the "Invite someone" form + the live invite-result
// card (the 'use client' island called out in BUILD_PLAN §7.5). Works without JS:
// the plain POST issues the invitation and the page re-renders; the in-place
// result card is the progressive enhancement.
import { useActionState } from "react";
import { issueInvitation, type InviteState } from "@/app/people/actions.ts";
import { InviteResultCard } from "./InviteResultCard.tsx";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(issueInvitation, {});

  return (
    <>
      {state.inviteLink && <InviteResultCard email={state.email} link={state.inviteLink} />}
      {state.error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {state.error}
        </p>
      )}

      <form action={action} className="raised rounded flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="new@example.com"
            className="border rounded px-3 py-1.5 text-sm w-52"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Display name</label>
          <input
            name="display_name"
            type="text"
            required
            placeholder="Jane Smith"
            className="border rounded px-3 py-1.5 text-sm w-40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Role</label>
          <input
            name="intended_role"
            type="text"
            required
            placeholder="coordinator"
            className="border rounded px-3 py-1.5 text-sm w-32"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inks-gray-900 px-4 py-1.5 rounded text-sm disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send invitation"}
        </button>
      </form>
    </>
  );
}
