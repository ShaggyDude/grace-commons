// lib/mailer.ts
//
// Best-effort SMTP delivery for invitation emails.
//
// Contract:
//   - sendInvitationEmail() never throws; transport errors are returned as
//     { status: "failed", error: string }.
//   - When SMTP_HOST is absent the function short-circuits to
//     { status: "skipped", reason: "smtp_not_configured" } and logs the
//     accept URL to stdout so a developer can copy it from the terminal.
//   - The caller (the route handler) decides what to show the PI based on
//     the returned DeliveryResult — no try/catch ceremony needed.
//
// Required env vars (all optional — omit to run with no email):
//   SMTP_HOST     hostname of the SMTP server
//   SMTP_PORT     default 587
//   SMTP_SECURE   "true" for TLS-from-connect (port 465), default false (STARTTLS)
//   SMTP_USER     auth username
//   SMTP_PASS     auth password
//   SMTP_FROM     From address, default "Beacon <no-reply@beacon.local>"

import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeliveryResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "smtp_not_configured" }
  | { status: "failed"; error: string };

// ---------------------------------------------------------------------------
// Config — read once at module load
// ---------------------------------------------------------------------------

const smtpHost = Deno.env.get("SMTP_HOST");
const smtpPort = parseInt(Deno.env.get("SMTP_PORT") ?? "587", 10);
const smtpSecure = Deno.env.get("SMTP_SECURE") === "true";
const smtpUser = Deno.env.get("SMTP_USER");
const smtpPass = Deno.env.get("SMTP_PASS");
const smtpFrom = Deno.env.get("SMTP_FROM") ?? "Beacon <no-reply@beacon.local>";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendInvitationEmail(params: {
  to: string;
  displayName?: string;
  acceptUrl: string;
}): Promise<DeliveryResult> {
  const { to, displayName, acceptUrl } = params;

  // ── No SMTP configured — graceful no-op ──────────────────────────────────
  if (!smtpHost) {
    console.log(
      `[mailer] SMTP not configured; invite link for ${to}: ${acceptUrl}`,
    );
    return { status: "skipped", reason: "smtp_not_configured" };
  }

  // ── Attempt delivery ─────────────────────────────────────────────────────
  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      ...(smtpUser && smtpPass
        ? { auth: { user: smtpUser, pass: smtpPass } }
        : {}),
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
    });

    const greeting = displayName ? `Hi ${displayName},` : "Hi,";

    await transporter.sendMail({
      from: smtpFrom,
      to,
      subject: "You've been invited to Beacon Clinical Research",
      text: [
        greeting,
        "",
        "You have been invited to join Beacon Clinical Research Portal.",
        "Click the link below (or paste it into your browser) to accept:",
        "",
        acceptUrl,
        "",
        "This invitation expires in 7 days.",
        "",
        "— Beacon",
      ].join("\n"),
      html: `
        <p>${greeting}</p>
        <p>You have been invited to join <strong>Beacon Clinical Research Portal</strong>.</p>
        <p>
          <a href="${acceptUrl}" style="display:inline-block;padding:10px 20px;background:#1a1a1a;color:#fff;border-radius:4px;text-decoration:none;">
            Accept invitation
          </a>
        </p>
        <p style="font-size:12px;color:#666;">
          Or copy this link: <code>${acceptUrl}</code>
        </p>
        <p style="font-size:12px;color:#666;">This invitation expires in 7 days.</p>
      `.trim(),
    });

    return { status: "sent" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[mailer] Delivery failed for ${to}:`, err);
    return { status: "failed", error };
  }
}
