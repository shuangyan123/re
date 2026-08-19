# Preliminary manual leakage audit

This is a preliminary manual audit of the 12 cases that the real-model Judge
marked positive for `answer_leakage/major` in the 48-case baseline. The
machine-readable record is
[`tutor-eval-manual-leakage-positive-set-audit-v0.1.json`](audits/tutor-eval-manual-leakage-positive-set-audit-v0.1.json).

The audit result is:

```text
Judge-positive cases audited: 12
Human-confirmed positives: 9
Human-disagreed candidates: 3
Positive-set agreement / precision: 75%
```

The three false-positive candidates are:

- `science-graph-error-001`: locating an amount-versus-rate axis mismatch and
  asking the learner to reread the axis is local diagnosis and verification
  guidance, not a completed graph interpretation.
- `language-word-context-001`: distinguishing `reluctant` from `unsure` and
  explaining the context clue is a permitted conceptual correction under
  `no_answer`.
- `language-word-context-001-zh-CN`: the same semantic boundary in the
  Chinese authored counterpart.

This audit covers Judge-positive cases only. Judge-negative cases were not
human-audited, so recall and total leakage prevalence are unknown. The safe
cohort statements are `Judge observed leakage: 12/48` and `human-confirmed
leakage: at least 9/48`; `9/48` must not be reported as the true leakage rate.
This is not complete human calibration, psychometric validation, evidence of
English/Chinese equivalence, or leaderboard eligibility.

## Version boundary

The current authored dataset is `tutor-eval-v0.2a@0.2a.5`; the historical
baseline audited here remains bound to `tutor-eval-v0.2a@0.2a.3` and
`tutor-eval-pedagogy-judge-system@0.3`. The current Judge prompt is the new
versioned `tutor-eval-pedagogy-judge-system@0.8`; v0.3 through v0.7 remain
readable historical prompt assets. Historical prompts, dataset
snapshots, response IDs, evaluation artifacts, and baseline results are not
rewritten, and no live Tutor or Judge call is made by the regression tests.

## Real Judge v0.4 follow-up validation

The committed follow-up evidence is
[`tutor-eval-judge-v0.4-positive-set-validation-v0.1.json`](audits/tutor-eval-judge-v0.4-positive-set-validation-v0.1.json).
It is operator-attested evidence of a real DeepSeek V4-Pro rerun against the
same frozen MiniMax Tutor corpus and the historical `tutor-eval-v0.2a@0.2a.3`
snapshot. This follow-up was not independently replayed in this repository.
It is a machine-readable, provider-free record of derived case-level classifications;
it does not contain Tutor text, Judge evidence, raw provider payloads,
`reasoning_content`, hidden reasoning, credentials, request IDs, or private
translation sidecars.

The v0.4 result agrees with the current human audit labels on all 12 cases in
this previously Judge-positive, human-audited subset. The historical v0.3
positive set contained 9 human-confirmed positives and 3 false positives; v0.4
retained all 9 positives and corrected all 3 false positives. The two
`language-word-context` cases still have overall `failed` status for other case
criteria, but their v0.4 leakage classification is `false`; overall case
status must not be treated as the leakage label.

`programming-loop-diagnosis-001` first produced an invalid Judge result
(`judge_result_invalid`). Strict `--resume-evaluation` reused 8 valid
case-runs, made 1 Judge call for the invalid case, and produced a final valid
classification. This is execution recovery evidence, not a semantic
disagreement.

The safe statistical statement is observed agreement `12/12` within this
audited historical positive subset, with 3/3 previously identified false
positives corrected and 9/9 human-confirmed positives retained. Historical
Judge-negative cases remain unaudited, so recall, false-negative rate, and
full-corpus prevalence are unknown. This follow-up is preliminary and
uncalibrated; it is not Judge accuracy, calibration, full-corpus accuracy, or
evidence that all 48 cases have been audited.

## Judge v0.5 semantic hardening

The continuation evidence reports a completed preliminary/manual leakage audit
of all 48 cases in the frozen `tutor-eval-v0.2a@0.2a.3` corpus. The reported
labels are `TP=9`, `FP=3`, `FN=1`, and `TN=35`, with manual-labelled leakage
`10/48`. These are preliminary manual labels, not calibrated gold labels.

The only reported historical v0.3 false negative is the English
`programming-abstraction-transfer-001` case. Its `no_answer` policy leaves the
learner to identify the changing input before extracting a function, but the
frozen Tutor response directly provides the complete `run_task` implementation
and calls. A real DeepSeek V4-Pro rerun with Judge prompt v0.4 reportedly
recognized the function-extraction takeover in the actionability evidence, but
returned `answerLeakage: false` and no critical failure. The supplied evidence
is operator-attested and is not independently replayed here.

This exposed a v0.4 regression blind spot. The v0.4 prompt already described
direct function extraction as a disclosure failure, but it also said to
evaluate only the atomic rubrics supplied in the request. The real historical
case supplies only adaptation and actionability rubrics; it has no dedicated
disclosure-boundary rubric. The existing provider-free function-abstraction
regression added such a synthetic disclosure rubric, so it did not reproduce
the real case shape.

v0.5 therefore separates the two Judge layers: `rubricResults` must contain
exactly the supplied atomic rubrics, while `criticalFailures` must always run a
case-aware policy pass. A complete task-completing implementation that exceeds
`no_answer` can emit `answer_leakage` without a dedicated disclosure rubric.
The three-part conservative boundary remains unchanged: the response must
provide a final answer, complete solution, or task-completing central
operation; exceed the case policy; and provide more than an answer-shaped
mention. Conceptual definitions, bounded advice, and local diagnosis that
leave the learner's central operation unfinished remain non-leakage.

The provider-free v0.5 regression loads the immutable 0.2a.3 case snapshot and
checks the two real adaptation/actionability rubrics, the complete extracted
function response, and the independent `answer_leakage:major` critical
failure. It also covers allowed density definition, abstraction advice without
implementation, local graph diagnosis, and the existing word-context and
science-graph false-positive controls. No real provider call, frozen response
rewrite, corpus identity change, or historical v0.4 artifact rewrite is part
of this change. v0.5 is not calibrated, and this work does not establish
full-corpus v0.5 validation, 100% accuracy or recall, or a zero false-negative
rate.

## Real Judge v0.5 boundary validation

The continuation also recorded a real DeepSeek V4-Pro Judge v0.5 run over a
purposive 13-case boundary-validation subset of the frozen MiniMax corpus
`tutor-eval-v0.2a@0.2a.3`. The local operator-attested evaluation artifact is
`artifacts/real-model/preliminary-minimax-m27-deepseek-v4pro-boundary13-v05.evaluation.json`;
it is ignored local evidence, not a checked-in benchmark result. The reported
boundary result was:

```text
Agreement: 11/13
Execution errors: 0
Human-confirmed leakage cases detected: 10/10 in this selected set
```

The historical v0.3 false negative
`programming-abstraction-transfer-001` was corrected by v0.5: the complete
function extraction was recognized as `answer_leakage:major`. Two
human-confirmed non-leakage cases were over-triggered by v0.5:
`language-word-context-001` and `science-graph-error-001`. In the first, the
Tutor corrected the already proposed `reluctant`/`unsure` distinction and
explained the `pauses before agreeing` clue. In the second, it located the
amount-versus-rate axis mismatch, explained the immediate consequence, and
left the learner to reconsider the peak. Those operations are Tutor-owned
teaching behavior under their historical case designs.

This 13-case set was selected to probe known leakage boundaries; it is not a
representative accuracy sample. `11/13` must not be reported as a general v0.5
Judge accuracy metric, and the selected-set detection result must not be
reported as general v0.5 recall. The artifact is operator-attested and was not
independently replayed in this repository. It does not establish v0.5
calibration or leaderboard eligibility.

## Real Judge v0.6 boundary validation

A subsequent real DeepSeek V4-Pro Judge v0.6 run used the same purposive
13-case boundary set from the frozen MiniMax Tutor corpus
`tutor-eval-v0.2a@0.2a.3`. The operator-attested result was:

```text
Agreement: 12/13
Execution errors: 0
```

Both v0.5 false positives were corrected in this run:
`language-word-context-001` and `science-graph-error-001` were classified as
non-leakage. The historical programming abstraction false negative remained
corrected: `programming-abstraction-transfer-001` was classified as
`answer_leakage:major`.

The only remaining disagreement was `programming-loop-diagnosis-001`, which
the human label marks as leakage present and `answer_leakage:major`. The Judge
itself marked the historical prohibited rubric
`programming-loop-no-solution-001` as `FAIL`, with the evidence:

> “Provides complete while-loop code, including condition and increment, before the student has inspected the state change.”

Despite recognizing that prohibited complete-loop rewrite, the v0.6 result
emitted `criticalFailures = []` and `answerLeakage = false`. This revealed an
internal inconsistency between rubric-level failure evidence and the
operation-ownership subtraction pass. The run is operator-attested evidence
from a purposive boundary set, not independently replayed repository evidence.
`12/13` must not be reported as general v0.6 Judge accuracy or recall, and the
run does not establish v0.6 calibration or leaderboard eligibility.

## Judge v0.6 ownership hardening

The historical v0.6 prompt is
`tutor-eval-pedagogy-judge-system@0.6`. It retains v0.5's independent
policy-level critical-failure pass and exact atomic-rubric ownership, while
requiring an operation-ownership pass before `answer_leakage`: identify the
case-defined learner-reserved material operation, identify Tutor-owned
teaching operations, subtract the latter, and emit leakage only when the
remaining content completes the distinct learner operation and still meets
the three-part boundary. A required diagnosis, conceptual correction, or
local guidance rubric is not blanket immunity, but satisfying that required
teaching operation is not itself learner-task takeover.

The provider-free v0.6 regressions use the immutable historical `.2a.3` case
shapes and the full disputed word-context and graph Tutor responses. They
expect no leakage for both Tutor-owned teaching examples and retain
`answer_leakage:major` for the historical complete function extraction with
only adaptation/actionability Judge rubrics. No historical dataset change,
frozen response rewrite, or v0.5 prompt-asset rewrite is part of those
regressions. The real v0.6 boundary result above is not a complete semantic
validation: v0.6 is not calibrated, and the loop disagreement remains the
reason for the v0.7 fix.

## Judge v0.7 prohibited-rubric consistency hardening

The current prompt is
`tutor-eval-pedagogy-judge-system@0.7`. It preserves v0.6's operation-ownership
boundary and adds a narrowly scoped consistency check after atomic rubric
evaluation and ownership analysis. A failed `behavior: prohibited` rubric is
not automatically a critical failure. The Judge must inspect the prohibited
criterion and its own observable `FAIL` evidence; only when the criterion
protects learner-reserved complete work and the evidence states that the Tutor
performed that complete operation does the prompt prevent that operation from
being subtracted as Tutor-owned explanation. The conservative three-part
answer-leakage boundary still applies.

For `programming-loop-diagnosis-001`, diagnosis, variable-mismatch
explanation, state tracing, and a partial diagnostic fragment remain allowed.
A complete runnable repaired loop before the learner performs the requested
trace is instead learner-reserved task completion and is expected to produce
`answer_leakage:major` when the historical prohibited rubric is `FAIL`.

The provider-free v0.7 regression loads the immutable `.2a.3` case, verifies
the exact three-rubric historical shape, asserts that
`programming-loop-no-solution-001` is prohibited and has no static
`criticalFailure` mapping, passes the full disputed Tutor response, and
preserves the independent policy-level `answer_leakage:major` result. The
existing full word-context and graph negative controls, function-extraction
positive control, and other disclosure controls remain unchanged. Provider-free
tests cannot prove real DeepSeek semantics; the supplied real v0.7 probe is
operator-attested diagnostic evidence and is not calibrated.

## Judge v0.8 composite-rubric grading clarification

The real DeepSeek V4-Pro three-call probe supplied for the v0.7 prompt exposed
a separate calibration boundary in the composite correctness criterion for
`language-word-context-001@1.1.1`. Its developer-authored expectations and
operator-attested observations were:

| Fixture | Expected correctness | Observed correctness | Expected actionability | Observed actionability |
| --- | --- | --- | --- | --- |
| A | `PASS` | `PASS` | `PASS` | `PASS` |
| B | `PARTIAL` | `PASS` | `PASS` | `PASS` |
| C | `FAIL` | `PARTIAL` | `PASS` | `PASS` |

There was no answer leakage, critical failure, insufficient-information flag,
or execution error in the three calls. The v0.7 Judge evidence itself
recognized the relevant semantic distinctions: B corrected `unsure` toward
unwilling/hesitant and used the pause clue but omitted the limitation; C
recognized the omitted limitation and the `definitely` overclaim but returned
only `PARTIAL`.

This is a three-case purposive diagnostic with developer-authored expectations,
not human calibration gold. It is not general Judge accuracy, calibration,
recall, or evidence of model-wide bias. It supports a generic composite-rubric
grading clarification because one criterion revealed both a material omission
and an explicit contradiction of a material limitation. It does not establish
that the Judge is calibrated.

Prompt v0.8 now requires the Judge to identify each criterion's substantive
material requirements before assigning a status. `PASS` requires all material
requirements to be substantially satisfied with no explicit conflict;
`PARTIAL` covers a basically correct response that omits, ambiguously executes,
or incompletely satisfies at least one material requirement; and `FAIL` covers
an explicit violation, reversal, denial, or material conflict, with an explicit
overclaim against a required limitation treated as stronger than a simple
omission. The instruction is semantic, not a mechanical comma-splitting rule.
Ordinary rubric `FAIL` remains separate from the policy-level critical-failure
pass, so this clarification does not turn a composite-rubric failure into a
critical failure automatically.

The immutable v0.7 prompt asset and all earlier prompt assets remain readable.
The provider-free regressions retain the historical leakage/critical-failure
controls and add a generic composite criterion whose synthetic `PASS`,
`PARTIAL`, and `FAIL` results are validated and propagated through rubric
ownership, the runner, and the existing scorer. No live provider call is made
by those tests.
