# L2-C3C Reviewer Portal Auth Gate

Status: **NOT YET PASS — repository implementation delivered; provider
activation and final Railway/browser evidence pending**

This document records the first real browser implementation for the private
Reviewer Portal. It does not open public application intake, public reviewer
intake, invitation issuance, real reviewer provisioning, consent UI,
qualification UI, or the review campaign.

## Implemented repository boundary

The Community Review service now owns the same-origin portal surface:

```text
GET /reviewer/                    first-party shell
GET /reviewer/callback             same shell for OAuth callback processing
GET /reviewer/config.json          positive-allowlist browser configuration
GET /reviewer/portal.css           first-party stylesheet
GET /reviewer/portal.js            small browser state machine
GET /reviewer/vendor/auth0-spa-js.js
GET /v1/reviewer/session           authenticated coarse bootstrap
```

The portal is intentionally plain semantic HTML, small JavaScript, and plain
CSS. It has no React/framework rewrite, public-site navigation link, analytics,
model output, identity/profile display, invitation redemption UI, or
qualification/assignment UI.

`COMMUNITY_REVIEW_REVIEWER_PORTAL_STATE` is a strict fail-closed enum:

- `DISABLED` is the default and renders no functional login portal;
- `PRIVATE` requires a complete reviewer OIDC channel plus matching public
  browser values;
- unknown values fail configuration loading.

The existing operator channel is not reused. Reviewer requests are validated
by the existing server-side channel policy before the service resolves an
opaque reviewer mapping. An authenticated but unmapped/withdrawn/disabled
account receives the same coarse `reviewer_access_not_enabled` denial.

## Browser security contract

The browser uses the bundled `@auth0/auth0-spa-js` `2.24.1` package (MIT
license) with an `Auth0Client`, Authorization Code + PKCE behavior, exact
callback/logout paths, `cacheLocation: "memory"`, and
`useRefreshTokens: false`. The access token is held only in a closure during
the page lifetime and is sent only as a same-origin Bearer header to the
reviewer session bootstrap. The SDK may use bounded transient OAuth
transaction storage for state/PKCE bookkeeping; that is not access-token
persistence. Reloading the page loses the in-memory token and permits
reauthentication.

Callback query parameters are removed with `history.replaceState` even when
callback processing fails. The UI never displays or logs authorization codes,
state, PKCE verifiers, tokens, ID-token claims, subjects, emails, or provider
profiles. Rendering uses `textContent` and fixed DOM elements; it does not use
`innerHTML`, inline handlers, or runtime third-party scripts.

Portal responses use `Cache-Control: no-store`, a portal-specific strict CSP
with only the exact Auth0 issuer origin in `connect-src`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`X-Frame-Options: DENY`, `X-Robots-Tag: noindex, nofollow`, and a restrictive
Permissions Policy. The reviewer API uses the existing same-origin Bearer
boundary; no reviewer CORS allowlist was added.

## Deterministic evidence

The service tests cover:

- disabled/private configuration and unknown-state rejection;
- public config positive allowlisting without operator/database/identity data;
- fixed asset routing, callback survival, method rejection, CSP, cache, frame,
  referrer, content-type, and robots headers;
- unauthenticated session rejection;
- operator-channel rejection on the reviewer session route;
- generic unmapped reviewer denial;
- mapped coarse `reviewerAccess`/`consentState` response without reviewer ID,
  subject, or email;
- withdrawn-account denial after the state transition.

The portal build validates the exact Auth0 SPA package version/license, copies
the first-party production bundle and license into `dist/portal`, and excludes
the SDK source-map comment and source-map artifact. The production container
build runs this asset step after the root and service builds.

Local browser QA is bounded to the synthetic/local service and must not depend
on Auth0 credentials. The provider-backed login remains a manual final gate
after the Auth0 resource readback and exact-main Railway deployment.

## Provider and deployment status

The existing operator Auth0 Native application remains unchanged. At the
current audit point, no separate Reviewer SPA, reviewer API resource, reviewer
permission/client grant, or reviewer Railway variables have been activated.
The Auth0 dashboard reports the tenant application limit has been reached, so
the reviewer SPA cannot be created safely without a user-approved provider
capacity decision. No unrelated application was deleted or changed.

Therefore the overall gate remains **BLOCKED / NOT YET PASS**:

```text
L2-C3C repository implementation       DELIVERED / LOCALLY VERIFIED
Reviewer Auth0 API + SPA                NOT CREATED / NOT VERIFIED
Browser PKCE provider E2E               NOT RUN
Railway private portal enablement       NOT CHANGED; keep DISABLED
Existing operator channel               PRESERVED
Public application/intake                CLOSED / false
Reviewer invitation state                DISABLED
```

The smallest next decision is to free or increase one Auth0 application slot
without touching the operator app, then create/read back the separate
reviewer API and SPA. Only after that readback should Railway receive matching
reviewer policy variables and `PRIVATE`; final exact-main browser E2E must then
verify callback cleanup, generic access denial for the existing operator
subject through the reviewer client, reviewer-to-operator rejection, logout,
and privacy-safe logs.

## Rollback

Set `COMMUNITY_REVIEW_REVIEWER_PORTAL_STATE=DISABLED` and remove/deactivate
reviewer-only deployment variables if needed. Leave application intake
`CLOSED`, public intake `false`, reviewer invitations `DISABLED`, the operator
Auth0 application, operator grant, and migration v8 unchanged. This rollback
does not claim to revoke already-issued bearer tokens before their provider
expiry.
