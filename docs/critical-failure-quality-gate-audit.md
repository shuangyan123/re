# Critical-failure quality-gate audit

This audit defines the default TutorEval quality gate independently of any
single Tutor, model, or frozen response corpus. It covers the seven failure
types declared by the provider-independent `TutorCriticalFailure` contract.
The rule is implemented only through
`DEFAULT_TUTOR_EVAL_SCORING_CONFIG.qualityGate`; the runner does not contain a
failure-type special case.

## Policy decision

The default configuration is:

```text
failureTypes = every declared TutorCriticalFailure type
minimumSeverity = major
```

The ordinary rubric score and the critical-failure gate are independent. A
valid case with `overallScore = 1.0` can therefore have `qualityGate = FAIL`
and `passed = false`. If no rubric or Judge evaluation error exists, that case
has `status = "failed"`; a gated critical failure is not an evaluator
`"error"`. The run-level `criticalFailureRate` and `answerLeakageRate` retain
their existing definitions and are not gate rates.

`minor` is intentionally diagnostic-only by default. `major` and `critical`
mean that the failure is material enough that a high score cannot make the
case successful. This is a severity policy, not a score or threshold tuning.

## Taxonomy audit

“Current producer” distinguishes the producer boundary supported by the
contract from whether the canonical 0.2A dataset currently exercises it.
Deterministic failures come from a failed deterministic rubric carrying a
`criticalFailure`; Judge failures come from a validated Judge result. Judge
factual errors are normalized to `severe_factual_error` by the runner.

| Type | Semantic definition and applicable context | Current producer | Minor meaning | Major meaning | Critical meaning | Default gate and rationale |
| --- | --- | --- | --- | --- | --- | --- |
| `severe_factual_error` | A materially false claim, answer, or explanation in a correctness-relevant case. Applies regardless of disclosure policy. | Deterministic rubric or Judge; canonical Judge factual errors are normalized here. | Local imprecision that does not change the taught conclusion. | Materially false content that can mislead the learner about the case objective. | Central/widespread false content or a response that makes the case unsafe or unusable. | `major+` gates. Factual truth is a safety/pedagogy boundary independent of the rubric average. |
| `misconception_reinforcement` | The Tutor confirms, strengthens, or teaches the learner’s known misconception. Applies when the case supplies a relevant misconception. | Deterministic rubric or Judge; no canonical 0.2A producer currently exercises this type. | Weak or peripheral reinforcement with a recoverable main response. | The response validates a relevant misconception in the teaching path. | The response builds the explanation around the misconception or makes correction materially harder. | `major+` gates. Reinforcing an identified misconception is a direct failure of the tutoring objective. |
| `incorrect_diagnosis` | The Tutor misidentifies the learner’s error, reasoning, or knowledge state in a diagnosis task. | Judge; canonical 0.2A language-diagnosis rubric is Judge-owned. | A minor localization or wording error while the central diagnosis remains correct. | The central error or reasoning state is diagnosed incorrectly. | The diagnosis reverses the learner’s state and drives materially harmful guidance. | `major+` gates. Wrong diagnosis can invalidate otherwise strong guidance. |
| `answer_leakage` | The Tutor discloses an answer or solution beyond the case’s `disclosurePolicy`. It is context-sensitive: `no_answer` and `hint_only` prohibit the final answer; `partial_solution` permits only a bounded step; full-solution policies do not make a complete answer leakage. | Deterministic `direct_answer_leak` rubric and Judge; canonical 0.2A has deterministic hint-only cases. | Slight extra disclosure that does not complete or materially take over the requested task. | Explicitly gives the requested answer/solution under a no-answer or hint-only contract, or exceeds a bounded partial-solution contract. | Directly completes the task or gives the central derivation in a policy that requires learner work. | `major+` gates. An explicit disclosure-policy violation cannot coexist with a successful case merely because rubric scores are high. There is no global rule against complete answers in allowed policies. |
| `student_task_takeover` | The Tutor performs substantive learner work that the case intentionally assigns to the student, especially guided problem-solving or hint/agency tasks. | Judge contract; no canonical 0.2A producer currently exercises this type. | Extra help that leaves the learner a meaningful, reversible next action. | The Tutor completes the material task instead of preserving required student agency. | The Tutor fully substitutes for the learner across the central task and removes the intended learning opportunity. | `major+` gates. Taking over the task defeats an explicit agency objective even if the answer is correct. |
| `critical_misconception_ignored` | The Tutor fails to address a central known misconception when the case explicitly requires diagnosis or correction. | Deterministic legacy rubric and Judge; canonical 0.2A wrong-reasoning case is Judge-owned. | A peripheral misconception is not fully addressed while the central correction remains intact. | The central supplied misconception is left unaddressed in a task that requires correcting it. | The response gives a correct surface answer while preserving the central misconception or makes it materially harder to correct. | `major+` gates. Ignoring the case’s central misconception is a critical pedagogy failure, not merely a lower diagnosis score. |
| `instruction_violation` | The Tutor violates an explicit case instruction that is not better represented by a more specific failure type. | Judge contract; no canonical 0.2A producer currently exercises this type. | A low-impact instruction deviation that does not defeat the case objective. | The response materially violates an explicit instruction or required interaction contract. | The response disregards the central instruction and makes the intended evaluation task invalid. | `major+` gates. Explicit case constraints are part of the evaluation contract; severity prevents minor deviations from being overtreated. |

The taxonomy does not add or rename any enum member. Where the current
dataset has no producer for a type, the type remains audited and gated for
future validated producers; it is not fabricated into current results.
The taxonomy does not yet encode mutual exclusion between overlapping labels.
Producers should emit the most specific applicable type: `instruction_violation`
is not a second label for a more specific disclosure or task-takeover failure.
This is a documented calibration limitation, not a silent enum redefinition.

## Status, metrics, and compatibility

The runner preserves the existing ownership boundary:

```text
evaluation error -> status: error, score: null
valid evaluation + score threshold + quality gate -> passed/failed
```

The quality gate does not zero `overallScore`, alter category scores, change
the case pass threshold, or redefine either rate metric. A leakage case still
contributes to `answerLeakageRate` whether or not it gates the case.

This policy changes pass/fail semantics for the same evidence, so new runs use
evaluator version `0.3a.2` instead of `0.3a.1`. Dataset ID/version, case
versions, rubric text, Judge prompt/schema/provider, Tutor output, and
deterministic verifier behavior are unchanged. Existing v1 result artifacts
remain readable because `evaluatorVersion` is optional and no result-schema
field was removed.

## Offline regression evidence

The local ignored artifact
`artifacts/real-model/preliminary-openrouter-nemotron-baseline-001.deepseek-v4-pinned.json`
was inspected without provider calls, response regeneration, or corpus
mutation. It contains 23 selected cases and evaluator version `0.3a.1` with
the previously recorded `14 passed / 7 failed / 2 errors`,
`criticalFailureRate = 21.74%`, and `answerLeakageRate = 21.74%`.

Pure policy replay over the stored structured failure labels found five
`answer_leakage/major` cases. The old gate configured none of those cases to
fail; the audited gate would mark all five as gate failures. Holding all other
evidence constant, three previously passed cases would become failed and the
run would read `11 passed / 10 failed / 2 errors`. This is regression-impact
evidence only, not the basis for the policy, and no raw response text is
committed or persisted by this change.

The replay does not re-run the Judge, alter timeout behavior, fill the missing
24th response, or claim human calibration. Judge failure classification still
needs independent human calibration, and the four currently unexercised types
need representative reviewed cases before their producer behavior can be
empirically assessed.
