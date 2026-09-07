# L1 Private Staging Deployment / Launch Gate

Status:

```text
L1 PRIVATE STAGING DEPLOYMENT / LAUNCH GATE — PASS
L1 PREPARATION                         PASS

P4 COMMUNITY REVIEW SERVICE            PASS — DEPLOYMENT-READY
Private staging                        PASS
Public reviewer intake                 NOT OPEN
Real Community Review campaign         NOT STARTED
P5 Community calibration               NOT STARTED
```

This is the post-P4 L1 gate for an actual externally hosted, private staging
deployment. The PASS recorded here is infrastructure and launch-gate evidence
only. It does not open reviewer intake, start a real Community Review campaign,
publish human-reference evidence, or begin P5 calibration.

All staging verification used synthetic material and staging-only authorities.
No real reviewer data, production user data, access token, database credential,
OIDC subject, private key, or private material content is recorded here.

## Authoritative baseline

| Check | Status | Safe evidence |
| --- | --- | --- |
| P4-G baseline before L1 preparation | PASS | `069ed96dce753970e7dbee7d65d33cf3f3c53359` |
| L1 preparation merge baseline | PASS | `1a6c293d5a486eeea38bce3347507a417507aef5` |
| Reviewed staging artifact | PASS | `f48298ccf7771838114de85c6e74da81950574c5` |
| Exact-main repository CI | PASS | CI run `34083056991`: `quality`, `community-review-postgres`, and `community-review-container` passed |
| Exact-main website CI | PASS | Website run `34083056940` passed |
| OCI image digest | PASS | `sha256:2a4f9260aaaa91291ae90d0b43797ca9358fa23c85dab36bdb83c16453d82348` |
| Deployment configuration digest | PASS | `sha256:eea52ea66cb46cf0f54cd8e1b67517692a676e1ac03f5fc86f48599194a6f5bb` |
| External staging stack | PASS | Railway service, Neon PostgreSQL 16, and Auth0 staging OIDC/JWKS authorities |
| Successful redeploy | PASS | Railway deployment `e33cea88-df0e-4a61-8c72-e35ce67dfe27` |
| Graceful replacement evidence | PASS | Replaced deployment `ed8672e8-ffa3-48a1-b288-b1096323e02a` logged `shutdown_requested` with `SIGTERM` |
| Successful rollback deployment | PASS | Railway deployment `25576169-1d3e-40c2-a221-1b3dc9cedd88` |

## L1 launch-gate checklist

| Gate | Status | Safe evidence |
| --- | --- | --- |
| Authorized external staging target | PASS | Authorized Railway staging service, Neon database, Auth0 staging authority, and mounted private volume were established and exercised. |
| Exact reviewed OCI image | PASS | Reviewed source artifact `f48298ccf7771838114de85c6e74da81950574c5`; image digest `sha256:2a4f9260aaaa91291ae90d0b43797ca9358fa23c85dab36bdb83c16453d82348`. |
| Staging deployment identifier | PASS | Redeploy `e33cea88-df0e-4a61-8c72-e35ce67dfe27`; rollback verification deployment `25576169-1d3e-40c2-a221-1b3dc9cedd88`. |
| Hosted PostgreSQL | PASS | Neon PostgreSQL 16 accepted real service migrations, runtime operations, concurrency checks, backup, and isolated restore. |
| Migrations `001` through `006` | PASS | Hosted migration runner reported `currentVersion=6`, `knownMigrationCount=6`, and `appliedMigrationCount=6`. |
| Migration rerun idempotency and checksums | PASS | Hosted rerun retained all six exact migration-history entries; `applied_at` values remained unchanged and no hosted checksum drift was observed. |
| Production-safe database TLS | PASS | PostgreSQL 16 client connected with `verify-full`, system CA validation, hostname verification, required channel binding, and TLS 1.3. |
| Real staging OIDC/JWKS | PASS | Real Auth0 Device Flow produced a JWT access token that the deployed OIDC adapter verified through remote JWKS, issuer, audience, and algorithm constraints. No token is retained here. |
| Staging operator authorization | PASS | Verified OIDC identity matched the configured staging operator allowlist through the deployed authorization adapter. No subject identifier is recorded here. |
| Private mounted synthetic material | PASS | Three synthetic material files survived deployment replacement with exact SHA-256 values and `0640 root:node` permissions; runtime uid 1000 could read all files. |
| Remote `GET /health/live` | PASS | Returned HTTP success with `status=live` before replacement and again after redeploy and rollback. |
| Remote `GET /health/ready` | PASS | Returned HTTP success with `status=ready` and empty reason codes before replacement and again after redeploy and rollback. |
| Synthetic authority smoke | PASS | Hosted runtime completed synthetic reviewer registration, qualification, receipts, blind assignment, submission, close, freeze, agreement-evidence construction, and persisted fingerprint rereads against Neon. |
| Hosted PostgreSQL transaction smoke | PASS | Receipt retry, qualification-attempt race, assignment retry, submit/close race, withdrawal/submit serialization, duplicate close, and duplicate freeze checks satisfied their expected invariants. |
| Backup | PASS | TLS-verified PostgreSQL 16 `pg_dump` custom-format smoke backup created; dump size `145745` bytes. |
| Restore and fingerprint preservation | PASS | Backup restored into an isolated temporary database; six migration-history rows matched, 23 fingerprint columns / 129 fingerprint values matched deterministically, row counts across 22 public tables matched, and the restore database was dropped afterward. |
| Restart/redeploy | PASS | Railway redeploy completed successfully, reran migration verification, remounted the private volume, and started the runtime. |
| Volume persistence across replacement | PASS | Synthetic files retained exact SHA-256 values, ownership, permissions, and node-user readability after redeploy. |
| Graceful shutdown/replacement | PASS | Replaced Railway runtime logged `shutdown_requested` with `SIGTERM`; replacement runtime then started successfully. This records handler invocation and replacement observation, not per-connection drain timing. |
| Failure-mode gate | PASS | An isolated readiness invocation with intentionally missing private material returned `not_ready`, reason `private_material_unavailable`, and exit code 1; normal configuration immediately returned `ready`. |
| Staging log/privacy audit | PASS | Bounded scan of recent staging logs found no database URL, bearer/access/ID token, client secret, private key, Auth0 subject, private material detail, or synthetic task/qualification payload patterns. |
| Staging-safe rollback | PASS | Rollback produced deployment `25576169-1d3e-40c2-a221-1b3dc9cedd88` with successful migration verification, volume remount, `server_started`, external live probe, and external ready probe. |
| Public intake disabled | PASS | Production configuration retained public intake disabled; deployed HTTP surface exposes health endpoints only and no reviewer-intake route. |
| Real campaign | PASS (not started) | No real reviewer was invited, no real review work was assigned, and no real Community Review evidence was collected. |
| P5 calibration | PASS (not started) | No adjudication, human calibration, correctness study, leaderboard, or P5 Judge work was started. |

## Mounted synthetic material evidence

The mounted synthetic material survived redeploy with these raw file hashes:

```text
batch.json
f35c738fe17b1d064ea9c02907c25c39aaf9a7e3a76fce2a684b0b90f3cb1d63

qualification-private.json
c33427d7d9e0adf8094758328f9cb72288b92d02be480e0eb50ef5d77b85f9d9

qualification-visible.json
f30df01f5af4509eb335ff3182c7864ed45602f7147bb3be9d4fb22ef1aaa8d7
```

All three were observed as `0640 root:node` and readable by the deployed
non-root `node` runtime user. Raw file hashes and protocol semantic fingerprints
are intentionally treated as different evidence.

## Hosted PostgreSQL transaction evidence

The high-risk hosted PostgreSQL smoke completed with:

```text
receipt retry stability                  PASS
qualification-attempt race               PASS
assignment retry stability               PASS
submit-vs-close consistency              PASS
withdraw-vs-submit serialization         PASS
double-close idempotency                 PASS
double-freeze idempotency                PASS
initial and final readiness              PASS
```

The checks used uniquely named synthetic records. No staging schema reset,
migration-history rewrite, destructive test reset, or deletion of the resulting
synthetic authority records was performed.

## Backup / restore evidence

The isolated restore verification recorded:

```text
dump bytes                 145745
migration rows             6
migration history match    true
fingerprint columns        23
fingerprint values         129
fingerprint preservation   true
public tables              22
table row-count match      true
isolated restore           true
restore database dropped   true
```

The temporary dump and restore database were removed after verification. This
L1 staging smoke establishes recoverability and fingerprint preservation for the
exercised external staging database. It does not assert an organization-wide
backup retention, erasure, or disaster-recovery policy.

## Replacement, failure, and rollback evidence

Railway redeploy `e33cea88-df0e-4a61-8c72-e35ce67dfe27` reran migration
verification, remounted the private volume, emitted `server_started`, preserved
mounted synthetic material byte-for-byte, and passed internal plus external
readiness checks.

The replaced deployment `ed8672e8-ffa3-48a1-b288-b1096323e02a` emitted
`shutdown_requested` with reason `SIGTERM`, providing actual platform-level
replacement evidence for the service graceful-shutdown handler.

The failure-mode check intentionally supplied a nonexistent material root to a
separate one-shot readiness process. It returned `not_ready`, reason
`private_material_unavailable`, and exit code 1. The active service and database
were not modified, and normal readiness immediately returned `ready`.

A Railway rollback then produced deployment
`25576169-1d3e-40c2-a221-1b3dc9cedd88`. Migration verification, volume mount,
runtime startup, external live, and external ready checks all passed after the
rollback.

## Privacy and operational boundary

The deployed HTTP surface for this phase remains limited to:

```text
GET /health/live
GET /health/ready
```

The log/privacy audit observed operational events such as `server_started`,
`http_request`, and migration status while finding no tested secret or private
payload patterns.

PostgreSQL client tools installed interactively during backup/restore
verification were transient diagnostic tooling in the validation container.
They are not part of the reviewed application image or repository.

The Railway provider environment label does not change the project boundary:
this deployment is used only as private L1 staging.

## Final phase boundary

```text
L1 PRIVATE STAGING DEPLOYMENT / LAUNCH GATE    PASS
P4 COMMUNITY REVIEW SERVICE                    PASS — DEPLOYMENT-READY

Public reviewer intake                         NOT OPEN
Real Community Review campaign                 NOT STARTED
P5 Community calibration                       NOT STARTED
```

L1 PASS authorizes no later phase by itself. Opening reviewer intake, starting
a real campaign, adjudicating human reviews, performing calibration, or
starting P5 requires a separate explicit scope and authorization.
