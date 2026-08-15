# TutorEval Disclosure and Critical-Failure Semantics Audit

## 1. Motivation

This audit resolves two contract ambiguities exposed by exploratory comparison
of two offline Judge interpretations over the same frozen Tutor corpus:

1. `no_answer` was described both as “do not require a final answer” and as a
   policy that prohibits the final answer, without defining what an answer is
   for concept or knowledge cases that have no `groundTruth.finalAnswer`.
2. `incorrect_diagnosis` was defined as identifying the wrong learner error or
   state, while `language-verb-check-001` attached that critical failure to a
   required diagnosis rubric whose observed failure could be incomplete or
   withheld diagnosis rather than a wrong diagnosis.

The observations that triggered this work are provisional reviewer evidence.
They are not independent human gold labels, are not used to tune a score, and
do not justify a live evaluation rerun. The audit makes the benchmark contract
explicit before any future critical-failure calibration is attempted.

## 2. Sources audited

The audit compared the following checked-in sources and implementation paths:

- `scenarios/tutor-eval-v0.2a/cases.json` — all 24 canonical cases, all five
  disclosure policies, all `critical: true` rubrics, and all
  `criticalFailure` mappings;
- `docs/tutor-eval-v0.2a.md`, `docs/tutor-eval-v0.2b.md`,
  `docs/tutor-eval-v0.3a.md`, and
  `docs/critical-failure-quality-gate-audit.md`;
- `prompts/tutor-eval-pedagogy-judge-system-v0.1.md` and the retained v0.2
  prompt artifact;
- `src/contracts/tutor-eval.ts`, `src/contracts/tutor-eval-validation.ts`,
  `src/contracts/tutor-eval-judge.ts`, and the calibration packet reviewer
  context in `src/calibration/packet.ts`;
- deterministic `direct_answer_leak` behavior in
  `src/evaluators/deterministic.ts` and rubric-owned routing in
  `src/runner/tutor-eval-runner.ts`;
- dataset integrity/coverage and the existing contract, evaluator, Judge,
  calibration, corpus, and provider tests;
- ignored local structured comparisons and the supplied observations from
  historical DeepSeek Judge runs. No provider was called and no provider
  output was added to this repository.

The canonical dataset contains 4 `no_answer`, 8 `hint_only`, 5
`partial_solution`, 4 `full_solution_allowed`, and 3
`full_solution_required` cases. The four `no_answer` cases are
`science-density-knowledge-001`, `language-word-context-001`,
`history-source-context-001`, and `programming-abstraction-transfer-001`;
none defines a concrete `groundTruth.finalAnswer`.

## 3. Authoritative disclosure-policy matrix

The machine-readable policy definitions are in
`src/contracts/tutor-eval-disclosure.ts`. The Judge-facing explanation is
versioned in `prompts/tutor-eval-pedagogy-judge-system-v0.3.md`.

| Policy | What the evaluator may require/reward | What the Tutor may explain | What the learner must still do | Leakage boundary |
| --- | --- | --- | --- | --- |
| `no_answer` | Do not require or reward a final or task-completing answer. | Concepts, definitions, distinctions, and “why” or process guidance required by the case. | The case-defined learner task, if one exists. | A concrete final answer or completion of an explicitly assigned operation can leak; a generic concept explanation is not automatically an answer. |
| `hint_only` | Require calibrated scaffolding, not completion of the material task. | A rule, distinction, local error location, or enough explanation for the next step, provided it does not resolve the task. | The material operation and arrival at the requested result. | A final answer, corrected final expression, or complete central derivation is `answer_leakage`; substantive assigned work without the final result is `student_task_takeover`. |
| `partial_solution` | Permit only the bounded worked step authorized by the case. | The bounded step and supporting explanation. | All remaining work and the final result. | Completing the remaining task or exceeding the bound is `answer_leakage`. |
| `full_solution_allowed` | A complete answer is allowed; it is not leakage. | The complete solution plus any rubric-required teaching. | No disclosure-based learner work is mandated. | A complete answer is not `answer_leakage`, though other rubric failures remain possible. |
| `full_solution_required` | A complete answer is allowed and required when a rubric asks for it. | The complete solution and any required explanation. | Only an explicitly required check or follow-up. | Withholding the required solution is an ordinary rubric failure, not an invented critical failure or leakage. |

### `no_answer`

`no_answer` is a non-answer-requiring policy, not a “do not explain” policy.
It is also not a rule that only compares text with
`groundTruth.finalAnswer`. When a concrete final answer or student-assigned
result exists, supplying it may still complete the task and be leakage. When
there is no concrete final-answer identity, the evaluator must use the case
objective, student message, and rubric task boundary rather than treating any
correct statement as an answer.

Therefore:

- explaining the source perspective/context in
  `history-source-context-001` is not leakage; it is the required concept
  rubric behavior;
- stating the mass/volume relationship in
  `science-density-knowledge-001` is not leakage; it is the required
  conceptual correctness behavior;
- explaining a word meaning or an abstraction principle is not leakage merely
  because it is correct;
- if a case explicitly asks the learner to choose a missing synonym or perform
  a concrete operation, supplying that result can be task completion even when
  `finalAnswer` is absent.

The core distinction from `hint_only` is that `no_answer` says the case must
not require or reward a final/task-completing answer, while `hint_only` says a
material learner task is intentionally present and must remain for the
learner. `no_answer` therefore cannot be used as an invitation for the Judge
to invent an answer boundary from lexical patterns.

### `hint_only`

Conceptual explanation is allowed when it supports the next step. The Tutor
may point out a local error or state a rule without applying it to finish the
student's instance. A corrected expression is leakage when it is the requested
result or performs the central operation the learner was asked to perform.

The Tutor has taken over the task when it performs substantive learner work
that the case intentionally assigns to the learner but does not disclose the
final answer. If it also supplies the final answer or complete solution, the
disclosure event is owned by `answer_leakage`; the same event is not counted a
second time as `student_task_takeover`.

The canonical paired cases make the boundary concrete: explicitly writing a
complete fraction calculation or directly providing repeated addition for the
student are clear positive leakage examples under `hint_only`. They are not
used as lexical templates for future cases.

### `partial_solution`

The case author must define the bounded step through the rubric and visible
task. The Tutor may perform that step, but must leave the remaining operation
and result to the learner. A “bounded step” is not an arbitrary amount of help
chosen by the Judge after seeing the response.

### `full_solution_allowed` and `full_solution_required`

Under `full_solution_allowed`, a complete answer does not create leakage, but
the Tutor can still fail a correctness, explanation, adaptation, or
actionability rubric. Under `full_solution_required`, withholding the requested
solution fails the relevant rubric. It does not create `answer_leakage`, and it
does not authorize the Judge to fabricate an unrelated critical-failure type.

## 4. `answer_leakage` definition

`answer_leakage` requires a policy violation supported by the case-aware
meaning of the response. A task-completing answer is content that supplies the
final result, complete solution, or central material operation the case
assigns to the learner, leaving no meaningful work for that learner. A
`groundTruth.finalAnswer`, when present, is strong evidence of a concrete final
answer identity; it is not the only possible form of task completion.

The following rules are authoritative:

- No pure lexical rule is sufficient. Mentioning an answer-shaped token,
  definition, or formula is not by itself leakage.
- With no `finalAnswer`, use only an explicit result/operation in the case
  objective, student task, or rubric to identify task completion.
- A concept explanation, definition, distinction, or “why” explanation can be
  required under `no_answer` and is not automatically leakage.
- A specific missing synonym is leakage when the learner was asked to find or
  select it; it is not automatically leakage when it is a supporting example
  in a meaning-explanation rubric.
- A rule stated without applying it to the learner's instance is generally
  guidance. Applying the rule to complete the central instance can be leakage
  under `hint_only` or beyond a `partial_solution` bound.
- A full answer under `full_solution_allowed` or `full_solution_required` is
  not leakage.

The deterministic evaluator remains a bounded proxy for cases with an explicit
`forbiddenFinalAnswer`. It does not claim to solve the semantic boundary for
Judge-owned rubrics.

## 5. `incorrect_diagnosis` distinction

The taxonomy keeps `incorrect_diagnosis` narrow:

| Situation | Meaning | Critical failure? |
| --- | --- | --- |
| Wrong diagnosis | The Tutor positively identifies the learner's error, reasoning, or state as a different one. | Yes, when the evidence supports the mapped severity. |
| Incomplete diagnosis | The Tutor gestures toward the relevant area but does not explicitly locate or fully explain the required error. | No automatic `incorrect_diagnosis`; the diagnosis rubric can be `PARTIAL` or `FAIL`. |
| No diagnosis | The Tutor avoids, withholds, or delegates the diagnosis. | No automatic `incorrect_diagnosis`; use another explicitly supported type only if its definition independently fits. |

For `language-verb-check-001`, the Judge observations describe the Tutor as
not explicitly locating the subject/verb mismatch, without diagnosing a
different error. That is incomplete or withheld diagnosis, not a wrong
diagnosis. The rubric remains required and can fail normally. Its
`incorrect_diagnosis:major` mapping is removed; no new enum member is added.

## 6. Canonical critical-rubric mapping audit

Before the change, the canonical 0.2A dataset had four
`criticalFailure` mappings. The post-change dataset intentionally retains
three. The `critical: true` flag is rubric importance metadata; it is not by
itself a quality-gate failure mapping.

| Case | Rubric | Criterion | Failure type | Severity | Semantic fit | Decision and rationale |
| --- | --- | --- | --- | --- | --- | --- |
| `fraction-misconception-001` | `fraction-no-leak-001` | Do not reveal the final answer when only a hint is requested. | `answer_leakage` | `major` | Fit | Retain. This is a deterministic `hint_only` final-answer proxy with an explicit forbidden answer. |
| `hint-only-linear-equation-001` | `equation-hint-no-leak-001` | Give a first-step hint without stating `x=4`. | `answer_leakage` | `major` | Fit | Retain. The rubric explicitly prohibits the concrete requested result under `hint_only`. |
| `correct-answer-wrong-reasoning-001` | `wrong-reasoning-diagnosis-001` | Name that the answer is correct but the stated reasoning does not represent multiplication. | `critical_misconception_ignored` | `major` | Fit with the criterion boundary | Retain. Failure of this central correction leaves the supplied misconception unaddressed; it is not a generic diagnosis penalty. |
| `language-verb-check-001` | `language-verb-diagnosis-001` | Locate the agreement mismatch between the subject and verb. | `incorrect_diagnosis` | `major` | Does not fit incomplete/no diagnosis | Remove. A failed location criterion does not establish that the Tutor identified the wrong error or learner state. Bump the case and dataset versions. |

The remaining canonical Judge-owned `critical: true` rubrics are evaluated
against their own criteria but have no automatic critical-failure mapping. No
other canonical `criticalFailure` combination was found to be semantically
invalid. The enum, quality-gate threshold, score formula, and failure
deduplication behavior are unchanged.

For completeness, the four canonical `critical: true` rubrics were:

| Case | Rubric | Evaluation path | Critical mapping after this audit | Decision |
| --- | --- | --- | --- | --- |
| `fraction-misconception-001` | `fraction-guidance-001` | Judge | none | Retain the rubric importance flag; a guidance failure is not automatically a critical failure. |
| `hint-only-linear-equation-001` | `equation-hint-no-leak-001` | deterministic | `answer_leakage/major` | Retain; the mapping is audited above. |
| `correct-answer-wrong-reasoning-001` | `wrong-reasoning-diagnosis-001` | Judge | `critical_misconception_ignored/major` | Retain; the mapping is audited above. |
| `language-verb-check-001` | `language-verb-diagnosis-001` | Judge | none | Retain the rubric importance flag but remove the invalid automatic `incorrect_diagnosis` mapping. |

## 7. Versioning decision

This is not documentation-only clarification. A structured Judge result that
previously carried `incorrect_diagnosis:major` for a failed language diagnosis
rubric must no longer be interpreted as that critical failure merely because
the rubric was incomplete. The version identities are therefore:

| Identity | Before | After | Reason |
| --- | --- | --- | --- |
| Dataset ID | `tutor-eval-v0.2a` | unchanged | The curated dataset family remains 0.2A. |
| Dataset version | `0.2a` | `0.2a.1` | A canonical critical-failure mapping changed. The loader accepts the patch form and still identifies the same dataset family. |
| `language-verb-check-001` case version | `1.0.0` | `1.0.1` | Its critical-failure semantic mapping changed. Rubric ID and criterion text remain stable. |
| Evaluator version | `0.3a.2` | `0.3a.3` | Same structured evidence can now produce a different critical-failure/pass interpretation. Scoring math and quality-gate threshold did not change. |
| Judge prompt | `0.2` | `0.3` | The prompt now states the policy matrix, task-completion boundary, and wrong/incomplete/no-diagnosis distinction. v0.2 remains retained for historical artifacts. |
| Judge result schema | `1` | unchanged | No result field or enum was added. |
| Calibration contract | unchanged | unchanged | 0.2B still annotates only `PASS`/`PARTIAL`/`FAIL`/`UNSURE` at rubric level. |

## 8. Compatibility impact

The public provider-independent contracts remain structurally compatible. The
new policy definitions are additive, the five `DisclosurePolicy` values are
unchanged, and no critical-failure enum was added or renamed. The deterministic
answer proxy still allows complete answers only for the two full-solution
policies and remains a bounded proxy for explicit configured answers.

Consumers that compare dataset, case, evaluator, or prompt identity must treat
the new identities as a new semantic run. A historical response/result file is
not silently relabeled. A corpus with the old dataset version must not be
validated as if it were a corpus for `0.2a.1` without an explicit migration or
replay decision.

## 9. Historical Judge-run interpretation

The earlier DeepSeek and Nemotron artifacts remain historical evidence under
their recorded dataset, case, evaluator, and prompt identities. They are:

- not human gold evidence;
- not retroactively rewritten by this PR;
- useful as exploratory disagreement and ambiguity evidence;
- not directly comparable with new results under evaluator `0.3a.3` and prompt
  `0.3` as though the semantics were identical.

The supplied observations that `history-source-context-001` could be judged
as leakage in one run and not in another, that
`programming-abstraction-transfer-001` varied on leakage while ordinary
rubrics were stable, and that `language-verb-check-001` produced a major
`incorrect_diagnosis` despite no wrong diagnosis are specification-discovery
signals. They do not become labels or score adjustments in this PR.

## 10. No live evaluation

This audit uses checked-in contracts, canonical cases, documentation, tests,
and existing ignored historical metadata only. It performs no DeepSeek,
OpenAI, OpenRouter, or Nemotron call; no corpus response is regenerated; no
24th response is added; and no provider output artifact is committed.

## 11. Calibration boundary and next step

Critical-failure semantics must be coherent before human critical-failure
calibration is added. This PR deliberately does not modify
`src/contracts/calibration.ts` and does not add human fields for
`criticalFailure.type`, severity, or critical-failure evidence.

The next independent PR may propose a separate, versioned annotation contract
for those fields, with explicit reviewer guidance and adjudication semantics.
That work must preserve the current rubric-level `UNSURE` behavior and must not
convert the exploratory Judge observations in this audit into human gold.

## 12. Residual ambiguity

Natural-language task completion cannot be reduced to a global substring rule.
Future cases that use `no_answer` without a concrete final answer should make
the learner-assigned operation or result explicit in their objective/rubrics.
Future Judge calibration should measure disagreements on those authored
boundaries rather than infer a universal answer definition from model output.
