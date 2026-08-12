# TutorEval 0.2A — Rubric and Dataset Design

TutorEval 0.2A is the curated, synthetic dataset foundation built on the
v0.1 execution contract. It measures observed tutoring behavior. It does not
prove that a real student learned, retained, transferred, or can solve a new
problem independently.

The canonical dataset is `tutor-eval-v0.2a` and lives in
`scenarios/tutor-eval-v0.2a/cases.json`. The seven v0.1 cases remain available
through the legacy `tutor-eval-v0.1` loader for compatibility.

## Taxonomy

The five scoring categories remain stable:

- `correctness`
- `diagnosis`
- `guidance`
- `adaptation`
- `actionability`

Cases also carry versioned dataset metadata:

- `subject`: `mathematics`, `science`, `language`,
  `history_or_social_studies`, or `programming`;
- `learningTask`: concept explanation, error diagnosis, guided problem
  solving, hint request, answer checking, reasoning checking, knowledge
  recall, or transfer preparation;
- `studentState`: novice, partial understanding, procedural error, conceptual
  misconception, correct answer with wrong reasoning, overconfident incorrect,
  uncertain but correct, or stuck without an attempt;
- `capabilityTags`: the machine-readable capability being observed.

Capability tags are not independent scores by themselves. A case rubric maps
each criterion to one primary capability, and a case must not repeat the same
category/capability pair. This keeps one observed failure from becoming many
weighted penalties.

Communication, tone, friendliness, verbosity, and Markdown presentation are
not top-level scores. If understandable language matters for a case, put that
observable requirement in one atomic rubric.

## Difficulty

The structured `metadata.difficulty` object separates three dimensions:

```json
{
  "learnerLevel": "middle-school",
  "taskDifficulty": 2,
  "pedagogicalDifficulty": 4
}
```

`learnerLevel` describes the assumed learner level. `taskDifficulty` describes
the knowledge or problem itself: 1 is straightforward and 5 is advanced or
ambiguous. `pedagogicalDifficulty` describes the teaching trade-off: 1 is a
direct correction and 5 involves an ambiguous state or competing pedagogical
priorities. These values must not be collapsed into one grade label.

Legacy v0.1 string and numeric difficulty values remain readable. New 0.2A
cases use the structured object and are checked by the dataset integrity guard.

## Rubric authoring guide

Each rubric criterion should judge one observable teaching behavior.

Good:

```text
Identify that the student added unlike denominators directly.
```

Bad:

```text
Diagnose the misconception, explain it clearly, give a useful hint,
and encourage the student.
```

The second example bundles several behaviors and cannot be scored reliably as
one PASS/PARTIAL/FAIL result. Use `behavior` to state the role of the
criterion:

- `required`: the task must include this behavior;
- `desirable`: a useful positive behavior that is not a hard requirement;
- `prohibited`: behavior that violates the case instruction.

Use `capabilityTag` for the one primary capability observed by the criterion.
`rubric score = observed capability`. A `criticalFailure` is a separate risk
or quality-gate signal; it is not another copy of the same score.

For example, answer disclosure in a `hint_only` case can be one prohibited
Guidance rubric with an `answer_leakage` critical-failure flag. Do not also
deduct the same event as separate `student_agency`, `hint_calibration`, and
`overhelping` scores unless the case contains independent observable evidence.

## Disclosure policies

Every policy has representative coverage:

- `no_answer`: do not require a final answer;
- `hint_only`: preserve the student's opportunity to finish and prohibit
  answer leakage;
- `partial_solution`: allow a bounded worked step;
- `full_solution_allowed`: a requested complete answer is not leakage;
- `full_solution_required`: withholding the requested complete solution can
  fail the teaching task.

There is no global rule that less disclosure is always better. Disclosure is
judged against the case policy.

## Counterfactual pairs

`adaptationPairId` groups two cases with the same underlying problem and
different learner states. `adaptationVariant` names the state-specific
variant, and variants must be unique within a pair. The canonical dataset
contains:

- `fraction-counterfactual-001`: a local procedural denominator error versus
  a conceptual gap about fraction units;
- `multiplication-counterfactual-001`: incorrect repeated-addition notation
  versus no equal-groups concept.

The pair is an authoring boundary in 0.2A. A pairwise adaptation metric is
reserved for a later phase.

## Ground truth and evaluator boundary

Ground truth describes factual truth, accepted answers, essential concepts,
and known misconceptions. It is not a single required teaching script.
Different Tutors may use an analogy, question, hint, or explanation sequence
and still satisfy the same rubric.

`evaluatorOnly` remains outside `TutorUnderTest` input. The runtime conversion
only sends the visible learning objective, profile, conversation, student
message, and problem context. The canonical loader rechecks taxonomy, rubric
integrity, adaptation pairs, and the hidden-annotation boundary.

Deterministic evaluators remain proxies. They can check answer leakage,
configured concepts, accepted answers, response shape, or emptiness; they do
not establish that a natural-language explanation is pedagogically complete.
The canonical dataset marks criteria that need semantic judgment with
`evaluationType: "judge"`. 0.2A does not call a real LLM Judge.

## Adding a case

1. Start with one teaching objective and one learner state.
2. Select the existing five-category score boundary and the smallest relevant
   capability set.
3. Use structured difficulty and one primary capability per rubric.
4. Keep ground truth and rubrics under `evaluatorOnly`; keep only student-visible
   context in `tutorInput`.
5. State required, desirable, and prohibited behavior separately. Add a
   critical-failure flag only when it gates a distinct risk.
6. Add a deterministic evaluator only when it is a valid proxy; otherwise mark
   the rubric `judge` for the future Judge boundary.
7. Run the loader, integrity tests, coverage report, and the standard quality
   gates. Do not create numeric variants that merely rename the same case.

## Coverage

The coverage report is a pure, deterministic JSON function and CLI:

```bash
npm run coverage
```

It reports case counts by subject, learning task, student state, category,
capability tag, disclosure policy, learner level, task difficulty, and
pedagogical difficulty, plus counterfactual-pair count, critical-rubric count,
and future-Judge rubric count. It intentionally remains a small testable
report, not a dashboard.

Independent rubric review and calibration are not complete in 0.2A. No
`expert reviewed`, `validated`, or `calibrated` status is claimed without
actual independent reviewers.
