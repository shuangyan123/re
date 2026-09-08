# Community Review Participation Application Contract / Launch Gate

Status: **L2-C2B contract defined; public application intake remains CLOSED.**

This document defines the small, versioned contract that a future manual
invitation workflow may use and the hard gate that must be satisfied before
public applications can move from `CLOSED` to `OPEN`. It does not authorize
recruitment, collect an application, or implement an application service.

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

L2-C2B adds a provider-independent TypeScript contract, strict runtime
validation, focused regression tests, and this launch-gate record. It does not
add persistence, a database table, HTTP handling, authentication, an email
sender, an application form, an invitation sender, reviewer provisioning, a
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
logically separate from protocol evidence. This phase does not define a
retention or deletion duration. A retention/deletion policy is a required
launch-gate item below.

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

L2-C2B does not implement live state storage or an intake route. The executable
state resolver is fail-closed: missing, null, empty, whitespace-padded, or
malformed primitive configuration resolves to `CLOSED`; a known state is
returned as-is; an unknown non-empty state name is rejected rather than
guessed. `OPEN` is never the fallback for a missing flag.

Storage unavailable means a future submission must be rejected, not silently
accepted. Manual review unavailable must not auto-approve. Qualification
unavailable must not assign real review work.

## Hard `CLOSED -> OPEN` launch gate

All items below are hard prerequisites. There is no partial launch. Every item
must be evidenced and reviewed before a separately authorized future phase may
open public application intake. L2-C2B defines the checklist; it does not
claim that the checklist has passed.

| # | Required before `OPEN` | L2-C2B status |
| ---: | --- | --- |
| 1 | Application contract version is frozen and reviewed. | Required; not a launch authorization |
| 2 | Public application notice matches that exact contract version. | Required; not a launch authorization |
| 3 | Field-purpose and data-minimization review is complete. | Required; not a launch authorization |
| 4 | Retention and deletion policy is explicitly defined. | Deferred to intake implementation |
| 5 | Applicant withdrawal and deletion handling is defined. | Deferred to intake implementation |
| 6 | Contact-information storage boundary is implemented. | Deferred to intake implementation |
| 7 | Contact information is excluded from reviewer-evidence and public projections. | Contract boundary defined; implementation deferred |
| 8 | Production/staging storage access controls are reviewed. | Deferred to intake implementation |
| 9 | Secret, log, and privacy audit passes. | Deferred to intake implementation |
| 10 | Abuse, spam, and rate-limit controls are implemented. | Deferred to intake implementation |
| 11 | Request-size and malformed-input limits are implemented. | Deferred to intake implementation |
| 12 | Manual reviewer decision workflow is implemented. | Deferred to intake implementation |
| 13 | Application submission cannot automatically provision a reviewer. | Contract boundary defined; implementation deferred |
| 14 | Application approval cannot bypass qualification. | Contract boundary defined; implementation deferred |
| 15 | Reviewer consent remains mandatory after invitation. | Existing P4 boundary; intake integration deferred |
| 16 | Public intake kill switch exists and defaults to `CLOSED`. | Existing service remains closed; intake kill switch deferred |
| 17 | Staging end-to-end application dry run passes. | Deferred to intake implementation |
| 18 | Duplicate, retry, and idempotency behavior is defined. | Deferred to intake implementation |
| 19 | Operator authorization for application review is verified. | Deferred to intake implementation |
| 20 | Public page accurately says whether intake is open or closed. | Current page says applications are not open |
| 21 | Rollback and close procedure is defined. | Deferred to intake implementation |
| 22 | Separate explicit launch authorization is given. | Not given in L2-C2B |

The existing P4 service remains private and keeps its own public-intake
configuration closed. Passing this checklist in a future phase must still not
start a Community Review campaign, qualify a reviewer, or begin P5 without
those separately authorized phases.

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
L2-C2B — Participation Application Contract / Closed-to-Open Gate    PASS

Application contract                  DEFINED
Application launch gate               DEFINED
Public participation information      OPEN
Public application                    NOT OPEN
Public reviewer intake                NOT OPEN
Real Community Review campaign        NOT STARTED
Reviewer Portal                       NOT STARTED
P5 human calibration                  NOT STARTED
```

The next implementation phase, if separately authorized, must add the
retention/deletion, storage, abuse, operator, and end-to-end controls required
above before it can consider changing the public application state. L2-C2B
does not start L2-C2C or any later phase.
