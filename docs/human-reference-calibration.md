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

## Strict JSON persistence and local workflow

The pilot input files are ordinary JSON, but they are untrusted runtime data.
`parseHumanReferenceAnnotationFile()` and
`parseHumanReferenceAdjudicationFile()` reject malformed protocol identity,
unknown fields, duplicate identities, invalid statuses, wrong rubric owners,
hidden/provider fields, and invalid synthetic markers. A persisted
`HumanReferenceSet` is accepted only after the parser reconstructs every task
atom and verifies that references, unresolved disagreements, and missing
annotations form an exact non-overlapping partition. Coverage counts and
`referenceCoverageShare` are recomputed from the task requirements; supplied
totals are never trusted.

The provider-free local command is:

```text
tutorbench human-reference-calibration \
  --annotations fixtures/human-reference-calibration/synthetic-annotations.json \
  --adjudications fixtures/human-reference-calibration/synthetic-adjudications.json \
  --output artifacts/human-reference-calibration-report.json
```

It performs no Tutor or Judge call. The report contains human-human agreement,
reference coverage, resolved references, unresolved disagreements, missing
annotations, and labels derived only from fully resolved rubrics. It does not
claim accuracy or emit a calibrated score. `humanReferenceDataPresent` is the
clear report-level provenance field. The existing
`HumanReferenceSet.humanCalibrationAvailable` field is retained for contract
compatibility, but is provenance-only (`dataKind === "human-reference"`); it
does not mean complete coverage, readiness, or Judge calibration.

These states remain distinct:

```text
valid JSON set -> may be incomplete -> complete coverage -> separate Judge/reference agreement
```

Complete coverage is still not a calibration claim. Only a separately approved
human pilot with documented reviewers, adjudication, and validation can support
calibration readiness; readiness is not inferred by any automatic coverage
threshold. The checked-in files under
`fixtures/human-reference-calibration/` are synthetic regression fixtures, not
human annotations.

## Running the first blind human pilot (historical and frozen)

The first pilot is intentionally limited to the fixed three-response
word-context diagnostic: three visible Tutor responses and twelve atomic
requirements, completed independently by two annotators. Export it with:

```text
npm run build
node dist/src/cli/tutorbench.js human-reference-pilot-export \
  --fixture word-context \
  --annotator annotator-a \
  --annotator annotator-b \
  --output-dir artifacts/human-reference-pilot/word-context-001
```

The command writes two packets, two matching editable submission templates,
and one shared guide:

```text
artifacts/human-reference-pilot/word-context-001/annotator-a.packet.json
artifacts/human-reference-pilot/word-context-001/annotator-a.submission-template.json
artifacts/human-reference-pilot/word-context-001/annotator-b.packet.json
artifacts/human-reference-pilot/word-context-001/annotator-b.submission-template.json
artifacts/human-reference-pilot/word-context-001/ANNOTATION_GUIDE.md
```

Give only the A packet and matching A template to annotator A, and only the B
packet and matching B template to annotator B. Both annotators receive the same
`ANNOTATION_GUIDE.md`. The packets have the same allowlisted visible evidence:
case identity, learning objective, learner/context fields, Tutor response,
rubric, and explicit atomic requirements. Packets do not contain developer
expected labels, Judge output/evidence/reasoning, provider metadata, prior
annotation, or adjudication. The task-set fingerprint binds a completed
submission to the exported packet set.

The submission templates are editable working documents, not canonical
`HumanReferencePilotSubmission` values. They already contain the pilot, batch,
protocol, fingerprint, annotator identity, and one empty-status slot for every
visible atomic requirement. The strict completed-submission parser must reject
an untouched template because `status` is empty; do not change that parser or
use a template as imported evidence.

Each annotator should:

1. receive only their matching packet and submission template;
2. read the shared `ANNOTATION_GUIDE.md`;
3. inspect each visible atomic requirement independently;
4. replace every empty `status` with `SATISFIED`, `OMITTED_OR_INCOMPLETE`, or
   `EXPLICIT_CONFLICT` according to the guide;
5. optionally add a short `evidence` field grounded only in the visible Tutor
   response; and
6. save the completed file as
   `annotator-a.completed.json` or `annotator-b.completed.json`.

No technical IDs need to be copied by hand. Evidence is optional and capped at
500 characters; leave the optional field absent when no evidence is recorded.
For a real pilot keep `dataKind: "human-annotation"` and do not add a synthetic
fixture marker. Synthetic provider-free tests may instead use
`dataKind: "synthetic-fixture"` plus both marker fields, and their output is
never human-reference evidence. Do not exchange completed files until both
annotators have finished.

After both annotators finish, import only the two submissions:

```text
node dist/src/cli/tutorbench.js human-reference-pilot-import \
  --packet-dir artifacts/human-reference-pilot/word-context-001 \
  --submission artifacts/human-reference-pilot/word-context-001/annotator-a.completed.json \
  --submission artifacts/human-reference-pilot/word-context-001/annotator-b.completed.json \
  --output artifacts/human-reference-pilot/word-context-001/human-reference-annotations.json
```

Import fails closed for missing, duplicate, unexpected, stale, or wrong-owner
atoms; mismatched pilot/protocol/fingerprint; wrong annotator identity; extra
fields; unsupported statuses; and oversized evidence. It converts the two
complete submissions to the existing `HumanReferenceAnnotationFile` and
re-parses that canonical file before writing it. Import does not adjudicate,
majority-vote, consult developer expectations, or derive a semantic winner.

Run the existing calibration workflow without adjudications first:

```text
node dist/src/cli/tutorbench.js human-reference-calibration \
  --annotations artifacts/human-reference-pilot/word-context-001/human-reference-annotations.json \
  --output artifacts/human-reference-pilot/word-context-001/human-reference-report.json
```

The operational lifecycle is:

1. export the pilot, templates, and shared guide;
2. give A's packet/template only to annotator A;
3. give B's packet/template only to annotator B;
4. have both annotators complete submissions independently;
5. import and merge the two submissions;
6. run `human-reference-calibration` without adjudications;
7. inspect human-human agreement first;
8. adjudicate disagreements separately;
9. rerun calibration with explicit adjudications;
10. only after human reference exists, compare Material Requirement Judge v0.4 against that reference.

Human-human agreement comes before Judge agreement. High agreement with
developer-expected labels is not evidence of calibration. Complete reference
coverage is not automatically calibration readiness, and no automatic
threshold turns this pilot into “calibrated”. This workflow provides packet
export, editable submission templates, a neutral shared annotation guide, and
strict submission import; a dedicated disagreement-only adjudication template
is a separate follow-up.

Pilot #1 is a frozen historical experiment. Its source remains
`word-context@0.2.0`, its three A/B/C Tutor responses and twelve atomics remain
unchanged, and re-export continues to use blind-pilot protocol `@0.1.0` plus
the original guide semantics. Existing v0.1.0 packets and completed
submissions remain valid; they are not rewritten to include later guide fields.

## Running boundary-focused Human Reference Pilot #2

Pilot #2 tests whether two independent annotators apply atomic annotation
boundaries consistently. It does not test or tune the Judge. Its independent
synthetic source is:

```text
word-context-human-boundaries@0.1.0
```

The pilot uses six short Tutor-response cases, the same four visible R1–R4
atomic requirement descriptions per case, and therefore 24 decisions per
annotator (48 for two annotators). The cases isolate these boundaries:

- explicit evaluation of the student's proposed meaning against context;
- clue discussion without a relation back to the proposed meaning;
- clue support separated from an explicit overstatement of sufficiency;
- omission of the evidence-sufficiency limitation without an explicit conflict;
- context-grounded correction, which is not automatic rejection; and
- an unsupported direct verdict, which can explicitly conflict with R4.

Pilot #2 uses blind-pilot protocol `@0.2.0`. Its packet, editable template, and
completed submission bind the clarified neutral guide as:

```text
human-reference-material-annotation-guide@0.2.0
```

That binding prevents a guide from being silently replaced under the same
pilot identity. The historical v0.1.0 envelope is unchanged and deliberately
has no retroactively added guide fields.

Export Pilot #2 with:

```text
npm run build
node dist/src/cli/tutorbench.js human-reference-pilot-export \
  --fixture word-context-human-boundaries \
  --annotator annotator-a \
  --annotator annotator-b \
  --pilot-id human-reference-word-context-boundaries-002 \
  --output-dir artifacts/human-reference-pilot/word-context-boundaries-002
```

The command writes the same five file roles as Pilot #1: two identical-task
packets with different opaque annotator owners, two empty-status submission
templates, and one shared `ANNOTATION_GUIDE.md`. The blindness allowlist is
unchanged: no developer expected status, derived benchmark label, Judge
result/evidence/reasoning, provider metadata, other annotator data, or
adjudication enters a packet, template, or guide.

After both annotators finish independently, import exactly two complete files:

```text
node dist/src/cli/tutorbench.js human-reference-pilot-import \
  --packet-dir artifacts/human-reference-pilot/word-context-boundaries-002 \
  --submission artifacts/human-reference-pilot/word-context-boundaries-002/annotator-a.completed.json \
  --submission artifacts/human-reference-pilot/word-context-boundaries-002/annotator-b.completed.json \
  --output artifacts/human-reference-pilot/word-context-boundaries-002/human-reference-annotations.json
```

Import remains fail-closed for stale or cross-pilot files, wrong pilot/source/
protocol/guide/fingerprint/annotator identity, and duplicate, missing, extra, or
wrong-owner atomics. It does not adjudicate, majority-vote, read Judge results,
or consult developer expectations.

Inspect human-human agreement first, adjudicate disagreements explicitly, and
only then compare the frozen Material Requirement Judge v0.4 with the resolved
human reference. There is no automatic agreement threshold. Pilot #2 is not a
gold standard, and neither complete coverage nor agreement makes the Judge
calibrated. Real packets, submissions, reports, adjudications, and provider
comparison artifacts remain local, private, and ignored; no real human
annotation values are committed.

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
