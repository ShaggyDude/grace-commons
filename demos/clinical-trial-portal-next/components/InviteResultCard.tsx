// components/InviteResultCard.tsx — shown after an invitation is issued. Since
// SMTP is opt-in (and off by default in this render), the PI copies this accept
// link and shares it (render 1's in-UI link behaviour). Same yellow-card classes.
export function InviteResultCard({ email, link }: { email?: string; link: string }) {
  return (
    <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-sm">
      <p className="font-medium text-yellow-800 mb-1">
        Invitation created{email ? ` for ${email}` : ""} — copy and share this link with the invitee:
      </p>
      <code className="block break-all text-xs bg-white border border-yellow-200 rounded px-2 py-1.5 select-all text-yellow-900">
        {link}
      </code>
    </div>
  );
}
