# Community Review Service P4-A / P4-B / P4-C / P4-D / P4-E / P4-F

Status:

```text
P4-A Service Foundation               PASS
P4-B Authentication & Reviewer ID     PASS
P4-C Sealed Qualification Authority   PASS
P4-D Blind Delivery / Assignment      PASS
P4-E Production Submission / Close    PASS
P4-F Freeze / Operational Evidence    PASS
P4-G Deployment / Readiness           NOT STARTED
```

The broader status remains:

```text
P4 COMMUNITY REVIEW SERVICE           IN PROGRESS
Public reviewer intake                NOT OPEN
Real Community Review campaign        NOT STARTED
P5 Community calibration              NOT STARTED
```

This document describes an isolated service boundary and its synthetic test
adapter. It is not evidence that a service is deployed, that PostgreSQL or a
production identity provider is connected, or that a real reviewer has
qualified or submitted a review.

## P3 and P4 responsibility boundary

P3 remains the provider-independent protocol in `src/community-review/` and
`src/contracts/`. It owns the versioned envelopes, canonical SHA-256
fingerprints, positive-allowlist review packet, exact atomic submissions, and
the pure `SEALED -> OPEN -> CLOSED -> FROZEN` review lifecycle. P3 contracts
and fingerprints were not changed by P4-C or P4-D.

P4 owns the private/runtime boundary around those helpers:

- authenticated-principal mapping to private reviewer accounts and
  service-issued opaque reviewer IDs;
- append-only consent history and current-policy authorization;
- reviewer/operator separation and account lifecycle;
- sealed qualification definitions, material references, pool state, attempts,
  server-side evaluation, and authoritative receipt persistence;
- authenticated blind assignment delivery from sealed review material;
- authenticated own-assignment submission and operator-only close authority;
- exact packet/atomic validation, transaction ordering, uniqueness,
  anti-replay checks, close snapshots, narrow audit metadata, and deterministic
  in-memory behavior for synthetic tests;
- operator-only `CLOSED -> FROZEN` authority bound to the exact persisted P4-E
  close result;
- diagnostic agreement evidence, conservative disclosure decisions, public
  P3-allowlisted artifact generation, and narrow operational audit metadata.

Qualification is an eligibility mechanism. It is not calibration, correctness
validation of a tutor, a Human Reference, consensus, adjudication, a Judge
score, or a leaderboard result.

## Runtime and package boundary

Service-only runtime code lives in:

```text
services/community-review-service/
```

The service has its own `package.json` and `tsconfig.json`. Its build output is
under the service directory and the root package `files` allowlist remains
limited to the public `dist/src/` tree and listed assets. The service package
is private and is not published or exported by `tutor-benchmark@0.1.0`.

P4-B remains the authentication boundary: `AuthenticationAdapter` reduces an
external credential to `{ provider, subject }`, the private mapping resolves
that principal to a stable service-issued opaque reviewer ID, and the
application facade checks account state and current consent before invoking a
reviewer-owned operation. The synthetic adapter is test-only. No OAuth UI,
public signup, payment flow, public HTTP product, or hosted identity provider
is part of this phase. Lower-level methods retain opaque reviewer IDs only for
trusted internal transactions.

## Sealed qualification architecture

The active flow is:

```text
authenticated reviewer
  -> provisioned opaque reviewer account
  -> current consent
  -> ACTIVE sealed qualification pool validated against server-side metadata
  -> service-created attempt and one-time nonce
  -> positive allowlist qualification packet
  -> structured responses
  -> private answer-key evaluation inside the service transaction
  -> QUALIFIED or NOT_QUALIFIED attempt
  -> P3 receipt built by the service
  -> persisted authoritative receipt bound to that attempt
```

`QualificationMaterialStore` is the private substitution boundary. It exposes
only `loadVisiblePacket` and `loadPrivateAnswerKey` to trusted service code.
The synthetic `InMemoryQualificationMaterialStore` contains unmistakably
synthetic material for tests. A production implementation must resolve the
opaque references through a private material store; no hosted secret store is
part of P4-C.

The qualification definition is versioned by qualification ID/version, pool
ID/version, full instrument identity, review locale, versioned pass-rule ID,
and the visible item set. The service computes deterministic SHA-256
fingerprints using the same canonical JSON convention as P3. The answer-key
commitment additionally binds the definition, pool, locale, instrument, and
normalized private statuses. Changing visible material, a guide/instrument,
locale, pass rule, or answer key therefore cannot silently retain the same
authority identity.

Historical public qualification fixtures and Pilot material remain
historical/training material. They are not loaded by the P4-C active material
store and are not secure public qualification banks.

## Qualification pool lifecycle

New P4-C pools use:

```text
DRAFT -> SEALED -> ACTIVE -> RETIRED
```

`DRAFT` is private setup and cannot issue attempts. `SEALED` records the
definition fingerprint, visible-item fingerprint, answer-key commitment,
instrument identity, and pass-rule ID; the service does not mutate these
semantic fields afterward. `ACTIVE` permits new attempts. `RETIRED` permits no
new attempts but preserves existing attempt and receipt history. An attempt
that was already issued may finish evaluation after retirement, so retirement
does not rewrite accepted historical authority.

The legacy `OPEN` state is retained only for P4-A synthetic rows already
constructed without the P4-C material commitment. It is not an active P4-C
pool and cannot use the new qualification issuer.

## Persistence model

`003_sealed_qualification_authority.sql` adds the following PostgreSQL design
boundary without rewriting migrations 001 or 002:

| Record | Stored boundary | Important constraint |
| --- | --- | --- |
| `qualification_pools` | versioned identity, instrument binding, visible-set fingerprint, opaque material references, private answer-key commitment, lifecycle timestamps | P4-C sealed states require committed metadata; semantic fields are immutable after sealing |
| `qualification_attempts` | reviewer/pool binding, nonce hash, packet binding, structured status projection, evaluation result and timestamps | state/result checks, complete binding checks, pool-wide nonce uniqueness, no raw nonce |
| `qualification_receipts` | exact P3 receipt, attempt/reviewer/pool binding, authority state and issue time | one row per attempt and unique receipt fingerprint; receipt status must be `qualified` |
| `qualification_authority_audit_events` | event type plus opaque reviewer/attempt/pool bindings and reason code | no answer key, raw response, credentials, claims, or private material |

Qualification responses are persisted only as bounded structured status
projections needed for authority and provenance. Optional reviewer evidence is
not persisted by the service. Hidden reasoning, provider payloads, credentials,
cookies, tokens, and raw authentication claims are never part of these records.

The P4-A/P4-B tables remain in the same service boundary: reviewer accounts,
private authentication mappings, append-only consent events, auth audit events,
sealed batch source references, assignments, accepted/rejected submissions,
batch close records, and frozen pools. Their existing P3 identity, uniqueness,
rollback, and `SEALED -> OPEN -> CLOSED -> FROZEN` semantics are unchanged.

## Reviewer-visible qualification packet

The packet is constructed from a dedicated positive allowlist. It contains only
the attempt ID, qualification and pool version, review locale, the four-field
instrument eligibility binding, and visible items consisting of an atomic
identity plus a prompt. It does not serialize an internal definition and then
remove fields.

The packet excludes `expectedStatus`, `expectedAnswer`, `answerKey`, answer-key
commitment, private material references, `reference`, `gold`, consensus,
adjudication, Judge fields, internal notes, scoring rules, other attempts, and
other reviewer data. Runtime serialization tests inspect the actual packet,
not just TypeScript types.

## Attempt lifecycle and response rules

The P4-C persisted lifecycle is:

```text
ISSUED -> SUBMITTED -> QUALIFIED
                    \-> NOT_QUALIFIED
```

`CREATED` is available as a persistence state for a future split create/issue
transaction, while the current service atomically creates and issues one
attempt. Legacy `STARTED`/`REJECTED` records are accepted only as historical
P4-A compatibility data and cannot produce a new P4-C receipt.

Attempt creation requires an authenticated, `ACTIVE` account, current consent,
an `ACTIVE` pool, and matching qualification version, pool version, instrument
fingerprint, and review locale. The reviewer cannot supply an owner identity,
answer key, expected assessment, or result. The service generates the raw
nonce, returns it for that attempt, and persists only its SHA-256 digest.

Responses must be complete and contain exactly one valid status for every
visible atomic identity. Missing, duplicate, extra, wrong-owner, cross-attempt,
or malformed responses are rejected before any attempt mutation. Evidence, if
accepted by the input boundary, is capped at 500 characters and is not a
request for chain-of-thought.

The synthetic default limit is three attempts per reviewer/pool; it is
configurable for a deployment or test. Every issued attempt consumes one slot,
including a failed qualification. Limit checks and inserts run in the same
serialized transaction. Re-submitting an evaluated attempt, replacing its
response, reusing its nonce, or using another reviewer's nonce fails.

The only P4-C pass rule is the versioned deterministic rule
`all-required-items-correct@1`: every submitted status must equal the private
status for the exact visible item set. No percentage, majority vote, Judge,
accuracy, calibration, or reference result is calculated.

## Server-side evaluation and receipt authority

Submission/evaluation follows this order:

```text
lock attempt
-> verify owner, nonce, packet fingerprint, pool/version/locale/instrument
-> load sealed visible material and private answer key
-> verify definition and answer-key commitments
-> validate complete response set
-> persist sanitized response projection
-> derive QUALIFIED or NOT_QUALIFIED with the versioned rule
```

An authoritative receipt is built with the existing
`buildCommunityReviewQualificationReceipt` function only after the same
reviewer-owned attempt is service-evaluated as `QUALIFIED`. It binds the exact
P3 qualification ID/version, pool/version, definition fingerprint, reviewer,
locale, and instrument. The service does not accept a caller-created receipt
or a caller-computed pass result as authority.

P3 protocol validity and P4 service authority remain distinct:

```text
P3-valid receipt
  != automatically service-issued

authoritative receipt
  = P3-valid receipt + evaluated attempt + persisted binding + anti-replay state
```

Receipt issuance is idempotent for the same attempt and exact stored receipt.
A second conflicting fingerprint or attempt binding is rejected. Pool
retirement, later account disablement, or later consent revocation does not
rewrite a previously persisted P3 envelope; those changes affect future
authorization. A receipt authority status, if later revoked operationally,
would be service state outside the immutable P3 content.

## Blind delivery and assignment authority (P4-D)

P4-D turns the P4-A assignment primitives into a service-controlled delivery
boundary. The reviewer-facing path is:

```text
authenticated principal
  -> private reviewer account
  -> ACTIVE account and current consent
  -> service-authoritative P4-C receipt
  -> exact eligibility match
  -> oldest OPEN eligible batch
  -> private visible-task load and fingerprint verification
  -> transactional P3 assignment and positive-allowlist packet
```

The service operation is `getOrCreateOwnEligibleAssignment`. A caller may give
an optional batch ID as an operational hint, but may not supply a qualification
receipt, visible task set, reviewer identity, score, or packet content. The
authenticated application facade resolves the private reviewer account and
passes only its service-issued opaque reviewer ID to the service.

### Sealed material boundary

`ReviewBatchMaterialStore` is the narrow private substitution boundary for
review batches. It receives an opaque sealed-source reference plus the P3
batch identity commitments and returns only
`CommunityReviewVisibleTask[]`. It never receives or returns a reviewer packet
request containing private source material. The deterministic
`InMemoryReviewBatchMaterialStore` is test-only synthetic infrastructure; no
real active campaign or private task bank is committed here.

Before assignment construction, the service verifies the stored batch record,
sealed-source reference, batch fingerprint, instrument identity, review locale,
qualification eligibility, source fingerprint, and visible task-set
fingerprint. It parses the returned positive projection and recomputes the
P3-visible task fingerprint. A missing or mismatched material record fails
closed and rolls back the assignment transaction; the manifest is never
regenerated from caller input.

### Eligibility and deterministic selection

Every assignment requires these independent authorities:

```text
ACTIVE reviewer account
current consent for the active policy
authoritative stored P4-C receipt owned by that reviewer
matching protocol, qualification, pool, definition, instrument, and locale
OPEN batch
one assignment per reviewer and batch
```

The receipt must match the batch's complete qualification binding, not merely a
`qualified` status. Qualification-pool retirement, consent revocation, or
account disablement does not rewrite an already-issued P3 assignment; those
authorities gate new reviewer actions. New assignments require a currently
eligible receipt and an OPEN batch.

When no batch ID is supplied, the service considers only OPEN batches for
which the reviewer passes all receipt checks and selects the oldest batch by
the repository's deterministic creation ordering. A supplied batch ID narrows
the same eligibility check; it does not grant access to an arbitrary hidden
batch. No marketplace, recommender, expected-outcome steering, prior-reviewer
data, or agreement statistic participates in selection.

### Assignment transaction, idempotency, and lifecycle

The in-memory repository serializes the complete operation. The intended
PostgreSQL boundary is one transaction that locks the reviewer authority and
batch, checks ACTIVE/current consent and exact receipt eligibility, asserts
OPEN, loads and verifies private visible material, builds the existing P3
assignment and packet, and persists them together. Migration
`004_blind_delivery_assignment_authority.sql` adds narrow delivery audit
records while preserving the existing database-level
`UNIQUE(batch_id, reviewer_id)` assignment constraint from migration 001.

The same reviewer/batch retry returns the exact persisted assignment and
packet, including stable assignment and packet fingerprints. A withdrawn
assignment cannot be silently replaced. Concurrent duplicate requests are
serialized by the repository and remain subject to the database uniqueness
constraint. Assignment issuance that loses the OPEN-to-CLOSED/FROZEN race
fails without leaving a partial assignment. Existing P3 close and freeze
helpers remain authoritative; P4-E adds the service-owned submission and
close orchestration described below.

Reviewer retrieval and withdrawal are authenticated own-assignment operations.
The application facade derives ownership from the authentication mapping, so a
request cannot substitute another reviewer ID. Retrieval returns the exact
stored positive-allowlist packet and records only a narrow operational event.
Withdrawal changes the P3 assignment state, preserves provenance for close
coverage, requires the authenticated owner and an OPEN batch, and is rejected
after an accepted submission. Account/consent changes gate later actions but
do not delete assignment history.

Delivery audit records contain only event type, opaque batch/assignment/
reviewer IDs where needed, a bounded reason code, and a timestamp. They never
contain packet contents, visible task material, sealed-source data, answer
keys, credentials, tokens, cookies, auth subjects, evaluator fields, or other
reviewer information.

## Production submission and close authority (P4-E)

In this phase, “production” means service-level transaction authority and
replay-safe semantics. It does not mean a deployed endpoint, hosted
PostgreSQL, a production identity provider, public intake, or a real campaign.
The P4-E application facade exposes `submitOwnAssignment` and
`getOwnSubmission` for authenticated reviewers, plus operator-authorized
`closeBatch` and `getBatchCloseResult`.

### Authenticated own-assignment submission

The reviewer path is:

```text
authenticated principal
  -> private opaque reviewer ID
  -> ACTIVE account and current consent
  -> existing owned assigned P4-D assignment
  -> exact persisted P3 packet
  -> exact complete atomic annotations
  -> P3 submission builder
  -> one persisted accepted submission
```

The caller may identify a batch and assignment operationally, but the service
derives reviewer identity from the authentication mapping and checks ownership
against the persisted assignment. An optional packet fingerprint is only a
consistency hint; the authoritative packet is loaded from service persistence.
The service verifies assignment, batch, reviewer, protocol, instrument,
visible-task-set, visible-atomic-ID, qualification-receipt, and packet
bindings before calling `buildCommunityReviewSubmission`.

P3 remains the source of truth for the atomic payload. An accepted submission
contains exactly one annotation for every visible atomic, with the unchanged
status vocabulary:

```text
SATISFIED
OMITTED_OR_INCOMPLETE
EXPLICIT_CONFLICT
```

Missing, duplicate, extra, cross-assignment, cross-batch, invalid-status, and
malformed-evidence payloads fail before an accepted row is committed. Existing
P3 evidence semantics remain in force: optional evidence is non-empty and at
most 500 characters. No chain-of-thought or hidden task material is requested
or persisted.

Submission authorization is checked in the same transaction as the OPEN batch
boundary and accepted-row insert. The account must be `ACTIVE` and have
current consent. An already-issued qualification receipt remains the
assignment's provenance; pool retirement does not silently re-score or
invalidate that assignment during submission. Later account or consent
changes do not rewrite historical accepted evidence.

The persistence authority is:

```text
one assignment -> at most one accepted submission
one batch + reviewer -> at most one accepted submission
one submission fingerprint -> at most one accepted row
```

An identical retry returns the stored submission with the same fingerprint. A
different payload for an already accepted assignment is a
`replacement_submission` rejection and cannot overwrite evidence. Rejected
attempts contain only a bounded reason code, candidate fingerprint when
available, batch/assignment/opaque-reviewer IDs, and a timestamp. Accepted
submission audit events contain only the event type, the same opaque protocol
bindings, the submission fingerprint, and a timestamp; they do not duplicate
annotations or evidence.

### Operator close authority and exact snapshot

Only an authorized operator may close a batch. The close request contains the
batch ID, not caller-supplied assignments or submissions. Within one
transaction the service:

```text
lock the authoritative batch
  -> require OPEN
  -> load all persisted assignments
  -> load all persisted accepted submissions
  -> validate each stored packet/submission binding
  -> call closeCommunityReviewBatch(...)
  -> persist the exact P3 CLOSED manifest and close record
  -> persist the exact accepted-submission snapshot
  -> transition the batch to CLOSED
  -> commit
```

The stored close snapshot is set-checked against the authoritative accepted
rows by assignment ID, opaque reviewer ID, and submission fingerprint. The
P3 close record's coverage and accepted arrays must match that same set. The
service cannot omit an accepted row, inject a caller-created row, or recompute
the result from mutable current input. If P3 rejects incomplete interpretable
coverage or any stored record is inconsistent, the transaction rolls back:
the batch remains `OPEN` and no close record is retained.

After a successful close, repeated `closeBatch` calls and
`getBatchCloseResult` return the exact persisted result, including its stable
close fingerprint and accepted snapshot. The in-memory adapter returns cloned
records, so mutating a returned object cannot mutate authority. PostgreSQL
migration `005_submission_close_authority.sql` adds the relational close
snapshot, accepted-submission audit table, bounded rejection reason constraint,
immutable-record triggers, and batch/assignment/submission guards. The close
record, accepted snapshot, and CLOSED manifest cannot be replaced or reopened
through the service authority.

Reviewer retrieval is limited to the authenticated reviewer's own accepted
submission. Operator close-result retrieval is separate and does not publish
other reviewer annotations or an agreement view.

### Race and lock semantics

The in-memory repository serializes complete transaction callbacks and commits
only a cloned state after success. Therefore submit-versus-close has only two
valid outcomes: a submission that commits first is included in the exact close
snapshot, or a close that commits first makes the later submission fail as
late. Withdrawal and submission share the same OPEN-batch boundary: withdrawal
wins with no accepted row, or submission wins and later withdrawal is rejected
because accepted evidence exists. Failed P3 validation never creates an
accepted row or acceptance audit event.

The PostgreSQL design uses the compatible lock order `batch -> assignment ->
accepted submission / close snapshot` for these lifecycle writes. Submission,
withdrawal, close, and snapshot insertion lock the batch before reading its
state. The service has no PostgreSQL adapter in this phase; the migration is a
database-level authority design boundary and the in-memory adapter is a
deterministic correctness harness, not a claim about PostgreSQL performance.

## P4-E persistence additions

Migration `005_submission_close_authority.sql` keeps migrations 001-004
unchanged and adds:

| Record | Stored boundary | Important constraint |
| --- | --- | --- |
| `review_batch_close_submissions` | exact accepted assignment/reviewer/submission-fingerprint set for one close | composite reference to `review_submissions`, unique assignment/reviewer within the batch, immutable after close |
| `review_submission_audit_events` | narrow accepted-submission event metadata | composite reference to the accepted row; no payload, credentials, or claims |
| `rejected_submission_attempts` | bounded rejection metadata only | bounded reason code and no raw rejected request column |
| `review_batches` / `review_assignments` / `review_submissions` | lifecycle guards and immutable identity projections | compatible OPEN-to-CLOSED authority, assigned-to-withdrawn authority, batch lock guards, and existing one-row uniqueness |

The service's `ReviewBatchCloseRecord` stores the same exact accepted P3
submission objects used to create the close result. This is a local persistence
contract for the close authority; it is not a public evidence export.

## Freeze and operational evidence authority (P4-F)

P4-F operationalizes only the authoritative `CLOSED -> FROZEN` transition. It
does not add a protocol lifecycle state, publish a campaign, or turn a frozen
pool into a Human Reference. The operator facade exposes:

```text
freezeBatch
getFrozenPool
buildAgreementEvidence
getAgreementEvidence
createDisclosure
buildPublicEvidenceArtifact
```

All six operations require the existing operator authorization path. Reviewer
authentication and reviewer ownership do not grant access to freeze, retrieve
private frozen evidence, inspect the agreement matrix, create a disclosure, or
build a public artifact.

### Exact CLOSED-set binding and transactional freeze

The freeze request contains only a `batchId`. The service locks the
authoritative batch, requires `CLOSED`, loads the exact persisted P4-E close
record and accepted-submission snapshot, and mechanically verifies the
current authority before calling the existing P3
`freezeCommunityReviewPool(...)` helper:

```text
lock batch
  -> load exact persisted CLOSED manifest, close record, and accepted snapshot
  -> verify batch/protocol/instrument/task/coverage bindings
  -> set-equal assignment IDs, reviewer IDs, and submission fingerprints
  -> call P3 freezeCommunityReviewPool(closeResult)
  -> persist one frozen pool and its freeze fingerprint
  -> transition the batch to FROZEN
  -> write narrow batch_frozen audit metadata
  -> commit
```

The caller cannot choose an accepted set or submit a close object to freeze.
Any mismatch fails closed and rolls back, leaving the batch `CLOSED` with no
new frozen row. P3 validation failure has the same rollback behavior. A
successful retry returns the exact persisted frozen pool and fingerprint; it
does not reconstruct a pool from mutable assignment or submission rows.
The in-memory repository returns clones, while the PostgreSQL boundary uses
the existing one-row/unique constraints, batch authority guard, and new
immutable-record trigger. Once `FROZEN`, assignment, accepted-submission,
close, coverage, and pool replacement/reopen operations are rejected.

Freeze, close, late submission, assignment mutation, duplicate freeze, and
evidence-generation races are serialized by the same batch transaction
boundary. Only coherent ordered outcomes are permitted: a close either
commits before a freeze, or a committed freeze is the sole frozen authority.

### Diagnostic agreement evidence

After a frozen pool exists, `buildAgreementEvidence` calls the existing P3
`buildCommunityReviewAgreementEvidence(...)` helper using the exact stored
frozen pool. The service persists one deterministic artifact per frozen pool
with a separate service persistence fingerprint. It retains human-human
agreement as diagnostic evidence: reviewer statuses, pairwise reports, the
3x3 status confusion matrix, per-requirement and per-case distributions,
disagreement rows, and missing/withdrawn coverage.

The evidence does not collapse disagreements into a majority label. It never
calculates accuracy, correctness, consensus truth, a gold/reference label, a
Judge comparison, calibration, a leaderboard score, or adjudication. A
single-reviewer pool retains the P3 limitation that human-human agreement
cannot be established. Incomplete, pilot, and synthetic fixtures retain their
P3 limitations and are not validated Human Reference evidence.

Agreement retrieval returns the exact persisted artifact, not a recomputation
from current mutable service rows. Repeated generation is idempotent and
deterministic for the same stored frozen pool.

### Private evidence and explicit disclosure policy

Evidence is private by default. `createDisclosure` first requires an
authoritative frozen pool and persisted agreement evidence, then appends an
immutable disclosure decision. The default `PRIVATE` record contains no public
artifact. A `PUBLIC` record requires an explicit disclosure date and policy and
stores the result of P3's
`buildCommunityReviewPublicEvidenceArtifact(...)` allowlist. A public artifact
is generated/exportable evidence only; P4-F does not host, upload, announce,
or expose a public endpoint.

The public boundary excludes reviewer names, email/phone, GitHub or Discord
identity, OAuth/auth subjects, access tokens, cookies, JWTs, IP/device/account
identifiers, qualification answer keys/responses/private material references,
sealed source references, operator notes, and hidden evaluator or Judge
fields. The private persistence row is never used as the public response.
Changing disclosure policy or date appends a new disclosure version and does
not mutate the frozen pool, freeze fingerprint, close result, or prior
disclosure history. No retroactive withdrawal/erasure policy is invented in
P4-F; later account or consent changes do not silently rewrite historical
evidence.

### P4-F persistence and audit boundary

Migration `006_freeze_operational_evidence.sql` keeps the P4-A
`frozen_review_pools` table and adds:

| Record | Stored boundary | Important constraint |
| --- | --- | --- |
| `community_review_agreement_evidence` | exact P3 agreement artifact plus service persistence identity | one row per frozen batch, unique freeze/evidence fingerprints, frozen-pool binding |
| `community_review_disclosures` | append-only PRIVATE/PUBLIC decision, policy version, and optional P3 public artifact | one version per batch, deterministic identity uniqueness, PRIVATE/PUBLIC shape checks, frozen/evidence binding |
| `community_review_evidence_audit_events` | event type, opaque freeze/evidence/disclosure bindings, policy/version, reason code, timestamp | narrow metadata only, foreign-key bindings, immutable rows |

The migration adds insert guards for frozen pools, agreement evidence, and
disclosures, plus immutable triggers for frozen pools and all P4-F evidence
records. The SQL has been added and statically reviewed; there is no local
PostgreSQL runtime or production adapter in this phase, so PostgreSQL
execution evidence remains a P4-G/infrastructure concern. The deterministic
in-memory adapter mirrors freeze idempotency, rollback, exact-set checks,
evidence identity, disclosure append/version semantics, cloning, and audit
metadata for synthetic tests.

Evidence audit events are limited to `batch_frozen`, freeze retrieval,
agreement generation/retrieval, disclosure creation, public-artifact
generation, and sanitized rejection metadata. They never copy annotations,
submissions, credentials, auth subjects, answer keys, sealed source material,
or hidden evaluator fields.

## Access, privacy, and audit

Reviewer-facing operations are limited to creating, reading, submitting, and
receiving results/receipts for the authenticated reviewer's own attempt. The
application facade derives the opaque reviewer ID from the P4-B authentication
mapping and ignores caller-supplied owner fields. Operators alone may register,
seal, activate, retire, or inspect pool metadata. Operator authorization is
separate from reviewer identity.

Qualification audit events record only pool registration/state transitions,
attempt issuance, response submission, pass/fail, and receipt issuance with
opaque IDs and sanitized reason codes. They never record raw answer keys,
responses when not required, tokens, cookies, JWTs, claims, private material,
or hidden reasoning. No production retention/deletion policy is invented in
P4-C; retention execution remains later service work.

## Transaction and concurrency model

The in-memory adapter serializes transaction callbacks and commits a cloned
state only after success. A thrown validation or P3/service error rolls back
all mutations. Its maps mirror PostgreSQL uniqueness for pool identity, pool
nonce, attempt, receipt fingerprint, and receipt-per-attempt.

The PostgreSQL implementation boundary is intended to use row locks:

```text
Create attempt:
  BEGIN; lock reviewer/account and active pool; count attempts; insert issued
  attempt with nonce hash; COMMIT.

Submit/evaluate:
  BEGIN; SELECT attempt and pool FOR UPDATE; validate against private material;
  insert the response projection; transition through SUBMITTED to the result;
  COMMIT.

Issue receipt:
  BEGIN; lock qualified attempt; build and P3-validate the receipt; insert the
  unique attempt/fingerprint binding; COMMIT.
```

Submission versus retirement is serialized: either evaluation commits before
retirement or an already-issued attempt is evaluated under the explicitly
permitted retired-pool rule. Two submissions cannot produce two final states;
two receipt issuances cannot produce two rows.

P4-E extends the row-lock design: accepting a submission, withdrawing an
assignment, and closing a batch serialize on the same batch boundary. A
submission is either committed while the batch is `OPEN` and included in the
close snapshot, or rejected after close; no late or replacement submission
overwrites accepted evidence. Existing pure P3 freeze compatibility remains
available to prior tests; P4-F now adds the operator-authorized operational
freeze and evidence authority described above.

## Synthetic testing and gates

`qualification.test.ts` uses a fresh synthetic pool and private in-memory key.
It covers pool sealing/immutability, packet blindness by runtime serialization,
complete/duplicate/extra response rejection, server-side pass/fail, nonce and
attempt-limit races, same-attempt submission races, cross-owner and
cross-pool/version/locale/instrument replay, consent/account/pool authority,
retirement ordering, receipt idempotency, caller-created receipt rejection,
audit privacy, and the authenticated application facade. Existing P4-A/P4-B
tests remain green. P4-D service tests additionally cover authenticated
assignment, oldest-eligible-batch selection, exact retry idempotency, private
material fingerprint mismatch rollback, SEALED/CLOSED/FROZEN state gates,
and runtime packet blindness. P4-E service tests additionally cover complete
atomic submission/status validation, exact packet binding, authenticated own
submission retrieval, accepted/replacement/idempotency rules, rejected and
accepted audit privacy, CLOSED/FROZEN late rejection, exact close snapshots,
close rollback/idempotency, simultaneous submissions and closes,
submit-versus-close races, withdrawal-versus-submission races, and operator
authorization. P4-F tests additionally cover exact close-set verification,
operator-only freeze/evidence/disclosure paths, immutable frozen-pool retries,
rollback on P3 freeze failure, persisted-pool-only agreement evidence,
confusion/distribution/disagreement preservation, single-reviewer limitations,
private/public disclosure versioning, runtime privacy firewall checks, and
freeze/close/evidence races. All fixtures are synthetic and unmistakably
non-evidence.

Run the isolated harness with:

```bash
npm run typecheck:community-review-service
npm run test:community-review-service
```

The repository-level gates remain applicable to the complete change:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run benchmark
npm run test:governance
npm run test:package
git diff --check
```

The root benchmark remains provider-free. Its expected unavailable-provider
behavior is unchanged; P4-C does not add model calls or turn unavailable Judge
errors into an official score.

## Explicit exclusions and phase handoff

P4-E and P4-F implement service semantics only. They do not implement or claim:

- a hosted PostgreSQL adapter, production identity-provider deployment, or
  private production material store;
- public reviewer signup/intake, payments, abuse controls, a reviewer
  dashboard, campaign scheduling, or a real Community Review campaign;
- PostgreSQL execution, production deployment, or public hosting of evidence;
- majority voting, agreement-as-correctness, gold/reference labels,
  adjudication, Judge comparison, calibration, accuracy claims, or leaderboard
  scoring (P5), including any conversion of P4-F agreement into correctness;
- a Review Workspace integration, root-package export, or production
  deployment; or
- any reopening transition after `CLOSED`.

P4-F is complete at the `FROZEN` evidence-authority boundary. The next
explicit phase is P4-G Deployment / Readiness, which remains **NOT STARTED**;
P4-F does not host PostgreSQL, deploy an identity provider or secret store,
open reviewer intake, run a real campaign, publish evidence, or implement a
retention/erasure operation. P4 Community Review Service remains
**IN PROGRESS**; public reviewer intake is **NOT OPEN**, the real campaign is
**NOT STARTED**, and P5 Community calibration is **NOT STARTED**. The frozen
pool is not a Human Reference, and the next phase must preserve the private
material boundary and the distinction between P3 validity and P4 authority.
