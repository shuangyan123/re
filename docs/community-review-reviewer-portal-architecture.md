# Invite-only Reviewer Portal Architecture

Status: **L2-C3A — PASS; L2-C3B-F — PASS; C3C NOT STARTED**

This document is the authoritative architecture decision for the first
Reviewer Portal phase and records the narrow C3B backend-authority follow-up.
The C3B-F closure also records activation of the existing operator-only Auth0
channel for private staging. It does not create a portal, open reviewer intake,
provision a real reviewer, or change the current service's launch state.

## Decision summary

The initial private pilot will use:

1. A separate Auth0 Single Page Application (SPA) application for reviewers.
   It is a public browser client using Authorization Code Flow with PKCE
   <code>S256</code>, with no client secret.
2. An access-token API boundary, not ID-token API authorization. The browser
   will receive a reviewer-scoped API token and send it only as a Bearer
   <code>Authorization</code> header.
3. A same-public-origin portal and reviewer API, using the Railway public
   origin already used by the Community Review API for the initial pilot.
   Conceptually, the portal shell and OAuth callback live under a future
   <code>/reviewer/</code> route while <code>/v1/reviewer/*</code> remains the
   protected API. The exact static-serving mechanism is a later implementation
   decision.
4. Explicit invitation issuance and explicit invitation redemption. An
   application decision of <code>INVITED</code> remains a private application
   decision; it does not issue an invitation, create a Reviewer Account, or
   grant access.
5. Reviewer authorization only after the server resolves the authenticated
   principal to an existing private mapping. Login, invitation redemption,
   consent, qualification, and assignment remain separate state transitions.
6. A combined operator-channel target: a separate operator API audience,
   server-validated operator client/channel binding, route-level operator
   permission or scope, and the existing subject allowlist. No single JWT
   claim or separate SPA client is sufficient on its own.

The current implementation has finding **B** in the required authorization
analysis:

> **B. BROWSER TOKEN FOR OPERATOR SUBJECT COULD RETAIN OPERATOR AUTHORITY**

The finding is recorded as a later implementation prerequisite. It is not
fixed in L2-C3A.

## Current delivery boundary

The current main branch remains bounded as follows:

- L2-C2C closed application intake is complete.
- L2-C2D application perimeter hardening, L2-C2D-E external-edge
  investigation, and L2-C2D-X architecture decision are recorded, but public
  launch remains partial/blocked because the approved external application
  edge abuse control is not verified.
- Public participation application and public reviewer intake remain closed.
- L2-C3B backend channel and invitation contracts are implemented, and L2-C3B-F
  verified the existing operator Auth0 channel and private staging closure.
  Reviewer-channel provider activation remains out of scope.
- The real Community Review campaign, Reviewer Portal implementation, real
  reviewer provisioning, and P5 human calibration have not started.

The runtime flags must remain:

~~~
COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED
COMMUNITY_REVIEW_PUBLIC_INTAKE=false
~~~

C3A was documentation and architecture only. C3B adds a fail-closed backend
contract; C3B-F verifies only the private operator channel and does not
reinterpret the C2D blocker as permission to open application intake or
reviewer intake.

## Goals and non-goals

### Goals

- Define a browser identity, token, origin, and callback boundary that can be
  implemented without making the portal an operator console.
- Preserve the service's opaque Reviewer ID and private authentication mapping
  as the authority for reviewer access.
- Make invitation redemption one-time, explicit, auditable, and transactionally
  bound to the authenticated principal.
- Preserve the existing consent, qualification, packet-blindness, assignment,
  and evidence boundaries.
- Give C3B through C3F testable prerequisites rather than relying on provider
  configuration as an implicit security boundary.

### Non-goals

C3A does not:

- add portal HTML, JavaScript, React, Vite, Next.js, or an Auth0 SDK;
- add API endpoints, configuration variables, database tables, or migrations;
- create or change an Auth0 application, connection, API, grant, role, scope,
  callback, or logout configuration;
- provision reviewers, issue invitations, send email, or create real
  qualification or review data;
- change the operator Native application or Device Authorization Grant;
- change CORS, CSP, DNS, Railway, the static website, or the application
  intake state;
- implement an operator UI or make the portal a model leaderboard, tutor
  product, or public application workflow.

## Current authority boundary

The following facts were verified against the current service and its tests.
The linked documents remain the authoritative descriptions of the existing
Community Review service and application-intake contracts.

| Boundary | Current behavior | Evidence |
|---|---|---|
| OIDC verification | The OIDC adapter verifies the configured issuer, audience, signature through remote JWKS, supported algorithm, expiry/clock rules, and a string subject before returning an authenticated context. | [oidc.ts](../services/community-review-service/src/oidc.ts), [deployment.test.ts](../services/community-review-service/tests/deployment.test.ts) |
| Authentication context | The verifier reduces a credential to <code>provider + subject + server-derived channel</code>; arbitrary JWT claims and raw credentials do not cross the authentication contract. | [authentication.ts](../services/community-review-service/src/authentication.ts), [deployment.test.ts](../services/community-review-service/tests/deployment.test.ts) |
| Reviewer ownership | Reviewer operations resolve the authenticated principal through the private auth-identity mapping to an opaque <code>reviewerId</code>; caller-supplied reviewer IDs are not accepted as ownership proof. | [application.ts](../services/community-review-service/src/application.ts), [service.ts](../services/community-review-service/src/service.ts) |
| Reviewer lifecycle | A reviewer account is operator-provisioned and starts without consent. Authentication alone never creates an account. | [service.ts](../services/community-review-service/src/service.ts), [authentication.test.ts](../services/community-review-service/tests/authentication.test.ts) |
| Operator authority | Operator routes require the <code>operator</code> channel plus the existing provider/subject allowlist. OIDC activation additionally requires the configured audience, exact client binding, exact access-token profile, and required scope. | [application.ts](../services/community-review-service/src/application.ts), [oidc.ts](../services/community-review-service/src/oidc.ts) |
| Persistence | Auth identity mappings are private, unique by provider and subject, and separate from consent, qualification, assignments, submissions, and public evidence. | [persistence.ts](../services/community-review-service/src/persistence.ts), [002_auth_identity_consent.sql](../services/community-review-service/migrations/002_auth_identity_consent.sql) |
| Application intake | Application <code>INVITED</code> is an application decision only. It does not create a reviewer mapping, consent, qualification, assignment, or evidence. | [application-intake.ts](../services/community-review-service/src/application-intake.ts), [community-review-application-gate.md](community-review-application-gate.md) |
| Browser surface | The current website is a static, read-only Developer Preview. It has no login, form, service, database, or reviewer API integration. | [website/README.md](../website/README.md), [pages.yml](../.github/workflows/pages.yml) |
| CORS | The current exact-origin CORS policy belongs to the participation-application surface. Reviewer and operator routes are not a browser CORS surface. | [http.ts](../services/community-review-service/src/http.ts), [community-review-deployment.md](community-review-deployment.md) |

The service's current reviewer path is therefore:

~~~
verified principal
  -> server-derived reviewer channel
  -> private reviewer auth mapping
  -> opaque reviewerId
  -> ACTIVE account + current consent
  -> qualification / assignment / submission authority
~~~

The future portal must preserve this server-side path. It must not replace it
with an Auth0 email, Auth0 metadata, a browser-side reviewer ID, or a valid
login session.

## Critical operator-channel finding

### Finding B: current subject-only authority is not browser-channel isolation

The current OidcJwtAuthenticationAdapter returns only:

~~~
{ provider, subject }
~~~

The current configured operator authorizer checks whether that same tuple is in
the operator allowlist. The application layer uses the same authentication
adapter and operator authorizer for the protected operator routes. The current
context does not retain a verified audience, authorized-party/client
identifier, route channel, or scope for the operator decision.

Consequently, if the same configured operator subject obtains a valid token
through a future browser client and that token is accepted by the current
service audience, the current operator authorizer has no remaining information
with which to distinguish the browser-issued credential from the operator CLI
credential. The browser token could therefore satisfy operator authorization.

A separate Auth0 application or a different browser client ID does not change
that current server behavior. Auth0 client-grant configuration may reduce the
chance of issuing the wrong token, but it is not proof that the API will
enforce the channel after claims are reduced to <code>provider + subject</code>.

### Required C3B prerequisite

Before the first browser token is accepted by a Reviewer Portal implementation,
C3B must introduce a server-validated credential channel policy. The policy
must be derived from verified token properties and route policy, never from a
browser-supplied header or UI state. At minimum it must establish all of the
following:

- reviewer routes and operator routes have distinct resource/audience policy;
- the reviewer SPA has no operator API client grant or operator permission;
- operator routes require the operator channel, operator permission/scope, and
  the existing provider/subject allowlist;
- if client binding is used, the server validates the exact token dialect's
  authorized-party field (<code>azp</code> for the relevant Auth0 profile or
  <code>client_id</code> for an RFC 9068 profile) against an explicit
  operator-client policy;
- route tests prove that a reviewer-audience/browser credential for the same
  operator subject is rejected by every operator route, while the unchanged
  operator credential remains accepted.

The implementation may represent the result as a typed <code>channel</code> or
credential-profile field in the server-side authentication context. It must
not pass arbitrary claims or raw tokens into the service contract. A separate
audience, scope, or client binding alone is not enough unless the server
actually validates and applies it.

## L2-C3B backend-authority implementation status

The repository implementation closes the subject-only contract finding at the
backend boundary without creating a browser surface:

- `AuthenticationContext` is limited to `{ principal, channel }`, where the
  channel is produced only by a successful, explicitly configured verifier
  policy; HTTP headers and caller-supplied channel values are ignored.
- OIDC policies are configured independently for `operator` and `reviewer`.
  The verifier checks the exact issuer, signature, algorithm, expiry, single
  exact audience, token `typ`, profile-specific client claim (`azp` for the
  Auth0 profile or `client_id` for RFC 9068), and duplicate-free required
  `scope`. `scope` is authoritative; a present `permissions` array must still
  be structurally valid.
- Every operator facade, including the application-intake facade, rejects a
  reviewer channel before subject allowlist evaluation. A reviewer token for
  an allowlisted subject therefore cannot invoke `/v1/operator/*`, and an
  operator token cannot become reviewer authority.
- `POST /v1/operator/reviewer-invitations` is operator-only and returns the
  raw high-entropy credential only in the issuance response. Migration `008`
  stores only its SHA-256 digest and bounded lifecycle metadata. Redemption
  requires a reviewer channel and atomically binds the authenticated principal
  to a new opaque Reviewer ID while consuming the invitation.
- Invitation states are terminal after `CONSUMED`, `REVOKED`, or `EXPIRED`.
  Replay, existing-principal conflicts, expiry, revocation, and in-memory
  redemption races are covered by service tests; PostgreSQL race coverage is
  present in the gated PostgreSQL suite.

The C3B-F implementation gate is **PASS for the existing operator channel**.
The verified provider policy uses the Auth0 access-token profile, the Native
Device Code client `6OVkgSPyDghv2euJOZGMOKmyZFCiLv78`, and required scope
`operator:review`; the API audience is
`https://staging.tutorbench.community-review`, the token binding is `azp`, and
the provider signs with RS256. Railway readback and a real Device Flow
operator-route request both succeeded. The existing operator subject allowlist
remains authoritative alongside the channel/profile/client/scope checks.

Reviewer-channel provider activation remains **NOT STARTED**. No reviewer SPA,
reviewer grant, client secret, cookie, real invitation, provisioning, email, or
P5 activity was created. The exact private migration replay and loopback E2E
evidence is recorded in the [C3B reviewer invitation gate](community-review-reviewer-invitation-gate.md).

## Target operator/reviewer separation

The target relationship is:

~~~
Reviewer SPA
  -> reviewer API audience + reviewer permissions
  -> reviewer route policy
  -> private auth mapping + consent/eligibility checks

Operator Native application / CLI
  -> operator API audience + operator permissions
  -> operator channel policy + subject allowlist
  -> operator lifecycle authority
~~~

The existing operator Native Auth0 application remains the operator/CLI
boundary. It must not be converted to a SPA, disabled, or reused as the
Reviewer Portal client.

The recommended migration shape is to preserve the current configured service
audience for the operator side so that the operator CLI is not silently
reclassified, then add a distinct reviewer API audience for the browser. If
the existing audience must instead remain a shared audience, C3B must provide
an equivalent server-validated channel policy before accepting any browser
token; a new SPA client alone is not an equivalent.

### Authorization decision matrix

| Operator authorization model | Browser isolation | Complexity | Recommended |
|---|---|---|---|
| Subject-only allowlist | None. A browser token for the same operator subject can retain operator authority under the current contract. | Low | **No** |
| Subject + operator client/channel binding | Strong when the server validates the exact token profile and an explicit operator-client allowlist; does not protect against a stolen bearer token by itself. | Medium | **Required target component** |
| Subject + operator permission/scope | Good route-level defense when Auth0 RBAC and per-application client grants are configured and the API verifies the scope. Scope alone is not a channel proof. | Medium | **Required defense-in-depth** |
| Separate operator API audience | Strong resource separation, but audience alone does not identify which client obtained a token. | Medium | **Required target component** |

The target is the combination of the last three controls plus the existing
subject allowlist:

~~~
operator authorization
  = operator audience
  + verified operator client/channel
  + required operator permission/scope
  + configured provider/subject allowlist
~~~

Reviewer authorization is not obtained by adding a reviewer scope to an
operator token. The reviewer SPA receives only reviewer API access, and the
API separately requires a private reviewer mapping and the relevant service
state.

## Reviewer browser Auth0 client

The future Reviewer Portal client is a separate Auth0 application with this
target profile:

| Property | Decision |
|---|---|
| Application type | Single Page Application / public browser client |
| Flow | Authorization Code Flow with PKCE |
| PKCE method | <code>S256</code> |
| Client secret | None; no secret can be protected in browser code |
| API credential | Access token issued for the reviewer API audience |
| Operator access | No operator API client grant, operator permission, or operator audience |
| Initial refresh policy | Do not request long-lived refresh credentials for the first pilot; reauthenticate when the in-memory access token expires |
| Identity mapping | Server-side provider + subject mapping; never email-based |

The client ID is public configuration and is not a secret. The client
configuration must contain no Client Secret, embedded credential, access token,
ID token, authorization code, or PKCE verifier.

The implementation must not use Resource Owner Password Grant, implicit flow,
the existing operator Device Code client, or an embedded operator credential.
The production client must use exact HTTPS callback and logout return URIs;
wildcard and localhost callback entries are not acceptable production policy.

### Auth0 account policy

Auth0 account existence is an identity-provider fact, not a Reviewer Account.
For the pilot, prefer a dedicated reviewer connection or an equivalent
provider configuration with self-signup disabled where that policy is
available. Regardless of the provider setting, server-side invitation
redemption remains the authority:

- a user who can reach a login or signup surface still has no reviewer access
  without a valid server invitation and a successful redemption;
- Auth0 email, social profile, organization membership, and user metadata are
  not the authoritative Reviewer database;
- no email matching is used to bind an invitation to a reviewer;
- a provider-supported organization invitation mode may be evaluated later,
  but organization membership alone must not replace the server invitation and
  opaque mapping.

No Auth0 application, connection, grant, or signup setting is changed in C3A.

## API token model

The portal authenticates API calls with a verified **access token**:

~~~
Authorization: Bearer <reviewer-access-token>
~~~

The access token is intended for the Reviewer API. The ID token is for the
browser client to establish provider login/profile context, if needed; it is
not an API authorization credential and must never be sent to
<code>/v1/reviewer/*</code>.

The API verifier must validate, for the configured reviewer resource:

- exact issuer;
- exact reviewer audience;
- signature using the configured remote JWKS;
- an explicitly allowed signing algorithm;
- expiration and the library's required not-before/issued-at clock rules;
- a non-empty subject;
- the route-required reviewer permission/scope, where scopes are part of the
  C3B contract;
- the server-derived credential channel, including the exact authorized-party
  claim if client binding is selected.

The API must reject an invalid, expired, wrong-audience, wrong-issuer,
unsupported-algorithm, bad-signature, missing-subject, or insufficient-scope
token with the existing fail-closed authentication/authorization behavior.
The server may retain only the minimal typed authorization context needed for
the route policy. It must not persist or log the raw token, claims blob,
authorization code, or provider payload.

The current service has a single configured OIDC audience. That audience may be
reused for the portal only after C3B proves the operator-channel policy. The
preferred target is a distinct reviewer audience and an operator audience that
cannot satisfy one another's route policy.

## Portal topology decision

### Selected topology: same Railway public origin

The initial private invite-only pilot should use the same Railway public origin
already used by the Community Review API for the future portal and reviewer
API. The conceptual layout is:

~~~
https://<controlled-reviewer-origin>/reviewer/
    public static portal shell; no reviewer authority by reachability

https://<controlled-reviewer-origin>/reviewer/callback
    exact OAuth completion boundary, if a callback route is needed

https://<controlled-reviewer-origin>/v1/reviewer/*
    same-origin bearer API; every request is server-authorized
~~~

These are conceptual route families, not C3A implementation commitments. The
current Node service exposes health and API routes and does not yet serve a
portal shell. C3B/C3C must choose a safe static-serving or same-origin
reverse-proxy arrangement without changing the service's authority model.
“Same origin” refers to the browser-visible origin; the shell may be packaged
or served by a controlled deployment component if that preserves atomic
compatibility and rollback.

The current GitHub Pages website remains a separate read-only Developer
Preview. It is not the portal origin for this phase.

### Portal topology matrix

| Criterion | Same Railway origin | Separate static origin |
|---|---|---|
| Reviewer CORS required | No CORS expansion for same-origin <code>/v1/reviewer/*</code>. | Yes: exact HTTPS origin, explicit <code>Authorization</code>/<code>Content-Type</code> policy, strict preflight, and <code>Vary: Origin</code>. |
| Operator CORS exposure risk | No new browser CORS surface; operator routes remain non-portal routes. | Higher: a bad wildcard, reflected origin, or route-wide policy could expose operator routes; must be separately denied. |
| Auth0 callback complexity | One controlled portal origin with exact callback/logout entries. | Separate portal origin plus API origin; callback, logout, origin, and API policy must all stay synchronized. |
| Token transport | Same-origin <code>Authorization</code> bearer header; no cookies required. | Cross-origin <code>Authorization</code> bearer header, preflight, and a larger browser/network boundary. |
| Deployment coupling | Portal shell and API compatibility are coupled to the Railway release. | Shell and API can roll back independently but require version compatibility and CORS coordination. |
| CSP control | One controlled response policy can cover the shell and callback boundary. | Static host CSP and API CORS/security headers are separate policies to maintain. |
| Rollback | A single release can roll back shell and API together; deployment packaging must support that. | Independent rollback is flexible but can leave an incompatible shell calling the API. |
| Fits current API architecture | Closest to the existing same-service bearer API and avoids new authenticated CORS. Static serving is still future work. | Current Pages site is intentionally read-only; adopting it requires a new cross-origin authenticated API surface. |
| Future custom domain | Move the single controlled origin only with exact Auth0 callback/origin and API allowlist updates. | A custom portal domain remains cross-origin to the API unless the API domain also changes or a proxy is added. |
| Recommended for invite-only pilot | **Yes** | No; retain as a later option after the boundary is proven. |

The same-origin choice does not make the portal public or remove server
authorization. Anyone may fetch a static shell, but only an authenticated,
mapped, consent-eligible reviewer may perform the relevant API operation.

## Authentication and session sequence

The future browser sequence is:

~~~
invite link opened
  -> invitation secret held in bounded transient state
  -> exact Auth0 authorization request with state + PKCE S256 (+ nonce)
  -> callback state/PKCE/nonce validation
  -> access token held in memory
  -> narrow reviewer session/bootstrap request
  -> explicit invitation redemption, if not already redeemed
  -> current consent check
  -> qualification
  -> eligible assignment request
~~~

Login must not silently redeem an invitation. The portal may show a
“Redeem invitation” action after login, but the server must require an explicit
redeem request and perform the binding transaction.

### OAuth callback requirements

- Register one or more exact HTTPS redirect URIs for the production portal;
  do not use wildcard or localhost callback URIs in production.
- Generate a high-entropy <code>state</code> and bind it to the initiating
  browser transaction and exact return target. Accept no arbitrary
  <code>returnTo</code> or open redirect.
- Generate a high-entropy PKCE verifier and send only its <code>S256</code>
  challenge in the authorization request. The verifier is released only to the
  token exchange.
- Use and verify an OIDC nonce whenever an ID token is returned as part of the
  OIDC login transaction.
- Handle callback errors with a generic user-visible failure state. Do not
  log the code, token, verifier, raw provider error payload, or full callback
  URL.
- Remove <code>code</code>, <code>state</code>, and any invitation credential
  from the address bar with <code>history.replaceState</code> before
  rendering, analytics, or subsequent navigation.
- Allow logout to return only to an exact configured portal URI. Do not accept
  an arbitrary logout return URL.

The callback is an OAuth transaction boundary, not a reviewer authorization
boundary.

### Reviewer session/bootstrap

The first portal implementation should add a narrow future endpoint,
conceptually <code>GET /v1/reviewer/session</code> or
<code>GET /v1/reviewer/account</code>. It should return only a positive
allowlist of UI-safe state after the API has validated the reviewer access
token.

An enabled response may contain, for example:

~~~json
{
  "reviewerAccess": "ENABLED",
  "consent": {
    "state": "REQUIRED",
    "policyId": "community-review",
    "policyVersion": "..."
  },
  "qualification": {
    "state": "NOT_STARTED"
  },
  "assignment": {
    "requestAllowed": false
  }
}
~~~

The exact vocabulary must reuse the service's existing typed states. The
example is deliberately coarse. A reviewer ID should be omitted unless a
specific existing UI resource needs an opaque ID; no private internal ID
should be added for convenience.

For a valid token with no Reviewer Auth Identity mapping, the target response
is **NO REVIEWER ACCESS**, with a generic state such as:

> Reviewer access is not enabled for this account.

The response must contain no application record, applicant contact,
operator decision, reviewer ID, qualification material, assignment, or
evidence state. Disabled, withdrawn, or otherwise unavailable accounts should
also receive a coarse fail-closed response. The endpoint is a bootstrap
read-model only; every consent, qualification, assignment, and submission
operation rechecks authoritative state server-side.

## Invite-only provisioning architecture

### Invitation issuance is separate from application decisions

The future operator action is conceptually:

~~~
application decision INVITED
  -> separate operator action: issue reviewer invitation
  -> one-time invitation credential
  -> reviewer authenticates with the reviewer SPA
  -> reviewer explicitly redeems the credential
~~~

<code>INVITED</code> means only that the private application review decision
has that value. It does not automatically issue an invitation, provision a
reviewer, record consent, start qualification, create an assignment, or create
evidence. An operator must deliberately cross the application-to-reviewer
boundary.

The portal JavaScript must not call application decision APIs or operator
reviewer-provisioning APIs. Invitation issuance is an operator-side capability
in a later phase, not a portal capability.

### Minimal invitation record

The future persistence model should be minimal and private:

| Field/category | Requirement |
|---|---|
| Invitation identity | Opaque <code>invitationId</code>; never an email or application ID in the URL. |
| Secret | One-time random secret, at least 32 random bytes before encoding; store only a server-side digest. Return the plaintext secret only once over HTTPS. |
| Lifecycle | Issued time, expiry time, consumed time, revoked time, and a bounded state such as <code>ISSUED</code>, <code>REVOKED</code>, <code>CONSUMED</code>, or <code>EXPIRED</code>. |
| Audit | Operator action reference, reason code, request ID, and timestamps; no operator subject, secret, email, or URL in ordinary logs. |
| Provenance | Optional private link to an application decision for operator audit only. It must not enter packets, qualification material, submissions, frozen pools, or public evidence. |

The secret is a one-time credential, not a reviewer identity. The reviewer
identity remains the provider + subject mapping created by the service after
redemption. Reviewer IDs must not be derived from email, application ID,
Auth0 email, real name, social account, or application content.

### Redemption transaction and invariants

A future conceptual redeem request may be
<code>POST /v1/reviewer/invitations/redeem</code> with the invitation secret
in the request body over HTTPS. The route must require a valid reviewer-channel
access token and must not accept a secret from a caller-controlled redirect
target.

The server transaction must:

1. Lock the invitation record and verify its digest, lifecycle state, expiry,
   and revocation status.
2. Resolve the current authenticated provider + subject from the verified
   token. Do not use an email or browser-supplied identity.
3. Check the unique auth-identity mapping before creating an account.
4. Create the opaque Reviewer Account and private auth mapping with
   <code>ACTIVE</code> / <code>NOT_CONSENTED</code> initial state, if no
   mapping exists.
5. Mark the invitation consumed in the same transaction.
6. Append narrowly scoped audit events without storing the secret, raw token,
   claims, email, or invitation URL.

The transaction and database uniqueness constraints must guarantee:

~~~
one invitation
  -> at most one authenticated principal binding

one authenticated principal
  -> no unintended duplicate Reviewer Accounts
~~~

Concurrent redemption attempts for one invitation must serialize on the
invitation and produce one winner. A losing request must not create a partial
account or reveal who consumed the invitation. A provider + subject already
mapped to a different reviewer must fail closed without rebinding. A
principal already mapped to the same reviewer must not create a duplicate;
the exact idempotency response is a C3B contract choice, but it must not
consume a separate invitation unexpectedly. A consumed, expired, or revoked
invitation must not be revived.

Invitation URL handling is part of the later browser implementation:

- carry only an opaque secret, never an email or application content;
- extract it immediately and replace the URL before telemetry or external
  navigation;
- use <code>Referrer-Policy: no-referrer</code>, no third-party analytics, and
  no URL logging;
- keep the secret only in memory or a bounded, expiring transaction store
  needed to survive the OAuth redirect; clear it after success or failure;
- do not put the secret in an OAuth <code>state</code> value that is logged or
  exposed beyond the browser transaction;
- treat a forwarded or stolen link as a credential that can be used only
  once, and require the server transaction to enforce expiry, revocation, and
  binding.

## Login, consent, qualification, and assignment are separate

The portal must retain these non-equivalences:

~~~
Auth0 login success
  != Reviewer Account

Reviewer Account
  != Consent

Consent
  != Qualification

Qualification
  != Assignment

Application INVITED
  != Reviewer Account

Application approval
  != Reviewer provisioning

Agreement
  != Correctness

FROZEN
  != Human Reference
~~~

### Consent

After an invitation has been redeemed and the private mapping is resolved:

~~~
authenticated reviewer mapping
  -> current consent state checked
  -> explicit consent recorded for the current policy/version
  -> qualification may begin
~~~

Invitation redemption must create no consent event. Consent remains versioned,
append-only, explicitly recorded, and separately revocable under the existing
service authority. A stale, revoked, withdrawn, or disabled state must fail
closed.

### Qualification

The portal may later expose the existing qualification operations, but it must
preserve sealed qualification authority, attempt limits, ownership,
packet-blindness, and authoritative receipt semantics. Login and invitation
redemption are not qualification, and C3A changes no qualification policy.

### Assignment and review

An assignment may be requested only after the existing eligibility rules,
current consent, authoritative qualification receipt, active account, and
open eligible batch checks pass. The server owns assignment selection and
reviewer ownership. The portal must not expose operator batch selection,
freeze/close/agreement controls, private material roots, another reviewer's
state, or hidden evaluator material.

The portal is allowed to call reviewer-safe endpoints only, including the
existing consent and future reviewer qualification/assignment/submission
surfaces as they are made browser-safe in later phases. It must never depend
on:

- <code>/v1/operator/applications</code>;
- <code>/v1/operator/reviewers</code>;
- operator batch, close, freeze, or agreement routes; or
- application decision APIs.

## Token, session, and browser handling

The initial pilot should keep the access token in memory in the browser
application runtime. It must not persist access or refresh tokens in
<code>localStorage</code>, cookies, URL parameters, IndexedDB, analytics state,
or application logs. The first pilot should avoid a long-lived refresh token
and reauthenticate after expiry.

OAuth redirect state is a different category from API credential persistence.
The selected standards-compliant SDK may use a bounded transient store for
<code>state</code>, PKCE verifier, nonce, and a short-lived invitation
redemption transaction. If <code>sessionStorage</code> is required, it must:

- contain only the minimum transaction fields;
- be scoped to the short OAuth transaction and expire promptly;
- never contain an access token or refresh token;
- never contain a full raw invitation URL;
- be cleared after callback success, cancellation, or error.

The implementation must remove callback parameters before app rendering and
must not put bearer tokens in URLs. If a future implementation introduces a
server-side browser session or authentication cookie, it requires a separate
CSRF and cookie-boundary review; bearer-header calls are not cookie-CSRF calls.

## CORS, CSP, and browser boundary

### CORS

The current application CORS policy remains application-only. It must not be
repurposed for reviewer authentication or expanded to cover operator routes.

With the selected same-origin topology, no CORS change is required for
<code>/v1/reviewer/*</code>. If a later design chooses a separate portal
origin, it must create a separate exact reviewer-origin policy with:

- an explicit HTTPS allowlist, never <code>*</code> and never arbitrary origin
  reflection;
- <code>Authorization</code> and only the required content headers;
- strict <code>OPTIONS</code> preflight handling;
- no credentialed cross-origin cookies for the bearer-header pilot;
- <code>Vary: Origin</code> where applicable;
- no access to <code>/v1/operator/*</code> and no reuse of the
  application-origin allowlist.

Authenticated reviewer or operator routes must never return
<code>Access-Control-Allow-Origin: *</code>.

### Future CSP

The same-origin portal should ship a response CSP along these lines, with the
exact Auth0 tenant/custom-domain host substituted only during implementation:

~~~text
default-src 'self';
base-uri 'none';
object-src 'none';
frame-ancestors 'none';
form-action 'self' https://<exact-auth0-domain>;
script-src 'self';
connect-src 'self' https://<exact-auth0-domain>;
img-src 'self';
style-src 'self';
font-src 'self';
~~~

<code>frame-src</code> should be omitted unless the selected Auth0 interaction
requires it; if required, allow only the exact Auth0 host. Do not add wildcard
origins, inline scripts, third-party analytics, or arbitrary fonts/scripts. A
nonce or hash may be introduced only deliberately for a documented need. CSP
reduces the impact of some injection paths; it does not eliminate XSS risk.

Use the current security-header direction as a baseline:
<code>Cache-Control: no-store</code>, <code>X-Content-Type-Options:
nosniff</code>, and <code>Referrer-Policy: no-referrer</code>.

### XSS and untrusted review content

Access tokens in browser memory make XSS a primary portal risk. The future
portal must render reviewer packets, qualification material, and model output
as untrusted text:

- no arbitrary HTML execution;
- no raw Markdown HTML unless it is strictly sanitized under an explicit
  policy;
- no event handlers, script URLs, or unsafe link behavior derived from model
  output;
- no dynamic HTML injection where text rendering is sufficient;
- no third-party scripts or analytics in the private pilot.

The renderer is not implemented in C3A.

## Privacy and logging boundary

The portal must preserve the separation between applicant data, private auth
identity, reviewer state, and public evidence.

Reviewers must not receive application email, motivation, experience summary,
application decision notes, operator identity, another reviewer's identity, or
private auth subjects. Real names are excluded unless a separately reviewed
future requirement establishes a lawful and minimal need. Auth0 <code>sub</code>
remains private mapping material. Public/human evidence continues to use
opaque reviewer identity and the existing positive-allowlist firewall.

Safe operational logs may contain only bounded fields such as route, HTTP
status, request ID, duration, coarse auth outcome, and stable reason code.
They must never contain:

- access or ID tokens, bearer headers, authorization codes, or PKCE verifiers;
- invitation secrets or raw invitation URLs;
- Auth0 Client Secrets or raw provider payloads;
- applicant email/contact, reviewer private auth subject, or private
  qualification material;
- model packet contents or hidden evaluator material.

Authentication audit records should remain narrow and structured. A failed
authentication or authorization response must not become an oracle for
application existence, invitation ownership, or another reviewer's state.

## Threat model and authoritative enforcement

| Threat | Authoritative enforcement layer |
|---|---|
| Uninvited authenticated user | API OIDC verification followed by private auth-identity lookup; no mapping means generic <code>NO REVIEWER ACCESS</code>; no auto-provisioning. |
| Stolen browser access token | Short-lived access token, in-memory storage, no refresh credential in the first pilot, exact audience/channel/scope checks, TLS, and reauthentication on expiry. A valid stolen bearer remains a residual risk until expiry. |
| XSS token theft | Same-origin CSP, no inline/third-party scripts, safe text rendering, strict dependency review, and in-memory token lifetime. XSS is not eliminated. |
| OAuth login CSRF | Exact redirect URI, high-entropy state bound to the initiating browser transaction, and callback state validation. |
| Authorization-code interception | Authorization Code Flow with PKCE <code>S256</code>, verifier held transiently and exchanged only at the token endpoint. |
| PKCE verifier exposure | Bounded transaction storage, no logging/analytics, no URL placement, prompt cleanup, and short expiry. |
| Invitation URL forwarding or secret theft | One-time high-entropy secret, server-side digest, expiry/revocation, explicit redemption, no email binding, no raw URL logging, and no-referrer policy. |
| Invitation replay | Locked invitation lifecycle and permanent <code>CONSUMED</code> state; no revival or second binding. |
| Concurrent invitation redemption | One transaction locks the invitation; provider + subject uniqueness and atomic account/mapping/consume commit prevent duplicate bindings. |
| Confused deputy between reviewer and operator routes | Separate audiences, verified channel/client binding, route scopes/permissions, subject allowlist, and no portal dependency on operator APIs. |
| Operator subject using a browser credential | C3B server-side channel prerequisite; reviewer-audience/browser token must be rejected by every operator route even when <code>sub</code> is an operator subject. |
| CORS misconfiguration | Same-origin pilot; if cross-origin later, exact reviewer allowlist, no wildcard/reflection/credentials, strict preflight, and explicit operator-route denial. |
| Malicious model or review-packet content | Treat all content as untrusted text; safe renderer and no raw HTML/events/scripts/unsafe URLs. |
| Cross-reviewer object access | Derive reviewer identity from the verified private mapping; ignore caller IDs; enforce assignment ownership and opaque resource checks in the service. |
| Disabled or withdrawn reviewer | Authoritative account-state check on every protected operation; coarse bootstrap denial; no cached browser authority. |
| Stale or revoked consent | Current policy/version and consent-state check before qualification, assignment, or submission; revocation remains authoritative. |
| Qualification bypass | Sealed material, attempt limits, ownership, packet blindness, and authoritative receipt validators remain server-side. |
| Browser history or referrer leakage | Remove callback and invitation parameters immediately, keep secrets transient, <code>Referrer-Policy: no-referrer</code>, no third-party analytics, and no URL logging. |
| Logging or telemetry leaks | Structured allowlisted fields only; redact authorization headers, codes, tokens, secrets, claims, email, private subjects, and packet content before sinks. |

## Implementation prerequisites for later phases

C3A is complete only as an architecture decision. The following are
prerequisites, not hidden C3A implementation work.

### C3B — backend authority and invitation contract — C3B-F PASS

- **Repository contract implemented:** the verified authentication boundary has
  a typed server-derived channel/credential profile without passing arbitrary
  claims into the core service.
- **Repository contract implemented:** invitation persistence, digest
  comparison, lifecycle, revocation, expiry, audit, and transactional
  uniqueness semantics are in migration `008` and the storage adapters.
- **Repository tests implemented:** same-subject browser/operator separation,
  missing/invalid mappings, redemption races, replay, conflicts, token-profile
  rejection, and raw-secret redaction are covered.
- **Provider activation and private staging closure passed for the operator
  channel:** the Auth0 profile, Native Device Code client, `azp` binding,
  `operator:review` permission/client grant, and RS256 signing configuration
  were read back and exercised against the exact staging service. The reviewer
  channel remains unconfigured until a later portal phase.
- The existing operator Native application and Device Authorization Grant were
  retained; C3B-F changed only the explicitly authorized operator API
  permission/client grant and Railway operator-policy variables. No reviewer
  application or public intake setting was enabled.

### C3C — portal shell and PKCE authentication

- Create the separate public SPA Auth0 application only after C3B's channel
  policy is implemented and tested.
- Implement exact callback/logout origins, Code + PKCE <code>S256</code>,
  state and nonce validation, token exchange, callback URL cleanup, and
  memory-only
  access token handling.
- Serve the shell under the selected same public origin without opening
  operator CORS.
- Add the CSP, security headers, dependency policy, safe error states, and
  browser tests.

### C3D — consent and qualification flow

- Implement explicit invitation redemption and the narrow session/bootstrap
  response.
- Surface current consent policy/version and explicit record/revoke behavior.
- Expose existing sealed qualification operations without changing policy,
  receipt, ownership, or blindness semantics.

### C3E — assignment, review, and submission flow

- Expose only reviewer-safe assignment, packet, submission, and withdrawal
  behavior.
- Preserve server-side eligibility, assignment selection, ownership,
  packet-blindness, and evidence boundaries.
- Prove that no operator route or private material root is reachable by portal
  code or reviewer credentials.

### C3F — private staging reviewer E2E

- Use only a controlled private staging cohort and synthetic/reviewed data.
- Verify Auth0 callback behavior, origin/CSP/CORS policy, invitation races and
  replay, uninvited/disabled/withdrawn states, consent/qualification gating,
  cross-reviewer denial, and safe logs.
- Treat a deployment or a successful login as neither reviewer-campaign
  evidence nor permission to open public intake.

## Provider readback and evidence limits

The first paragraph and limitation list below are the historical C3A record.
The current C3B-F closure evidence follows it.

A safe read-only Railway variable readback on 2026-09-09 confirmed the
configured service uses the <code>auth0-staging</code> provider label, HTTPS
issuer, audience, and JWKS settings, PostgreSQL storage with TLS verification,
and one configured operator subject. The exact subject and raw provider values
are intentionally not copied into this public architecture document.
The source-level verifier currently allows RS256 and PS256; the provider's
current signing-algorithm setting was not independently read from Auth0.

The following provider facts were **not** verified in C3A because no safe
Auth0 Dashboard or Management API inventory was available:

- the existing operator application's exact Auth0 application type;
- current Device Authorization Grant state;
- exact allowed callback URLs, logout URLs, and web origins;
- whether a Reviewer Portal SPA application already exists;
- reviewer/operator API client grants, RBAC settings, and permission lists;
- the exact access-token profile and whether <code>azp</code> or
  <code>client_id</code> is the applicable authorized-party field.

Repository staging documentation records historical real Auth0 Device Flow
exercise, but that is not a current Dashboard readback. No Auth0 application
was created or modified, no secret/token/cookie was exposed, and no
Railway/DNS/runtime setting was changed.

## L2-C3B-F provider and private staging closure

Status: **PASS for the operator channel; reviewer portal remains unstarted.**

The existing Auth0 tenant/provider readback and activation were:

```text
provider label                  auth0-staging
issuer                          https://dev-ng0y0til20vmxxds.us.auth0.com/
API audience                    https://staging.tutorbench.community-review
operator application type       Native
operator application client ID  6OVkgSPyDghv2euJOZGMOKmyZFCiLv78
operator grant                  Device Code enabled
API JWT profile                 Auth0
API signing algorithm           RS256
API permission/client grant     operator:review only
API RBAC toggle                 disabled; service authorization uses scope
```

Railway deployment `4957d7b7-6484-496e-81d6-6126c50a5cbf` at exact source SHA
`8126484b5cba1cb9b992dced25942ff3c691e637` read back:

```text
COMMUNITY_REVIEW_OIDC_TOKEN_PROFILE=auth0
COMMUNITY_REVIEW_OPERATOR_OIDC_CLIENT_ID=6OVkgSPyDghv2euJOZGMOKmyZFCiLv78
COMMUNITY_REVIEW_OPERATOR_OIDC_SCOPE=operator:review
COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED
COMMUNITY_REVIEW_PUBLIC_INTAKE=false
COMMUNITY_REVIEW_REVIEWER_INVITATION_STATE=<absent; effective DISABLED>
```

A real Device Flow access token was consumed only in memory. It had `typ=JWT`,
`alg=RS256`, the exact issuer and single API audience, no UserInfo audience,
matching `azp`, and `operator:review` in `scope`; the deployed operator route
returned HTTP 200. No token, subject, secret, cookie, or raw provider payload
is recorded here. The v7-to-v8 migration recovery/idempotency check and the
private 127.0.0.1 invitation E2E both passed on disposable Neon branches;
final invitation/audit rows were zero and core counts were restored.

This closure does not activate a reviewer provider channel or authorize a
Reviewer Portal, real invitation/provisioning, email, public intake, or P5.

## C3A decision and phase boundary

The architecture is internally consistent at this documentation boundary:

| Decision | Status |
|---|---|
| Reviewer Portal topology | **DECIDED — same public origin as the reviewer API for the initial pilot** |
| Browser Auth0 client boundary | **DEFINED — separate public SPA; existing operator Native app remains a non-portal client** |
| Authorization Code + PKCE boundary | **DEFINED — <code>S256</code>, no client secret** |
| API token model | **DEFINED — reviewer access token, exact issuer/audience/signature/expiry/subject validation, Bearer transport** |
| Token handling | **DEFINED — access token in memory; no localStorage/URL/logging/analytics; bounded transient OAuth state permitted** |
| Operator/reviewer separation | **DECIDED — operator channel binding verified in C3B-F; reviewer browser channel remains future work** |
| Invite-only provisioning | **DEFINED — explicit issue, explicit redeem, one-time digest, atomic binding** |
| Login versus reviewer authority | **DEFINED — login never auto-provisions** |
| Consent sequencing | **DEFINED — explicit, versioned, separately revocable** |
| Qualification sequencing | **DEFINED — existing sealed/receipt/ownership rules preserved** |
| Assignment sequencing | **DEFINED — server-side eligibility and assignment authority preserved** |
| Privacy and logging | **DEFINED — applicant/auth/private material excluded** |
| Threat model | **COMPLETE for the scoped architecture boundary** |
| C3 implementation sequence | **RECORDED — C3B through C3F** |
| C3B repository backend authority | **IMPLEMENTED — C3B-F provider activation and private staging PASS** |

The following remain **NOT STARTED**:

- Reviewer Portal implementation;
- real provider-backed reviewer provisioning or invitations;
- real consent, qualification, assignments, or review campaign;
- P5 human calibration.

Public application and public reviewer intake remain **NOT OPEN**.
L2-C2D launch readiness remains **PARTIAL / BLOCKED**, and application launch
authorization <code>#22</code> remains **NOT GIVEN**.

## Related architecture

- [Community Review service contract](community-review-service.md)
- [Community Review deployment contract](community-review-deployment.md)
- [Community Review staging gate](community-review-staging-gate.md)
- [Closed application gate](community-review-application-gate.md)
- [Public exposure gate](community-review-public-exposure-gate.md)
- [External-edge abuse-control decision](community-review-edge-abuse-control-decision.md)
- [Provider-independent Community Review protocol](community-review-protocol.md)

## Normative references

The later implementation should follow the current primary standards and
provider guidance:

- [Auth0: Authorization Code Flow with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce/call-your-api-using-the-authorization-code-flow-with-pkce)
- [Auth0: Single Page App SDK](https://auth0.com/docs/libraries/auth0-single-page-app-sdk)
- [Auth0: Validate Access Tokens](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens)
- [Auth0: Token Storage](https://auth0.com/docs/secure/security-guidance/data-security/token-storage)
- [Auth0: Public and Confidential Applications](https://auth0.com/docs/get-started/applications/confidential-and-public-applications)
- [Auth0: Application Access to APIs / Client Grants](https://auth0.com/docs/get-started/applications/application-access-to-apis-client-grants)
- [Auth0: RBAC for APIs](https://auth0.com/docs/get-started/apis/enable-role-based-access-control-for-apis)
- [RFC 7636: Proof Key for Code Exchange by OAuth Public Clients](https://www.rfc-editor.org/rfc/rfc7636.html)
- [RFC 6749: The OAuth 2.0 Authorization Framework](https://www.rfc-editor.org/rfc/rfc6749.html)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
