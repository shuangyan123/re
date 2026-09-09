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

The deployed HTTP surface recorded by the historical L1 evidence was limited
to:

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

## L2-C2C closed application-intake gate

The L1 record above remains historical infrastructure evidence for migrations
`001` through `006`. It is not rewritten to absorb the later application-intake
checks. L2-C2C adds a separate gate for the exact merged main SHA of the
application-intake implementation, and L2-C2C-R below records the narrowly
scoped migration-recovery evidence.

Current implementation status after exact-main deployment, recovery recheck,
and final private application-gate verification:

```text
Implementation delivery                 PASS — 3ba1b108d9c19904081b91d1a2bc742721890479
Migration recovery evidence (L2-C2C-R)   PASS — isolated v6 -> v7 replay
Private staging application gate         PASS — final private staging closure
L2-C2C overall                           PASS — closed intake staging gate
Application intake state                 MUST REMAIN CLOSED
COMMUNITY_REVIEW_PUBLIC_INTAKE            false
```

The L2-C2C staging run must record, without secrets:

- exact deployed source SHA and Railway deployment ID;
- migration `currentVersion=7`, `knownMigrationCount=7`, and
  `appliedMigrationCount=7`, plus checksum verification;
- backup completion and isolated restore/schema verification where available;
- `GET /health/live` and `GET /health/ready` success;
- `POST /v1/applications` rejection while `CLOSED`, with no application,
  contact, idempotency, or application-audit write;
- malformed JSON, oversized body, unsupported method, and protected reviewer /
  operator route behavior;
- a localhost-only synthetic `OPEN` dry run through submit, idempotent retry,
  altered-body conflict, operator isolation, decision, withdrawal, and purge,
  followed by cleanup; and
- final log/privacy audit and confirmation that the deployed listener remained
  closed throughout.

The dry run must not temporarily open the public Railway listener and must use
only synthetic `.invalid` contact data. Destructive PostgreSQL tests must run
only against an explicitly isolated database, never against private staging.
The recovery evidence below closes the recovery blocker; the final private
application-gate evidence below closes the remaining C2C staging blocker.

## L2-C2C-R migration recovery evidence closure

Status: **PASS — pre-migration recovery evidence was available and replayed in
an isolated Neon branch.** This closes the recovery-evidence component only. It
does not open application intake or authorize a campaign; the final private
staging evidence below supplies the remaining component of the overall
L2-C2C PASS.

### Provenance and isolation

- Recovery source: Neon point-in-time branch from the existing production
  branch of project `tutorbench-community-review-staging`.
- Isolated branch identifier: `recovery-v6-pre-007-20260908-1900`.
- Historical point: `2026-09-08 19:00:19 +08:00`, before the first v7 Railway
  deployment at `2026-09-08T11:17:36Z`; the active Railway database URL was
  checked to resolve to the same Neon production compute endpoint without
  recording the URL.
- Neon history was available for six hours. No production restore was clicked,
  and no current staging database was overwritten.

### v6 restore and v7 replay checks

The isolated historical branch reported exactly six migration-history rows,
with migration `007` absent. The six repository Git-blob checksums matched the
isolated rows:

| Version | Migration | SHA-256 recorded in isolated v6 |
| ---: | --- | --- |
| 1 | `001_community_review_service.sql` | `sha256:e35a372e6e4a11c15c84258cf75262fd50409355f94c57a840449f372abcbc22` |
| 2 | `002_auth_identity_consent.sql` | `sha256:3457ee4bd409bbb866e26a8a9471537c55c9bb1c10db4da80fb8450f68b6603a` |
| 3 | `003_sealed_qualification_authority.sql` | `sha256:30a5131d5d26bb1722d9c72973822f4704b147e3846916160932a62591729ccb` |
| 4 | `004_blind_delivery_assignment_authority.sql` | `sha256:28340affe438629cc181fdfe53453fcb515575fb78435eacc9dd6358ce249de2` |
| 5 | `005_submission_close_authority.sql` | `sha256:1a9d17b8bb9b98c240faaf10c7892906ba9d77756f6f2c132264cfacbf7588b5` |
| 6 | `006_freeze_operational_evidence.sql` | `sha256:556b6fdd82d062cdc1e7115b45a68d2f1601b185f1e1fb0e2db04dc35f503f9d` |

The pre-007 structural snapshot had 22 public tables and 23 fingerprint
columns. Existing row counts were `reviewer_accounts=13`, `review_batches=6`,
`review_assignments=12`, `review_submissions=7`,
`community_review_agreement_evidence=1`, and
`community_review_disclosures=0`; the four application-intake tables were
absent.

The repository migration `007_community_review_application_intake.sql` was
replayed as one transaction in that isolated v6 branch. The exact Git-blob
SHA-256 was `sha256:7695f3ef1d4a59033a271048509b78125a172ec274f398382f0b3f6bc923e82d`;
Neon reported all 10 transaction statements executed successfully. The
post-replay snapshot reported migration versions `1..7`, all four expected
application tables, the three expected application indexes, and 37 application
constraints. New application, contact, idempotency, and audit tables each had
zero rows. Existing counts remained `13/6/12/7/1/0`; public tables increased to
26 and fingerprint columns to 25, consistent with the additive migration.

### Active staging recheck

- Current Railway deployment: `ae004c6b-ae75-4326-9245-7ba8f3b17159`, source
  SHA `3ba1b108d9c19904081b91d1a2bc742721890479`, `SUCCESS`.
- Active database migration history reported versions `1..7`; version 7 was
  recorded with the same repository checksum above.
- `GET /health/live` and `GET /health/ready` both returned HTTP 200 with
  `live`/`ready` status.
- Configuration readback remained `storage=postgres`, `databaseSsl=require`,
  `authMode=oidc`, `COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED`, and
  `COMMUNITY_REVIEW_PUBLIC_INTAKE=false`.
- A synthetic `.invalid` POST to `/v1/applications` returned HTTP 409 with
  `application_intake_closed`. The four application-related table counts were
  zero before and after the request.
- A bounded sample of 17 current deployment log lines contained no connection
  URI, database environment variable, bearer/cookie material, secret/private
  key/API-token marker, or email-shaped value.

### L2-C2C-F final private staging application gate closure

Status: **PASS — exact-main private staging application verification completed
without opening the public listener.**

#### Provenance and boundary

- Active Railway deployment: `79e1a668-5e3e-493d-8ef0-c853b7f01c24`, source
  SHA `915a04003817ad7a7aac606b7945614be748a5ca`, status `SUCCESS`, image
  digest `sha256:baf41be12da6662aa4c4f38077ce2d815453a6701e878132ffbe27ad2015a155`.
- The loopback process loaded the exact current service build from source SHA
  `915a04003817ad7a7aac606b7945614be748a5ca`; the deterministic compiled
  service-directory digest was
  `sha256:c0a23edc02e374f31154aa1163d0966d16086172a86c48cac3d550a3fbdf349b`.
- The private synthetic run used a separate child process with Railway staging
  database variables, synthetic authentication principals only, state `OPEN`,
  and binding `127.0.0.1:61847`. `COMMUNITY_REVIEW_PUBLIC_INTAKE` remained
  `false`; the public Railway process was not reconfigured.
- The loopback process was stopped before the final external recheck. Port
  `61847` had no listener and no temporary dry-run process remained.

#### Migration, application, HTTP, and authorization evidence

- Staging migration history readback was `currentVersion=7`,
  `knownMigrationCount=7`, `appliedMigrationCount=7`; all seven filenames and
  Git-blob SHA-256 checksums matched, including migration 007.
- A valid synthetic application returned HTTP 200 with `PENDING` and the
  intended receipt allowlist only. The tested opaque application ID was
  `2d8974cb9f7855ebb4ea57b4f487e9b1f797957ae3d5c6880f356bd056528200`.
- Same-key identical and concurrent retries returned the same application
  without returning the withdrawal credential again. Same-key altered body
  returned HTTP 409 `application_idempotency_conflict`; no duplicate
  application/contact row was created. The loopback rate limiter returned HTTP
  429 `application_rate_limited` for a distinct new key.
- Loopback HTTP behavior was observed as follows: malformed JSON `400
  invalid_json`; oversized body `413 request_too_large`; unsupported media
  type `415 unsupported_media_type`; `GET` and `OPTIONS` on the application
  route `405 method_not_allowed` with `Allow: POST`; missing key `400
  application_idempotency_required`; invalid key `400
  application_idempotency_invalid`; unsupported version, unknown field,
  invalid email, unsupported locale, missing acknowledgement, and oversized
  free text `400 application_contract_invalid`. No `access-control-allow-origin`
  header appeared.
- Operator authorization returned unauthenticated `401
  authentication_required`, ordinary synthetic reviewer-like principal `403
  operator_not_authorized`, and authorized synthetic operator `200`. The
  unprovisioned reviewer consent path returned `403
  authentication_subject_not_found` under the current HTTP mapping.
- The operator list omitted contact and free text; intentional operator detail
  exposed them before withdrawal and omitted the credential digest. The
  operator recorded `PENDING -> INVITED` with HTTP 200, an exact repeated
  decision returned 200, and a conflicting later decision returned 409
  `application_decision_conflict`. All 21 reviewer/qualification/review
  authority table counts were unchanged.

#### CLOSED/PAUSED, withdrawal, and cleanup

- A new submission against the restarted loopback `CLOSED` process returned
  HTTP 409 `application_intake_closed`; a `PAUSED` process returned HTTP 409
  `application_intake_paused`.
- Withdrawal of the existing application while `CLOSED` returned HTTP 200 and
  lifecycle `WITHDRAWN`; the exact retry returned 200, a wrong credential
  returned 404 `application_withdrawal_not_authorized`, and a later decision
  was blocked with 409 `application_not_active`.
- For the tested application, final PostgreSQL rows were: application `1`
  (`WITHDRAWN`, decision `INVITED`), contact `0`, idempotency `1` containing
  only digests, and application audit `3`. Motivation and experience were
  null; the tombstone contained no contact PII. The safe purge operation was a
  no-op after immediate withdrawal redaction, while the existing time-based
  retention policy remains covered by repository tests.
- Staging-wide post-cleanup counts were `0` active applications, `0` contact
  rows, and `0` rows with application free text. Seven withdrawn synthetic
  tombstones, seven hashed idempotency records, and 15 narrow application
  audit events remained; these are non-identifying metadata only and contain
  no raw key or contact value.

#### Privacy and final external recheck

- The bounded loopback process log scan covered 53 sanitized lines and found no
  synthetic contact/motivation/experience marker, authentication credential,
  bearer material, database URL, token marker, or raw idempotency key. A
  bounded Railway log scan after the final probes found only expected
  `server_started`/`http_request` events and no sensitive-pattern hits.
- Final Railway configuration readback remained PostgreSQL/TLS/OIDC with
  `COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED` and
  `COMMUNITY_REVIEW_PUBLIC_INTAKE=false`. Final external `GET /health/live`
  and `GET /health/ready` both returned HTTP 200. Final external application
  POST returned HTTP 409 `application_intake_closed` with zero application,
  contact, idempotency, or application-audit writes; unauthenticated operator
  access returned 401; application `OPTIONS` returned 405 with `Allow: POST`;
  no permissive CORS header appeared.

This final evidence establishes **L2-C2C PASS** for the closed intake
implementation and private staging gate only. The in-process limiter does not
prove public edge/CDN abuse resistance. Public application intake remains
`CLOSED`; public participation information is `OPEN`, public reviewer intake
is `NOT OPEN`, the real campaign and Reviewer Portal are `NOT STARTED`, P5 is
`NOT STARTED`, and separate launch authorization #22 remains **NOT GIVEN**.
