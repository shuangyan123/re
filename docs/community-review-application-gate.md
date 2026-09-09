# Community Review Participation Application Contract / Launch Gate

Status: **L2-C2C implementation and private staging application gate PASS;
migration-recovery evidence is closed. Public application intake remains
CLOSED.**

This document defines the small, versioned contract that a future manual
invitation workflow may use and the hard gate that must be satisfied before
public applications can move from `CLOSED` to `OPEN`. L2-C2C adds the private,
state-gated application service and storage path, but it does not authorize
recruitment or public intake.

The authoritative state for this phase is:

```text
Public participation information       OPEN
Public application                     NOT OPEN
Public reviewer intake                 NOT OPEN
Real Community Review campaign         NOT STARTED
Reviewer Portal                        NOT STARTED
P5 human calibration                   NOT STARTED
```

## Scope and non-goals

L2-C2B added the provider-independent TypeScript contract, strict runtime
validation, focused regression tests, and this launch-gate record. L2-C2C adds
in-memory and PostgreSQL persistence, a dedicated application-intake service,
operator-only review methods, a future HTTP transport, bounded abuse controls,
retention/purge behavior, and private staging verification procedures. It does
not add an application form, an invitation sender, reviewer provisioning, a
Reviewer Portal, qualification UI, or real applicant data.

The existing P3 Community Review protocol and P4 service remain separate
boundaries. The P4 service's authenticated reviewer path still requires a
provisioned opaque reviewer account, current Community Review consent, and an
authoritative qualification receipt before review assignment. A valid
application object cannot create any of those authorities.

## Versioned contract

The contract identity is:

```text
community-review-application@0.1.0
schemaVersion: 1
applicant notice version: 0.1.0
```

The executable contract is in
`src/contracts/community-review-application.ts` and its strict parser is in
`src/contracts/community-review-application-validation.ts`. The parser rejects
unknown fields and returns a new typed boundary object; it does not normalize
the applicant's email value.

The shape below is a synthetic example only. It is not a live form payload and
the `.invalid` address is not an applicant address:

```json
{
  "schemaVersion": 1,
  "applicationKind": "community-review-application",
  "contractId": "community-review-application",
  "contractVersion": "0.1.0",
  "noticeVersion": "0.1.0",
  "submittedLocale": "en",
  "preferredReviewLocale": "zh-CN",
  "contact": {
    "type": "email",
    "value": "future-reviewer@example.invalid"
  },
  "motivation": "I want to help inspect observable tutoring behavior.",
  "availability": "occasional",
  "acknowledgements": {
    "applicationNoticeAcknowledged": true,
    "applicationDoesNotGuaranteeAcceptance": true,
    "invitationDoesNotImplyQualification": true,
    "qualificationRequiredBeforeReviewAssignments": true,
    "publicIntakeFollowsLaunchGate": true
  }
}
```

### Fields and minimization

| Field | Contract rule and purpose |
| --- | --- |
| `schemaVersion` | Fixed executable schema version `1`. |
| `applicationKind` | Fixed kind `community-review-application`; distinguishes this object from protocol records. |
| `contractId`, `contractVersion` | Bind the application to `community-review-application@0.1.0`. |
| `noticeVersion` | Binds the application acknowledgement to the applicant-facing notice version. |
| `submittedLocale` | One supported application-notice locale: `en` or `zh-CN`. |
| `preferredReviewLocale` | One supported future review locale: `en` or `zh-CN`. |
| `contact` | Exactly one `email` contact value, bounded to 254 characters and conservatively syntax-checked. Phone numbers and social-account identifiers are not collected. |
| `motivation` | Required short free text, at most 1,000 characters. |
| `experienceSummary` | Optional relevant experience summary, at most 1,000 characters; formal credentials are not required by this contract. |
| `availability` | One coarse category: `occasional`, `regular`, or `flexible`; no detailed schedule is collected. |
| `acknowledgements` | All five required `true` acknowledgements must be present, including the distinction between an application notice and later reviewer consent. |

The contract does not collect legal name, address, precise location, phone,
birth date, government ID, employer, school, gender, race/ethnicity,
political/religious information, health information, financial information,
formal credentials, social-media following, or detailed schedule. No
demographic research requirement is implied.

Email validation is deliberately conservative. It accepts only a bounded
ASCII address with a dotted domain, rejects leading/trailing whitespace, and
preserves the supplied string rather than lowercasing or otherwise rewriting
identity semantics. This contract does not support multiple contact channels
merely for flexibility.

## Application identity is not reviewer identity

The application layer and review-protocol layer must never be joined by
contact information. Application contact data must not become, or be used to
derive, a reviewer ID. In particular, reviewer IDs must not be derived from an
email, name, GitHub/Bilibili/Discord username, phone number, IP address, or
device ID.

The application contract intentionally contains no `reviewerId`, qualification
receipt, consent record, assignment, packet, submission, evidence, expected
status, or public-artifact field. Future implementation must construct any
reviewer or public projection from an explicit allowlist and must never copy an
application record directly into:

- qualification receipts or packets;
- reviewer assignments or submissions;
- frozen pools or agreement evidence; or
- public Community Review artifacts.

Application data exists only for a future recruitment/invitation purpose and is
logically separate from protocol evidence. L2-C2C defines an executable,
data-minimizing policy: pending records expire after 90 days; invited or
declined records expire 30 days after the manual decision; withdrawal redacts
contact and free text immediately; and purge leaves only a non-identifying
tombstone plus the minimum idempotency/audit metadata. This is an application
policy, not a legal or compliance certification.

## Acknowledgement, consent, and qualification

The five application acknowledgements are limited to the future application
notice:

1. the applicant notice was acknowledged;
2. an application does not guarantee acceptance;
3. an invitation does not imply qualification;
4. qualification is required before real review assignments; and
5. public intake follows the closed-to-open launch gate.

These acknowledgements are not Community Review consent. An invited applicant
must complete the existing consent lifecycle before participating. The
application contract cannot manufacture consent records, qualification
receipts, assignments, submissions, or reviewer provisioning.

Qualification is not application approval, calibration, or correctness.
Agreement is not correctness; consensus is not gold; qualification is not
calibration; and `FROZEN` is not `Human Reference`.

## Future manual decision vocabulary

The internal manual-review vocabulary is intentionally small:

```text
PENDING   application awaits manual review
INVITED   an invitation may be sent by a later controlled workflow
DECLINED  the application is not invited
```

Decision values are not fields on the applicant-facing contract in this phase.
They must not be exposed with internal rejection reasoning, create benchmark
evidence, or imply a qualified reviewer. `INVITED` still does not provision a
reviewer, grant assignments, create a Human Reference, or start P5.

Future manual review should assess ability to participate in the task rather
than prestige or identity. Appropriate criteria are whether the applicant:

- can understand the purpose of TutorBench;
- can read the selected review locale adequately;
- appears willing to follow structured evaluation criteria;
- can commit enough time for the intended pilot;
- shows no obvious indication of spam or abuse; and
- acknowledges that qualification remains a separate gate.

The criteria do not require a degree, teacher certification, institutional
affiliation, real-name identity, or a large social-media following. They do
not prove reviewer correctness.

## Intake state and fail-closed behavior

The future intake state vocabulary is:

| State | Meaning |
| --- | --- |
| `CLOSED` | No new applications are accepted. This is the default and current state. |
| `OPEN` | New applications may be accepted only after every hard launch-gate item passes and separate authorization is recorded. |
| `PAUSED` | New applications are temporarily rejected while already-held records, if any, are preserved under the later approved policy. |

The separate runtime setting is
`COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE`; it does not repurpose
`COMMUNITY_REVIEW_PUBLIC_INTAKE`, which remains hard-disabled for reviewer and
campaign intake. The executable state resolver is fail-closed: missing, null,
empty, whitespace-padded, or malformed primitive configuration resolves to
`CLOSED`; a known state is returned as-is; an unknown non-empty state name is
rejected rather than guessed. `OPEN` is never the fallback for a missing flag.

The application service enforces the state before parsing or writing a public
submission. `POST /v1/applications` is a future transport only: there is no
browser form, public CORS policy, or public-page endpoint call. Applicant
withdrawal remains available while intake is `CLOSED` or `PAUSED`; operator
listing, detail, decisions, and purge require the existing operator
authentication/authorization boundary.

### L2-C2C application service controls

- Application IDs are opaque random values and are never derived from contact
  data, provider subjects, or reviewer IDs.
- Contact values live in a separate table/record boundary. Idempotency keys are
  stored only as fingerprints; withdrawal credentials are returned once and
  stored only as one-way digests.
- The first submission returns a minimal `PENDING` receipt. An identical retry
  returns the same application receipt without the credential; a changed body
  under the same key is a deterministic conflict. PostgreSQL transactions use
  a service lock/row-lock boundary so concurrent duplicates collapse to one
  application.
- Operator list responses omit contact and free text. Explicit operator detail
  may include them while the record is active. `INVITED` records do not create
  reviewer identities, consent, qualification receipts, assignments,
  submissions, batches, frozen pools, agreement evidence, or public evidence.
- Withdrawal and deterministic operator purge redact contact/free text and
  preserve only a minimal tombstone and narrow audit event. The bounded
  in-memory rate limiter is transient abuse control; production edge/CDN abuse
  controls remain a later launch concern.

Storage unavailable means a future submission must be rejected, not silently
accepted. Manual review unavailable must not auto-approve. Qualification
unavailable must not assign real review work.

## Hard `CLOSED -> OPEN` launch gate

All items below are hard prerequisites. There is no partial launch. Every item
must be evidenced and reviewed before a separately authorized future phase may
open public application intake. L2-C2B defines the checklist; it does not
claim that the checklist has passed.

| # | Required before `OPEN` | L2-C2C status |
| ---: | --- | --- |
| 1 | Application contract version is frozen and reviewed. | Required; not a launch authorization |
| 2 | Public application notice matches that exact contract version. | Required; not a launch authorization |
| 3 | Field-purpose and data-minimization review is complete. | Required; not a launch authorization |
| 4 | Retention and deletion policy is explicitly defined. | IMPLEMENTED and documented; not a legal/compliance certification |
| 5 | Applicant withdrawal and deletion handling is defined. | IMPLEMENTED with immediate redaction and tombstone tests |
| 6 | Contact-information storage boundary is implemented. | IMPLEMENTED in-memory + PostgreSQL migration 007; isolated v6 -> v7 recovery evidence PASS |
| 7 | Contact information is excluded from reviewer-evidence and public projections. | IMPLEMENTED with positive-allowlist and authority-isolation regression tests |
| 8 | Production/staging storage access controls are reviewed. | PASS — private Railway/PostgreSQL staging path exercised; public intake remained CLOSED |
| 9 | Secret, log, and privacy audit passes. | PASS — bounded local and current Railway log scans found no sensitive values |
| 10 | Abuse, spam, and rate-limit controls are implemented. | PASS — bounded in-process limiter returned HTTP 429 in the loopback dry run; edge/CDN abuse control remains deferred |
| 11 | Request-size and malformed-input limits are implemented. | PASS — private HTTP checks observed 400/413/415/405 fail-closed behavior |
| 12 | Manual reviewer decision workflow is implemented. | PASS — private operator list/detail/decision/purge path exercised |
| 13 | Application submission cannot automatically provision a reviewer. | IMPLEMENTED and regression-tested; no authority mutation path |
| 14 | Application approval cannot bypass qualification. | IMPLEMENTED boundary; invitation records no qualification authority |
| 15 | Reviewer consent remains mandatory after invitation. | Existing P4 boundary preserved; no invitation-to-reviewer integration |
| 16 | Public intake kill switch exists and defaults to `CLOSED`. | IMPLEMENTED as separate `CLOSED`/`OPEN`/`PAUSED` setting; deployed `CLOSED` state rechecked |
| 17 | Staging end-to-end application dry run passes. | PASS — exact-main private loopback `OPEN` run completed, then CLOSED/PAUSED rechecks and cleanup completed |
| 18 | Duplicate, retry, and idempotency behavior is defined. | PASS — first, identical, concurrent, and altered-body PostgreSQL-backed requests verified |
| 19 | Operator authorization for application review is verified. | PASS — unauthenticated 401, ordinary reviewer 403, and authorized operator 200 observed |
| 20 | Public page accurately says whether intake is open or closed. | Current page says applications are not open |
| 21 | Rollback and close procedure is defined. | IMPLEMENTED: `OPEN -> CLOSED`/`PAUSED` stops new writes without destructive rollback |
| 22 | Separate explicit launch authorization is given. | Not given in L2-C2B |

The existing P4 service remains private and keeps its own public-intake
configuration closed. Passing implementation checks in this phase must still
not start a Community Review campaign, qualify a reviewer, or begin P5 without
those separately authorized phases. The migration-recovery evidence closure is
recorded separately below. The final private staging evidence, including the
loopback-only `OPEN` dry run and final external `CLOSED` recheck, is recorded in
[`docs/community-review-staging-gate.md`](community-review-staging-gate.md).

## Migration-recovery evidence closure

The L2-C2C-R recovery blocker is **CLOSED / PASS**. A Neon point-in-time branch
from the existing staging database lineage was verified at a pre-007 v6 point,
including exact repository checksums for migrations `001` through `006`,
pre-007 schema and row-count checks, and absence of migration `007`. The exact
repository migration `007_community_review_application_intake.sql` was then
replayed in that isolated branch as one transaction and verified at v7 with
the four application tables, three expected indexes, 37 constraints, zero
application-related rows, and unchanged pre-existing row counts. The full
safe evidence record, including non-secret deployment identifiers and the
active closed-state recheck, is in
[`docs/community-review-staging-gate.md`](community-review-staging-gate.md).

The final private staging application gate is now **PASS**. The public
application endpoint remains closed: the exact active Railway deployment
reported source SHA `915a04003817ad7a7aac606b7945614be748a5ca`, migration v7,
live/ready success, a closed-state 409 with zero writes, and a final
unauthenticated operator 401. A separate local child process used the exact
current service build with real staging PostgreSQL, bound only to
`127.0.0.1:61847`, and completed the synthetic OPEN submission, idempotency,
HTTP, authorization, decision-separation, withdrawal/redaction, rate-limit,
PAUSED/CLOSED, cleanup, and privacy checks without opening the deployed
listener. Detailed non-secret evidence is recorded in
[`docs/community-review-staging-gate.md`](community-review-staging-gate.md).

## Public transparency

`/community/` remains explanatory and read-only. It now states what the future
contract expects to ask:

- one contact email;
- preferred review language;
- short motivation;
- optional relevant experience; and
- approximate availability.

It also states plainly: **Applications are not open yet.** The page adds no
form, input controls, waitlist, reviewer login, or application endpoint.

## Explicit phase boundary

```text
L2-C2C implementation delivery                                              PASS — merged
Migration-recovery evidence (L2-C2C-R)                                       PASS — isolated pre-007 v6 -> v7 replay
Private staging application gate                                             PASS — final private staging closure
L2-C2C overall                                                                PASS — closed intake staging gate

Application contract                  IMPLEMENTED
Application persistence               IMPLEMENTED
Submission idempotency                IMPLEMENTED; isolated v6 -> v7 replay PASS
Applicant withdrawal/deletion         IMPLEMENTED
Retention policy                       DEFINED + ENFORCEABLE
Operator manual decision              IMPLEMENTED
Contact/evidence separation           IMPLEMENTED; additive v7/recovery checks PASS
Application intake kill switch        IMPLEMENTED; deployed `CLOSED` state verified
Private staging application E2E        PASS — loopback-only `OPEN` and final `CLOSED` recheck
Staging application intake            MUST REMAIN CLOSED
Public participation information      OPEN
Public application                    NOT OPEN
Public reviewer intake                NOT OPEN
Real Community Review campaign        NOT STARTED
Reviewer Portal                       NOT STARTED
P5 human calibration                  NOT STARTED
```

No public application opening follows from this implementation. Separate
launch authorization remains required, #22 is **NOT GIVEN**, and this phase
does not start L2-C2D, reviewer intake, a Community Review campaign, Reviewer
Portal work, or P5 calibration.
