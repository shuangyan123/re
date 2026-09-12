# Canonical TutorEval Human Calibration Pilot Readiness

Status: **reviewer-ready infrastructure only; no real human calibration data**

Pilot identity:

```text
canonical-tutoreval-human-calibration-pilot-001@0.1.0
```

Dataset identity:

```text
tutor-eval-v0.2a@0.2a.6
```

Annotation guide:

```text
canonical-tutoreval-rubric-annotation-guide@0.1.0
```

This pilot prepares a small blind human-review package over current canonical
TutorEval rubrics. It reuses the existing 0.2B rubric-level calibration
contract (`PASS | PARTIAL | FAIL | UNSURE`), agreement metrics, adjudication,
and reference-set machinery. It does not create a new score, change benchmark
weights or thresholds, modify the Judge prompt, or start a real reviewer
campaign.

The fixed Tutor responses are developer-authored synthetic diagnostic stimuli.
They are not model-performance evidence. Checked-in tests use synthetic fixture
markers and cannot become human calibration evidence.

## Frozen pilot design

The pilot contains 9 canonical cases, 27 fixed responses, and 84 rubric-level
judgments per reviewer. Two independent reviewers therefore produce 168
judgments before adjudication.

The selected cases are:

| Case | Version | Policy | Primary pilot role |
| --- | --- | --- | --- |
| `fraction-misconception-001` | `1.2.0` | `hint_only` | diagnosis vs conceptual guidance vs procedural guidance vs actionability vs leakage |
| `fraction-misconception-001-zh-CN` | `1.2.0` | `hint_only` | authored zh-CN counterpart for reviewer-application consistency; not measurement invariance |
| `correct-answer-wrong-reasoning-001` | `1.1.0` | `partial_solution` | correct answer with invalid reasoning |
| `science-force-transfer-001` | `1.0.0` | `partial_solution` | adaptation plus executable next step |
| `science-density-knowledge-001` | `1.0.0` | `no_answer` | simple conceptual-correctness anchor plus desirable follow-up |
| `language-verb-check-001` | `1.0.1` | `full_solution_required` | diagnosis separated from corrected solution |
| `language-word-context-001` | `1.1.1` | `no_answer` | deliberately difficult material-requirement / ambiguity sentinel |
| `history-source-bias-001` | `1.0.0` | `full_solution_allowed` | diagnosis, conceptual precision, and desirable check |
| `programming-function-recall-001` | `1.0.0` | `full_solution_allowed` | comparatively low-ambiguity programming concept anchor |

Together they cover all five TutorEval categories, all five disclosure policies,
and all five current subjects. The English/zh-CN fraction pair is included to
exercise the corrected `1.2.0` rubric boundary, but this pilot must not be
reported as proof of cross-locale psychometric equivalence.

Each case has exactly three fixed response stimuli. The response IDs use neutral
`A`, `B`, and `C` suffixes. The reviewer package contains no developer expected
rubric labels for those responses.

## Export two blind reviewer packages

From a source checkout:

```bash
npm run calibration:pilot:export -- \
  --reviewer reviewer-a \
  --reviewer reviewer-b \
  --output-dir artifacts/canonical-calibration-pilot-001
```

Reviewer IDs are opaque pseudonyms. Do not use names or email addresses.

The operator receives:

```text
artifacts/canonical-calibration-pilot-001/
  operator/
    candidate-responses.json
    pilot-manifest.json
  reviewer-a/
    review-packet.json
    submission-template.json
    ANNOTATION_GUIDE.md
    REVIEWER_INSTRUCTIONS.md
  reviewer-b/
    review-packet.json
    submission-template.json
    ANNOTATION_GUIDE.md
    REVIEWER_INSTRUCTIONS.md
```

Give reviewer A only the four files in `reviewer-a/`; give reviewer B only the
four files in `reviewer-b/`. Do not give either reviewer the operator directory,
the other reviewer directory, Judge output, developer labels, or adjudication.

`review-packet.json` is produced by the existing 0.2B
`buildCalibrationPacket()` positive boundary. It contains the visible case,
candidate response, current rubric, and only rubric-relevant reviewer context.
It does not copy candidate provider/model provenance into the reviewer packet.

The manifest binds the exact dataset/case/rubric/response task set and the exact
annotation guide with SHA-256 fingerprints. It explicitly records that no human
calibration data is present.

## Reviewer completion

A reviewer should copy `submission-template.json` to a separate completed file
and then:

1. set top-level `completedAt` to an ISO-8601 timestamp;
2. replace every empty `label` with `PASS`, `PARTIAL`, `FAIL`, or `UNSURE`;
3. optionally add short response-grounded `evidence`;
4. set `ambiguity.present: true` with a short reason when the rubric is
   genuinely ambiguous; and
5. always set ambiguity true with a reason when using `UNSURE`.

The reviewer must not change dataset, pilot, guide, fingerprint, reviewer,
case, response, or rubric identities. An untouched template is intentionally
not valid completed evidence.

## Strict import

Import each completed submission against its original untouched template:

```bash
npm run calibration:pilot:import -- \
  --template artifacts/canonical-calibration-pilot-001/reviewer-a/submission-template.json \
  --submission artifacts/canonical-calibration-pilot-001/reviewer-a/reviewer-a.completed.json \
  --output artifacts/canonical-calibration-pilot-001/operator/reviewer-a.annotations.json

npm run calibration:pilot:import -- \
  --template artifacts/canonical-calibration-pilot-001/reviewer-b/submission-template.json \
  --submission artifacts/canonical-calibration-pilot-001/reviewer-b/reviewer-b.completed.json \
  --output artifacts/canonical-calibration-pilot-001/operator/reviewer-b.annotations.json
```

Import rebuilds the frozen `0.2a.6` pilot task set and fails closed for stale or
tampered pilot/guide/fingerprint identity, wrong reviewer ownership, wrong case
or rubric versions, missing/duplicate/extra task slots, unsupported labels,
invalid timestamps, or incomplete `UNSURE` ambiguity records. The output is the
existing `CalibrationAnnotationFile`; no parallel human-label schema is added.

Real completed reviewer files should remain private and ignored unless a later
explicit governance decision establishes a different evidence publication
boundary.

## Agreement before adjudication

After both independent imports, run the existing calibration report without an
adjudication file:

```bash
npm run calibration:report -- \
  --candidate artifacts/canonical-calibration-pilot-001/operator/candidate-responses.json \
  --reviewer artifacts/canonical-calibration-pilot-001/operator/reviewer-a.annotations.json \
  --reviewer artifacts/canonical-calibration-pilot-001/operator/reviewer-b.annotations.json \
  --no-adjudication \
  --output artifacts/canonical-calibration-pilot-001/operator/agreement-report.json
```

Inspect human-human agreement, `UNSURE`, ambiguity, and disagreement identities
before any Judge comparison. There is no automatic kappa or agreement threshold
that turns the pilot into “calibrated”.

Any disagreement or `UNSURE` must be resolved only through an explicit existing
0.2B `CalibrationAdjudicationFile`, retaining both source annotation IDs, a
pseudonymous adjudicator ID, rationale, and final scored label. Original reviewer
files remain immutable. After adjudication, rerun the existing calibration
report/aggregate path with `--adjudication <file>` to construct the versioned
reference set.

## Claim boundary

Completing this implementation means only that the pilot is operationally
ready. It does not mean that:

- a real reviewer has participated;
- independent human rubric review is complete;
- a human reference set exists;
- Judge-vs-human calibration is complete;
- the 0.75 pass threshold or rubric weights are empirically validated;
- English and zh-CN scores are psychometrically equivalent;
- TutorBench measures learner retention, transfer, or general teaching ability;
- Community Review, model submission, or leaderboard eligibility has changed.

The first real run remains a separate governance decision and must preserve the
same blind independent-review and provenance boundaries.
