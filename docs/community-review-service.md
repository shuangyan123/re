# Community Review Service P4-A / P4-B / P4-C

Status:

```text
P4-A Service Foundation — PASS
P4-B Authentication & Reviewer Identity — PASS
P4-C Sealed Qualification Authority — PASS
```

The broader status remains:

```text
P4 COMMUNITY REVIEW SERVICE — IN PROGRESS
Public reviewer intake — NOT OPEN
Real Community Review campaign — NOT STARTED
P5 Community calibration — NOT STARTED
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
and fingerprints were not changed by P4-C.

P4 owns the private/runtime boundary around those helpers:

- authenticated-principal mapping to private reviewer accounts and
  service-issued opaque reviewer IDs;
- append-only consent history and current-policy authorization;
- reviewer/operator separation and account lifecycle;
- sealed qualification definitions, material references, pool state, attempts,
  server-side evaluation, and authoritative receipt persistence; and
- transaction ordering, uniqueness, anti-replay checks, narrow audit metadata,
  and deterministic in-memory behavior for synthetic tests.

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

The existing P4-A batch operations retain their row-lock design: accepting a
submission and closing a batch serialize on the batch row, while freezing a
batch requires the exact stored close record. A submission is either committed
while the batch is `OPEN` and included in close, or rejected after close; no
late or replacement submission overwrites accepted evidence.

## Synthetic testing and gates

`qualification.test.ts` uses a fresh synthetic pool and private in-memory key.
It covers pool sealing/immutability, packet blindness by runtime serialization,
complete/duplicate/extra response rejection, server-side pass/fail, nonce and
attempt-limit races, same-attempt submission races, cross-owner and
cross-pool/version/locale/instrument replay, consent/account/pool authority,
retirement ordering, receipt idempotency, caller-created receipt rejection,
audit privacy, and the authenticated application facade. Existing P4-A/P4-B
tests remain green.

Run the isolated harness with:

```bash
npm run typecheck:community-review-service
npm run test:community-review-service
```

The root benchmark remains provider-free. Its expected unavailable-provider
behavior is unchanged; P4-C does not add model calls or turn unavailable Judge
errors into an official score.

## Explicit exclusions and P4-D handoff

P4-C does not implement or claim:

- public reviewer signup or intake;
- a deployed identity provider, hosted PostgreSQL, private hosted secret
  store, or production deployment;
- a real qualification bank, real reviewer qualification, or public launch;
- reviewer payments, abuse controls, or retention/deletion execution;
- public review queue or assignment delivery, campaign scheduling, reviewer
  dashboard, marketplace, or blind batch campaign (P4-D);
- majority voting, gold labels, adjudication, Judge comparison, calibration,
  accuracy claims, reference generation, or leaderboard scoring (P5); or
- a Review Workspace integration or root-package export.

P4-D remains the separately scoped blind delivery/assignment phase. P5
Community calibration remains not started. The next phase must preserve the
private material boundary and the distinction between P3 validity and P4
authority.
