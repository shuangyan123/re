# L2-C3B Reviewer Invitation and Backend Authority Gate

Status: **L2-C3B-F PASS — PROVIDER ACTIVATED AND PRIVATE STAGING VERIFIED;
PUBLIC INTAKE REMAINS CLOSED**

This gate records the narrow backend follow-up to L2-C3A, including activation
of the existing Auth0 Native operator channel for private staging. It is not a
Reviewer Portal, browser-based reviewer login, public intake launch, or
reviewer campaign authorization.

The launch boundary remains:

```text
COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED
COMMUNITY_REVIEW_PUBLIC_INTAKE=false
public reviewer intake=NOT OPEN
C3C portal shell=NOT STARTED
```

## Scope delivered

The service now carries a minimal authenticated context:

```text
{ principal: { provider, subject }, channel: "operator" | "reviewer" }
```

The channel is selected only after a configured verifier policy succeeds. It
is never read from an HTTP header, caller-supplied field, browser state, or
unverified JWT payload. The core service receives no raw token or arbitrary
claim map.

OIDC policy is explicit per channel. A configured policy validates:

- exact issuer, signature, supported algorithm, expiry, and one exact audience;
- the configured access-token profile and protected `typ` (`JWT` for the
  Auth0 profile or `at+jwt` for RFC 9068);
- the profile-specific client binding (`azp` for the Auth0 profile or
  `client_id` for RFC 9068);
- a duplicate-free, bounded `scope` containing the required route scope;
- a structurally valid duplicate-free `permissions` array when present.

`scope` is the authoritative permission representation for this service. The
`permissions` claim is not used as an alternate authorization source.

Operator authorization requires all of the following:

```text
operator channel
+ exact operator audience
+ verified operator client/profile binding
+ required operator scope
+ existing provider/subject allowlist
```

Reviewer authorization requires the reviewer channel and the existing private
principal-to-mapping lookup. A reviewer token for the same subject as an
allowlisted operator is rejected by every operator facade, including the
application-intake operator facade. An operator token is rejected by reviewer
operations.

## Invitation contract

The invitation authority is independently gated by:

```text
COMMUNITY_REVIEW_REVIEWER_INVITATION_STATE=DISABLED | INVITE_ONLY
COMMUNITY_REVIEW_REVIEWER_INVITATION_TTL_MS=60000..2678400000
```

The default is `DISABLED`; unknown values fail configuration. This switch is
separate from both public intake flags. `INVITED` on an application never
automatically issues an invitation.

The private routes are:

```text
POST /v1/operator/reviewer-invitations
POST /v1/operator/reviewer-invitations/:invitationId/revoke
POST /v1/reviewer/invitations/redeem
```

Issuance is operator-channel-only. A linked application, when supplied, must
be an active application whose manual decision is `INVITED`; application
contact data is not copied into the invitation. The server generates a
32-byte base64url capability, returns the raw value only in the issuance
response, and persists only `sha256:<hex-digest>`.

The invitation record contains only an opaque invitation ID, digest, optional
opaque application ID, lifecycle state, and bounded timestamps. It has no
email, subject, provider payload, URL, query parameter, or raw secret. The
audit record contains only the invitation/application IDs, lifecycle event,
and timestamp.

Lifecycle is terminal:

```text
ISSUED -> CONSUMED
       -> REVOKED
       -> EXPIRED
```

Replay and invalid credentials return a generic non-redeemable error. An
already mapped principal follows the explicit conflict policy and does not
create a second account or consume the invitation. Redemption validates the
invitation, principal uniqueness, account/mapping creation, and invitation
consumption in one persistence transaction. The in-memory repository
serializes the operation; the PostgreSQL adapter uses the existing advisory
transaction lock and fixed authority-row lock order.

Consent, qualification, assignment, submission, evidence, and public
disclosure remain separate state transitions. Redemption creates an active
account with `NOT_CONSENTED`; it does not grant review authority by itself.

## Persistence and migration

Migration `008_reviewer_invitations.sql` is additive. Migrations `001` through
`007` are unchanged. It adds:

- `reviewer_invitations`, with unique digest, application provenance,
  lifecycle checks, timestamp checks, and expiry index;
- `reviewer_invitation_audit_events`, with bounded event metadata and no
  secret-bearing columns.

Migration evidence recorded for this repository change:

| Item | Evidence |
|---|---|
| Filename | `008_reviewer_invitations.sql` |
| SHA-256 of the checked-in SQL bytes | `sha256:abe0143d5d90b33f8d414b13419cb446d508657ebbb6b6049d41eff601757b3e` |
| Source migration set | `001` through `007` unchanged |
| Expected source transition | pre-migration version `7` -> post-migration version `8` |
| Isolated PostgreSQL apply/recovery | **PASS** — disposable Neon v7 branch `c3b-recovery-v7-pre-008-20260910-1150c` replayed `008` to v8 and a second run was idempotent; v7 baseline rows and structure were preserved |
| Active staging version | **PASS** — Railway deployment `4957d7b7-6484-496e-81d6-6126c50a5cbf` at source SHA `8126484b5cba1cb9b992dced25942ff3c691e637` reported v1..v8 with the exact repository checksums |

The checksum above is the byte-level digest used by the repository migration
runner in this checkout. No rollback of an applied database schema is claimed;
the recovery procedure remains the reviewed backup/restore or forward-migration
runbook in [the deployment document](community-review-deployment.md).

The in-memory snapshot, PostgreSQL codec, transaction lock order, and
PostgreSQL persistence writer all include the new records. Lifecycle updates
cannot change the digest, application, issuance timestamps, or a terminal
state.

## Provider activation boundary

The repository supports explicit configuration for these values without
guessing provider behavior:

```text
COMMUNITY_REVIEW_OIDC_TOKEN_PROFILE=auth0|rfc9068
COMMUNITY_REVIEW_OPERATOR_OIDC_CLIENT_ID=<operator-client-id>
COMMUNITY_REVIEW_OPERATOR_OIDC_SCOPE=<operator-scope>
COMMUNITY_REVIEW_REVIEWER_OIDC_AUDIENCE=<reviewer-audience>
COMMUNITY_REVIEW_REVIEWER_OIDC_TOKEN_PROFILE=auth0|rfc9068
COMMUNITY_REVIEW_REVIEWER_OIDC_CLIENT_ID=<reviewer-client-id>
COMMUNITY_REVIEW_REVIEWER_OIDC_SCOPE=<reviewer-scope>
```

The C3B-F readback and activation used the existing operator application only:

```text
provider label                  auth0-staging
issuer                          https://dev-ng0y0til20vmxxds.us.auth0.com/
API audience                    https://staging.tutorbench.community-review
operator application type       Native
operator application client ID  6OVkgSPyDghv2euJOZGMOKmyZFCiLv78
operator grant                  Device Code enabled
API JWT profile                 Auth0
API signing algorithm           RS256
API permission                  operator:review
operator client grant           operator:review only
API RBAC toggle                 disabled; permissions claim is not authoritative
```

The actual Device Flow access token had `typ=JWT`, `alg=RS256`, the exact
issuer and single API audience, matching `azp`, and scope `operator:review`.
The deployed `/v1/operator/applications` route returned HTTP 200. The token was
used in memory only and is not recorded here. The existing operator/subject
allowlist was preserved; no subject identifier is recorded.

Railway production readback after deployment was:

```text
COMMUNITY_REVIEW_OIDC_TOKEN_PROFILE=auth0
COMMUNITY_REVIEW_OPERATOR_OIDC_CLIENT_ID=6OVkgSPyDghv2euJOZGMOKmyZFCiLv78
COMMUNITY_REVIEW_OPERATOR_OIDC_SCOPE=operator:review
COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED
COMMUNITY_REVIEW_PUBLIC_INTAKE=false
COMMUNITY_REVIEW_REVIEWER_INVITATION_STATE=<absent; effective DISABLED>
```

No reviewer SPA/client, reviewer grant, callback/origin, client secret, cookie,
real invitation, provisioning, email, or P5 activity was created. The
provider-backed operator channel is **PASS**; reviewer-channel activation
remains out of scope.

Auth0 documentation distinguishes its default access-token profile, which
uses `azp`, from the RFC 9068 profile, which uses `client_id`; it also
documents that `permissions` is emitted only under the relevant RBAC access
token setting. The implementation makes that choice explicit in configuration
instead of inferring it from a token or deployment guess. See [Auth0 access
token profiles](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles)
and [Auth0 RBAC for APIs](https://auth0.com/docs/get-started/apis/enable-role-based-access-control-for-apis).

## Validation record

Repository tests cover:

- Auth0-profile and RFC 9068 token acceptance plus wrong issuer, audience,
  `typ`, client binding, scope, duplicate claims, expiry, and signature cases;
- reviewer/operator same-subject channel separation on all facades;
- disabled invitation gate, one-time issuance, digest-only persistence,
  replay, conflict, revocation, expiry, and safe HTTP projections;
- in-memory redemption races for one invitation/principal, one invitation/
  multiple principals, and multiple invitations/one principal;
- PostgreSQL migration count/verification, schema privacy assertions, and a
  gated PostgreSQL invitation race test.

The PostgreSQL suite requires an explicitly scoped disposable test database and
is skipped when `COMMUNITY_REVIEW_POSTGRES_TESTS` is not enabled. A skipped
database suite is not PostgreSQL acceptance evidence.

The C3B-F private closure used a separate disposable Neon v8 branch
`c3b-private-e2e-v8-20260910-1238` and a child service bound only to
`127.0.0.1`. The clean run passed all of the following without retaining raw
credentials: disabled-gate and closed-intake checks; operator/reviewer channel
separation; invitation issue, redeem, replay, revoke, expiry, mapped-principal
conflict, and both PostgreSQL redemption race shapes; `INVITED` application
decision without automatic invitation, consent, qualification, assignment,
submission, or evidence changes; synthetic `.invalid` cleanup; and log/privacy
scanning. The final result was migration v8, seven issued test invitations,
zero synthetic rows after cleanup, restored baseline counts, and zero sensitive
log-pattern hits. The public Railway service remained closed throughout.

## Gate result

| Area | Result |
|---|---|
| Typed operator/reviewer channel boundary | **IMPLEMENTED** |
| Operator allowlist plus channel enforcement | **IMPLEMENTED** |
| Invitation issuance/redemption/lifecycle | **IMPLEMENTED** |
| Additive migration 008 and storage adapters | **IMPLEMENTED** |
| Real Auth0 profile/client/scope readback | **PASS — Auth0 profile, Native Device Code client, `azp`, exact API audience, and `operator:review` grant/scope verified** |
| Migration 008 isolated replay/idempotency and active v8 readback | **PASS** |
| Private staging provider-token E2E | **PASS — real operator token plus private 127.0.0.1 invitation closure** |
| Public application/reviewer intake | **CLOSED / NOT OPEN** |
| Reviewer Portal HTML/JS/Auth0 SPA/PKCE | **NOT STARTED** |

This gate must not be used to authorize C3C, real invitations, public intake,
or a real Community Review campaign.

## Related documents

- [Reviewer Portal architecture](community-review-reviewer-portal-architecture.md)
- [Community Review service](community-review-service.md)
- [Community Review deployment](community-review-deployment.md)
- [Roadmap](roadmap.md)
