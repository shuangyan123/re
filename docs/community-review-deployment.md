# TutorBench Community Review Service Deployment Runbook

Status: P4-G deployment/readiness contract plus L2-C2C closed application
intake and L2-C3B-F private provider-staging closure. This document does not
authorize public application intake, public reviewer intake, or a real campaign.

## Boundary and prerequisites

The service is private and isolated under
`services/community-review-service/`. Use Node 22 and PostgreSQL 16 or a
compatible supported PostgreSQL service. Keep the database private to the
service network and mount sealed qualification/review material on a private
filesystem that is not in the image, repository, web root, logs, or backup
artifact shared with reviewers.

The root package remains `tutor-benchmark@0.1.0`; the service package is
private and has its own lockfile/dependencies. Do not publish the service
package or widen the root `files` allowlist.

## Configuration

Set these values through the deployment secret/configuration mechanism. Never
put the database URL, OIDC client secret, private key, token, cookie, or
material content in source control or a log.

Required production settings:

```text
COMMUNITY_REVIEW_ENV=production
COMMUNITY_REVIEW_STORAGE=postgres
COMMUNITY_REVIEW_DATABASE_URL=postgresql://...
COMMUNITY_REVIEW_DATABASE_SSL=require
COMMUNITY_REVIEW_AUTH_MODE=oidc
COMMUNITY_REVIEW_OIDC_PROVIDER=<stable-provider-name>
COMMUNITY_REVIEW_OIDC_ISSUER=https://<issuer>
COMMUNITY_REVIEW_OIDC_AUDIENCE=<audience>
COMMUNITY_REVIEW_OIDC_JWKS_URI=https://<issuer>/.../jwks
COMMUNITY_REVIEW_OPERATOR_SUBJECTS=<provider>|<private-subject>[,...]
COMMUNITY_REVIEW_MATERIAL_ROOT=/private/tutorbench/community-review
COMMUNITY_REVIEW_PUBLIC_INTAKE=false
COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED
COMMUNITY_REVIEW_REVIEWER_INVITATION_STATE=DISABLED
```

The OIDC provider settings above do not activate an operator channel by
themselves. Before any provider-backed credential is accepted, supply and
independently read back the exact access-token profile, operator client
binding, and required scope:

```text
COMMUNITY_REVIEW_OIDC_TOKEN_PROFILE=auth0|rfc9068
COMMUNITY_REVIEW_OPERATOR_OIDC_CLIENT_ID=<operator-client-id>
COMMUNITY_REVIEW_OPERATOR_OIDC_SCOPE=<operator-scope>
COMMUNITY_REVIEW_REVIEWER_OIDC_AUDIENCE=<reviewer-audience>
COMMUNITY_REVIEW_REVIEWER_OIDC_TOKEN_PROFILE=auth0|rfc9068
COMMUNITY_REVIEW_REVIEWER_OIDC_CLIENT_ID=<reviewer-client-id>
COMMUNITY_REVIEW_REVIEWER_OIDC_SCOPE=<reviewer-scope>
```

An incomplete policy is not interpreted as subject-only authority. The runtime
rejects OIDC credentials until the explicit policy is complete. Reviewer
invitation activation is separate and remains `DISABLED` unless a later,
authorized private staging step sets `INVITE_ONLY`. The raw invitation
credential is never a configuration value.

Optional bounded settings are `COMMUNITY_REVIEW_HOST` (default
`127.0.0.1`), `COMMUNITY_REVIEW_PORT` (default `8787`),
`COMMUNITY_REVIEW_DATABASE_SSL_REJECT_UNAUTHORIZED` (default `true`),
`COMMUNITY_REVIEW_OIDC_CLOCK_TOLERANCE_SECONDS` (default `5`),
`COMMUNITY_REVIEW_OIDC_TIMEOUT_MS` (default `5000`),
`COMMUNITY_REVIEW_REQUEST_BODY_LIMIT_BYTES` (default `1048576`),
`COMMUNITY_REVIEW_APPLICATION_RATE_LIMIT_MAX_REQUESTS` (default `30`),
`COMMUNITY_REVIEW_APPLICATION_RATE_LIMIT_WINDOW_MS` (default `60000`),
`COMMUNITY_REVIEW_REVIEWER_INVITATION_TTL_MS` (default `604800000`, bounded to
60 seconds through 31 days),
`COMMUNITY_REVIEW_SHUTDOWN_TIMEOUT_MS` (default `10000`), and
`COMMUNITY_REVIEW_LOG_LEVEL` (`info`, `warn`, or `error`).

Public-exposure settings are fail-closed and optional:
`COMMUNITY_REVIEW_TRUSTED_PROXY_CIDRS` (empty by default, which selects direct
socket-peer mode), `COMMUNITY_REVIEW_APPLICATION_CORS_ORIGINS` (empty by
default, which disables browser CORS), and
`COMMUNITY_REVIEW_APPLICATION_CORS_MAX_AGE_SECONDS` (default `300`). Only
explicitly verified proxy networks may be configured. Do not populate the
proxy list from an unverified Railway address sample. Production CORS origins
must be exact HTTPS origins; wildcard origins and reflected arbitrary origins
are rejected.

Certificate verification must remain enabled in production; the
`COMMUNITY_REVIEW_DATABASE_SSL_REJECT_UNAUTHORIZED=false` development/test
override is rejected by production configuration.

Production rejects `COMMUNITY_REVIEW_PUBLIC_INTAKE=true`, in-memory storage,
synthetic auth, HTTP OIDC URLs, missing TLS, missing operator allowlists, and
missing private material. `COMMUNITY_REVIEW_OIDC_ALLOW_INSECURE_HTTP=true`
is for local tests only.

## First installation or a forward migration

Install the isolated service dependencies and build the service from the
reviewed commit:

```bash
npm ci
npm ci --prefix services/community-review-service
npm run community-review:build
```

Run migration once with the same database URL and TLS settings as the service:

```bash
npm run community-review:migrate
```

The runner applies `001` through `008` in deterministic numeric order and
records filename/checksum history in
`community_review_schema_migrations`. It takes a PostgreSQL advisory session
lock, applies each missing migration in its own transaction, and refuses
checksum drift, unknown history, gaps, missing historical files, or partial
application. Do not edit an applied migration or update its history row by
hand.

Migration `007_community_review_application_intake.sql` is additive. Migration
`008_reviewer_invitations.sql` is also additive; it adds only the private
invitation and lifecycle-audit tables and does not rewrite migrations `001`
through `007`. Record the exact pre-migration source SHA, migration status, and
a platform backup before running it.

For the reviewed C3B source, migration `008_reviewer_invitations.sql` has
checksum
`sha256:abe0143d5d90b33f8d414b13419cb446d508657ebbb6b6049d41eff601757b3e`.

The expected migration-history transition from version `7` to version `8` was
verified on the disposable Neon branch
`c3b-recovery-v7-pre-008-20260910-1150c`: the pre-state had exact migrations
`001` through `007` and no invitation tables, the first apply reached v8, and a
second apply returned the same ready state without changing history. The active
Railway deployment `4957d7b7-6484-496e-81d6-6126c50a5cbf` at source SHA
`8126484b5cba1cb9b992dced25942ff3c691e637` also read back exact migrations
`001` through `008`, including the checked-in v8 checksum above.

## Readiness and startup

Check readiness before routing any private operator traffic:

```bash
npm run community-review:readiness
```

The process is ready only when PostgreSQL responds, the exact migration set
verifies, and the private material root is an accessible directory. A health
request never runs migrations. Start the process only after readiness passes:

```bash
npm run community-review:serve
```

`GET /health/live` and `GET /health/ready` return request IDs and bounded reason
codes; they do not return reviewer, task, qualification, submission, evidence,
or operator data. L2-C2C also ships a future application route and private
operator routes, but application intake remains rejected while
`COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED`. No browser form, public
CORS origin, or public evidence route is deployed. The historical reviewer
and campaign switch remains `COMMUNITY_REVIEW_PUBLIC_INTAKE=false`.

The L2-C2D exposure record is in
[`community-review-public-exposure-gate.md`](community-review-public-exposure-gate.md).
The application limiter is process-local and transient; it is not a global
multi-instance control. External edge abuse protection remains a separate hard
launch blocker until an approved control is actually configured and tested.

For a container deployment, build
`services/community-review-service/Dockerfile`. It uses Node 22, excludes
repository metadata and private data, creates the material mount, and runs as
the non-root `node` user. Supply production configuration at runtime; do not
bake it into the image.

## Backup and restore

Take a PostgreSQL backup before a migration or release using the platform's
encrypted, access-controlled backup mechanism. The repository smoke procedure
can be run explicitly in a disposable test database:

```bash
COMMUNITY_REVIEW_DATABASE_URL=postgresql://... \
COMMUNITY_REVIEW_BACKUP_RESTORE=1 \
node scripts/community-review-backup-restore.mjs
```

The script uses `pg_dump` custom format, restores into a scoped temporary
database, checks migration history and a service table, verifies a non-empty
dump, and drops the temporary database and local dump. It does not print the
connection string. The backup must include the four L2-C2C application tables;
verify their schema and row counts in an isolated restore where practical.
Production backups must additionally follow the organization's encryption,
retention, access-review, and restore-test policy. The application retention
policy is documented in the application gate and is not a legal/compliance
certification.

## Rollback and incident stop

If readiness fails, migration verification drifts, private material does not
resolve, or a transaction has an unknown commit outcome:

1. Stop routing new private work and keep public intake closed.
2. Preserve the immutable backup and sanitized operational logs.
3. Inspect authoritative database state; do not blindly retry an unknown
   commit.
4. Roll back the application to the last verified compatible image, or deploy
   a reviewed forward migration. Do not reverse an applied migration by
   deleting rows or rewriting checksums.
5. Re-run migration verification and readiness before resuming any authorized
   private operator operation.

To stop application intake without destructive database rollback, set
`COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED` (or `PAUSED`) and perform a
controlled restart/redeploy. Confirm the runtime reports the intended state,
`POST /v1/applications` returns the stable closed/paused error before storage,
existing rows remain present, and the withdrawal route still works. Correct the
public `/community/` status separately if its informational copy ever differs;
do not add a form or temporarily expose the listener to change state.

The application policy is executable through `purgeExpired(asOf)` and the
operator purge route. Pending records expire after 90 days; invited/declined
records expire 30 days after decision; withdrawal redacts contact and free text
immediately. Purge is deterministic and may be run as an authenticated
operator maintenance action; a background scheduler is not required for this
phase.

SIGINT/SIGTERM triggers bounded graceful shutdown. The process stops accepting
new requests, waits for active requests within the configured bound, closes
idle connections, and closes the owned PostgreSQL pool.

## Verification evidence and phase gate

The repository CI evidence for P4-G must include Node 22 root/service quality
gates, a real PostgreSQL 16 migration/idempotency/rollback/constraint/concurrency
run, the backup/restore smoke, a non-root container build, and live/ready
container probes. Local tests without PostgreSQL are not substituted for the
real database evidence.

P4-G does not perform an external deployment. Public reviewer intake is
**NOT OPEN**, the real Community Review campaign is **NOT STARTED**, and P5
Community calibration is **NOT STARTED**.

## L2-C2C private staging checklist

After the implementation PR is merged, deploy the exact final main SHA to the
existing private staging service only. Keep both intake controls at
`COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED` and
`COMMUNITY_REVIEW_PUBLIC_INTAKE=false`. Record, without secrets:

- source SHA, deployment ID, migration `currentVersion=7`, and applied count;
- backup completion and isolated restore/schema verification if available;
- live and ready HTTP results;
- closed-state application POST rejection with zero new application, contact,
  idempotency, or application-audit rows;
- malformed/oversized/method handling and protected reviewer/operator routes;
- a localhost-only synthetic `OPEN` dry run, if safe, using only `.invalid`
  contact data, followed by withdrawal/purge cleanup; and
- final configuration state and privacy/log audit.

Never point destructive PostgreSQL tests at private staging, print a database
URL or bearer token, or temporarily set the publicly exposed listener to
`OPEN`. If a safe localhost-only dry run or staging evidence cannot be
performed, report that run's private staging gate as **BLOCKED / NOT VERIFIED**
and do not report L2-C2C overall PASS. The C3B-F closure below is a separate,
completed gate.

## L2-C3B-F provider activation and private staging closure

Status: **PASS — existing operator channel activated and private staging
verified; public intake remains closed.**

The activation was limited to the existing Auth0 Native application and its
existing Device Authorization Grant. Safe provider readback was:

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

The three Railway operator-policy variables were set and read back exactly:

```text
COMMUNITY_REVIEW_OIDC_TOKEN_PROFILE=auth0
COMMUNITY_REVIEW_OPERATOR_OIDC_CLIENT_ID=6OVkgSPyDghv2euJOZGMOKmyZFCiLv78
COMMUNITY_REVIEW_OPERATOR_OIDC_SCOPE=operator:review
```

The resulting deployment was `4957d7b7-6484-496e-81d6-6126c50a5cbf` at the
exact source SHA above. `/health/live` and `/health/ready` returned HTTP 200.
A real Device Flow token was checked in memory only: `typ=JWT`, `alg=RS256`,
exact issuer, one exact API audience with no UserInfo audience, matching `azp`,
and `operator:review` in `scope`; the deployed operator route returned HTTP
200. The existing operator subject allowlist remained in force.

The private E2E used disposable Neon branch
`c3b-private-e2e-v8-20260910-1238` and a service listener bound only to
`127.0.0.1`. It passed invitation issue/redemption, channel denial, replay,
revocation, expiry, mapped-principal conflict, concurrent redemption, closed
intake, `INVITED`-without-provisioning, and synthetic `.invalid` cleanup. The
final state had zero invitation/audit rows, unchanged core counts, zero
sensitive log-pattern hits, and no raw credential in persistence or logs.

Final external configuration readback remained:

```text
COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE=CLOSED
COMMUNITY_REVIEW_PUBLIC_INTAKE=false
COMMUNITY_REVIEW_REVIEWER_INVITATION_STATE=<absent; effective DISABLED>
```

No reviewer SPA/PKCE client, reviewer grant, real invitation, provisioning,
email, or C3C activity was started. Do not proceed to C3C or public intake from
this private operator-channel closure alone.
