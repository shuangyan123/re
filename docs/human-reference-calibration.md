# Material atomic human-reference calibration

## Status and protocol identity

This document defines the provider-independent calibration layer for the
experimental Material Requirement Judge. The protocol is:

```text
human-reference-material-calibration@0.1.0
```

The Material Requirement Judge prompt `@0.4` is frozen for this work. This
layer does not create prompt v0.5, call a provider, or convert the existing
developer-authored synthetic expectations into human reference data.

The contracts are implemented in
[`src/contracts/human-reference-calibration.ts`](../src/contracts/human-reference-calibration.ts)
and its strict parser in
[`src/contracts/human-reference-calibration-validation.ts`](../src/contracts/human-reference-calibration-validation.ts).
Deterministic agreement, reference construction, and Judge comparison live in
the material human-reference modules under
[`src/calibration`](../src/calibration).

## Shared visible evidence boundary

`HumanReferenceAnnotationTask` is the Material Requirement Judge input with a
calibration schema wrapper. It carries the same case ID, learning objective,
student profile, conversation history, student message, problem context,
ground truth context, known misconception, disclosure policy, Tutor response,
and explicit material rubrics/requirements.

It contains no expected atomic status, derived label, prior Judge result, Judge
evidence, previous annotation, or adjudicated reference. The strict parser
delegates the task body to the existing `MaterialRequirementJudgeInput`
parser, so a human annotator and the experimental Judge receive the same
visible semantic evidence boundary.

The optional `assertHumanAnnotatorTaskComplete()` check is strict for a single
annotator stream: every supplied rubric and requirement must occur exactly
once under its original owner. Batch ingestion may intentionally retain a
partial stream so missing availability can be reported separately.

## Atomic annotation contract

`HumanAtomicAnnotation` contains:

- schema version `1`;
- `caseId`, `rubricId`, and `requirementId`;
- an opaque stable `annotatorId`;
- exactly one of `SATISFIED`, `OMITTED_OR_INCOMPLETE`, or
  `EXPLICIT_CONFLICT`;
- optional short evidence, capped at 500 characters.

There is no fourth semantic status. If an annotator cannot complete a task,
that is represented by missing annotation availability, not by an `UNKNOWN`
status. Evidence is limited to brief, auditable text grounded in the visible
Tutor response. Names, email addresses, hidden reasoning, provider metadata,
and raw payloads are not accepted by the parser.

`HumanAnnotationBatch` records a batch ID, calibration protocol ID/version, tasks, and
annotations. Synthetic tests use `dataKind: "synthetic-fixture"` together
with `{ "synthetic": true, "notHumanCalibrationData": true }`; that marker is
never treated as human calibration evidence.

## Human-human agreement

`calculateHumanPairwiseAgreement()` compares two explicitly named annotator
streams by `(caseId, rubricId, requirementId)`. The confusion matrix is
directional:

```text
row    = annotator A status
column = annotator B status
```

The report contains comparable atomic count, agreement/disagreement counts,
agreement share, the complete 3 x 3 matrix, per-status counts, and auditable
disagreement records with both statuses and optional evidence. An atom present
for only one annotator is listed under `missingForAnnotatorA` or
`missingForAnnotatorB`; it is not a semantic disagreement and is excluded from
the agreement denominator.

No kappa or other inferential statistic is required by this protocol. Raw
counts and the confusion matrix are the primary evidence.

## Explicit adjudication and reference provenance

`HumanAtomicAdjudication` records the unit, source annotator IDs, each source
status, the adjudicated status, and optional evidence/reason. The reference
builder never majority-votes and never calls the Judge or reads synthetic
expectations to break a tie.

For each supplied atomic requirement:

1. all required annotators agree → `human_consensus` reference;
2. annotators disagree and a valid explicit adjudication covers the source
   statuses → `human_adjudicated` reference;
3. annotators disagree without adjudication → unresolved disagreement, with no
   reference status;
4. one or more annotations are missing → missing availability, with no
   reference status.

`ReferenceAtomicAssessment` permits only the two human provenance values above.
`developer_expected` is not a reference provenance. An unresolved disagreement
cannot be used to derive a reference label.

The builder reports:

- `plannedAtomicAssessments`;
- `resolvedAtomicAssessments`;
- `unresolvedAtomicAssessments`;
- `missingAtomicAssessments`;
- `referenceCoverageShare = resolved / planned`.

Coverage and agreement are separate dimensions. Missing annotations and
unresolved disagreements never become semantic failure labels.

## Shared deterministic severity layer

Resolved human atomic references are passed through the existing
`aggregateMaterialRequirementAssessments()` function. No second human scoring
policy is introduced:

```text
human atomic reference -> existing aggregator -> PASS / PARTIAL / FAIL
Judge atomic result     -> existing aggregator -> PASS / PARTIAL / FAIL
```

`deriveHumanReferenceRubricLabels()` emits labels only for rubrics whose every
material requirement has a resolved reference. Partial reference coverage does
not silently produce a rubric label.

## Judge-vs-reference comparison

`compareJudgeToHumanReference()` compares a validated Material Requirement Judge
result to resolved human consensus/adjudicated atoms. Its atomic section is
named `referenceAgreement` and contains comparable count, raw agreement,
disagreement, directional reference-row/Judge-column confusion matrix, and
disagreement records. Its derived section separately compares rubric labels
after both sides use the existing aggregator.

The report does not call this metric `accuracy`. A calibration protocol with
independent human reference data must be established before stronger claims
are considered. Judge execution availability is an upstream concern and is
not mixed into this semantic comparison denominator.

## Synthetic regression fixture

Provider-free tests exercise three atomic examples:

1. A and B both mark `SATISFIED` → consensus reference;
2. A marks `OMITTED_OR_INCOMPLETE`, B marks `EXPLICIT_CONFLICT` → unresolved
   until an explicit adjudication resolves it to `EXPLICIT_CONFLICT`;
3. A is present and B is missing → missing availability, not disagreement.

The tests also assert a directional `SATISFIED` → `OMITTED_OR_INCOMPLETE`
confusion-matrix cell, strict ownership/completeness failures, evidence and
privacy boundaries, shared aggregation, coverage, provenance, and the absence
of synthetic expectation leakage. No real annotation data is committed.
