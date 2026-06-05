// tools/conformance/ghost/scenarios/full-lifecycle.mjs
//
// Ghost-flow scenario #1 — the Demo2 §0 lifecycle, as render-AGNOSTIC data.
// Every step is in spec vocabulary (authenticate / invite / onboard / grant /
// enrollSubject / recordVisit / revokeGrant / signOut), so the SAME scenario can
// drive render 1 and render 2 — each via its own actions adapter. "$bind.path"
// pulls values from earlier steps' results.
//
// Mirrors the coverage the validator needs: a real onboarding, three sessions,
// two operational grants, one revocation, a subject + visit, and a logout.

export const scenario = [
  { actor: "PI",   action: "authenticate", args: { email: "anya@beacon.clinical", password: "demo-pi" } },

  { actor: "PI",   action: "invite",
    args: { email: "maya@beacon.clinical", display_name: "Maya Chen", role: "study_coordinator" }, bind: "inv" },

  { actor: "Maya", action: "onboard",
    args: { token: "$inv.token", password: "maya-demo-pw" }, bind: "maya" },

  { actor: "PI",   action: "grant",
    args: { grantee: "$maya.actor_id", capability: "enroll_subject", scope: "all" }, bind: "g1" },
  { actor: "PI",   action: "grant",
    args: { grantee: "$maya.actor_id", capability: "record_visit", scope: "all" }, bind: "g2" },

  { actor: "Maya", action: "enrollSubject", args: { prefix: "BCN" }, bind: "subj" },
  { actor: "Maya", action: "recordVisit",   args: { subject: "$subj.subject_id", kind: "screening" } },

  { actor: "PI",   action: "revokeGrant",   args: { grant: "$g2.grant_id", reason: "demo: role change" } },

  { actor: "CRA",  action: "authenticate",  args: { email: "jordan@beacon.clinical", password: "demo-cra" } },
  { actor: "PI",   action: "signOut" },
];

export default scenario;
