# L1 Private Staging Deployment / Launch Gate

Status:

```text
L1 PRIVATE STAGING DEPLOYMENT / LAUNCH GATE — BLOCKED
L1 PREPARATION                         PASS

P4 COMMUNITY REVIEW SERVICE            PASS — DEPLOYMENT-READY
Private staging                        NOT RUN / BLOCKED
Public reviewer intake                 NOT OPEN
Real Community Review campaign         NOT STARTED
P5 Community calibration               NOT STARTED
```

This is the post-P4 L1 gate for an actual externally hosted, private staging
deployment. It is infrastructure verification only. It does not open reviewer
intake, start a real campaign, publish evidence, or begin P5. A missing
external prerequisite is recorded as `NOT RUN / BLOCKED`; it is never promoted
to `PASS` by using a local or synthetic substitute.

## Authoritative baseline

| Check | Status | Safe evidence |
| --- | --- | --- |
| Final `main` baseline | PASS | `069ed96dce753970e7dbee7d65d33cf3f3c53359` |
| P4-G repository CI | PASS | [Tutor Benchmark CI run 34080088503](https://github.com/shuangyan123/re/actions/runs/34080088503); exact `main` SHA, `quality`, `community-review-postgres`, and `community-review-container` completed successfully |
| P4-G deployment boundary | PASS | P4-G completed the deployable/readiness boundary; no external deployment was performed, which remains a historical boundary rather than L1 evidence |
| P4 service status | PASS | Deployment-ready service boundary; see `docs/community-review-service.md` |

The P4-G container and PostgreSQL service-container checks are retained as
repository readiness evidence only. They do not satisfy L1's externally hosted
staging requirements.

## L1 launch-gate checklist

| Gate | Status | Evidence or blocker |
| --- | --- | --- |
| Authorized external staging target | NOT RUN / BLOCKED | No authorized hosting target, account, deployment permission, or infrastructure reference was available in the execution environment or repository. No provider was provisioned. |
| Exact reviewed OCI image | NOT RUN / BLOCKED | No L1 artifact was built or deployed; therefore no image digest or deployment revision exists. |
| Staging deployment identifier | NOT RUN / BLOCKED | No external deployment occurred. |
| Hosted PostgreSQL | NOT RUN / BLOCKED | No authorized externally hosted staging database or connection authority was available. The P4-G CI PostgreSQL 16 service container is not L1 evidence. |
| Migrations `001` through `006` | NOT RUN / BLOCKED | The repository migration runner supports the exact contiguous set, but it was not executed against an external staging database. |
| Migration rerun idempotency and checksums | NOT RUN / BLOCKED | No external staging migration history was available to verify. |
| Production-safe database TLS | NOT RUN / BLOCKED | No external staging PostgreSQL connection was available for TLS verification. |
| Real staging OIDC/JWKS | NOT RUN / BLOCKED | No authorized staging issuer, audience/client, JWKS authority, or operator identities were available. Synthetic authentication is not acceptable for the final L1 gate. |
| Private mounted synthetic material | NOT RUN / BLOCKED | No staging-only external/mounted private material location was available. |
| Remote `GET /health/live` | NOT RUN / BLOCKED | No externally deployed service endpoint exists. |
| Remote `GET /health/ready` | NOT RUN / BLOCKED | No externally deployed service endpoint exists. |
| Synthetic authority smoke | NOT RUN / BLOCKED | No authorized private execution path connected to an external staging PostgreSQL adapter was available. Existing in-memory tests remain test evidence only. |
| Hosted PostgreSQL transaction smoke | NOT RUN / BLOCKED | No external staging database was available for duplicate, retry, close, freeze, and race checks. |
| Backup | NOT RUN / BLOCKED | No external staging database or provider-native backup authority was available. |
| Restore and fingerprint preservation | NOT RUN / BLOCKED | No isolated restore database or external backup artifact was available. |
| Restart/redeploy | NOT RUN / BLOCKED | No external service revision exists to restart or redeploy. |
| Graceful shutdown/replacement | NOT RUN / BLOCKED | No externally hosted service process was available for platform-level observation. |
| Failure-mode gate | NOT RUN / BLOCKED | No isolated external staging resources were available for non-destructive failure testing. |
| Staging log/privacy audit | NOT RUN / BLOCKED | No external staging logs exist. The repository logger and privacy boundary remain covered by P4-G tests. |
| Staging-safe rollback | NOT RUN / BLOCKED | No deployed, digest-pinned staging revision exists. |
| Public intake disabled | PASS (repository invariant) | Production configuration rejects `COMMUNITY_REVIEW_PUBLIC_INTAKE=true`; no public intake route is present. External staging confirmation is blocked with the deployment. |
| Real campaign | PASS (not started) | No reviewer was invited, no real work was assigned, and no real evidence was collected. |
| P5 calibration | PASS (not started) | No adjudication, calibration, accuracy, leaderboard, or Judge work was started. |

## Deployment-authority discovery

The safe read-only discovery for this preparation found:

- repository workflows: CI, npm publishing, Pages, and release; no staging
  deployment workflow;
- GitHub repository environment: `github-pages` only; no `staging` environment;
- repository secrets: no deployable staging secret names were available;
- local deployment tooling: GitHub CLI available; Docker, PostgreSQL client
  tools, and listed cloud/provider CLIs unavailable;
- environment configuration: no Community Review, database, OIDC, or provider
  deployment variables were present (values were not enumerated).

No provider was signed up for, purchased, provisioned, or selected by default.
No secret values, credentials, tokens, connection strings, private material,
or private hostnames are recorded here.

## Exact blocker and continuation requirements

L1 is blocked by the absence of an authorized external staging target and its
separate staging authorities. Before external verification can begin, an
authorized operator must supply or establish, outside this repository:

1. a private staging service target with deployment permission and a digest-
   addressable artifact path;
2. a separate hosted PostgreSQL database with TLS and backup/restore authority;
3. a staging-only HTTPS OIDC issuer/JWKS, audience/client configuration, and
   operator identities;
4. a staging-only private filesystem/material mount containing synthetic
   qualification and review material; and
5. a safe private execution path for the authority smoke and access to
   sanitized deployment/runtime logs.

Once those authorities exist, execute the runbook in
`docs/community-review-deployment.md`, record only safe evidence in this
checklist, and repeat the required verification against the final merged
`main` artifact. Do not use this preparation record as L1 PASS evidence.
