import type { FC } from "hono/jsx";
import { Layout } from "./_layout.tsx";

export const AcceptInvitationPage: FC<{
  email: string;
  intended_role: string;
  token: string;
  error?: string | null;
}> = ({ email, intended_role, token, error }) => (
  <Layout title="Set up your account">
    <div class="max-w-sm mx-auto mt-12">
      <h1 class="text-2xl font-semibold mb-2">Set up your account</h1>
      <p class="text-sm opacity-50 mb-6">
        You're joining as <strong>{intended_role}</strong> with email <strong>{email}</strong>.
        Choose a password to complete your account.
      </p>
      {error && (
        <p class="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
      <form method="POST" action={`/invitations/accept/${token}`} class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1" for="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autofocus
            minlength={8}
            class="w-full border rounded px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1" for="confirm">Confirm password</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minlength={8}
            class="w-full border rounded px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <button type="submit" class="inks-gray-1000 w-full px-4 py-2 rounded text-sm font-medium hover:opacity-80">
          Create account &amp; log in
        </button>
      </form>
    </div>
  </Layout>
);
