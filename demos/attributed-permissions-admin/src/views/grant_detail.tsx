import type { FC } from "hono/jsx";
import type { VerifyResult } from "../domain/composition.ts";
import type { Actor } from "../domain/actor.ts";
import { Layout } from "./layout.tsx";

type Props = {
  result: VerifyResult;
  currentActor: Actor | null;
  actors: Actor[];
};

export const GrantDetail: FC<Props> = ({ result, currentActor, actors }) => {
  if (!result.ok) {
    return (
      <Layout title="Grant not found — APA Demo" currentActor={currentActor} actors={actors}>
        <p class="text-ink-gray-500">Grant {result.grant_id}: {result.reason}</p>
        <a href="/" class="text-sm underline text-ink-gray-500 mt-4 inline-block">← Grants</a>
      </Layout>
    );
  }

  const { grant, issuance_attestation, issuance_verify_result, revocation_attestation, revocation_verify_result } = result;

  return (
    <Layout title={`Grant ${grant.grant_id} — APA Demo`} currentActor={currentActor} actors={actors}>
      <a href="/" class="text-sm underline text-ink-gray-500 mb-6 inline-block">← Grants</a>

      <h1 class="text-xl font-semibold text-ink-gray-900 mb-6">Grant detail</h1>

      <div class="grid grid-cols-2 gap-8">
        {/* Grant record */}
        <section>
          <h2 class="text-sm font-medium text-ink-gray-500 uppercase tracking-wide mb-3">Grant (Permissions atom)</h2>
          <dl class="space-y-2 text-sm">
            <Row label="grant_id" value={grant.grant_id} mono />
            <Row label="subject_ref" value={grant.subject_ref} mono />
            <Row label="action_scope" value={grant.action_scope} mono />
            <Row label="status">
              <span class={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                grant.status === "active" ? "bg-green-100 text-green-800" : "bg-ink-gray-200 text-ink-gray-600"
              }`}>
                {grant.status}
              </span>
            </Row>
            <Row label="granted_at" value={grant.granted_at} />
            {grant.revoked_at && <Row label="revoked_at" value={grant.revoked_at} />}
          </dl>
        </section>

        {/* Issuance attestation */}
        <section>
          <h2 class="text-sm font-medium text-ink-gray-500 uppercase tracking-wide mb-3">
            Issuance attestation (Actor Identity atom)
          </h2>
          <dl class="space-y-2 text-sm">
            <Row label="attestation_id" value={issuance_attestation.attestation_id} mono />
            <Row label="actor_ref" value={issuance_attestation.actor_ref} mono />
            <Row label="action_ref" value={issuance_attestation.action_ref} mono />
            <Row label="attested_at" value={issuance_attestation.attested_at} />
            <Row label="verify">
              <VerifyBadge result={issuance_verify_result} />
            </Row>
          </dl>
        </section>

        {/* Revocation attestation */}
        {grant.status === "revoked" && (
          <section class="col-span-2">
            <h2 class="text-sm font-medium text-ink-gray-500 uppercase tracking-wide mb-3">
              Revocation attestation (Actor Identity atom)
            </h2>
            {revocation_attestation ? (
              <dl class="space-y-2 text-sm">
                <Row label="attestation_id" value={revocation_attestation.attestation_id} mono />
                <Row label="actor_ref" value={revocation_attestation.actor_ref} mono />
                <Row label="action_ref" value={revocation_attestation.action_ref} mono />
                <Row label="attested_at" value={revocation_attestation.attested_at} />
                <Row label="verify">
                  <VerifyBadge result={revocation_verify_result!} />
                </Row>
              </dl>
            ) : (
              <p class="text-amber-700 text-sm">No revocation attestation found — attribution-inconsistency.</p>
            )}
          </section>
        )}
      </div>

      {/* Revoke form — only for active grants */}
      {grant.status === "active" && (
        <section class="mt-10 border-t border-ink-gray-200 pt-6">
          <h2 class="text-sm font-medium text-ink-gray-500 uppercase tracking-wide mb-3">Revoke this grant</h2>
          <form method="post" action={`/grants/${grant.grant_id}/revoke`} class="flex items-end gap-3">
            <div>
              <label class="block text-xs text-ink-gray-500 mb-1">Your credential</label>
              <input
                type="password"
                name="credential"
                placeholder="credential_secret"
                class="border rounded px-3 py-1.5 text-sm font-mono w-64 focus:outline-none focus:ring-1 focus:ring-ink-gray-400"
                required
              />
            </div>
            <button
              type="submit"
              class="px-4 py-2 rounded bg-red-700 text-white text-sm hover:bg-red-800"
            >
              Revoke
            </button>
          </form>
        </section>
      )}
    </Layout>
  );
};

const Row: FC<{ label: string; value?: string; mono?: boolean; children?: unknown }> = (
  { label, value, mono, children }
) => (
  <div class="flex gap-3">
    <dt class="w-36 text-ink-gray-500 shrink-0">{label}</dt>
    <dd class={mono ? "font-mono text-xs text-ink-gray-800 break-all" : "text-ink-gray-800"}>
      {children ?? value}
    </dd>
  </div>
);

const VerifyBadge: FC<{ result: "valid" | "invalid" | "not-found" }> = ({ result }) => {
  const classes = result === "valid"
    ? "bg-green-100 text-green-800"
    : result === "invalid"
    ? "bg-red-100 text-red-800"
    : "bg-amber-100 text-amber-800";
  return (
    <span class={`inline-block px-2 py-0.5 rounded text-xs font-medium ${classes}`}>
      {result}
    </span>
  );
};
