# L2-C2D Public Exposure Hardening / Pre-Launch Gate

Status: **APPLICATION PERIMETER HARDENED; PLATFORM DDOS MITIGATION VERIFIED;
RAILWAY EDGE RULES UNAVAILABLE ON CURRENT PLAN; WAF INCIDENT-ONLY; LAUNCH
BLOCKED**.

This record covers the perimeter around a future participation-application
submission endpoint. It does not open application intake, create a browser
form, authorize recruitment, start reviewer intake, start a Community Review
campaign, begin P5, or grant launch authorization #22.

## Current boundary

```text
COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED
COMMUNITY_REVIEW_PUBLIC_INTAKE=false

Public participation information      OPEN
Public application                    NOT OPEN
Public reviewer intake                NOT OPEN
Real Community Review campaign        NOT STARTED
Reviewer Portal                       NOT STARTED
P5 human calibration                  NOT STARTED
#22 launch authorization              NOT GIVEN
```

The application state and reviewer/campaign switch remain independent. The
public site remains informational and read-only.

## Implementation boundary

### Client-source identity

The service is in direct mode by default. It uses the socket peer address for
transient abuse-control input and ignores `Forwarded`, `X-Forwarded-For`, and
`X-Real-IP` unless `COMMUNITY_REVIEW_TRUSTED_PROXY_CIDRS` explicitly names a
bounded, validated network allowlist. No Railway CIDR is hardcoded or inferred
from a provider log sample.

Trusted-proxy mode accepts one unambiguous, bounded forwarding representation:
an IP-only `Forwarded` chain, an IP-only `X-Forwarded-For` chain, or one
`X-Real-IP` value. Conflicting, duplicated, malformed, oversized, or
obfuscated values safely fall back to the connecting peer. Host and forwarded
host headers are not used for authentication, authorization, redirects,
applicant identity, or origin configuration.

The application limiter derives a fixed-length HMAC key with a random
process-local salt. The raw network address is not stored in the limiter map,
application rows, reviewer identity, public responses, or ordinary logs. This
is transient abuse-control pseudonymization, not an anonymity guarantee.

### Layered abuse control

```text
Layer 1  external edge/reverse-proxy control       NOT VERIFIED
Layer 2  bounded HMAC-keyed in-process limiter       IMPLEMENTED
Layer 3  database idempotency/uniqueness guarantees IMPLEMENTED
```

The in-process limiter protects one process only. It does not prove a global
multi-instance rate limit, bot mitigation, DDoS resistance, WAF coverage, or
distributed abuse resistance. Rolling replacement and any future scale-out
must be treated as separate processes; the limiter is per-instance.

`PUBLIC_EDGE_ABUSE_CONTROL = NOT VERIFIED` is a hard external launch blocker.
No Redis, CDN SDK, CAPTCHA vendor, analytics platform, DNS migration, or new
vendor account was added.

### Browser origin policy

Browser CORS is disabled when
`COMMUNITY_REVIEW_APPLICATION_CORS_ORIGINS` is absent. If configured, it is an
exact origin allowlist, rejects wildcards, requires HTTPS in production, and
applies only to application submission/withdrawal routes. It never reflects an
arbitrary `Origin`, enables credentials, allows `Authorization`, or broadens
operator/reviewer routes. Preflight allows only `POST` and the narrow
application request headers (`Content-Type` and, for submission,
`Idempotency-Key`).

CORS is a browser response policy, not authentication or abuse control. A
future public launch must separately decide whether an exact browser origin is
needed; the current listener remains closed.

### Response and parsing hardening

JSON API responses use `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.
Application, withdrawal, operator, reviewer, and error responses therefore do
not advertise cacheable applicant or operator detail. HSTS is not emitted by
the internal service because TLS terminates at the external deployment
boundary.

Duplicate security-sensitive headers are rejected rather than interpreted:
`Content-Length`, `Transfer-Encoding`, `Content-Type`, `Authorization`,
`Idempotency-Key`, origin/preflight headers, forwarding headers, `Host`, and
`X-Forwarded-Host`. Node remains responsible for its HTTP parser and this
application layer does not claim complete request-smuggling resistance.

Public errors remain stable and machine-readable. They do not include source
keys, raw addresses, credentials, contact data, stack traces, SQL details,
private material references, or internal limiter state.

## Protected-route isolation

The C2C application route remains state-gated before parsing or persistence:

```text
POST /v1/applications             409 application_intake_closed
GET  /v1/applications             405 Allow: POST
OPTIONS /v1/applications          405 while CORS is disabled
GET  /v1/operator/applications    401 without authentication
GET  /v1/reviewer/consent         401 without authentication
```

Operator authorization remains OIDC-controlled in production and reviewer
ownership remains derived from the authenticated service principal. CORS
configuration cannot make `/v1/operator/*` or `/v1/reviewer/*` browser-public.

## Railway external-edge capability investigation (L2-C2D-E)

Read-only control-plane inspection was completed on 2026-09-09 against the
currently linked Railway service. No Railway variable, edge rule, WAF state,
CDN state, DNS record, plan, or deployment was changed.

| Control-plane item | Read-only evidence |
| --- | --- |
| Project / environment / service | `respectful-amazement` (`d0f8a175-9167-4feb-8c48-1019777cc05c`) / `production` (`c4e4ed64-bc45-40fb-bb39-fb405b62b1a1`) / `re` (`7d246171-6361-414c-a9ad-32f55a8549da`) |
| Workspace and project plan | Workspace `HOBBY`; project subscription `trial`; `networking.edgeRules=0` |
| Public domains | `re-production-b131.up.railway.app`; no custom domain attached |
| Current deployment readback | `246ae13c-f339-4394-9948-88e4ebf0349a`, `SUCCESS`, source commit `84c6d993f1e531d779f97435ad74b4cbb5d55da3` |
| Railway edge configuration | `enabled=true`; `edgeRules=null`; `overrides={}`; `underAttackModeUntil=null` |
| CDN | Available, disabled; no purge or cache policy was changed |
| WAF Under Attack | Available, disabled; no incident mode was enabled |

Railway's [Edge Rules documentation](https://docs.railway.com/networking/edge-rules)
describes rules evaluated at the Railway edge before the service. The current
schema exposes `block`, `allow`, `challenge`, `redirect`, and cache-override
actions; it does not expose a per-client or per-path rate-limit action. Rules
are scoped to a service/environment and apply to every domain attached to that
service. This is an edge block/challenge/redirect capability, not proof of a
distributed application rate limiter.

The provider's read-only `validateServiceEdgeRules` call was attempted with a
narrow hypothetical rule matching the exact path `/v1/applications` and a
synthetic probe header, with no broad allow or security bypass. Railway
returned: `Edge rules are not available on your plan. Please upgrade to use
them.` The rule was not saved and no probe was sent.

The external capability classifications are therefore deliberately separate:

```text
PLATFORM DDOS MITIGATION       VERIFIED (Railway platform/network layer only)
RAILWAY EDGE RULES              UNAVAILABLE ON CURRENT PLAN
RAILWAY_EDGE_RATE_LIMIT        NOT AVAILABLE / NOT VERIFIED
RAILWAY WAF UNDER ATTACK       AVAILABLE / DISABLED / INCIDENT-ONLY
PUBLIC_EDGE_ABUSE_CONTROL      NOT VERIFIED
```

Railway's [public-networking limits](https://docs.railway.com/networking/public-networking/specs-and-limits)
describe platform mitigation at network layer 4 and below and document
platform connection/request limits. Those protections are not an
application-level per-client/path throttle, bot control, or proof that the
application cannot be overwhelmed by valid-looking requests. The public
Railway edge header observed on the service confirms the service is behind the
Railway edge, but it does not establish a trusted forwarding CIDR for the
application.

Railway's [Under Attack guidance](https://docs.railway.com/guides/lock-down-production-project)
describes WAF Under Attack as an on-demand browser challenge for an active
DDoS or bot-flood incident. It is not a substitute for an always-on API rate
limit. On an API-only domain, non-browser clients may be blocked while it is
active, so it must not be enabled automatically for this service.

## External-edge experiment

The before-state was the provider state recorded above: no Edge Rule, empty
edge-rule collection, WAF disabled, CDN disabled, and application intake
closed. The narrow Edge Rules validation was the only experiment. Because the
current plan has zero Edge Rules allowance and the validation endpoint rejected
the hypothetical rule, the edge block/challenge experiment was not run.

No temporary rule, challenge, allow rule, redirect, cache override, WAF mode,
CDN policy, or variable was created. The final control-plane state remained
unchanged, so there is no temporary rule to restore and no external-edge
behavior is being presented as verified.

## Incident runbook (not executed in this phase)

This is an operational response path, not launch evidence. Keep the
application closed and use the normal controlled variable/deploy process
before applying incident controls:

```powershell
# Inspect the bounded application-path signal; do not copy raw logs into reports.
railway metrics --http --method POST --path /v1/applications --since 1h --service re --environment production --project d0f8a175-9167-4feb-8c48-1019777cc05c --json
railway logs --http --method POST --path /v1/applications --lines 50 --service re --environment production --project d0f8a175-9167-4feb-8c48-1019777cc05c --json

# During an incident, close or pause the application through the normal deploy process.
railway variable set COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=PAUSED COMMUNITY_REVIEW_PUBLIC_INTAKE=false --service re --environment production --project d0f8a175-9167-4feb-8c48-1019777cc05c

# Enable only for an active incident, for a bounded duration; this is not a rate limiter.
railway waf under-attack enable --service re --environment production --project d0f8a175-9167-4feb-8c48-1019777cc05c --duration 1h
railway waf under-attack status --service re --environment production --project d0f8a175-9167-4feb-8c48-1019777cc05c --json

# After the incident, disable it and recheck the closed/ready boundary.
railway waf under-attack disable --service re --environment production --project d0f8a175-9167-4feb-8c48-1019777cc05c
```

The response checklist is: retain `CLOSED` or explicitly use `PAUSED`, retain
`COMMUNITY_REVIEW_PUBLIC_INTAKE=false`, verify readiness and the closed
`POST /v1/applications => 409 application_intake_closed` response, confirm no
new application/contact/idempotency/audit writes, then disable WAF Under Attack
after the incident. The commands above were recorded for the runbook only;
they were not executed during this capability investigation.

## External staging observation

The read-only Railway inspection for this phase observed the existing linked
service as follows:

| Observation | Evidence |
| --- | --- |
| Public service domain | `https://re-production-b131.up.railway.app` |
| HTTPS live probe | HTTP 200 |
| HTTP live probe | HTTP 301 to HTTPS |
| Railway service target | Port 8080; service domain status ACTIVE |
| Observed deployment before this change | `03204aa8-90df-492f-aad8-cdb3f4d0bd76`, SUCCESS |
| Existing closed application probe | `POST /v1/applications` returned 409 with `application_intake_closed` |
| Existing application method probe | `OPTIONS /v1/applications` returned 405 with `Allow: POST` |
| Existing protected route probe | unauthenticated operator request returned 401 |
| Existing response headers | `no-store` and `nosniff`; no permissive ACAO observed |
| Railway HTTP/network observation | edge source fields were IPv4 while upstream connection fields were IPv6; no stable app trust boundary was verified |

The current public domain is a Railway service domain rather than an already
verified project-controlled CDN/custom-domain edge. Railway access logs expose
operational edge/network fields, but this phase did not establish a path-level
application abuse policy or a trusted proxy CIDR suitable for forwarding-header
identity. The observation is evidence about this deployment, not a claim about
all Railway projects.

After merge, the exact final-main deployment must be re-read and verified for
deployment success, live/ready health, migration v7, closed state, reviewer
public-intake false, closed POST zero-write behavior, CORS/security headers,
protected-route isolation, and bounded privacy/log scans. The current
pre-merge observation is not post-merge evidence.

The external-edge capability readback above is likewise bound to the exact
provider state and source SHA shown in its table. A later deployment does not
turn the unavailable Edge Rules capability into an application abuse-control
pass; it must be reclassified only from a new, independently observed provider
capability and path-specific verification.

### Post-merge readback for code-bearing main

The first code-bearing post-merge deployment was re-read after PR #98 merged:

| Observation | Evidence |
| --- | --- |
| Final main source | `8ccd0b8918633020d0b0c63ce0613281dedd4252` |
| Railway deployment | `ec8bf85f-df80-4130-823b-e7b3db42e4dc`, `SUCCESS`, branch `main`, metadata commit hash matched final main |
| Migration/startup | deployment log reported `currentVersion=7`, `appliedMigrationCount=7`, `status=migrated`; one `server_started`; zero deployment error records |
| Runtime boundary variables | `COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED`; `COMMUNITY_REVIEW_PUBLIC_INTAKE=false`; trusted-proxy CIDR and CORS origin variables absent |
| HTTPS live/ready | `/health/live` HTTP 200; `/health/ready` HTTP 200 with empty reason codes |
| HTTP redirect | `/health/live` over HTTP returned 301 to HTTPS |
| Closed application probe | synthetic `POST /v1/applications` returned 409 `application_intake_closed`; response had no ACAO and had `no-store`, `nosniff`, and `no-referrer` |
| CORS/method probe | `OPTIONS /v1/applications` returned 405 with `Allow: POST` and no ACAO |
| Protected-route probe | unauthenticated `GET /v1/operator/applications` returned 401 with no ACAO |
| Privacy/log scan | no source key or known synthetic test IP appeared in deployment application logs; Railway HTTP metadata was counted without recording raw addresses |

The closed POST used a synthetic body and a unique idempotency key. The
external response confirms the state gate; the zero-write guarantee is backed
by the exact code path and service regression tests, not by a production row
query. No production application/contact/idempotency/audit data was created
for this probe. No proxy CIDR or browser CORS origin was configured. The
external edge abuse-control blocker remains unresolved, so this deployment is
not a public-launch authorization.

The option comparison and deferred pre-launch recommendation are recorded in
the [L2-C2D-X external abuse-control decision](community-review-edge-abuse-control-decision.md).

## Close and rollback boundary

The safe exposure rollback is configuration-first:

1. Keep `COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED` (or set `PAUSED`).
2. Keep `COMMUNITY_REVIEW_PUBLIC_INTAKE=false`.
3. Restart/redeploy the last verified compatible image.
4. Recheck migration history, readiness, closed POST rejection, and zero new
   application/contact/idempotency/audit rows.

No applied migration is rewritten or reversed to close the route. Public
application opening requires a later, separately authorized decision.

## 22-item launch gate summary

The C2C contract, storage, data-separation, authorization, closed-state,
private staging, idempotency, and rollback evidence remain historical
implementation evidence. C2D adds the following perimeter state:

```text
#10 abuse/rate-limit controls       APPLICATION LAYER VERIFIED;
                                   PLATFORM DDOS VERIFIED;
                                   APPLICATION EDGE CONTROL NOT VERIFIED
#11 request-size/malformed limits   VERIFIED by service tests and C2C evidence
#16 closed kill switch              VERIFIED; remains CLOSED
#17 private staging dry run         HISTORICAL C2C PASS; not public launch
#19 operator authorization          VERIFIED in private service evidence
#20 public page status              VERIFIED as not open
#21 close/rollback procedure        VERIFIED and retained
#22 explicit launch authorization   NOT GIVEN
```

L2-C2D is **PARTIAL / BLOCKED**. The application perimeter and platform-level
DDOS mitigation are evidenced, but an approved external application edge abuse
control is not available on the current Railway plan and no per-client/path
Railway edge rate limit was verified. This phase does not upgrade the plan,
configure a third-party edge, enable WAF Under Attack outside an incident, or
weaken the gate to obtain PASS. Launch authorization #22 remains **NOT GIVEN**.
