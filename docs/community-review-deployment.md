# TutorBench Community Review Service Deployment Runbook

Status: P4-G deployment/readiness contract. This runbook does not authorize
an external deployment, public reviewer intake, or a real campaign.

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
```

Optional bounded settings are `COMMUNITY_REVIEW_HOST` (default
`127.0.0.1`), `COMMUNITY_REVIEW_PORT` (default `8787`),
`COMMUNITY_REVIEW_DATABASE_SSL_REJECT_UNAUTHORIZED` (default `true`),
`COMMUNITY_REVIEW_OIDC_CLOCK_TOLERANCE_SECONDS` (default `5`),
`COMMUNITY_REVIEW_OIDC_TIMEOUT_MS` (default `5000`),
`COMMUNITY_REVIEW_REQUEST_BODY_LIMIT_BYTES` (default `1048576`),
`COMMUNITY_REVIEW_SHUTDOWN_TIMEOUT_MS` (default `10000`), and
`COMMUNITY_REVIEW_LOG_LEVEL` (`info`, `warn`, or `error`).

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

The runner applies `001` through `006` in deterministic numeric order and
records filename/checksum history in
`community_review_schema_migrations`. It takes a PostgreSQL advisory session
lock, applies each missing migration in its own transaction, and refuses
checksum drift, unknown history, gaps, missing historical files, or partial
application. Do not edit an applied migration or update its history row by
hand.

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

The only HTTP endpoints in this phase are `GET /health/live` and
`GET /health/ready`. They return request IDs and bounded reason codes; they do
not return reviewer, task, qualification, submission, evidence, or operator
data. The service has no public intake route and no public evidence route.

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
connection string. Production backups must additionally follow the
organization's encryption, retention, access-review, and restore-test policy;
P4-G does not invent a retention or erasure policy.

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
