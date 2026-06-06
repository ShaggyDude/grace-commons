// app/invitations/accept/[token]/page.tsx — GET /invitations/accept/:token.
// C16 External Onboarding, invite-acceptance landing. No session required.
// Validates the token (read-only) and renders the set-password form, or an
// explanatory error for an invalid / used / expired invitation.
import type { Metadata } from "next";
import { db } from "@/lib/db.ts";
import * as invitations from "@/domain/invitations.ts";
import * as parties from "@/domain/parties.ts";
import { Shell } from "@/components/Shell.tsx";
import { AcceptForm } from "@/components/AcceptForm.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your account" };

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inv = await invitations.getByToken(db, token);

  let error: string | null = null;
  let email = "—";
  let role = "—";

  if (!inv) {
    error = "This invitation link is invalid.";
  } else if (inv.accepted_at || inv.revoked_at) {
    error = "This invitation has already been used or revoked.";
    role = inv.intended_role;
  } else if (inv.expires_at <= new Date().toISOString()) {
    error = "This invitation has expired. Please ask for a new one.";
    role = inv.intended_role;
  } else {
    role = inv.intended_role;
    const party = await parties.getById(db, inv.party_id);
    email = party?.email ?? "—";
  }

  const acceptable = !error;

  return (
    <Shell displayName={null}>
      <div className="max-w-sm mx-auto mt-12">
        <h1 className="text-2xl font-semibold mb-2">Set up your account</h1>

        {acceptable ? (
          <p className="text-sm opacity-50 mb-6">
            You&apos;re joining as <strong>{role}</strong> with email <strong>{email}</strong>.
            Choose a password to complete your account.
          </p>
        ) : (
          <p className="text-sm opacity-50 mb-6">
            We couldn&apos;t open this invitation.
          </p>
        )}

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {acceptable && <AcceptForm token={token} />}

        {!acceptable && (
          <a href="/login" className="text-sm underline opacity-70 hover:opacity-100">
            ← Go to sign in
          </a>
        )}
      </div>
    </Shell>
  );
}
