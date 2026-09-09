# External Abuse-Control Architecture Decision

Status: **L2-C2D-X PASS — decision recorded; implementation NOT AUTHORIZED**

Current launch status remains:

```text
L2-C2D application perimeter                    PASS
External application edge abuse control         NOT VERIFIED
L2-C2D launch readiness                         PARTIAL / BLOCKED
COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE      CLOSED
COMMUNITY_REVIEW_PUBLIC_INTAKE                  false
Public application                            NOT OPEN
Public reviewer intake                        NOT OPEN
#22 launch authorization                       NOT GIVEN
```

This is a decision record only. It does not upgrade Railway, add a vendor,
change DNS, create edge rules, change runtime code or configuration, open
intake, or authorize recruitment.

## Context

The future unauthenticated application endpoint is `POST /v1/applications`.
The current service is intentionally closed while the application form,
recruitment, Reviewer Portal, and P5 calibration do not yet exist. The
existing implementation and launch boundary are documented in the
[public-exposure gate](community-review-public-exposure-gate.md),
[application gate](community-review-application-gate.md),
[staging gate](community-review-staging-gate.md), and
[deployment runbook](community-review-deployment.md).

The unresolved requirement is not merely that a request passes through an
edge. Before a future public application opens, an approved externally
enforced control must operate before, or independently of, one Node process
and materially reduce bot, spam, and request-flood risk. It must complement:

```text
Layer 2  per-process HMAC-keyed application limiter
Layer 3  PostgreSQL idempotency and uniqueness guarantees
```

These are different controls:

```text
network DDoS mitigation       != application abuse protection
browser challenge             != rate accounting
CORS                         != abuse protection
database idempotency         != traffic limiting
closed/paused kill switch    != preventive abuse control
```

## Current controls and provider evidence

The service uses direct socket-peer identity by default, an explicitly
configured trusted-proxy mode, bounded HMAC-derived transient source keys,
strict request parsing, exact optional CORS, and a fail-closed `CLOSED` /
`OPEN` / `PAUSED` intake state. The in-process limiter is transient and
per-instance; process restart, rolling replacement, or scale-out does not
preserve one global counter. PostgreSQL idempotency prevents duplicate
accepted records but does not stop traffic from reaching the service or
database.

Read-only Railway control-plane readback on 2026-09-09 returned:

| Item | Evidence |
| --- | --- |
| Project / environment / service | `respectful-amazement` / `production` / `re` |
| Current subscription state | Project `trial`; workspace plan `HOBBY` |
| Edge Rules allowance | `networking.edgeRules=0` for both the project and workspace plan-limit readbacks |
| Public domain | `re-production-b131.up.railway.app`; no custom domain |
| Saved edge state | `enabled=true`; `edgeRules=null`; `overrides={}`; `underAttackModeUntil=null` |
| CDN / WAF | CDN disabled; WAF Under Attack available and disabled |
| Current deployment | `258a0aeb-5cac-4ef0-9ea6-ec6c5869468d`, `SUCCESS`, source `8aa4776a44228608ae4da852b48180df1d33c9b3` |
| Read-only hypothetical validation | A narrow `/v1/applications` challenge rule was rejected: `Edge rules are not available on your plan.` |

The current Railway facts are consistent with the official [Edge Rules
documentation](https://docs.railway.com/networking/edge-rules): rules run at
the Railway edge before the service, require a public domain and an allowance,
and expose only `block`, `allow`, `challenge`, `redirect`, and
`cache_override` actions. The documented matcher supports source IPv4,
host, path, and header conditions, but there is no per-client or per-path
rate-limit action. Railway-provided domains can participate in Edge Rules in
principle; a custom domain is not required for that Railway feature.

Railway's [public-networking limits](https://docs.railway.com/networking/public-networking/specs-and-limits)
describe platform mitigation at layer 4 and below and state that platform
layer-7 limits may not prevent an application from being overwhelmed. This
is useful platform protection, but it is not an application rate limiter.
Railway's [Under Attack guidance](https://docs.railway.com/guides/lock-down-production-project)
describes an on-demand browser check at the edge; non-browser API or webhook
traffic without clearance may receive `429`. It is incident response, not an
always-on API rate policy.

The [current pricing documentation](https://docs.railway.com/pricing/plans)
lists Hobby at `$5/month`, Pro at `$20/month`, and Enterprise as custom, with
usage charged separately. It does not publish a plan-to-Edge-Rules allowance
mapping. The control plane therefore does not establish the exact plan needed
for Edge Rules: the current Trial project and HOBBY workspace both expose an
allowance of zero. The nominal published Hobby-to-Pro subscription difference
is `$15/month` before usage, but it is not evidence that Pro unlocks Edge Rules
and is not an approved cost estimate.

## Options considered

### A. Railway plan upgrade

**Classification: INSUFFICIENT ALONE.**

The exact required plan is **UNKNOWN / UNPROVEN** from the current public docs
and control plane. A plan upgrade could make Edge Rules available, but the
available actions still do not perform per-client/path rate accounting. A
path condition could target `/v1/applications`, but a `challenge` is a
browser-clearance flow and can reject non-browser clients; it is not a
substitute for request-rate enforcement. Rules are service/environment scoped
and apply to every domain attached to the service, so rule scope and alternate
domains would still need testing.

This option is a reasonable incident-control improvement if Railway is kept as
the edge, but it is not the primary closure for the current external abuse
requirement. Its implementation cost is low to medium, its new-vendor cost is
low, and rollback is comparatively simple by disabling/removing rules. The
remaining failure mode is that valid-looking requests can still reach the
application at a rate the application/database must absorb. A downgrade also
has billing-cycle timing according to Railway's pricing policy.

### B. Project-approved external edge provider

**Classification: DEFER UNTIL PRE-LAUNCH.**

This is the only option considered that can satisfy the current gate as
written, provided the selected provider has all of the following and they are
actually verified:

- per-client and path-specific rate limiting with an explicit burst/window;
- blocking before Railway, with optional bot/challenge controls kept
  separate from rate accounting;
- useful counters, alerts, and an emergency policy switch; and
- a tested origin-bypass prevention model.

The vendor is deliberately not selected in this ADR. The intended topology is:

```text
applicant -> controlled public domain -> external edge policy -> Railway origin
                                      block/rate/challenge       existing L2/L3
```

The edge normally requires DNS control of a custom/controlled domain and TLS
termination at the edge, followed by HTTPS to Railway. The Railway default
domain may remain an origin address only if it cannot provide an unguarded
alternate public ingress. Otherwise an applicant can bypass the edge and the
gate is not closed. The exact origin restriction mechanism must be selected
and verified; this ADR does not assume that a Railway default domain is
private merely because another domain is proxied.

The current service already has a fail-closed trusted-proxy configuration
path, but the edge provider's forwarding headers and source CIDRs would need
independent verification before configuring it. CORS remains an exact browser
origin policy; putting a proxy in front does not create CORS authorization.

This option has the best capability and launch-gate fit, but medium-to-high
one-time implementation complexity: DNS, certificates, origin protection,
forwarded-source trust, policy tuning, staging probes, observability, and
rollback all need evidence. It adds a provider and a new applicant network
metadata/logging boundary. DNS rollback is not instantaneous, and a failed or
misconfigured edge policy can block legitimate applicants or expose the
origin, so the origin must remain safe throughout the cutover.

### C. Accept the current risk

**Classification: TECHNICALLY OPERABLE WITH ACCEPTED RISK.**

This retains Railway platform DDoS mitigation, the per-process limiter,
PostgreSQL idempotency, the `CLOSED` / `PAUSED` kill switch, and incident-only
WAF Under Attack, with no new external application limiter. It is a viable
operating posture while the public application remains closed. It is not an
external-edge verification and cannot open the application under the current
policy.

If the endpoint were opened under this option, valid-looking traffic could
still reach Node and PostgreSQL; distributed bots could use many source keys;
each process would have its own limiter window; and a restart or rolling
deployment would reset transient counters. Response would depend on detection,
manual closure/pausing, and incident WAF activation. The kill switch is a
recovery control, not preventive edge enforcement. Choosing this option for a
public launch would require an explicit policy/gate decision; this ADR does
not make that decision.

### D. Distributed application limiter

**Classification: SECONDARY DEFENSE / NOT SUFFICIENT FOR CURRENT GATE.**

A PostgreSQL- or Redis-backed service-layer limiter could provide global
multi-instance per-client/path accounting without a CDN. It would still
receive the request in Node and would therefore improve **global application
rate limiting**, not satisfy the existing **external edge control** wording.

PostgreSQL accounting puts attacker-controlled traffic on the database hot
path, adding transaction/concurrency load, cleanup/retention work, and a
failure decision about fail-open versus fail-closed behavior. Redis can reduce
that database pressure but would add a service/dependency and its own
availability, cost, privacy, and rollback concerns. Either variant should use
bounded pseudonymous source keys and short retention rather than raw network
addresses. Neither variant supplies a browser challenge or bot proof without
another control.

## Decision matrix

`YES`, `NO`, `PARTIAL`, and `UNKNOWN` describe the option's architecture, not
authorization to execute it. A conditional `YES` still requires implementation
and independent verification. In the `#10` row, “as written” means the
unresolved external application-abuse requirement; the existing C2C
application-layer evidence remains separately recorded as PASS.

| Criterion | Railway upgrade | External edge provider | Accept current risk | Distributed app limiter |
| --- | --- | --- | --- | --- |
| True pre-app edge enforcement | PARTIAL — Edge Rules are pre-service only if allowance is obtained; no rate accounting | YES — if the selected policy blocks/rates before Railway and origin bypass is closed | NO — requests reach Railway/service | NO — service-layer control |
| Per-client/path rate limiting | NO — no documented action | YES — mandatory selection criterion | NO — per-process only | YES — shared application state |
| Multi-instance/global | NO — Edge Rules do not provide application rate accounting | YES — provider-managed edge state, subject to verification | NO — counters are per process | YES — if the shared store is healthy |
| Bot/challenge capability | PARTIAL — challenge exists; WAF is incident-only and challenge is not rate accounting | YES — if selected; still separate from rate accounting | PARTIAL — incident-only WAF | NO — not inherent |
| New vendor | NO | YES | NO | PARTIAL — PostgreSQL variant no; Redis variant may |
| DNS/domain change | NO — a public Railway domain is sufficient in principle | YES — controlled DNS/custom domain is normally required | NO | NO |
| Privacy/data-flow change | PARTIAL — Railway edge challenge/metadata remains in-provider | YES — new processor sees client network/request metadata | NO — current boundary | PARTIAL — new shared rate records; no new processor for PostgreSQL |
| Runtime code change | NO — edge configuration only | UNKNOWN — current trust-proxy hook may suffice; config/tests are required | NO | YES — shared accounting implementation |
| Monthly cost | UNKNOWN — `$5` Hobby / `$20` Pro are published, entitlement is not mapped | MEDIUM — provider/traffic dependent | LOW — no new service | LOW/MEDIUM — database usage or Redis/service |
| Operational complexity | MEDIUM — plan, service-wide rules, challenge behavior | HIGH — DNS, TLS, origin, trust, policy, observability, rollback | HIGH — detection and incident response | HIGH — hot path, state store, failure and retention |
| Meets current #10 as written | NO — upgrade does not add a rate-limit action | YES — only after exact control is implemented and verified | NO — requires policy revision | NO — not external |
| Can close C2D alone | NO | YES — conditional on implementation/verification; this ADR is not authorization | NO | NO |

## Cost, operations, and privacy summary

| Option | One-time implementation | Recurring cost | Main operational/failure concern | Main privacy/lock-in concern |
| --- | --- | --- | --- | --- |
| Railway upgrade | LOW/MEDIUM | UNKNOWN | Mis-scoped block/challenge and no rate accounting; same-provider rollback | Railway remains the processor; challenge cookies/edge metadata need review |
| External edge | MEDIUM/HIGH | MEDIUM, provider and traffic dependent | DNS/TLS or origin-bypass failure; policy can block applicants; provider outage | New request-metadata processor, retention/region/DPA review, provider dependency |
| Current risk | NONE | LOW | Bots and floods still consume service/DB capacity; response is incident-driven | No new data flow or lock-in, but accepted abuse risk remains |
| Distributed limiter | HIGH | LOW/MEDIUM | Database/Redis hot path, availability, cleanup, and fail-open/closed choice | Pseudonymous source/timestamp retention; shared-state dependency |

Rollback and future scalability are distinct from capability fit:

| Option | Rollback | Future scalability |
| --- | --- | --- |
| Railway upgrade | Disable/remove rules; plan downgrade timing still follows the billing cycle | NO — no global application rate accounting |
| External edge | DNS/policy cutback after a controlled transition; keep origin safe during propagation | YES — edge state can remain global if the provider's policy and origin model are verified |
| Current risk | Close or pause intake quickly; no preventive control to roll back | NO — per-process counters reset on replacement and do not become global |
| Distributed limiter | Revert code/config and carefully retire shared state; schema rollback needs its own reviewed plan | YES — global service-layer state, subject to store capacity and availability |

## Decision-state summary

| Option | Final state |
| --- | --- |
| A. Railway upgrade | **NOT RECOMMENDED** as the primary C2D closure |
| B. External edge | **DEFER UNTIL PRE-LAUNCH**; recommended future architecture |
| C. Accept current risk | **REQUIRES EXPLICIT POLICY AUTHORIZATION** for any open endpoint |
| D. Distributed application limiter | **SECONDARY DEFENSE / NOT SUFFICIENT FOR CURRENT GATE** |

## Recommendation

Recommend **Option B as the future pre-launch architecture, deferred until a
public application form and recruitment window are actually near**. It is the
only option that can genuinely meet the current external-control requirement
without pretending that a challenge, CORS policy, idempotency key, or
process-local counter is a traffic limiter.

Until that trigger, keep the current closed posture: `CLOSED` application
state and `COMMUNITY_REVIEW_PUBLIC_INTAKE=false`. That is a timing decision,
not a declaration that external edge control is verified. Option D may be
added later as defense-in-depth if measured global application limits justify
its complexity; it cannot replace Option B for the current gate. Option A is
not recommended as the primary closure because Railway plan access would not
provide the required rate-accounting action.

### Needed now

- Preserve the two closed runtime boundaries.
- Preserve the existing application limiter, database idempotency, and
  incident runbook.
- Make no provider, plan, DNS, edge, database, Redis, or runtime change.

### Needed before public application opens

- Explicitly approve the vendor, recurring budget, DNS/custom-domain change,
  TLS/origin topology, and applicant network-metadata/privacy boundary.
- Define the path policy, per-client key, burst/window, challenge behavior,
  observability, emergency response, and rollback.
- Prove that the Railway default domain cannot bypass the selected edge and
  that the trusted forwarding-source configuration is correct.
- Run path-specific normal, over-limit, bot/challenge, origin-bypass,
  multi-instance, failure, rollback, privacy/log, and non-browser compatibility
  checks while intake remains closed until the gate is complete.
- Obtain the separate launch authorization #22. This ADR does not grant it.

## Authorization required

The recommendation is **NOT AUTHORIZED FOR IMPLEMENTATION**. A later task
must obtain explicit approval for the selected vendor, cost, DNS and domain
ownership, TLS termination, origin restriction, proxy trust/CIDR model,
applicant metadata retention/processing, runtime/deployment changes, and the
verification plan. A Railway plan upgrade likewise requires separate approval.
Choosing Option C for an open public endpoint would additionally require an
explicit policy revision; no policy is revised here.

## Phase boundary

```text
L2-C2D-X architecture decision                 PASS
Options A/B/C/D                                EVALUATED
Decision matrix                                COMPLETE
Recommended future direction                   RECORDED
Required future authorization                  EXPLICIT

L2-C2D application perimeter                   PASS
External application edge abuse control        NOT VERIFIED
L2-C2D launch readiness                        PARTIAL / BLOCKED
Public application                             NOT OPEN
Public reviewer intake                         NOT OPEN
Real Community Review campaign                 NOT STARTED
Reviewer Portal                                NOT STARTED
P5 human calibration                           NOT STARTED
#22                                            NOT GIVEN
```

This ADR does not close L2-C2D and does not start the next Community Review
phase.
