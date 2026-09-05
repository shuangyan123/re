# Community Review Protocol P3

Status: **Protocol defined. Community Review service not yet open.**
`community-review-protocol@0.1.0` is ready for a future P4 Community Review
service. No P4 service is deployed, no public reviewer intake is open, and this
document does not authorize a real review campaign.

This is a provider-independent protocol for collecting independent human
annotations on Tutor responses. It is a protocol boundary, not a tutor,
provider integration, authentication service, database, leaderboard, or
calibration claim.

## Scope and non-goals

P3 provides typed contracts, strict runtime validators, deterministic
SHA-256 semantic fingerprints, synthetic fixtures, and pure lifecycle helpers
for:

- a qualification receipt envelope;
- a sealed batch and its reviewer assignments;
- positive-allowlist reviewer packets;
- exact atomic submissions;
- close and freeze records;
- descriptive human-human agreement evidence; and
- explicit-policy public evidence projections.

P3 does not provide a service, account system, issuer authentication, private
key infrastructure, anti-replay storage, rate limiting, reviewer payments,
real qualification, real review, adjudication, an LLM Judge, calibration,
statistical inference, or a public leaderboard. A local receipt can be
well-formed without proving that a server issued it; that issuer boundary is
reserved for P4.

The implementation remains independent of Review Workspace. It has no import
of Review Workspace services, repositories, UI, Electron code, or databases;
it also makes no model or provider calls.

## Evidence classes and historical boundary

Only a fresh, sealed batch created for this protocol can become future
Community Review evidence. Historical Human Reference and Pilot artifacts are
not silently upgraded or reclassified.

| Material | P3 treatment |
| --- | --- |
| `community-review-protocol@0.1.0` contracts and validators | Protocol definition only |
| `synthetic-fixture` plus the three-field synthetic marker | Executable test material; not human calibration data and not Community Review evidence |
| `human-reference-material-calibration@0.1.0` and `human-reference-semantic-audit@0.1.0` | Historical identities and assets remain unchanged |
| Human Reference semantic-audit `@0.2.0`, `@0.2.1`, and reviewer-comprehension `@0.1.0`, `@0.1.1` | Historical or controlled/training material; their public qualification content is not a secure sealed P3 qualification |
| Historical Pilot #1 and #2 | Methodology evidence only; public disclosure cannot regain blindness |

In particular, `src/calibration/human-reference-semantic-audit-qualification-fixture.ts`
contains expected assessments by design for its historical controlled
workflow. P3 does not delete, change, or freeze that fixture, and P3 receipt
parsers do not accept its result or packet shapes as Community Review receipts.

Synthetic markers are provenance labels, not evidence-quality upgrades. A
synthetic pool may exercise the full state machine but must continue to say
that it is not Community Review evidence.

## Versioned identity

Every boundary that can affect interpretation is bound explicitly:

- protocol ID and protocol version;
- fixed instrument ID and instrument version;
- annotation-guide ID, version, and fingerprint;
- canonical locale and review locale;
- localization ID/version, source locale, source instrument fingerprint, and
  localized visible-task fingerprint when the review locale differs;
- qualification protocol, qualification ID/version, pool/version, and
  qualification-definition fingerprint;
- sealed source fingerprint; and
- visible task-set fingerprint.

The npm package version is not a substitute for a protocol, instrument, guide,
qualification, localization, or task-set version. Fingerprints use canonical
JSON with sorted object keys and SHA-256. Visible-task and atomic lists are
normalized before their fingerprints are computed, so presentation order
does not change semantic identity while a content or guide change does.

Reviewer IDs are opaque protocol IDs only. Names, email addresses, phone
numbers, GitHub or Discord identities, IP addresses, device identifiers,
cookies, OAuth data, and other contact or tracking data are outside the
contract.

## Qualification receipt envelope

A receipt is an eligibility envelope, not a qualification answer export. It
binds the exact Community Review qualification protocol/version, qualification
ID/version, qualification pool/version, definition fingerprint, opaque
reviewer ID, review locale, and eligible instrument identity/fingerprint. Its
only positive result is `qualificationStatus: "qualified"`.

The receipt intentionally excludes the qualification percentage, answer key,
expected statuses, raw responses, item text, credentials, issuer secrets,
signatures, and private keys. A caller must compare every qualification field
with the batch's `qualificationEligibility`; a receipt from another
qualification definition, pool, locale, or instrument is rejected.

The public historical qualification fixture remains readable for its own
controlled/training tests, but it is not a sealed public gate and cannot be
replayed as a P3 receipt.

## Blind reviewer packet

Packets are constructed as a positive reviewer-facing projection. They carry
only the assignment envelope, instrument identity, task-set fingerprint, and
the following visible task fields:

- case ID;
- learning objective;
- student profile;
- conversation history;
- student message;
- problem context;
- visible rubric IDs, criteria, requirement IDs, and descriptions; and
- Tutor response.

Packets do not carry `groundTruth`, `knownMisconception`, disclosure policy,
expected statuses, reference labels, consensus, adjudication, Judge output,
another reviewer's material, provider metadata, or hidden reasoning. The
allowlist is applied while constructing the packet; it is not a large
evaluator object with hidden fields removed afterward.

The `sealed-until-close` mode means that a reviewer receives only their own
assignment and packet. P3 has no service-side delivery or access-control
implementation; those controls remain P4 responsibilities.

## Annotation and submission rules

Each reviewer submits exactly one annotation for each visible atomic
requirement in their assignment. Duplicate, missing, extra, wrong-owner, or
cross-batch atoms are rejected. The only statuses are:

- `SATISFIED`;
- `OMITTED_OR_INCOMPLETE`; and
- `EXPLICIT_CONFLICT`.

Evidence is optional and is limited to 500 characters. A submission binds the
reviewer, assignment, batch, packet, instrument, task set, qualification
receipt, disposition, and submission fingerprint. A late or replacement
submission is never silently substituted for an accepted submission; it is
represented as `not-part-of-closed-batch` and rejected by the close operation.

## Batch lifecycle and coverage

The pure P3 lifecycle is:

```text
SEALED -> OPEN -> CLOSED -> FROZEN
```

`SEALED` commits to the source and visible task set. `OPEN` permits assignment
and submission. `CLOSED` freezes the accepted reviewer IDs, assignment IDs,
submission fingerprints, and coverage. `FROZEN` retains that accepted set for
future analysis; it cannot receive a new, late, or replacement submission.

An `interpretable` batch requires at least two independent accepted reviewers.
A `pilot`, `non-reference`, or `incomplete` batch may be under-covered only
when its purpose is explicitly marked and the resulting coverage says
`incomplete`. An under-covered pool must not be presented as complete
interpretable evidence.

## Agreement evidence

Agreement is descriptive human-human consistency evidence. P3 reuses the
existing provider-independent 3x3 atomic pairwise machinery and retains:

- pairwise reports;
- raw agreement and disagreement counts;
- the 3x3 confusion matrix;
- per-requirement and per-case status distributions;
- disagreement identities and optional reviewer evidence; and
- missing or withdrawn assignment counts.

P3 does not majority-vote, adjudicate, invoke a Judge, derive a gold label,
create a reference set, claim accuracy, claim calibration, or create a
leaderboard result. Agreement is not correctness. Consensus is not gold.
Qualification is not calibration. A frozen pool is not an adjudicated
reference. Blindness is not accuracy.

## Public disclosure

Disclosure is built from a frozen pool under an explicit policy:

- reviewer IDs may be published or omitted;
- atomic annotations may be published or omitted; and
- reviewer evidence may be published only together with reviewer IDs and
  annotations.

The default projection omits reviewer IDs, raw annotations, and reviewer
evidence while retaining aggregate descriptive evidence and fingerprints.
When a policy permits raw evidence, it still excludes qualification answers,
credentials, secrets, hidden evaluator fields, and provider payloads. Public
artifacts bind the protocol, instrument, qualification eligibility, batch,
visible task set, frozen pool, accepted submission fingerprints, disclosure
date, policy, agreement summary, and explicit limitations.

## P4 handoff

P3 is complete when the contracts, validators, pure lifecycle functions,
synthetic regression tests, and documentation remain green under the normal
repository gates. It stops at:

`READY FOR P4 COMMUNITY REVIEW SERVICE`

P4 must separately specify and implement service-side issuer/authentication,
sealed delivery, qualification anti-replay state, reviewer consent and
withdrawal handling, storage/retention, operational abuse controls, and
real-review intake. None of those capabilities is implied by a valid P3
object or local fingerprint.
