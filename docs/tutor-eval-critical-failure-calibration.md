# TutorEval Human Critical-Failure Calibration Contract

This document defines the provider-independent calibration boundary for
critical failures. It extends the existing 0.2B rubric calibration workflow;
it does not change the TutorEval dataset, evaluator, Judge prompt, quality
gate, frozen corpus, or provider execution paths.

This is a calibration contract, not a claim that the committed synthetic
fixtures are human-reviewed or a validated gold standard.

## 1. Purpose

The contract lets independent reviewers judge whether a named critical-failure
type is present in a candidate response, measure reviewer agreement, record
disagreement without rewriting source annotations, and create a reference label
only after exact agreement or completed adjudication.

## 2. Why rubric calibration is insufficient

Rubric labels answer whether a response satisfies one observable criterion:

```text
rubric -> PASS | PARTIAL | FAIL | UNSURE
```

A critical-failure judgment answers a different question: whether a named
failure type is present, and if present how severe it is. A rubric `FAIL` is
not automatically a critical failure, and an answer-leakage judgment cannot be
recovered from an aggregate rubric score. The two contracts therefore remain
separate.

## 3. Three separate concepts

The boundaries are:

```text
rubric definition
  != human critical-failure annotation
  != LLM Judge output
```

Judge output is never human evidence. The provider-independent Judge view is
`CalibrationJudgeCriticalFailureLabel`; it can be compared with a completed
human reference set later, but it cannot create one.

## 4. Atomic annotation unit

The atomic unit is:

```text
dataset + case/version + candidate response + failureType
  -> PRESENT | ABSENT | UNSURE
```

`failureType` is part of the target identity even when the reviewer chooses
`ABSENT`. This makes absence a formal judgment rather than missing data.

One response can therefore have several independent targets, for example:

```text
response-001 + answer_leakage
response-001 + student_task_takeover
```

The registry is explicit and lives in the calibration layer. It does not add
calibration-only fields to all canonical case JSON and does not infer targets
from a rubric result.

## 5. PRESENT / ABSENT / UNSURE

The explicit target registry supplies the failure type for every review target.
`PRESENT` annotations repeat that target type and require `severity` (`minor`,
`major`, or `critical`). `ABSENT` and `UNSURE` annotations omit
`failureType` and carry no severity; they are judgments about the registry's
named target, not claims that a failure type is present. `UNSURE` is a
first-class state and is never silently converted to `ABSENT`.

Evidence is optional but, when supplied, must be short, observable, and based
on the candidate response. The contract has no confidence score and no field
for hidden chain-of-thought.

## 6. Failure type semantics

The contract reuses the seven existing `TutorCriticalFailure` enum members and
the definitions audited in
[`critical-failure-quality-gate-audit.md`](critical-failure-quality-gate-audit.md):

- `severe_factual_error`: materially false correctness-relevant content.
- `misconception_reinforcement`: confirms or strengthens a known misconception.
- `incorrect_diagnosis`: positively misidentifies an error or knowledge state;
  incomplete diagnosis alone is not automatically incorrect diagnosis.
- `answer_leakage`: exceeds the case's disclosure policy.
- `student_task_takeover`: performs substantive learner work assigned to the
  student and removes intended agency.
- `critical_misconception_ignored`: leaves a central supplied misconception
  unaddressed when correction is required.
- `instruction_violation`: materially violates an explicit instruction not
  better represented by a more specific type.

These definitions do not add a new taxonomy or a model-specific exception.

## 7. Severity semantics

Reviewer packets carry the audited severity guidance:

- `minor`: low-impact, recoverable, or diagnostic deviation that does not
  materially defeat the case objective.
- `major`: materially defeats the case objective, materially misleads the
  learner, or materially violates a disclosure or interaction boundary.
- `critical`: central or widespread, severely harmful, unusable, or fully
  substitutes for the learner task where the taxonomy defines that boundary.

Severity is calibrated for the response and case context, not assigned solely
because a failure type sounds serious. Agreement reports treat the scale as
ordinal: `minor < major < critical`.

## 8. Explicit review-target registry

`CalibrationCriticalFailureTargetFile` contains only:

```text
targetId + dataset/case/version + responseId + failureType
```

It is intentionally separate from the canonical dataset. A target is added
because the calibration plan explicitly says that type is applicable to that
candidate response. There is no `7 types x every response` expansion and no
magical semantic heuristic.

The target file is also the audit record for why a reviewer was asked to judge
one type. A future private run may generate a new ignored target file for its
candidate corpus without changing the public dataset version.

`targetId` is only the record identifier. The unique judgment atom is the
tuple `datasetId + datasetVersion + caseId + caseVersion + responseId +
failureType`; the parser and cross-file validator reject that tuple appearing
more than once. Different failure types for one response remain independent
targets, while changing the dataset version does not hide a cross-dataset
mismatch.

## 9. Blind review packet

`buildCalibrationCriticalFailurePacket()` emits a separate packet from the
existing rubric packet. Each entry contains:

- target/case/version/response identity;
- Tutor-visible case context;
- candidate response text;
- the named failure type;
- case objective, the audited type definition, and severity guidance;
- relevant disclosure policy, known misconception, or diagnosis context.

The packet is `blind: true`. It does not contain provider, model, prompt,
Judge output, Judge evidence, Judge confidence, source-run score, or another
reviewer's label. It is not a second Tutor input mapper: evaluator-only
context remains reviewer-only.

## 10. Independent reviewer lifecycle

The intended lifecycle is:

```text
candidate response
  -> explicit critical-failure targets
  -> blind packet
  -> independent reviewer annotation files
  -> presence/type/severity agreement
  -> adjudication for disagreement or UNSURE
  -> human critical-failure reference set
  -> optional future Judge comparison
```

Each reviewer file has one pseudonymous `reviewerId` and contains only that
reviewer's stream. A file cannot include another reviewer's labels, and the
original annotation records remain immutable.

## 11. Adjudication

Any of the following requires adjudication:

- presence disagreement;
- any `UNSURE` label;
- severity disagreement;
- an otherwise incomplete reviewer pair.

`CriticalFailureAdjudication` records the target, all source annotation IDs,
the adjudicator ID, rationale, and a final `PRESENT` or `ABSENT` decision. A
`PRESENT` result must also record the final type and severity. An adjudication
does not edit or replace source annotations, and majority vote is not an
implicit adjudication rule.

## 12. Human reference labels

`CalibrationCriticalFailureReferenceSet` is independent of
`CalibrationReferenceSet`. One label is generated only from:

1. exact reviewer agreement with no `UNSURE`; or
2. a completed adjudication whose source IDs cover the reviewer annotations.

An unresolved disagreement cannot become a reference label. `UNSURE` cannot
be a final reference state. The reference set records source annotation IDs,
reviewer count, agreement status, and optional adjudication ID.

## 13. Agreement metrics

The pure agreement functions provide:

- binary `PRESENT`/`ABSENT` confusion matrix;
- exact presence agreement including `UNSURE` pairs;
- scored presence agreement excluding pairs containing `UNSURE`;
- binary Cohen's kappa;
- disagreement identities with reviewer labels;
- type agreement by comparing the set of `PRESENT` failure types per response;
- severity exact agreement for paired `PRESENT` judgments;
- linear weighted Cohen's kappa for `minor < major < critical`;
- severity confusion matrix and severity disagreement identities.

Kappa is reported as evidence, not compared to an invented universal pass
threshold.

## 14. Answer-leakage example

The contract can represent a future result such as:

```text
target: response-001 + answer_leakage
reviewer-a: PRESENT / major
reviewer-b: PRESENT / major
Judge view: ABSENT
```

The completed human reference would remain `PRESENT / major`; the separate
Judge comparison would report a false negative. The current exploratory
observation about any real or frozen response is not committed as an
annotation, reference label, or fixture claim. In particular, no canonical
case is hardcoded as a human answer-leakage gold label by this contract.

## 15. Judge-vs-human future boundary

This change includes the provider-independent `CalibrationJudgeCriticalFailureLabel`
and a pure comparison function for paired labels. It reports presence exact
agreement, false positives, false negatives, precision, recall, F1, type-set
agreement, severity agreement, weighted severity agreement, and optional
breakdowns by failure type, severity, case, subject, and disclosure policy.

The function accepts an already-created Judge view. It does not execute a
Judge, import a provider SDK, inspect raw payloads, accept Judge confidence, or
turn Judge output into human evidence.

## 16. Synthetic fixture warning

The committed `critical-*.json` fixtures use synthetic candidate response text
and are marked:

```json
{
  "synthetic": true,
  "notHumanCalibrationData": true
}
```

They exercise parser, packet, agreement, adjudication, reference, and CLI
behavior only. They do not demonstrate expert review, human calibration, a
validated gold standard, Judge quality, or model quality.

## 17. Privacy and storage

Reviewer IDs and adjudicator IDs are pseudonymous values such as `reviewer-a`
and `expert-01`. Email addresses, names, accounts, contact information,
credentials, raw provider payloads, hidden reasoning, and production chats are
outside the contract.

Real candidate and reviewer files belong in ignored private storage. They must
not be committed to this repository. The checked-in fixtures are the only
critical-failure annotation files in the public tree.

## 18. Semantic replay and response identity

Calibration uses the target semantic identity (`tutor-eval-v0.2a@0.2a.1` and
the target case versions) for the review target. A frozen replay response keeps
its immutable source `responseId`, `sourceRun`, and `sourceCorpus`; an optional
`semanticReplay` field records the approved source-to-target relation.

The calibration contract does not re-sign a source response as target-native,
recollect Tutor output, or infer compatibility from semver. Existing candidate
files without `semanticReplay` remain readable.

### Preparing real candidate responses

The operator-only preparation command converts a frozen response corpus into
the existing candidate-response contract without calling a Tutor, Judge, or
provider:

```bash
npm run calibration:critical:prepare -- \
  --corpus path/to/frozen-corpus.json \
  --output artifacts/calibration/private/critical-candidate-responses.json
```

The default output is the ignored private path
`artifacts/calibration/private/critical-candidate-responses.json`; real
candidate response text must not be committed. A current `0.2a.1` corpus is
prepared without replay. A historical `0.2a` corpus fails closed unless the
operator explicitly adds `--allow-compatible-replay`; that flag uses only the
existing audited replay registry and validates the source corpus against the
source dataset first.

Preparation preserves the source `responseId`, `sourceRun`, `sourceCorpus`,
and any approved `semanticReplay`, while projecting the candidate to target
dataset/case versions. It does not generate a target registry, reviewer
annotations, adjudications, a blind packet, or Judge verdicts, and it never
infers targets from `criticalFailures`. The next step is an independently
audited private target registry followed by blind-packet generation and two
reviewer streams.

## 19. Versioning

The existing rubric constants remain unchanged:

```text
CALIBRATION_CONTRACT_SCHEMA_VERSION = 1
CALIBRATION_PACKET_SCHEMA_VERSION = 1
CALIBRATION_REFERENCE_SET_SCHEMA_VERSION = 1
CALIBRATION_REPORT_SCHEMA_VERSION = 1
```

The critical-failure extension has independent v1 constants for its schema,
packet, reference set, and report. Its calibration contract and Judge prompt
remain unchanged; current runs use dataset `0.2a.1` and evaluator `0.3a.4`.

## 20. Commands

The critical workflow is parallel to the existing rubric workflow:

```bash
npm run calibration:critical:export
npm run calibration:critical:prepare
npm run calibration:critical:validate
npm run calibration:critical:report
npm run calibration:critical:aggregate
```

Use `--candidate`, `--targets`, repeated `--reviewer`, `--adjudication`, and
`--output` for private paths. The default committed inputs are synthetic
fixtures and the outputs go to ignored `artifacts/`.

## 21. What this phase does not prove

This contract does not prove that any Judge is calibrated, that a taxonomy is
complete, that a kappa value meets a scientific threshold, that the dataset
measures learning outcomes, or that any model is safe or high quality. It also
does not run DeepSeek, OpenAI, OpenRouter, Nemotron, a live Tutor, a Judge
acceptance run, or corpus recollection.

The next scoped step is to supply real candidate responses and an explicitly
audited private target registry, generate the blind packet, and have two
independent reviewers annotate it. No real human annotation is created by
this PR.
