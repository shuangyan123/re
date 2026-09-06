# Community Review Service P4-A / P4-B

Status:

```text
P4-A Service Foundation — PASS
P4-B Authentication & Reviewer Identity — PASS
```

The broader status remains:

```text
P4 COMMUNITY REVIEW SERVICE — IN PROGRESS
Public reviewer intake — NOT OPEN
Real Community Review campaign — NOT STARTED
P5 Community calibration — NOT STARTED
```

This document describes the P4-A foundation and the P4-B authentication
boundary. It is not evidence that a service is deployed, that a production
identity provider is connected, or that a real reviewer has qualified or
submitted a review.

## P3 and P4 responsibility boundary

P3 remains the provider-independent protocol in `src/community-review/` and
`src/contracts/`. It owns the versioned envelopes, canonical fingerprints,
positive-allowlist packet projection, exact atomic submissions, and the pure
`SEALED -> OPEN -> CLOSED -> FROZEN` lifecycle helpers.

P4 owns the private/runtime boundary around those helpers:

- authenticated-principal mapping to private reviewer accounts and
  service-issued opaque reviewer IDs;
- append-only consent history and current-policy authorization;
- minimal account lifecycle and reviewer/operator authorization;
- qualification-pool, attempt, and authoritative-receipt persistence;
- sealed-batch source references, assignments, packets, accepted submissions,
  close records, and frozen pools;
- transaction ordering, uniqueness, anti-replay checks, and rollback behavior;
  and
- a deterministic in-memory adapter used only by synthetic tests.

P4 calls P3 functions. It does not create a second lifecycle, reimplement
fingerprint semantics, or reinterpret agreement. Agreement is not correctness;
consensus is not gold; adjudication is not automatic truth; qualification is
not calibration; blindness is not accuracy.

## Runtime and package boundary

Service-only runtime code lives in:

```text
services/community-review-service/
```

The directory has its own `package.json` and `tsconfig.json`. Its build emits
under the service directory and imports the existing P3 source boundary. The
root package's `files` allowlist remains unchanged and includes only
`dist/src/` plus the explicitly listed public assets, so service runtime code
is not shipped by the normal `tutor-benchmark` npm artifact. The service
package is private and is not a publishable product.

P4-B exposes no public HTTP product, public signup flow, OAuth callback UI,
payment flow, rate limiter, deployment, or hosted database connection. The
provider-independent `AuthenticationAdapter` reduces credentials to only
`provider + subject`; the synthetic adapter is test-only. Future HTTP
handlers must call `CommunityReviewApplicationService`, which authenticates
the request, resolves the private mapping, checks account state and current
consent, and only then calls the existing P4-A operation.
The lower-level P4-A methods retain opaque `reviewerId` parameters for trusted
internal transactions; they are not an authentication boundary or a public
HTTP surface.

## Persistence model

`services/community-review-service/migrations/001_community_review_service.sql`
defines the P4-A PostgreSQL semantics. P4-B adds
`002_auth_identity_consent.sql`. JSON columns contain only validated P3
objects; private source and authentication material are kept outside those
objects.

| Record | Stored boundary | Important constraint |
| --- | --- | --- |
| `reviewer_accounts` | service-issued opaque reviewer ID, private mapping reference, lifecycle status, current-consent projection | reviewer ID is unique; account creation does not grant consent |
| `reviewer_auth_identities` | private auth provider and external subject mapped to one internal account | `UNIQUE(auth_provider, auth_subject)`, one mapping per account, no token or claims payload |
| `reviewer_consent_events` | append-only policy/version acceptance or revocation events | current validity is the latest event for the reviewer/policy tuple |
| `reviewer_auth_audit_events` | event type, internal account, opaque reviewer ID, provider, reason code, timestamp | no subject, token, cookie, JWT, password, or raw claims |
| `qualification_pools` | qualification/pool identity, definition and instrument fingerprints, locale, state, private definition/key references | references are not answer-key content; synthetic fixtures are explicitly marked |
| `qualification_attempts` | reviewer, pool version, attempt state/result, timestamps, nonce hash | nonce replay is unique per reviewer/pool/nonce |
| `qualification_receipts` | exact P3 receipt keyed by `receiptFingerprint`, attempt and pool binding, authority state | one receipt per attempt and fingerprint; only an authoritative persisted row is trusted |
| `review_batches` | exact P3 manifest, state version, opaque sealed-source reference | batch ID/fingerprint are unique and manifest state matches the row state |
| `sealed_batch_payload_references` | private source lookup reference and visible task-set fingerprint | source payload is not stored in the public repository or reviewer response |
| `review_assignments` | exact P3 assignment and its visible packet | `UNIQUE(batch_id, reviewer_id)` and stable assignment identity |
| `review_submissions` | exact accepted P3 submission and acceptance timestamp | `UNIQUE(assignment_id)`, `UNIQUE(batch_id, reviewer_id)`, and no replacement overwrite |
| `rejected_submission_attempts` | optional audit metadata and sanitized fingerprint only | raw rejected payloads are never persisted |
| `review_batch_closes` | one exact P3 CLOSED manifest and close record per batch | close fingerprint and batch are unique |
| `frozen_review_pools` | one exact P3 frozen pool per batch | freeze fingerprint and batch are unique |

The in-memory adapter mirrors these keys and rejects the same duplicate
operations. It is a deterministic test adapter, not production storage and
not a claim that PostgreSQL has been provisioned.

## Transaction and concurrency semantics

The production design locks the batch row before reading or changing any
assignment/submission snapshot:

```text
Accept submission:
  BEGIN
  SELECT review_batches ... FOR UPDATE
  assert OPEN
  load own assignment, packet, and authoritative receipt
  call P3 submission construction/validation
  INSERT accepted submission under both uniqueness constraints
  COMMIT

Close batch:
  BEGIN
  SELECT review_batches ... FOR UPDATE
  assert OPEN
  load exact assignments and accepted submissions
  call P3 closeCommunityReviewBatch
  INSERT the close record
  transition the batch to CLOSED
  COMMIT

Freeze batch:
  BEGIN
  SELECT review_batches ... FOR UPDATE
  assert CLOSED
  load the authoritative close record and accepted submissions
  call P3 freezeCommunityReviewPool
  INSERT the frozen pool
  transition the batch to FROZEN
  COMMIT
```

The local adapter serializes transaction callbacks and commits a cloned state
only after the callback succeeds. A thrown P3 or service error discards the
clone. This is intentionally a conservative equivalent for the synthetic
harness; a future PostgreSQL adapter must use row locks and the migration's
constraints rather than treating the in-memory adapter as a database.

A submit/close race therefore has one of two valid outcomes: a submission
commits while the batch is still `OPEN` and is included by close, or close
commits first and the submission is rejected. No submission can be accepted
after the batch row has transitioned out of `OPEN`.

Identical repeated assignment and submission requests may return the already
stored identical P3 result. A conflicting second payload is rejected as a
replacement and cannot overwrite accepted evidence. Close and freeze are
similarly idempotent only by returning their stored exact P3 output.

## Qualification authority and anti-replay

A P3 receipt is an eligibility envelope, not proof of server issuance. The
service therefore does not manufacture a receipt from caller JSON. To register
authority, a trusted setup/issuer boundary must provide:

1. an existing `QUALIFIED` attempt with `result: qualified`;
2. the matching reviewer account and qualification-pool version;
3. an exact, P3-validated receipt; and
4. matching definition, instrument, locale, and provenance fields.

At assignment and submission time the service looks up the receipt by its
`receiptFingerprint`, checks that the stored row is still authoritative, and
compares the complete stored receipt with the caller's P3 envelope. A valid
locally constructed but unregistered receipt is rejected. Raw nonces and
answer keys do not enter P3 artifacts; answer-key and definition references
remain private placeholders for a later issuer/qualification phase.

## Authentication, identity, consent, and lifecycle

The authenticated application path is:

```text
external credential
  -> AuthenticationAdapter
  -> { provider, subject }
  -> private reviewer_auth_identities mapping
  -> service-issued opaque reviewerId
  -> account-state and current-consent authorization
  -> existing P4-A operation
```

The adapter is provider-independent and returns only the minimal principal.
P4-B includes a synthetic adapter for tests, not a deployed OAuth provider.
The external subject and provider are private persistence data; the opaque
reviewer ID is random, stable for the mapped account, and contains no
provider, subject, username, or contact data. Reviewer-facing request types do
not accept a reviewer ID as proof of ownership.

Newly provisioned accounts start `ACTIVE` and `NOT_CONSENTED`. The
minimal lifecycle is:

- `ACTIVE`: may act only with current consent and the applicable
  qualification authority.
- `WITHDRAWN`: cannot receive or submit reviewer work; historical accepted
  protocol artifacts remain unchanged.
- `DISABLED`: cannot perform reviewer actions; this operational state does
  not invalidate historical evidence.

Consent is a separate append-only authority. `recordConsent` and
`revokeConsent` create events for a policy ID/version, while
`getCurrentConsent` derives the current snapshot. Reviewer actions reject
missing, revoked, or stale consent. Authentication, consent, and
qualification are intentionally independent.

Withdrawal uses P3's existing `withdrawCommunityReviewAssignment` helper and
is allowed only before an accepted submission and while the batch is open.
Account withdrawal and operator disablement do not rewrite submissions or
frozen pools. Account creation, consent changes, mapping creation, and
lifecycle transitions emit narrow audit metadata without raw credentials.

The application facade reserves batch creation/open/close/freeze, authoritative
receipt registration, qualification-pool registration, and account disablement
for a separate operator authorizer. A reviewer principal is not an operator
principal.

## Blindness and privacy firewall

Reviewer packet construction starts from the persisted P3
`CommunityReviewReviewerPacket`, which is already a positive visible
projection. The service never serializes a hidden evaluator object and then
deletes fields. Reviewer-facing reads verify the opaque owner and return only
that packet.

The service and tests reject or keep outside reviewer-facing responses fields
such as `groundTruth`, `knownMisconception`, `expectedStatus`, `reference`,
`consensus`, `adjudication`, Judge fields, other-reviewer material, and
qualification answer keys. The public repository contains only synthetic
fixtures and opaque deterministic references; it contains no real reviewer
identity, submission, credential, cookie, token, database export, production
secret, chat log, or hidden reasoning.

## Synthetic integration harness

The targeted service tests cover:

- repository round trips and P3 fingerprint preservation;
- reviewer/pool/attempt/receipt authority bindings and nonce replay;
- assignment uniqueness and concurrent idempotency;
- simultaneous submissions, duplicate and replacement rejection;
- wrong-owner, cross-assignment, and cross-batch replay;
- submit/close ordering in both transaction orders;
- P3 validation rollback, close/freeze exact-output persistence, and repeated
  close/freeze calls;
- withdrawal behavior and positive-allowlist blindness;
- the inability of an unregistered P3 receipt to become authoritative;
- authenticated principal mapping, opaque-ID stability, consent versioning,
  account lifecycle, operator separation, forged-owner rejection, and
  credential non-persistence.

Run the isolated harness with:

```bash
npm run typecheck:community-review-service
npm run test:community-review-service
```

## Explicit exclusions and next phases

P4-A/P4-B does not implement or claim:

- public reviewer signup or intake;
- a deployed production identity provider, hosted PostgreSQL, or production
  deployment;
- real qualification or an active answer-key pool;
- reviewer payments, abuse controls, retention execution, or deployment;
- majority voting, gold labels, adjudication, Judge comparison, calibration,
  accuracy claims, reference generation, leaderboard scoring, or verified
  model submission.

P4-C may add a separately scoped qualification authority. P4-B does not add a
private answer key, active sealed qualification campaign, public reviewer
intake, real reviewer data, or a production issuer. P5 calibration remains not
started. A frozen synthetic pool remains test material and is not Community
Review evidence.
