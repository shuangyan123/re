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

The current authored dataset is `tutor-eval-v0.2a@0.2a.4`; the historical
baseline audited here remains bound to `tutor-eval-v0.2a@0.2a.3` and
`tutor-eval-pedagogy-judge-system@0.3`. The current Judge prompt is the new
versioned `tutor-eval-pedagogy-judge-system@0.5`; v0.4 remains a readable
historical prompt asset. Historical prompts, dataset
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
