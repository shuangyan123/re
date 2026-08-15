# TutorEval v0.2B — Rubric Review and Calibration Infrastructure

TutorEval 0.2B adds a reproducible annotation boundary around the existing
0.2A cases. It measures rubric interpretability and reviewer agreement. It is
not a measurement of student learning impact, retention, transfer, or model
quality by itself.

This phase does not call OpenAI, Anthropic, Gemini, or any other model API. It
does not add a Judge provider, a database, a dashboard, or a Review Workspace
adapter.

## Three separate concepts

The following remain different data boundaries:

```text
rubric definition
≠ human annotation
≠ LLM Judge output
```

The existing `TutorEvalRubric` defines an observable criterion. A
`HumanRubricAnnotation` is one pseudonymous reviewer's judgment of one
candidate response against one rubric. The existing `TutorEvalJudgeResult`
remains an injected future-Judge result and is never used as human evidence.

## Calibration unit and identities

The atomic unit is:

```text
dataset + case/version + candidate response + rubric
  -> PASS | PARTIAL | FAIL | UNSURE
```

Candidate responses use `responseId` and may retain a `sourceRun` containing
the existing TutorEval `runId` and `runIndex`. Every annotation repeats:

```text
datasetId + datasetVersion
caseId + caseVersion
responseId + rubricId
```

Runtime validation checks that the response belongs to the case, the case
version is current, and the rubric ID exists in that case version. A semantic
rubric change must bump the case version before new annotations are created;
old annotations continue to point to the old semantics.

`reviewerId` and `adjudicatorId` are pseudonymous IDs such as `reviewer-a` or
`expert-01`. The parser rejects email-like identities and does not define any
field for names, accounts, or contact details.

## Candidate corpus and blind packet

Candidate records are stored separately from annotations. They can retain
internal tutor provenance, including provider/model/prompt metadata, but
`buildCalibrationPacket()` never copies those fields into the reviewer-facing
packet.

The packet has `blind: true` and contains, for each candidate/rubric pair:

- the Tutor-visible case input;
- the candidate response text;
- the rubric ID, category, criterion, behavior, and capability tag;
- only the reviewer context needed for that criterion, such as disclosure
  policy, a relevant answer identity, or a known misconception.

The reviewer context is explicitly separate from `studentVisibleContext`. It
does not become TutorUnderTest input. Packet entries are sorted by response ID
and rubric ID, so the export is deterministic.

Generate the checked-in synthetic packet locally with:

```bash
npm run calibration:export
```

The output is written to ignored `artifacts/` by default.

## Independent review lifecycle

Each reviewer receives the same blind packet and writes a separate annotation
file. A stream contains only that reviewer's labels; it must not include or
depend on another reviewer's answers.

The intended lifecycle is:

```text
candidate response
  -> blind independent annotations
  -> agreement report
  -> adjudication for disagreement or UNSURE
  -> reference labels
  -> future Judge comparison
```

`UNSURE` is not converted to `PARTIAL`. It records that a reviewer could not
make a reliable decision and requires adjudication before a reference label is
generated. Adjudication is a separate record that retains all source
annotation IDs, rationale, and a pseudonymous adjudicator ID; it never edits an
original annotation.

## Agreement and ambiguity

The pure agreement functions provide:

- exact agreement across all paired labels;
- scored exact agreement after excluding pairs containing `UNSURE`;
- a PASS/PARTIAL/FAIL confusion matrix;
- Cohen's kappa;
- linear weighted Cohen's kappa, where PASS-to-PARTIAL is less distant than
  PASS-to-FAIL;
- rubric-level disagreement identities and reviewer labels.

Kappa is reported as a metric only. This phase does not define a calibration
threshold such as `kappa >= 0.8`.

Reports also include ambiguity and `UNSURE` rates, plus deterministic
breakdowns by case, rubric, category, capability tag, subject, and disclosure
policy. Rubrics with any ambiguity or `UNSURE` are listed in descending rate
order; the report does not invent a universal “high ambiguity” threshold.

The disclosure and critical-failure semantics audit must be resolved before a
future calibration phase adds human labels for critical-failure type, severity,
or evidence. The current 0.2B contract remains rubric-level only and does not
interpret exploratory Judge disagreement as human gold.

Run the local pipeline with:

```bash
npm run calibration:validate
npm run calibration:report
npm run calibration:aggregate
```

The committed files under `fixtures/calibration/` are synthetic pipeline
fixtures. They are marked `synthetic` and `notHumanCalibrationData`; their
metrics do not establish expert review, human calibration, or a validated
reference standard. Real reviewer files should remain in ignored private
storage and use the same JSON contracts.

When no annotations are supplied, the report has no metric values and the CLI
prints:

```text
No human calibration data available.
```

## Future Judge boundary

0.2B does not execute an LLM Judge. Once real human annotation and
adjudication have produced a reference set, a later phase can compare a
provider-independent `CalibrationJudgeRubricLabel` against a reference using
the same:

```text
caseId + caseVersion + responseId + rubricId
```

That comparison can reuse exact agreement, confusion matrices, kappa, and the
dimension breakdowns. Judge self-reported confidence remains separate from
human agreement and is not ground truth.
