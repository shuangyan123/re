# L2-C2D Public Exposure Hardening / Pre-Launch Gate

Status: **APPLICATION PERIMETER HARDENED; EDGE ABUSE CONTROL NOT VERIFIED —
LAUNCH BLOCKED**.

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
                                   EDGE CONTROL NOT VERIFIED
#11 request-size/malformed limits   VERIFIED by service tests and C2C evidence
#16 closed kill switch              VERIFIED; remains CLOSED
#17 private staging dry run         HISTORICAL C2C PASS; not public launch
#19 operator authorization          VERIFIED in private service evidence
#20 public page status              VERIFIED as not open
#21 close/rollback procedure        VERIFIED and retained
#22 explicit launch authorization   NOT GIVEN
```

L2-C2D is **PARTIAL / BLOCKED** until an actual approved external edge abuse
control is configured and tested for the future application path. This phase
does not configure one and does not weaken the gate to obtain PASS.
