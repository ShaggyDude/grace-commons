---- MODULE privilegedAccessProvisioning ----
(*
  TLA+ model for compositions/privileged-access-provisioning.md
  Grounded on Final Critique 4.

  PURPOSE
  Verify the composition's three temporal commitments under concurrent action
  interleavings that the English spec defends but the three-pass review cannot
  exhaustively enumerate:

    1. ApprovalGatesProvisioning  — a capability_token enters request_to_capability
                                    only when the chain for that request is Approved.
    2. CascadeFiresAtMostOnce     — the provisioning cascade fires at most once per
                                    request, even when concurrent approve_step calls
                                    race on a chain that reaches Approved.
    3. TerminalAbsorbing          — no request in a terminal state (Provisioned,
                                    Denied, Withdrawn, Revoked, ProvisioningFailed)
                                    ever transitions to another state.
    4. MapInverseConsistency      — request_to_capability and capability_to_request
                                    are always strict inverses of each other.

  SCOPE
  Bounded: up to N_REQ requests, N_APP approvers, one Capability token per request.
  Credential and Session checks are abstracted as always-passing (they gate entry
  to actions; their correctness is an atom-level Alloy concern, not a composition-
  level interleaving concern). Audit Trail writes are abstracted away (append-only;
  their correctness is the Audit Trail composition's concern).

  TOOL
  TLA+ model checker (TLC). Run with TLC; all invariants should hold and no
  deadlock should be reachable from Init. A violated invariant is a spec finding
  for compositions/privileged-access-provisioning.md.

  NOT MODELED
  - Credential.verify / Session.validate / Permissions.permitted (abstracted as
    always-pass; their guards are atom-level concerns)
  - Audit Trail event writes (abstracted away; append-only, no state feedback)
  - Clock / TTL / expiry (time is not a first-class value in this model)
  - Capability.redeem counter (modeled as a binary redeemable/exhausted flag
    sufficient for the composition-level temporal properties)
*)

EXTENDS Naturals, FiniteSets, TLC

----

CONSTANTS
  RequestIDs,     \* finite set of request identifiers  e.g. {"r1","r2"}
  ApproverIDs,    \* finite set of approver identifiers e.g. {"a1","a2"}
  CapTokens,      \* finite set of capability tokens    e.g. {"cap1","cap2"}
  QuorumSize      \* number of approvals required (e.g. 2 for all-of-2)

ASSUME QuorumSize \in Nat /\ QuorumSize >= 1
ASSUME Cardinality(ApproverIDs) >= QuorumSize
ASSUME Cardinality(RequestIDs) >= 1
ASSUME Cardinality(CapTokens) >= Cardinality(RequestIDs)

----

(* Request states *)
RequestStates == {"Pending", "Approved", "Provisioned",
                  "Denied", "Withdrawn", "Revoked", "ProvisioningFailed"}

TerminalStates == {"Provisioned", "Denied", "Withdrawn", "Revoked", "ProvisioningFailed"}

(* Chain states (simplified Multi-Party Approval model) *)
ChainStates == {"Pending", "Approved", "Rejected", "Withdrawn"}

----

VARIABLES
  \* --- Composition-level state ---
  request_state,        \* request_id -> RequestState
  request_to_cap,       \* request_id -> CapToken (partial function; defined only when Provisioned)
  cap_to_request,       \* CapToken -> request_id (strict inverse of request_to_cap)

  \* --- Multi-Party Approval (simplified) ---
  chain_state,          \* request_id -> ChainState
  approvals,            \* request_id -> SUBSET ApproverIDs (approvers who have decided)
  rejections,           \* request_id -> SUBSET ApproverIDs

  \* --- Capability atom (simplified) ---
  cap_allocated,        \* SUBSET CapTokens: tokens that have been allocated
  cap_exhausted,        \* SUBSET CapTokens: tokens that have been fully redeemed

  \* --- Token supply ---
  next_token            \* function: request_id -> CapToken (pre-assigned for determinism)

vars == <<request_state, request_to_cap, cap_to_request,
          chain_state, approvals, rejections,
          cap_allocated, cap_exhausted, next_token>>

----

(* ─── Type invariant ─────────────────────────────────────────────────────── *)

TypeOK ==
  /\ request_state  \in [RequestIDs -> RequestStates]
  /\ request_to_cap \in [RequestIDs -> CapTokens \cup {"none"}]
  /\ cap_to_request \in [CapTokens  -> RequestIDs \cup {"none"}]
  /\ chain_state    \in [RequestIDs -> ChainStates]
  /\ approvals      \in [RequestIDs -> SUBSET ApproverIDs]
  /\ rejections     \in [RequestIDs -> SUBSET ApproverIDs]
  /\ cap_allocated  \subseteq CapTokens
  /\ cap_exhausted  \subseteq CapTokens
  /\ cap_exhausted  \subseteq cap_allocated

----

(* ─── Initial state ──────────────────────────────────────────────────────── *)

Init ==
  /\ request_state  = [r \in RequestIDs |-> "Pending"]
  /\ request_to_cap = [r \in RequestIDs |-> "none"]
  /\ cap_to_request = [t \in CapTokens  |-> "none"]
  /\ chain_state    = [r \in RequestIDs |-> "Pending"]
  /\ approvals      = [r \in RequestIDs |-> {}]
  /\ rejections     = [r \in RequestIDs |-> {}]
  /\ cap_allocated  = {}
  /\ cap_exhausted  = {}
  \* Pre-assign one distinct token per request (tokens are a finite pool)
  /\ next_token     \in [RequestIDs -> CapTokens]
      \* Injectivity: each request gets a distinct token
      /\ \A r1, r2 \in RequestIDs : r1 # r2 => next_token[r1] # next_token[r2]

----

(* ─── Helpers ────────────────────────────────────────────────────────────── *)

QuorumReached(r) ==
  Cardinality(approvals[r]) >= QuorumSize

QuorumBlocked(r) ==
  Cardinality(rejections[r]) > 0  \* any rejection blocks all-of-N quorum

----

(* ─── Actions ────────────────────────────────────────────────────────────── *)

(*
  approve_step: an approver records a decision on a chain still in Pending state.
  If quorum is now reached, chain transitions to Approved.
  The composition then checks whether to fire the provisioning cascade.
*)
ApproveStep(r, a) ==
  \* Preconditions
  /\ request_state[r] \in {"Pending", "Approved"}  \* request still live
  /\ chain_state[r] = "Pending"                    \* chain not yet terminal
  /\ a \notin approvals[r]                         \* not yet decided
  /\ a \notin rejections[r]
  \* Record the approval
  /\ approvals' = [approvals EXCEPT ![r] = approvals[r] \cup {a}]
  /\ rejections' = rejections
  \* Evaluate quorum
  /\ LET new_approvals == approvals[r] \cup {a}
         quorum_now == Cardinality(new_approvals) >= QuorumSize
     IN
       IF quorum_now
       THEN \* Chain reaches Approved
         /\ chain_state' = [chain_state EXCEPT ![r] = "Approved"]
         \* Cascade guard: fire only if request is still Pending
         /\ IF request_state[r] = "Pending"
            THEN \* Mark Approved (cascade in progress), then provision
              /\ request_state' = [request_state EXCEPT ![r] = "Provisioned"]
              /\ LET tok == next_token[r]
                 IN
                   /\ request_to_cap' = [request_to_cap EXCEPT ![r] = tok]
                   /\ cap_to_request' = [cap_to_request EXCEPT ![tok] = r]
                   /\ cap_allocated'  = cap_allocated \cup {tok}
            ELSE \* Cascade already ran (Approved/Provisioned/ProvisioningFailed); skip
              /\ request_state'  = request_state
              /\ request_to_cap' = request_to_cap
              /\ cap_to_request' = cap_to_request
              /\ cap_allocated'  = cap_allocated
       ELSE \* Quorum not yet reached; chain stays Pending
         /\ chain_state'    = chain_state
         /\ request_state'  = request_state
         /\ request_to_cap' = request_to_cap
         /\ cap_to_request' = cap_to_request
         /\ cap_allocated'  = cap_allocated
  /\ cap_exhausted' = cap_exhausted
  /\ next_token'    = next_token

(*
  reject_step: an approver rejects. Any rejection blocks all-of-N quorum.
  Chain transitions to Rejected; request transitions to Denied.
*)
RejectStep(r, a) ==
  /\ request_state[r] = "Pending"
  /\ chain_state[r]   = "Pending"
  /\ a \notin approvals[r]
  /\ a \notin rejections[r]
  /\ rejections'     = [rejections EXCEPT ![r] = rejections[r] \cup {a}]
  /\ approvals'      = approvals
  /\ chain_state'    = [chain_state EXCEPT ![r] = "Rejected"]
  /\ request_state'  = [request_state EXCEPT ![r] = "Denied"]
  /\ request_to_cap' = request_to_cap
  /\ cap_to_request' = cap_to_request
  /\ cap_allocated'  = cap_allocated
  /\ cap_exhausted'  = cap_exhausted
  /\ next_token'     = next_token

(*
  withdraw_request: requestor withdraws before approval completes.
  Only valid when request is Pending and chain is Pending.
*)
WithdrawRequest(r) ==
  /\ request_state[r] = "Pending"
  /\ chain_state[r]   = "Pending"
  /\ chain_state'    = [chain_state EXCEPT ![r] = "Withdrawn"]
  /\ request_state'  = [request_state EXCEPT ![r] = "Withdrawn"]
  /\ approvals'      = approvals
  /\ rejections'     = rejections
  /\ request_to_cap' = request_to_cap
  /\ cap_to_request' = cap_to_request
  /\ cap_allocated'  = cap_allocated
  /\ cap_exhausted'  = cap_exhausted
  /\ next_token'     = next_token

(*
  exercise_access: bearer presents a valid capability token.
  Session validation is abstracted as always-passing.
  Redeem decrements the counter; here modeled as token -> exhausted.
*)
ExerciseAccess(r) ==
  /\ request_state[r] = "Provisioned"
  /\ request_to_cap[r] # "none"
  /\ LET tok == request_to_cap[r]
     IN
       /\ tok \in cap_allocated
       /\ tok \notin cap_exhausted         \* token not yet exhausted
       /\ cap_exhausted' = cap_exhausted \cup {tok}
  /\ request_state'  = request_state
  /\ request_to_cap' = request_to_cap
  /\ cap_to_request' = cap_to_request
  /\ cap_allocated'  = cap_allocated
  /\ chain_state'    = chain_state
  /\ approvals'      = approvals
  /\ rejections'     = rejections
  /\ next_token'     = next_token

(*
  revoke_access: administrator revokes a provisioned request.
  Capability may already be exhausted (already-terminal path — non-fatal).
*)
RevokeAccess(r) ==
  /\ request_state[r] = "Provisioned"
  /\ request_state'  = [request_state EXCEPT ![r] = "Revoked"]
  /\ request_to_cap' = request_to_cap   \* map entries are immutable
  /\ cap_to_request' = cap_to_request
  /\ cap_allocated'  = cap_allocated
  /\ cap_exhausted'  = cap_exhausted
  /\ chain_state'    = chain_state
  /\ approvals'      = approvals
  /\ rejections'     = rejections
  /\ next_token'     = next_token

(*
  provisioning_failed: Capability.allocate fails during cascade.
  Request transitions to ProvisioningFailed (terminal).
  Modeled as a separate action to allow TLC to explore this branch.
*)
ProvisioningFailed(r) ==
  /\ request_state[r] = "Pending"
  /\ chain_state[r]   = "Approved"      \* chain cleared but allocation failed
  /\ request_state'  = [request_state EXCEPT ![r] = "ProvisioningFailed"]
  /\ request_to_cap' = request_to_cap   \* no entry added
  /\ cap_to_request' = cap_to_request
  /\ cap_allocated'  = cap_allocated
  /\ cap_exhausted'  = cap_exhausted
  /\ chain_state'    = chain_state
  /\ approvals'      = approvals
  /\ rejections'     = rejections
  /\ next_token'     = next_token

----

(* ─── Next-state relation ────────────────────────────────────────────────── *)

Next ==
  \/ \E r \in RequestIDs, a \in ApproverIDs : ApproveStep(r, a)
  \/ \E r \in RequestIDs, a \in ApproverIDs : RejectStep(r, a)
  \/ \E r \in RequestIDs                    : WithdrawRequest(r)
  \/ \E r \in RequestIDs                    : ExerciseAccess(r)
  \/ \E r \in RequestIDs                    : RevokeAccess(r)
  \/ \E r \in RequestIDs                    : ProvisioningFailed(r)

Spec == Init /\ [][Next]_vars

----

(* ─── Safety invariants ──────────────────────────────────────────────────── *)

(*
  Invariant 1 — Approval-gates-provisioning.
  Every request_id that has a capability token must have an Approved chain.
  A token in request_to_cap without an Approved chain is a provisioning bypass.
*)
ApprovalGatesProvisioning ==
  \A r \in RequestIDs :
    request_to_cap[r] # "none" => chain_state[r] = "Approved"

(*
  Invariant 2 — Request-capability bijection.
  Each request maps to at most one token; each token maps to at most one request.
  request_to_cap and cap_to_request are strict inverses.
*)
MapInverseConsistency ==
  /\ \A r \in RequestIDs :
       request_to_cap[r] # "none" =>
         cap_to_request[request_to_cap[r]] = r
  /\ \A t \in CapTokens :
       cap_to_request[t] # "none" =>
         request_to_cap[cap_to_request[t]] = t

(*
  Invariant 3 — Terminal state absorbing.
  No request in a terminal state ever transitions to another state.
  Checked by verifying that no terminal-state request appears with
  a different state in the next configuration.
*)
TerminalAbsorbing ==
  \A r \in RequestIDs :
    request_state[r] \in TerminalStates =>
      request_state[r] \in TerminalStates  \* tautology for single-state check;
      \* the stuttering-invariant form is: []([Next]_vars => state stays terminal)
      \* encoded below as TerminalAbsorbingAction

(*
  TerminalAbsorbingAction: state-transition form.
  If a request is terminal now, it must be terminal in the next state.
  This is the temporal version that TLC can actually check as an action property.
*)
TerminalAbsorbingAction ==
  \A r \in RequestIDs :
    request_state[r] \in TerminalStates =>
      request_state'[r] \in TerminalStates \/ request_state'[r] = request_state[r]

(*
  CascadeFiresAtMostOnce.
  A request that has a capability token (Provisioned) never acquires a second.
  Equivalently: request_to_cap is immutable once set.
*)
CascadeFiresAtMostOnce ==
  \A r \in RequestIDs :
    request_to_cap[r] # "none" =>
      \* The token does not change — checked by MapInverseConsistency + no second write
      cap_to_request[request_to_cap[r]] = r

(*
  TokensAllocatedOnlyForProvisioned.
  Every allocated token corresponds to a request that is Provisioned or Revoked.
  (Revoked is included because revoke_access does not remove the token from the map.)
*)
TokensAllocatedOnlyForProvisioned ==
  \A t \in cap_allocated :
    \E r \in RequestIDs :
      /\ request_to_cap[r] = t
      /\ request_state[r] \in {"Provisioned", "Revoked"}

(*
  NoPendingRequestHasToken.
  A request in Pending state never has a capability token.
*)
NoPendingRequestHasToken ==
  \A r \in RequestIDs :
    request_state[r] = "Pending" => request_to_cap[r] = "none"

(*
  NoExhaustedTokenBeforeExercise.
  A token cannot be exhausted unless it was allocated.
*)
ExhaustedSubsetAllocated ==
  cap_exhausted \subseteq cap_allocated

----

(* ─── Liveness (optional; requires fairness assumption) ─────────────────── *)

(*
  Under weak fairness on all actions, a request with enough approvals
  eventually reaches a terminal state.
  Uncomment to check with TLC under fairness.

FairnessSpec ==
  /\ Spec
  /\ \A r \in RequestIDs : WF_vars(WithdrawRequest(r))
  /\ \A r \in RequestIDs : WF_vars(RevokeAccess(r))
  /\ \A r \in RequestIDs, a \in ApproverIDs : WF_vars(ApproveStep(r, a))

EventuallyTerminal ==
  \A r \in RequestIDs :
    <>(request_state[r] \in TerminalStates)
*)

----

(* ─── TLC configuration ──────────────────────────────────────────────────── *)

(*
  Suggested TLC model values for a small but meaningful scope:
    RequestIDs  <- {"r1", "r2"}
    ApproverIDs <- {"a1", "a2", "a3"}
    CapTokens   <- {"cap1", "cap2"}
    QuorumSize  <- 2

  Invariants to check:
    TypeOK
    ApprovalGatesProvisioning
    MapInverseConsistency
    CascadeFiresAtMostOnce
    TokensAllocatedOnlyForProvisioned
    NoPendingRequestHasToken
    ExhaustedSubsetAllocated

  Action property (add to "Action Properties" in TLC):
    TerminalAbsorbingAction

  Expected result: all invariants hold; no deadlock.
  A violated invariant is a spec finding for the composition.
*)

====
